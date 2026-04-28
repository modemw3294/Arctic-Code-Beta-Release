import './RightPanel.css';
import { useI18n } from '../../hooks/useI18n';

// SVG Icons
const IconCheck = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
  </svg>
);

const IconBox = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
  </svg>
);

const IconBook = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
  </svg>
);

const IconFile = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--arctic-blue)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

// TODO status icons — empty circle / spinning arc / checkmark-in-circle.
// Replaces the old coloured-dot CSS because the user correctly pointed out
// that a 6px round blob doesn't communicate state well (and was visually
// indistinguishable from the generic legend dots used elsewhere).
const IconTodoPending = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
  </svg>
);

const IconTodoActive = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {/* Dimmer backdrop ring for contrast with the spinning arc */}
    <circle cx="12" cy="12" r="9" opacity="0.25" />
    {/* Active arc that rotates around the center */}
    <path d="M21 12a9 9 0 0 1-9 9">
      <animateTransform
        attributeName="transform"
        type="rotate"
        from="0 12 12"
        to="360 12 12"
        dur="1.1s"
        repeatCount="indefinite"
      />
    </path>
  </svg>
);

const IconTodoDone = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <polyline points="8 12 11 15 16 9" />
  </svg>
);

// Skipped — circle with a horizontal dash across it. Communicates "we
// intentionally moved past this item without completing it".
const IconTodoSkipped = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

// Failed — circle with an X inside. Distinct from "cancelled" (which we
// don't have) and from "completed" (checkmark).
const IconTodoFailed = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <line x1="9" y1="9" x2="15" y2="15" />
    <line x1="15" y1="9" x2="9" y2="15" />
  </svg>
);

// Map a TODO item's `status` field to the right SVG. Canonical statuses
// are pending / in_progress / completed / skipped / failed (5 states).
// Legacy tasks may carry 'active' / 'done' labels from earlier versions,
// so those aliases are still accepted.
function renderTodoStatusIcon(status) {
  if (status === 'completed' || status === 'done') return <IconTodoDone />;
  if (status === 'in_progress' || status === 'active') return <IconTodoActive />;
  if (status === 'skipped') return <IconTodoSkipped />;
  if (status === 'failed') return <IconTodoFailed />;
  return <IconTodoPending />;
}

