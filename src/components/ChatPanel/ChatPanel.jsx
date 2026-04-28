import { useState, useRef, useEffect, useMemo } from 'react';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import ReactMarkdown from 'react-markdown';
import { REMARK_PLUGINS, REHYPE_PLUGINS } from '../../lib/markdownPlugins';
import { MARKDOWN_COMPONENTS } from '../../lib/markdownComponents';
import {
  pickFileReference,
  pickFolderReference,
  addTerminalReference,
  dropReference,
} from '../../lib/references';
import { getModelGroups, getAllModels, reasoningLabels } from '../../lib/models';
import { readToolsConfig } from '../../lib/toolsConfig';
import arcticCodeLogo from '../../assets/arctic-code-logo.svg';
import { ToolIcon } from './AnimatedToolIcons';
import { ToolCallVisualizer } from './ToolCallVisualizer';
import FileChangesReviewBar from './FileChangesReviewBar';
import BackgroundCommandsBar from './BackgroundCommandsBar';
import { useI18n } from '../../hooks/useI18n';
import * as mcp from '../../lib/mcp/registry';
import './ChatPanel.css';

// SVG Icons
// 立方体（正方体）— 用于 Tools / MCP 按钮，传达"模块化能力包"的含义。
// 顶面 + 两个可见侧面，用 currentColor 描线，跟随主题色。
const IconCube = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const IconAttach = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
  </svg>
);

const IconImage = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const IconChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const IconArrowUp = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);

// Solid square — clearer affordance for "Stop generation" than the key-ish
// circle used previously. Used in the send-button slot while streaming.
const IconStop = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

// Proper brain icon for the thinking-chain summary (Lucide-style two-lobed
// brain with a central sulcus). Previous version was an abstract curve
// set that read as "headphones" more than "brain" at 14px.
const IconBrain = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
    <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
    <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
    <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
    <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
    <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
    <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
    <path d="M6 18a4 4 0 0 1-1.967-.516" />
    <path d="M19.967 17.484A4 4 0 0 1 18 18" />
  </svg>
);

const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--arctic-blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconCopy = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

const IconThumbUp = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z" />
    <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
  </svg>
);

const IconThumbDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z" />
    <path d="M17 2h3a2 2 0 012 2v7a2 2 0 01-2 2h-3" />
  </svg>
);

const IconSnowflake = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--arctic-blue)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M17 7l-5-5-5 5" /><path d="M17 17l-5 5-5-5" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M7 7l-5 5 5 5" /><path d="M17 7l5 5-5 5" />
  </svg>
);

const IconCode = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
  </svg>
);

const IconAgent = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="10" r="3" />
    <path d="M7 20.662V19a2 2 0 012-2h6a2 2 0 012 2v1.662" />
  </svg>
);

const IconDirectory = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
  </svg>
);

const IconPlayground = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <path d="M9 3v18" />
  </svg>
);

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconFile = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <polyline points="13 2 13 9 20 9" />
  </svg>
);

const IconSkill = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

// (IconTool moved to AnimatedToolIcons.jsx — used via getToolIcon)

const IconAudio = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
);

const IconLink = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const IconFolder = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const IconTerminal = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

// Book / Skill icon — used for skill references and the attachment menu's
// "引用 Skill" button. Visually rhymes with the Skills sidebar entry.
const IconBook = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const IconXSmall = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconChevronRight = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// ThinkingBlock: renders the model's chain-of-thought as a collapsible
// section. Behavior:
//   - Always **defaults to collapsed** — the chain-of-thought is auxiliary
//     and shouldn't shove the actual answer below the fold. The summary
//     line ("正在思考… / 思维链 + duration") still updates live so the
//     user knows reasoning is happening.
//   - User can click to expand at any time. Once toggled, that choice is
//     remembered for the lifetime of the message bubble (re-renders from
//     streaming tokens won't yank it back closed).
function ThinkingBlock({ isLive, duration, text }) {
  // null = follow default (collapsed); true/false = user override.
  const [userOpen, setUserOpen] = useState(null);
  const open = userOpen !== null ? userOpen : false;

  return (
    <details
      className={`chat-thinking-block ${isLive ? 'is-thinking' : ''}`}
      open={open}
      onToggle={(e) => {
        // Only react to user-driven toggles. We compare the actual DOM
        // open state against our intended state to detect user input.
        const actual = e.currentTarget.open;
        if (actual !== open) setUserOpen(actual);
      }}
    >
      <summary className="chat-thinking-summary">
        <IconBrain />
        <span>{isLive ? '正在思考…' : '思维链'}</span>
        {!isLive && duration > 0 && (
          <span className="chat-thinking-duration">{duration}s</span>
        )}
      </summary>
      <div className="chat-thinking-content">
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MARKDOWN_COMPONENTS}>{text || ''}</ReactMarkdown>
      </div>
    </details>
  );
}

// Compact "IN 12.4k → 7.2k · OUT 1.1k" badge rendered next to the model
// tag when contextCompression.showTokenStats is on. Numbers come straight
// from the per-message tokenStats accumulator (App.jsx). Auto-formats
// thousands with a "k" suffix to keep the line short.
function TokenStatsBadge({ stats }) {
  const { t } = useI18n();
  const fmt = (n) => {
    if (!n) return '0';
    if (n < 1000) return String(n);
    return (n / 1000).toFixed(n < 10000 ? 2 : 1) + 'k';
  };
  const inputRaw = stats.inputRaw || 0;
  const inputWire = stats.inputWire || 0;
  const output = stats.output || 0;
  const saved = Math.max(0, inputRaw - inputWire);
  const savedPct = inputRaw > 0 ? Math.round((saved / inputRaw) * 100) : 0;
  // Title shows full numbers on hover for users who want exact figures.
  const title =
    `IN raw: ${inputRaw} tok\n` +
    `IN sent: ${inputWire} tok\n` +
    `OUT: ${output} tok\n` +
    (saved > 0 ? `Saved: ${saved} tok (${savedPct}%)` : 'Saved: 0');
  return (
    <span className="chat-token-stats" title={title}>
      <span className="chat-token-stats-segment">
        <span className="chat-token-stats-label">{t('chat.tokenStats.in')}</span>
        {inputWire !== inputRaw ? (
          <>
            <span className="chat-token-stats-strike">{fmt(inputRaw)}</span>
            <span className="chat-token-stats-arrow">→</span>
            <strong>{fmt(inputWire)}</strong>
          </>
        ) : (
          <strong>{fmt(inputRaw)}</strong>
        )}
      </span>
      <span className="chat-token-stats-sep">·</span>
      <span className="chat-token-stats-segment">
        <span className="chat-token-stats-label">{t('chat.tokenStats.out')}</span>
        <strong>{fmt(output)}</strong>
      </span>
      {saved > 0 && (
        <span className="chat-token-stats-saved">
          {t('chat.tokenStats.saved', { pct: savedPct })}
        </span>
      )}
    </span>
  );
}

