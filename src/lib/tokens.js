// Rough token estimator — cheap heuristic that avoids shipping a tokenizer.
//
// Strategy:
// - ASCII / Latin text: ~4 chars per token (GPT-family average).
// - CJK chars: ~1 token each (slightly conservative).
// - Everything else counted as ASCII.
//
// The estimate is meant for UI budgeting (the context bar), not for
// billing-accurate counts. Real tokenization happens server-side.

const CJK_RE = /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g;

export function estimateTokens(text) {
  if (!text) return 0;
  const s = String(text);
  const cjkMatches = s.match(CJK_RE);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const otherChars = s.length - cjkCount;
  return Math.ceil(cjkCount + otherChars / 4);
}

/** Serialize an OpenAI-shape message to text for a token estimate. */
export function estimateMessageTokens(message) {
  if (!message) return 0;
  const { content } = message;
  if (typeof content === 'string') return estimateTokens(content) + 4;
  if (Array.isArray(content)) {
    let total = 4;
    for (const part of content) {
      if (!part) continue;
      if (part.type === 'text') total += estimateTokens(part.text || '');
      // Images/audio: rough fixed budget per part (provider-dependent)
      else if (part.type === 'image_url') total += 800;
      else if (part.type === 'input_audio') total += 1500;
    }
    return total;
  }
  return 4;
}