function formatTokenCount(n) {
  if (!n && n !== 0) return '0';
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function ContextSection({ contextStats }) {
  const { t } = useI18n();
  const stats = contextStats || { contextWindow: 0, total: 0, percent: 0, breakdown: { skills: 0, files: 0, history: 0 } };
  const cw = stats.contextWindow || 1;
  const skillsPct = (stats.breakdown.skills / cw) * 100;
  const filesPct = (stats.breakdown.files / cw) * 100;
  const historyPct = (stats.breakdown.history / cw) * 100;
  return (
    <div className="rp-section">
      <div className="rp-section-header">
        <span className="rp-section-title">{t('rightPanel.context')}</span>
        <span className="rp-context-total">
          {formatTokenCount(stats.total)} / {formatTokenCount(stats.contextWindow)}
        </span>
      </div>
      <div className="rp-section-content">
        <div className="rp-context">
          <div className="rp-context-bar" title={`${stats.percent.toFixed(1)}% used`}>
            <div
              className="rp-context-bar-seg seg-skills"
              style={{ width: `${skillsPct}%` }}
              title={`${t('rightPanel.skills')} ${formatTokenCount(stats.breakdown.skills)}`}
            />
            <div
              className="rp-context-bar-seg seg-files"
              style={{ width: `${filesPct}%` }}
              title={`${t('rightPanel.files')} ${formatTokenCount(stats.breakdown.files)}`}
            />
            <div
              className="rp-context-bar-seg seg-history"
              style={{ width: `${historyPct}%` }}
              title={`${t('rightPanel.history')} ${formatTokenCount(stats.breakdown.history)}`}
            />
          </div>
          <div className="rp-context-stats">
            <span className="rp-context-percent">{stats.percent.toFixed(stats.percent < 10 ? 1 : 0)}%</span>
          </div>
          <div className="rp-context-legend">
            <span className="rp-legend-item">
              <span className="rp-legend-dot" style={{ background: 'var(--arctic-blue)' }} />
              {t('rightPanel.skills')} · {formatTokenCount(stats.breakdown.skills)}
            </span>
            <span className="rp-legend-item">
              <span className="rp-legend-dot" style={{ background: 'var(--status-success)' }} />
              {t('rightPanel.files')} · {formatTokenCount(stats.breakdown.files)}
            </span>
            <span className="rp-legend-item">
              <span className="rp-legend-dot" style={{ background: 'var(--text-quaternary)' }} />
              {t('rightPanel.history')} · {formatTokenCount(stats.breakdown.history)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RightPanel({ collapsed, mode, todoItems, progress, artifacts, references, contextStats, onOpenArtifact }) {
  const { t } = useI18n();
  if (collapsed) return null;

  // 进度条只有在 AI 至少调用过一次 update_progress 后才出现。百分比已在
  // 工具层夹紧到 [0,100]，这里只做兜底；ETA 为空字符串时只显示百分比。
  const hasProgress =
    progress && typeof progress.percent === 'number' && Number.isFinite(progress.percent);
  const pct = hasProgress ? Math.max(0, Math.min(100, progress.percent)) : 0;
  const eta = hasProgress ? (progress.eta || '') : '';

  return (
    <aside className="right-panel">
      {/* Todo Section */}
      <div className="rp-section">
        <div className="rp-section-header">
          <span className="rp-section-title">{t('rightPanel.todos')}</span>
        </div>
        <div className="rp-section-content">
          {todoItems.length > 0 ? (
            <div className="rp-todo-list">
              {todoItems.map((item) => (
                <div key={item.id} className={`rp-todo-item ${item.status}`}>
                  <span className={`rp-todo-icon ${item.status}`} aria-label={item.status}>
                    {renderTodoStatusIcon(item.status)}
                  </span>
                  <span className="rp-todo-text">{item.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rp-empty">
              <div className="rp-empty-icon"><IconCheck /></div>
              <span className="rp-empty-text">{t('rightPanel.noTodos')}</span>
              <span className="rp-empty-hint">{t('rightPanel.noTodosHint')}</span>
            </div>
          )}
          {hasProgress && (
            <div className="rp-progress" title={`${pct.toFixed(pct < 10 ? 1 : 0)}%`}>
              <div className="rp-progress-meta">
                <span className="rp-progress-label">{t('rightPanel.progress')}</span>
                <span className="rp-progress-percent">
                  {pct.toFixed(pct < 10 ? 1 : 0)}%
                </span>
              </div>
              <div className="rp-progress-bar">
                <div
                  className={`rp-progress-bar-fill ${pct >= 100 ? 'is-done' : ''}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {eta && pct < 100 && (
                <div className="rp-progress-eta">
                  <span className="rp-progress-eta-label">{t('rightPanel.eta')}</span>
                  <span className="rp-progress-eta-value">{eta}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {mode === 'agent' && (
        <>
          {/* Task Artifacts */}
          <div className="rp-section">
            <div className="rp-section-header">
              <span className="rp-section-title">{t('rightPanel.artifacts')}</span>
            </div>
            <div className="rp-section-content">
              {artifacts.length > 0 ? (
                <div className="rp-artifact-list">
                  {artifacts.map((artifact) => (
                    <button
                      type="button"
                      key={artifact.id}
                      className="rp-artifact-item"
                      onClick={() => onOpenArtifact?.(artifact.id)}
                      title={t('rightPanel.openArtifactTitle')}
                    >
                      <IconFile />
                      <div className="rp-artifact-info">
                        <span className="rp-artifact-name">{artifact.name}</span>
                        <span className="rp-artifact-type">{artifact.type}{artifact.language ? ` · ${artifact.language}` : ''}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rp-empty">
                  <div className="rp-empty-icon"><IconBox /></div>
                  <span className="rp-empty-text">{t('rightPanel.noArtifacts')}</span>
                  <span className="rp-empty-hint">{t('rightPanel.noArtifactsHint')}</span>
                </div>
              )}
            </div>
          </div>

          {/* References */}
          <div className="rp-section">
            <div className="rp-section-header">
              <span className="rp-section-title">{t('rightPanel.references')}</span>
            </div>
            <div className="rp-section-content">
              {references.length > 0 ? (
                <div className="rp-reference-list">
                  {references.map((ref) => (
                    <div key={ref.id} className="rp-reference-item">
                      <span className="rp-reference-icon" style={{ background: ref.color }}>
                        {ref.source?.[0]?.toUpperCase()}
                      </span>
                      <span className="rp-reference-title">{ref.title}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rp-empty">
                  <div className="rp-empty-icon"><IconBook /></div>
                  <span className="rp-empty-text">{t('rightPanel.noReferences')}</span>
                  <span className="rp-empty-hint">{t('rightPanel.noReferencesHint')}</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Context Section — shown in BOTH Code and Agent modes so users can
          always see how much of the window the active task is consuming. */}
      <ContextSection contextStats={contextStats} />
    </aside>
  );
}

export default RightPanel;