function ToolCallCard({ call }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  // Tool name → human-friendly label
  const TOOL_LABELS = {
    update_todo_list: t('chat.toolLabels.updateTodoList'),
    update_progress: t('chat.toolLabels.updateProgress'),
    create_artifact: t('chat.toolLabels.createArtifact'),
    add_reference: t('chat.toolLabels.addReference'),
    read_reference: t('chat.toolLabels.readReference'),
    run_command: t('chat.toolLabels.runCommand'),
    fetch_url: t('chat.toolLabels.fetchUrl'),
    web_search: t('chat.toolLabels.webSearch'),
    fast_context: t('chat.toolLabels.fastContext'),
    search_workspace: t('chat.toolLabels.searchWorkspace'),
    grep_workspace: t('chat.toolLabels.grepWorkspace'),
    read_file: t('chat.toolLabels.readFile'),
    create_file: t('chat.toolLabels.createFile'),
    create_folder: t('chat.toolLabels.createFolder'),
    edit_file: t('chat.toolLabels.editFile'),
    delete_file: t('chat.toolLabels.deleteFile'),
    list_directory: t('chat.toolLabels.listDirectory'),
    find_files: t('chat.toolLabels.findFiles'),
    grep_files: t('chat.toolLabels.grepFiles'),
    move_file: t('chat.toolLabels.moveFile'),
    copy_file: t('chat.toolLabels.copyFile'),
    search_replace: t('chat.toolLabels.searchReplace'),
    execute_python: t('chat.toolLabels.executePython'),
    run_background_command: t('chat.toolLabels.runBackgroundCommand'),
    read_background_output: t('chat.toolLabels.readBackgroundOutput'),
    stop_background_command: t('chat.toolLabels.stopBackgroundCommand'),
  };

  const label = TOOL_LABELS[call.name] || call.name;

  // Build a brief inline summary for each tool so the card is informative
  // even when collapsed. Prefer a task-specific field over the full arg dump.
  let summary = '';
  if (call.name === 'update_todo_list') {
    const n = Array.isArray(call.args?.items) ? call.args.items.length : 0;
    summary = t('chat.toolLabels.items', { count: n });
  } else if (call.name === 'update_progress') {
    const p = Number(call.args?.percent);
    const pctStr = Number.isFinite(p)
      ? `${Math.max(0, Math.min(100, p)).toFixed(p < 10 ? 1 : 0)}%`
      : '';
    const etaStr = typeof call.args?.eta === 'string' ? call.args.eta.trim() : '';
    summary = [pctStr, etaStr].filter(Boolean).join(' · ');
  } else if (call.name === 'create_artifact') {
    summary = call.args?.name || '';
  } else if (call.name === 'add_reference') {
    summary = call.args?.title || '';
  } else if (call.name === 'run_command') {
    summary = call.args?.command || '';
  } else if (call.name === 'fetch_url') {
    summary = call.args?.url || '';
  } else if (call.name === 'web_search' || call.name === 'fast_context' || call.name === 'search_workspace' || call.name === 'grep_workspace') {
    summary = call.args?.query || call.args?.pattern || '';
  } else if (call.name === 'read_file' || call.name === 'create_file' || call.name === 'edit_file' || call.name === 'delete_file' || call.name === 'create_folder') {
    summary = call.args?.path || '';
  } else if (call.name === 'list_directory') {
    summary = call.args?.path || '.';
  } else if (call.name === 'find_files') {
    summary = call.args?.pattern || '';
  } else if (call.name === 'grep_files') {
    summary = call.args?.query || '';
  } else if (call.name === 'move_file' || call.name === 'copy_file') {
    summary = `${call.args?.from_path || '?'} → ${call.args?.to_path || '?'}`;
  } else if (call.name === 'search_replace') {
    summary = call.args?.path || call.args?.reference_id || '';
  } else if (call.name === 'execute_python') {
    const s = typeof call.args?.script === 'string' ? call.args.script.trim() : '';
    const firstLine = s.split('\n').find((ln) => ln.trim() && !ln.trim().startsWith('#')) || s.split('\n')[0] || '';
    summary = firstLine.slice(0, 60);
  } else if (call.name === 'run_background_command') {
    summary = call.args?.command || '';
  } else if (call.name === 'read_background_output' || call.name === 'stop_background_command') {
    summary = call.args?.id || '';
  }

  // ── Result-derived stats badge ──────────────────────────────────────
  // Renders on the far right of the collapsed card so the user can see
  // "what happened" without expanding. We build a small JSX fragment
  // (not just a string) so we can colour the +N green and the −N red.
  // Only computed when the tool has actually returned a result, since
  // mid-stream the numbers are still in flight.
  let statsBadge = null;
  const r = call.result;
  if (r && call.status !== 'running') {
    if (call.name === 'read_file' && r.ok) {
      // Prefer the explicit range echoed by readFile(); fall back to
      // total_lines when the model omitted start/end (full read).
      const start = r.start_line;
      const end = r.end_line;
      const total = r.total_lines;
      if (typeof start === 'number' && typeof end === 'number' && total > 0) {
        const lineCount = end - start + 1;
        const isFull = start === 1 && end === total;
        statsBadge = (
          <span className="chat-tool-stats" title={t('chat.tools.lineRange')}>
            <span className="chat-tool-stats-neutral">
              {isFull
                ? t('chat.tools.totalLines', { n: total })
                : `L${start}–${end} · ${t('chat.tools.totalLines', { n: lineCount })}`}
            </span>
            {r.truncated && (
              <span className="chat-tool-stats-warn">·{t('chat.tools.truncatedShort')}</span>
            )}
          </span>
        );
      }
    } else if ((call.name === 'create_file' || call.name === 'edit_file' || call.name === 'search_replace') && r.ok) {
      const added = r.linesAdded;
      const removed = r.linesRemoved;
      if (typeof added === 'number' || typeof removed === 'number') {
        statsBadge = (
          <span className="chat-tool-stats">
            {added > 0 && <span className="chat-tool-stats-add">+{added}</span>}
            {removed > 0 && <span className="chat-tool-stats-del">−{removed}</span>}
            {(!added || added === 0) && (!removed || removed === 0) && (
              <span className="chat-tool-stats-neutral">{t('chat.tools.noChange')}</span>
            )}
          </span>
        );
      }
    } else if ((call.name === 'find_files' || call.name === 'grep_files') && r.ok) {
      const n = Array.isArray(r.matches) ? r.matches.length : 0;
      statsBadge = (
        <span className="chat-tool-stats">
          <span className="chat-tool-stats-neutral">
            {t('chat.tools.matchCount', { n })}
          </span>
          {r.truncated && (
            <span className="chat-tool-stats-warn">·{t('chat.tools.truncatedShort')}</span>
          )}
        </span>
      );
    } else if (call.name === 'list_directory' && r.ok) {
      const n = Array.isArray(r.entries) ? r.entries.length : 0;
      statsBadge = (
        <span className="chat-tool-stats">
          <span className="chat-tool-stats-neutral">
            {t('chat.tools.entryCount', { n })}
          </span>
          {r.truncated && (
            <span className="chat-tool-stats-warn">·{t('chat.tools.truncatedShort')}</span>
          )}
        </span>
      );
    }
  }

  return (
    <div className={`chat-tool-card status-${call.status}`}>
      <button
        className="chat-tool-header"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`chat-tool-status-dot status-${call.status}`} />
        <span className={`chat-tool-icon ${call.status === 'running' ? 'is-running' : ''}`}>
          <ToolIcon name={call.name} status={call.status} />
        </span>
        <span className="chat-tool-name">{label}</span>
        {summary && <span className="chat-tool-summary">{summary}</span>}
        {statsBadge}
        <span className={`chat-tool-chevron ${expanded ? 'expanded' : ''}`}>
          <IconChevronRight />
        </span>
      </button>
      {expanded && (
        <div className="chat-tool-body">
          <ToolCallVisualizer call={call} />
        </div>
      )}
    </div>
  );
}

