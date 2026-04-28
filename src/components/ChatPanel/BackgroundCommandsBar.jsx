// BackgroundCommandsBar
//
// Sits above the chat input bar (and above FileChangesReviewBar) and
// surfaces every long-running shell command the agent or user kicked off
// via run_background_command. Each chip shows:
//   - command text
//   - a status pulse (green = running, gray = exited)
//   - a "stop" button while running
//   - a "dismiss" button after exit
//
// New output (since the last drain) is shown as a small "+N bytes" badge
// to telegraph "your next message will include this output for the agent".

import { useI18n } from '../../hooks/useI18n';
import './BackgroundCommandsBar.css';

const IconTerminal = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

const IconStop = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </svg>
);

const IconX = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

function BackgroundCommandsBar({ items, onStop, onDismiss }) {
  const { t } = useI18n();
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div className="bg-cmd-bar" role="region" aria-label={t('chat.backgroundCommands.regionLabel')}>
      <div className="bg-cmd-header">
        <span className="bg-cmd-title">
          {t('chat.backgroundCommands.title', { count: items.length })}
        </span>
      </div>
      <div className="bg-cmd-list">
        {items.map((it) => {
          const running = !!it.running;
          // pendingBytes is renderer-side: how many output bytes have
          // accumulated since we last drained for this chip. We render
          // it as a small inline badge so the user knows what'll get
          // sent on next message.
          const pending = Number(it.pendingBytes || 0);
          return (
            <div
              key={it.id}
              className={`bg-cmd-chip ${running ? 'is-running' : 'is-exited'}`}
            >
              <span
                className="bg-cmd-status-dot"
                title={
                  running
                    ? t('chat.backgroundCommands.running')
                    : t('chat.backgroundCommands.exited', { code: it.exitCode ?? '?' })
                }
              />
              <span className="bg-cmd-icon"><IconTerminal /></span>
              <span className="bg-cmd-cmd" title={it.command}>{it.command}</span>
              {pending > 0 ? (
                <span
                  className="bg-cmd-pending"
                  title={t('chat.backgroundCommands.newOutputBadge')}
                >
                  +{pending}B
                </span>
              ) : null}
              {running ? (
                <button
                  type="button"
                  className="bg-cmd-btn bg-cmd-stop"
                  title={t('chat.backgroundCommands.stopTooltip')}
                  onClick={() => onStop?.(it.id)}
                >
                  <IconStop />
                  <span>{t('chat.backgroundCommands.stop')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="bg-cmd-btn bg-cmd-dismiss"
                  title={t('chat.backgroundCommands.dismissTooltip')}
                  onClick={() => onDismiss?.(it.id)}
                >
                  <IconX />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default BackgroundCommandsBar;
