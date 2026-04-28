// References — opt-in pointers to files / folders / terminal snapshots.
//
// Unlike attachments, reference content is NOT sent to the model up-front.
// The agent reads them on demand by calling the `read_reference` tool, which
// resolves here.
//
// Persistence:
// - `FileSystemFileHandle` and `FileSystemDirectoryHandle` are structured-
//   clonable, so we keep them in IndexedDB keyed by reference id. This means
//   references survive page reloads. Chrome may prompt for permission again
//   the first time we try to read after a reload.
// - Terminal references just store the captured text inline.
//
// Content parsing:
// - Plain text / source code / markdown: decoded as UTF-8 (with fallback).
// - .docx: extracted via `mammoth` (lazy-loaded).
// - .pdf:  extracted via `pdfjs-dist` (lazy-loaded, worker-less mode).
// - Other binary formats: returns a structured hint instead of garbled text.

const DB_NAME = 'arctic-references';
const DB_VERSION = 1;
const STORE = 'handles';

// Size ceilings for tool responses (the model doesn't need megabytes of raw text)
const MAX_TEXT_CHARS = 120_000;
const MAX_DIR_ENTRIES = 300;
const MAX_TERMINAL_CHARS = 32 * 1024;

// ---------------------------------------------------------------------------
// IndexedDB wrapper
// ---------------------------------------------------------------------------

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbPut(record) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* best-effort persistence; ignore quota / unsupported */
  }
}

async function idbDelete(id) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

async function idbGet(id) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// In-memory cache (avoids a round-trip to IDB for freshly-picked references)
// ---------------------------------------------------------------------------

const handleStore = new Map(); // refId → { kind, handle?, text? }

