// Minimal Model Context Protocol (MCP) client over HTTP / Streamable HTTP.
//
// Speaks JSON-RPC 2.0 to a remote MCP server endpoint. Supports two response
// content-types per the streamable-HTTP transport spec:
//
//   • application/json        — single JSON-RPC response, typical for short
//                               request/response tools.
//   • text/event-stream (SSE) — multiple events; we read until the event
//                               whose data is a JSON-RPC response with the
//                               matching `id`.
//
// Session state (the `mcp-session-id` header returned by initialize) is held
// per-client and forwarded on every subsequent request, matching the spec's
// "stateful session" model. If the server doesn't return a session id, we
// fall back to stateless calls (still valid).
//
// Scope (Phase 1):
//   - tools/list, tools/call only. Resources / prompts can be added later
//     by extending the same `request()` helper.
//   - HTTP only. stdio transport requires Electron main-process spawn IPC
//     and is intentionally deferred.

const PROTOCOL_VERSION = '2025-03-26';

// Generate a monotonically-increasing request id. JSON-RPC 2.0 requires the
// server to echo the id, which is how `request()` matches responses to
// pending promises in SSE mode.
let nextRequestId = 1;

function parseSseStream(text) {
  // Standard SSE framing: events separated by blank lines, each event has
  // `event:` and `data:` lines. We only care about `data:` and concatenate
  // multi-line `data:` per event.
  const events = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    if (!block.trim()) continue;
    let dataLines = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length > 0) events.push(dataLines.join('\n'));
  }
  return events;
}

export function createMcpClient({ url, headers = {}, fetchImpl = fetch } = {}) {
  if (!url) throw new Error('MCP client: url is required');

  let sessionId = null;
  let initialized = false;
  let serverInfo = null;
  let serverCapabilities = null;

  const buildHeaders = (extra = {}) => {
    const h = {
      'Content-Type': 'application/json',
      // Per spec the client SHOULD advertise both so the server can choose
      // the most appropriate response framing.
      Accept: 'application/json, text/event-stream',
      ...headers,
      ...extra,
    };
    if (sessionId) h['mcp-session-id'] = sessionId;
    return h;
  };

  // Generic JSON-RPC request. Returns the `result` field of the matching
  // response, or throws if the server replies with `error`.
  const request = async (method, params, { signal, timeoutMs = 30_000 } = {}) => {
    const id = nextRequestId++;
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });

    let timer;
    const timeoutCtl = new AbortController();
    if (timeoutMs > 0) {
      timer = setTimeout(() => timeoutCtl.abort(), timeoutMs);
    }
    // Compose abort: external signal OR our timeout fires either side.
    const composedSignal = (() => {
      if (!signal) return timeoutCtl.signal;
      // AbortSignal.any is widely available but not in older Electron
      // builds; fall back to manual wiring.
      if (typeof AbortSignal !== 'undefined' && AbortSignal.any) {
        return AbortSignal.any([signal, timeoutCtl.signal]);
      }
      const merged = new AbortController();
      const onAbort = () => merged.abort();
      signal.addEventListener('abort', onAbort, { once: true });
      timeoutCtl.signal.addEventListener('abort', onAbort, { once: true });
      return merged.signal;
    })();

    let resp;
    try {
      resp = await fetchImpl(url, {
        method: 'POST',
        headers: buildHeaders(),
        body,
        signal: composedSignal,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }

    // Capture session id on first response (typically the initialize call).
    const sid = resp.headers.get('mcp-session-id');
    if (sid && !sessionId) sessionId = sid;

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`MCP HTTP ${resp.status}: ${text.slice(0, 300)}`);
    }

    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    let parsed = null;

    if (ct.includes('text/event-stream')) {
      // Streamable HTTP via SSE. We don't need true streaming for
      // request/response — just read the body to completion and pull out
      // the event whose `id` matches.
      const text = await resp.text();
      for (const evt of parseSseStream(text)) {
        try {
          const obj = JSON.parse(evt);
          if (obj && obj.id === id) {
            parsed = obj;
            break;
          }
        } catch {
          /* skip non-JSON SSE frames */
        }
      }
      if (!parsed) {
        throw new Error(
          `MCP: SSE stream ended without a response for id=${id}`,
        );
      }
    } else {
      // application/json — single envelope.
      const text = await resp.text();
      // Some servers omit the content-type but still return JSON; be lenient.
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(
          `MCP: non-JSON response (content-type=${ct || 'unknown'})`,
        );
      }
    }

    if (parsed.error) {
      const e = parsed.error;
      throw new Error(`MCP error ${e.code}: ${e.message || 'unknown'}`);
    }
    return parsed.result;
  };

  // Spec requires a one-way `notifications/initialized` after a successful
  // `initialize` exchange. Notifications carry no id and expect no body —
  // we don't read the response.
  const notify = async (method, params) => {
    const body = JSON.stringify({ jsonrpc: '2.0', method, params });
    try {
      await fetchImpl(url, {
        method: 'POST',
        headers: buildHeaders(),
        body,
      });
    } catch {
      /* notifications are best-effort */
    }
  };

  return {
    get sessionId() {
      return sessionId;
    },
    get initialized() {
      return initialized;
    },
    get info() {
      return serverInfo;
    },
    get capabilities() {
      return serverCapabilities;
    },

    async initialize(opts = {}) {
      const result = await request(
        'initialize',
        {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: 'arctic-code',
            version: '2.0.0-beta',
          },
        },
        opts,
      );
      serverInfo = result?.serverInfo || null;
      serverCapabilities = result?.capabilities || {};
      initialized = true;
      // Fire-and-forget initialized notification — required by spec.
      await notify('notifications/initialized');
      return result;
    },

    async listTools(opts = {}) {
      const result = await request('tools/list', {}, opts);
      const tools = Array.isArray(result?.tools) ? result.tools : [];
      // Each entry: { name, description, inputSchema }
      return tools;
    },

    async callTool(name, args, opts = {}) {
      const result = await request(
        'tools/call',
        { name, arguments: args || {} },
        // Tool execution can be slow (web fetch, code exec) — give a
        // generous timeout. The agent loop applies its own outer timeout
        // on top, so this is a backstop only.
        { timeoutMs: 5 * 60_000, ...opts },
      );
      return result;
    },

    async close() {
      if (!sessionId) return;
      try {
        await fetchImpl(url, {
          method: 'DELETE',
          headers: buildHeaders(),
        });
      } catch {
        /* best-effort */
      }
      sessionId = null;
      initialized = false;
    },
  };
}

