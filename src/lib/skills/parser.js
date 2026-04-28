// Skill.md parser — handles the optional YAML frontmatter convention
// Anthropic and others have settled on for "skill" knowledge files.
//
// Layout we recognize:
//
//   ---
//   name: My Skill
//   description: One-line summary of what this skill is for.
//   when_to_use: |
//     - When the user asks about X
//     - When debugging Y
//   tags: [foo, bar]
//   version: 1
//   ---
//   # Skill body (Markdown)
//   ...
//
// The frontmatter block is OPTIONAL. Files without it parse to
// `{ frontmatter: {}, body: raw, raw }`, preserving 100% backward
// compatibility with existing user-imported markdown notes.
//
// We hand-roll a minimal YAML reader rather than pull in `js-yaml`
// because the schema is tiny (flat scalar keys + simple lists / block
// strings) and we want zero dependencies in the renderer bundle. If
// users start writing nested YAML we'll graduate to a real parser.

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

// Parse one YAML scalar value. Recognized forms:
//   • plain string    → trim, return as-is
//   • quoted string   → strip outer quotes
//   • [a, b, c]       → array of trimmed strings
//   • true / false / null
//   • number-like     → returned as Number when finite
function parseScalar(s) {
  const v = s.trim();
  if (!v) return '';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  // Quoted string
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  // Inline array
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((p) => parseScalar(p));
  }
  // Number
  if (/^-?\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return v;
}

// Parse YAML frontmatter into a flat object. Supports:
//   key: value                — scalar
//   key: |                    — block scalar (literal newlines preserved)
//     line 1
//     line 2
//   key: >                    — folded scalar (newlines → spaces)
//     line 1 line 2
//   key:                      — list
//     - item 1
//     - item 2
function parseFrontmatter(raw) {
  const out = {};
  const lines = raw.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) { i++; continue; }
    const key = m[1];
    const rest = m[2];

    if (rest === '|' || rest === '>') {
      // Block scalar — collect indented lines until dedent.
      const folded = rest === '>';
      const collected = [];
      i++;
      // Determine indent from the first content line.
      let indent = null;
      while (i < lines.length) {
        const next = lines[i];
        if (!next.trim()) {
          collected.push('');
          i++;
          continue;
        }
        const leadingSpaces = next.match(/^( +)/);
        const ind = leadingSpaces ? leadingSpaces[1].length : 0;
        if (indent == null) {
          if (ind === 0) break; // dedent — block ended
          indent = ind;
        } else if (ind < indent) {
          break;
        }
        collected.push(next.slice(indent));
        i++;
      }
      out[key] = folded
        ? collected.join(' ').replace(/\s+/g, ' ').trim()
        : collected.join('\n').replace(/\n+$/, '');
      continue;
    }

    if (rest === '') {
      // Possibly a list — peek ahead.
      const items = [];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        const lm = /^\s+-\s+(.*)$/.exec(next);
        if (!lm) break;
        items.push(parseScalar(lm[1]));
        i++;
      }
      if (items.length > 0) {
        out[key] = items;
      } else {
        out[key] = '';
      }
      continue;
    }

    out[key] = parseScalar(rest);
    i++;
  }
  return out;
}

// Public API. Returns:
//   { frontmatter, body, raw }
// where `body` is the markdown content with the frontmatter stripped (or
// the original `raw` if no frontmatter was present).
export function parseSkillMarkdown(raw) {
  if (typeof raw !== 'string' || !raw) {
    return { frontmatter: {}, body: '', raw: raw || '' };
  }
  const m = FRONTMATTER_RE.exec(raw);
  if (!m) {
    return { frontmatter: {}, body: raw, raw };
  }
  let frontmatter = {};
  try {
    frontmatter = parseFrontmatter(m[1]);
  } catch {
    // If frontmatter is malformed, keep the original raw as body so
    // the user's content isn't lost.
    return { frontmatter: {}, body: raw, raw };
  }
  return {
    frontmatter,
    body: raw.slice(m[0].length),
    raw,
  };
}

// Build a stable `skill` record from a markdown source. Used by every
// import path (file picker, URL fetch, manual editor) so the metadata
// flow is consistent.
//
// Falls back to:
//   • name        ← frontmatter.name → fallbackName (filename / URL) → 'Untitled'
//   • description ← frontmatter.description → first non-empty body line if it
//                   looks like a one-liner (≤140 chars, no blank line)
export function buildSkillFromMarkdown(raw, fallbackName = 'Untitled') {
  const { frontmatter, body } = parseSkillMarkdown(raw);

  const name =
    (typeof frontmatter.name === 'string' && frontmatter.name.trim()) ||
    fallbackName ||
    'Untitled';

  let description =
    typeof frontmatter.description === 'string' ? frontmatter.description.trim() : '';
  if (!description) {
    // Best-effort: pull a one-line description from the first markdown
    // paragraph if it's short enough to be useful as a tooltip.
    const firstPara = body
      .split(/\r?\n\r?\n/)
      .map((p) => p.trim())
      .find((p) => p.length > 0);
    if (firstPara && firstPara.length <= 140 && !firstPara.startsWith('#')) {
      description = firstPara.replace(/\s+/g, ' ');
    }
  }

  const whenToUse =
    typeof frontmatter.when_to_use === 'string'
      ? frontmatter.when_to_use.trim()
      : Array.isArray(frontmatter.when_to_use)
        ? frontmatter.when_to_use.filter(Boolean).map(String).join('\n')
        : '';

  const tags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags.filter(Boolean).map(String)
    : typeof frontmatter.tags === 'string'
      ? frontmatter.tags.split(/[,\s]+/).filter(Boolean)
      : [];

  return {
    name,
    description,
    whenToUse,
    tags,
    version:
      typeof frontmatter.version === 'string' || typeof frontmatter.version === 'number'
        ? String(frontmatter.version)
        : '',
    content: raw,
  };
}

// Render a tiny "manifest line" describing a skill — used by the agent's
// system-prompt builder so the model gets a one-line summary of every
// loaded skill before the full content sections.
export function skillManifestLine(skill) {
  const parts = [`• **${skill.name}**`];
  if (skill.description) parts.push(`— ${skill.description}`);
  if (skill.whenToUse) {
    const oneLine = skill.whenToUse.replace(/\s+/g, ' ').trim();
    if (oneLine) parts.push(`(用于：${oneLine.slice(0, 120)})`);
  }
  return parts.join(' ');
}
