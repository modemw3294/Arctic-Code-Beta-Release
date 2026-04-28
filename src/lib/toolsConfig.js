// Tools configuration — persisted to `arctic-toolsConfig`. Covers:
//   - Web search provider selection + API keys
//   - web_search summarization mode (raw SERP vs. small-model digest)
//   - Subagent model (used by fast_context and web_search digest)
//
// Read/write helpers are centralized here so both the Settings UI and the
// tool runners operate on the same shape.

const STORAGE_KEY = 'arctic-toolsConfig';

export const DEFAULT_TOOLS_CONFIG = {
  search: {
    // Which provider web_search hits. 'jina' is keyless so it's the
    // default-friendly choice for first-run users.
    provider: 'jina',        // 'tavily' | 'brave' | 'jina'
    tavilyApiKey: '',
    braveApiKey: '',
    jinaApiKey: '',          // optional; raises rate limit when set
    maxResults: 5,
    // 'digest' runs results through the subagent for a summary; 'raw'
    // returns the SERP JSON straight to the main model.
    mode: 'digest',          // 'digest' | 'raw'
  },
  fetchUrl: {
    // Jina Reader is the only managed provider right now (CORS-friendly,
    // keyless). When running inside Electron, the renderer's cascade
    // prefers native IPC (no CORS) → direct DOM fetch → Jina Reader.
    provider: 'jina',
    jinaApiKey: '',
    // Return format sent to the model:
    //   'markdown' (default) — HTML parsed and converted to clean Markdown
    //   'html'              — raw HTML body (no parsing, keeps tags)
    //   'text'              — textContent-only strip, no Markdown structure
    format: 'markdown',
  },
  subagent: {
    // The default small model for fast_context + web_search digest.
    // Gemma 4 31B IT / Minimal is fast, cheap, supports function calling.
    model: 'gemma-4-31b-it',
    // Per-subagent overrides ('' = fall back to .model).
    overrides: {
      fast_context: '',
      web_search: '',
    },
  },
  // Model Context Protocol — connect to external MCP servers (HTTP/SSE
  // transport in this build) to expose third-party tools to the agent.
  // Each server entry: { id, name, url, headers, enabled }.
  //   • `name` is the display label AND the prefix used when routing
  //     tool calls (mcp__<name>__<tool>), so it must be unique and
  //     match /^[a-zA-Z0-9_-]+$/.
  //   • `headers` is a flat string→string map (e.g. for bearer auth).
  // Disabled servers are kept in config but skipped at connect time.
  mcp: {
    servers: [],
  },
  // Python code execution — venv-based sandboxed runner.
  // venvDir: where the persistent venv lives (default: ~/arctic-python-venv).
  // pythonBin: system python to use when creating the venv (default: python3).
  // timeout: default execution timeout in seconds (default: 60, max: 300).
  pythonExec: {
    venvDir: '',       // empty = auto ($HOME/arctic-python-venv)
    pythonBin: 'python3',
    timeout: 60,
    enabled: true,
  },

  // Chat behavior — controls send shortcuts, agent loop budget, custom
  // system prompt, and various input/attachment quality-of-life toggles.
  chat: {
    // 'enter' = Enter to send, Shift+Enter for newline (default).
    // 'cmd-enter' = Cmd/Ctrl+Enter to send, Enter for newline.
    sendShortcut: 'enter',
    // Max iterations for the agent tool-call loop. Higher = the agent can
    // chain more tools per user turn at the cost of latency + tokens.
    // Range: 1-20. Default: 8.
    maxAgentIterations: 8,
    // Clear attachments + references after sending (default: true).
    clearAttachmentsAfterSend: true,
    // Show a confirmation dialog before stopping generation.
    confirmBeforeStop: false,
    // Custom system prompt prepended to every conversation. Empty = use
    // the built-in default. Useful for persona / language preferences.
    customSystemPrompt: '',
    // Auto-scroll chat to bottom while assistant streams.
    autoScrollOnStream: true,
    // Show timestamp under each message bubble.
    showTimestamps: false,
  },

  // "压箱底" feature — see lib/contextCompressor.js. All four layers are
  // ON by default; users can selectively disable from Settings → 上下文
  // 压缩. The whole stack is a per-request transform that doesn't touch
  // the UI-facing message history.
  contextCompression: {
    enabled: true,
    evictThinking: true,
    evictToolResults: true,
    evictionMinChars: 800,
    slidingWindow: 4,           // last K user-rounds kept verbatim
    summaryMode: 'truncate',    // 'truncate' | 'subagent' (future)
    enableCaching: true,
    // When true, every assistant message renders a small footer showing
    // estimated IN tokens (raw), IN tokens (after compression), and
    // OUT tokens. Useful for verifying the compression is paying off.
    showTokenStats: false,
  },
};

function deepMerge(base, overrides) {
  if (!overrides || typeof overrides !== 'object') return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(overrides)) {
    const a = out[key];
    const b = overrides[key];
    if (b && typeof b === 'object' && !Array.isArray(b) && a && typeof a === 'object' && !Array.isArray(a)) {
      out[key] = deepMerge(a, b);
    } else {
      out[key] = b;
    }
  }
  return out;
}

export function readToolsConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return deepMerge(DEFAULT_TOOLS_CONFIG, raw);
  } catch {
    return deepMerge(DEFAULT_TOOLS_CONFIG, {});
  }
}

export function writeToolsConfig(partial) {
  const current = readToolsConfig();
  const merged = deepMerge(current, partial);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    /* quota full — silently skip */
  }
  return merged;
}

// Resolve which model a given subagent should use (falling back to the
// shared default when no override is set).
export function getSubagentModel(subagentName) {
  const cfg = readToolsConfig().subagent;
  return cfg.overrides?.[subagentName] || cfg.model;
}
