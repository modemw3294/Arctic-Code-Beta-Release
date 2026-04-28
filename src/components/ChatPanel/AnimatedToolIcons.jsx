// Animated tool icons — used by ToolCallCard while a tool is running.
// Each component returns an SVG with inline <animate>/<animateTransform>
// elements so the motion works without any CSS dependency (the animation
// keeps playing even if the card re-renders).
//
// When the tool settles (success/error), ToolCallCard swaps back to the
// static icon so the animation stops and doesn't waste GPU cycles.

// Running terminal — prompt chevron + blinking block cursor.
export function IconTerminalRunning() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <rect x="12" y="17" width="8" height="2.2" fill="currentColor" stroke="none">
        <animate
          attributeName="opacity"
          values="1;1;0;0"
          keyTimes="0;0.5;0.5;1"
          dur="1s"
          repeatCount="indefinite"
        />
      </rect>
    </svg>
  );
}

export function IconTerminal() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

// Editing file — pencil that slides back and forth over a sheet.
export function IconFileEditing() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
      <g>
        <path d="M14 14l5-5 2 2-5 5z" />
        <path d="M17 11l2 2" />
        <animateTransform
          attributeName="transform"
          type="translate"
          values="-2,2; 2,-2; -2,2"
          dur="1.2s"
          repeatCount="indefinite"
        />
      </g>
    </svg>
  );
}

export function IconFile() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  );
}

// Searching — magnifying glass that pulses.
export function IconSearchRunning() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7">
        <animate attributeName="r" values="6;8;6" dur="1.4s" repeatCount="indefinite" />
      </circle>
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}

export function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}

// Web search — globe with rotating latitude ring.
export function IconWebSearchRunning() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <ellipse cx="12" cy="12" rx="4" ry="9">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="4s"
          repeatCount="indefinite"
        />
      </ellipse>
    </svg>
  );
}

export function IconWebSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M12 3a15 15 0 0 1 0 18" />
      <path d="M12 3a15 15 0 0 0 0 18" />
    </svg>
  );
}

// Fetch URL — download arrow bouncing.
export function IconFetchRunning() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <g>
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0,-2; 0,1; 0,-2"
          dur="1s"
          repeatCount="indefinite"
        />
      </g>
    </svg>
  );
}

// Generic tool — spinning wrench fallback for tools without a specific icon.
export function IconToolRunning() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <g>
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="2.4s"
          repeatCount="indefinite"
        />
      </g>
    </svg>
  );
}

export function IconTool() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

// TODO list — clipboard with animated checkmark stroking in
export function IconTodoRunning() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 2h6v4H9z" />
      <polyline points="8 13 11 16 16 11">
        <animate attributeName="stroke-dasharray" values="0,20;20,0" dur="1.2s" repeatCount="indefinite" />
      </polyline>
    </svg>
  );
}

export function IconTodo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 2h6v4H9z" />
      <line x1="8" y1="11" x2="16" y2="11" />
      <line x1="8" y1="15" x2="16" y2="15" />
    </svg>
  );
}

// Artifact — cube/package (flat isometric) that bounces on create
export function IconArtifactRunning() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <g>
        <path d="M12 2L3 7v10l9 5 9-5V7z" />
        <path d="M3 7l9 5 9-5" />
        <line x1="12" y1="12" x2="12" y2="22" />
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0,0;0,-1.5;0,0"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </g>
    </svg>
  );
}

export function IconArtifact() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L3 7v10l9 5 9-5V7z" />
      <path d="M3 7l9 5 9-5" />
      <line x1="12" y1="12" x2="12" y2="22" />
    </svg>
  );
}

// Reference — bookmark that draws itself in
export function IconReferenceRunning() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z">
        <animate attributeName="stroke-dashoffset" values="30;0" dur="1.2s" repeatCount="indefinite" />
        <animate attributeName="stroke-dasharray" values="30,30" dur="1.2s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}

export function IconReference() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// Read reference — open book with pages flipping
export function IconReadRefRunning() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="-4 12 12" dur="1s" repeatCount="indefinite" additive="sum" />
      </path>
    </svg>
  );
}

export function IconReadRef() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

// Component that picks the right icon for a tool card based on its name +
// status. Using a component wrapper (instead of a factory function that
// returns a component reference) keeps React's fast-refresh and
// static-components lints happy: the concrete icon components used inside
// come from a module-level table so their identity is stable per render.
export function ToolIcon({ name, status }) {
  const entry = TOOL_ICON_MAP[name];
  const running = status === 'running';
  if (!entry) {
    return running ? <IconToolRunning /> : <IconTool />;
  }
  const Comp = running ? entry.running : entry.static;
  return <Comp />;
}

// Folder — a directory with a small “+” that pulses while creating.
export function IconFolderRunning() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <g>
        <line x1="12" y1="11" x2="12" y2="17" />
        <line x1="9" y1="14" x2="15" y2="14" />
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1.1s" repeatCount="indefinite" />
      </g>
    </svg>
  );
}

