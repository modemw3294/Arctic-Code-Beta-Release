const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("arcticAPI", {
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  getPlatform: () => ipcRenderer.invoke("app:getPlatform"),
  openDirectory: () => ipcRenderer.invoke("dialog:openDirectory"),
  openOwmfFile: () => ipcRenderer.invoke("dialog:openOwmfFile"),
  getSystemSpecs: () => ipcRenderer.invoke("app:getSystemSpecs"),
  readClipboard: () => ipcRenderer.invoke("clipboard:readText"),
  // Filesystem sandbox — registers the active workspace folder(s) with
  // the main process. fs:* and shell:execCommand calls outside these
  // roots will be denied at the IPC layer. addAllowedRoot is for
  // session-only grants the user just approved through a modal.
  setAllowedRoots: (roots) => ipcRenderer.invoke("app:setAllowedRoots", roots),
  addAllowedRoot: (root) => ipcRenderer.invoke("app:addAllowedRoot", root),
  // Native file system operations
  fsReadFile: (opts) => ipcRenderer.invoke("fs:readFile", opts),
  fsWriteFile: (opts) => ipcRenderer.invoke("fs:writeFile", opts),
  fsDeleteFile: (opts) => ipcRenderer.invoke("fs:deleteFile", opts),
  fsCreateFolder: (opts) => ipcRenderer.invoke("fs:createFolder", opts),
  // Phase 2 — workspace browse / search / move / copy.
  // All sandbox-checked in main; paths are absolute (renderer prepends
  // workspace root). See electron/main.js for response shapes.
  fsList: (opts) => ipcRenderer.invoke("fs:list", opts),
  fsFind: (opts) => ipcRenderer.invoke("fs:find", opts),
  fsGrep: (opts) => ipcRenderer.invoke("fs:grep", opts),
  fsMove: (opts) => ipcRenderer.invoke("fs:move", opts),
  fsCopy: (opts) => ipcRenderer.invoke("fs:copy", opts),
  // Workspace ASCII tree for system prompt injection.
  fsTree: (opts) => ipcRenderer.invoke("fs:tree", opts),
  // Filesystem watcher (Phase 2): subscribe to external file changes
  // for the active workspace. Main pushes batched events here so the
  // renderer can build a "since last response" change set.
  onFsExternalChange: (callback) => {
    const wrapped = (_event, payload) => callback(payload);
    ipcRenderer.on("fs:externalChange", wrapped);
    return () => ipcRenderer.removeListener("fs:externalChange", wrapped);
  },
  // Native shell command execution. Returns { ok, stdout, stderr, exit_code }.
  // CommandExecuteModal gates this behind user consent for every call.
  execCommand: (opts) => ipcRenderer.invoke("shell:execCommand", opts),
  // Native HTTP fetch (bypasses browser CORS). Returns { ok, status, contentType, body }.
  // fetch_url tool uses this as its primary path when running inside Electron.
  fetchUrl: (opts) => ipcRenderer.invoke("shell:fetchUrl", opts),
  // Background commands (long-running processes like `npm run dev`).
  // bgStart returns { ok, id }; output accumulates server-side and is
  // pulled via bgRead (sinceLast tail) or bgWait (block until exit/timeout).
  // bgStop sends SIGTERM (escalates to SIGKILL after 1.5s).
  bgStart: (opts) => ipcRenderer.invoke("shell:bgStart", opts),
  bgRead: (opts) => ipcRenderer.invoke("shell:bgRead", opts),
  bgWait: (opts) => ipcRenderer.invoke("shell:bgWait", opts),
  bgStop: (opts) => ipcRenderer.invoke("shell:bgStop", opts),
  bgClear: (opts) => ipcRenderer.invoke("shell:bgClear", opts),
  bgList: () => ipcRenderer.invoke("shell:bgList"),
  onMainMessage: (callback) => {
    ipcRenderer.on("main:message", (_event, data) => callback(data));
  },
  // Native application-menu events. The main process pushes these
  // when the user picks an item from the macOS top bar (or the
  // Windows/Linux menu fallback). Renderer subscribes via
  // `arcticAPI.onMenuCommand((channel) => ...)` and dispatches it to
  // the appropriate React handler. Returns a disposer.
  onMenuCommand: (callback) => {
    const channels = [
      "menu:openSettings",
      "menu:newChat",
      "menu:newSkill",
      "menu:openWorkspace",
      "menu:importConfig",
      "menu:exportConfig",
      "menu:toggleSidebar",
      "menu:toggleRightPanel",
      "menu:about",
    ];
    const handlers = channels.map((ch) => {
      const fn = () => callback(ch);
      ipcRenderer.on(ch, fn);
      return [ch, fn];
    });
    return () => {
      for (const [ch, fn] of handlers) ipcRenderer.removeListener(ch, fn);
    };
  },
});
