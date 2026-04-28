// Provider-native web-search tool specs.
//
// When the user selects 「模型调用」 as their web_search provider, the
// subagent needs a way to actually reach the web. fetch_url is always
// there as a baseline, but many models expose cheaper / smarter native
// grounding tools (Google's google_search, Anthropic's web_search, etc.)
// that we should opportunistically pass through.
//
// Each provider's OpenAI-compat layer accepts these as NON-function tool
// entries in the `tools` array. Unknown providers get an empty list —
// the subagent falls back to fetch_url-only mode.
//
// Caveats:
//   - These shapes match the native-provider flavor, not pure OpenAI
//     chat-completion syntax. Most providers' OpenAI-compat layers are
//     lenient enough to pass these through untouched.
//   - If a provider rejects the extra entry, the subagent call will 400;
//     the web_search runner already catches that and falls back to raw
//     SERP mode. So a failed injection degrades but doesn't crash.

import { getProviderForModel } from '../providerRouting';

export function buildNativeSearchTools(modelId) {
  const providerId = getProviderForModel(modelId);
  switch (providerId) {
    case 'google':
      // Google Gemini native grounding tool. Passed as a bare object
      // alongside the OpenAI-style function tools — the compat layer
      // recognizes it and enables google_search grounding.
      return [{ google_search: {} }];
    case 'anthropic':
      // Claude's native web search (supported on Sonnet 4+ / Opus 4+).
      // max_uses caps the number of searches per request.
      return [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
      }];
    case 'openai':
      // OpenAI's web_search tool is only available on the Responses API
      // (/v1/responses), not on /v1/chat/completions. We don't inject
      // it here — the subagent uses fetch_url only on OpenAI.
      return [];
    default:
      return [];
  }
}
