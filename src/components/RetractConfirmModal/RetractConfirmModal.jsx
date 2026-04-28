import { useEffect } from 'react';
import { useI18n } from '../../hooks/useI18n';
import './RetractConfirmModal.css';

const IconWarning = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const IconFile = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const IconBook = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
  </svg>
);

const IconCheckList = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
  </svg>
);

function RetractConfirmModal({ pending, onConfirm, onCancel }) {
  const { t } = useI18n();
  useEffect(() => {
    if (!pending) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
      else if (e.key === 'Enter') onConfirm();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, onCancel, onConfirm]);

  if (!pending) return null;
  const { diff } = pending;

  return (
    <div className="retract-overlay" onClick={onCancel}>
      <div className="retract-modal" onClick={(e) => e.stopPropagation()}>
        <div className="retract-header">
          <div className="retract-icon"><IconWarning /></div>
          <div className="retract-title-block">
            <h3 className="retract-title">{t('retractConfirm.title')}</h3>
            <p className="retract-subtitle">{t('retractConfirm.subtitle')}</p>
          </div>
        </div>

        <div className="retract-body">
          <div className="retract-summary">
            {t('retractConfirm.removeMessages', { count: diff.messageCount })}
            {diff.cascadeCount > 0 && (
              <span className="retract-cascade">
                {t('retractConfirm.cascadeMessages', { count: diff.cascadeCount })}
              </span>
            )}
          </div>

          {(diff.artifactsLost.length > 0 || diff.referencesLost.length > 0 || diff.todosChanged || (diff.fileChangesCount || 0) > 0) && (
            <div className="retract-sections">
              {diff.artifactsLost.length > 0 && (
                <div className="retract-section">
                  <div className="retract-section-head">
                    <IconFile />
                    <span>{t('retractConfirm.deleteArtifacts', { count: diff.artifactsLost.length })}</span>
                  </div>
                  <ul className="retract-list">
                    {diff.artifactsLost.slice(0, 8).map((a) => (
                      <li key={a.id}>
                        <span className="retract-item-name">{a.name}</span>
                        <span className="retract-item-type">{a.type}</span>
                      </li>
                    ))}
                    {diff.artifactsLost.length > 8 && (
                      <li className="retract-more">{t('retractConfirm.moreItems', { count: diff.artifactsLost.length - 8 })}</li>
                    )}
                  </ul>
                </div>
              )}

              {diff.referencesLost.length > 0 && (
                <div className="retract-section">
                  <div className="retract-section-head">
                    <IconBook />
                    <span>{t('retractConfirm.deleteReferences', { count: diff.referencesLost.length })}</span>
                  </div>
                  <ul className="retract-list">
                    {diff.referencesLost.slice(0, 8).map((r) => (
                      <li key={r.id}>
                        <span className="retract-item-name">{r.title}</span>
                        <span className="retract-item-type">{r.source}</span>
                      </li>
                    ))}
                    {diff.referencesLost.length > 8 && (
                      <li className="retract-more">{t('retractConfirm.moreItems', { count: diff.referencesLost.length - 8 })}</li>
                    )}
                  </ul>
                </div>
              )}

              {diff.todosChanged && (
                <div className="retract-section">
                  <div className="retract-section-head">
                    <IconCheckList />
                    <span>
                      {t('retractConfirm.restoreTodos', { now: diff.todosNow, before: diff.todosBefore })}
                    </span>
                  </div>
                </div>
              )}

              {(diff.fileChangesCount || 0) > 0 && (
                <div className="retract-section">
                  <div className="retract-section-head">
                    <IconFile />
                    <span>
                      {t('retractConfirm.fileChangesNotice', { count: diff.fileChangesCount })}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="retract-footer">
          <button className="retract-btn retract-btn-cancel" onClick={onCancel}>
            {t('retractConfirm.cancel')}
          </button>
          <button className="retract-btn retract-btn-confirm" onClick={onConfirm} autoFocus>
            {t('retractConfirm.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RetractConfirmModal;
