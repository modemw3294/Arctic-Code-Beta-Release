// Phase-2 workspace browsing / search / move / copy.
//
// All five tools require an active workspace (projectPath) AND the Electron
// IPC bridge — the renderer-side reference (FSAA) flow does not have an
// efficient recursive scan, so these are deliberately Electron-only. In a
// pure browser tab the model just gets a "not available" error and falls
// back to the existing FSAA-based read tools.
//
// Each function returns `{ ok, ... }` so the tool runner can forward the
// payload straight to the model.

import {
  parseRelativePath,
  parseRelativePathOrRoot,
  getNativePath,
} from "./pathHelpers";

function ensureElectron(api) {
  if (!api) {
    return {
      ok: false,
      error:
        "this tool requires the Electron client with an active workspace",
    };
  }
  return null;
}

// ---------- list_directory ----------------------------------------------

export async function listDirectory({ path: relPath, max_entries, projectPath }) {
  const fail = ensureElectron(projectPath && window.arcticAPI?.fsList);
  if (fail) return fail;
  const parsed = parseRelativePathOrRoot(relPath);
  if (parsed.error) return { ok: false, error: parsed.error };
  const dirPath = getNativePath(projectPath, parsed.segments);
  const result = await window.arcticAPI.fsList({
    dirPath,
    maxEntries: clampInt(max_entries, 1, 2000, 500),
  });
  if (!result.ok) return result;
  return {
    ok: true,
    path: parsed.segments.join("/") || ".",
    entries: result.entries,
    truncated: result.truncated,
  };
}

// ---------- find_files --------------------------------------------------

export async function findFiles({
  pattern,
  path: relPath,
  max_results,
  projectPath,
}) {
  const fail = ensureElectron(projectPath && window.arcticAPI?.fsFind);
  if (fail) return fail;
  if (typeof pattern !== "string" || !pattern.trim()) {
    return { ok: false, error: "pattern is required (e.g. **/*.test.js)" };
  }
  const parsed = parseRelativePathOrRoot(relPath);
  if (parsed.error) return { ok: false, error: parsed.error };
  const rootPath = getNativePath(projectPath, parsed.segments);
  const result = await window.arcticAPI.fsFind({
    rootPath,
    pattern: pattern.trim(),
    maxResults: clampInt(max_results, 1, 2000, 500),
  });
  return result;
}

// ---------- grep_files --------------------------------------------------

export async function grepFiles({
  query,
  path: relPath,
  file_pattern,
  case_sensitive,
  regex,
  max_matches,
  projectPath,
}) {
  const fail = ensureElectron(projectPath && window.arcticAPI?.fsGrep);
  if (fail) return fail;
  if (typeof query !== "string" || query.length === 0) {
    return { ok: false, error: "query is required" };
  }
  const parsed = parseRelativePathOrRoot(relPath);
  if (parsed.error) return { ok: false, error: parsed.error };
  const rootPath = getNativePath(projectPath, parsed.segments);
  const result = await window.arcticAPI.fsGrep({
    rootPath,
    query,
    regex: !!regex,
    filePattern: file_pattern || null,
    caseSensitive: !!case_sensitive,
    maxMatches: clampInt(max_matches, 1, 1000, 200),
  });
  return result;
}

// ---------- move_file ---------------------------------------------------

export async function moveFile({ from_path, to_path, projectPath }) {
  const fail = ensureElectron(projectPath && window.arcticAPI?.fsMove);
  if (fail) return fail;
  const fromParsed = parseRelativePath(from_path);
  if (fromParsed.error) return { ok: false, error: `from_path: ${fromParsed.error}` };
  const toParsed = parseRelativePath(to_path);
  if (toParsed.error) return { ok: false, error: `to_path: ${toParsed.error}` };
  const result = await window.arcticAPI.fsMove({
    fromPath: getNativePath(projectPath, fromParsed.segments),
    toPath: getNativePath(projectPath, toParsed.segments),
  });
  if (!result.ok) return result;
  return {
    ok: true,
    from: fromParsed.segments.join("/"),
    to: toParsed.segments.join("/"),
  };
}

// ---------- copy_file ---------------------------------------------------

export async function copyFile({ from_path, to_path, overwrite, projectPath }) {
  const fail = ensureElectron(projectPath && window.arcticAPI?.fsCopy);
  if (fail) return fail;
  const fromParsed = parseRelativePath(from_path);
  if (fromParsed.error) return { ok: false, error: `from_path: ${fromParsed.error}` };
  const toParsed = parseRelativePath(to_path);
  if (toParsed.error) return { ok: false, error: `to_path: ${toParsed.error}` };
  const result = await window.arcticAPI.fsCopy({
    fromPath: getNativePath(projectPath, fromParsed.segments),
    toPath: getNativePath(projectPath, toParsed.segments),
    overwrite: !!overwrite,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    from: fromParsed.segments.join("/"),
    to: toParsed.segments.join("/"),
    bytes: result.bytes,
    isDirectory: result.isDirectory || false,
  };
}

// ---------- helpers -----------------------------------------------------

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