function makeId() {
  return `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function hasFilePickers() {
  return typeof window !== 'undefined'
    && typeof window.showOpenFilePicker === 'function'
    && typeof window.showDirectoryPicker === 'function';
}

// ---------------------------------------------------------------------------
// Public pickers
// ---------------------------------------------------------------------------

/** Pick a single file via the File System Access API, persist its handle. */
export async function pickFileReference() {
  if (!hasFilePickers()) throw new Error('file_picker_not_supported');
  const [handle] = await window.showOpenFilePicker({ multiple: false });
  const file = await handle.getFile();
  const id = makeId();
  const record = { id, kind: 'file', handle };
  handleStore.set(id, record);
  await idbPut(record);
  return {
    id,
    kind: 'file',
    name: file.name,
    size: file.size,
    mimeType: file.type || '',
  };
}

/** Pick a folder via the File System Access API, persist its handle. */
export async function pickFolderReference() {
  if (!hasFilePickers()) throw new Error('folder_picker_not_supported');
  const handle = await window.showDirectoryPicker();
  const id = makeId();
  const record = { id, kind: 'folder', handle };
  handleStore.set(id, record);
  await idbPut(record);
  return {
    id,
    kind: 'folder',
    name: handle.name,
  };
}

/** Capture a terminal output snapshot as a reference (inline text). */
export function addTerminalReference(text) {
  const trimmed = (text || '').slice(0, MAX_TERMINAL_CHARS);
  const id = makeId();
  const record = { id, kind: 'terminal', text: trimmed };
  handleStore.set(id, record);
  idbPut(record); // fire-and-forget
  return {
    id,
    kind: 'terminal',
    name: 'terminal_output',
    size: trimmed.length,
  };
}

/** Forget a reference (both memory + IDB). */
export async function dropReference(refId) {
  handleStore.delete(refId);
  await idbDelete(refId);
}

/**
 * Resolve a reference id to its underlying entry
 * ({ kind: 'file' | 'folder' | 'terminal', handle?, text? }).
 * Used by file-mutation tools (create_file / edit_file / delete_file / ...)
 * to access the authorized FileSystemHandle for a given reference.
 */
export async function getReferenceEntry(refId) {
  let entry = handleStore.get(refId);
  if (entry) return entry;
  const persisted = await idbGet(refId);
  if (persisted) {
    handleStore.set(refId, persisted);
    return persisted;
  }
  return null;
}

/**
 * Ensure readwrite permission on a FileSystemHandle. Returns true on grant.
 * Triggers the browser's permission prompt when necessary.
 */
export async function ensureWritePermission(handle) {
  if (!handle) return false;
  if (handle.queryPermission) {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return true;
    if (handle.requestPermission) {
      const granted = await handle.requestPermission({ mode: 'readwrite' });
      return granted === 'granted';
    }
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Content parsers (lazy-loaded)
// ---------------------------------------------------------------------------

async function parseDocx(file) {
  const mammoth = await import('mammoth/mammoth.browser');
  const arrayBuffer = await file.arrayBuffer();
  const mammothApi = mammoth.default || mammoth;
  const result = await mammothApi.extractRawText({ arrayBuffer });
  return { text: result.value || '', warnings: result.messages || [] };
}

let pdfjsPromise = null;
async function loadPdfjs() {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    const pdfjs = await import('pdfjs-dist');
    try {
      // Vite resolves this ?url import to a hashed static asset
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    } catch {
      // Fallback: run without a worker (slower, but works everywhere)
    }
    return pdfjs;
  })();
  return pdfjsPromise;
}

async function parsePdf(file) {
  const pdfjs = await loadPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const doc = await loadingTask.promise;
  const pageTexts = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((it) => ('str' in it ? it.str : ''));
    pageTexts.push(strings.join(' '));
    if (pageTexts.join('\n').length >= MAX_TEXT_CHARS) break;
  }
  return { text: pageTexts.join('\n\n'), pageCount: doc.numPages };
}

// Heuristic: treat anything with a text-ish MIME, common code/markup/plain
// extension, or no extension, as plain text. Everything else → format-specific
// parser or a structured "unsupported" hint.
const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'rst', 'log', 'csv', 'tsv', 'json', 'yaml', 'yml',
  'toml', 'ini', 'xml', 'html', 'htm', 'svg', 'css', 'scss', 'less',
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java',
  'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'swift', 'php', 'lua', 'sh', 'bash',
  'zsh', 'fish', 'sql', 'r', 'm', 'dart', 'scala', 'clj', 'ex', 'exs',
  'env', 'gitignore', 'dockerfile', 'makefile', 'lock',
]);

function extOf(name) {
  const m = /\.([^.]+)$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}

async function decodeTextBlob(blob) {
  const buf = await blob.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

async function readFileContent(file) {
  const ext = extOf(file.name);
  const mime = file.type || '';

  if (ext === 'docx') {
    const { text, warnings } = await parseDocx(file);
    return {
      content: text.slice(0, MAX_TEXT_CHARS),
      truncated: text.length > MAX_TEXT_CHARS,
      parser: 'mammoth',
      warnings: warnings.slice(0, 5).map((w) => w.message || String(w)),
    };
  }

  if (ext === 'pdf') {
    const { text, pageCount } = await parsePdf(file);
    return {
      content: text.slice(0, MAX_TEXT_CHARS),
      truncated: text.length > MAX_TEXT_CHARS,
      parser: 'pdfjs',
      pageCount,
    };
  }

  // .doc (old binary Word) — not supported without heavier parsers
  if (ext === 'doc') {
    return {
      error:
        '旧版 .doc 格式不被支持，请用户将文件另存为 .docx 或 .pdf 后重新引用。',
    };
  }

  const looksTextual =
    TEXT_EXTS.has(ext) ||
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/javascript';

  if (looksTextual) {
    const content = await decodeTextBlob(file);
    return {
      content: content.slice(0, MAX_TEXT_CHARS),
      truncated: content.length > MAX_TEXT_CHARS,
      parser: 'text',
    };
  }

  return {
    error: `不支持的二进制文件类型（${mime || ext || 'unknown'}）。支持：纯文本 / 源代码 / Markdown / .docx / .pdf`,
  };
}

// ---------------------------------------------------------------------------
// Agent-facing: read a reference by id
// ---------------------------------------------------------------------------

async function ensureReadPermission(handle) {
  if (!handle) return false;
  if (handle.queryPermission) {
    const perm = await handle.queryPermission({ mode: 'read' });
    if (perm === 'granted') return true;
    if (handle.requestPermission) {
      const granted = await handle.requestPermission({ mode: 'read' });
      return granted === 'granted';
    }
    return false;
  }
  return true;
}

async function loadEntry(refId) {
  let entry = handleStore.get(refId);
  if (entry) return entry;
  const persisted = await idbGet(refId);
  if (persisted) {
    handleStore.set(refId, persisted);
    return persisted;
  }
  return null;
}

export async function readReference(refId) {
  const entry = await loadEntry(refId);
  if (!entry) {
    return { ok: false, error: '引用未找到，可能已经被移除。请让用户重新引用该资源。' };
  }

  if (entry.kind === 'terminal') {
    return { ok: true, kind: 'terminal', content: entry.text || '', truncated: false };
  }

  if (entry.kind === 'file') {
    try {
      const granted = await ensureReadPermission(entry.handle);
      if (!granted) return { ok: false, error: '用户拒绝了读取权限' };
      const file = await entry.handle.getFile();
      const parsed = await readFileContent(file);
      if (parsed.error) return { ok: false, error: parsed.error, name: file.name };
      return {
        ok: true,
        kind: 'file',
        name: file.name,
        size: file.size,
        mimeType: file.type || '',
        ...parsed,
      };
    } catch (err) {
      return { ok: false, error: `读取文件失败: ${err.message || String(err)}` };
    }
  }

  if (entry.kind === 'folder') {
    try {
      const granted = await ensureReadPermission(entry.handle);
      if (!granted) return { ok: false, error: '用户拒绝了读取权限' };
      const entries = [];
      for await (const child of entry.handle.values()) {
        entries.push({ name: child.name, kind: child.kind });
        if (entries.length >= MAX_DIR_ENTRIES) break;
      }
      return {
        ok: true,
        kind: 'folder',
        name: entry.handle.name,
        entries,
        truncated: entries.length >= MAX_DIR_ENTRIES,
      };
    } catch (err) {
      return { ok: false, error: `读取文件夹失败: ${err.message || String(err)}` };
    }
  }

  return { ok: false, error: '未知的引用类型' };
}
