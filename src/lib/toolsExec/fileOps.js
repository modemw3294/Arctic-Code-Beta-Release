// File-system mutation tools.
//
// All operations are scoped to a user-authorized reference (file or folder
// picked via the File System Access API). The reference id is the agent's
// only way to address a path on disk — we NEVER accept absolute paths from
// the model.
//
// Each public function returns a plain { ok, ... } object so tool runners
// can forward the result straight back to the model.

import { getReferenceEntry, ensureWritePermission } from "../references";
import { parseRelativePath, getNativePath } from "./pathHelpers";

// Maximum bytes we let the model write in a single call. Keeps a
// runaway / confused agent from filling the disk.
const MAX_WRITE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_READ_BYTES = 2 * 1024 * 1024;

// Quick line-level diff used to show "+N -M" badges on edit_file and
// create_file results. Trims the longest common prefix and suffix and
// counts the remaining changed region from each side. Not a true Myers
// LCS diff (it overcounts when lines move within the changed region),
// but accurate for the common contiguous-edit case and O(n+m) cheap.
function quickLineDiff(oldStr, newStr) {
  const oldLines = (oldStr || "").split("\n");
  const newLines = (newStr || "").split("\n");
  const oLen = oldLines.length;
  const nLen = newLines.length;
  let prefix = 0;
  while (prefix < oLen && prefix < nLen && oldLines[prefix] === newLines[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < oLen - prefix &&
    suffix < nLen - prefix &&
    oldLines[oLen - 1 - suffix] === newLines[nLen - 1 - suffix]
  ) {
    suffix++;
  }
  const removed = Math.max(0, oLen - prefix - suffix);
  const added = Math.max(0, nLen - prefix - suffix);
  return { added, removed, totalLines: nLen };
}

// Walk directory segments, optionally creating intermediate dirs.
async function traverseDir(rootHandle, segments, { create } = {}) {
  let dir = rootHandle;
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg, { create: !!create });
  }
  return dir;
}

async function resolveFolderRef(folderRefId) {
  const entry = await getReferenceEntry(folderRefId);
  if (!entry) return { error: "reference not found" };
  if (entry.kind !== "folder") return { error: "reference is not a folder" };
  const granted = await ensureWritePermission(entry.handle);
  if (!granted) return { error: "write permission denied by user" };
  return { handle: entry.handle };
}

async function resolveFileRef(fileRefId) {
  const entry = await getReferenceEntry(fileRefId);
  if (!entry) return { error: "reference not found" };
  if (entry.kind !== "file") return { error: "reference is not a file" };
  const granted = await ensureWritePermission(entry.handle);
  if (!granted) return { error: "write permission denied by user" };
  return { handle: entry.handle };
}

// ---------- read_file ------------------------------------------------------

// Hard cap on lines returned per call. Even when start_line / end_line
// are unspecified we slice past this to keep one tool result from
// blowing the context window. The model is told about this in the
// schema and gets `truncated: true` in the response so it can paginate.
const MAX_READ_LINES = 2000;

