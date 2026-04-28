// FileChangesReviewBar
//
// Sits directly above the chat input bar and surfaces every file the most
// recent Agent turn modified, created, or deleted. Each entry has two
// buttons:
//   - 保留 (keep)    → mark the change as accepted; the chip disappears
//   - 撤销 (revert) → roll the file back to its pre-turn state on disk
//
// The "next user message clears the bar" semantics are handled by App.jsx
// when it stamps a new assistant message; this component is purely visual
// and does not own any task-level state.

import { useI18n } from '../../hooks/useI18n';
import './FileChangesReviewBar.css';

const IconFileEdit = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="9" y1="15" x2="15" y2="15" />
  </svg>
);

const IconFilePlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="11" x2="12" y2="17" />
    <line x1="9" y1="14" x2="15" y2="14" />
  </svg>
);

const IconFileMinus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="9" y1="14" x2="15" y2="14" />
  </svg>
);

const IconFolderPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <line x1="12" y1="11" x2="12" y2="17" />
    <line x1="9" y1="14" x2="15" y2="14" />
  </svg>
);

const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconUndo = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
);

function actionIcon(action) {
  if (action === 'create') return <IconFilePlus />;
  if (action === 'create-folder') return <IconFolderPlus />;
  if (action === 'delete') return <IconFileMinus />;
  return <IconFileEdit />;
}

function actionLabel(action, t) {
  if (action === 'create') return t('chat.fileChanges.actionCreate');
  if (action === 'create-folder') return t('chat.fileChanges.actionCreateFolder');
  if (action === 'delete') return t('chat.fileChanges.actionDelete');
  return t('chat.fileChanges.actionEdit');
}

function FileChangesReviewBar({ changes, onKeep, onRevert, onKeepAll }) {
  const { t } = useI18n();
  const pending = (changes || []).filter((c) => c.status === 'pending');
  if (pending.length === 0) return null;

  return (
    <div className="fc-review-bar" role="region" aria-label={t('chat.fileChanges.regionLabel')}>
      <div className="fc-review-header">
        <span className="fc-review-title">
          {t('chat.fileChanges.title', { count: pending.length })}
        </span>
        <button
          type="button"
          className="fc-review-keep-all"
          onClick={onKeepAll}
          title={t('chat.fileChanges.keepAllTooltip')}
        >
          <IconCheck />
          <span>{t('chat.fileChanges.keepAll')}</span>
        </button>
      </div>
      <div className="fc-review-list">
        {pending.map((c) => (
          <div key={c.id} className={`fc-chip fc-action-${c.action}`}>
            <span className="fc-chip-icon">{actionIcon(c.action)}</span>
            <span className="fc-chip-action">{actionLabel(c.action, t)}</span>
            <span className="fc-chip-path" title={c.path}>{c.path}</span>
            <button
              type="button"
              className="fc-chip-btn fc-chip-keep"
              title={t('chat.fileChanges.keepTooltip')}
              onClick={() => onKeep(c.id)}
            >
              <IconCheck />
              <span>{t('chat.fileChanges.keep')}</span>
            </button>
            <button
              type="button"
              className="fc-chip-btn fc-chip-revert"
              title={t('chat.fileChanges.revertTooltip')}
              onClick={() => onRevert(c.id)}
            >
              <IconUndo />
              <span>{t('chat.fileChanges.revert')}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FileChangesReviewBar;
