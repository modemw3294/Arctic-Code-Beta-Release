// Cross-platform path helpers shared across all renderer-side file tool
// implementations. Two non-negotiables:
//
//   1. The model NEVER passes absolute paths or traversal segments —
//      `parseRelativePath` rejects both. This is the first line of defense;
//      the main-process sandbox is the second.
//   2. Cross-platform separator handling: derived from the projectPath
//      (whichever the OS gave us via dialog.showOpenDialog) so we don't
//      assume `/` and break Windows.

/**
 * Split a relative path string into clean segments. Rejects:
 *   - empty / non-string input
 *   - absolute paths (POSIX `/foo` or Windows `C:\foo`)
 *   - traversal segments (`..` / `.`)
 *
 * Returns `{ segments }` on success or `{ error }` on rejection.
 */
export function parseRelativePath(p) {
  if (typeof p !== "string") return { error: "path must be a string" };
  const trimmed = p.trim().replace(/^\/+/, "");
  if (!trimmed) return { error: "path is required" };
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("/")) {
    return { error: "absolute paths are not allowed" };
  }
  const segments = trimmed.split(/[\\/]+/).filter(Boolean);
  if (segments.length === 0) return { error: "path is required" };
  for (const seg of segments) {
    if (seg === "." || seg === "..") {
      return { error: "path traversal (.. / .) is not allowed" };
    }
  }
  return { segments };
}

/**
 * Same as parseRelativePath but accepts an empty string or "." to mean
 * "the workspace root itself". Used by list_directory / find_files /
 * grep_files where omitting `path` means "search from root".
 */
export function parseRelativePathOrRoot(p) {
  if (p === undefined || p === null || p === "" || p === ".") {
    return { segments: [] };
  }
  return parseRelativePath(p);
}

/**
 * Build an absolute path from a workspace root + relative segments.
 * Separator is derived from the workspace root so Windows users get `\`
 * and POSIX users get `/`. If `segments` is empty, returns `projectPath`
 * itself (with its trailing separator stripped).
 */
export function getNativePath(projectPath, segments) {
  const sep = projectPath.includes("\\") ? "\\" : "/";
  const root = projectPath.replace(/[\\/]+$/, "");
  if (!segments || segments.length === 0) return root;
  return root + sep + segments.join(sep);
}
