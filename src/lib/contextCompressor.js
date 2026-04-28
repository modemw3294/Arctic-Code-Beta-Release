// Context Compressor — "压箱底" feature.
//
// The chat agent accumulates a full message history (user / assistant /
// tool messages) and naively sends ALL of it back to the model on every
// API call. For long sessions with web_search + fetch_url + read_reference
// the prompt grows to tens of thousands of tokens of mostly-redundant
// content. This module is a pure transform applied right before the
// fetch: it returns a compressed copy of `apiMessages` while leaving the
// original (UI-facing) array untouched.
//
// Four orthogonal layers, all independently togglable:
//
//   1. Thinking elision
//      Strips reasoning_content / thinking / <thought> blocks from any
//      assistant message that's already "closed" (i.e. there's a later
//      user message after it). Models don't need to read their own past
//      reasoning, and Claude's extended-thinking constraint (must echo
//      thinking back inside an active tool loop) is preserved by only
//      eliding turns OUTSIDE the current loop.
//
//   2. Tool result eviction
//      A tool result is "consumed" once a subsequent assistant message
//      with text content acknowledges it. Past that point the raw bytes
//      add no information (the assistant's summary captured the salient
//      bits). We replace the content with a 1-line placeholder. Recent
//      results inside the sliding window are protected so users can ask
//      follow-up questions about them.
//
//   3. Sliding window with summary
//      Keeps the most recent K user-rounds verbatim. Older rounds are
//      folded into a single "前情提要" system message. Default truncate
//      mode is deterministic and zero-latency; subagent mode (future)
//      would call a small model for higher-quality summaries.
//
//   4. Provider prompt caching markers
//      Anthropic gets `cache_control` on the last system message and the
//      tools array. OpenAI/DeepSeek/Gemini auto-cache by prefix (no API
//      change needed; we only ensure prefix stability, which we already
//      do).
//
// All layers operate on a *deep-cloned* copy of the input array — the
// caller's `apiMessages` is never mutated.

const DEFAULT_OPTIONS = {
  evictThinking: true,
  evictToolResults: true,
  evictionMinChars: 800,
  slidingWindow: 4,
  summaryMode: 'truncate', // 'truncate' | 'subagent' (future)
  enableCaching: true,
  providerId: null,
};

// Deep clone an apiMessages array. Messages contain primitives + small
// nested objects (tool_calls); a JSON round-trip is fast enough and keeps
// the implementation obviously side-effect-free.
function cloneMessages(msgs) {
  try {
    return JSON.parse(JSON.stringify(msgs));
  } catch {
    return msgs.map((m) => ({ ...m }));
  }
}

// Strip <thought>...</thought> blocks (Gemma-style inline CoT) from a
// content string. Preserves all other text verbatim.
function stripInlineThought(content) {
  if (typeof content !== 'string' || !content.includes('<thought>')) {
    return content;
  }
  let out = '';
  let i = 0;
  while (i < content.length) {
    const start = content.indexOf('<thought>', i);
    if (start === -1) {
      out += content.slice(i);
      break;
    }
    out += content.slice(i, start);
    const end = content.indexOf('</thought>', start + 9);
    if (end === -1) break; // unterminated trailing — drop remainder
    i = end + 10;
  }
  return out;
}

// Find the index of the LAST user message. Everything from that index
// onward is "current loop" — for thinking elision we leave those alone
// since Claude extended-thinking requires the thinking block to still
// be present alongside in-flight tool_calls.
function lastUserIndex(msgs) {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') return i;
  }
  return -1;
}

// Layer 1 — Thinking elision.
function applyThinkingElision(msgs) {
  const lastUser = lastUserIndex(msgs);
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role !== 'assistant') continue;
    // Skip current-loop assistant turns (>= lastUser). Their thinking
    // may be required by the provider for in-flight tool continuation.
    if (i >= lastUser) continue;
    if (typeof m.reasoning_content === 'string') delete m.reasoning_content;
    if (m.thinking !== undefined) delete m.thinking;
    if (typeof m.content === 'string') {
      m.content = stripInlineThought(m.content);
    }
  }
  return msgs;
}

