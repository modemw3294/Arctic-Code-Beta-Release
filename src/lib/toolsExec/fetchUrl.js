// Webpage fetcher with a three-tier fallback chain:
//
//   1. Electron IPC (window.arcticAPI.fetchUrl)
//      → Node `net.request` in the main process. Bypasses CORS entirely.
//      → This is the DEFAULT path when running as a packaged desktop app.
//      → DOM-parsed into Markdown via `htmlToMarkdown`.
//
//   2. Direct browser fetch + DOM parsing
//      → `fetch(url)` from the renderer, then DOMParser + htmlToMarkdown.
//      → Only succeeds for CORS-enabled sites (rare in practice, but free).
//
//   3. Jina Reader (https://r.jina.ai)
//      → External proxy that returns pre-rendered Markdown.
//      → Final fallback for sites that block both above paths.
//
// All three return the same shape:
//   { ok, url, title, content, truncated, source }
// where `source` is 'electron' | 'dom' | 'jina' so the model can report
// what path was used.

import { htmlToMarkdown } from './htmlToMarkdown';

// Character budget returned to the model. Content beyond this is truncated.
// Keeps a single fetch from blowing out the agent's context budget.
const MAX_CONTENT_CHARS = 12000;

function truncate(content) {
  if (content.length <= MAX_CONTENT_CHARS) return { content, truncated: false };
  return {
    content: content.slice(0, MAX_CONTENT_CHARS) + '\n\n... [truncated]',
    truncated: true,
  };
}

function normalizeUrl(url) {
  try {
    return new URL(url).toString();
  } catch {
    return null;
  }
}

// Convert raw HTML to the format the caller requested. Returns a full
// result object (content + metadata) instead of the usual markdown path,
// so 'html' / 'text' can preserve what's unique about each.
function renderHtml(rawBody, { format, baseUrl, finalUrl, source }) {
  if (!rawBody) {
    return { ok: true, url: finalUrl, title: '', content: '', truncated: false, source };
  }
  if (format === 'html') {
    // User explicitly wants raw HTML — skip parsing. Still cap size.
    const { content, truncated } = truncate(rawBody);
    return {
      ok: true,
      url: finalUrl,
      title: '',
      content,
      truncated,
      source,
      format: 'html',
    };
  }
  if (format === 'text') {
    // Plain-text strip: use DOMParser to extract `textContent` from main
    // content, dropping all markup. Cheaper than Markdown conversion.
    try {
      const doc = new DOMParser().parseFromString(rawBody, 'text/html');
      // Strip script / style first so their textContent doesn't leak.
      for (const el of doc.querySelectorAll('script,style,noscript,template')) el.remove();
      const text = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
      const title = (doc.querySelector('title')?.textContent || '').trim();
      const { content, truncated } = truncate(text);
      return { ok: true, url: finalUrl, title, content, truncated, source, format: 'text' };
    } catch {
      // Parsing failed — fall through to Markdown path.
    }
  }
  // Default + fallback: clean Markdown.
  const parsed = htmlToMarkdown(rawBody, { baseUrl });
  const { content, truncated } = truncate(parsed.markdown);
  return {
    ok: true,
    url: parsed.url || finalUrl,
    title: parsed.title || '',
    content,
    truncated,
    source,
    format: 'markdown',
  };
}

// Tier 1: Electron IPC native fetch. Uses the main process's `net` module
// which has no browser security sandbox — no CORS, no mixed-content rule.
async function fetchViaElectron(url, format) {
  if (typeof window === 'undefined' || !window.arcticAPI?.fetchUrl) {
    return { ok: false, error: 'electron ipc unavailable' };
  }
  const res = await window.arcticAPI.fetchUrl({ url });
  if (!res?.ok) return { ok: false, error: res?.error || `HTTP ${res?.status}` };

  const contentType = res.contentType || '';
  // Non-HTML (e.g. plain text / JSON / markdown) — return verbatim.
  if (!contentType.includes('html')) {
    const { content, truncated } = truncate(res.body || '');
    return {
      ok: true,
      url: res.finalUrl || url,
      title: '',
      content,
      truncated,
      source: 'electron',
      format: 'raw',
    };
  }
  return renderHtml(res.body || '', {
    format,
    baseUrl: url,
    finalUrl: res.finalUrl || url,
    source: 'electron',
  });
}