// Max file size per attachment (MB). Keeps localStorage happy; change if needed.
const MAX_ATTACHMENT_MB = 8;

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Tiny exit-animation helper: keeps an element mounted for `ms` after
// `visible` flips false so a CSS leave animation has time to play. The
// returned `closing` flag is meant to be applied as an `is-closing`
// class — see the modern-plus mpFadeOut keyframe in index.css.
function useExitAnimated(visible, ms = 160) {
  const [render, setRender] = useState(visible);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (visible) {
      setRender(true);
      setClosing(false);
      return undefined;
    }
    if (!render) return undefined;
    setClosing(true);
    const id = setTimeout(() => {
      setRender(false);
      setClosing(false);
    }, ms);
    return () => clearTimeout(id);
  }, [visible, ms, render]);
  return { render, closing };
}

function ChatPanel({ mode, messages, onSendMessage, onStopGenerating, onDeleteMessage, selectedModel, onModelChange, workspace = 'playground', onWorkspaceChange, projects = [], onAddProject, onKeepFileChange, onRevertFileChange, onKeepAllFileChanges, backgroundCommands = [], onStopBackgroundCommand, onDismissBackgroundCommand, skills = [] }) {
  const { t } = useI18n();
  const [currentTheme, setCurrentTheme] = useState(() => document.documentElement.dataset.theme || '');
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setCurrentTheme(document.documentElement.dataset.theme || '');
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  // Read showTimestamps from chat config; refresh when toolsConfig changes
  // in another tab (storage event) so the toggle takes effect live.
  const [showTimestamps, setShowTimestamps] = useState(
    () => !!(readToolsConfig().chat?.showTimestamps),
  );
  useEffect(() => {
    const refresh = () => setShowTimestamps(!!(readToolsConfig().chat?.showTimestamps));
    const onStorage = (e) => { if (e.key === 'arctic-toolsConfig') refresh(); };
    window.addEventListener('storage', onStorage);
    // Also poll on focus — same-window changes don't fire 'storage'.
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  const [input, setInput] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
  // Exit-animation wrappers — keep dropdowns mounted briefly after the
  // user closes them so the mpFadeOut keyframe (modern-plus theme) can
  // play. The `closing` flag toggles the `is-closing` class.
  const workspaceDropdownExit = useExitAnimated(showWorkspaceDropdown, 160);
  const [showAttachDropdown, setShowAttachDropdown] = useState(false);
  const attachDropdownExit = useExitAnimated(showAttachDropdown, 160);
  // When the user clicks "引用 Skill" inside the attach dropdown, we
  // swap the dropdown contents to a list of registered skills instead
  // of closing it. This avoids needing a full modal for what is just a
  // single-pick interaction.
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [skillPickerQuery, setSkillPickerQuery] = useState('');
  // Tools / MCP dropdown — sits to the right of the attach button. Shows
  // a live snapshot of every connected MCP server and the count of
  // tools each one exposes. Subscribing here means the popover updates
  // in real time as connections settle (initial connect, reconnect after
  // edit, disable, etc.) without us having to thread props down.
  const [showToolsDropdown, setShowToolsDropdown] = useState(false);
  const [mcpStatuses, setMcpStatuses] = useState(() => mcp.getStatus());
  const [attachments, setAttachments] = useState([]); // [{id, kind, mimeType, name, size, dataUrl}]
  const [attachError, setAttachError] = useState(null);
  const [references, setReferences] = useState([]); // [{id, kind:'file'|'folder'|'terminal', name, size?, mimeType?}]
  const [reasoningLevel, setReasoningLevel] = useLocalStorage('arctic-reasoningLevel', {});
  // Bumped whenever SettingsModal saves provider configs (custom models,
  // etc.). The dropdown + current-model lookups recompute from the live
  // catalogue on every render, so this tick just forces that re-render.
  const [, setModelsTick] = useState(0);
  useEffect(() => {
    const refresh = () => setModelsTick((t) => t + 1);
    window.addEventListener('arctic-providerConfigs-updated', refresh);
    // Another tab may update localStorage too (rare — the app is a single
    // window in practice — but cheap to wire up).
    window.addEventListener('storage', (e) => {
      if (e.key === 'arctic-providerConfigs') refresh();
    });
    return () => {
      window.removeEventListener('arctic-providerConfigs-updated', refresh);
    };
  }, []);
  // Live merged catalogue. The settings event above bumps state to re-render
  // after provider config changes, so a direct read is enough here.
  const modelGroups = getModelGroups();
  const allModels = getAllModels();
  const messagesEndRef = useRef(null);
  // Ref to the scrolling viewport (`.chat-messages`). We need direct
  // access — not just the bottom anchor — because the auto-scroll
  // policy depends on the user's current scrollTop, which we can't
  // read from a sentinel element.
  const messagesContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const workspaceDropdownRef = useRef(null);
  // Modern+ pill row hosts its own inline workspace dropdown anchored to
  // the pill (the original .workspace-selector-wrap is hidden in that
  // theme). The outside-click handler treats both refs as "inside" so
  // clicking the pill doesn't immediately close the popover it just
  // opened.
  const pillsWorkspaceWrapRef = useRef(null);
  const attachDropdownRef = useRef(null);
  const toolsDropdownRef = useRef(null);
  const imageInputRef = useRef(null);
  const audioInputRef = useRef(null);

  // Subscribe to MCP registry changes — the registry pushes a snapshot
  // immediately on subscribe and again whenever a server's status
  // changes, so the tools dropdown stays accurate without polling.
  useEffect(() => mcp.subscribe(setMcpStatuses), []);

  // ── Smart auto-scroll ───────────────────────────────────────────────
  // The previous version blindly scrolled to bottom on every `messages`
  // change. That fires on:
  //   - every streaming token (fine, expected)
  //   - tool-call status flips (fine)
  //   - task switches (we DO want to land at bottom of new convo)
  //   - retract / edit / message deletion (yanks the user away from
  //     whatever they were reading)
  //   - any localStorage rehydration from another tab
  // Result: the user could be reading message #5 of 50, the assistant
  // would emit one token, and they'd be teleported to message #50.
  //
  // Fix: only auto-scroll when the user is already near the bottom
  // ("near" = within 120px). If they've scrolled up to read history,
  // we leave them alone. Two exceptions force a hard scroll:
  //   1. Task switches (the `messages.length` jumps from 0→N or vice
  //      versa, or the first message's id changes) — fresh context,
  //      always start at the bottom.
  //   2. The user just sent a message — their own input should always
  //      be visible. Detected via a ref we set in handleSend below.
  const NEAR_BOTTOM_THRESHOLD_PX = 120;
  const wasAtBottomRef = useRef(true);
  const forceScrollNextRenderRef = useRef(false);
  // Used to detect task switches without taking activeTask as a prop
  // (which we don't have here). The "first message id" is a robust
  // proxy: when the user picks a different task, the first id changes.
  const lastFirstMsgIdRef = useRef(null);

  // Track scroll position. Updates wasAtBottomRef synchronously on
  // every scroll so the next render's effect knows the latest state.
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
      wasAtBottomRef.current = distance <= NEAR_BOTTOM_THRESHOLD_PX;
    };
    // Seed once so an empty conversation (no scroll yet) starts as
    // "at bottom" — otherwise the very first user message wouldn't
    // get auto-scrolled.
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const firstMsgId = messages[0]?.id || null;
    const isTaskSwitch = firstMsgId !== lastFirstMsgIdRef.current;
    lastFirstMsgIdRef.current = firstMsgId;

    const force =
      forceScrollNextRenderRef.current ||
      isTaskSwitch ||
      messages.length === 0;
    forceScrollNextRenderRef.current = false;

    if (force) {
      // Hard jump (no animation) on task switch — smooth-scrolling
      // through a different conversation's content looks janky.
      el.scrollTop = el.scrollHeight;
      wasAtBottomRef.current = true;
      return;
    }

    if (wasAtBottomRef.current) {
      const chatCfg = readToolsConfig().chat || {};
      // Skip auto-scroll if user disabled it; they'll scroll manually.
      if (chatCfg.autoScrollOnStream !== false) {
        // Use scrollTop directly instead of scrollIntoView for more reliable scrolling
        el.scrollTop = el.scrollHeight;
      }
    }
    // else: user is reading history — don't move them.
  }, [messages]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowModelDropdown(false);
      }
      {
        const insideMain = workspaceDropdownRef.current && workspaceDropdownRef.current.contains(e.target);
        const insidePill = pillsWorkspaceWrapRef.current && pillsWorkspaceWrapRef.current.contains(e.target);
        if (!insideMain && !insidePill) {
          setShowWorkspaceDropdown(false);
        }
      }
      if (attachDropdownRef.current && !attachDropdownRef.current.contains(e.target)) {
        setShowAttachDropdown(false);
      }
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(e.target)) {
        setShowToolsDropdown(false);
      }
    };
    if (showModelDropdown || showWorkspaceDropdown || showAttachDropdown || showToolsDropdown) {
      document.addEventListener('mousedown', handler);
    }
    return () => document.removeEventListener('mousedown', handler);
  }, [showModelDropdown, showWorkspaceDropdown, showAttachDropdown, showToolsDropdown]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed && attachments.length === 0 && references.length === 0) return;
    // Force a scroll-to-bottom on the next render: the user's own send
    // is always something they want to see, even if they were scrolled
    // up reading history just before clicking Send.
    forceScrollNextRenderRef.current = true;
    onSendMessage(trimmed, attachments, references);
    setInput('');
    // Honor user preference for clearing attachments/references after send.
    const chatCfg = readToolsConfig().chat || {};
    if (chatCfg.clearAttachmentsAfterSend !== false) {
      setAttachments([]);
      setReferences([]);
    }
    setAttachError(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    const chatCfg = readToolsConfig().chat || {};
    const useCmdEnter = chatCfg.sendShortcut === 'cmd-enter';
    if (useCmdEnter) {
      // Cmd/Ctrl+Enter to send; plain Enter inserts a newline.
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        handleSubmit();
      }
    } else {
      // Default: Enter to send, Shift+Enter for newline.
      if (!e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    }
  };

  const handleTextareaInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  };

  const handleFilesPicked = async (fileList, kind) => {
    if (!fileList || fileList.length === 0) return;
    setAttachError(null);
    const added = [];
    for (const file of Array.from(fileList)) {
      if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
        setAttachError(t('chat.errors.fileTooLarge', { name: file.name, maxSize: MAX_ATTACHMENT_MB }));
        continue;
      }
      try {
        const dataUrl = await readFileAsDataURL(file);
        added.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          kind,
          mimeType: file.type,
          name: file.name,
          size: file.size,
          dataUrl,
        });
      } catch {
        setAttachError(t('chat.errors.cannotReadFile', { name: file.name }));
      }
    }
    if (added.length > 0) setAttachments((prev) => [...prev, ...added]);
  };

  const removeAttachment = (id) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const addReferenceToInput = (ref) => setReferences((prev) => [...prev, ref]);

  const handlePickFileReference = async () => {
    setAttachError(null);
    try {
      const ref = await pickFileReference();
      addReferenceToInput(ref);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        const errorKey = err.message === 'file_picker_not_supported' ? 'chat.errors.filePickerNotSupported' : 'chat.errors.cannotReferenceFile';
        setAttachError(t(errorKey, { error: err.message || err }));
      }
    }
  };

  const handlePickFolderReference = async () => {
    setAttachError(null);
    try {
      const ref = await pickFolderReference();
      addReferenceToInput(ref);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        const errorKey = err.message === 'folder_picker_not_supported' ? 'chat.errors.folderPickerNotSupported' : 'chat.errors.cannotReferenceFolder';
        setAttachError(t(errorKey, { error: err.message || err }));
      }
    }
  };

  const handleAddTerminalReference = () => {
    setAttachError(null);
    const text = window.prompt(t('chat.ui.terminalPrompt'));
    if (text == null) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const ref = addTerminalReference(trimmed);
    addReferenceToInput(ref);
  };

  // Add a skill as a reference. Unlike file/folder/terminal refs (which
  // round-trip through references.js + IndexedDB), skills are already
  // persisted in App-level localStorage — we just snapshot the metadata
  // and pass the skill id back through. The agent reads the full content
  // via the read_skill tool.
  const handleAddSkillReference = (skill) => {
    setShowSkillPicker(false);
    setShowAttachDropdown(false);
    setSkillPickerQuery('');
    if (!skill) return;
    // De-dupe: same skill shouldn't appear twice in the references row.
    setReferences((prev) =>
      prev.some((r) => r.kind === 'skill' && r.id === skill.id)
        ? prev
        : [
            ...prev,
            {
              id: skill.id,
              kind: 'skill',
              name: skill.name || 'Untitled Skill',
              description: skill.description || '',
              size: typeof skill.size === 'number' ? skill.size : undefined,
              mimeType: 'text/markdown',
            },
          ],
    );
  };

  const removeReference = (id) => {
    dropReference(id);
    setReferences((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSelectModel = (model) => {
    onModelChange(model.id);
    if (model.reasoning && !reasoningLevel[model.id]) {
      setReasoningLevel((prev) => ({ ...prev, [model.id]: model.reasoning[0] }));
    }
    setShowModelDropdown(false);
  };

  const currentModel = allModels.find((m) => m.id === selectedModel) || allModels[0];
  const currentReasoning = reasoningLevel[selectedModel] || (currentModel?.reasoning?.[0]);

  // Is any assistant turn currently streaming? Drives the Send ↔ Stop toggle
  // and the visibility of per-message action bars.
  const isGenerating = useMemo(
    () => messages.some((m) => m.role === 'assistant' && m.loading),
    [messages]
  );

  // The user message whose reply is in-flight. We hide the retract button on
  // THAT user turn while generating — otherwise a mid-stream retract confuses
  // the rollback flow.
  const pendingUserMsgId = useMemo(() => {
    const pending = messages.find((m) => m.role === 'assistant' && m.loading);
    return pending?.userMsgId || null;
  }, [messages]);

  // Collect media types already used in this task's message history (locks out models later)
  const requiredMedia = useMemo(() => {
    const set = new Set();
    for (const m of messages) {
      if (Array.isArray(m.attachments)) {
        for (const a of m.attachments) if (a.kind) set.add(a.kind);
      }
    }
    // Also lock based on attachments currently pending in the input
    for (const a of attachments) if (a.kind) set.add(a.kind);
    return set;
  }, [messages, attachments]);

  const isModelCompatible = (model) => {
    for (const k of requiredMedia) {
      if (!model.media?.includes(k)) return false;
    }
    return true;
  };

  // Can the user attach a specific kind right now?
  // Requires: current model supports the kind
  const canAttachKind = (kind) => Boolean(currentModel?.media?.includes(kind));

  const displayName = currentModel
    ? currentReasoning && currentModel.reasoning
      ? `${currentModel.name} · ${reasoningLabels[currentReasoning]}`
      : currentModel.name
    : 'Select Model';

  const currentWorkspaceName = workspace === 'playground'
    ? 'Playground'
    : projects.find((p) => p.id === workspace)?.name || t('chat.ui.unnamedProject');

  return (
    <div className="chat-panel" data-empty={messages.length === 0 ? 'true' : 'false'}>
      {/* Messages Area */}
      <div className="chat-messages" ref={messagesContainerRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <IconAgent />
            </div>
            <h2 className="chat-empty-title">
              {t('chat.ui.welcomeTitle')}
            </h2>
            <p className="chat-empty-subtitle">
              {t('chat.ui.welcomeSubtitle')}
            </p>
          </div>
        ) : (
          <div className="chat-messages-list">
            {messages.map((msg) => (
              <div key={msg.id} className={`chat-message ${msg.role}`}>
                {msg.role === 'user' ? (
                  <div className="chat-message-user">
                    <div className="chat-message-bubble">
                      {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                        <div className="chat-message-attachments">
                          {msg.attachments.map((a) => (
                            a.kind === 'image' ? (
                              <img
                                key={a.id}
                                src={a.dataUrl}
                                alt={a.name}
                                className="chat-message-attachment-image"
                                title={a.name}
                              />
                            ) : (
                              <div key={a.id} className="chat-message-attachment-chip">
                                <IconAudio />
                                <span className="chat-attachment-name">{a.name}</span>
                                <span className="chat-attachment-size">{formatFileSize(a.size)}</span>
                              </div>
                            )
                          ))}
                        </div>
                      )}
                      {Array.isArray(msg.references) && msg.references.length > 0 && (
                        <div className="chat-message-attachments">
                          {msg.references.map((r) => (
                            <div key={r.id} className="chat-message-attachment-chip">
                              {r.kind === 'folder' ? <IconFolder /> : r.kind === 'terminal' ? <IconTerminal /> : r.kind === 'skill' ? <IconBook /> : <IconLink />}
                              <span className="chat-attachment-name">
                                {r.kind === 'folder' ? `${r.name}/` : r.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {msg.content}
                      {/* Hide retract while this very user-turn's reply is
                          still streaming. Reappears once loading flips off. */}
                      {msg.id !== pendingUserMsgId && (
                        <button
                          className="chat-retract-btn"
                          title="撤回消息"
                          onClick={() => onDeleteMessage?.(msg.id, (text) => setInput(text))}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="chat-message-assistant">
                    <div className="chat-message-agent-header">
                      <span className="chat-message-agent-icon"><img src={arcticCodeLogo} alt="Arctic" width="16" height="16" /></span>
                      <span className="chat-message-agent-name">Agent</span>
                      {msg.model && (
                        <span className="chat-message-model-tag">
                          {allModels.find((m) => m.id === msg.model)?.name || msg.model}
                        </span>
                      )}
                      {!msg.loading && msg.thinkingDuration > 0 && (
                        <span className="chat-message-duration">{msg.thinkingDuration}s</span>
                      )}
                      {!msg.loading && msg.tokenStats && (
                        <TokenStatsBadge stats={msg.tokenStats} />
                      )}
                    </div>
                    
                    {/* Interleaved timeline: each iteration contributes
                        thinking → text → tool_calls in chronological
                        order. If `timeline` is absent (legacy stored
                        messages), fall back to the old flat layout. */}
                    {Array.isArray(msg.timeline) && msg.timeline.length > 0 ? (
                      <div className="chat-timeline">
                        {msg.timeline.map((evt) => {
                          if (evt.type === 'thinking') {
                            return (
                              <ThinkingBlock
                                key={evt.id}
                                isLive={evt.isLive}
                                duration={evt.duration}
                                text={evt.text}
                              />
                            );
                          }
                          if (evt.type === 'text') {
                            return (
                              <div key={evt.id} className="chat-message-content">
                                <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MARKDOWN_COMPONENTS}>{evt.text || ''}</ReactMarkdown>
                              </div>
                            );
                          }
                          if (evt.type === 'tool_calls') {
                            return (
                              <div key={evt.id} className="chat-tool-calls">
                                {evt.calls.map((tc) => (
                                  <ToolCallCard key={tc.id} call={tc} />
                                ))}
                              </div>
                            );
                          }
                          return null;
                        })}
                        {/* Empty-state: no events yet and no content —
                            still need to show SOMETHING so the user
                            sees the response is loading. */}
                        {msg.loading && msg.timeline.length === 0 && (
                          <div className="chat-loading-dots"><span /><span /><span /></div>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Legacy render path (pre-timeline messages) */}
                        {msg.thinking && (
                          <ThinkingBlock
                            isLive={!!msg.isThinking}
                            duration={msg.thinkingDuration}
                            text={msg.thinking}
                          />
                        )}

                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="chat-tool-calls">
                            {msg.toolCalls.map((tc) => (
                              <ToolCallCard key={tc.id} call={tc} />
                            ))}
                          </div>
                        )}

                        <div className="chat-message-content">
                          {msg.loading && !msg.content && (!msg.toolCalls || msg.toolCalls.length === 0) ? (
                            <div className="chat-loading-dots"><span /><span /><span /></div>
                          ) : (
                            <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MARKDOWN_COMPONENTS}>{msg.content}</ReactMarkdown>
                          )}
                        </div>
                      </>
                    )}
                    {msg.stopped && (
                      <div className="chat-message-stopped-tag">已停止生成</div>
                    )}
                    {showTimestamps && msg.timestamp && (
                      <div className="chat-message-timestamp">
                        {(() => {
                          try {
                            const d = new Date(msg.timestamp);
                            const hh = String(d.getHours()).padStart(2, '0');
                            const mm = String(d.getMinutes()).padStart(2, '0');
                            return `${d.toLocaleDateString()} ${hh}:${mm}`;
                          } catch { return ''; }
                        })()}
                      </div>
                    )}
                    {/* Action bar (copy / 👍 / 👎) is only shown once the
                        assistant turn has finished streaming. While loading,
                        we don't offer a copy button because the content is
                        still growing. */}
                    {!msg.loading && (
                      <div className="chat-message-actions">
                        <button className="chat-action-btn" title="复制" onClick={() => {
                          navigator.clipboard.writeText(msg.content).catch(() => {});
                        }}><IconCopy /></button>
                        <button className="chat-action-btn" title="有帮助"><IconThumbUp /></button>
                        <button className="chat-action-btn" title="无帮助"><IconThumbDown /></button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="chat-input-bar">
        <div className="chat-input-container">
          {/* Long-running background commands (npm run dev, watchers, …)
              live ABOVE the file-changes bar so the user always sees
              "what's still running on my machine" first. The bar hides
              itself when the list is empty. */}
          <BackgroundCommandsBar
            items={backgroundCommands}
            onStop={onStopBackgroundCommand}
            onDismiss={onDismissBackgroundCommand}
          />
          {/* Per-turn file changes review — surfaces every file the latest
              assistant turn touched, with keep / revert buttons. The bar
              hides itself if there are no pending changes. */}
          {(() => {
            // Find the most recent assistant message that has at least one
            // pending fileChange entry. We look from the tail because the
            // latest turn is the one we want to surface; older turns'
            // pending entries (if any) get implicitly cleared the moment
            // the user sent the next message.
            let latestChanges = null;
            for (let i = messages.length - 1; i >= 0; i--) {
              const m = messages[i];
              if (m.role !== 'assistant') continue;
              if (!Array.isArray(m.fileChanges) || m.fileChanges.length === 0) continue;
              if (m.fileChanges.some((c) => c.status === 'pending')) {
                latestChanges = m.fileChanges;
                break;
              }
            }
            return latestChanges ? (
              <FileChangesReviewBar
                changes={latestChanges}
                onKeep={onKeepFileChange}
                onRevert={onRevertFileChange}
                onKeepAll={onKeepAllFileChanges}
              />
            ) : null;
          })()}
          {/* Attachment + reference preview row */}
          {(attachments.length > 0 || references.length > 0 || attachError) && (
            <div className="chat-attachments-row">
              {attachments.map((a) => (
                <div key={a.id} className={`chat-attachment-pill kind-${a.kind}`}>
                  {a.kind === 'image' ? (
                    <img src={a.dataUrl} alt={a.name} className="chat-attachment-thumb" />
                  ) : (
                    <span className="chat-attachment-iconbox"><IconAudio /></span>
                  )}
                  <div className="chat-attachment-meta">
                    <span className="chat-attachment-name" title={a.name}>{a.name}</span>
                    <span className="chat-attachment-size">{formatFileSize(a.size)}</span>
                  </div>
                  <button
                    className="chat-attachment-remove"
                    title="移除"
                    onClick={() => removeAttachment(a.id)}
                  >
                    <IconXSmall />
                  </button>
                </div>
              ))}
              {references.map((r) => (
                <div key={r.id} className={`chat-attachment-pill is-reference kind-${r.kind}`}>
                  <span className="chat-attachment-iconbox">
                    {r.kind === 'folder' ? <IconFolder /> : r.kind === 'terminal' ? <IconTerminal /> : r.kind === 'skill' ? <IconBook /> : <IconLink />}
                  </span>
                  <div className="chat-attachment-meta">
                    <span className="chat-attachment-name" title={r.name}>
                      {r.kind === 'folder' ? `${r.name}/` : r.name}
                    </span>
                    <span className="chat-attachment-size">
                      {r.kind === 'terminal'
                        ? '终端快照'
                        : r.kind === 'folder'
                          ? '引用·文件夹'
                          : r.kind === 'skill'
                            ? '引用·Skill'
                            : `引用·${typeof r.size === 'number' ? formatFileSize(r.size) : '文件'}`}
                    </span>
                  </div>
                  <button
                    className="chat-attachment-remove"
                    title="移除"
                    onClick={() => removeReference(r.id)}
                  >
                    <IconXSmall />
                  </button>
                </div>
              ))}
              {attachError && (
                <div className="chat-attachment-error">{attachError}</div>
              )}
            </div>
          )}
          <div className="chat-input-top">
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={input}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder='描述你想完成的任务...'
              rows={1}
            />
          </div>
          <div className="chat-input-bottom">
            <div className="chat-input-actions" ref={attachDropdownRef}>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => { handleFilesPicked(e.target.files, 'image'); e.target.value = ''; }}
              />
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => { handleFilesPicked(e.target.files, 'audio'); e.target.value = ''; }}
              />
              <button 
                className={`chat-input-action-btn ${showAttachDropdown ? 'active' : ''}`}
                title="添加附件或引用"
                onClick={() => setShowAttachDropdown(!showAttachDropdown)}
              >
                <IconAttach />
              </button>
              {attachDropdownExit.render && !showSkillPicker && (
                <div className={`attach-dropdown${attachDropdownExit.closing ? ' is-closing' : ''}`}>
                  <div className="attach-dropdown-section-label">附件（直接上传给模型）</div>
                  <button
                    className="attach-dropdown-item"
                    disabled={!canAttachKind('image')}
                    onClick={() => {
                      setShowAttachDropdown(false);
                      imageInputRef.current?.click();
                    }}
                  >
                    <IconImage />
                    <span>上传图片</span>
                    {!canAttachKind('image') && <span className="attach-dropdown-hint">模型不支持</span>}
                  </button>
                  <button
                    className="attach-dropdown-item"
                    disabled={!canAttachKind('audio')}
                    onClick={() => {
                      setShowAttachDropdown(false);
                      audioInputRef.current?.click();
                    }}
                  >
                    <IconAudio />
                    <span>上传音频</span>
                    {!canAttachKind('audio') && <span className="attach-dropdown-hint">模型不支持</span>}
                  </button>
                  <div className="attach-dropdown-divider" />
                  <div className="attach-dropdown-section-label">
                    引用（不发送内容，Agent 需要时再读取）
                  </div>
                  <button
                    className="attach-dropdown-item"
                    onClick={() => { setShowAttachDropdown(false); handlePickFileReference(); }}
                  >
                    <IconLink />
                    <span>引用文件</span>
                  </button>
                  <button
                    className="attach-dropdown-item"
                    onClick={() => { setShowAttachDropdown(false); handlePickFolderReference(); }}
                  >
                    <IconFolder />
                    <span>引用文件夹</span>
                  </button>
                  <button
                    className="attach-dropdown-item"
                    onClick={() => { setShowAttachDropdown(false); handleAddTerminalReference(); }}
                  >
                    <IconTerminal />
                    <span>引用终端输出</span>
                  </button>
                  <button
                    className="attach-dropdown-item"
                    onClick={(e) => {
                      // Open the inline skill picker instead of dismissing
                      // the dropdown — the user is still mid-attach flow.
                      e.preventDefault();
                      e.stopPropagation();
                      setSkillPickerQuery('');
                      setShowSkillPicker(true);
                    }}
                  >
                    <IconBook />
                    <span>引用 Skill</span>
                    <IconChevronRight />
                  </button>
                </div>
              )}
              {/* Skill picker — second-level panel that swaps in when the
                  user chose "引用 Skill". Lists every registered skill
                  (enabled or not) with name + description; a small search
                  box filters by both. Empty state guides the user to the
                  Skills page to import one. */}
              {attachDropdownExit.render && showSkillPicker && (
                <div className={`attach-dropdown skill-picker-dropdown${attachDropdownExit.closing ? ' is-closing' : ''}`}>
                  <div className="attach-dropdown-section-label skill-picker-header">
                    <button
                      type="button"
                      className="skill-picker-back"
                      onClick={() => setShowSkillPicker(false)}
                      title="返回"
                    >
                      ‹
                    </button>
                    <span>选择要引用的 Skill</span>
                  </div>
                  <input
                    type="text"
                    className="skill-picker-search"
                    placeholder="按名称或描述过滤…"
                    value={skillPickerQuery}
                    autoFocus
                    onChange={(e) => setSkillPickerQuery(e.target.value)}
                  />
                  {(() => {
                    const q = skillPickerQuery.trim().toLowerCase();
                    const filtered = (skills || []).filter((s) => {
                      if (!q) return true;
                      const hay = `${s.name || ''} ${s.description || ''} ${(s.tags || []).join(' ')}`.toLowerCase();
                      return hay.includes(q);
                    });
                    if (filtered.length === 0) {
                      return (
                        <div className="skill-picker-empty">
                          {(skills || []).length === 0
                            ? '尚未导入任何 Skill。前往左侧「Skills」页面导入。'
                            : '没有匹配的 Skill。'}
                        </div>
                      );
                    }
                    return (
                      <div className="skill-picker-list">
                        {filtered.map((s) => {
                          const alreadyAdded = references.some(
                            (r) => r.kind === 'skill' && r.id === s.id,
                          );
                          return (
                            <button
                              key={s.id}
                              type="button"
                              className={`attach-dropdown-item skill-picker-item${alreadyAdded ? ' is-disabled' : ''}`}
                              disabled={alreadyAdded}
                              onClick={() => handleAddSkillReference(s)}
                              title={s.description || s.name}
                            >
                              <IconBook />
                              <div className="skill-picker-item-meta">
                                <span className="skill-picker-item-name">
                                  {s.name || 'Untitled'}
                                  {s.enabled === false && (
                                    <span className="skill-picker-disabled-tag">未启用</span>
                                  )}
                                </span>
                                {s.description && (
                                  <span className="skill-picker-item-desc">
                                    {s.description}
                                  </span>
                                )}
                              </div>
                              {alreadyAdded && (
                                <span className="skill-picker-added">已添加</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
              {/* MCP/工具按钮 — 紧跟在附件按钮右侧，共用同一个 flex 容器 */}
              <div className="chat-input-actions-tools" ref={toolsDropdownRef}>
                {(() => {
                  const readyServers = mcpStatuses.filter(
                    (s) => s.status === 'ready' && s.enabled !== false,
                  );
                  const totalMcpTools = readyServers.reduce(
                    (n, s) => n + (s.toolCount || 0),
                    0,
                  );
                  const hasError = mcpStatuses.some((s) => s.status === 'error');
                  return (
                    <>
                      <button
                        className={`chat-input-action-btn ${showToolsDropdown ? 'active' : ''}`}
                        title={t('chat.ui.toolsButtonTitle')}
                        onClick={() => setShowToolsDropdown(!showToolsDropdown)}
                      >
                        <IconCube />
                        {totalMcpTools > 0 && (
                          <span className="chat-input-action-badge">{totalMcpTools}</span>
                        )}
                        {hasError && (
                          <span className="chat-input-action-dot" title={t('chat.ui.toolsErrorDot')} />
                        )}
                      </button>
                      {showToolsDropdown && (
                        <div className="attach-dropdown tools-dropdown">
                          <div className="attach-dropdown-section-label">
                            {t('chat.ui.toolsHeading')}
                          </div>
                          {mcpStatuses.length === 0 ? (
                            <div className="tools-dropdown-empty">
                              {t('chat.ui.toolsEmpty')}
                            </div>
                          ) : (
                            mcpStatuses.map((s) => (
                              <div key={s.name} className={`tools-server-row tools-status-${s.status}`}>
                                <div className="tools-server-row-head">
                                  <span className="tools-server-name">{s.name}</span>
                                  <span className={`tools-server-status tools-status-${s.status}`}>
                                    {t(`settings.mcp.status.${s.status}`) || s.status}
                                  </span>
                                </div>
                                {s.status === 'ready' && s.toolCount > 0 && (
                                  <div className="tools-server-meta">
                                    {t('chat.ui.toolsCount', { count: s.toolCount })}
                                  </div>
                                )}
                                {s.status === 'error' && s.error && (
                                  <div className="tools-server-meta tools-server-error">
                                    {s.error}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                          <div className="attach-dropdown-divider" />
                          <button
                            className="attach-dropdown-item"
                            onClick={() => {
                              setShowToolsDropdown(false);
                              try {
                                window.dispatchEvent(
                                  new CustomEvent('arctic-open-settings', {
                                    detail: { tab: 'mcp' },
                                  }),
                                );
                              } catch {
                                /* ignore */
                              }
                            }}
                          >
                            <IconCube />
                            <span>{t('chat.ui.toolsManage')}</span>
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="chat-input-right">
              {/* Workspace Selector */}
              <div className="workspace-selector-wrap" ref={workspaceDropdownRef}>
                <button
                  className="workspace-selector-btn"
                  onClick={() => setShowWorkspaceDropdown(!showWorkspaceDropdown)}
                  title={workspace === 'playground' ? 'Playground 模式' : '项目模式'}
                >
                  {workspace === 'playground' ? <IconPlayground /> : <IconDirectory />}
                  <span className="workspace-selector-name">{currentWorkspaceName}</span>
                  <IconChevronDown />
                </button>
                {showWorkspaceDropdown && (
                  <div className="workspace-dropdown">
                    <button
                      className={`workspace-dropdown-item ${workspace === 'playground' ? 'active' : ''}`}
                      onClick={() => { onWorkspaceChange?.('playground'); setShowWorkspaceDropdown(false); }}
                    >
                      <IconPlayground />
                      <span>Playground</span>
                      {workspace === 'playground' && <IconCheck />}
                    </button>
                    {projects.length > 0 && <div className="workspace-dropdown-divider" />}
                    {projects.map((project) => (
                      <button
                        key={project.id}
                        className={`workspace-dropdown-item ${workspace === project.id ? 'active' : ''}`}
                        onClick={() => { onWorkspaceChange?.(project.id); setShowWorkspaceDropdown(false); }}
                      >
                        <IconDirectory />
                        <span>{project.name}</span>
                        {workspace === project.id && <IconCheck />}
                      </button>
                    ))}
                    <div className="workspace-dropdown-divider" />
                    <button
                      className="workspace-dropdown-item workspace-dropdown-add"
                      onClick={() => { onAddProject?.(); setShowWorkspaceDropdown(false); }}
                    >
                      <IconPlus />
                      <span>新增工作区...</span>
                    </button>
                  </div>
                )}
              </div>
              
              {/* Model Selector — hidden in modern theme (moved to TitleBar) */}
              <div className="model-selector-wrap" ref={dropdownRef} style={(currentTheme === 'modern' || currentTheme === 'modern-dark' || currentTheme === 'modern-system' || currentTheme === 'modern-plus') ? { display: 'none' } : undefined}>
                <button
                  className="model-selector-btn"
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                >
                  <span className="model-selector-name">{displayName}</span>
                  <IconChevronDown />
                </button>
                {showModelDropdown && (
                  <div className="model-dropdown">
                    <div className="model-dropdown-scroll">
                      {modelGroups.map((group) => (
                        <div key={group.provider} className="model-group">
                          <div className="model-group-header">
                            <span className="model-group-dot" style={{ background: group.color }} />
                            <span className="model-group-name">{group.provider}</span>
                          </div>
                          {group.models.map((model) => {
                            const isWisector = group.provider === 'Orange Studio';
                            const incompatible = !isModelCompatible(model);
                            const disabled = isWisector || incompatible;
                            return (
                            <button
                              key={model.id}
                              className={`model-dropdown-item ${selectedModel === model.id ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                              onClick={() => !disabled && handleSelectModel(model)}
                              disabled={disabled}
                              title={incompatible && !isWisector ? '当前任务已使用附件，此模型不支持对应类型' : undefined}
                            >
                              <span className="model-item-name">{model.name}</span>
                              <div className="model-dropdown-item-right">
                                {isWisector && <span className="model-tag model-tag-unavailable">暂不可用</span>}
                                {!isWisector && incompatible && <span className="model-tag model-tag-unavailable">不兼容</span>}
                                {!isWisector && model.media.length > 0 && (
                                  <span className="model-media-tags">
                                    {model.media.includes('image') && (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" title="支持图片">
                                        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                                      </svg>
                                    )}
                                    {model.media.includes('audio') && (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" title="支持音频">
                                        <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                                      </svg>
                                    )}
                                  </span>
                                )}
                                {!isWisector && model.tag && <span className={`model-tag model-tag-${model.tag.toLowerCase()}`}>{model.tag}</span>}
                                {selectedModel === model.id && <IconCheck />}
                              </div>
                            </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    {/* Reasoning Level Selector */}
                    {currentModel?.reasoning && (
                      <div className="model-reasoning-bar">
                        <span className="model-reasoning-label">推理强度</span>
                        <div className="model-reasoning-pills">
                          {currentModel.reasoning.map((level) => (
                            <button
                              key={level}
                              className={`model-reasoning-pill ${currentReasoning === level ? 'active' : ''}`}
                              onClick={() => setReasoningLevel((prev) => ({ ...prev, [selectedModel]: level }))}
                            >
                              {reasoningLabels[level]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* Send / Stop Button — morphs into a stop button while any
                  assistant turn is streaming, letting the user abort the
                  request without having to retract the message. */}
              {isGenerating ? (
                <button
                  className="chat-send-btn is-stop"
                  onClick={() => {
                    const chatCfg = readToolsConfig().chat || {};
                    if (chatCfg.confirmBeforeStop && !window.confirm('确定要停止当前生成吗？')) return;
                    onStopGenerating?.();
                  }}
                  title="停止生成"
                  aria-label="停止生成"
                >
                  <IconStop />
                </button>
              ) : (
                <button
                  className={`chat-send-btn ${(input.trim() || attachments.length > 0 || references.length > 0) ? 'active' : ''}`}
                  onClick={handleSubmit}
                  disabled={!input.trim() && attachments.length === 0 && references.length === 0}
                  title="发送"
                  aria-label="发送"
                >
                  <IconArrowUp />
                </button>
              )}
            </div>
          </div>
        </div>
        {/* Modern+ context pills — Codex-style strip directly under the
            input box. Hosts the workspace selector as a pill with its
            own inline dropdown anchored directly below. */}
        {currentTheme === 'modern-plus' && (
          <div className="chat-context-pills" aria-hidden="false">
            <div className="chat-context-pill-wrap" ref={pillsWorkspaceWrapRef}>
              <button
                type="button"
                className={`chat-context-pill ${showWorkspaceDropdown ? 'is-open' : ''}`}
                onClick={() => setShowWorkspaceDropdown((v) => !v)}
                title={workspace === 'playground' ? 'Playground 模式' : '项目模式'}
              >
                {workspace === 'playground' ? <IconPlayground /> : <IconDirectory />}
                <span>{currentWorkspaceName}</span>
                <IconChevronDown />
              </button>
              {workspaceDropdownExit.render && (
                <div className={`workspace-dropdown chat-context-pill-dropdown${workspaceDropdownExit.closing ? ' is-closing' : ''}`}>
                  <button
                    className={`workspace-dropdown-item ${workspace === 'playground' ? 'active' : ''}`}
                    onClick={() => { onWorkspaceChange?.('playground'); setShowWorkspaceDropdown(false); }}
                  >
                    <IconPlayground />
                    <span>Playground</span>
                    {workspace === 'playground' && <IconCheck />}
                  </button>
                  {projects.length > 0 && <div className="workspace-dropdown-divider" />}
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      className={`workspace-dropdown-item ${workspace === project.id ? 'active' : ''}`}
                      onClick={() => { onWorkspaceChange?.(project.id); setShowWorkspaceDropdown(false); }}
                    >
                      <IconDirectory />
                      <span>{project.name}</span>
                      {workspace === project.id && <IconCheck />}
                    </button>
                  ))}
                  <div className="workspace-dropdown-divider" />
                  <button
                    className="workspace-dropdown-item workspace-dropdown-add"
                    onClick={() => { onAddProject?.(); setShowWorkspaceDropdown(false); }}
                  >
                    <IconPlus />
                    <span>新增工作区...</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatPanel;
