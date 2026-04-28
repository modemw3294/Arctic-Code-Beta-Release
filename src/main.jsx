import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
// KaTeX stylesheet — required for the LaTeX math rendering produced by
// rehype-katex. Imported once at the entry so every <ReactMarkdown>
// instance picks it up automatically.
import 'katex/dist/katex.min.css';
// highlight.js base theme — provides token colours for the .hljs-*
// classes injected by rehype-highlight. Picked github-style for light
// themes; the modern-plus dark variants are nudged via overrides in
// index.css's `[data-theme='modern-dark']` block.
import 'highlight.js/styles/github.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
