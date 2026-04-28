import { useState, useCallback, useEffect, useRef } from "react";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useI18n } from "./hooks/useI18n";
import { initI18n } from "./lib/i18n";
import Sidebar from "./components/Sidebar/Sidebar";
import ChatPanel from "./components/ChatPanel/ChatPanel";
import SkillsView from "./components/SkillsView/SkillsView";
import RightPanel from "./components/RightPanel/RightPanel";
import TitleBar from "./components/TitleBar/TitleBar";
import SettingsModal from "./components/SettingsModal/SettingsModal";
import RetractConfirmModal from "./components/RetractConfirmModal/RetractConfirmModal";
import DeleteProjectModal from "./components/DeleteProjectModal/DeleteProjectModal";
import ArtifactPreviewModal from "./components/ArtifactPreviewModal/ArtifactPreviewModal";
import CommandExecuteModal from "./components/CommandExecuteModal/CommandExecuteModal";
import ToolConfirmModal from "./components/ToolConfirmModal/ToolConfirmModal";
import {
  agentTools,
  createToolRunner,
  streamChatCompletion,
  extractInlineToolCalls,
} from "./lib/tools";
import { resolveProvider } from "./lib/providerRouting";
import { requestPermission } from "./lib/toolPermissions";
import {
  parseRelativePath,
  getNativePath,
} from "./lib/toolsExec/pathHelpers";
import { getContextWindow } from "./lib/models";
import { estimateTokens, estimateMessageTokens } from "./lib/tokens";
import { readToolsConfig } from "./lib/toolsConfig";
import { compressApiMessages, estimateTokens as estimateMsgTokens } from "./lib/contextCompressor";
import * as mcp from "./lib/mcp/registry";
import "./App.css";

// Initialize i18n on app load
initI18n();

// Break down estimated context usage for the current task by source so the
// right-panel can render a segmented progress bar.
function computeContextStats({ skills = [], messages = [], modelId }) {
  const contextWindow = getContextWindow(modelId);

  // Skills: only enabled ones with content
  let skillsTokens = 0;
  for (const s of skills) {
    if (s.enabled === false) continue;
    if (typeof s.content !== "string" || s.content.length === 0) continue;
    skillsTokens += estimateTokens(s.content);
  }

  // Files: attachment data URLs (images/audio) + referenced file bytes
  // We don't have the referenced file content locally unless the agent has
  // already read it, so we estimate by the declared `size` field.
  let filesTokens = 0;
  for (const m of messages) {
    if (Array.isArray(m.attachments)) {
      for (const a of m.attachments) {
        if (a.kind === "image") filesTokens += 800;
        else if (a.kind === "audio") filesTokens += 1500;
      }
    }
    if (Array.isArray(m.references)) {
      for (const r of m.references) {
        if (typeof r.size === "number") {
          // Rough: a file's text occupies ~size/4 tokens at most; cap at 30k per ref
          filesTokens += Math.min(Math.ceil(r.size / 4), 30_000);
        }
      }
    }
  }

  // History: prior turns (user text + assistant replies). To keep the
  // displayed total in sync with what's actually sent on the wire, we
  // mirror the request-time pipeline:
  //   1. Reconstruct an OpenAI-shape `apiMessages` array from UI messages
  //      (same shape the agent loop builds before each request).
  //   2. If 上下文压缩 is enabled, run `compressApiMessages` over it.
  //   3. Sum tokens with the compressor's char-based estimator.
  // Without step 2 the bar would only ever grow, even though the compressor
  // is actively dropping old thinking / tool results / out-of-window turns
  // before each request.
  const reconstructed = [];
  for (const m of messages) {
    if (m.role === "user") {
      reconstructed.push({ role: "user", content: m.content || "" });
    } else if (m.role === "assistant") {
      if (Array.isArray(m.apiTurns) && m.apiTurns.length > 0) {
        for (const t of m.apiTurns) reconstructed.push(t);
      } else if (m.content) {
        reconstructed.push({ role: "assistant", content: m.content });
      }
    }
  }

  const ccCfg = (readToolsConfig().contextCompression) || {};
  const wire = ccCfg.enabled === false
    ? reconstructed
    : compressApiMessages(reconstructed, {
        evictThinking: ccCfg.evictThinking !== false,
        evictToolResults: ccCfg.evictToolResults !== false,
        evictionMinChars: Number(ccCfg.evictionMinChars) || 800,
        slidingWindow: Number(ccCfg.slidingWindow) || 4,
        summaryMode: ccCfg.summaryMode || "truncate",
        // Caching markers don't affect token count — leave at default.
        enableCaching: false,
      });
  // Use the compressor's own char-based estimator (chars/3.5) so the
  // "saved N tokens" hint and the context bar agree on what they're
  // counting. The CJK-aware `estimateMessageTokens` was overcounting
  // history relative to the wire-format estimate, which made the bar
  // look like it ignored compression.
  const historyTokens = estimateMsgTokens(wire);

  const total = skillsTokens + filesTokens + historyTokens;
  return {
    contextWindow,
    total,
    percent:
      contextWindow > 0 ? Math.min(100, (total / contextWindow) * 100) : 0,
    breakdown: {
      skills: skillsTokens,
      files: filesTokens,
      history: historyTokens,
    },
  };
}

