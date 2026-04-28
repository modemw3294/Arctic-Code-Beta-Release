import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../hooks/useI18n';
// Reuse the existing settings-modal chrome so we don't ship yet
// another overlay style. Only the inner layout is custom.
import '../SettingsModal/SettingsModal.css';
import './SkillEditorModal.css';

const MAX_SKILL_CHARS = 40_000;

const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/**
 * Unified create / edit / preview modal for a skill.
 *
 * @param mode      'create' (blank), 'edit' (name + content)
 * @param initial   skill object when editing; ignored otherwise
 * @param onSave    ({ name, content }) => void  — caller wires this
 *                  to either onAddSkill (create) or onUpdateSkill (edit)
 * @param onCancel  () => void
 */
function SkillEditorModal({ open, mode = 'create', initial, onSave, onCancel }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const textareaRef = useRef(null);

  // Hydrate when opened. Use a memoized initial-snapshot key so the
  // effect only runs on actual open transitions, not on every parent
  // rerender. `initial?.id` is stable per-skill.
  const openKey = useMemo(
    () => (open ? `${mode}:${initial?.id || 'new'}` : null),
    [open, mode, initial?.id],
  );
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && initial) {
      setName(initial.name || '');
      setContent(initial.content || '');
    } else {
      setName('');
      // Pre-fill with a minimal SKILL.md frontmatter template so first-
      // time authors discover the structured metadata fields without
      // having to read docs. The buildSkillFromMarkdown parser will
      // pick up name/description/when_to_use on save.
      setContent(
        '---\n' +
        'name: \n' +
        'description: 一句话说明这个技能是做什么的\n' +
        'when_to_use: |\n' +
        '  - 用户问起 X 时\n' +
        '  - 调试 Y 相关问题时\n' +
        'tags: []\n' +
        '---\n\n' +
        '# 技能正文\n\n' +
        '在这里写下完整的 Markdown 内容。\n',
      );
    }
    // Focus the name input on open. Defer so the modal has actually
    // mounted in the DOM (otherwise focus() is a no-op).
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [openKey, mode, initial, open]);

  // Esc closes; Cmd/Ctrl-Enter saves.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel?.();
      else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (canSave) handleSave();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!open) return null;

  const trimmedName = name.trim();
  const overCap = content.length > MAX_SKILL_CHARS;
  const canSave = trimmedName.length > 0 && content.length > 0 && !overCap;

  const handleSave = () => {
    if (!canSave) return;
    onSave?.({
      name: trimmedName,
      content,
    });
  };

  return (
    <div className="settings-overlay" onClick={onCancel}>
      <div
        className="settings-modal skill-editor-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-header">
          <h2>
            {mode === 'edit'
              ? t('skillEditor.titleEdit')
              : t('skillEditor.titleCreate')}
          </h2>
          <button className="settings-close" onClick={onCancel} aria-label="Close">
            <IconClose />
          </button>
        </div>

        <div className="skill-editor-body">
          <label className="skill-editor-field">
            <span className="skill-editor-label">{t('skillEditor.name')}</span>
            <input
              ref={mode === 'edit' ? null : textareaRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('skillEditor.namePlaceholder')}
              maxLength={120}
              className="skill-editor-input"
            />
          </label>

          <label className="skill-editor-field skill-editor-field-grow">
            <span className="skill-editor-label">
              {t('skillEditor.content')}
              <span
                className={`skill-editor-counter ${overCap ? 'is-over' : ''}`}
                title={t('skillEditor.contentHint')}
              >
                {content.length.toLocaleString()} / {MAX_SKILL_CHARS.toLocaleString()}
              </span>
            </span>
            <textarea
              ref={mode === 'edit' ? textareaRef : null}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('skillEditor.contentPlaceholder')}
              className="skill-editor-textarea"
              spellCheck={false}
            />
            <span className="skill-editor-hint">
              {t('skillEditor.contentHint')}
            </span>
          </label>
        </div>

        <div className="skill-editor-footer">
          <button className="settings-btn-cancel" onClick={onCancel}>
            {t('skillEditor.cancel')}
          </button>
          <button
            className="settings-btn-save"
            onClick={handleSave}
            disabled={!canSave}
            title={
              !canSave
                ? overCap
                  ? t('skillEditor.tooLong')
                  : t('skillEditor.fillRequired')
                : undefined
            }
          >
            {mode === 'edit' ? t('skillEditor.saveEdit') : t('skillEditor.saveCreate')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SkillEditorModal;