export function IconFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// Python — snake-like wave that pulses.
export function IconPythonRunning() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4h6a3 3 0 0 1 3 3v3H10a3 3 0 0 0-3 3v3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" />
      <path d="M16 20h-6a3 3 0 0 1-3-3v-3h7a3 3 0 0 0 3-3V8h1a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3z">
        <animate attributeName="opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}

export function IconPython() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4h6a3 3 0 0 1 3 3v3H10a3 3 0 0 0-3 3v3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" />
      <path d="M16 20h-6a3 3 0 0 1-3-3v-3h7a3 3 0 0 0 3-3V8h1a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3z" />
    </svg>
  );
}

// Progress — bar chart with the bars growing.
export function IconProgressRunning() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="20" x2="21" y2="20" />
      <rect x="5" y="14" width="3" height="6">
        <animate attributeName="height" values="3;6;3" dur="1.1s" repeatCount="indefinite" />
        <animate attributeName="y" values="17;14;17" dur="1.1s" repeatCount="indefinite" />
      </rect>
      <rect x="10.5" y="10" width="3" height="10">
        <animate attributeName="height" values="6;10;6" dur="1.1s" repeatCount="indefinite" />
        <animate attributeName="y" values="14;10;14" dur="1.1s" repeatCount="indefinite" />
      </rect>
      <rect x="16" y="6" width="3" height="14">
        <animate attributeName="height" values="9;14;9" dur="1.1s" repeatCount="indefinite" />
        <animate attributeName="y" values="11;6;11" dur="1.1s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}

export function IconProgress() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="20" x2="21" y2="20" />
      <rect x="5" y="14" width="3" height="6" />
      <rect x="10.5" y="10" width="3" height="10" />
      <rect x="16" y="6" width="3" height="14" />
    </svg>
  );
}

// Background command — terminal with three dots underlining "still running".
export function IconBackgroundRunning() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <polyline points="6 8 9 11 6 14" />
      <line x1="12" y1="14" x2="16" y2="14" />
      <g>
        <circle cx="8" cy="20" r="1">
          <animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" begin="0s" repeatCount="indefinite" />
        </circle>
        <circle cx="12" cy="20" r="1">
          <animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" begin="0.2s" repeatCount="indefinite" />
        </circle>
        <circle cx="16" cy="20" r="1">
          <animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" begin="0.4s" repeatCount="indefinite" />
        </circle>
      </g>
    </svg>
  );
}

export function IconBackground() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <polyline points="6 8 9 11 6 14" />
      <line x1="12" y1="14" x2="16" y2="14" />
      <circle cx="8" cy="20" r="1" />
      <circle cx="12" cy="20" r="1" />
      <circle cx="16" cy="20" r="1" />
    </svg>
  );
}

// Mapping: tool name → { running, static } icon components. Declared after
// ToolIcon so both live in the same module but only ToolIcon is exported —
// avoids the "mixed exports" fast-refresh warning.
const TOOL_ICON_MAP = {
  run_command: { running: IconTerminalRunning, static: IconTerminal },
  edit_file: { running: IconFileEditing, static: IconFile },
  create_file: { running: IconFileEditing, static: IconFile },
  delete_file: { running: IconFileEditing, static: IconFile },
  read_file: { running: IconFileEditing, static: IconFile },
  search_workspace: { running: IconSearchRunning, static: IconSearch },
  grep_workspace: { running: IconSearchRunning, static: IconSearch },
  web_search: { running: IconWebSearchRunning, static: IconWebSearch },
  fetch_url: { running: IconFetchRunning, static: IconWebSearch },
  fast_context: { running: IconSearchRunning, static: IconSearch },
  // In-app state mutations — distinct icons so the user can skim the tool
  // call log and instantly tell "oh, it updated the todo list" vs "it
  // created an artifact" vs "it added a reference".
  update_todo_list: { running: IconTodoRunning, static: IconTodo },
  create_artifact: { running: IconArtifactRunning, static: IconArtifact },
  add_reference: { running: IconReferenceRunning, static: IconReference },
  read_reference: { running: IconReadRefRunning, static: IconReadRef },
  // Phase 2 file system tools — reuse existing icons since their actions
  // visually rhyme with the originals (browse=search, modify=file).
  list_directory: { running: IconSearchRunning, static: IconSearch },
  find_files: { running: IconSearchRunning, static: IconSearch },
  grep_files: { running: IconSearchRunning, static: IconSearch },
  move_file: { running: IconFileEditing, static: IconFile },
  copy_file: { running: IconFileEditing, static: IconFile },
  search_replace: { running: IconFileEditing, static: IconFile },
  execute_python: { running: IconPythonRunning, static: IconPython },
  update_progress: { running: IconProgressRunning, static: IconProgress },
  create_folder: { running: IconFolderRunning, static: IconFolder },
  run_background_command: { running: IconBackgroundRunning, static: IconBackground },
  read_background_output: { running: IconBackgroundRunning, static: IconBackground },
  stop_background_command: { running: IconBackgroundRunning, static: IconBackground },
};