function App() {
  const { t } = useI18n();
  const [, setMode] = useLocalStorage("arctic-mode", "agent"); // kept for future use; currently fixed
  const mode = "agent"; // Code/Agent distinction is hidden — always use agent
  const [activeTask, setActiveTask] = useLocalStorage(
    "arctic-activeTask",
    null,
  );
  const [messages, setMessages] = useLocalStorage("arctic-messages", []);
  const [tasks, setTasks] = useLocalStorage("arctic-tasks", []);
  const [projects, setProjects] = useLocalStorage("arctic-projects", []);
  const [todoItems, setTodoItems] = useLocalStorage("arctic-todoItems", []);
  // 任务进度：每个任务最多保留一条 { taskId, percent, eta, updatedAt }
  // 由 update_progress 工具写入，由 RightPanel 读取后渲染进度条 + ETA。
  const [taskProgress, setTaskProgress] = useLocalStorage(
    "arctic-taskProgress",
    [],
  );
  const [artifacts, setArtifacts] = useLocalStorage("arctic-artifacts", []);
  const [references, setReferences] = useLocalStorage("arctic-references", []);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // Optional tab to land on when SettingsModal opens. Used by callers
  // like the chat-input Tools button which want to jump straight into
  // Settings → MCP. Cleared after consumption so subsequent opens
  // (e.g. via the sidebar gear) honour the modal's own default tab.
  const [settingsInitialTab, setSettingsInitialTab] = useState(null);
  useEffect(() => {
    const onOpen = (e) => {
      const tab = e?.detail?.tab || null;
      setSettingsInitialTab(tab);
      setIsSettingsOpen(true);
    };
    window.addEventListener("arctic-open-settings", onOpen);
    return () => window.removeEventListener("arctic-open-settings", onOpen);
  }, []);

  const [activeView, setActiveView] = useState("chat"); // 'chat' | 'skills'
  const [skills, setSkills] = useLocalStorage("arctic-skills", []);
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage(
    "arctic-sidebarCollapsed",
    false,
  );
  const [rightPanelCollapsed, setRightPanelCollapsed] = useLocalStorage(
    "arctic-rightPanelCollapsed",
    false,
  );
  const [selectedModel, setSelectedModel] = useLocalStorage(
    "arctic-selectedModel",
    "chatgpt-5.5",
  );
  const [workspace, setWorkspace] = useLocalStorage(
    "arctic-workspace",
    "playground",
  );
  const [theme, setTheme] = useLocalStorage("arctic-theme", "system");
  const [pendingRetract, setPendingRetract] = useState(null);

  // Native macOS menu bar — wire menu picks to the matching React handlers.
  // The preload exposes `onMenuCommand` which fans out a dozen IPC channels
  // into a single string callback. Most items just dispatch the same custom
  // events the in-app buttons use, so the existing flows handle the rest.
  useEffect(() => {
    if (!window.arcticAPI?.onMenuCommand) return undefined;
    const dispose = window.arcticAPI.onMenuCommand((channel) => {
      switch (channel) {
        case "menu:openSettings":
          setSettingsInitialTab(null);
          setIsSettingsOpen(true);
          break;
        case "menu:newChat":
          setActiveView("chat");
          setActiveTask(null);
          break;
        case "menu:newSkill":
          setActiveView("skills");
          window.dispatchEvent(new CustomEvent("arctic-new-skill"));
          break;
        case "menu:openWorkspace":
          window.dispatchEvent(new CustomEvent("arctic-open-workspace"));
          break;
        case "menu:importConfig":
        case "menu:exportConfig":
          setSettingsInitialTab("models");
          setIsSettingsOpen(true);
          break;
        case "menu:toggleSidebar":
          setSidebarCollapsed((v) => !v);
          break;
        case "menu:toggleRightPanel":
          setRightPanelCollapsed((v) => !v);
          break;
        case "menu:about":
          setSettingsInitialTab("about");
          setIsSettingsOpen(true);
          break;
        default:
          break;
      }
    });
    return dispose;
  }, [setSidebarCollapsed, setRightPanelCollapsed]);

  // Background commands — long-running shell processes started by the
  // agent (run_background_command) or by future user-side affordances.
  // Shape per item: { id, command, running, exitCode, startedAt, finishedAt,
  //   outputLength, lastDrainedLength, pendingBytes, truncated }.
  // We track lastDrainedLength in the renderer separate from the main-
  // process lastReadIdx so the input bar can show "+N bytes pending" and
  // the next user message can drain in one bgRead call.
  const [bgCommands, setBgCommands] = useState([]);
  const bgCommandsRef = useRef([]);
  useEffect(() => {
    bgCommandsRef.current = bgCommands;
  }, [bgCommands]);
  const [previewArtifactId, setPreviewArtifactId] = useState(null);
  // Pending run_command request from an Agent tool call. While non-null, the
  // `CommandExecuteModal` is open and the corresponding tool promise is
  // suspended waiting for the user. Shape:
  //   { command, cwd, explanation, resolve }
  const [pendingCommandExec, setPendingCommandExec] = useState(null);
  // Pending generic tool confirmation (delete_file / edit_file / etc.).
  // Shape: { toolName, argsSummary, args, resolve }
  const [pendingToolConfirm, setPendingToolConfirm] = useState(null);
  // Pending workspace deletion. While non-null the DeleteProjectModal is
  // mounted. Shape: { project, taskCount } — taskCount is precomputed
  // so the modal can offer the cascade-delete checkbox conditionally.
  const [pendingProjectDelete, setPendingProjectDelete] = useState(null);
  // Session-scoped "allow" grants. Lives for the lifetime of this tab.
  // Populated when user picks "本会话允许" in ToolConfirmModal.
  const sessionAllowsRef = useRef(new Set());
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const abortControllersRef = useRef({}); // userMsgId -> AbortController

  // Mirror refs for current right-panel state — used to snapshot / diff on retract
  // without polluting the handleSendMessage dependency array.
  const todoItemsRef = useRef(todoItems);
  const artifactsRef = useRef(artifacts);
  const referencesRef = useRef(references);
  // Mirror messages too — handleRevertFileChange needs to look up a
  // change record by id without taking `messages` as a dep (which would
  // re-bind the callback on every render and force ChatPanel to repaint).
  const messagesRef = useRef([]);
  // Mirror activeTask too — the assistant-finalize block needs to know
  // whether the user is STILL viewing the same task right now (so it
  // can decide whether to mark unread). Reading activeTask from the
  // handleSendMessage closure would give us the value captured when
  // the user pressed send, not the value at finalize time, which is
  // the wrong window.
  const activeTaskRef = useRef(activeTask);
  useEffect(() => {
    todoItemsRef.current = todoItems;
  }, [todoItems]);
  useEffect(() => {
    artifactsRef.current = artifacts;
  }, [artifacts]);
  useEffect(() => {
    referencesRef.current = references;
  }, [references]);
  useEffect(() => {
    activeTaskRef.current = activeTask;
  }, [activeTask]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // MCP — connect to configured servers on app mount and whenever the
  // user saves changes in Settings → MCP. The actual connection state is
  // owned by the registry singleton (`lib/mcp/registry`); we just kick
  // off (re)connects from here. The window-level helper lets the
  // SettingsModal trigger a reconnect after the user adds/edits a
  // server without us having to thread a callback through props.
  useEffect(() => {
    const cfg = readToolsConfig().mcp || {};
    mcp.connectAll(cfg.servers || []);
    if (typeof window !== "undefined") {
      window.__arcticReconnectMcp = () => {
        const next = readToolsConfig().mcp || {};
        return mcp.connectAll(next.servers || []);
      };
    }
    return () => {
      if (typeof window !== "undefined") {
        delete window.__arcticReconnectMcp;
      }
    };
  }, []);

  // The "effective" workspace the renderer is operating against right
  // now. When a task is active, we follow the *task's* projectId so the
  // sandbox / displayed badge align with the task's locked workspace.
  // Otherwise (new-chat draft, no task selected), fall back to the
  // user's globally-selected workspace.
  const effectiveProjectId = activeTask?.projectId || workspace;

  // ── Filesystem sandbox sync ─────────────────────────────────────────
  // Keep the Electron main process's allowed-roots list in sync with the
  // active workspace. Without this the main-process fs:* / exec sandbox
  // can't tell what's "inside the workspace" — and it defaults to
  // sandbox-OFF (no roots = back-compat with Playground). Whenever the
  // effective workspace changes (task switch OR global selector flip)
  // we replace the list; the main process automatically forgets any
  // previous session grants tied to the old workspace, so switching
  // tasks can't bleed permissions.
  useEffect(() => {
    if (!window.arcticAPI?.setAllowedRoots) return;
    const activeProject = projects.find((p) => p.id === effectiveProjectId);
    const root = activeProject?.path;
    const roots = root && typeof root === "string" ? [root] : [];
    // Fire-and-forget; main returns { ok, count } but we don't act on it.
    window.arcticAPI.setAllowedRoots(roots).catch(() => {
      /* IPC failure is non-fatal; sandbox just stays at previous state */
    });
  }, [effectiveProjectId, projects]);

  // ── External file change tracker ────────────────────────────────────
  // The Electron watcher (electron/main.js) pushes batched fs:externalChange
  // events whenever something in the active workspace mutates from outside
  // the AI's tool calls (user editing in another IDE, build artifacts,
  // git pull, etc.). We accumulate them into a Map keyed by relative path
  // — one entry per file, with the latest event type winning. The map is
  // injected as a system message before each user→assistant request and
  // cleared after the response settles (handled inside handleSend).
  //
  // Stored in a ref (not state) so accumulating events doesn't re-render
  // the whole app on every keystroke during a webpack rebuild.
  const externalChangesRef = useRef(new Map());
  useEffect(() => {
    if (!window.arcticAPI?.onFsExternalChange) return;
    const unsub = window.arcticAPI.onFsExternalChange(({ events }) => {
      if (!Array.isArray(events)) return;
      const map = externalChangesRef.current;
      for (const ev of events) {
        if (ev?.path && typeof ev.type === "string") {
          map.set(ev.path, ev.type);
        }
      }
    });
    return () => {
      try { unsub?.(); } catch { /* noop */ }
    };
  }, []);

  // ── Crash recovery ──────────────────────────────────────────────────
  // If the app was hard-killed (window closed, OS restart, tab crash)
  // mid-stream, the last persisted snapshot of `messages` may still have
  // a message stuck on `loading: true` / `isThinking: true`. The fetch
  // that would have flipped those flags is long gone, so without this
  // sweep the user reopens the app to a forever-spinning bubble.
  //
  // Run ONCE on mount: any message still in flight gets reconciled the
  // same way the AbortError / Stop-button path does — drop it entirely
  // if no tokens arrived, otherwise mark stopped so the action bar
  // (copy / retract) becomes available.
  const crashSweptRef = useRef(false);
  useEffect(() => {
    if (crashSweptRef.current) return;
    crashSweptRef.current = true;
    setMessages((prev) => {
      let changed = false;
      const next = [];
      for (const m of prev) {
        const stuck = m.loading || m.isThinking;
        if (!stuck) {
          next.push(m);
          continue;
        }
        changed = true;
        const hasPartial = !!(
          m.content ||
          m.thinking ||
          (Array.isArray(m.timeline) && m.timeline.length > 0) ||
          (Array.isArray(m.toolCalls) && m.toolCalls.length > 0)
        );
        if (!hasPartial) {
          // No tokens ever arrived — silently drop the orphan placeholder.
          continue;
        }
        // Mark any lingering live thinking event off so the pulse stops.
        const cleanedTimeline = Array.isArray(m.timeline)
          ? m.timeline.map((evt) =>
              evt.type === "thinking" && evt.isLive
                ? { ...evt, isLive: false }
                : evt,
            )
          : m.timeline;
        // Mark any lingering 'running' tool calls as 'error' so they
        // don't appear forever-spinning. The user can retract and retry.
        const cleanedToolCalls = Array.isArray(m.toolCalls)
          ? m.toolCalls.map((tc) =>
              tc.status === "running"
                ? {
                    ...tc,
                    status: "error",
                    result: { ok: false, error: "interrupted" },
                  }
                : tc,
            )
          : m.toolCalls;
        next.push({
          ...m,
          loading: false,
          isThinking: false,
          stopped: true,
          timeline: cleanedTimeline,
          toolCalls: cleanedToolCalls,
        });
      }
      return changed ? next : prev;
    });
    // setMessages identity is stable per useLocalStorage — safe to run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const applyTheme = (t) => {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const isDark =
        t === "dark" ||
        t === "modern-dark" ||
        (t === "system" && prefersDark) ||
        (t === "modern-system" && prefersDark);
      setIsDarkTheme(isDark);
      if (t === "modern") {
        document.documentElement.setAttribute("data-theme", "modern");
      } else if (t === "modern-dark") {
        document.documentElement.setAttribute("data-theme", "modern-dark");
      } else if (t === "modern-system") {
        document.documentElement.setAttribute("data-theme", prefersDark ? "modern-dark" : "modern");
      } else if (t === "modern-plus") {
        document.documentElement.setAttribute("data-theme", "modern-plus");
      } else if (isDark) {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    };
    applyTheme(theme);

    if (theme === "system" || theme === "modern-system") {
      const observer = window.matchMedia("(prefers-color-scheme: dark)");
      const listener = () => applyTheme(theme);
      observer.addEventListener("change", listener);
      return () => observer.removeEventListener("change", listener);
    }
  }, [theme]);

  // Called by the `run_command` tool runner: opens CommandExecuteModal and
  // returns a promise that resolves with the user's response (or ok:false if
  // they deny). We stash the resolver in state so the modal's submit/deny
  // buttons can fulfill it.
  const requestCommandExec = useCallback((req) => {
    return new Promise((resolve) => {
      setPendingCommandExec({ ...req, resolve });
    });
  }, []);

  // Called by any permission-gated tool (delete_file, edit_file, ...).
  // Delegates to lib/toolPermissions which inspects the stored policy;
  // only pops the modal when user hasn't pre-approved this tool.
  // Resolves 'allow' | 'deny'.
  const requestToolPermission = useCallback((req) => {
    return requestPermission(req, {
      sessionAllows: sessionAllowsRef.current,
      markSessionAllow: (name) => sessionAllowsRef.current.add(name),
      openConfirm: (r) =>
        new Promise((resolve) => {
          setPendingToolConfirm({ ...r, resolve });
        }),
    });
  }, []);

  const handleSendMessage = useCallback(
    async (content, attachments = [], references = []) => {
      // Treat sending a follow-up message as implicit acceptance of the
      // previous turn's pending file changes. This matches the user's
      // mental model: "I'm moving on, I'm fine with what was changed."
      // Anything they wanted to revert they would have reverted before
      // typing.
      if (activeTask?.id) {
        const taskId = activeTask.id;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.taskId !== taskId || !Array.isArray(m.fileChanges)) return m;
            if (!m.fileChanges.some((c) => c.status === "pending")) return m;
            return {
              ...m,
              fileChanges: m.fileChanges.map((c) =>
                c.status === "pending" ? { ...c, status: "kept" } : c,
              ),
            };
          }),
        );
      }
      let currentTaskId = activeTask?.id;
      // Auto-create a task if starting a new chat
      let isNewTask = false;
      // The workspace this request will use. For an existing task this
      // is **the task's own projectId** — locked at creation time, so
      // the user's later changes to the global workspace selector
      // (which only affect *new* conversations) don't leak into a
      // running task and accidentally route tool calls into a different
      // folder. For a new task, fall through to the global workspace.
      let currentProjectId = activeTask?.projectId || null;
      if (!currentTaskId) {
        isNewTask = true;
        currentTaskId = Date.now().toString();
        // Workspace validation: only fall back to playground if the
        // referenced project genuinely no longer exists (e.g. user
        // deleted it). The previous version also fell back when the
        // project's stored `mode` didn't match the current mode — that
        // silently ate user-selected workspaces whenever the user
        // toggled between code/agent modes, since projects are bound
        // to whichever mode they were created in. A folder is a folder;
        // the mode is just an AI-behavior flavor, not a property of
        // the workspace, so we no longer enforce that match.
        let effectiveProjectId = workspace;
        if (workspace !== "playground") {
          const wsProject = projects.find((p) => p.id === workspace);
          if (!wsProject) {
            effectiveProjectId = "playground";
          }
        }
        currentProjectId = effectiveProjectId;
        const newTask = {
          id: currentTaskId,
          projectId: effectiveProjectId,
          title: content.slice(0, 25) + (content.length > 25 ? "..." : ""),
          // status now reserved for terminal states ('completed' / 'error');
          // the blue "unread" dot lives on its own `unread` boolean and is
          // set when an assistant reply finalizes while the user is looking
          // at a different task. See the assistant-finalize block below.
          timestamp: new Date().toISOString(),
        };
        setTasks((prev) => [...prev, newTask]);
        // Defer setting active task to avoid complex setState timing issues right before fetch
        // We rely on currentTaskId for this request lifecycle
        setTimeout(() => setActiveTask(newTask), 0);
      }

      const userMsgId = Date.now().toString();
      const userMsg = {
        id: userMsgId,
        taskId: currentTaskId,
        role: "user",
        content,
        timestamp: new Date().toISOString(),
        attachments:
          Array.isArray(attachments) && attachments.length > 0
            ? attachments
            : undefined,
        references:
          Array.isArray(references) && references.length > 0
            ? // Strip out any handle-bearing fields before persisting; we only keep metadata.
              references.map(({ id, kind, name, size, mimeType, description }) => ({
                id,
                kind,
                name,
                size,
                mimeType,
                // Skill refs carry a one-line description so the manifest
                // line in buildReferenceBlock can preview them. Other ref
                // kinds leave this undefined which JSON.stringify drops.
                description,
              }))
            : undefined,
      };
      setMessages((prev) => [...prev, userMsg]);

      // Create AbortController for this request
      const abortController = new AbortController();
      abortControllersRef.current[userMsgId] = abortController;

      // Resolve provider routing (URL + API key + upstream model id). Uses
      // the shared `resolveProvider` helper so subagents (fast_context /
      // web_search) hit the exact same configuration.
      const resolved = resolveProvider(selectedModel);
      if (!resolved.ok) {
        const errMsg = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `> [!WARNING]\n> ${t(
            "providerRouting." + resolved.errorCode,
            { providerId: resolved.providerId?.toUpperCase() },
          )}`,
          model: selectedModel,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errMsg]);
        return;
      }
      const { baseUrl, apiKey, apiModelId } = resolved;

      // Generate title in background for new tasks
      if (isNewTask) {
        // Use the same selected provider to ask for a title, but we don't await it here
        // to avoid blocking the main chat response.
        fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: apiModelId,
            messages: [
              {
                role: "system",
                content:
                  "Generate a short, concise title (max 5 words) for this chat based on the user prompt. Return ONLY the title, no quotes or extra text.",
              },
              { role: "user", content },
            ],
            stream: false,
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            let raw = data.choices?.[0]?.message?.content || "";
            // Strip Gemma 4 / open-weight inline thinking blocks. These models
            // don't populate a separate reasoning channel; instead they wrap
            // chain-of-thought as <thought>...</thought> directly inside content.
            // Also strip any leftover <think>...</think> variant some fine-tunes use.
            raw = raw
              .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
              .replace(/<think>[\s\S]*?<\/think>/gi, "")
              // Unterminated leading thought block (model cut off before closing tag)
              .replace(/^[\s\S]*?<\/thought>/i, "")
              .replace(/^[\s\S]*?<\/think>/i, "")
              .trim();
            // Some models prefix with "Title:" or wrap in quotes — clean both.
            let newTitle = raw
              .replace(/^title\s*[:：]\s*/i, "")
              .replace(/^["'“”『「](.*)["'”“』」]$/s, "$1")
              .trim();
            // Take first non-empty line — Gemma sometimes adds an explanation
            // paragraph after the title even when told not to.
            const firstLine = newTitle.split(/\r?\n/).find((l) => l.trim());
            if (firstLine) newTitle = firstLine.trim();
            // Hard cap so a runaway response can't poison the sidebar.
            if (newTitle.length > 60) newTitle = newTitle.slice(0, 60).trim() + "…";
            if (newTitle) {
              setTasks((prev) =>
                prev.map((t) =>
                  t.id === currentTaskId ? { ...t, title: newTitle } : t,
                ),
              );
              setActiveTask((prev) =>
                prev?.id === currentTaskId
                  ? { ...prev, title: newTitle }
                  : prev,
              );
            }
          })
          .catch((e) => {
            // Ignore error, fallback to the truncated title we already set
            console.error("Failed to generate title", e);
          });
      }

      // Create placeholder assistant message
      const assistantMsgId = (Date.now() + 1).toString();
      const thinkingStartTime = Date.now();
      // Snapshot current right-panel state for this task so retract can roll back
      const rollbackSnapshot = {
        todos: todoItemsRef.current.filter((t) => t.taskId === currentTaskId),
        artifacts: artifactsRef.current.filter(
          (a) => a.taskId === currentTaskId,
        ),
        references: referencesRef.current.filter(
          (r) => r.taskId === currentTaskId,
        ),
      };
      const assistantMsg = {
        id: assistantMsgId,
        taskId: currentTaskId,
        role: "assistant",
        content: "",
        model: selectedModel,
        timestamp: new Date().toISOString(),
        loading: true,
        thinking: null,
        thinkingDuration: 0,
        userMsgId,
        toolCalls: [],
        apiTurns: [],
        rollback: rollbackSnapshot,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Function Calling:
      //  - Agent mode: full tool set (todos / artifacts / references / web / commands)
      //  - Code mode: only research/IO tools — no TODO / artifact creation so
      //    the model stays focused on writing code, not managing task state.
      const CODE_MODE_TOOLS = new Set([
        "update_progress",
        "read_reference",
        "read_file",
        "fast_context",
        "web_search",
        "fetch_url",
        "run_command",
        "create_file",
        "create_folder",
        "edit_file",
        "delete_file",
        // Phase 2 file system tools — workspace browsing & precision editing
        "list_directory",
        "find_files",
        "grep_files",
        "move_file",
        "copy_file",
        "search_replace",
        // Execution tools — Code mode is the natural place to run things.
        "execute_python",
        "run_background_command",
        "read_background_output",
        "stop_background_command",
        // Skills knowledge access.
        "read_skill",
      ]);
      // Built-in tools (filtered by mode) + every MCP tool from servers
      // currently in 'ready' state. MCP tools always come along regardless
      // of mode — the user explicitly opted in by configuring the server,
      // so they should be available whether the chat is agent or code.
      const builtinTools =
        mode === "agent"
          ? agentTools
          : agentTools.filter((t) => CODE_MODE_TOOLS.has(t.function.name));
      const mcpTools = mcp.getOpenAITools();
      const toolsForThisRequest = [...builtinTools, ...mcpTools];
      const useTools = toolsForThisRequest.length > 0;

      // Resolve workspace strictly from the *task's* projectId (see the
      // `currentProjectId` comment above). Falls back to null path for
      // Playground / missing projects, which keeps tool calls in
      // sandbox-disabled mode just like before.
      const activeProject =
        currentProjectId && currentProjectId !== "playground"
          ? projects.find((p) => p.id === currentProjectId)
          : null;
      const projectPath = activeProject?.path || null;

      const builtinRunner = createToolRunner({
        taskId: currentTaskId,
        projectPath,
        setTodoItems,
        setTaskProgress,
        setArtifacts,
        setReferences,
        // Live reader so fast_context sees refs added AFTER the runner
        // was created (e.g. via other tools earlier in the same turn).
        getTaskReferences: () =>
          referencesRef.current.filter((r) => r.taskId === currentTaskId),
        requestCommandExec,
        requestToolPermission,
        onBackgroundStarted: handleBackgroundStarted,
        // Live skills reader — read_skill resolves through this each
        // call, so additions / edits made mid-conversation are visible.
        getSkills: () => skills,
      });
      // Unified dispatcher: anything starting with `mcp__` is routed to the
      // MCP registry, everything else goes through the built-in runner.
      // Both code paths return a `{ ok, ... }` shape so the agent loop
      // doesn't need to special-case MCP results.
      const toolRunner = async (name, args) => {
        if (mcp.isMcpTool(name)) {
          return mcp.callTool(name, args);
        }
        return builtinRunner(name, args);
      };

      // Build a trailing block describing any referenced resources.
      // Two flavours:
      //   - Skill refs (kind='skill') — point the agent at `read_skill`.
      //     We embed the skill's id directly so it doesn't have to guess.
      //   - File / folder / terminal refs — go through `read_reference`,
      //     which resolves the IndexedDB-backed handle.
      // References are NOT inlined as content; they're just a manifest.
      const buildReferenceBlock = (refs) => {
        if (!Array.isArray(refs) || refs.length === 0) return "";
        const skillRefs = refs.filter((r) => r.kind === "skill");
        const otherRefs = refs.filter((r) => r.kind !== "skill");
        const sections = [];
        if (otherRefs.length > 0) {
          const lines = otherRefs
            .map((r) => {
              const meta = [];
              if (r.kind) meta.push(`kind=${r.kind}`);
              if (typeof r.size === "number") meta.push(`size=${r.size}`);
              if (r.mimeType) meta.push(`mime=${r.mimeType}`);
              return `- [${r.kind}] ${r.name}  (reference_id: ${r.id}${meta.length ? `, ${meta.join(", ")}` : ""})`;
            })
            .join("\n");
          sections.push(
            "【用户引用的资源 — 未直接发送内容，需要时请调用 read_reference 工具读取】\n" +
              lines,
          );
        }
        if (skillRefs.length > 0) {
          const lines = skillRefs
            .map(
              (r) =>
                `- [skill] ${r.name}  (skill_id: ${r.id}${r.description ? `, ${r.description}` : ""})`,
            )
            .join("\n");
          sections.push(
            "【用户引用的 Skills — 未直接发送内容，需要时请调用 read_skill(skill_id=...) 读取完整 markdown】\n" +
              lines,
          );
        }
        return sections.length ? "\n\n---\n" + sections.join("\n\n") : "";
      };

      // Convert a user message (possibly with attachments) into OpenAI-compatible content.
      // Returns a plain string if there are no attachments, otherwise a content-parts array.
      const buildUserContent = (m) => {
        const atts = Array.isArray(m.attachments) ? m.attachments : [];
        const refs = Array.isArray(m.references) ? m.references : [];
        const baseText = (m.content || "") + buildReferenceBlock(refs);
        if (atts.length === 0) return baseText;
        const parts = [];
        if (baseText) parts.push({ type: "text", text: baseText });
        for (const a of atts) {
          if (a.kind === "image" && a.dataUrl) {
            parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
          } else if (a.kind === "audio" && a.dataUrl) {
            const match = /^data:audio\/([\w+-]+);base64,(.+)$/.exec(a.dataUrl);
            if (match) {
              parts.push({
                type: "input_audio",
                input_audio: { data: match[2], format: match[1] },
              });
            }
          }
        }
        return parts.length > 0 ? parts : baseText;
      };

      // Hoisted so the catch block can also reference them when committing
      // partial state on Stop / AbortError.
      const accumulatedTurns = [];
      const accumulatedToolCalls = [];
      // Interleaved per-iteration render timeline. Each iteration produces
      // zero-or-one `thinking` event followed by zero-or-one `tool_calls`
      // batch event — so the UI can show thinking→tools→thinking→tools in
      // the order they actually happened, not thinking-all-at-top. Events:
      //   { type: 'thinking', id, text, duration?, isLive }
      //   { type: 'tool_calls', id, calls: [card] }  // calls mutated in place
      const timeline = [];

      try {
        // Build messages history for API from prior task turns + new user message.
        // For prior assistant messages, reuse their `apiTurns` so tool-call history is preserved.
        const apiMessages = [];

        // User-defined custom system prompt (Settings → 聊天偏好). Injected
        // before any other system content so it sets the persona/style first.
        const userSystemPrompt = (readToolsConfig().chat?.customSystemPrompt || '').trim();
        if (userSystemPrompt) {
          apiMessages.push({
            role: "system",
            content: userSystemPrompt,
          });
        }

        // Tell the model what workspace it's operating in. Without this it
        // doesn't know the absolute path, so when it calls run_command it
        // tends to omit cwd entirely — and the renderer used to silently
        // fall back to the user's home directory (~/, /Users/Mac on macOS,
        // C:\Users\<name> on Windows). The cwd resolution in tools.js now
        // also defaults to projectPath, but exposing it here lets the
        // model construct correct absolute paths in its commands directly.
        if (projectPath) {
          // Workspace path + tool conventions.
          let workspaceMsg =
            `当前活动工作区的绝对路径为：${projectPath}\n` +
            `所有 read_file / create_file / edit_file / delete_file / search_replace / list_directory / find_files / grep_files / move_file / copy_file 的 path 参数都是相对于该工作区根目录的相对路径（不要传绝对路径）。\n` +
            `run_command 默认在该工作区根目录下执行；如需切换到子目录，可在 cwd 参数里传入相对路径（如 "src/lib"）或绝对路径。`;

          // Workspace tree snapshot. Computed fresh on every request
          // (cheap — single recursive readdir capped at 400 entries).
          // Gives the model a bird's-eye view so it can pick paths
          // without first having to call list_directory.
          if (window.arcticAPI?.fsTree) {
            try {
              const treeRes = await window.arcticAPI.fsTree({
                rootPath: projectPath,
                maxEntries: 400,
                maxDepth: 6,
              });
              if (treeRes?.ok && treeRes.tree) {
                workspaceMsg +=
                  `\n\n工作区文件树（节选，深度≤6，最多 400 项；自动跳过 node_modules / .git / dist 等）：\n` +
                  "```\n" + treeRes.tree + "\n```";
                if (treeRes.truncated) {
                  workspaceMsg +=
                    "\n（树已截断；想查看更多深处文件请使用 list_directory / find_files）";
                }
              }
            } catch {
              /* fsTree failure non-fatal — model just won't see the tree */
            }
          }

          // External-change notice — files that were modified outside the
          // AI's own tool calls since the last response. Forces the model
          // to re-read before editing instead of trusting a stale copy.
          const changes = externalChangesRef.current;
          if (changes.size > 0) {
            // Group by event type for readability.
            const byType = { add: [], change: [], unlink: [] };
            for (const [p, t] of changes) {
              if (byType[t]) byType[t].push(p);
            }
            const fmt = (label, paths) =>
              paths.length > 0
                ? `\n${label}：\n${paths.slice(0, 50).map((p) => "  - " + p).join("\n")}${paths.length > 50 ? `\n  …（还有 ${paths.length - 50} 个）` : ""}`
                : "";
            workspaceMsg +=
              `\n\n⚠ 自上次响应以来，工作区发生了以下**外部**文件变更（不是你的 tool_call 造成的）。在编辑相关文件前，请先 read_file 重新获取最新内容：` +
              fmt("修改", byType.change) +
              fmt("新增", byType.add) +
              fmt("删除", byType.unlink);
            // Clear once injected so we don't re-spam on the next request.
            externalChangesRef.current = new Map();
          }

          apiMessages.push({
            role: "system",
            content: workspaceMsg,
          });
        }

        // Drain new output from every still-tracked background command and
        // surface it to the model as a system message. Two reasons we do
        // this on every send (not just turn-1):
        //   1. The user's message often references the dev server's
        //      latest log line ("why did it 404?"). The model needs that
        //      log without having to call read_background_output first.
        //   2. Even silent commands count — telling the model "(no new
        //      output)" lets it know the process is still alive and
        //      idle, instead of guessing.
        // We update lastDrainedLength locally so the input-bar pending
        // badge resets to 0 right after sending.
        if (window.arcticAPI?.bgRead && bgCommandsRef.current.length > 0) {
          const lines = [];
          const drainedSnapshots = [];
          for (const cmd of bgCommandsRef.current) {
            // Read sinceLast=true so the main process advances its own
            // read pointer too — keeps both sides in sync.
            try {
              const r = await window.arcticAPI.bgRead({
                id: cmd.id,
                sinceLast: true,
              });
              if (!r?.ok) continue;
              const newOutput = r.output || "";
              drainedSnapshots.push({
                id: cmd.id,
                outputLength: r.snapshot?.outputLength ?? cmd.outputLength,
              });
              const status = r.snapshot?.running
                ? "运行中"
                : `已退出（exit ${r.snapshot?.exitCode ?? "?"}）`;
              const block = newOutput.trim()
                ? `\`\`\`\n${newOutput.slice(-4000)}\n\`\`\``
                : "(无新输出)";
              lines.push(
                `### 后台命令 \`${cmd.command}\` [id=${cmd.id}, ${status}]\n${block}`,
              );
            } catch {
              /* skip; main may have garbage-collected the entry */
            }
          }
          if (drainedSnapshots.length > 0) {
            setBgCommands((prev) =>
              prev.map((x) => {
                const drained = drainedSnapshots.find((d) => d.id === x.id);
                if (!drained) return x;
                return {
                  ...x,
                  lastDrainedLength: drained.outputLength,
                  pendingBytes: 0,
                };
              }),
            );
          }
          if (lines.length > 0) {
            apiMessages.push({
              role: "system",
              content:
                "以下是用户发送本条消息时，运行中的后台命令的最新输出快照（自上次发送以来的增量）。如果用户的问题与这些输出有关，请直接基于此回答；不需要再调用 read_background_output。\n\n" +
                lines.join("\n\n"),
            });
          }
        }

        // Prepend a system message containing enabled skill content as a knowledge base.
        // Each skill becomes a clearly delimited section so the model can cite by name.
        const enabledSkills = (skills || []).filter(
          (s) =>
            s.enabled !== false &&
            typeof s.content === "string" &&
            s.content.length > 0,
        );
        if (enabledSkills.length > 0) {
          // Manifest first — a one-line summary per skill (name +
          // description + when_to_use) so the model can scan and pick
          // the right one without re-reading every full body.
          const manifestLines = enabledSkills.map((s) => {
            const parts = [`• ${s.name}`];
            if (s.description) parts.push(`— ${s.description}`);
            if (s.whenToUse) {
              const oneLine = String(s.whenToUse).replace(/\s+/g, " ").trim();
              if (oneLine) parts.push(`(用于：${oneLine.slice(0, 120)})`);
            }
            return parts.join(" ");
          });
          // Full content sections — keep the existing format so older
          // chats still render the same. The body comes verbatim,
          // including any frontmatter the user authored.
          const sections = enabledSkills
            .map((s) => {
              const header = `## ${s.name}${s.truncated ? "  (truncated)" : ""}`;
              return `${header}\n${s.content}`;
            })
            .join("\n\n---\n\n");
          apiMessages.push({
            role: "system",
            content:
              '以下是用户导入的"技能"知识库。先看清单，再按需参考完整内容；仅在相关时使用并在回答中可引用来源名。\n\n' +
              "### 技能清单\n" +
              manifestLines.join("\n") +
              "\n\n### 详细内容\n\n" +
              sections,
          });
        }

        const priorTurns = [...messages, userMsg].filter(
          (m) =>
            m.taskId === currentTaskId &&
            !(m.role === "assistant" && m.loading),
        );
        for (const m of priorTurns) {
          if (m.role === "user") {
            apiMessages.push({ role: "user", content: buildUserContent(m) });
          } else if (m.role === "assistant") {
            if (Array.isArray(m.apiTurns) && m.apiTurns.length > 0) {
              for (const t of m.apiTurns) apiMessages.push(t);
            } else if (m.content) {
              apiMessages.push({ role: "assistant", content: m.content });
            }
          }
        }
        if (apiMessages.length === 0) {
          apiMessages.push({
            role: "user",
            content: buildUserContent(userMsg),
          });
        }

        // Read max iterations from chat settings; clamp to safe range.
        const chatCfg = readToolsConfig().chat || {};
        const MAX_ITERATIONS = Math.max(1, Math.min(20, Number(chatCfg.maxAgentIterations) || 8));
        // `accumulatedTurns` and `accumulatedToolCalls` are declared above the
        // `try` block so the catch branch can still read them after an abort.
        const accumulatedTexts = [];
        let accumulatedThinking = "";
        let finalText = "";
        let iteration = 0;
        // Token usage tally — sum across iterations. inputRaw is the
        // size of the full apiMessages we COULD have sent; inputWire is
        // what we actually sent after compression. outputTokens is the
        // model's own response (content + thinking) per iteration.
        const tokenStats = { inputRaw: 0, inputWire: 0, output: 0 };

        while (iteration < MAX_ITERATIONS) {
          iteration++;
          // Per-iteration thinking event: created LAZILY when the first
          // non-empty reasoning chunk arrives. This avoids two visual
          // glitches: (1) an empty "正在思考…" block flashing for models
          // that don't emit reasoning at all, and (2) the same block
          // suddenly disappearing at iteration end when no thinking was
          // produced. Mirrors the existing lazy pattern for textEvt.
          const iterStart = Date.now();
          const thinkEvtId = `iter-${iteration}-think-${iterStart}`;
          let thinkEvtCreated = false;
          const ensureThinkEvt = () => {
            if (thinkEvtCreated) return;
            thinkEvtCreated = true;
            timeline.push({
              type: "thinking",
              id: thinkEvtId,
              text: "",
              isLive: true,
              duration: 0,
            });
          };
          const replaceThinkEvt = (patch) => {
            if (!thinkEvtCreated) return;
            const idx = timeline.findIndex((e) => e.id === thinkEvtId);
            if (idx >= 0) timeline[idx] = { ...timeline[idx], ...patch };
          };

          // Text event for this iteration's visible content. Created lazily
          // the first time snap.content is non-empty so we don't pollute
          // the timeline with empty text blocks when a turn is purely
          // reasoning + tool calls.
          let textEvtId = null;
          const ensureTextEvt = () => {
            if (textEvtId) return;
            textEvtId = `iter-${iteration}-text-${Date.now()}`;
            timeline.push({ type: "text", id: textEvtId, text: "" });
          };
          const replaceTextEvt = (patch) => {
            if (!textEvtId) return;
            const idx = timeline.findIndex((e) => e.id === textEvtId);
            if (idx >= 0) timeline[idx] = { ...timeline[idx], ...patch };
          };

          // Tool-call event for this iteration. Created lazily the FIRST
          // time the streaming snapshot reveals tool_calls — even before
          // arguments finish streaming — so the user sees the card pop up
          // immediately instead of staring at a frozen UI while waiting
          // for `await streamChatCompletion` to settle.
          //
          // Cards rendered during this phase have status='running' but
          // partial args (whatever JSON has accumulated so far parses to).
          // After the stream resolves, we promote them with the final
          // parsed args/ids and then execute.
          let toolsEvtId = null;
          const ensureToolsEvt = () => {
            if (toolsEvtId) return;
            toolsEvtId = `iter-${iteration}-tools-${Date.now()}`;
            timeline.push({ type: "tool_calls", id: toolsEvtId, calls: [] });
          };
          const setToolsEvtCalls = (calls) => {
            if (!toolsEvtId) return;
            const idx = timeline.findIndex((e) => e.id === toolsEvtId);
            if (idx >= 0) timeline[idx] = { ...timeline[idx], calls };
          };

          // "压箱底" — compress the per-request copy of apiMessages.
          // The original `apiMessages` array is preserved in-memory (and
          // mutated below as new turns arrive); only the wire-format
          // copy is squeezed. If compression is disabled the function
          // is essentially a deep-clone identity (still safe).
          const ccCfg = readToolsConfig().contextCompression || {};
          const wireMessages = ccCfg.enabled === false
            ? apiMessages
            : compressApiMessages(apiMessages, {
                evictThinking: ccCfg.evictThinking !== false,
                evictToolResults: ccCfg.evictToolResults !== false,
                evictionMinChars: Number(ccCfg.evictionMinChars) || 800,
                slidingWindow: Number(ccCfg.slidingWindow) || 4,
                summaryMode: ccCfg.summaryMode || 'truncate',
                enableCaching: ccCfg.enableCaching !== false,
                providerId: resolved.providerId,
              });

          // Tally input tokens for THIS iteration. estimateMsgTokens is
          // a coarse char-based heuristic shared with the compressor —
          // good enough for "saved X tokens" UI math, not a billing
          // ground truth.
          if (ccCfg.showTokenStats) {
            tokenStats.inputRaw += estimateMsgTokens(apiMessages);
            tokenStats.inputWire += estimateMsgTokens(wireMessages);
          }

          const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: apiModelId,
              messages: wireMessages,
              stream: true,
              tools: useTools ? toolsForThisRequest : undefined,
            }),
            signal: abortController.signal,
          });

          if (!response.ok) {
            const errText = await response.text();
            const duration = ((Date.now() - thinkingStartTime) / 1000).toFixed(
              1,
            );
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: `> [!CAUTION]\n> ${t("app.apiError", { status: response.status })}:\n\`\`\`\n${errText.substring(0, 500)}\n\`\`\``,
                      loading: false,
                      thinkingDuration: parseFloat(duration),
                    }
                  : m,
              ),
            );
            return;
          }

          // Stream the response. Each chunk updates the placeholder message in
          // place so tokens appear as they arrive rather than after the whole
          // response is buffered. The previous `await response.text()` path had
          // the side-effect of freezing the UI until the model was fully done.
          const parsed = await streamChatCompletion(response, (snap) => {
            // Per-iteration thinking goes into THIS iteration's timeline
            // event. Live-pulse while there's reasoning but no content yet.
            // Only create the event once we have actual reasoning text —
            // prevents an empty "正在思考…" placeholder from flashing for
            // models that don't emit reasoning.
            const iterThinking = snap.thinking || "";
            const live = !!iterThinking && !snap.content;
            if (iterThinking) {
              ensureThinkEvt();
              replaceThinkEvt({ text: iterThinking, isLive: live });
            }

            // Mirror visible content into THIS iteration's text event so
            // the UI can show text arriving between tool batches rather
            // than waiting for the final commit. First non-empty chunk
            // lazily creates the event.
            if (snap.content) {
              ensureTextEvt();
              replaceTextEvt({ text: snap.content });
            }

            // Stream-aware tool-call cards: pop them in as soon as the
            // model reveals a tool_call (name visible). Args may still be
            // accumulating — that's OK, we update on every chunk.
            if (Array.isArray(snap.tool_calls) && snap.tool_calls.length > 0) {
              ensureToolsEvt();
              const liveCards = snap.tool_calls.map((tc) => {
                let parsedArgs = {};
                try {
                  parsedArgs = JSON.parse(tc.function?.arguments || "{}");
                } catch {
                  // Args still streaming as a partial JSON fragment —
                  // leave args empty until parseable. The card still
                  // shows the tool name and "处理中…" pulse.
                }
                return {
                  id: tc.id,
                  name: tc.function?.name || "",
                  args: parsedArgs,
                  status: "running",
                  result: null,
                };
              });
              setToolsEvtCalls(liveCards);
            }

            // Legacy `thinking` field: full concatenation across iterations,
            // still used for context-token estimation and as a fallback for
            // older messages without `timeline`.
            const liveThinking = iterThinking
              ? accumulatedThinking
                ? accumulatedThinking + "\n\n---\n\n" + iterThinking
                : iterThinking
              : accumulatedThinking || null;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: snap.content || "",
                      thinking: liveThinking,
                      isThinking: live,
                      timeline: [...timeline],
                      toolCalls: accumulatedToolCalls,
                      loading: true,
                    }
                  : m,
              ),
            );
          });

          // Inline tool-call recovery: some open-weight models (Gemma 4,
          // certain Qwen / Hermes / Llama fine-tunes) emit function calls
          // as TEXT inside `content` rather than via the structured
          // `tool_calls` channel. If the structured channel is empty but
          // the content matches a known inline pattern, synthesise the
          // calls and strip them from the visible text so the agent loop
          // can dispatch them and the user doesn't see duplicate output.
          if (
            (!parsed.tool_calls || parsed.tool_calls.length === 0) &&
            useTools &&
            typeof parsed.content === "string" &&
            parsed.content.length > 0
          ) {
            const allowed = new Set(
              toolsForThisRequest.map((t) => t.function.name),
            );
            const recovered = extractInlineToolCalls(parsed.content, allowed);
            if (recovered.calls.length > 0) {
              parsed.tool_calls = recovered.calls;
              parsed.content = recovered.cleanedContent;
              // Re-render the placeholder so cards appear for the recovered
              // calls (the streaming `onChunk` path missed them since the
              // provider never produced delta.tool_calls).
              ensureToolsEvt();
              const liveCards = recovered.calls.map((tc) => {
                let parsedArgs = {};
                try {
                  parsedArgs = JSON.parse(tc.function?.arguments || "{}");
                } catch {
                  /* ignore */
                }
                return {
                  id: tc.id,
                  name: tc.function?.name || "",
                  args: parsedArgs,
                  status: "running",
                  result: null,
                };
              });
              setToolsEvtCalls(liveCards);
              if (parsed.content) {
                ensureTextEvt();
                replaceTextEvt({ text: parsed.content });
              } else if (textEvtId) {
                const idx = timeline.findIndex((e) => e.id === textEvtId);
                if (idx >= 0) timeline.splice(idx, 1);
                textEvtId = null;
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, timeline: [...timeline] }
                    : m,
                ),
              );
            }
          }

          // Record assistant turn for API history (next iteration + future user turns)
          const turn = { role: "assistant", content: parsed.content || "" };
          if (parsed.tool_calls && parsed.tool_calls.length > 0) {
            turn.tool_calls = parsed.tool_calls;
          }
          apiMessages.push(turn);
          accumulatedTurns.push(turn);

          // Tally output tokens (content + thinking + tool_call args).
          if (ccCfg.showTokenStats) {
            tokenStats.output += estimateMsgTokens([
              { role: "assistant", content: parsed.content || "", thinking: parsed.thinking || "", tool_calls: parsed.tool_calls },
            ]);
          }

          // Finalize this iteration's thinking event: lock live off, record
          // elapsed time, or drop it if the model didn't reason at all.
          const iterDuration = parseFloat(
            ((Date.now() - iterStart) / 1000).toFixed(1),
          );
          if (parsed.thinking) {
            ensureThinkEvt();
            replaceThinkEvt({
              text: parsed.thinking,
              isLive: false,
              duration: iterDuration,
            });
            accumulatedThinking = accumulatedThinking
              ? accumulatedThinking + "\n\n---\n\n" + parsed.thinking
              : parsed.thinking;
          } else if (thinkEvtCreated) {
            // Stream emitted partial reasoning that didn't make it into
            // the final parsed payload (rare provider quirk) — drop the
            // orphaned event so the UI doesn't show a stale block.
            const idx = timeline.findIndex((e) => e.id === thinkEvtId);
            if (idx >= 0) timeline.splice(idx, 1);
          }
          // Finalize the text event: keep final content or drop empty ones.
          if (parsed.content) {
            ensureTextEvt();
            replaceTextEvt({ text: parsed.content });
            accumulatedTexts.push(parsed.content);
          } else if (textEvtId) {
            const idx = timeline.findIndex((e) => e.id === textEvtId);
            if (idx >= 0) timeline.splice(idx, 1);
            textEvtId = null;
          }

          // If no tool calls, this is the final turn. `finalText` is the
          // full cumulative text across iterations (used by the copy
          // button + API history). UI rendering itself reads from
          // `timeline`'s text events, so this joined string is purely for
          // clipboard / backwards-compat purposes.
          if (!parsed.tool_calls || parsed.tool_calls.length === 0) {
            finalText = accumulatedTexts.length
              ? accumulatedTexts.join("\n\n")
              : t("app.noResponseContent");
            break;
          }

          // Sanitize tool_calls before dispatch — defends against three
          // classes of provider misbehavior that previously caused the
          // chat to "hang" or hard-fail on the next turn:
          //
          //   • 重复或缺失的 tool_call_id — OpenAI/Google/Anthropic all
          //     reject the next request if the assistant turn references
          //     duplicate ids; we synthesise unique ones here.
          //   • function.name 为空 — accumulator already drops these in
          //     snapshot(), but defend in depth.
          //   • arguments 不是合法 JSON — previously silently fell back
          //     to `{}` and let the model rediscover the failure on the
          //     next turn (often by retrying the same garbage). Now we
          //     surface the parse error as the tool result so the model
          //     gets immediate, actionable feedback.
          const seenIds = new Set();
          parsed.tool_calls = parsed.tool_calls
            .filter((tc) => tc?.function?.name)
            .map((tc, i) => {
              let id = tc.id;
              if (!id || seenIds.has(id)) {
                id = `call_dedup_${Date.now()}_${i}`;
              }
              seenIds.add(id);
              return { ...tc, id };
            });

          // Execute tool calls IN PARALLEL. First push all as "running" so the
          // UI shows every pending card at once; then `Promise.all` actually
          // runs them concurrently. Tool-role messages are collected into an
          // index-aligned array and only appended to apiMessages *after* all
          // calls finish, preserving the tc.id ↔ result order that the OpenAI
          // API requires (tool messages must follow the assistant message's
          // tool_calls in the same order).
          const newCards = parsed.tool_calls.map((tc) => {
            let args = {};
            let argsParseError = null;
            try {
              args = JSON.parse(tc.function.arguments || "{}");
            } catch (e) {
              argsParseError = e?.message || "invalid JSON arguments";
            }
            return {
              id: tc.id,
              name: tc.function.name,
              args,
              argsParseError,
              status: argsParseError ? "error" : "running",
              result: argsParseError
                ? {
                    ok: false,
                    error: `参数解析失败（${argsParseError}）。请检查工具调用 JSON 格式。`,
                    raw_arguments: String(tc.function.arguments || "").slice(
                      0,
                      500,
                    ),
                  }
                : null,
            };
          });
          accumulatedToolCalls.push(...newCards);
          // Reuse the streaming-time tool_calls event if it was created
          // during onChunk; otherwise lazy-create one now (e.g. providers
          // that bundle tool_calls only into the final non-streamed
          // response, or whose stream produced calls below the
          // detection threshold).
          ensureToolsEvt();
          setToolsEvtCalls(newCards.map((c) => ({ ...c })));
          const replaceToolCall = (callId, patch) => {
            const evtIdx = timeline.findIndex((e) => e.id === toolsEvtId);
            if (evtIdx < 0) return;
            const evt = timeline[evtIdx];
            const callIdx = evt.calls.findIndex((c) => c.id === callId);
            if (callIdx < 0) return;
            const nextCalls = evt.calls.slice();
            nextCalls[callIdx] = { ...nextCalls[callIdx], ...patch };
            timeline[evtIdx] = { ...evt, calls: nextCalls };
          };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    toolCalls: [...accumulatedToolCalls],
                    thinking: accumulatedThinking || null,
                    timeline: [...timeline],
                  }
                : m,
            ),
          );

          // Per-call hard timeout. Some tools legitimately wait on user
          // confirmation (run_command / edit_file permission gates) so
          // we set this generously — anything still pending after 10
          // minutes is almost certainly stuck (orphaned modal, hung
          // network call, dead Electron IPC, etc.) and we'd rather fail
          // the call than let the agent loop sit forever.
          const TOOL_TIMEOUT_MS = 10 * 60 * 1000;
          // Stable JSON serialiser that survives undefined / circular /
          // BigInt without throwing. Falls back to a string description
          // so the next turn's API request never gets `content: undefined`
          // (which would 400 on every major provider).
          const safeSerialize = (value) => {
            if (value === undefined) return '{"ok":false,"error":"tool returned undefined"}';
            try {
              const seen = new WeakSet();
              const out = JSON.stringify(value, (_k, v) => {
                if (typeof v === "bigint") return String(v);
                if (typeof v === "object" && v !== null) {
                  if (seen.has(v)) return "[Circular]";
                  seen.add(v);
                }
                return v;
              });
              return typeof out === "string"
                ? out
                : '{"ok":false,"error":"tool result not serialisable"}';
            } catch (e) {
              return JSON.stringify({
                ok: false,
                error: `serialisation failed: ${e?.message || String(e)}`,
              });
            }
          };

          const toolMsgs = new Array(parsed.tool_calls.length);
          // Per-message accumulator for the input-bar "review changes" strip.
          // Each entry: { id, path, action: 'create'|'edit'|'delete', oldContent: string|null, status: 'pending' }.
          // We snapshot the FIRST mutation per path within this turn (so multiple
          // edits to the same file collapse into a single "before" version that
          // restores fully on undo) and skip secondary writes once captured.
          const FILE_MUTATION_TOOLS = new Set([
            "create_file",
            "create_folder",
            "edit_file",
            "delete_file",
            "search_replace",
            "copy_file",
          ]);
          const accumulatedFileChanges = [];
          const seenPaths = new Set();
          const captureBefore = async (toolName, args) => {
            if (!FILE_MUTATION_TOOLS.has(toolName)) return null;
            if (!projectPath || !window.arcticAPI?.fsReadFile) return null;
            // Resolve which path this call mutates. Different tools use
            // different arg names — keep this list in sync with tools.js.
            const rawPath =
              args?.path ||
              args?.to_path /* copy_file */ ||
              null;
            if (typeof rawPath !== "string" || !rawPath) return null;
            const parsed = parseRelativePath(rawPath);
            if (parsed.error) return null;
            const fullPath = getNativePath(projectPath, parsed.segments);
            // Best-effort read. fsReadFile returns ok:false when the file
            // doesn't exist yet — that's the "create" signal.
            try {
              const prev = await window.arcticAPI.fsReadFile({ filePath: fullPath });
              return {
                rawPath,
                fullPath,
                oldContent: prev?.ok ? (prev.content ?? "") : null,
                existed: !!prev?.ok,
              };
            } catch {
              return { rawPath, fullPath, oldContent: null, existed: false };
            }
          };
          const recordFileChange = (toolName, args, before) => {
            if (!before) return;
            if (seenPaths.has(before.fullPath)) return;
            seenPaths.add(before.fullPath);
            // Infer action: explicit per-tool mapping is clearer than guessing.
            let action;
            if (toolName === "delete_file") action = "delete";
            else if (toolName === "create_folder")
              action = before.existed ? "edit" /* no-op really */ : "create-folder";
            else action = before.existed ? "edit" : "create";
            accumulatedFileChanges.push({
              id: `fc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              path: before.rawPath,
              fullPath: before.fullPath,
              action,
              oldContent: before.oldContent,
              status: "pending",
              toolName,
            });
          };
          // Dispatch tools SEQUENTIALLY, not via Promise.all. Reasons:
          //   1. ToolConfirmModal can only display one prompt at a time —
          //      parallel dispatch would leave N-1 calls pending forever
          //      (visible to the user as "the chat is frozen").
          //   2. File-mutation tools (create_file / edit_file / move_file …)
          //      hitting the same path concurrently is a race.
          //   3. The user mental model is "one step at a time" anyway.
          // We still use the timeout + abort race per call, and break out
          // of the loop on abort so subsequent calls don't fire.
          for (let idx = 0; idx < parsed.tool_calls.length; idx++) {
            const tc = parsed.tool_calls[idx];
            {
              const card = newCards[idx];
              let result;
              if (card.argsParseError) {
                // Already populated with the parse-error result during
                // newCards construction — just forward it without
                // touching toolRunner.
                result = card.result;
              } else {
                let timer;
                const timeout = new Promise((_resolve, reject) => {
                  timer = setTimeout(() => {
                    reject(
                      new Error(
                        `工具 ${card.name} 超时（${Math.round(TOOL_TIMEOUT_MS / 1000)}s 内未返回）`,
                      ),
                    );
                  }, TOOL_TIMEOUT_MS);
                });
                // If the user hits "stop" mid-tool, the outer abort
                // controller fires; race against it so the call can't
                // outlive the user's intent. We wrap in a fresh
                // Promise so the listener can be cleaned up.
                let abortListener;
                const aborted = new Promise((_resolve, reject) => {
                  if (abortController.signal.aborted) {
                    reject(
                      Object.assign(new Error("aborted"), { name: "AbortError" }),
                    );
                    return;
                  }
                  abortListener = () =>
                    reject(
                      Object.assign(new Error("aborted"), { name: "AbortError" }),
                    );
                  abortController.signal.addEventListener("abort", abortListener);
                });
                // Snapshot the file's pre-mutation state so the chat
                // input bar's "review changes" strip can offer per-file
                // undo. Best-effort only — if we can't read the old
                // content we skip recording (the user just won't get an
                // undo button for that one).
                const fcBefore = await captureBefore(
                  tc.function.name,
                  card.args,
                );
                try {
                  result = await Promise.race([
                    toolRunner(tc.function.name, card.args),
                    timeout,
                    aborted,
                  ]);
                  if (result?.ok) {
                    recordFileChange(tc.function.name, card.args, fcBefore);
                  }
                } catch (e) {
                  result = {
                    ok: false,
                    error: e?.message || String(e),
                    ...(e?.name === "AbortError" ? { aborted: true } : {}),
                  };
                } finally {
                  clearTimeout(timer);
                  if (abortListener) {
                    abortController.signal.removeEventListener(
                      "abort",
                      abortListener,
                    );
                  }
                }
              }
              // Last-line tool defenses: never let undefined/null bubble
              // into the API content field.
              if (result === undefined || result === null) {
                result = { ok: false, error: "tool returned no result" };
              }
              card.status = result?.ok ? "success" : "error";
              card.result = result;
              replaceToolCall(card.id, {
                status: card.status,
                result: card.result,
              });
              toolMsgs[idx] = {
                role: "tool",
                tool_call_id: tc.id,
                content: safeSerialize(result),
              };
              // Each settle triggers a re-render so cards flip green/red live.
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        toolCalls: [...accumulatedToolCalls],
                        timeline: [...timeline],
                        fileChanges: [...accumulatedFileChanges],
                      }
                    : m,
                ),
              );
              // If the user hit "stop" mid-batch, don't keep dispatching
              // the rest — it would feel like the stop button doesn't work.
              if (abortController.signal.aborted) break;
            }
          }

          // Append tool results to API history. Each slot is guaranteed
          // populated by the dispatch loop above (success / error /
          // aborted / args-parse-error all hit the `toolMsgs[idx] = …`
          // assignment), but we filter defensively.
          for (const msg of toolMsgs) {
            if (msg) {
              apiMessages.push(msg);
              accumulatedTurns.push(msg);
            }
          }

          // If the user aborted while tools were still running, bail
          // out of the agent loop instead of feeding tool results back
          // into another turn (which would defeat the purpose of stop).
          if (abortController.signal.aborted) break;

          if (!useTools) break;
        }

        if (!finalText) {
          finalText = accumulatedTexts.length
            ? accumulatedTexts.join("\n\n")
            : t("app.taskCompleted");
        }

        const duration = ((Date.now() - thinkingStartTime) / 1000).toFixed(1);
        const parsedDuration = parseFloat(duration);
        const thinkingContent = accumulatedThinking || null;

        // Final belt-and-braces: ensure no thinking event is left marked
        // isLive (we kill it on successful iteration end, but a final-turn
        // that exits early could leave the last one hanging).
        for (let i = 0; i < timeline.length; i++) {
          if (timeline[i].type === "thinking" && timeline[i].isLive) {
            timeline[i] = { ...timeline[i], isLive: false };
          }
        }

        // Finalize: content has already been streamed into the UI; we just
        // flip loading/isThinking off and commit the full API-turn history.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: finalText,
                  loading: false,
                  isThinking: false,
                  thinking: thinkingContent,
                  thinkingDuration: parsedDuration,
                  toolCalls: accumulatedToolCalls,
                  apiTurns: accumulatedTurns,
                  timeline: [...timeline],
                  tokenStats: (tokenStats.inputRaw || tokenStats.inputWire || tokenStats.output)
                    ? { ...tokenStats }
                    : undefined,
                }
              : m,
          ),
        );

        // Unread badge: if the user has navigated away from this task
        // while the assistant was generating, flip the task's `unread`
        // flag so the sidebar shows a blue dot until they come back.
        // We read the LATEST active task via ref (not the closure's
        // captured value) since the user may have switched mid-stream.
        //
        // `isNewTask` short-circuits this for the very first turn:
        // setActiveTask is queued via setTimeout(0) and might not have
        // landed in activeTaskRef yet, so naively comparing here would
        // false-positive on every brand-new conversation.
        if (!isNewTask && activeTaskRef.current?.id !== currentTaskId) {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === currentTaskId ? { ...t, unread: true } : t,
            ),
          );
        }
      } catch (err) {
        if (err.name === "AbortError") {
          // Two reasons a request gets aborted:
          //   1. The user retracted the turn — `performDelete` already removed
          //      the message, so any `setMessages` here is a no-op.
          //   2. The user hit the Stop button mid-stream — we want to keep
          //      whatever tokens already arrived and just flip `loading` off
          //      so the action bar (copy / retract) becomes visible.
          const duration = ((Date.now() - thinkingStartTime) / 1000).toFixed(1);
          setMessages((prev) => {
            const m = prev.find((x) => x.id === assistantMsgId);
            if (!m) return prev; // already removed by retract
            const hasPartial = !!(m.content || m.thinking);
            if (!hasPartial) {
              // No tokens arrived yet — drop the empty placeholder.
              return prev.filter((x) => x.id !== assistantMsgId);
            }
            // Mark any in-flight thinking event as no-longer-live so the
            // blue pulse animation stops on the stopped card.
            for (let i = 0; i < timeline.length; i++) {
              if (timeline[i].type === "thinking" && timeline[i].isLive) {
                timeline[i] = { ...timeline[i], isLive: false };
              }
            }
            return prev.map((x) =>
              x.id === assistantMsgId
                ? {
                    ...x,
                    loading: false,
                    isThinking: false,
                    stopped: true,
                    thinkingDuration: parseFloat(duration),
                    toolCalls: accumulatedToolCalls,
                    apiTurns: accumulatedTurns,
                    timeline: [...timeline],
                  }
                : x,
            );
          });
        } else {
          const duration = ((Date.now() - thinkingStartTime) / 1000).toFixed(1);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: `> [!CAUTION]\n> ${t("app.requestFailed", { error: err.message })}`,
                    loading: false,
                    isThinking: false,
                    thinkingDuration: parseFloat(duration),
                  }
                : m,
            ),
          );
        }
      } finally {
        delete abortControllersRef.current[userMsgId];
      }
    },
    [
      selectedModel,
      activeTask,
      workspace,
      messages,
      setActiveTask,
      setMessages,
      setTasks,
      mode,
      projects,
      setTodoItems,
      setArtifacts,
      setReferences,
      skills,
      requestCommandExec,
      requestToolPermission,
      t,
    ],
  );

  // Abort every in-flight generation. Used by the Stop button in ChatPanel.
  // Partial content is preserved (see AbortError branch in handleSendMessage).
  const handleStopGenerating = useCallback(() => {
    for (const id of Object.keys(abortControllersRef.current)) {
      try {
        abortControllersRef.current[id].abort();
      } catch {
        /* no-op */
      }
      delete abortControllersRef.current[id];
    }
    // If a run_command modal is still open, auto-deny it so the tool promise
    // settles and the iteration loop can unwind — otherwise stopping during
    // a pending command request would leave the whole agent hanging on the
    // still-unresolved Promise inside Promise.all.
    setPendingCommandExec((prev) => {
      if (prev) {
        prev.resolve?.({
          ok: false,
          error: "生成已停止",
          exit_code: -1,
        });
      }
      return null;
    });
    // Same treatment for any open permission modal.
    setPendingToolConfirm((prev) => {
      if (prev) prev.resolve?.("deny");
      return null;
    });
  }, []);

  // Roll a single fileChange back on disk. Pure I/O — no UI updates.
  // Returns true on success, false otherwise.
  const revertChangeOnDisk = useCallback(async (target) => {
    if (!target || !window.arcticAPI) return false;
    try {
      if (target.action === "create") {
        const r = await window.arcticAPI.fsDeleteFile({
          filePath: target.fullPath,
          recursive: false,
        });
        return !!r?.ok;
      }
      if (target.action === "create-folder") {
        const r = await window.arcticAPI.fsDeleteFile({
          filePath: target.fullPath,
          recursive: true,
        });
        return !!r?.ok;
      }
      if (target.action === "edit" || target.action === "delete") {
        const r = await window.arcticAPI.fsWriteFile({
          filePath: target.fullPath,
          content: target.oldContent ?? "",
        });
        return !!r?.ok;
      }
    } catch {
      return false;
    }
    return false;
  }, []);

  // Core delete: aborts in-flight requests, reverts file mutations made
  // within the removed turns, restores rollback snapshot, removes messages.
  const performDelete = useCallback(
    async (msgId, restoreContent, toRemoveIds, snapshot, taskId) => {
      for (const id of toRemoveIds) {
        if (abortControllersRef.current[id]) {
          abortControllersRef.current[id].abort();
          delete abortControllersRef.current[id];
        }
      }
      // Revert any file mutations made by the to-be-removed turns.
      // Iterate newest-first so cascading edits unwind in the order they
      // were applied. Skip entries already reverted by the user.
      const allMessages = messagesRef.current;
      const toRemoveMsgs = allMessages.filter((m) => toRemoveIds.has(m.id));
      const changesToRevert = [];
      for (const m of toRemoveMsgs) {
        if (!Array.isArray(m.fileChanges)) continue;
        for (const c of m.fileChanges) {
          if (c.status !== "reverted") changesToRevert.push(c);
        }
      }
      for (let i = changesToRevert.length - 1; i >= 0; i--) {
        await revertChangeOnDisk(changesToRevert[i]);
      }
      if (snapshot && taskId) {
        setTodoItems((prev) => [
          ...prev.filter((t) => t.taskId !== taskId),
          ...snapshot.todos,
        ]);
        setArtifacts((prev) => [
          ...prev.filter((a) => a.taskId !== taskId),
          ...snapshot.artifacts,
        ]);
        setReferences((prev) => [
          ...prev.filter((r) => r.taskId !== taskId),
          ...snapshot.references,
        ]);
      }
      setMessages((prev) => {
        const msg = prev.find((m) => m.id === msgId);
        if (msg && msg.role === "user" && restoreContent) {
          setTimeout(() => restoreContent(msg.content), 0);
        }
        return prev.filter((m) => !toRemoveIds.has(m.id));
      });
    },
    [setMessages, setTodoItems, setArtifacts, setReferences, revertChangeOnDisk],
  );

  // Retract entry point: compute cascading removal + state diff; show confirm if needed.
  // Semantics: retract removes this message AND all subsequent messages in the same task,
  // then rolls state back to the snapshot taken before this turn.
  const handleDeleteMessage = useCallback(
    (msgId, restoreContent) => {
      const targetMsg = messages.find((m) => m.id === msgId);
      if (!targetMsg) return;
      const taskId = targetMsg.taskId;

      const taskMessages = messages.filter((m) => m.taskId === taskId);
      const targetIndex = taskMessages.findIndex((m) => m.id === msgId);
      if (targetIndex < 0) return;
      const toRemove = taskMessages.slice(targetIndex);
      const toRemoveIds = new Set(toRemove.map((m) => m.id));

      // Earliest rollback snapshot wins (we want to restore to before the first removed turn)
      const snapshot =
        toRemove.find((m) => m.role === "assistant" && m.rollback)?.rollback ||
        null;

      // Compute diff against current state
      const currentTodos = todoItemsRef.current.filter(
        (t) => t.taskId === taskId,
      );
      const currentArtifacts = artifactsRef.current.filter(
        (a) => a.taskId === taskId,
      );
      const currentReferences = referencesRef.current.filter(
        (r) => r.taskId === taskId,
      );

      let artifactsLost = [];
      let referencesLost = [];
      let todosChanged = false;
      if (snapshot) {
        const snapArtIds = new Set(snapshot.artifacts.map((a) => a.id));
        const snapRefIds = new Set(snapshot.references.map((r) => r.id));
        artifactsLost = currentArtifacts.filter((a) => !snapArtIds.has(a.id));
        referencesLost = currentReferences.filter((r) => !snapRefIds.has(r.id));
        todosChanged =
          JSON.stringify(currentTodos) !== JSON.stringify(snapshot.todos);
      }

      // File-system mutations made within the to-be-removed turns.
      // performDelete will roll these back on disk (newest-first) using
      // the snapshotted oldContent on each fileChange record. We surface
      // the count in the confirm modal so the user knows what's going.
      const fileChangesInRange = toRemove.flatMap((m) =>
        Array.isArray(m.fileChanges) ? m.fileChanges : [],
      );
      const fileChangesCount = fileChangesInRange.length;

      // Did the assistant actually do work? Empty assistant messages
      // (ones that got aborted before the model produced content) still
      // deserve a confirm prompt — silently dropping them after a Stop
      // press feels broken to the user even though strictly nothing was
      // lost. We detect "non-trivial" by content / toolCalls / fileChanges.
      const hasNonTrivialContent = toRemove.some(
        (m) =>
          m.role === "assistant" &&
          ((typeof m.content === "string" && m.content.trim().length > 0) ||
            (Array.isArray(m.toolCalls) && m.toolCalls.length > 0) ||
            (Array.isArray(m.fileChanges) && m.fileChanges.length > 0) ||
            // Aborted mid-stream: keep the prompt so the user gets a
            // chance to reconsider rather than having the message vanish.
            m.stopped === true ||
            m.aborted === true ||
            m.loading === true),
      );

      const cascadeCount =
        toRemove.length - (targetMsg.role === "user" ? 2 : 1);
      const hasSideEffects =
        artifactsLost.length > 0 ||
        referencesLost.length > 0 ||
        todosChanged ||
        fileChangesCount > 0;
      const needsConfirm =
        hasSideEffects || cascadeCount > 0 || hasNonTrivialContent;

      if (!needsConfirm) {
        performDelete(msgId, restoreContent, toRemoveIds, snapshot, taskId);
        return;
      }

      setPendingRetract({
        msgId,
        restoreContent,
        taskId,
        toRemoveIds,
        snapshot,
        diff: {
          messageCount: toRemove.length,
          cascadeCount: Math.max(0, cascadeCount),
          artifactsLost,
          referencesLost,
          todosChanged,
          todosBefore: snapshot?.todos.length ?? 0,
          todosNow: currentTodos.length,
          fileChangesCount,
        },
      });
    },
    [messages, performDelete],
  );

  const confirmRetract = useCallback(() => {
    if (!pendingRetract) return;
    const { msgId, restoreContent, toRemoveIds, snapshot, taskId } =
      pendingRetract;
    performDelete(msgId, restoreContent, toRemoveIds, snapshot, taskId);
    setPendingRetract(null);
  }, [pendingRetract, performDelete]);

  const cancelRetract = useCallback(() => setPendingRetract(null), []);

  // ─── Background commands ──────────────────────────────────────────────
  // Polling loop: every 2s ask main for the snapshot list. Merge over
  // existing renderer state so we keep `lastDrainedLength` (which main
  // doesn't know about). We only run while at least one command is
  // present in the table OR the user might be about to add one — for
  // simplicity we always run, the cost is one tiny IPC every 2s.
  useEffect(() => {
    if (!window.arcticAPI?.bgList) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await window.arcticAPI.bgList();
        if (cancelled || !r?.ok) return;
        setBgCommands((prev) => {
          const prevById = new Map(prev.map((x) => [x.id, x]));
          // Newest first so the input-bar list reads top-down naturally.
          const merged = (r.items || [])
            .map((snap) => {
              const old = prevById.get(snap.id);
              const lastDrained = old?.lastDrainedLength ?? 0;
              const pending = Math.max(0, snap.outputLength - lastDrained);
              return {
                id: snap.id,
                command: snap.command,
                cwd: snap.cwd,
                running: snap.running,
                exitCode: snap.exitCode,
                startedAt: snap.startedAt,
                finishedAt: snap.finishedAt,
                outputLength: snap.outputLength,
                truncated: snap.truncated,
                lastDrainedLength: lastDrained,
                pendingBytes: pending,
                dismissed: old?.dismissed === true,
              };
            })
            .filter((x) => !x.dismissed)
            .sort((a, b) => b.startedAt - a.startedAt);
          return merged;
        });
      } catch {
        /* ignore transient errors */
      }
    };
    poll();
    const handle = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);

  // Called by createToolRunner the moment a background command starts —
  // gives us an "instant pill" before the next 2s poll catches up.
  const handleBackgroundStarted = useCallback(({ id, command, startedAt }) => {
    setBgCommands((prev) => {
      if (prev.some((x) => x.id === id)) return prev;
      return [
        {
          id,
          command,
          cwd: null,
          running: true,
          exitCode: null,
          startedAt,
          finishedAt: null,
          outputLength: 0,
          truncated: false,
          lastDrainedLength: 0,
          pendingBytes: 0,
          dismissed: false,
        },
        ...prev,
      ];
    });
  }, []);

  const handleStopBackgroundCommand = useCallback(async (id) => {
    if (!window.arcticAPI?.bgStop) return;
    await window.arcticAPI.bgStop({ id });
    // Rely on the next poll tick to update `running`/`exitCode`.
  }, []);

  const handleDismissBackgroundCommand = useCallback(async (id) => {
    // Mark dismissed locally first so the chip disappears immediately,
    // then ask main to release the entry. If main refuses (e.g. still
    // running), we re-show on next poll.
    setBgCommands((prev) =>
      prev.map((x) => (x.id === id ? { ...x, dismissed: true } : x)),
    );
    if (window.arcticAPI?.bgClear) {
      await window.arcticAPI.bgClear({ id });
    }
  }, []);

  // ─── Per-turn file-change review ──────────────────────────────────────
  // The chat input bar surfaces a "review changes" strip listing every
  // file the latest assistant turn touched. Each entry can be:
  //   - kept     → user clicked 保留 (or sent a follow-up message)
  //   - reverted → undo applied; on-disk content rolled back
  //
  // Reverts call back into the existing fs IPC. We don't cascade through
  // the sandbox check here since the original write already cleared it
  // (allowedRoots haven't changed).
  const updateFileChangeStatus = useCallback((changeId, nextStatus) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (!Array.isArray(m.fileChanges)) return m;
        if (!m.fileChanges.some((c) => c.id === changeId)) return m;
        return {
          ...m,
          fileChanges: m.fileChanges.map((c) =>
            c.id === changeId ? { ...c, status: nextStatus } : c,
          ),
        };
      }),
    );
  }, [setMessages]);

  const handleKeepFileChange = useCallback(
    (changeId) => updateFileChangeStatus(changeId, "kept"),
    [updateFileChangeStatus],
  );

  const handleKeepAllFileChanges = useCallback(() => {
    if (!activeTask?.id) return;
    const taskId = activeTask.id;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.taskId !== taskId || !Array.isArray(m.fileChanges)) return m;
        if (!m.fileChanges.some((c) => c.status === "pending")) return m;
        return {
          ...m,
          fileChanges: m.fileChanges.map((c) =>
            c.status === "pending" ? { ...c, status: "kept" } : c,
          ),
        };
      }),
    );
  }, [activeTask, setMessages]);

  const handleRevertFileChange = useCallback(
    async (changeId) => {
      // Locate the change record by id across the message history. Reading
      // from messagesRef keeps this resilient to concurrent setMessages
      // calls — we want the freshest copy without re-render churn.
      const allMessages = messagesRef.current;
      let target = null;
      for (const m of allMessages) {
        if (!Array.isArray(m.fileChanges)) continue;
        const hit = m.fileChanges.find((c) => c.id === changeId);
        if (hit) {
          target = hit;
          break;
        }
      }
      if (!target) return;
      if (!window.arcticAPI) {
        alert(t('chat.fileChanges.revertFailed', { error: 'Electron API unavailable' }));
        return;
      }
      try {
        if (target.action === "create") {
          // File didn't exist before — undo by deleting it.
          const r = await window.arcticAPI.fsDeleteFile({
            filePath: target.fullPath,
            recursive: false,
          });
          if (!r?.ok) throw new Error(r?.error || "fsDeleteFile failed");
        } else if (target.action === "create-folder") {
          const r = await window.arcticAPI.fsDeleteFile({
            filePath: target.fullPath,
            recursive: true,
          });
          if (!r?.ok) throw new Error(r?.error || "fsDeleteFile failed");
        } else if (target.action === "edit" || target.action === "delete") {
          // Restore previous content. For 'delete' the file was removed,
          // so fsWriteFile re-creates it.
          const r = await window.arcticAPI.fsWriteFile({
            filePath: target.fullPath,
            content: target.oldContent ?? "",
          });
          if (!r?.ok) throw new Error(r?.error || "fsWriteFile failed");
        } else {
          throw new Error(`unknown action: ${target.action}`);
        }
        updateFileChangeStatus(changeId, "reverted");
      } catch (e) {
        alert(t('chat.fileChanges.revertFailed', { error: e?.message || String(e) }));
      }
    },
    [updateFileChangeStatus, t],
  );

  const handleNewTask = useCallback(() => {
    setActiveView("chat");
    setActiveTask(null);
    // Note: We no longer clear global messages/todoItems here because they are task-specific now.
  }, [setActiveTask, setActiveView]);

  const handleSelectTask = useCallback(
    (task) => {
      setActiveView("chat");
      setActiveTask(task);
      // Selecting a task counts as "reading" it — drop the unread badge.
      // Skip the setTasks call when the task isn't actually flagged so
      // we don't trigger a no-op localStorage write on every navigation.
      if (task?.id && task.unread) {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, unread: false } : t)),
        );
      }
    },
    [setActiveTask, setActiveView, setTasks],
  );

  // Rename a task by id. Purely a title edit — does NOT touch messages,
  // artifacts, or any task-scoped state. If the user renames the active
  // task, also update `activeTask` so the header reflects the new name.
  const handleRenameTask = useCallback(
    (taskId, newTitle) => {
      const trimmed = (newTitle || "").trim();
      if (!trimmed) return;
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, title: trimmed } : t)),
      );
      setActiveTask((prev) =>
        prev?.id === taskId ? { ...prev, title: trimmed } : prev,
      );
    },
    [setTasks, setActiveTask],
  );

  // Move a task to a different workspace. The task keeps its messages,
  // artifacts, references, and todos — only its `projectId` changes.
  // Sidebar's right-click / kebab menu drives this; the workspace
  // selector in ChatPanel is read-only once a task is active, so this
  // is the canonical way to fix a misrouted conversation after the
  // fact. Validates the target id against the live project list to
  // avoid orphaning tasks under deleted projects.
  const handleMoveTaskToWorkspace = useCallback(
    (taskId, targetProjectId) => {
      if (!taskId || !targetProjectId) return;
      const isValid =
        targetProjectId === "playground" ||
        projects.some((p) => p.id === targetProjectId);
      if (!isValid) return;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, projectId: targetProjectId } : t,
        ),
      );
      setActiveTask((prev) =>
        prev?.id === taskId ? { ...prev, projectId: targetProjectId } : prev,
      );
    },
    [projects, setTasks, setActiveTask],
  );

  // Delete a whole task: aborts any in-flight requests for its messages,
  // then removes the task + all messages/todos/artifacts/references
  // scoped to it. Clears `activeTask` if it was the deleted one.
  const handleDeleteTask = useCallback(
    (taskId) => {
      // Abort in-flight generations for every user message in this task.
      const taskMessages = messages.filter((m) => m.taskId === taskId);
      for (const m of taskMessages) {
        const ctrl = abortControllersRef.current[m.id];
        if (ctrl) {
          try {
            ctrl.abort();
          } catch {
            /* noop */
          }
          delete abortControllersRef.current[m.id];
        }
      }
      setMessages((prev) => prev.filter((m) => m.taskId !== taskId));
      setTodoItems((prev) => prev.filter((t) => t.taskId !== taskId));
      setTaskProgress((prev) => prev.filter((p) => p.taskId !== taskId));
      setArtifacts((prev) => prev.filter((a) => a.taskId !== taskId));
      setReferences((prev) => prev.filter((r) => r.taskId !== taskId));
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setActiveTask((prev) => (prev?.id === taskId ? null : prev));
    },
    [
      messages,
      setMessages,
      setTodoItems,
      setTaskProgress,
      setArtifacts,
      setReferences,
      setTasks,
      setActiveTask,
    ],
  );

  const handleAddProject = async () => {
    let folderPath = null;
    let folderName = null;

    // 1) Electron environment (works on macOS / Windows / Linux)
    if (window.arcticAPI?.openDirectory) {
      folderPath = await window.arcticAPI.openDirectory();
      if (folderPath) {
        folderName = folderPath.split(/[/\\]/).pop() || "新建工作区";
      }
    }
    // 2) Browser fallback — Web File System Access API
    else if (window.showDirectoryPicker) {
      try {
        const dirHandle = await window.showDirectoryPicker({
          mode: "readwrite",
        });
        folderPath = dirHandle.name; // browser only exposes the dir name
        folderName = dirHandle.name;
      } catch {
        // User cancelled the picker
        return;
      }
    }
    // 3) No compatible API available
    else {
      alert("当前环境不支持文件夹选择，请在 Electron 客户端中打开");
      return;
    }

    if (folderPath) {
      const projectId = `${folderPath}_${mode}`;
      const newProject = {
        id: projectId,
        name: folderName,
        path: folderPath,
        mode: mode,
      };

      setProjects((prev) => {
        if (prev.find((p) => p.id === projectId)) {
          return prev;
        }
        return [...prev, newProject];
      });

      setWorkspace(projectId);
    }
  };

  // Step 1 of workspace deletion — open the confirm modal. We compute
  // the task count *now* (sidebar already filters this same way) so
  // the modal can decide whether to show the "purge tasks" checkbox.
  const handleRequestDeleteProject = useCallback(
    (projectId) => {
      if (!projectId || projectId === "playground") return;
      const project = projects.find((p) => p.id === projectId);
      if (!project) return;
      const taskCount = tasks.filter((t) => t.projectId === projectId).length;
      setPendingProjectDelete({ project, taskCount });
    },
    [projects, tasks],
  );

  // Step 2 — user confirmed. We always remove the project itself; the
  // `purgeTasks` flag controls whether tasks underneath get hard-deleted
  // or merely re-parented to Playground (the safer default).
  const handleConfirmDeleteProject = useCallback(
    ({ purgeTasks } = {}) => {
      const projectId = pendingProjectDelete?.project?.id;
      if (!projectId) {
        setPendingProjectDelete(null);
        return;
      }

      // Collect the tasks we'd be removing — needed to also nuke their
      // messages / artifacts / references in cascade mode.
      const taskIdsUnderProject = tasks
        .filter((t) => t.projectId === projectId)
        .map((t) => t.id);

      if (purgeTasks && taskIdsUnderProject.length > 0) {
        // Abort any in-flight network requests tied to messages of the
        // doomed tasks so we don't get late state updates after delete.
        for (const taskId of taskIdsUnderProject) {
          const taskMsgs = messages.filter((m) => m.taskId === taskId);
          for (const m of taskMsgs) {
            const controller = abortControllersRef.current[m.id];
            if (controller) {
              try { controller.abort(); } catch { /* noop */ }
              delete abortControllersRef.current[m.id];
            }
          }
        }

        const idSet = new Set(taskIdsUnderProject);
        setMessages((prev) => prev.filter((m) => !idSet.has(m.taskId)));
        setArtifacts((prev) => prev.filter((a) => !idSet.has(a.taskId)));
        setReferences((prev) => prev.filter((r) => !idSet.has(r.taskId)));
        setTasks((prev) => prev.filter((t) => !idSet.has(t.id)));
        // If the active task lived under this project, drop it.
        setActiveTask((prev) => (prev && idSet.has(prev.id) ? null : prev));
      } else if (taskIdsUnderProject.length > 0) {
        // Re-parent surviving tasks to Playground so they remain visible.
        setTasks((prev) =>
          prev.map((t) =>
            t.projectId === projectId ? { ...t, projectId: "playground" } : t,
          ),
        );
      }

      // Drop the project entry itself.
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      // If the deleted project was the active workspace, fall back to
      // Playground — otherwise the workspace dropdown would still show
      // the now-orphaned name and route file ops nowhere.
      setWorkspace((prev) => (prev === projectId ? "playground" : prev));
      setPendingProjectDelete(null);
    },
    [
      pendingProjectDelete,
      tasks,
      messages,
      setMessages,
      setArtifacts,
      setReferences,
      setTasks,
      setActiveTask,
      setProjects,
      setWorkspace,
    ],
  );

  return (
    <div className="app">
      <TitleBar
        mode={mode}
        onModeChange={setMode}
        taskTitle={activeTask?.title}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        rightPanelCollapsed={rightPanelCollapsed}
        onToggleRightPanel={() => setRightPanelCollapsed(!rightPanelCollapsed)}
        theme={theme}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
      />
      <div className="app-body">
        <Sidebar
          collapsed={sidebarCollapsed}
          mode={mode}
          projects={projects}
          tasks={tasks}
          activeTask={activeTask}
          onSelectTask={handleSelectTask}
          onNewTask={handleNewTask}
          onOpenSettings={() => setIsSettingsOpen(true)}
          activeView={activeView}
          onSelectView={setActiveView}
          onAddProject={handleAddProject}
          onDeleteProject={handleRequestDeleteProject}
          onRenameTask={handleRenameTask}
          onDeleteTask={handleDeleteTask}
          onMoveTaskToWorkspace={handleMoveTaskToWorkspace}
        />
        {activeView === "skills" ? (
          <SkillsView
            skills={skills}
            onAddSkill={(s) => setSkills((prev) => [...prev, s])}
            onRemoveSkill={(id) =>
              setSkills((prev) => prev.filter((s) => s.id !== id))
            }
            // Partial update by id: merge `patch` into the matching skill.
            // Used by the editor modal (manual create/edit) and the
            // URL-refresh action — both want to replace some fields
            // (content, size, name, timestamp) without disturbing
            // others (id, enabled, type, url).
            onUpdateSkill={(id, patch) =>
              setSkills((prev) =>
                prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
              )
            }
            onToggleSkill={(id) =>
              setSkills((prev) =>
                prev.map((s) =>
                  s.id === id ? { ...s, enabled: s.enabled === false } : s,
                ),
              )
            }
          />
        ) : (
          <ChatPanel
            mode={mode}
            messages={
              activeTask
                ? messages.filter((m) => m.taskId === activeTask.id)
                : []
            }
            onSendMessage={handleSendMessage}
            onStopGenerating={handleStopGenerating}
            onDeleteMessage={handleDeleteMessage}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            // The selector reflects the *effective* workspace — for a
            // running task that's the task's locked projectId; with no
            // task it's the user's global pick. The setter only affects
            // the global pick (used as the default for the next new
            // task); when a task is active the selector is rendered
            // read-only by ChatPanel itself, so onWorkspaceChange would
            // never fire in that mode anyway.
            workspace={effectiveProjectId}
            onWorkspaceChange={setWorkspace}
            workspaceLocked={!!activeTask}
            projects={projects}
            onAddProject={handleAddProject}
            onKeepFileChange={handleKeepFileChange}
            onRevertFileChange={handleRevertFileChange}
            onKeepAllFileChanges={handleKeepAllFileChanges}
            backgroundCommands={bgCommands}
            onStopBackgroundCommand={handleStopBackgroundCommand}
            onDismissBackgroundCommand={handleDismissBackgroundCommand}
            skills={skills}
          />
        )}
        <RightPanel
          collapsed={rightPanelCollapsed}
          mode={mode}
          todoItems={
            activeTask
              ? todoItems.filter((t) => t.taskId === activeTask.id)
              : []
          }
          progress={
            activeTask
              ? taskProgress.find((p) => p.taskId === activeTask.id) || null
              : null
          }
          artifacts={
            activeTask
              ? artifacts.filter((a) => a.taskId === activeTask.id)
              : []
          }
          references={
            activeTask
              ? references.filter((r) => r.taskId === activeTask.id)
              : []
          }
          contextStats={computeContextStats({
            skills,
            messages: activeTask
              ? messages.filter((m) => m.taskId === activeTask.id)
              : [],
            modelId: selectedModel,
          })}
          onOpenArtifact={(id) => setPreviewArtifactId(id)}
        />
      </div>
      <SettingsModal
        isOpen={isSettingsOpen}
        initialTab={settingsInitialTab}
        onClose={() => {
          setIsSettingsOpen(false);
          setSettingsInitialTab(null);
        }}
        theme={theme}
        onThemeChange={setTheme}
      />
      <DeleteProjectModal
        pending={pendingProjectDelete}
        onConfirm={handleConfirmDeleteProject}
        onCancel={() => setPendingProjectDelete(null)}
      />
      <RetractConfirmModal
        pending={pendingRetract}
        onConfirm={confirmRetract}
        onCancel={cancelRetract}
      />
      <ArtifactPreviewModal
        key={previewArtifactId || "artifact-modal-closed"}
        artifact={
          previewArtifactId
            ? artifacts.find((a) => a.id === previewArtifactId)
            : null
        }
        theme={isDarkTheme ? "dark" : "light"}
        onClose={() => setPreviewArtifactId(null)}
        onUpdate={(updated) =>
          setArtifacts((prev) =>
            prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)),
          )
        }
        onDelete={(id) =>
          setArtifacts((prev) => prev.filter((a) => a.id !== id))
        }
      />
      <CommandExecuteModal
        request={pendingCommandExec}
        onSubmit={(result) => {
          pendingCommandExec?.resolve?.(result);
          setPendingCommandExec(null);
        }}
        onDeny={() => {
          pendingCommandExec?.resolve?.({
            ok: false,
            error: "用户拒绝执行此命令",
            exit_code: -1,
          });
          setPendingCommandExec(null);
        }}
      />
      <ToolConfirmModal
        request={pendingToolConfirm}
        onDecide={(decision) => {
          pendingToolConfirm?.resolve?.(decision);
          setPendingToolConfirm(null);
        }}
      />
    </div>
  );
}

export default App;