// Convert MCP tool definitions (JSON Schema in `inputSchema`) to OpenAI
// function-calling specs. The shape lines up cleanly — MCP's `inputSchema`
// is already a JSON Schema object, which is exactly what OpenAI expects in
// `function.parameters`.
//
// `prefix` is mandatory: every tool gets renamed to mcp__<server>__<name>
// so the agent loop can route by prefix without colliding with built-in
// tool names. Names are also sanitized to match the OpenAI tool-name regex
// (^[a-zA-Z0-9_-]{1,64}$).
export function mcpToolsToOpenAISpec(tools, prefix) {
  const safeName = (raw) =>
    String(raw)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 48);
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: `mcp__${safeName(prefix)}__${safeName(t.name)}`,
      description:
        (t.description || '').slice(0, 1024) ||
        `MCP tool ${t.name} from server ${prefix}`,
      parameters:
        t.inputSchema && typeof t.inputSchema === 'object'
          ? t.inputSchema
          : { type: 'object', properties: {} },
    },
  }));
}

// Flatten MCP `tools/call` result content array into a single string. MCP
// returns `{ content: [{type:'text', text}, {type:'image', ...}], isError }`.
// For tool-result messages we need a single string, so we concat text parts
// and describe non-text parts inline. `isError` is preserved on the
// resulting object so the agent loop can flip the card to red.
export function flattenMcpToolResult(result) {
  if (!result || typeof result !== 'object') {
    return { ok: true, content: '' };
  }
  const parts = Array.isArray(result.content) ? result.content : [];
  const chunks = [];
  for (const p of parts) {
    if (!p) continue;
    if (p.type === 'text' && typeof p.text === 'string') {
      chunks.push(p.text);
    } else if (p.type === 'image') {
      chunks.push(`[image ${p.mimeType || ''}]`);
    } else if (p.type === 'resource' && p.resource) {
      const uri = p.resource.uri || '';
      const text = p.resource.text || '';
      chunks.push(text ? `[resource ${uri}]\n${text}` : `[resource ${uri}]`);
    } else {
      try {
        chunks.push(JSON.stringify(p));
      } catch {
        /* skip */
      }
    }
  }
  return {
    ok: !result.isError,
    content: chunks.join('\n\n'),
    ...(result.isError ? { error: chunks.join('\n\n') || 'tool reported error' } : {}),
  };
}
