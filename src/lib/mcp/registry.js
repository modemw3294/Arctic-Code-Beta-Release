// MCP server registry — module-level singleton that owns all live MCP
// connections, their cached tool lists, and the routing table used by the
// agent loop.
//
// Lifecycle:
//   1. App startup calls `connectAll(servers)` with whatever's persisted
//      in toolsConfig. Each enabled server gets an entry whose status
//      progresses idle → connecting → ready (or → error).
//   2. The agent loop reads `getOpenAITools()` to merge MCP tools into
//      the request's `tools` array, and `callTool(prefixedName, args)`
//      to dispatch by mcp__<server>__<tool> prefix.
//   3. Settings UI subscribes via `subscribe(cb)` to re-render statuses
//      and tool counts as connections settle.
//   4. When the user edits the server list, App calls `reconnect(servers)`
//      which closes removed servers and (re)connects the rest.
//
// State is intentionally process-wide (module singleton). MCP connections
// hold session ids and we don't want to leak / duplicate them across
// React renders. The store is small enough that we use a hand-rolled
// pub/sub instead of pulling in zustand.

import { createMcpClient, mcpToolsToOpenAISpec, flattenMcpToolResult } from './client';

// serverName -> { config, client, status, tools, error, openaiTools }
const state = new Map();
const subscribers = new Set();

const notify = () => {
  for (const cb of subscribers) {
    try {
      cb(snapshot());
    } catch {
      /* never let a bad subscriber kill the registry */
    }
  }
};

function snapshot() {
  const out = [];
  for (const entry of state.values()) {
    out.push({
      name: entry.config.name,
      url: entry.config.url,
      enabled: entry.config.enabled !== false,
      status: entry.status,
      error: entry.error || null,
      toolCount: entry.tools?.length || 0,
      tools: entry.tools || [],
      serverInfo: entry.serverInfo || null,
    });
  }
  return out;
}

export function subscribe(cb) {
  subscribers.add(cb);
  // Push current snapshot immediately so subscribers don't have to wait
  // for the next change to render.
  try { cb(snapshot()); } catch { /* ignore */ }
  return () => subscribers.delete(cb);
}

export function getStatus() {
  return snapshot();
}

// Returns OpenAI-shape tool specs for ALL ready servers, ready to be
// concatenated with the built-in agentTools array. Disabled / errored
// servers contribute nothing.
export function getOpenAITools() {
  const out = [];
  for (const entry of state.values()) {
    if (entry.status !== 'ready') continue;
    if (entry.config.enabled === false) continue;
    if (Array.isArray(entry.openaiTools)) out.push(...entry.openaiTools);
  }
  return out;
}

// Returns true iff the given tool name belongs to an MCP server (i.e.
// starts with the mcp__ prefix). The agent loop uses this to fast-path
// dispatch decisions without scanning the full registry.
export function isMcpTool(name) {
  return typeof name === 'string' && name.startsWith('mcp__');
}

// Dispatch a prefixed tool call. Returns a result shape compatible with
// the in-app tool runner: { ok, content?, error?, ... }.
export async function callTool(prefixedName, args, opts = {}) {
  if (!isMcpTool(prefixedName)) {
    return { ok: false, error: `not an MCP tool: ${prefixedName}` };
  }
  // mcp__<server>__<tool> — server name is between the two double
  // underscores; tool name is everything after, which may itself
  // contain underscores.
  const rest = prefixedName.slice('mcp__'.length);
  const sep = rest.indexOf('__');
  if (sep < 0) return { ok: false, error: `malformed MCP tool name: ${prefixedName}` };
  const serverName = rest.slice(0, sep);
  const toolName = rest.slice(sep + 2);

  const entry = state.get(serverName);
  if (!entry) return { ok: false, error: `unknown MCP server: ${serverName}` };
  if (entry.status !== 'ready') {
    return { ok: false, error: `MCP server ${serverName} not ready (${entry.status})` };
  }
  // Resolve the actual tool name. The prefixed name was sanitized, so we
  // need to look up the original from the cached tool list.
  const sanitized = (raw) =>
    String(raw).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  const tool = entry.tools.find((t) => sanitized(t.name) === toolName);
  if (!tool) {
    return { ok: false, error: `unknown MCP tool: ${serverName}.${toolName}` };
  }
  try {
    const result = await entry.client.callTool(tool.name, args || {}, opts);
    return flattenMcpToolResult(result);
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// Open one connection. Idempotent: re-calling for the same server first
// closes the existing client.
async function connectOne(config) {
  const name = config.name;
  if (!name) return;
  // Clean up any existing entry for this name.
  const prev = state.get(name);
  if (prev?.client) {
    try { await prev.client.close(); } catch { /* ignore */ }
  }

  const entry = {
    config,
    client: null,
    status: config.enabled === false ? 'disabled' : 'connecting',
    tools: [],
    openaiTools: [],
    error: null,
    serverInfo: null,
  };
  state.set(name, entry);
  notify();

  if (config.enabled === false) return;
  if (!config.url) {
    entry.status = 'error';
    entry.error = 'missing url';
    notify();
    return;
  }

  try {
    const client = createMcpClient({
      url: config.url,
      headers: config.headers || {},
    });
    entry.client = client;
    await client.initialize({ timeoutMs: 15_000 });
    entry.serverInfo = client.info;
    const tools = await client.listTools({ timeoutMs: 15_000 });
    entry.tools = tools;
    entry.openaiTools = mcpToolsToOpenAISpec(tools, name);
    entry.status = 'ready';
    entry.error = null;
  } catch (e) {
    entry.status = 'error';
    entry.error = e?.message || String(e);
    entry.tools = [];
    entry.openaiTools = [];
  }
  notify();
}

// Connect (or reconnect) every server in the given config list. Servers
// that disappear are closed and removed. Runs all connections in parallel
// — a single slow / dead server can't block the others.
export async function connectAll(servers) {
  const list = Array.isArray(servers) ? servers : [];
  const seenNames = new Set(list.map((s) => s.name).filter(Boolean));

  // Close servers that were removed from config.
  for (const [name, entry] of [...state.entries()]) {
    if (!seenNames.has(name)) {
      try { await entry.client?.close(); } catch { /* ignore */ }
      state.delete(name);
    }
  }
  notify();

  await Promise.all(list.map((s) => connectOne(s)));
}

// Public alias matching what callers tend to expect.
export const reconnect = connectAll;

// Force-refresh a single server's tool list (useful after the user
// connects / un-pauses a backend whose tool roster has changed).
export async function refreshOne(name) {
  const entry = state.get(name);
  if (!entry) return;
  await connectOne(entry.config);
}

// Reset everything. Mostly useful for tests / hot reload.
export async function disconnectAll() {
  for (const entry of state.values()) {
    try { await entry.client?.close(); } catch { /* ignore */ }
  }
  state.clear();
  notify();
}