// Build a short, deterministic placeholder string for an evicted tool
// result. We look up the originating tool_call (in the preceding
// assistant message) so we can name the tool + key arg.
function buildEvictionPlaceholder(toolCall, originalContent) {
  const name = toolCall?.function?.name || 'tool';
  const args = (() => {
    try {
      return JSON.parse(toolCall?.function?.arguments || '{}');
    } catch {
      return {};
    }
  })();
  const size =
    typeof originalContent === 'string'
      ? originalContent.length
      : JSON.stringify(originalContent || '').length;
  switch (name) {
    case 'fetch_url':
      return `[evicted: fetch_url ${args.url || '?'}, ~${size} chars]`;
    case 'web_search':
      return `[evicted: web_search "${args.query || '?'}", ~${size} chars]`;
    case 'read_reference':
      return `[evicted: read_reference ${args.reference_id || args.id || '?'}, ~${size} chars]`;
    case 'read_file':
      return `[evicted: read_file ${args.path || '?'}, ~${size} chars]`;
    case 'fast_context':
      return `[evicted: fast_context "${args.query || '?'}", ~${size} chars]`;
    default:
      return `[evicted: ${name} result, ~${size} chars]`;
  }
}

// Build an index { toolCallId → toolCall } from the most recent assistant
// message that contained matching tool_calls. We walk all assistant
// messages and record their tool_calls so the lookup later is O(1).
function buildToolCallIndex(msgs) {
  const idx = new Map();
  for (const m of msgs) {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (tc?.id) idx.set(tc.id, tc);
      }
    }
  }
  return idx;
}

// Determine the minimum index that's INSIDE the protected sliding window.
// We keep all messages from that index onward verbatim. The window is
// counted in user-rounds: the last `K` user messages and everything
// after them. If there are fewer than K user messages, the window
// covers the whole array.
function windowStartIndex(msgs, k) {
  if (k <= 0) return msgs.length; // no protection, treat all as old
  let userCount = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') {
      userCount++;
      if (userCount >= k) return i;
    }
  }
  return 0;
}

// Layer 2 — Tool result eviction.
// Replace tool messages whose results have been "consumed" with a tiny
// placeholder. Consumed = followed by an assistant message with non-empty
// text content. Protected window (most recent K rounds) is left alone.
function applyToolResultEviction(msgs, options) {
  const protectedFrom = windowStartIndex(msgs, options.slidingWindow);
  const tcIndex = buildToolCallIndex(msgs);

  // Forward scan: detect "consumed" by looking ahead for an assistant
  // message with text content.
  const consumedSet = new Set();
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role !== 'tool') continue;
    for (let j = i + 1; j < msgs.length; j++) {
      const m = msgs[j];
      if (m.role === 'assistant' && typeof m.content === 'string' && m.content.trim()) {
        consumedSet.add(i);
        break;
      }
      // If we hit another tool/user before any digesting assistant,
      // the result is still "live" — leave it alone for now.
      if (m.role === 'user') break;
    }
  }

  for (let i = 0; i < msgs.length; i++) {
    if (i >= protectedFrom) break; // never touch the window
    const m = msgs[i];
    if (m.role !== 'tool') continue;
    if (!consumedSet.has(i)) continue;
    const original = m.content;
    const size =
      typeof original === 'string'
        ? original.length
        : JSON.stringify(original || '').length;
    if (size < options.evictionMinChars) continue; // too small to bother

    const tc = tcIndex.get(m.tool_call_id);
    m.content = buildEvictionPlaceholder(tc, original);
  }
  return msgs;
}

// Render a one-line summary of an old user→assistant round for the
// "前情提要" recap. Truncate mode = pure template, no LLM call.
function summarizeRound(round) {
  const userTxt = (() => {
    const c = round.user?.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      return c
        .map((p) => (p?.type === 'text' ? p.text : ''))
        .filter(Boolean)
        .join(' ');
    }
    return '';
  })().slice(0, 200);

  const assistantTxts = round.assistants
    .map((a) => (typeof a.content === 'string' ? a.content : ''))
    .filter(Boolean)
    .join(' ')
    .slice(0, 300);

  const toolNames = round.assistants
    .flatMap((a) => (Array.isArray(a.tool_calls) ? a.tool_calls : []))
    .map((tc) => tc?.function?.name)
    .filter(Boolean);
  const toolPart = toolNames.length
    ? ` [工具: ${[...new Set(toolNames)].join(', ')}]`
    : '';

  return `- 用户：${userTxt}${userTxt.length >= 200 ? '…' : ''}\n  助手：${assistantTxts}${assistantTxts.length >= 300 ? '…' : ''}${toolPart}`;
}

// Group messages into user-rounds: a user message + all assistant/tool
// messages that follow until the next user message. System messages
// don't belong to any round.
function groupIntoRounds(msgs) {
  const rounds = [];
  let cur = null;
  for (const m of msgs) {
    if (m.role === 'system') continue;
    if (m.role === 'user') {
      if (cur) rounds.push(cur);
      cur = { user: m, assistants: [], tools: [] };
    } else if (cur) {
      if (m.role === 'assistant') cur.assistants.push(m);
      else if (m.role === 'tool') cur.tools.push(m);
    }
  }
  if (cur) rounds.push(cur);
  return rounds;
}

