// Provider routing — given a user-facing model id (e.g. "gemma-4-31b-it"),
// resolve which upstream API provider to call, which URL, which API key,
// and which concrete upstream model id to pass in the request body.
//
// This table used to live inline in App.jsx. It was extracted because the
// subagent runner (used by fast_context + web_search summarization) needs
// the exact same routing but with a potentially *different* selected model.
// Single source of truth keeps the two paths consistent.

export const MODEL_GROUPS = [
  { provider: 'openai', models: ['chatgpt-5.5', 'chatgpt-5.4', 'chatgpt-5.3-codex', 'chatgpt-5.2'] },
  { provider: 'anthropic', models: ['claude-opus-4.6', 'claude-opus-4.5', 'claude-sonnet-4.6', 'claude-sonnet-4.5'] },
  { provider: 'google', models: ['gemini-3.1-pro', 'gemini-3-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-pro', 'gemma-4-31b-it', 'gemma-4-26b-a4b-it'] },
  { provider: 'zai', models: ['chatglm-5.1', 'chatglm-5', 'chatglm-5v-turbo'] },
  // Ollama / LM Studio have no pre-declared built-in models — users add
  // them as custom entries at runtime. getProviderForModel() still needs
  // them in this table so the resolver can scan per-provider custom lists.
  { provider: 'ollama', models: [] },
  { provider: 'lmstudio', models: [] },
];

export const DEFAULT_URLS = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  // Google's OpenAI-compatible endpoint. /v1beta alone is the native
  // generateContent API which rejects OpenAI-style /chat/completions
  // requests; the /openai suffix routes to the compat layer documented
  // at https://ai.google.dev/gemini-api/docs/openai.
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  zai: 'https://open.bigmodel.cn/api/paas/v4',
  // Local engines — OpenAI-compatible /chat/completions on loopback.
  // Ollama ships its compat endpoint at /v1; LM Studio uses /v1 too.
  ollama: 'http://127.0.0.1:11434/v1',
  lmstudio: 'http://127.0.0.1:1234/v1',
};

// Providers that don't require an API Key (localhost-only daemons).
// resolveProvider() uses a placeholder 'ollama' token if the user left
// the key field blank, because some clients reject an empty Bearer header.
export const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio']);

// Maps user-facing model ids in this app → the actual string the provider
// expects in the `model` body field. Gemini 3.x are currently preview
// builds (Nov 2025); Gemini 2.5 Pro is stable. IDs verified against
// https://ai.google.dev/gemini-api/docs/models (April 2026).
export const DEFAULT_MODEL_IDS = {
  'chatgpt-5.5': 'gpt-5.5',
  'chatgpt-5.4': 'gpt-5.4',
  'chatgpt-5.3-codex': 'gpt-5.3-codex',
  'chatgpt-5.2': 'gpt-5.2',
  'claude-opus-4.6': 'claude-opus-4-6-20260401',
  'claude-opus-4.5': 'claude-opus-4-5-20250220',
  'claude-sonnet-4.6': 'claude-sonnet-4-6-20260401',
  'claude-sonnet-4.5': 'claude-sonnet-4-5-20250514',
  'gemini-3.1-pro': 'gemini-3.1-pro-preview',
  'gemini-3-flash': 'gemini-3-flash-preview',
  'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite-preview',
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'gemma-4-31b-it': 'gemma-4-31b-it',
  'gemma-4-26b-a4b-it': 'gemma-4-26b-a4b-it',
  'chatglm-5.1': 'glm-5.1',
  'chatglm-5': 'glm-5',
  'chatglm-5v-turbo': 'glm-5v-turbo',
};

function readProviderConfigs() {
  try {
    return JSON.parse(localStorage.getItem('arctic-providerConfigs') || '{}');
  } catch {
    return {};
  }
}

// Look up which MODEL_GROUPS provider owns this user-facing model id.
// Falls back to scanning each provider's customModels list so user-added
// Ollama / LM Studio / custom OpenAI-compat entries resolve correctly.
export function getProviderForModel(modelId) {
  for (const g of MODEL_GROUPS) {
    if (g.models.includes(modelId)) return g.provider;
  }
  const configs = readProviderConfigs();
  for (const providerId of Object.keys(configs)) {
    const list = Array.isArray(configs[providerId]?.customModels)
      ? configs[providerId].customModels
      : [];
    if (list.some((m) => m && m.id === modelId)) return providerId;
  }
  return null;
}

// Resolve everything needed to make a chat-completions request for `modelId`.
// Returns either:
//   { ok: true, providerId, baseUrl, apiKey, apiModelId }
// or:
//   { ok: false, error: string, providerId? }
export function resolveProvider(modelId, { providerConfigs } = {}) {
  const providerId = getProviderForModel(modelId);
  if (!providerId) {
    return { ok: false, errorCode: 'model_unavailable', error: `Model "${modelId}" is not available. Select a different model in Settings.` };
  }

  const configs = providerConfigs || readProviderConfigs();
  const cfg = configs[providerId] || {};
  const apiKey = cfg.apiKey || '';
  const baseUrl = cfg.baseUrl || DEFAULT_URLS[providerId] || '';
  const modelOverrides = cfg.modelOverrides || {};
  const customModels = Array.isArray(cfg.customModels) ? cfg.customModels : [];

  // Custom model id: check exact match first, then reasoning-variant keys
  // (e.g. `claude-opus-4.6-reasoning` can be used as an override for
  // `claude-opus-4.6`).
  let apiModelId = modelOverrides[modelId];
  if (!apiModelId) {
    const variantKey = Object.keys(modelOverrides).find(
      (k) => k.startsWith(modelId + '-') && modelOverrides[k]
    );
    if (variantKey) apiModelId = modelOverrides[variantKey];
  }
  // User-defined custom model? Use its apiId verbatim — it's what the
  // user typed into the editor as the upstream model name.
  if (!apiModelId) {
    const custom = customModels.find((m) => m && m.id === modelId);
    if (custom) apiModelId = custom.apiId || modelId;
  }
  if (!apiModelId) {
    apiModelId = DEFAULT_MODEL_IDS[modelId] || modelId;
  }

  // Local engines (Ollama / LM Studio) don't require a real key. We still
  // send something in the Authorization header because some proxies will
  // reject an empty Bearer token; 'local' is the conventional placeholder.
  const effectiveKey = apiKey || (LOCAL_PROVIDERS.has(providerId) ? 'local' : '');

  if (!effectiveKey) {
    return {
      ok: false,
      providerId,
      errorCode: 'api_key_missing',
      error: `API Key for ${providerId.toUpperCase()} is not configured. Set it in Settings → Models.`,
    };
  }

  if (!baseUrl) {
    return {
      ok: false,
      providerId,
      errorCode: 'base_url_missing',
      error: `Base URL for ${providerId.toUpperCase()} is not configured. Set it in Settings → Models.`,
    };
  }

  return { ok: true, providerId, baseUrl, apiKey: effectiveKey, apiModelId };
}
