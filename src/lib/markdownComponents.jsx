// Shared `components` map for every <ReactMarkdown> in the app.
// Currently customizes fenced code blocks: rehype-highlight tags the
// inner <code> with a `language-xxx` class, and we wrap the surrounding
// <pre> in a header strip showing the language icon + label on the left
// and Copy / Reference buttons on the right.
//
// Why a custom <pre> wrapper instead of just CSS?
//   - We need access to the raw code text for the Copy button.

import React from "react";

// Tiny per-language colour dot. Highlight.js doesn't expose a list, so
// we cover the common cases by hand and fall back to a neutral grey.
// (Pure visual sugar — when in doubt, the dot is invisible against the
// header bg, which is fine.)
const LANG_COLOURS = {
  javascript: "#F7DF1E",
  js: "#F7DF1E",
  jsx: "#F7DF1E",
  typescript: "#3178C6",
  ts: "#3178C6",
  tsx: "#3178C6",
  python: "#3776AB",
  py: "#3776AB",
  bash: "#4EAA25",
  sh: "#4EAA25",
  shell: "#4EAA25",
  zsh: "#4EAA25",
  json: "#999999",
  yaml: "#CB171E",
  yml: "#CB171E",
  toml: "#9C4221",
  html: "#E34F26",
  css: "#1572B6",
  scss: "#CC6699",
  rust: "#CE412B",
  rs: "#CE412B",
  go: "#00ADD8",
  java: "#B07219",
  kotlin: "#7F52FF",
  swift: "#F05138",
  c: "#555555",
  cpp: "#00599C",
  "c++": "#00599C",
  csharp: "#178600",
  "c#": "#178600",
  ruby: "#701516",
  rb: "#701516",
  php: "#777BB4",
  sql: "#E48E00",
  markdown: "#083FA1",
  md: "#083FA1",
  diff: "#888888",
  dockerfile: "#384D54",
  docker: "#384D54",
  text: "#999999",
  plaintext: "#999999",
};

function langColour(lang) {
  if (!lang) return "#9CA3AF";
  return LANG_COLOURS[lang.toLowerCase()] || "#9CA3AF";
}

// "javascript" → "JavaScript", "tsx" → "TSX", etc. Keeps the header
// label readable without having to maintain a giant alias table.
function prettyLang(lang) {
  if (!lang) return "TEXT";
  const upper = new Set(["js", "ts", "jsx", "tsx", "css", "html", "sql", "yaml", "yml", "toml", "md", "rs", "rb", "go", "php", "c", "cpp", "csharp"]);
  if (upper.has(lang.toLowerCase())) return lang.toUpperCase();
  return lang.charAt(0).toUpperCase() + lang.slice(1);
}

// Recursively pull plain text out of a React node tree. Needed because
// rehype-highlight injects nested <span class="hljs-…"> elements into
// the <code>, so children is no longer a simple string.
function nodeToText(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (typeof node === "object" && node.props) {
    return nodeToText(node.props.children);
  }
  return "";
}

// Extract the language tag from a `language-xxx` className. Returns
// the empty string when no tag is present (inline code, plain fence).
function extractLang(className) {
  if (typeof className !== "string") return "";
  const m = className.match(/language-([\w+#-]+)/i);
  return m ? m[1] : "";
}

const IconCopy = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// `<pre><code class="language-xxx">…</code></pre>` is the shape
// rehype-highlight produces. We replace the <pre> only when its single
// child is such a <code>; everything else (raw <pre> blocks from custom
// HTML, etc.) falls through to the default renderer.
function CodeBlockPre({ children, ...rest }) {
  const child = React.Children.toArray(children)[0];
  const isCode =
    React.isValidElement(child) && child.type === "code";
  if (!isCode) {
    return <pre {...rest}>{children}</pre>;
  }
  const codeClass = child.props.className || "";
  const lang = extractLang(codeClass);
  const code = nodeToText(child.props.children).replace(/\n$/, "");

  return <CodeBlock lang={lang} code={code} codeChild={child} preProps={rest} />;
}

function CodeBlock({ lang, code, codeChild, preProps }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — silently ignore */
    }
  };
  const colour = langColour(lang);
  const label = prettyLang(lang);

  return (
    <div className="md-code-block">
      <div className="md-code-header">
        <div className="md-code-lang">
          <span
            className="md-code-lang-dot"
            style={{ background: colour }}
            aria-hidden="true"
          />
          <span className="md-code-lang-label">{label}</span>
        </div>
        <div className="md-code-actions">
          <button
            type="button"
            className="md-code-action"
            title={copied ? "已复制" : "复制"}
            onClick={handleCopy}
          >
            {copied ? <IconCheck /> : <IconCopy />}
            <span>{copied ? "已复制" : "复制"}</span>
          </button>
        </div>
      </div>
      <pre {...preProps} className={`md-code-pre ${preProps.className || ""}`.trim()}>
        {codeChild}
      </pre>
    </div>
  );
}

export const MARKDOWN_COMPONENTS = {
  pre: CodeBlockPre,
};