// Tier 2: direct renderer fetch. Only works when the target sets
// Access-Control-Allow-Origin — which many news / docs sites don't. We
// still try because when it works, it's free and private.
async function fetchViaDom(url, format, signal) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'text/html,application/xhtml+xml,*/*;q=0.9' },
      signal,
      redirect: 'follow',
    });
    if (!response.ok) {
      return { ok: false, error: `DOM fetch HTTP ${response.status}` };
    }
    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();
    if (!contentType.includes('html')) {
      const { content, truncated } = truncate(body);
      return {
        ok: true,
        url,
        title: '',
        content,
        truncated,
        source: 'dom',
        format: 'raw',
      };
    }
    return renderHtml(body, {
      format,
      baseUrl: url,
      finalUrl: url,
      source: 'dom',
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return { ok: false, error: `DOM fetch blocked: ${err?.message || err}` };
  }
}

// Tier 3: Jina Reader proxy. Last resort for CORS-restricted sites.
// Honors the caller's `format`: Jina supports 'markdown' and 'html' via
// its X-Return-Format header. 'text' falls back to Markdown (Jina's
// 'text' returns the same body with less structure; not worth the
// extra branch here).
async function fetchViaJina(url, { apiKey, format, signal } = {}) {
  const endpoint = `https://r.jina.ai/${url}`;
  const wantHtml = format === 'html';
  const jinaFormat = wantHtml ? 'html' : 'markdown';
  const headers = {
    Accept: wantHtml ? 'text/html' : 'text/markdown',
    'X-Return-Format': jinaFormat,
    'X-With-Generated-Alt': 'true',
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let response;
  try {
    response = await fetch(endpoint, { method: 'GET', headers, signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return { ok: false, error: `jina network error: ${err?.message || err}` };
  }
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    return {
      ok: false,
      error: `Jina Reader HTTP ${response.status}: ${errText.substring(0, 200)}`,
    };
  }

  const text = await response.text();
  // Jina Reader response preamble:
  //   Title: ...
  //   URL Source: ...
  //   Markdown Content:
  //   <body>
  let title = '';
  let sourceUrl = url;
  let body = text;
  const tm = text.match(/^Title:\s*(.+)$/m);
  if (tm) title = tm[1].trim();
  const um = text.match(/^URL Source:\s*(.+)$/m);
  if (um) sourceUrl = um[1].trim();
  const markerIdx = text.indexOf('Markdown Content:');
  if (markerIdx >= 0) body = text.slice(markerIdx + 'Markdown Content:'.length).trimStart();

  const { content, truncated } = truncate(body);
  return {
    ok: true,
    url: sourceUrl,
    title,
    content,
    truncated,
    source: 'jina',
    format: jinaFormat,
  };
}

// Public entry point. Tries Electron → DOM → Jina in order, skipping
// tiers that are unavailable or fail, and returns the first success.
// `format` is one of 'markdown' | 'html' | 'text' (default 'markdown').
export async function fetchUrlCascade({ url, apiKey, format = 'markdown', signal } = {}) {
  if (!url || typeof url !== 'string') {
    return { ok: false, error: 'url is required' };
  }
  const normalized = normalizeUrl(url);
  if (!normalized) return { ok: false, error: `invalid url: ${url}` };

  const attempts = [];

  // Tier 1: Electron (no-op in browser dev mode)
  if (typeof window !== 'undefined' && window.arcticAPI?.fetchUrl) {
    const r = await fetchViaElectron(normalized, format);
    if (r.ok) return r;
    attempts.push(`electron: ${r.error}`);
  }

  // Tier 2: DOM fetch
  const domRes = await fetchViaDom(normalized, format, signal);
  if (domRes.ok) return domRes;
  attempts.push(`dom: ${domRes.error}`);

  // Tier 3: Jina Reader (last resort). Note: 'text' format falls back to
  // Jina's markdown output; we do no additional post-processing here.
  const jinaRes = await fetchViaJina(normalized, { apiKey, format, signal });
  if (jinaRes.ok) return jinaRes;
  attempts.push(`jina: ${jinaRes.error}`);

  return {
    ok: false,
    error: `All fetch methods failed: ${attempts.join(' | ')}`,
  };
}

// Backwards-compat alias: old call sites imported `fetchUrlViaJina`.
// Re-export the cascade runner under that name so the runner keeps working.
export const fetchUrlViaJina = fetchUrlCascade;
