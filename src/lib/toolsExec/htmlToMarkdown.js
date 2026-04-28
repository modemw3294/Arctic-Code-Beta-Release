// Minimal DOM-based HTML-to-Markdown converter.
//
// Pared down to what a browsing agent actually needs — headings, paragraphs,
// lists, links, code blocks, blockquotes, tables. Scripts, styles, nav bars,
// forms, iframes, and ads are stripped before conversion so the output is a
// clean, compact Markdown summary of the page's main content.
//
// Not a full-featured converter (like Turndown) — we deliberately keep it
// dependency-free and small. If the output ever needs image support or
// more exotic inline semantics, consider pulling in Turndown instead.

const STRIP_TAGS = new Set([
  'script', 'style', 'noscript', 'template',
  'nav', 'aside', 'footer', 'header', 'form', 'iframe', 'svg',
  'canvas', 'video', 'audio', 'picture',
  'button', 'input', 'select', 'textarea', 'label',
]);

const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'main',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'blockquote', 'pre', 'table', 'tr', 'thead', 'tbody', 'hr', 'br',
]);

// Try to locate the "main article" element on a page, mirroring Mozilla
// Readability's coarse heuristic: prefer <article>, <main>, or the DOM
// node with the most textual content.
function findMainContent(doc) {
  const explicit = doc.querySelector('article, main, [role="main"]');
  if (explicit) return explicit;

  // Fallback: score each candidate by text length and pick the winner.
  const candidates = doc.querySelectorAll(
    'article, main, [role="main"], section, div'
  );
  let bestNode = doc.body;
  let bestScore = bestNode?.textContent?.length || 0;
  for (const node of candidates) {
    const txt = node.textContent || '';
    // Penalize nodes with lots of links (nav menus tend to be link-heavy).
    const links = node.querySelectorAll('a').length;
    const score = txt.length - links * 80;
    if (score > bestScore) {
      bestScore = score;
      bestNode = node;
    }
  }
  return bestNode;
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// Walk the DOM tree producing Markdown chunks. `depth` tracks list nesting.
function nodeToMarkdown(node, depth = 0) {
  if (!node) return '';
  if (node.nodeType === 3) {
    // Text node. Collapse whitespace but preserve intentional punctuation.
    const t = node.nodeValue || '';
    return t.replace(/[ \t\r\n]+/g, ' ');
  }
  if (node.nodeType !== 1) return '';

  const tag = node.tagName.toLowerCase();
  if (STRIP_TAGS.has(tag)) return '';

  const children = Array.from(node.childNodes)
    .map((c) => nodeToMarkdown(c, depth))
    .join('');

  switch (tag) {
    case 'h1': return `\n\n# ${normalizeWhitespace(children)}\n\n`;
    case 'h2': return `\n\n## ${normalizeWhitespace(children)}\n\n`;
    case 'h3': return `\n\n### ${normalizeWhitespace(children)}\n\n`;
    case 'h4': return `\n\n#### ${normalizeWhitespace(children)}\n\n`;
    case 'h5': return `\n\n##### ${normalizeWhitespace(children)}\n\n`;
    case 'h6': return `\n\n###### ${normalizeWhitespace(children)}\n\n`;
    case 'p': {
      const t = normalizeWhitespace(children);
      return t ? `\n\n${t}\n\n` : '';
    }
    case 'br': return '  \n';
    case 'hr': return '\n\n---\n\n';
    case 'strong':
    case 'b': return `**${children.trim()}**`;
    case 'em':
    case 'i': return `*${children.trim()}*`;
    case 'code': {
      // Inline <code> inside <pre> is handled by the <pre> branch.
      if (node.parentElement?.tagName?.toLowerCase() === 'pre') return children;
      return `\`${children.replace(/`/g, '\\`')}\``;
    }
    case 'pre': {
      // Detect language from class like "language-js" or "lang-python".
      const codeChild = node.querySelector('code');
      const cls = codeChild?.className || node.className || '';
      const m = cls.match(/(?:language|lang)-([\w-]+)/);
      const lang = m ? m[1] : '';
      const raw = (codeChild?.textContent || node.textContent || '').replace(/\n+$/, '');
      return `\n\n\`\`\`${lang}\n${raw}\n\`\`\`\n\n`;
    }
    case 'blockquote': {
      const inner = children.trim();
      if (!inner) return '';
      return '\n\n' + inner.split('\n').map((l) => `> ${l}`).join('\n') + '\n\n';
    }
    case 'a': {
      const href = node.getAttribute('href') || '';
      const t = normalizeWhitespace(children);
      if (!t) return '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return t;
      return `[${t}](${href})`;
    }
    case 'img': {
      const alt = node.getAttribute('alt') || '';
      const src = node.getAttribute('src') || '';
      if (!src || src.startsWith('data:')) return alt ? `[image: ${alt}]` : '';
      return `![${alt}](${src})`;
    }
    case 'ul':
    case 'ol': {
      const items = Array.from(node.children).filter((c) => c.tagName?.toLowerCase() === 'li');
      const indent = '  '.repeat(depth);
      const lines = items.map((li, i) => {
        const marker = tag === 'ol' ? `${i + 1}.` : '-';
        const inner = nodeToMarkdown(li, depth + 1).trim().replace(/\n+/g, ' ');
        return `${indent}${marker} ${inner}`;
      });
      return `\n${lines.join('\n')}\n`;
    }
    case 'li': return children;
    case 'table': {
      const rows = Array.from(node.querySelectorAll('tr'));
      if (rows.length === 0) return '';
      const cells = rows.map((r) =>
        Array.from(r.children).map((c) =>
          normalizeWhitespace(c.textContent || '').replace(/\|/g, '\\|')
        )
      );
      const colCount = Math.max(...cells.map((r) => r.length));
      const header = cells[0] || [];
      const padded = [
        '| ' + (header.concat(Array(colCount - header.length).fill(''))).join(' | ') + ' |',
        '| ' + Array(colCount).fill('---').join(' | ') + ' |',
        ...cells.slice(1).map((r) =>
          '| ' + (r.concat(Array(colCount - r.length).fill(''))).join(' | ') + ' |'
        ),
      ];
      return '\n\n' + padded.join('\n') + '\n\n';
    }
    default:
      if (BLOCK_TAGS.has(tag)) return `\n${children}\n`;
      return children;
  }
}

// Squash runs of blank lines and trailing whitespace so the model sees a
// compact document.
function collapseBlankLines(md) {
  return md
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Public: convert a raw HTML string to Markdown, extracting the main
// article content. Runs entirely in the renderer via DOMParser — no
// network involved.
export function htmlToMarkdown(html, { baseUrl } = {}) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Pull out title + canonical URL before pruning.
  const title = (doc.querySelector('title')?.textContent || '').trim();
  const canonical =
    doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ||
    doc.querySelector('meta[property="og:url"]')?.getAttribute('content') ||
    baseUrl || '';

  // Pre-prune: remove obvious non-content nodes in one pass so the scoring
  // heuristic below isn't polluted.
  for (const tag of STRIP_TAGS) {
    for (const el of doc.querySelectorAll(tag)) el.remove();
  }

  const root = findMainContent(doc);
  const md = collapseBlankLines(nodeToMarkdown(root));
  return {
    title,
    url: canonical,
    markdown: md,
  };
}