export async function readFile({ path, projectPath, start_line, end_line }) {
  if (!projectPath || !window.arcticAPI?.fsReadFile) {
    return {
      ok: false,
      error: "read_file is only available in Electron with an active workspace",
    };
  }
  const parsed = parseRelativePath(path);
  if (parsed.error) return { ok: false, error: parsed.error };
  const fullPath = getNativePath(projectPath, parsed.segments);
  const result = await window.arcticAPI.fsReadFile({ filePath: fullPath });
  if (!result.ok) return result;

  // Byte-cap guard. Without start_line, we'd refuse outright (legacy
  // behavior). With a line range, oversized files are still readable
  // because the slicing below trims the buffer before we measure.
  const bytes = new Blob([result.content]).size;
  const hasRange = start_line != null || end_line != null;
  if (!hasRange && bytes > MAX_READ_BYTES) {
    return {
      ok: false,
      error:
        `content exceeds ${MAX_READ_BYTES} bytes; pass start_line / end_line to read a slice`,
    };
  }

  // ---- Line slicing ----
  // We split on /\r?\n/ to be cross-platform and preserve the original
  // newline style in joined output by re-using \n (good enough for LLM
  // consumption — the model doesn't care about CRLF vs LF). totalLines
  // is the human-meaningful count; trailing empty line from a final \n
  // is dropped.
  const fullText = result.content || "";
  const allLines = fullText.split(/\r?\n/);
  // A trailing newline produces an empty final segment we don't want
  // to count or return.
  if (allLines.length > 0 && allLines[allLines.length - 1] === "") {
    allLines.pop();
  }
  const totalLines = allLines.length;

  // Normalize the range: 1-indexed, inclusive, clamped to [1, totalLines].
  // Defaults: start=1, end=start + MAX_READ_LINES - 1 (or totalLines).
  let start = Number.isInteger(start_line) ? start_line : 1;
  let end = Number.isInteger(end_line) ? end_line : totalLines;
  if (start < 1) start = 1;
  if (end > totalLines) end = totalLines;
  if (end < start) {
    return {
      ok: false,
      error: `end_line (${end_line}) is less than start_line (${start_line})`,
    };
  }

  // Apply the hard line cap on top of the user-requested range.
  let truncated = false;
  if (end - start + 1 > MAX_READ_LINES) {
    end = start + MAX_READ_LINES - 1;
    truncated = true;
  }

  // Slice and rejoin. Empty file edge case: totalLines=0 → return "".
  const sliced =
    totalLines === 0 ? "" : allLines.slice(start - 1, end).join("\n");

  return {
    ok: true,
    content: sliced,
    total_lines: totalLines,
    start_line: totalLines === 0 ? 0 : start,
    end_line: totalLines === 0 ? 0 : end,
    truncated,
  };
}

// ---------- create_file ----------------------------------------------------

export async function createFile({
  folder_reference_id,
  path,
  content,
  overwrite,
  projectPath,
}) {
  if (typeof content !== "string") {
    return { ok: false, error: "content must be a string" };
  }
  if (new Blob([content]).size > MAX_WRITE_BYTES) {
    return { ok: false, error: `content exceeds ${MAX_WRITE_BYTES} bytes` };
  }
  const parsed = parseRelativePath(path);
  if (parsed.error) return { ok: false, error: parsed.error };

  // Native flow
  if (projectPath && window.arcticAPI?.fsWriteFile) {
    const fullPath = getNativePath(projectPath, parsed.segments);
    if (!overwrite) {
      const check = await window.arcticAPI.fsReadFile({ filePath: fullPath });
      if (check.ok)
        return {
          ok: false,
          error: "file already exists; set overwrite=true to replace",
        };
    }
    const result = await window.arcticAPI.fsWriteFile({
      filePath: fullPath,
      content,
    });
    if (!result.ok) return result;
    return {
      ok: true,
      path: parsed.segments.join("/"),
      bytes: new Blob([content]).size,
      linesAdded: content.split("\n").length,
      linesRemoved: 0,
      totalLines: content.split("\n").length,
    };
  }

  // File System Access API flow
  if (!folder_reference_id)
    return { ok: false, error: "folder_reference_id or workspace is required" };
  const folder = await resolveFolderRef(folder_reference_id);
  if (folder.error) return { ok: false, error: folder.error };

  const fileName = parsed.segments.pop();
  try {
    const dir = await traverseDir(folder.handle, parsed.segments, {
      create: true,
    });
    // Reject if file already exists, unless overwrite is true.
    if (!overwrite) {
      try {
        await dir.getFileHandle(fileName, { create: false });
        return {
          ok: false,
          error: "file already exists; set overwrite=true to replace",
        };
      } catch {
        // NotFoundError — good, we can create it.
      }
    }
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return {
      ok: true,
      path: [...parsed.segments, fileName].join("/"),
      bytes: new Blob([content]).size,
      linesAdded: content.split("\n").length,
      linesRemoved: 0,
      totalLines: content.split("\n").length,
    };
  } catch (err) {
    return { ok: false, error: `create_file failed: ${err?.message || err}` };
  }
}

