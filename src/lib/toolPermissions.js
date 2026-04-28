// Tool permission framework.
//
// Gates high-risk tool calls (delete_file, edit_file, run_command...) behind
// a user-driven confirmation flow. Low-risk tools (read_file, web_search,
// fetch_url) skip this layer entirely.
//
// Policy levels per tool (stored in `arctic-toolPermissions`):
//   'ask'       → always prompt (default for destructive tools)
//   'session'   → allow for the remainder of the current tab session
//   'always'    → persistent allow (user explicitly granted forever)
//   'deny'      → persistent deny (user explicitly forbade)
//
// API:
//   requestPermission(req, { sessionAllows, openConfirm })
//     resolves to 'allow' | 'deny'.
//     `req.toolName` must match the keys in DEFAULT_POLICIES.
//     `openConfirm(req)` is a UI callback returning a Promise<decision>
//     where decision is 'once' | 'session' | 'always' | 'deny'.

const STORAGE_KEY = 'arctic-toolPermissions';

// Per-tool default policy. Tools NOT listed here are considered low-risk
// and auto-allowed without any user prompt. Tools marked 'ask' must go
// through the ToolConfirmModal on every invocation unless the user has
// already upgraded them to 'session' or 'always'.
export const DEFAULT_POLICIES = {
  // Destructive / unrecoverable. Genuinely warrants up-front confirm —
  // an undo bar can't bring back a deleted file's content reliably.
  delete_file: 'ask',
  // execute_python runs arbitrary code on the user's machine — always prompt.
  execute_python: 'ask',
  // ── Reversible file mutations. We default these to 'always' because
  // the chat input bar now shows a per-turn "review changes" strip that
  // lets the user keep or revert each file individually after the fact.
  // Forcing a modal before every write was just noise. Users who want
  // belt-and-suspenders behavior can flip these back to 'ask' in
  // settings.
  edit_file: 'always',
  create_file: 'always',
  create_folder: 'always',
  search_replace: 'always',
  copy_file: 'always',
  // move_file would need to roll back two paths simultaneously, which the
  // simple per-file undo bar can't model cleanly — keep it explicit.
  move_file: 'ask',
  // run_command has its own dedicated modal with paste-back UI, so we
  // don't gate it through the generic ToolConfirmModal.
  // list_directory / find_files / grep_files are read-only → not gated.
};

// Metadata shown inside the confirmation modal per tool. Used to render
// icon / title / description / risk banner consistently.
// Translation keys are used instead of hardcoded strings.
export const TOOL_METADATA = {
  delete_file: {
    titleKey: 'toolPermissions.deleteFile.title',
    risk: 'high',
    descriptionKey: 'toolPermissions.deleteFile.description',
  },
  edit_file: {
    titleKey: 'toolPermissions.editFile.title',
    risk: 'medium',
    descriptionKey: 'toolPermissions.editFile.description',
  },
  create_file: {
    titleKey: 'toolPermissions.createFile.title',
    risk: 'low',
    descriptionKey: 'toolPermissions.createFile.description',
  },
  create_folder: {
    titleKey: 'toolPermissions.createFolder.title',
    risk: 'low',
    descriptionKey: 'toolPermissions.createFolder.description',
  },
  search_replace: {
    titleKey: 'toolPermissions.searchReplace.title',
    risk: 'medium',
    descriptionKey: 'toolPermissions.searchReplace.description',
  },
  move_file: {
    titleKey: 'toolPermissions.moveFile.title',
    risk: 'medium',
    descriptionKey: 'toolPermissions.moveFile.description',
  },
  copy_file: {
    titleKey: 'toolPermissions.copyFile.title',
    risk: 'low',
    descriptionKey: 'toolPermissions.copyFile.description',
  },
  execute_python: {
    titleKey: 'toolPermissions.executePython.title',
    risk: 'medium',
    descriptionKey: 'toolPermissions.executePython.description',
  },
};

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeStored(policies) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(policies));
  } catch {
    /* quota full — ignore, user will just see 'ask' again */
  }
}

// Persisted policy for a tool (falling back to DEFAULT_POLICIES).
// Returns undefined when the tool isn't gated at all (auto-allow).
export function getStoredPolicy(toolName) {
  const stored = readStored();
  if (stored[toolName]) return stored[toolName];
  return DEFAULT_POLICIES[toolName];
}

export function setStoredPolicy(toolName, policy) {
  const stored = readStored();
  if (policy === null || policy === undefined) {
    delete stored[toolName];
  } else {
    stored[toolName] = policy;
  }
  writeStored(stored);
}

// Check whether a tool needs confirmation. Returns:
//   { needsConfirm: boolean, autoDecision: 'allow' | 'deny' | null }
export function checkPolicy(toolName, { sessionAllows } = {}) {
  const policy = getStoredPolicy(toolName);
  if (!policy) {
    // Tool not in DEFAULT_POLICIES = low-risk, auto-allow
    return { needsConfirm: false, autoDecision: 'allow' };
  }
  if (policy === 'always') return { needsConfirm: false, autoDecision: 'allow' };
  if (policy === 'deny') return { needsConfirm: false, autoDecision: 'deny' };
  if (policy === 'session' && sessionAllows?.has(toolName)) {
    return { needsConfirm: false, autoDecision: 'allow' };
  }
  // 'ask' or 'session' without prior session-allow flag
  return { needsConfirm: true, autoDecision: null };
}

// High-level entry point. `req` shape:
//   {
//     toolName: 'delete_file',
//     argsSummary: '/path/to/file.txt',   // shown in modal body
//     args: { ... },                       // full args JSON for details toggle
//   }
// Options:
//   sessionAllows   Set<string> of tool names already allowed this session
//   markSessionAllow  (toolName) => void  to persist 'session' grant in the Set
//   openConfirm     (req) => Promise<'once' | 'session' | 'always' | 'deny'>
//
// Resolves 'allow' | 'deny'.
export async function requestPermission(req, {
  sessionAllows,
  markSessionAllow,
  openConfirm,
} = {}) {
  const { needsConfirm, autoDecision } = checkPolicy(req.toolName, { sessionAllows });
  if (!needsConfirm) return autoDecision;
  if (typeof openConfirm !== 'function') {
    // No UI wired — default to deny so we fail safe.
    return 'deny';
  }
  const decision = await openConfirm(req);
  switch (decision) {
    case 'once':
      return 'allow';
    case 'session':
      markSessionAllow?.(req.toolName);
      return 'allow';
    case 'always':
      setStoredPolicy(req.toolName, 'always');
      return 'allow';
    case 'deny':
    default:
      return 'deny';
  }
}
