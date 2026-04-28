import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  shell,
  dialog,
  clipboard,
  net,
} from "electron";
import { exec, spawn } from "child_process";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#FFFFFF",
    icon: path.join(__dirname, "../src/assets/arctic-code-logo.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    show: false,
  });

  // Graceful show
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Load Vite dev server or built files
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// ─── macOS Application Menu ────────────────────────────────────────────
// Builds a native macOS menu bar so the user gets the standard
// Arctic Code / File / Edit / View / Window / Help structure instead
// of Electron's default. Most items emit IPC events the renderer
// listens to (settings open, new chat, etc.) so the underlying logic
// stays in React-land.
function buildAppMenu() {
  const isMac = process.platform === "darwin";
  const sendToRenderer = (channel) => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel);
    }
  };

  const template = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name || "Arctic Code",
            submenu: [
              { role: "about", label: "关于 Arctic Code" },
              { type: "separator" },
              {
                label: "偏好设置…",
                accelerator: "Cmd+,",
                click: () => sendToRenderer("menu:openSettings"),
              },
              { type: "separator" },
              { role: "services", label: "服务" },
              { type: "separator" },
              { role: "hide", label: "隐藏 Arctic Code" },
              { role: "hideOthers", label: "隐藏其他" },
              { role: "unhide", label: "全部显示" },
              { type: "separator" },
              { role: "quit", label: "退出 Arctic Code" },
            ],
          },
        ]
      : []),
    // File menu
    {
      label: "文件",
      submenu: [
        {
          label: "新建对话",
          accelerator: isMac ? "Cmd+N" : "Ctrl+N",
          click: () => sendToRenderer("menu:newChat"),
        },
        {
          label: "新建技能…",
          accelerator: isMac ? "Cmd+Shift+N" : "Ctrl+Shift+N",
          click: () => sendToRenderer("menu:newSkill"),
        },
        { type: "separator" },
        {
          label: "打开工作区…",
          accelerator: isMac ? "Cmd+O" : "Ctrl+O",
          click: () => sendToRenderer("menu:openWorkspace"),
        },
        {
          label: "导入配置…",
          click: () => sendToRenderer("menu:importConfig"),
        },
        {
          label: "导出配置…",
          click: () => sendToRenderer("menu:exportConfig"),
        },
        { type: "separator" },
        isMac ? { role: "close", label: "关闭窗口" } : { role: "quit", label: "退出" },
      ],
    },
    // Edit menu
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        ...(isMac
          ? [
              { role: "pasteAndMatchStyle", label: "粘贴并匹配样式" },
              { role: "delete", label: "删除" },
              { role: "selectAll", label: "全选" },
            ]
          : [
              { role: "delete", label: "删除" },
              { type: "separator" },
              { role: "selectAll", label: "全选" },
            ]),
      ],
    },
    // View menu
    {
      label: "视图",
      submenu: [
        {
          label: "切换侧边栏",
          accelerator: isMac ? "Cmd+B" : "Ctrl+B",
          click: () => sendToRenderer("menu:toggleSidebar"),
        },
        {
          label: "切换右侧面板",
          accelerator: isMac ? "Cmd+Alt+B" : "Ctrl+Alt+B",
          click: () => sendToRenderer("menu:toggleRightPanel"),
        },
        { type: "separator" },
        { role: "reload", label: "重新加载" },
        { role: "forceReload", label: "强制重新加载" },
        { role: "toggleDevTools", label: "开发者工具" },
        { type: "separator" },
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { type: "separator" },
        { role: "togglefullscreen", label: "进入全屏" },
      ],
    },
    // Window menu
    {
      label: "窗口",
      submenu: [
        { role: "minimize", label: "最小化" },
        { role: "zoom", label: "缩放" },
        ...(isMac
          ? [
              { type: "separator" },
              { role: "front", label: "前置全部窗口" },
              { type: "separator" },
              { role: "window", label: "Arctic Code" },
            ]
          : [{ role: "close", label: "关闭" }]),
      ],
    },
    // Help menu
    {
      role: "help",
      label: "帮助",
      submenu: [
        {
          label: "Arctic Code 文档",
          click: () => shell.openExternal("https://github.com/orange-studio/arctic-code"),
        },
        {
          label: "报告问题…",
          click: () => shell.openExternal("https://github.com/orange-studio/arctic-code/issues"),
        },
        { type: "separator" },
        {
          label: "关于 Arctic Code",
          click: () => sendToRenderer("menu:about"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildAppMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// ─────────────────────────────────────────────────────────────────
// Filesystem sandbox.
//
// AI tool calls funnel into the fs:* and shell:execCommand IPC handlers
// below. Without a sandbox, a compromised / hallucinating model could
// pass an arbitrary absolute path (e.g. /etc/passwd, ~/.ssh/id_rsa) and
// the main process would happily comply. The renderer-side parseRelativePath
// already rejects absolute paths for the file tools, but defense-in-depth
// belongs in main: even a future renderer regression should not be able
// to escape the user-approved workspace.
//
// Policy:
//   - allowedRoots is empty  → sandbox OFF (back-compat with Playground:
//     no workspace selected = nothing to constrain).
//   - allowedRoots non-empty → every fs:* path AND shell cwd must resolve
//     under one of the listed roots, otherwise the IPC returns
//     { ok:false, error:'access_denied: ...' } without touching disk.
//
// Renderer adds the active workspace via app:setAllowedRoots (called on
// workspace change). For one-off external operations the user has just
// approved through a modal, the renderer can append a session grant via
// app:addAllowedRoot — that grant is in-memory only and clears on quit.
let allowedRoots = [];

// Path comparison: macOS HFS+/APFS and Windows NTFS are conventionally
// case-insensitive; Linux is case-sensitive. Use case-insensitive match
// on win32/darwin, case-sensitive on others. Always resolve to absolute.
function normalizeRoot(p) {
  if (typeof p !== "string" || !p.trim()) return null;
  try {
    return path.resolve(p);
  } catch {
    return null;
  }
}
function pathEquals(a, b) {
  if (process.platform === "win32" || process.platform === "darwin") {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}
function isInsideAllowed(targetPath) {
  if (allowedRoots.length === 0) return true; // sandbox OFF
  const target = normalizeRoot(targetPath);
  if (!target) return false;
  for (const root of allowedRoots) {
    if (pathEquals(target, root)) return true;
    const prefix = root.endsWith(path.sep) ? root : root + path.sep;
    const targetCmp =
      process.platform === "win32" || process.platform === "darwin"
        ? target.toLowerCase()
        : target;
    const prefixCmp =
      process.platform === "win32" || process.platform === "darwin"
        ? prefix.toLowerCase()
        : prefix;
    if (targetCmp.startsWith(prefixCmp)) return true;
  }
  return false;
}
function denyOutside(targetPath) {
  return {
    ok: false,
    error: `access denied: "${targetPath}" is outside the allowed workspace. The renderer must request explicit permission before retrying.`,
  };
}

ipcMain.handle("app:setAllowedRoots", (_event, roots) => {
  if (!Array.isArray(roots)) return { ok: false, error: "roots must be array" };
  allowedRoots = roots
    .map(normalizeRoot)
    .filter((r) => typeof r === "string" && r.length > 0);
  // Re-attach the workspace watcher to the new root list. Previous watchers
  // are torn down inside attachWorkspaceWatchers.
  attachWorkspaceWatchers();
  return { ok: true, count: allowedRoots.length };
});

ipcMain.handle("app:addAllowedRoot", (_event, root) => {
  const norm = normalizeRoot(root);
  if (!norm) return { ok: false, error: "invalid root" };
  // Dedup case-insensitively on win32/darwin.
  if (!allowedRoots.some((r) => pathEquals(r, norm))) {
    allowedRoots.push(norm);
  }
  return { ok: true };
});

// ─────────────────────────────────────────────────────────────────
// Workspace external-change watcher.
//
// fs.watch(recursive=true) is supported on macOS and Windows out of
// the box; on Linux it's added in Node 20 (uses inotify). We detect
// failure and degrade gracefully — the renderer still gets a clean
// "no events" stream, the model just doesn't get the "files changed
// out from under you" hint.
//
// Events are batched via a 250ms debounce so a webpack rebuild that
// touches 200 files arrives as one IPC payload, not 200. Renderer
// dedupes the payload into a Set keyed by relative path.
//
// The watcher reuses DEFAULT_IGNORE_DIRS (declared later in this file)
// via a lazy getter. Using `const` at module-init time would TDZ; the
// getter sidesteps that and also picks up any future changes.
const WATCH_DEBOUNCE_MS = 250;

// Self-mutation suppression: when one of the fs:* IPC handlers writes,
// fs.watch fires an event we'd report back to the renderer as "external
// change" — except it's anything but external. We log every internal
// write with a short TTL and the watcher callback drops events for
// paths still in the registry. TTL is generous enough to absorb the
// inotify lag (typically <100ms) and any retried writes, but short
// enough that genuine external writes very soon after still surface.
const INTERNAL_WRITE_TTL_MS = 2000;
const recentInternalWrites = new Map(); // absPath (resolved) → expiryMs
function markInternalWrite(absPath) {
  if (!absPath || typeof absPath !== "string") return;
  try {
    recentInternalWrites.set(path.resolve(absPath), Date.now() + INTERNAL_WRITE_TTL_MS);
  } catch { /* ignore resolve failure */ }
}
function isRecentInternalWrite(absPath) {
  const now = Date.now();
  // Lazy GC of expired entries on each lookup; cheap because the map
  // stays tiny in steady state.
  for (const [p, exp] of recentInternalWrites) {
    if (exp < now) recentInternalWrites.delete(p);
  }
  try {
    return recentInternalWrites.has(path.resolve(absPath));
  } catch {
    return false;
  }
}

let activeWatchers = []; // [{ root, watcher }]
let pendingEvents = new Map(); // relPath → 'add' | 'change' | 'unlink'
let flushTimer = null;

function shouldIgnoreWatchPath(relPath) {
  if (!relPath) return false;
  // Walk segments — ignore if any matches the ignore set.
  const segs = relPath.split(/[\\/]/);
  for (const s of segs) if (DEFAULT_IGNORE_DIRS.has(s)) return true;
  return false;
}

function flushPendingEvents() {
  if (pendingEvents.size === 0 || !mainWindow || mainWindow.isDestroyed()) {
    flushTimer = null;
    pendingEvents = new Map();
    return;
  }
  const events = [];
  for (const [relPath, type] of pendingEvents) {
    events.push({ path: relPath, type });
  }
  pendingEvents = new Map();
  flushTimer = null;
  try {
    mainWindow.webContents.send("fs:externalChange", { events });
  } catch {
    /* webContents may not be ready yet on first batch — drop silently */
  }
}

function queueEvent(relPath, type) {
  if (shouldIgnoreWatchPath(relPath)) return;
  // If we already have an event for this path, prefer the more
  // informative one: unlink wins over change wins over add (we treat
  // any later activity on a previously-deleted file as add again,
  // but don't bother — the renderer just cares the file is dirty).
  pendingEvents.set(relPath, type);
  if (!flushTimer) {
    flushTimer = setTimeout(flushPendingEvents, WATCH_DEBOUNCE_MS);
  }
}

function detachAllWatchers() {
  for (const { watcher } of activeWatchers) {
    try { watcher.close(); } catch { /* noop */ }
  }
  activeWatchers = [];
  pendingEvents = new Map();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function attachWorkspaceWatchers() {
  detachAllWatchers();
  for (const root of allowedRoots) {
    let watcher;
    try {
      watcher = fsSync.watch(root, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const absPath = path.join(root, filename);
        // Suppress events that originated from the AI's own tool calls.
        // markInternalWrite is invoked in the fs:* handlers below.
        if (isRecentInternalWrite(absPath)) return;
        // filename is relative to `root`, normalized to forward slashes
        // for cross-platform consistency with the rest of our code.
        const relPath = String(filename).split(path.sep).join("/");
        // fs.watch fires "rename" for both add AND unlink — we have to
        // stat to disambiguate. Stat failure ⇒ unlink; success ⇒ add or change.
        if (eventType === "rename") {
          fs.stat(absPath)
            .then(() => queueEvent(relPath, "add"))
            .catch(() => queueEvent(relPath, "unlink"));
        } else {
          // 'change' = content modified
          queueEvent(relPath, "change");
        }
      });
    } catch (err) {
      // Recursive watch unsupported (older Linux), permission denied, etc.
      // Silently ignore - the renderer will work without file watching
      continue;
    }
    activeWatchers.push({ root, watcher });
  }
}

// Tear down on quit so the OS doesn't think we're still listening.
app.on("before-quit", detachAllWatchers);

// IPC Handlers
ipcMain.handle("app:getVersion", () => app.getVersion());
ipcMain.handle("app:getPlatform", () => process.platform);

ipcMain.handle("dialog:openDirectory", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle("dialog:openOwmfFile", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Orange Studio Model", extensions: ["owmf"] }],
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle("app:getSystemSpecs", () => {
  return {
    platform: process.platform,
    arch: process.arch,
    cpus: os.cpus(),
    totalMem: os.totalmem(),
    // Mocking GPU VRAM since native binding is required for true VRAM extraction.
    // For MVP, if it's not Apple Silicon, we assume 8GB VRAM (sufficient) or you can tweak the UI logic.
    mockVramGB: 8,
  };
});

ipcMain.handle("clipboard:readText", () => {
  return clipboard.readText();
});

// Native file system operations.
//
// Each handler runs the requested path through the sandbox check first.
// When allowedRoots is non-empty, paths outside the workspace are
// rejected with an access_denied error — the AI must obtain explicit
// user approval (which calls addAllowedRoot) before retrying.
ipcMain.handle("fs:readFile", async (_event, { filePath }) => {
  if (!isInsideAllowed(filePath)) return denyOutside(filePath);
  try {
    const content = await fs.readFile(filePath, "utf8");
    return { ok: true, content };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("fs:writeFile", async (_event, { filePath, content }) => {
  if (!isInsideAllowed(filePath)) return denyOutside(filePath);
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
    markInternalWrite(filePath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("fs:deleteFile", async (_event, { filePath, recursive }) => {
  if (!isInsideAllowed(filePath)) return denyOutside(filePath);
  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      await fs.rm(filePath, { recursive: !!recursive, force: true });
    } else {
      await fs.unlink(filePath);
    }
    markInternalWrite(filePath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("fs:createFolder", async (_event, { folderPath }) => {
  if (!isInsideAllowed(folderPath)) return denyOutside(folderPath);
  try {
    await fs.mkdir(folderPath, { recursive: true });
    markInternalWrite(folderPath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ─────────────────────────────────────────────────────────────────
// Phase 2 — workspace browsing & search
//
// list / find / grep all share the same defaults so the agent gets
// predictable results no matter which it picks first. Conservative
// caps prevent a confused model from filling the response with
// hundreds of MB of file contents.

// Default directories to skip during recursive walks. These are
// nearly always either machine-generated, irrelevant to the user's
// edits, or huge — including them just burns tokens on every list/find.
const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".cache",
  ".turbo",
  ".vite",
  "target",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
  ".DS_Store",
]);

// Translate a POSIX-style glob into a RegExp. Supports:
//   *       — any chars except path separator
//   **      — any chars including path separators
//   ?       — single non-separator char
//   {a,b}   — alternation
//   [abc]   — char class
// Anchored ^...$. Used by both find_files and grep_files's includeGlob.
function globToRegex(glob) {
  let r = "^";
  let i = 0;
  let inClass = false;
  while (i < glob.length) {
    const c = glob[i];
    if (inClass) {
      if (c === "]") {
        inClass = false;
        r += "]";
      } else {
        r += c;
      }
      i++;
      continue;
    }
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // `**/` or `**` — match any path including separators
        r += ".*";
        i += 2;
        if (glob[i] === "/") i++;
      } else {
        r += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      r += "[^/]";
      i++;
    } else if (c === "[") {
      inClass = true;
      r += "[";
      i++;
    } else if (c === "{") {
      // Naive {a,b,c} → (a|b|c). No nesting.
      const end = glob.indexOf("}", i);
      if (end < 0) {
        r += "\\{";
        i++;
      } else {
        const parts = glob.slice(i + 1, end).split(",");
        r += "(?:" + parts.map((p) => p.replace(/[.+^$()|\\]/g, "\\$&")).join("|") + ")";
        i = end + 1;
      }
    } else if (".+^$()|\\".includes(c)) {
      r += "\\" + c;
      i++;
    } else {
      r += c;
      i++;
    }
  }
  r += "$";
  return new RegExp(r);
}

// Recursive directory walk with caps + ignore list. Yields entries as
// { relPath, absPath, isDir, size, mtime }. Caller decides what to do.
async function* walkDir(rootAbs, {
  maxEntries = 5000,
  maxDepth = 16,
  ignoreDirs = DEFAULT_IGNORE_DIRS,
} = {}) {
  let count = 0;
  async function* recurse(absDir, relDir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (count >= maxEntries) return;
      const name = ent.name;
      if (ignoreDirs.has(name)) continue;
      const absPath = path.join(absDir, name);
      const relPath = relDir ? `${relDir}/${name}` : name;
      const isDir = ent.isDirectory();
      let size = 0;
      let mtime = 0;
      try {
        const st = await fs.stat(absPath);
        size = isDir ? 0 : st.size;
        mtime = st.mtimeMs;
      } catch {
        /* skip unreadable */
      }
      count++;
      yield { relPath, absPath, isDir, size, mtime };
      if (isDir) yield* recurse(absPath, relPath, depth + 1);
    }
  }
  yield* recurse(rootAbs, "", 0);
}

// list_directory — single level of children. NOT recursive (use find for that).
ipcMain.handle("fs:list", async (_event, { dirPath, maxEntries = 500 } = {}) => {
  if (!isInsideAllowed(dirPath)) return denyOutside(dirPath);
  try {
    const dirents = await fs.readdir(dirPath, { withFileTypes: true });
    const entries = [];
    let truncated = false;
    for (const ent of dirents) {
      if (entries.length >= maxEntries) {
        truncated = true;
        break;
      }
      const abs = path.join(dirPath, ent.name);
      let size = 0;
      let mtime = 0;
      try {
        const st = await fs.stat(abs);
        size = ent.isDirectory() ? 0 : st.size;
        mtime = st.mtimeMs;
      } catch {
        /* skip stat failure */
      }
      entries.push({
        name: ent.name,
        type: ent.isDirectory() ? "dir" : ent.isFile() ? "file" : "other",
        size,
        modified: mtime,
      });
    }
    // Stable sort: dirs first, then files, alphabetic within each
    entries.sort((a, b) => {
      if (a.type !== b.type) {
        if (a.type === "dir") return -1;
        if (b.type === "dir") return 1;
      }
      return a.name.localeCompare(b.name);
    });
    return { ok: true, entries, truncated };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// find_files — recursive glob match against relative paths.
ipcMain.handle("fs:find", async (_event, {
  rootPath,
  pattern,
  maxResults = 500,
} = {}) => {
  if (!isInsideAllowed(rootPath)) return denyOutside(rootPath);
  if (typeof pattern !== "string" || !pattern.trim()) {
    return { ok: false, error: "pattern is required" };
  }
  let regex;
  try {
    regex = globToRegex(pattern.trim());
  } catch (e) {
    return { ok: false, error: `invalid glob: ${e.message}` };
  }
  const matches = [];
  let truncated = false;
  try {
    for await (const ent of walkDir(rootPath, { maxEntries: 20000 })) {
      if (ent.isDir) continue;
      if (regex.test(ent.relPath)) {
        matches.push({ path: ent.relPath, size: ent.size });
        if (matches.length >= maxResults) {
          truncated = true;
          break;
        }
      }
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
  return { ok: true, matches, truncated };
});

// grep_files — content search across files. Streams by line, skips
// binary files (heuristic), respects maxFileBytes per file and
// maxMatches global. The agent passes either a literal `query` or
// a regex string with `regex: true`.
const GREP_MAX_FILE_BYTES = 2 * 1024 * 1024;
const GREP_MAX_FILES = 2000;
function looksBinary(buf) {
  // Check the first 8KB for NUL bytes — a strong "this is binary" signal
  // that's vastly cheaper than a charset detector.
  const limit = Math.min(buf.length, 8192);
  for (let i = 0; i < limit; i++) if (buf[i] === 0) return true;
  return false;
}
ipcMain.handle("fs:grep", async (_event, {
  rootPath,
  query,
  regex = false,
  filePattern = null,
  caseSensitive = false,
  maxMatches = 200,
} = {}) => {
  if (!isInsideAllowed(rootPath)) return denyOutside(rootPath);
  if (typeof query !== "string" || query.length === 0) {
    return { ok: false, error: "query is required" };
  }
  let matcher;
  try {
    if (regex) {
      matcher = new RegExp(query, caseSensitive ? "" : "i");
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      matcher = new RegExp(escaped, caseSensitive ? "" : "i");
    }
  } catch (e) {
    return { ok: false, error: `invalid regex: ${e.message}` };
  }
  const fileFilter = filePattern ? globToRegex(filePattern) : null;
  const matches = [];
  let filesScanned = 0;
  let truncated = false;
  try {
    for await (const ent of walkDir(rootPath, { maxEntries: 20000 })) {
      if (ent.isDir) continue;
      if (fileFilter && !fileFilter.test(ent.relPath)) continue;
      if (filesScanned >= GREP_MAX_FILES) {
        truncated = true;
        break;
      }
      filesScanned++;
      let buf;
      try {
        if (ent.size > GREP_MAX_FILE_BYTES) continue;
        buf = await fs.readFile(ent.absPath);
      } catch {
        continue;
      }
      if (looksBinary(buf)) continue;
      const text = buf.toString("utf8");
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (matcher.test(lines[i])) {
          matches.push({
            path: ent.relPath,
            line: i + 1,
            text: lines[i].length > 400 ? lines[i].slice(0, 400) + "…" : lines[i],
          });
          if (matches.length >= maxMatches) {
            truncated = true;
            break;
          }
        }
      }
      if (truncated) break;
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
  return { ok: true, matches, filesScanned, truncated };
});

// move_file / copy_file — both endpoints must be inside allowed roots.
// rename handles same-device; cross-device fallback is copy+unlink.
ipcMain.handle("fs:move", async (_event, { fromPath, toPath } = {}) => {
  if (!isInsideAllowed(fromPath)) return denyOutside(fromPath);
  if (!isInsideAllowed(toPath)) return denyOutside(toPath);
  try {
    await fs.mkdir(path.dirname(toPath), { recursive: true });
    try {
      await fs.rename(fromPath, toPath);
    } catch (err) {
      if (err.code === "EXDEV") {
        // Cross-device: copy then delete.
        await fs.cp(fromPath, toPath, { recursive: true });
        await fs.rm(fromPath, { recursive: true, force: true });
      } else {
        throw err;
      }
    }
    markInternalWrite(fromPath);
    markInternalWrite(toPath);
    return { ok: true, from: fromPath, to: toPath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// fs:tree — produce a compact ASCII tree of the workspace for the
// system prompt. Caps total entries + max depth so even on a 50k-file
// repo we stay well below the model's context window. Truncated
// branches are marked with "… (+N more)" so the model knows to call
// list_directory / find_files for deeper exploration.
ipcMain.handle("fs:tree", async (_event, {
  rootPath,
  maxEntries = 400,
  maxDepth = 6,
} = {}) => {
  if (!isInsideAllowed(rootPath)) return denyOutside(rootPath);
  const lines = [];
  const rootName = path.basename(rootPath) || rootPath;
  lines.push(rootName + "/");
  let count = 0;
  let truncated = false;
  async function recurse(absDir, depth, prefix) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    // Filter ignores, sort dirs-first then alpha.
    const visible = entries
      .filter((e) => !DEFAULT_IGNORE_DIRS.has(e.name))
      .sort((a, b) => {
        const ad = a.isDirectory() ? 0 : 1;
        const bd = b.isDirectory() ? 0 : 1;
        if (ad !== bd) return ad - bd;
        return a.name.localeCompare(b.name);
      });
    for (let i = 0; i < visible.length; i++) {
      if (count >= maxEntries) {
        truncated = true;
        const remaining = visible.length - i;
        if (remaining > 0) {
          lines.push(`${prefix}└── … (+${remaining} more)`);
        }
        return;
      }
      const ent = visible[i];
      const isLast = i === visible.length - 1;
      const branch = isLast ? "└── " : "├── ";
      const childPrefix = prefix + (isLast ? "    " : "│   ");
      const isDir = ent.isDirectory();
      lines.push(prefix + branch + ent.name + (isDir ? "/" : ""));
      count++;
      if (isDir && depth < maxDepth) {
        await recurse(path.join(absDir, ent.name), depth + 1, childPrefix);
        if (truncated) return;
      }
    }
  }
  try {
    await recurse(rootPath, 1, "");
  } catch (e) {
    return { ok: false, error: e.message };
  }
  return { ok: true, tree: lines.join("\n"), entries: count, truncated };
});

ipcMain.handle("fs:copy", async (_event, { fromPath, toPath, overwrite = false } = {}) => {
  if (!isInsideAllowed(fromPath)) return denyOutside(fromPath);
  if (!isInsideAllowed(toPath)) return denyOutside(toPath);
  try {
    if (!overwrite) {
      try {
        await fs.access(toPath);
        return { ok: false, error: "destination exists; set overwrite=true to replace" };
      } catch { /* not exists, good */ }
    }
    await fs.mkdir(path.dirname(toPath), { recursive: true });
    const stat = await fs.stat(fromPath);
    if (stat.isDirectory()) {
      await fs.cp(fromPath, toPath, { recursive: true, force: !!overwrite });
      markInternalWrite(toPath);
      return { ok: true, from: fromPath, to: toPath, isDirectory: true };
    }
    await fs.copyFile(fromPath, toPath);
    markInternalWrite(toPath);
    return { ok: true, from: fromPath, to: toPath, bytes: stat.size };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Native shell command execution. Runs the command via the user's default
// shell (/bin/sh on POSIX, cmd.exe on Windows) and returns the captured
// stdout/stderr/exit_code. The renderer still funnels every call through
// CommandExecuteModal first, so user consent is enforced at the UI layer.
//
// Hard guards:
//   - 30-second timeout (prevents a runaway `npm install` from hanging forever)
//   - 2 MB output cap on each of stdout/stderr (prevents heap blowouts)
//   - cwd defaults to the user's home directory if the renderer didn't supply one
//   - Dangerous pattern detection to prevent command injection attacks
//
// Blocked patterns include: curl/wget piped to shell, rm -rf /, format c:, command substitution, etc.
const DANGEROUS_PATTERNS = [
  /curl\s+[^|]*\|\s*(ba)?sh/i,           // curl | bash
  /wget\s+[^|]*\|\s*(ba)?sh/i,           // wget | bash
  /rm\s+-[rf]*\s+\//i,                    // rm -rf /
  /rm\s+-[rf]*\s+~\/\./i,                 // rm -rf ~/.something
  /format\s+c:/i,                         // format c:
  /mkfs\./i,                              // mkfs.*
  /dd\s+if=.*of=\/dev\//i,                // dd to device
  />\s*\/etc\/passwd/i,                   // redirect to /etc/passwd
  />\s*~\/\./i,                            // redirect to hidden files in home
  /:\(\)\s*\{\s*:\|\:.*\}.*&&/,           // fork bomb
  /chmod\s+-R?\s+777\s+\//i,              // chmod 777 /
  /chown\s+-R\s+root:\s*\//i,              // chown root / (needs sudo but block anyway)
  /\$\(.*\)/,                            // command substitution $(...)
  /`[^`]*`/,                             // command substitution with backticks
];

function isCommandAllowed(command) {
  const trimmed = command.trim();
  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return false;
    }
  }
  return true;
}

ipcMain.handle(
  "shell:execCommand",
  async (_event, { command, cwd, timeoutMs } = {}) => {
    if (typeof command !== "string" || !command.trim()) {
      return { ok: false, error: "command is required", exit_code: -1 };
    }
    if (!isCommandAllowed(command)) {
      return {
        ok: false,
        error: "command blocked: potentially dangerous pattern detected",
        exit_code: -1,
      };
    }
    // Sandbox the cwd. If a workspace is registered, the cwd MUST resolve
    // inside an allowed root — otherwise the renderer is trying to run
    // a command in a directory the user hasn't approved (e.g. /etc, ~/.ssh).
    // The renderer's outsideWorkspace consent flow is responsible for
    // calling app:addAllowedRoot BEFORE invoking exec; if it didn't, deny.
    const effectiveCwd =
      cwd && typeof cwd === "string" && cwd.trim() ? cwd : null;
    if (effectiveCwd && !isInsideAllowed(effectiveCwd)) {
      return {
        ...denyOutside(effectiveCwd),
        exit_code: -1,
      };
    }
    return await new Promise((resolve) => {
      const child = exec(
        command,
        {
          cwd: effectiveCwd || os.homedir(),
          timeout: Math.min(
            Math.max(Number(timeoutMs) || 30000, 1000),
            5 * 60 * 1000,
          ),
          maxBuffer: 2 * 1024 * 1024,
          windowsHide: true,
        },
        (err, stdout, stderr) => {
          // On timeout / killed, err.signal === 'SIGTERM' and err.killed is true.
          if (err && err.killed) {
            return resolve({
              ok: false,
              stdout: String(stdout || ""),
              stderr: String(stderr || err.message || ""),
              exit_code: -1,
              timed_out: true,
              error: "命令超时被终止",
            });
          }
          const exitCode = err ? (err.code ?? 1) : 0;
          resolve({
            ok: exitCode === 0,
            stdout: String(stdout || ""),
            stderr: String(stderr || ""),
            exit_code: exitCode,
          });
        },
      );
      // Don't leak the child handle; keep a ref so GC doesn't reap it prematurely
      // while exec's callback is still pending.
      child.on("error", (e) => {
        resolve({
          ok: false,
          stdout: "",
          stderr: e?.message || String(e),
          exit_code: -1,
          error: e?.message || String(e),
        });
      });
    });
  },
);

// Native HTTP fetch via electron's built-in `net` module. Bypasses browser
// CORS entirely because it runs in the Node main process. Used by fetch_url
// as the primary path; DOM fetch and Jina Reader remain as renderer-side
// fallbacks (not needed when Electron is available, but kept for compat).
//
// Security: blocks internal network addresses to prevent SSRF attacks.
function isInternalUrl(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    // Block localhost variants
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "0:0:0:0:0:0:0:1") {
      return true;
    }
    // Block private IP ranges
    if (/^10\./.test(hostname) || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname) || /^192\.168\./.test(hostname)) {
      return true;
    }
    // Block link-local addresses
    if (/^169\.254\./.test(hostname) || /^fe80:/i.test(hostname)) {
      return true;
    }
    return false;
  } catch {
    return true; // Invalid URL, treat as internal/block
  }
}

ipcMain.handle("shell:fetchUrl", async (_event, { url, timeoutMs } = {}) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    return { ok: false, error: "valid http(s) url is required" };
  }
  if (isInternalUrl(url)) {
    return { ok: false, error: "access to internal network addresses is blocked" };
  }
  return await new Promise((resolve) => {
    let settled = false;
    const request = net.request({
      method: "GET",
      url,
      redirect: "follow",
    });
    request.setHeader(
      "User-Agent",
      "Mozilla/5.0 (Arctic Code) ArcticFetch/1.0",
    );
    request.setHeader("Accept", "text/html,application/xhtml+xml,*/*;q=0.9");

    const chunks = [];
    let totalLen = 0;
    const MAX_BYTES = 4 * 1024 * 1024; // 4 MB hard cap on raw HTML payload

    const timer = setTimeout(
      () => {
        if (settled) return;
        settled = true;
        try {
          request.abort();
        } catch {
          /* noop */
        }
        resolve({ ok: false, error: "请求超时", status: 0 });
      },
      Math.min(Math.max(Number(timeoutMs) || 20000, 1000), 60 * 1000),
    );

    request.on("response", (response) => {
      const status = response.statusCode;
      const contentType = (response.headers["content-type"] || "").toString();
      response.on("data", (chunk) => {
        totalLen += chunk.length;
        if (totalLen > MAX_BYTES) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try {
            request.abort();
          } catch {
            /* noop */
          }
          resolve({
            ok: false,
            error: `响应过大（> ${MAX_BYTES / 1024 / 1024} MB）`,
            status,
          });
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const buf = Buffer.concat(chunks);
        const body = buf.toString("utf8");
        resolve({
          ok: status >= 200 && status < 400,
          status,
          contentType,
          body,
          finalUrl: url,
        });
      });
      response.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, error: err?.message || String(err), status });
      });
    });
    request.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: err?.message || String(err), status: 0 });
    });
    request.end();
  });
});

// ─────────────────────────────────────────────────────────────────
// Background commands
//
// Long-running processes (npm run dev, vite, jest --watch, …) that the
// agent or user wants to leave running while the conversation
// continues. Different from shell:execCommand in three ways:
//
//   1. Returns immediately with an `id` instead of waiting for exit.
//   2. Output accumulates into an in-memory buffer and is read in a
//      "tail since last drain" mode — the renderer (and the agent
//      via tools) can poll for new output without re-receiving what
//      it already saw.
//   3. The process is killable via `bgStop` from anywhere in the UI.
//
// Each entry is keyed by a short id (timestamp+rand). We keep at
// most BG_MAX_BYTES of accumulated output per process to bound
// memory; older bytes get dropped from the head when the buffer
// overflows. Exited processes stay in the table so the renderer can
// still drain their final output, until they're explicitly removed
// via bgStop or bgClear.
const BG_MAX_BYTES = 256 * 1024; // 256 KiB per process buffer cap
const bgProcesses = new Map(); // id -> { ... }
let bgIdCounter = 0;

function bgPushOutput(entry, chunk) {
  // Always maintain UTF-8 string. Buffer overflow strategy: drop the
  // oldest bytes so the user / agent always sees the most recent state
  // (which is what matters for "is the dev server happy now").
  entry.output += chunk;
  if (entry.output.length > BG_MAX_BYTES) {
    const overflow = entry.output.length - BG_MAX_BYTES;
    entry.output = entry.output.slice(overflow);
    // After dropping bytes, our caller's "last read offset" no longer
    // refers to a meaningful slice — clamp it to zero so the next read
    // returns whatever's left in the buffer instead of a negative slice.
    if (entry.lastReadIdx > entry.output.length) entry.lastReadIdx = 0;
    entry.truncated = true;
  }
}

function bgSnapshot(entry) {
  return {
    id: entry.id,
    command: entry.command,
    cwd: entry.cwd,
    running: entry.running,
    exitCode: entry.exitCode,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    truncated: entry.truncated,
    outputLength: entry.output.length,
    error: entry.error,
  };
}

ipcMain.handle("shell:bgStart", async (_event, { command, cwd } = {}) => {
  if (typeof command !== "string" || !command.trim()) {
    return { ok: false, error: "command is required" };
  }
  if (!isCommandAllowed(command)) {
    return {
      ok: false,
      error: "command blocked: potentially dangerous pattern detected",
    };
  }
  const effectiveCwd = cwd && typeof cwd === "string" && cwd.trim() ? cwd : null;
  if (effectiveCwd && !isInsideAllowed(effectiveCwd)) {
    return denyOutside(effectiveCwd);
  }
  const id = `bg-${Date.now().toString(36)}-${(++bgIdCounter).toString(36)}`;
  const startedAt = Date.now();
  // Use a login shell so users get their normal PATH (npm / node / pnpm
  // installed via Homebrew or nvm) rather than the bare /usr/bin set the
  // Electron host inherits. -lc keeps it portable across bash / zsh.
  const shellCmd = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
  const shellArgs = process.platform === "win32" ? ["/c", command] : ["-lc", command];
  let child;
  try {
    child = spawn(shellCmd, shellArgs, {
      cwd: effectiveCwd || os.homedir(),
      windowsHide: true,
      // detached:false → child is in our group; killing it via SIGTERM
      // (or kill() with no signal) propagates correctly. We rely on
      // shell -lc to forward signals to the underlying npm / node.
    });
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
  const entry = {
    id,
    command,
    cwd: effectiveCwd,
    child,
    output: "",
    lastReadIdx: 0,
    running: true,
    exitCode: null,
    startedAt,
    finishedAt: null,
    truncated: false,
    error: null,
  };
  bgProcesses.set(id, entry);

  child.stdout?.on("data", (chunk) => bgPushOutput(entry, chunk.toString("utf8")));
  child.stderr?.on("data", (chunk) => bgPushOutput(entry, chunk.toString("utf8")));
  child.on("error", (err) => {
    entry.error = err?.message || String(err);
    entry.running = false;
    entry.finishedAt = Date.now();
  });
  child.on("exit", (code, signal) => {
    entry.running = false;
    entry.exitCode = code != null ? code : signal ? -1 : 0;
    entry.finishedAt = Date.now();
  });

  return { ok: true, id, startedAt, command };
});

// Read accumulated output. Two modes:
//   - sinceLast=true (default): return only output produced since the
//     last call (i.e. tail). Use for "drain new output before sending
//     the user's message".
//   - sinceLast=false: return the full buffer. Use when the user opens
//     a "show full log" panel.
ipcMain.handle("shell:bgRead", async (_event, { id, sinceLast = true } = {}) => {
  const entry = bgProcesses.get(id);
  if (!entry) return { ok: false, error: "background command not found" };
  const fromIdx = sinceLast ? entry.lastReadIdx : 0;
  const slice = entry.output.slice(fromIdx);
  if (sinceLast) entry.lastReadIdx = entry.output.length;
  return {
    ok: true,
    output: slice,
    fullLength: entry.output.length,
    snapshot: bgSnapshot(entry),
  };
});

// Wait until either (a) the process exits, or (b) the timeout elapses.
// Returns the same shape as bgRead. Used by run_background_command when
// the agent passes wait_seconds > 0 — gives the agent a way to fire-
// and-await for short-lived commands without busy-looping.
ipcMain.handle(
  "shell:bgWait",
  async (_event, { id, timeoutMs = 0, sinceLast = true } = {}) => {
    const entry = bgProcesses.get(id);
    if (!entry) return { ok: false, error: "background command not found" };
    const cap = Math.min(Math.max(Number(timeoutMs) || 0, 0), 5 * 60 * 1000);
    if (entry.running && cap > 0) {
      await new Promise((resolve) => {
        let timer;
        const onExit = () => {
          clearTimeout(timer);
          resolve();
        };
        timer = setTimeout(() => {
          entry.child.removeListener("exit", onExit);
          resolve();
        }, cap);
        entry.child.once("exit", onExit);
      });
    }
    const fromIdx = sinceLast ? entry.lastReadIdx : 0;
    const slice = entry.output.slice(fromIdx);
    if (sinceLast) entry.lastReadIdx = entry.output.length;
    return {
      ok: true,
      output: slice,
      fullLength: entry.output.length,
      snapshot: bgSnapshot(entry),
    };
  },
);

// Valid POSIX signals for process termination
const VALID_SIGNALS = new Set([
  "SIGTERM", "SIGKILL", "SIGINT", "SIGHUP", "SIGUSR1", "SIGUSR2"
]);

ipcMain.handle("shell:bgStop", async (_event, { id, signal = "SIGTERM" } = {}) => {
  const entry = bgProcesses.get(id);
  if (!entry) return { ok: false, error: "background command not found" };
  if (!entry.running) {
    return { ok: true, alreadyExited: true, snapshot: bgSnapshot(entry) };
  }
  // Validate signal to prevent injection attacks
  const safeSignal = VALID_SIGNALS.has(signal) ? signal : "SIGTERM";
  try {
    entry.child.kill(safeSignal);
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
  // Give the shell a beat to forward the signal; if it's still alive
  // after 1.5s, escalate to SIGKILL. Many `npm run dev` setups spawn
  // grandchildren that don't honour SIGTERM cleanly.
  setTimeout(() => {
    if (entry.running) {
      try {
        entry.child.kill("SIGKILL");
      } catch {
        /* noop */
      }
    }
  }, 1500);
  return { ok: true, snapshot: bgSnapshot(entry) };
});

// Remove an entry from the table (must be already exited). Used by the
// renderer's "dismiss" / "clear log" affordance so finished commands
// don't pile up forever.
ipcMain.handle("shell:bgClear", async (_event, { id } = {}) => {
  const entry = bgProcesses.get(id);
  if (!entry) return { ok: true, removed: false };
  if (entry.running) {
    return { ok: false, error: "cannot clear a running command; stop it first" };
  }
  bgProcesses.delete(id);
  return { ok: true, removed: true };
});

ipcMain.handle("shell:bgList", async () => {
  return {
    ok: true,
    items: Array.from(bgProcesses.values()).map(bgSnapshot),
  };
});

// Make sure we don't leak running children when the user quits the app.
app.on("before-quit", () => {
  for (const entry of bgProcesses.values()) {
    if (!entry.running) continue;
    try {
      entry.child.kill("SIGTERM");
    } catch {
      /* noop */
    }
  }
});