// ---------- create_folder --------------------------------------------------

export async function createFolder({ folder_reference_id, path, projectPath }) {
  const parsed = parseRelativePath(path);
  if (parsed.error) return { ok: false, error: parsed.error };

  if (projectPath && window.arcticAPI?.fsCreateFolder) {
    const fullPath = getNativePath(projectPath, parsed.segments);
    const result = await window.arcticAPI.fsCreateFolder({
      folderPath: fullPath,
    });
    if (!result.ok) return result;
    return { ok: true, path: parsed.segments.join("/") };
  }

  if (!folder_reference_id)
    return { ok: false, error: "folder_reference_id or workspace is required" };
  const folder = await resolveFolderRef(folder_reference_id);
  if (folder.error) return { ok: false, error: folder.error };

  try {
    await traverseDir(folder.handle, parsed.segments, { create: true });
    return { ok: true, path: parsed.segments.join("/") };
  } catch (err) {
    return { ok: false, error: `create_folder failed: ${err?.message || err}` };
  }
}

// ---------- edit_file ------------------------------------------------------

export async function editFile({
  reference_id,
  folder_reference_id,
  path,
  content,
  projectPath,
}) {
  if (typeof content !== "string") {
    return { ok: false, error: "content must be a string" };
  }
  if (new Blob([content]).size > MAX_WRITE_BYTES) {
    return { ok: false, error: `content exceeds ${MAX_WRITE_BYTES} bytes` };
  }

  if (projectPath && path && window.arcticAPI?.fsWriteFile) {
    const parsed = parseRelativePath(path);
    if (parsed.error) return { ok: false, error: parsed.error };
    const fullPath = getNativePath(projectPath, parsed.segments);
    // Read old content first (best-effort) so we can return a line-diff
    // for the UI badge. If the file doesn't exist yet, treat it as empty.
    let oldContent = "";
    if (window.arcticAPI?.fsReadFile) {
      const prev = await window.arcticAPI.fsReadFile({ filePath: fullPath });
      if (prev?.ok && typeof prev.content === "string") oldContent = prev.content;
    }
    const result = await window.arcticAPI.fsWriteFile({
      filePath: fullPath,
      content,
    });
    if (!result.ok) return result;
    const diff = quickLineDiff(oldContent, content);
    return {
      ok: true,
      path: parsed.segments.join("/"),
      bytes: new Blob([content]).size,
      linesAdded: diff.added,
      linesRemoved: diff.removed,
      totalLines: diff.totalLines,
    };
  }

  if (folder_reference_id) {
    const parsed = parseRelativePath(path);
    if (parsed.error) return { ok: false, error: parsed.error };
    const folder = await resolveFolderRef(folder_reference_id);
    if (folder.error) return { ok: false, error: folder.error };
    const fileName = parsed.segments.pop();
    try {
      const dir = await traverseDir(folder.handle, parsed.segments, {
        create: false,
      });
      const fileHandle = await dir.getFileHandle(fileName, { create: false });
      let oldContent = "";
      try {
        const file = await fileHandle.getFile();
        oldContent = await file.text();
      } catch {
        /* unreadable previous content — treat as empty */
      }
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      const diff = quickLineDiff(oldContent, content);
      return {
        ok: true,
        path: [...parsed.segments, fileName].join("/"),
        bytes: new Blob([content]).size,
        linesAdded: diff.added,
        linesRemoved: diff.removed,
        totalLines: diff.totalLines,
      };
    } catch (err) {
      return { ok: false, error: `edit_file failed: ${err?.message || err}` };
    }
  }

  if (reference_id) {
    const fileRef = await resolveFileRef(reference_id);
    if (fileRef.error) return { ok: false, error: fileRef.error };
    try {
      let oldContent = "";
      try {
        const file = await fileRef.handle.getFile();
        oldContent = await file.text();
      } catch {
        /* unreadable previous content — treat as empty */
      }
      const writable = await fileRef.handle.createWritable();
      await writable.write(content);
      await writable.close();
      const diff = quickLineDiff(oldContent, content);
      return {
        ok: true,
        name: fileRef.handle.name,
        bytes: new Blob([content]).size,
        linesAdded: diff.added,
        linesRemoved: diff.removed,
        totalLines: diff.totalLines,
      };
    } catch (err) {
      return { ok: false, error: `edit_file failed: ${err?.message || err}` };
    }
  }

  return {
    ok: false,
    error:
      "either path (with active workspace), reference_id, or folder_reference_id + path is required",
  };
}

