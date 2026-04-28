import { useState, useEffect } from 'react';
import { TOOL_METADATA } from '../../lib/toolPermissions';
import { useI18n } from '../../hooks/useI18n';
import './ToolConfirmModal.css';

// Fallback metadata if a tool is not yet in TOOL_METADATA — keeps the modal
// functional while the catalog grows.
function getFallbackMeta(t) {
  return {
    title: t('toolConfirm.fallbackTitle'),
    risk: 'medium',
    description: t('toolConfirm.fallbackDescription'),
  };
}

const IconShield = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const IconWarning = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

// Props:
//   request  { toolName, argsSummary, args } | null
//   onDecide (decision: 'once' | 'session' | 'always' | 'deny') => void
function ToolConfirmModal({ request, onDecide }) {
  if (!request) return null;
  return (
    <ToolConfirmBody
      key={`${request.toolName}::${request.argsSummary || ''}`}
      request={request}
      onDecide={onDecide}
    />
  );
}

function ToolConfirmBody({ request, onDecide }) {
  const { t } = useI18n();
  const [showDetails, setShowDetails] = useState(false);
  const meta = TOOL_METADATA[request.toolName];
  const displayMeta = meta
    ? {
        title: t(meta.titleKey),
        risk: meta.risk,
        description: t(meta.descriptionKey),
      }
    : getFallbackMeta(t);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDecide?.('deny');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onDecide]);

  return (
    <div className="toolconfirm-overlay" onClick={() => onDecide?.('deny')}>
      <div className="toolconfirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="toolconfirm-header">
            <span className={`toolconfirm-header-icon risk-${displayMeta.risk}`}>
            <IconShield />
          </span>
          <div className="toolconfirm-header-text">
              <div className="toolconfirm-title">{t('toolConfirm.agentRequest')}: {displayMeta.title}</div>
            <div className="toolconfirm-subtitle">
              {t('toolConfirm.protectedOperation')}
            </div>
          </div>
        </div>

        {displayMeta.risk === 'high' && (
          <div className="toolconfirm-warning">
            <IconWarning />
            <span>
              <strong>⚠ {t('toolConfirm.irreversible')}</strong>
              {displayMeta.description ? ` — ${displayMeta.description}` : ''}
            </span>
          </div>
        )}

        {displayMeta.risk !== 'high' && displayMeta.description && (
          <div className="toolconfirm-description">{displayMeta.description}</div>
        )}

        {request.argsSummary && (
          <div className="toolconfirm-section">
            <div className="toolconfirm-section-label">{t('toolConfirm.target')}</div>
            <div className="toolconfirm-args-summary">
              <code>{request.argsSummary}</code>
            </div>
          </div>
        )}

        {request.args && (
          <div className="toolconfirm-section">
            <button
              type="button"
              className="toolconfirm-details-toggle"
              onClick={() => setShowDetails((v) => !v)}
            >
              {showDetails ? t('toolConfirm.hideFullArgs') : t('toolConfirm.showFullArgs')}
            </button>
            {showDetails && (
              <pre className="toolconfirm-args-pre">
                {JSON.stringify(request.args, null, 2)}
              </pre>
            )}
          </div>
        )}

        <div className="toolconfirm-actions">
          <button
            className="toolconfirm-btn toolconfirm-btn-deny"
            onClick={() => onDecide?.('deny')}
          >
            {t('toolConfirm.deny')}
          </button>
          <div className="toolconfirm-allow-group">
            <button
              className="toolconfirm-btn toolconfirm-btn-once"
              onClick={() => onDecide?.('once')}
            >
              {t('toolConfirm.allowOnce')}
            </button>
            <button
              className="toolconfirm-btn toolconfirm-btn-session"
              onClick={() => onDecide?.('session')}
              title={t('toolConfirm.sessionAllowTitle')}
            >
              {t('toolConfirm.sessionAllow')}
            </button>
            {displayMeta.risk !== 'high' && (
              <button
                className="toolconfirm-btn toolconfirm-btn-always"
                onClick={() => onDecide?.('always')}
                title={t('toolConfirm.alwaysAllowTitle')}
              >
                {t('toolConfirm.alwaysAllow')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ToolConfirmModal;
