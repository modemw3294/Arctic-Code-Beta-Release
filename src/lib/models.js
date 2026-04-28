// Central model catalogue. Each model advertises:
//   id              - provider-agnostic id used in UI & when routing the API call
//   name            - display name
//   tag             - optional badge text (NEW / CODE / VISION)
//   reasoning       - ordered list of reasoning levels the model supports, or null
//   media           - attachment kinds accepted: 'image' | 'audio'
//   contextWindow   - approximate usable context window in tokens (for UI budgeting)

// Context window sizes below are sourced from the providers' official docs /
// blog posts (verified 2026-04):
//   - OpenAI GPT-5.5 / 5.4:     1M      (openai.com/index/introducing-gpt-5-5, developers.openai.com)
//   - OpenAI GPT-5.3 Codex:    400K     (developers.openai.com/api/docs/models/gpt-5.3-codex, 272k in + 128k out)
//   - OpenAI GPT-5.2:          400K     (same family)
//   - Claude Opus 4.7 / 4.6:    1M      (anthropic.com/claude/opus, platform.claude.com pricing)
//   - Claude Opus 4.5:         200K     (Claude Opus 4.5 System Card, Nov 2025)
//   - Claude Sonnet 4.6 / 4.5:  1M      (platform.claude.com pricing, AWS Bedrock 1M preview)
//   - Kimi K2.6:               262K     (developers.cloudflare.com/workers-ai/models/kimi-k2.6, 262,144 tokens)
//   - Gemini 3.1 Pro / 3 Flash / 3.1 Flash-Lite / 2.5 Pro: 1M  (Vertex AI docs, OpenRouter, deepmind model cards)
//   - GLM-5 / 5.1 / 5V:        200K     (glm-5.org, Z.AI developer docs)
// Orange Studio "Wisector" is an in-house preview; we default its window to
// 200K which matches the frontier baseline and keeps the UI budgeting safe.
// Built-in catalogue. User-added custom models are merged on top via
// getModelGroups() / getAllModels() at render time (see bottom of file).
export const BUILTIN_MODEL_GROUPS = [
  {
    provider: 'Orange Studio',
    color: '#FF6B2B',
    // Wisector is not yet released. We keep the catalogue entries here for
    // future enablement, but mark the whole group as disabled so the
    // selectors / pickers filter them out (see getModelGroups()).
    disabled: true,
    models: [
      { id: 'wisector-code-pro-1', name: 'Wisector Code Pro 1 Preview', tag: 'CODE', reasoning: null, media: ['image'], contextWindow: 200_000, disabled: true },
      { id: 'wisector-1', name: 'Wisector 1 Preview', tag: '', reasoning: null, media: ['image'], contextWindow: 200_000, disabled: true },
    ],
  },
  {
    provider: 'OpenAI',
    color: '#10A37F',
    models: [
      { id: 'chatgpt-5.5', name: 'ChatGPT 5.5', tag: 'NEW', reasoning: ['xhigh', 'high', 'medium', 'low'], media: ['image'], contextWindow: 1_000_000 },
      { id: 'chatgpt-5.4', name: 'ChatGPT 5.4', tag: '', reasoning: ['xhigh', 'high', 'medium', 'low'], media: ['image'], contextWindow: 1_000_000 },
      { id: 'chatgpt-5.3-codex', name: 'ChatGPT 5.3 Codex', tag: 'CODE', reasoning: ['xhigh', 'high', 'medium', 'low'], media: ['image'], contextWindow: 400_000 },
      { id: 'chatgpt-5.2', name: 'ChatGPT 5.2', tag: '', reasoning: ['xhigh', 'high', 'medium', 'low'], media: ['image'], contextWindow: 400_000 },
    ],
  },
  {
    provider: 'Anthropic',
    color: '#D4A574',
    models: [
      { id: 'claude-opus-4.7', name: 'Claude Opus 4.7', tag: 'NEW', reasoning: ['max', 'xhigh', 'high', 'medium', 'low'], media: ['image'], contextWindow: 1_000_000 },
      { id: 'claude-opus-4.6', name: 'Claude Opus 4.6', tag: '', reasoning: ['reasoning', 'standard'], media: ['image'], contextWindow: 1_000_000 },
      { id: 'claude-opus-4.5', name: 'Claude Opus 4.5', tag: '', reasoning: ['reasoning', 'standard'], media: ['image'], contextWindow: 200_000 },
      { id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', tag: '', reasoning: ['reasoning', 'standard'], media: ['image'], contextWindow: 1_000_000 },
      { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', tag: '', reasoning: ['reasoning', 'standard'], media: ['image'], contextWindow: 1_000_000 },
    ],
  },
  {
    provider: 'Moonshot',
    color: '#1F2937',
    models: [
      { id: 'kimi-2.6', name: 'Kimi 2.6', tag: 'NEW', reasoning: ['reasoning', 'standard'], media: [], contextWindow: 262_144 },
    ],
  },
  {
    provider: 'Google',
    color: '#4285F4',
    models: [
      { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', tag: 'NEW', reasoning: ['high', 'low'], media: ['image', 'audio'], contextWindow: 1_000_000 },
      { id: 'gemini-3-flash', name: 'Gemini 3 Flash', tag: '', reasoning: ['high', 'low'], media: ['image', 'audio'], contextWindow: 1_000_000 },
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', tag: '', reasoning: ['high', 'low'], media: ['image', 'audio'], contextWindow: 1_000_000 },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', tag: '', reasoning: ['high', 'low'], media: ['image', 'audio'], contextWindow: 1_000_000 },
      // Gemma 4 — open-weight family with two variants: 31B dense (IT) and
      // 26B A4B MoE (4B active parameters). Both support High / Minimal
      // thinking levels and share a 256K context window.
      // Gemma 4 is natively multimodal (SigLIP vision encoder) — both the
      // 31B dense and 26B A4B MoE variants accept image inputs. Audio is
      // not yet supported on-device.
      { id: 'gemma-4-31b-it', name: 'Gemma 4 31B IT', tag: 'NEW', reasoning: ['high', 'minimal'], media: ['image'], contextWindow: 256_000 },
      { id: 'gemma-4-26b-a4b-it', name: 'Gemma 4 26B A4B IT', tag: 'NEW', reasoning: ['high', 'minimal'], media: ['image'], contextWindow: 256_000 },
    ],
  },
  {
    provider: 'Z.ai',
    color: '#6366F1',
    models: [
      { id: 'chatglm-5.1', name: 'ChatGLM 5.1', tag: 'NEW', reasoning: ['reasoning', 'standard'], media: [], contextWindow: 200_000 },
      { id: 'chatglm-5', name: 'ChatGLM 5', tag: '', reasoning: ['reasoning', 'standard'], media: [], contextWindow: 200_000 },
      { id: 'chatglm-5v-turbo', name: 'ChatGLM 5V Turbo', tag: 'VISION', reasoning: ['reasoning', 'standard'], media: ['image'], contextWindow: 200_000 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Custom models
// ---------------------------------------------------------------------------
//
// Custom models live inside `localStorage['arctic-providerConfigs']` under
// each provider's `customModels` array. This lets users plug Ollama / LM
// Studio local models or any OpenAI-compatible provider's newer models
// without waiting for a catalogue update.
//
// Shape per entry:
//   {
//     id: string,           // UI id — we prepend `custom-<provider>-` to keep
//                           // it globally unique across providers.
//     name: string,         // display name
//     apiId: string,        // exact string sent in the request's `model` field
//     contextWindow: number,
//     media: Array<'image'|'audio'>,
//     supportsTools: boolean,   // whether /chat/completions tool calls work
//     reasoning: string[]|null, // optional reasoning level list
//   }

const PROVIDER_COLORS = {
  openai: '#10A37F',
  anthropic: '#D4A574',
  google: '#4285F4',
  zai: '#6366F1',
  ollama: '#3B82F6',
  lmstudio: '#8B5CF6',
  wisector: '#FF6B2B',
};

const PROVIDER_LABELS = {
  openai: 'openai_custom',
  anthropic: 'anthropic_custom',
  google: 'google_custom',
  zai: 'zai_custom',
  ollama: 'ollama',
  lmstudio: 'lmstudio',
  wisector: 'wisector_custom',
};

function readProviderConfigs() {
  try {
    return JSON.parse(localStorage.getItem('arctic-providerConfigs') || '{}');
  } catch {
    return {};
  }
}

// Build the custom-model groups, one per provider that has any. Returned
// entries share the shape of BUILTIN_MODEL_GROUPS so the UI can treat them
// uniformly.
export function getCustomModelGroups() {
  const configs = readProviderConfigs();
  const groups = [];
  for (const providerId of Object.keys(configs)) {
    const list = Array.isArray(configs[providerId]?.customModels)
      ? configs[providerId].customModels
      : [];
    if (list.length === 0) continue;
    groups.push({
      provider: PROVIDER_LABELS[providerId] || providerId,
      color: PROVIDER_COLORS[providerId] || '#64748B',
      providerId,
      isCustom: true,
      models: list.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        tag: m.tag || 'CUSTOM',
        reasoning: Array.isArray(m.reasoning) && m.reasoning.length > 0 ? m.reasoning : null,
        media: Array.isArray(m.media) ? m.media : [],
        contextWindow: Number(m.contextWindow) || 128_000,
        supportsTools: m.supportsTools !== false,
        isCustom: true,
        providerId,
        apiId: m.apiId || m.id,
      })),
    });
  }
  return groups;
}

// Full live model catalogue — built-ins + every user-defined custom model.
// Disabled groups (e.g. unreleased Wisector) and disabled individual models
// are filtered out so they never reach selectors or pickers.
export function getModelGroups() {
  return [...BUILTIN_MODEL_GROUPS, ...getCustomModelGroups()]
    .filter((g) => !g.disabled)
    .map((g) => ({ ...g, models: g.models.filter((m) => !m.disabled) }))
    .filter((g) => g.models.length > 0);
}

export function getAllModels() {
  return getModelGroups().flatMap((g) => g.models);
}

export function getModel(id) {
  return getAllModels().find((m) => m.id === id) || null;
}

export function getContextWindow(id) {
  return getModel(id)?.contextWindow || 128_000;
}

// ---------------------------------------------------------------------------
// Backwards-compat: the old const exports are still referenced by a handful
// of paths. We keep them as snapshots of the BUILT-IN catalogue only — code
// that needs the live merged view must call getModelGroups() / getAllModels()
// explicitly. This preserves `import { modelGroups } from ...` without
// silently serving stale custom-model data (which would be worse than
// showing none).
// ---------------------------------------------------------------------------
export const modelGroups = BUILTIN_MODEL_GROUPS;
export const allModels = BUILTIN_MODEL_GROUPS.flatMap((g) => g.models);

export const reasoningLabels = {
  max: 'Max',
  xhigh: 'XHigh',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  minimal: 'Minimal',
  reasoning: 'Reasoning',
  standard: 'Standard',
};
