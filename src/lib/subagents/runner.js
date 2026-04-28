// Generic subagent runner.
//
// A subagent is a secondary LLM loop spawned *inside* a tool call. It gets
// its own model, system prompt, tool set, and iteration budget, but shares
// nothing with the main chat UI — its tokens don't stream anywhere visible.
// Used for things like:
//   - fast_context: small model orchestrates grep/read/glob to retrieve
//     relevant code snippets for the main model
//   - web_search (summarization mode): small model orchestrates SERP API +
//     fetch_url to build a distilled search report
//
// Both share this plumbing: same provider routing, same function-calling
// protocol, same parallel-tool-call pattern as the main agent — just
// non-streaming and with a tighter iteration budget.

import { resolveProvider } from '../providerRouting';
import { parseChatCompletion, extractInlineToolCalls } from '../tools';

// Run one subagent turn. Returns the full assistant text after the subagent
// finishes or throws if the provider is misconfigured / the request fails.
//
// Params:
//   modelId        user-facing model id (e.g. 'gemma-4-31b-it')
//   systemPrompt   string — persona / instructions
//   query          string — user request for this subagent
//   tools          OpenAI-compatible function-call specs (optional)
//   toolRunner     async (name, args) => result (optional)
//   maxIterations  default 4 — matches Windsurf SWE-grep's 4-turn budget
//   signal         AbortSignal — main UI aborts cascade into subagent
//   onProgress     optional cb({ iteration, toolCalls, text }) for UI
export async function runSubagent({
  modelId,
  systemPrompt,
  query,
  tools,
  toolRunner,
  maxIterations = 4,
  signal,
  onProgress,
} = {}) {
  if (!modelId) throw new Error('subagent: modelId is required');
  if (!query) throw new Error('subagent: query is required');

  const resolved = resolveProvider(modelId);
  if (!resolved.ok) {
    throw new Error(`subagent provider: ${resolved.error}`);
  }
  const { baseUrl, apiKey, apiModelId } = resolved;

  const apiMessages = [];
  if (systemPrompt) {
    apiMessages.push({ role: 'system', content: systemPrompt });
  }
  apiMessages.push({ role: 'user', content: query });

  const useTools = Array.isArray(tools) && tools.length > 0;
  const accumulatedTexts = [];
  let finalText = '';

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    if (signal?.aborted) {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: apiModelId,
        messages: apiMessages,
        // Non-streaming on purpose — subagents don't render anywhere, and
        // bulk JSON is easier to reason about for internal use.
        stream: false,
        tools: useTools ? tools : undefined,
      }),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(
        `subagent http ${response.status}: ${errText.substring(0, 200)}`
      );
    }

    const rawText = await response.text();
    const parsed = parseChatCompletion(rawText);

    // Inline tool-call recovery — see the main App.jsx loop for the
    // rationale. Subagents default to Gemma 4 31B IT, which is the
    // canonical example of a model that emits ```tool_code``` text
    // blocks instead of structured `tool_calls`. Without this, the
    // fast_context / web_search digest subagents short-circuit on
    // the first turn and return a useless prose response.
    if (
      (!parsed.tool_calls || parsed.tool_calls.length === 0) &&
      useTools &&
      typeof parsed.content === 'string' &&
      parsed.content.length > 0
    ) {
      const allowed = new Set(tools.map((t) => t.function.name));
      const recovered = extractInlineToolCalls(parsed.content, allowed);
      if (recovered.calls.length > 0) {
        parsed.tool_calls = recovered.calls;
        parsed.content = recovered.cleanedContent;
      }
    }

    const turn = { role: 'assistant', content: parsed.content || '' };
    if (parsed.tool_calls && parsed.tool_calls.length > 0) {
      turn.tool_calls = parsed.tool_calls;
    }
    apiMessages.push(turn);
    if (parsed.content) accumulatedTexts.push(parsed.content);

    onProgress?.({
      iteration,
      toolCalls: parsed.tool_calls || [],
      text: parsed.content || '',
    });

    // No tool calls → terminal turn
    if (!parsed.tool_calls || parsed.tool_calls.length === 0) {
      finalText = parsed.content || (accumulatedTexts.join('\n\n') || '');
      break;
    }

    if (!useTools || !toolRunner) {
      // Model asked for tools we can't satisfy — treat as terminal with
      // whatever text it produced.
      finalText = parsed.content || (accumulatedTexts.join('\n\n') || '');
      break;
    }

    // Sanitize tool_calls — see App.jsx for the full rationale. Subagents
    // hit the same provider edge cases (duplicate ids, missing names,
    // unparseable arguments) and need the same defenses to avoid hanging
    // the calling main-loop tool (fast_context / web_search digest).
    const seenIds = new Set();
    parsed.tool_calls = parsed.tool_calls
      .filter((tc) => tc?.function?.name)
      .map((tc, i) => {
        let id = tc.id;
        if (!id || seenIds.has(id)) id = `call_dedup_${Date.now()}_${i}`;
        seenIds.add(id);
        return { ...tc, id };
      });

    // Per-call timeout — subagents are budget-constrained so we use a
    // tighter 2-minute cap than the main loop's 10 min.
    const SUBAGENT_TOOL_TIMEOUT_MS = 2 * 60 * 1000;
    const safeSerialize = (value) => {
      if (value === undefined) return '{"ok":false,"error":"tool returned undefined"}';
      try {
        const seen = new WeakSet();
        const out = JSON.stringify(value, (_k, v) => {
          if (typeof v === 'bigint') return String(v);
          if (typeof v === 'object' && v !== null) {
            if (seen.has(v)) return '[Circular]';
            seen.add(v);
          }
          return v;
        });
        return typeof out === 'string'
          ? out
          : '{"ok":false,"error":"tool result not serialisable"}';
      } catch (e) {
        return JSON.stringify({ ok: false, error: `serialisation failed: ${e?.message || String(e)}` });
      }
    };

    // Execute tool calls in parallel (same pattern as the main loop). Tool
    // results preserve request order so the API's tool_calls ↔ tool messages
    // invariant holds.
    const toolMsgs = new Array(parsed.tool_calls.length);
    await Promise.all(parsed.tool_calls.map(async (tc, idx) => {
      let args = {};
      let argsParseError = null;
      try { args = JSON.parse(tc.function.arguments || '{}'); }
      catch (e) { argsParseError = e?.message || 'invalid JSON arguments'; }

      let result;
      if (argsParseError) {
        result = { ok: false, error: `参数解析失败（${argsParseError}）` };
      } else {
        let timer;
        const timeout = new Promise((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`tool ${tc.function.name} timed out`)),
            SUBAGENT_TOOL_TIMEOUT_MS,
          );
        });
        let abortListener;
        const aborted = new Promise((_resolve, reject) => {
          if (signal?.aborted) {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            return;
          }
          if (signal) {
            abortListener = () =>
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            signal.addEventListener('abort', abortListener);
          }
        });
        try {
          result = await Promise.race([
            toolRunner(tc.function.name, args),
            timeout,
            aborted,
          ]);
        } catch (e) {
          result = { ok: false, error: e?.message || String(e) };
        } finally {
          clearTimeout(timer);
          if (abortListener && signal) signal.removeEventListener('abort', abortListener);
        }
      }
      if (result === undefined || result === null) {
        result = { ok: false, error: 'tool returned no result' };
      }
      toolMsgs[idx] = {
        role: 'tool',
        tool_call_id: tc.id,
        content: safeSerialize(result),
      };
    }));
    for (const m of toolMsgs) if (m) apiMessages.push(m);
    if (signal?.aborted) break;
  }

  if (!finalText) {
    finalText = accumulatedTexts.length
      ? accumulatedTexts.join('\n\n')
      : '(subagent produced no output)';
  }

  return {
    text: finalText,
    messages: apiMessages,
  };
}