// ---------- delete_file ----------------------------------------------------

export async function deleteFile({
  reference_id,
  folder_reference_id,
  path,
  recursive,
  projectPath,
}) {
  if (projectPath && path && window.arcticAPI?.fsDeleteFile) {
    const parsed = parseRelativePath(path);
    if (parsed.error) return { ok: false, error: parsed.error };
    const fullPath = getNativePath(projectPath, parsed.segments);
    const result = await window.arcticAPI.fsDeleteFile({
      filePath: fullPath,
      recursive,
    });
    if (!result.ok) return result;
    return { ok: true, path: parsed.segments.join("/"), removed: true };
  }

  if (folder_reference_id) {
    const parsed = parseRelativePath(path);
    if (parsed.error) return { ok: false, error: parsed.error };
    const folder = await resolveFolderRef(folder_reference_id);
    if (folder.error) return { ok: false, error: folder.error };
    const name = parsed.segments.pop();
    try {
      const dir = await traverseDir(folder.handle, parsed.segments, {
        create: false,
      });
      await dir.removeEntry(name, { recursive: !!recursive });
      return {
        ok: true,
        path: [...parsed.segments, name].join("/"),
        removed: true,
      };
    } catch (err) {
      return { ok: false, error: `delete_file failed: ${err?.message || err}` };
    }
  }

  if (reference_id) {
    const fileRef = await resolveFileRef(reference_id);
    if (fileRef.error) return { ok: false, error: fileRef.error };
    try {
      const writable = await fileRef.handle.createWritable();
      await writable.truncate(0);
      await writable.close();
      return {
        ok: true,
        name: fileRef.handle.name,
        removed: false,
        truncated: true,
        note: "Only file contents were cleared. To fully remove the file, reference its parent folder and call delete_file with folder_reference_id + path.",
      };
    } catch (err) {
      return { ok: false, error: `delete_file failed: ${err?.message || err}` };
    }
  }

  return {
    ok: false,
    error:
      "either path (with active workspace), reference_id, or folder_reference_id + path is required",
  };
}

// ---------- search_replace -------------------------------------------------
//
// Surgical edit: replace exactly ONE occurrence of `old_string` with
// `new_string` (or all occurrences when `replace_all` is true).
//
// Why force "exactly one match" by default? Because the model often
// uses small, ambiguous snippets as anchors. If the snippet appears
// twice, it can't tell WHICH instance to edit and silently nuking
// the wrong one is a real footgun. Requiring uniqueness forces the
// model to widen its anchor (include surrounding context) — and the
// resulting edit becomes verifiable just by inspecting old_string.