// Layer 3 — Sliding window with summary.
// Folds rounds older than the most recent K into a single recap system
// message inserted right after the existing system messages.
function applySlidingWindow(msgs, options) {
  const k = options.slidingWindow;
  if (k <= 0) return msgs;

  // Separate leading system messages (kept as-is) from the rest.
  let sysEnd = 0;
  while (sysEnd < msgs.length && msgs[sysEnd].role === 'system') sysEnd++;
  const systemPrefix = msgs.slice(0, sysEnd);
  const tail = msgs.slice(sysEnd);

  const rounds = groupIntoRounds(tail);
  if (rounds.length <= k) return msgs; // nothing to fold

  const oldRounds = rounds.slice(0, rounds.length - k);
  const keepRounds = rounds.slice(rounds.length - k);

  const recapBody = oldRounds.map(summarizeRound).join('\n');
  const recap = {
    role: 'system',
    content:
      `## 前情提要（已折叠 ${oldRounds.length} 轮对话）\n` +
      `这是更早的对话摘要。仅作为背景参考；如需具体细节请询问用户。\n\n` +
      recapBody,
  };

  // Reconstruct: system prefix + recap + kept rounds (each round = its
  // user msg + assistants + tools, preserving original order WITHIN the
  // tail since we sliced from `tail`).
  const keptIndices = new Set();
  for (const r of keepRounds) {
    keptIndices.add(tail.indexOf(r.user));
    for (const a of r.assistants) keptIndices.add(tail.indexOf(a));
    for (const tm of r.tools) keptIndices.add(tail.indexOf(tm));
  }
  const keptTail = tail.filter((_, i) => keptIndices.has(i));

  return [...systemPrefix, recap, ...keptTail];
}

// Layer 4 — Provider prompt caching markers.
// Currently only Anthropic needs explicit `cache_control`; OpenAI,
// DeepSeek, and Gemini all do automatic prefix caching (no API change).
// We tag the last system message so everything up through the system
// prompt is one cacheable prefix. (Tools are part of the request body
// outside the messages array, so we don't touch them here — that
// wiring lives at the fetch site if/when needed.)
function applyCachingMarkers(msgs, options) {
  if (!options.enableCaching) return msgs;
  if (options.providerId !== 'anthropic') return msgs;

  // Find the last system message; tag its content.
  let lastSysIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'system') {
      lastSysIdx = i;
      break;
    }
  }
  if (lastSysIdx < 0) return msgs;

  const m = msgs[lastSysIdx];
  // Anthropic's OpenAI-compat layer accepts content as either string or
  // array of content parts. Convert to content-parts array so we can
  // attach cache_control to a specific part.
  const text = typeof m.content === 'string' ? m.content : '';
  if (!text) return msgs;
  msgs[lastSysIdx] = {
    role: 'system',
    content: [
      {
        type: 'text',
        text,
        cache_control: { type: 'ephemeral' },
      },
    ],
  };
  return msgs;
}

// Public API: pure function. Returns a new array; never mutates input.
export function compressApiMessages(apiMessages, userOptions = {}) {
  const options = { ...DEFAULT_OPTIONS, ...userOptions };
  if (!Array.isArray(apiMessages) || apiMessages.length === 0) {
    return apiMessages;
  }

  let msgs = cloneMessages(apiMessages);

  if (options.evictThinking) msgs = applyThinkingElision(msgs);
  if (options.evictToolResults) msgs = applyToolResultEviction(msgs, options);
  if (options.slidingWindow > 0) msgs = applySlidingWindow(msgs, options);
  msgs = applyCachingMarkers(msgs, options);

  return msgs;
}

// Quick-and-dirty token estimator used for the "saved N tokens" UI hint.
// We use chars / 3.5 as a coarse proxy — accurate to ~20% for mixed
// English/Chinese, which is plenty for a "你节省了" banner.
export function estimateTokens(messages) {
  if (!Array.isArray(messages)) return 0;
  let chars = 0;
  for (const m of messages) {
    const c = m?.content;
    if (typeof c === 'string') chars += c.length;
    else if (Array.isArray(c)) {
      for (const p of c) {
        if (typeof p?.text === 'string') chars += p.text.length;
      }
    }
    if (typeof m?.reasoning_content === 'string') chars += m.reasoning_content.length;
    if (typeof m?.thinking === 'string') chars += m.thinking.length;
    if (Array.isArray(m?.tool_calls)) {
      for (const tc of m.tool_calls) {
        chars += (tc?.function?.arguments || '').length;
        chars += (tc?.function?.name || '').length;
      }
    }
  }
  return Math.round(chars / 3.5);
}
