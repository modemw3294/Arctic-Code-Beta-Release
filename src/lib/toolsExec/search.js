// Web search adapters.
//
// Three providers, all reachable from the browser:
//   - Tavily: AI-agent-focused, returns short summaries per hit, needs key
//   - Brave Search: clean SERP, needs key (X-Subscription-Token header)
//   - Jina s.jina.ai: no key required, simple HTML-stripped Markdown blocks
//
// Every adapter returns the same unified shape so runSearch() can be a
// simple dispatcher and the web_search tool runner doesn't care which
// provider produced the data.
//
// Unified result:
//   {
//     ok: true,
//     provider: 'tavily' | 'brave' | 'jina',
//     query,
//     results: [
//       { title, url, snippet, published? }
//     ],
//     answer?: string            // provider-level AI answer, when available
//   }

// Sanitize a single result object: coerce to strings + trim + fall back
// to empty string. Keeps the LLM from receiving `undefined` fields.
function sanitizeResult(r) {
  return {
    title: String(r.title || '').trim(),
    url: String(r.url || '').trim(),
    snippet: String(r.snippet || r.description || '').trim(),
    published: r.published ? String(r.published) : undefined,
  };
}

// ---------- Tavily ---------------------------------------------------------

export async function tavilySearch({ query, apiKey, maxResults = 5, signal } = {}) {
  if (!apiKey) return { ok: false, error: 'Tavily API Key not configured. Set it in Settings → Tools.' };
  let response;
  try {
    response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: 'basic',
        include_answer: true,
      }),
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return { ok: false, error: `network error: ${err?.message || err}` };
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return { ok: false, error: `Tavily HTTP ${response.status}: ${body.substring(0, 200)}` };
  }
  const data = await response.json();
  const results = Array.isArray(data.results)
    ? data.results.map((r) => sanitizeResult({
        title: r.title,
        url: r.url,
        snippet: r.content,
        published: r.published_date,
      }))
    : [];
  return {
    ok: true,
    provider: 'tavily',
    query,
    results,
    answer: data.answer || undefined,
  };
}

// ---------- Brave Search ---------------------------------------------------

export async function braveSearch({ query, apiKey, maxResults = 5, signal } = {}) {
  if (!apiKey) return { ok: false, error: 'Brave API Key not configured. Set it in Settings → Tools.' };
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(maxResults));
  let response;
  try {
    response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
      },
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return { ok: false, error: `network error: ${err?.message || err}` };
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return { ok: false, error: `Brave HTTP ${response.status}: ${body.substring(0, 200)}` };
  }
  const data = await response.json();
  const rawResults = data?.web?.results || [];
  const results = rawResults.slice(0, maxResults).map((r) => sanitizeResult({
    title: r.title,
    url: r.url,
    snippet: r.description,
    published: r.age,
  }));
  return {
    ok: true,
    provider: 'brave',
    query,
    results,
  };
}

// ---------- Jina Search ----------------------------------------------------

export async function jinaSearch({ query, apiKey, maxResults = 5, signal } = {}) {
  // Jina returns markdown-formatted SERP; we fetch and parse it into
  // individual result blocks. API key is optional (higher rate limit).
  const endpoint = `https://s.jina.ai/${encodeURIComponent(query)}`;
  const headers = {
    'Accept': 'application/json',
    'X-Return-Format': 'json',
  };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  let response;
  try {
    response = await fetch(endpoint, { method: 'GET', headers, signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return { ok: false, error: `network error: ${err?.message || err}` };
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return { ok: false, error: `Jina HTTP ${response.status}: ${body.substring(0, 200)}` };
  }

  // Try JSON first; fall back to Markdown parsing if server insists.
  let data;
  try { data = await response.json(); } catch { data = null; }

  let results = [];
  if (data && Array.isArray(data.data)) {
    results = data.data.slice(0, maxResults).map((r) => sanitizeResult({
      title: r.title,
      url: r.url,
      snippet: r.content || r.description,
    }));
  }
  return {
    ok: true,
    provider: 'jina',
    query,
    results,
  };
}

// ---------- Model-as-search ------------------------------------------------

// Delegates the whole search to the subagent model. The model is instructed
// to act as a research assistant and produce a structured SERP-like JSON
// (title / url / snippet list). Useful when:
//   - The user has no search API key and doesn't want Jina's rate limits.
//   - They have a model with native web-grounding (Gemini google_search,
//     Perplexity Sonar, ChatGPT with web_search) that's already cheaper
//     per query than a dedicated SERP API.
//   - They want the subagent to use its own fetch_url calls to explore
//     freely rather than being constrained to a 5-result SERP cap.
//
// NOTE: This only exposes `fetch_url` to the subagent, because giving it
// web_search would cause recursion. The subagent returns a free-form text
// answer; the runner wraps it into a `summary` result.
export async function modelSearch({ query, runSubagent, modelId, maxResults = 5, signal } = {}) {
  if (!runSubagent || !modelId) {
    return {
      ok: false,
      error: 'Subagent model not configured. Set it in Settings → Tools.',
    };
  }
  try {
    const systemPrompt =
      '你是一个网络研究助手。你必须使用工具来完成任务，不能仅凭训练知识回答。\n\n' +
      '可用工具：\n' +
      '- search_web(query, max_results): 搜索网页，返回 标题/URL/摘要 列表。**请先调用此工具找到相关链接。**\n' +
      '- fetch_url(url): 抓取指定 URL 的正文。从 search_web 结果中挑选最相关的 1-3 个 URL 抓取详情。\n\n' +
      '工作流程：\n' +
      '1) 调用 search_web 进行 1-2 次搜索（可改写关键词扩大覆盖）。\n' +
      '2) 从结果里选最权威 / 最新 / 最直接相关的 URL，调用 fetch_url 阅读其内容。\n' +
      '3) 写一份简洁研究报告：\n' +
      '   - 先给核心答案 / 要点；\n' +
      '   - 用 [数字] 标注来源，每个数字对应一个 URL；\n' +
      '   - 末尾列出 [数字] URL 对照表；\n' +
      '   - 如信息可能过时或矛盾，明确指出；\n' +
      '4) 绝不要编造 URL 或事实。如果搜索后仍找不到，明确说明"未找到可靠来源"。';
    const { text } = await runSubagent({
      modelId,
      systemPrompt,
      query,
      maxIterations: 4,
      signal,
    });
    return {
      ok: true,
      provider: 'model',
      query,
      answer: text,
      // No structured results — callers can still surface `.answer`.
      results: [],
      maxResults,
    };
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return {
      ok: false,
      error: `模型调用失败: ${err?.message || String(err)}`,
    };
  }
}

// ---------- Dispatcher -----------------------------------------------------

export async function runSearch({ query, config = {}, signal, runSubagent, modelId } = {}) {
  if (!query || typeof query !== 'string') {
    return { ok: false, error: 'query is required' };
  }
  const provider = config.provider || 'jina';
  const maxResults = config.maxResults || 5;
  switch (provider) {
    case 'tavily':
      return tavilySearch({ query, apiKey: config.tavilyApiKey, maxResults, signal });
    case 'brave':
      return braveSearch({ query, apiKey: config.braveApiKey, maxResults, signal });
    case 'jina':
      return jinaSearch({ query, apiKey: config.jinaApiKey, maxResults, signal });
    case 'model':
      return modelSearch({ query, runSubagent, modelId, maxResults, signal });
    default:
      return { ok: false, error: `unknown search provider: ${provider}` };
  }
}