export async function searchReplace({
  reference_id,
  folder_reference_id,
  path,
  old_string,
  new_string,
  replace_all,
  projectPath,
}) {
  if (typeof old_string !== "string" || old_string.length === 0) {
    return { ok: false, error: "old_string is required and must be non-empty" };
  }
  if (typeof new_string !== "string") {
    return { ok: false, error: "new_string is required" };
  }
  if (old_string === new_string) {
    return { ok: false, error: "old_string and new_string are identical (no-op)" };
  }

  // Read the file via whichever transport is available.
  let oldContent = "";
  let writeBack = null; // async (newContent) => result
  let displayPath = "";

  // Native Electron flow (workspace path).
  if (projectPath && path && window.arcticAPI?.fsReadFile && window.arcticAPI?.fsWriteFile) {
    const parsed = parseRelativePath(path);
    if (parsed.error) return { ok: false, error: parsed.error };
    const fullPath = getNativePath(projectPath, parsed.segments);
    const r = await window.arcticAPI.fsReadFile({ filePath: fullPath });
    if (!r.ok) return { ok: false, error: `failed to read file: ${r.error}` };
    oldContent = r.content || "";
    displayPath = parsed.segments.join("/");
    writeBack = (content) =>
      window.arcticAPI.fsWriteFile({ filePath: fullPath, content });
  }
  // FSAA folder ref + relative path.
  else if (folder_reference_id && path) {
    const parsed = parseRelativePath(path);
    if (parsed.error) return { ok: false, error: parsed.error };
    const folder = await resolveFolderRef(folder_reference_id);
    if (folder.error) return { ok: false, error: folder.error };
    const fileName = parsed.segments[parsed.segments.length - 1];
    const dirSegs = parsed.segments.slice(0, -1);
    try {
      const dir = await traverseDir(folder.handle, dirSegs, { create: false });
      const fileHandle = await dir.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      oldContent = await file.text();
      displayPath = parsed.segments.join("/");
      writeBack = async (content) => {
        const w = await fileHandle.createWritable();
        await w.write(content);
        await w.close();
        return { ok: true };
      };
    } catch (err) {
      return { ok: false, error: `failed to open file: ${err?.message || err}` };
    }
  }
  // FSAA single-file ref.
  else if (reference_id) {
    const fileRef = await resolveFileRef(reference_id);
    if (fileRef.error) return { ok: false, error: fileRef.error };
    try {
      const file = await fileRef.handle.getFile();
      oldContent = await file.text();
      displayPath = fileRef.handle.name;
      writeBack = async (content) => {
        const w = await fileRef.handle.createWritable();
        await w.write(content);
        await w.close();
        return { ok: true };
      };
    } catch (err) {
      return { ok: false, error: `failed to open file: ${err?.message || err}` };
    }
  } else {
    return {
      ok: false,
      error:
        "either path (with active workspace), reference_id, or folder_reference_id + path is required",
    };
  }

  // Count occurrences via repeated split — O(n) and avoids regex
  // escaping pitfalls on multi-line strings.
  const parts = oldContent.split(old_string);
  const occurrences = parts.length - 1;
  if (occurrences === 0) {
    return {
      ok: false,
      error:
        "old_string was not found in the file. Check whitespace / line endings, or read_file first to see exact contents.",
    };
  }
  if (occurrences > 1 && !replace_all) {
    return {
      ok: false,
      error: `old_string is ambiguous: ${occurrences} matches found. Either widen old_string with surrounding context until it's unique, or set replace_all=true.`,
      occurrences,
    };
  }

  const newContent = replace_all
    ? parts.join(new_string)
    : parts[0] + new_string + parts.slice(1).join(old_string);

  if (new Blob([newContent]).size > MAX_WRITE_BYTES) {
    return { ok: false, error: `resulting content exceeds ${MAX_WRITE_BYTES} bytes` };
  }

  const wr = await writeBack(newContent);
  if (!wr.ok) return { ok: false, error: wr.error || "write failed" };

  const diff = quickLineDiff(oldContent, newContent);
  return {
    ok: true,
    path: displayPath,
    replacements: replace_all ? occurrences : 1,
    bytes: new Blob([newContent]).size,
    linesAdded: diff.added,
    linesRemoved: diff.removed,
    totalLines: diff.totalLines,
  };
}
