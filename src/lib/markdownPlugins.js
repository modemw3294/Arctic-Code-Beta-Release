// Shared remark/rehype plugin arrays for every <ReactMarkdown> in the
// app. Centralized so adding a new plugin (math, code highlighting, etc.)
// is a one-file change instead of hunting down all call sites.
//
// Math syntax supported (via remark-math + rehype-katex):
//   - Inline: $E = mc^2$        or  \(E = mc^2\)
//   - Display:
//       $$
//       \int_0^\infty e^{-x^2}\,dx = \tfrac{\sqrt{\pi}}{2}
//       $$
//     or  \[ ... \]
//
// rehype-katex throws on syntax errors by default, which would crash
// the whole markdown render and replace the message with an error box.
// We pass `strict: 'ignore'` + `throwOnError: false` so a malformed
// formula renders as a small red snippet instead of nuking the bubble.

import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";

export const REMARK_PLUGINS = [remarkGfm, remarkMath];

export const REHYPE_PLUGINS = [
  [
    rehypeKatex,
    {
      strict: "ignore",
      throwOnError: false,
      // Slightly larger fallback rendering so the formula doesn't look
      // tiny next to surrounding 14px body text.
      output: "html",
    },
  ],
  // Syntax highlighting for fenced code blocks. `detect: true` lets the
  // plugin sniff the language when the fence has no `lang` tag, which is
  // common in model output. `ignoreMissing: true` keeps render going if
  // someone writes ```fakelang``` instead of crashing the whole bubble.
  [
    rehypeHighlight,
    {
      detect: true,
      ignoreMissing: true,
    },
  ],
];
