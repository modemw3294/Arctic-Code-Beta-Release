import { useEffect, useState } from 'react';
import { useI18n } from '../../hooks/useI18n';
// Reuses the visual style of RetractConfirmModal so destructive
// modals all feel like one cohesive UI surface — no separate CSS file
// to maintain. Only the few extras (checkbox row) live here.
import '../RetractConfirmModal/RetractConfirmModal.css';
import './DeleteProjectModal.css';

const IconWarning = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

// Small checkbox SVG so we can style the unchecked vs checked states
// purely in CSS without depending on the OS's native checkbox look,
// which varies wildly between platforms.
const IconCheckMark = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

function DeleteProjectModal({ pending, onConfirm, onCancel }) {
  const { t } = useI18n();
  // Default unchecked: the safer choice is to keep conversations and
  // re-parent them to Playground. The user has to opt in to the
  // destructive cascade explicitly.
  const [purgeTasks, setPurgeTasks] = useState(false);

  // Reset the checkbox every time a new project is up for deletion.
  // Without this, a previous "purge" choice would persist across
  // openings of the modal, which is a foot-gun for destructive ops.
  useEffect(() => {
    if (pending) setPurgeTasks(false);
  }, [pending]);

  useEffect(() => {
    if (!pending) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
      else if (e.key === 'Enter') onConfirm({ purgeTasks });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, onCancel, onConfirm, purgeTasks]);

  if (!pending) return null;
  const { project, taskCount } = pending;

  return (
    <div className="retract-overlay" onClick={onCancel}>
      <div className="retract-modal" onClick={(e) => e.stopPropagation()}>
        <div className="retract-header">
          <div className="retract-icon"><IconWarning /></div>
          <div className="retract-title-block">
            <h3 className="retract-title">{t('deleteProject.title')}</h3>
            <p className="retract-subtitle">
              {t('deleteProject.subtitle', { name: project?.name || '' })}
            </p>
          </div>
        </div>

        <div className="retract-body">
          <div className="retract-summary">
            {taskCount > 0
              ? t('deleteProject.taskCount', { count: taskCount })
              : t('deleteProject.noTasks')}
          </div>

          {/* Only show the cascade option when there are actually tasks
              to cascade — otherwise the checkbox is meaningless noise. */}
          {taskCount > 0 && (
            <label
              className={`delete-project-option ${purgeTasks ? 'is-checked' : ''}`}
              onClick={(e) => e.preventDefault()}
            >
              <button
                type="button"
                className={`delete-project-checkbox ${purgeTasks ? 'is-checked' : ''}`}
                onClick={() => setPurgeTasks((v) => !v)}
                aria-pressed={purgeTasks}
              >
                {purgeTasks && <IconCheckMark />}
              </button>
              <div className="delete-project-option-text">
                <div className="delete-project-option-label">
                  {t('deleteProject.purgeLabel')}
                </div>
                <div className="delete-project-option-hint">
                  {purgeTasks
                    ? t('deleteProject.purgeHintOn', { count: taskCount })
                    : t('deleteProject.purgeHintOff')}
                </div>
              </div>
            </label>
          )}
        </div>

        <div className="retract-footer">
          <button className="retract-btn retract-btn-cancel" onClick={onCancel}>
            {t('deleteProject.cancel')}
          </button>
          <button
            className="retract-btn retract-btn-confirm"
            onClick={() => onConfirm({ purgeTasks })}
            autoFocus
          >
            {purgeTasks
              ? t('deleteProject.confirmPurge')
              : t('deleteProject.confirmKeep')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteProjectModal;
