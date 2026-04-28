// Custom-model editor slotted into each provider card on the Models tab.
//
// Each custom model persists as an entry inside
// `providerConfigs[providerId].customModels`:
//
//   {
//     id: 'custom-<providerId>-<slug>',   // UI id (prefixed for uniqueness)
//     name: 'My Qwen 7B',                 // display label
//     apiId: 'qwen2.5:7b',                // exact string for the `model` body field
//     contextWindow: 32768,               // approximate ctx window (tokens)
//     media: ['image'],                   // capabilities (image/audio)
//     supportsTools: true,                // whether function calling works
//     reasoning: null,                    // or ['reasoning','standard']
//   }
//
// Providers never come with a pre-declared list; user adds everything via
// the + button. The list persists on every edit via onChange — we piggy-
// back on the parent's "unsaved changes" flow so the user still hits one
// Save button for all settings.

import { useState } from 'react';
import { useI18n } from '../../hooks/useI18n';

const DEFAULT_NEW_MODEL = {
  name: '',
  apiId: '',
  contextWindow: 8192,
  media: [],
  supportsTools: true,
  reasoning: null,
};

function makeSlug(name) {
  const s = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || `model-${Date.now().toString(36).slice(-4)}`;
}

function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export default function CustomModelEditor({ providerId, models = [], onChange }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(null); // null | { index, data }

  const startAdd = () => {
    setDraft({ index: -1, data: { ...DEFAULT_NEW_MODEL } });
  };

  const startEdit = (index) => {
    const m = models[index];
    setDraft({
      index,
      data: {
        name: m.name || '',
        apiId: m.apiId || m.id || '',
        contextWindow: m.contextWindow || 8192,
        media: Array.isArray(m.media) ? m.media : [],
        supportsTools: m.supportsTools !== false,
        reasoning: m.reasoning || null,
      },
    });
  };

  const cancel = () => setDraft(null);

  const commit = () => {
    const d = draft?.data;
    if (!d) return;
    const name = d.name.trim();
    const apiId = d.apiId.trim();
    if (!name) { alert(t('settings.models.validation.nameRequired')); return; }
    if (!apiId) { alert(t('settings.models.validation.apiIdRequired')); return; }

    const entry = {
      id: draft.index >= 0
        ? models[draft.index].id
        : `custom-${providerId}-${makeSlug(apiId || name)}`,
      name,
      apiId,
      contextWindow: Math.max(1024, Number(d.contextWindow) || 8192),
      media: Array.isArray(d.media) ? d.media : [],
      supportsTools: !!d.supportsTools,
      reasoning: d.reasoning && d.reasoning.length ? d.reasoning : null,
    };

    // Disallow colliding UI ids (e.g. adding two models with the same slug).
    const dupe = models.some((m, i) => m.id === entry.id && i !== draft.index);
    if (dupe) {
      alert(t('settings.models.validation.duplicateId', { id: entry.id }));
      return;
    }

    const next = [...models];
    if (draft.index >= 0) {
      next[draft.index] = entry;
    } else {
      next.push(entry);
    }
    onChange(next);
    setDraft(null);
  };

  const remove = (index) => {
    const m = models[index];
    if (!window.confirm(t('settings.models.deleteConfirm', { name: m.name || m.id }))) return;
    const next = models.filter((_, i) => i !== index);
    onChange(next);
    if (draft?.index === index) setDraft(null);
  };

  const toggleMedia = (kind) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const has = prev.data.media.includes(kind);
      const media = has
        ? prev.data.media.filter((k) => k !== kind)
        : [...prev.data.media, kind];
      return { ...prev, data: { ...prev.data, media } };
    });
  };

  const updateField = (key, value) => {
    setDraft((prev) => prev ? { ...prev, data: { ...prev.data, [key]: value } } : prev);
  };

  return (
    <div className="custom-models">
      <div className="custom-models-header">
        <div className="custom-models-title">
          {t('settings.models.customModels')}
          <span className="custom-models-count">{models.length}</span>
        </div>
        {!draft && (
          <button
            type="button"
            className="custom-models-add-btn"
            onClick={startAdd}
          >
            <IconPlus /> {t('settings.models.addModel')}
          </button>
        )}
      </div>

      {models.length === 0 && !draft && (
        <div className="custom-models-empty">
          {t('settings.models.noCustomModels')}
        </div>
      )}

      {models.length > 0 && (
        <div className="custom-models-list">
          {models.map((m, i) => (
            <div key={m.id} className="custom-model-row">
              <div className="custom-model-info">
                <div className="custom-model-name">
                  {m.name || m.id}
                  <span className="custom-model-apiid">{m.apiId || m.id}</span>
                </div>
                <div className="custom-model-meta">
                  <span>{t('settings.models.customModel.ctx')} {formatContext(m.contextWindow)}</span>
                  {Array.isArray(m.media) && m.media.length > 0 && (
                    <span>· {m.media.join(' / ')}</span>
                  )}
                  {m.supportsTools !== false && <span>· {t('settings.models.customModel.tools')}</span>}
                  {Array.isArray(m.reasoning) && m.reasoning.length > 0 && (
                    <span>· {t('settings.models.customModel.reasoning')}</span>
                  )}
                </div>
              </div>
              <div className="custom-model-actions">
                <button
                  type="button"
                  className="custom-model-action-btn"
                  onClick={() => startEdit(i)}
                  title={t('settings.models.editModel')}
                >
                  <IconPencil />
                </button>
                <button
                  type="button"
                  className="custom-model-action-btn custom-model-action-danger"
                  onClick={() => remove(i)}
                  title={t('settings.models.deleteModel')}
                >
                  <IconTrash />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div className="custom-model-form">
          <div className="custom-model-form-title">
            {draft.index >= 0 ? t('settings.models.editModel') : t('settings.models.customModel.add')}
          </div>
          <div className="custom-model-form-grid">
            <div className="custom-model-form-field">
              <label>{t('settings.models.customModel.displayName')}</label>
              <input
                type="text"
                value={draft.data.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="例如：Qwen2.5 Coder 7B"
                autoComplete="off"
              />
            </div>
            <div className="custom-model-form-field">
              <label>{t('settings.models.customModel.modelId')}</label>
              <input
                type="text"
                value={draft.data.apiId}
                onChange={(e) => updateField('apiId', e.target.value)}
                placeholder="例如：qwen2.5-coder:7b-instruct"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="custom-model-form-field">
              <label>{t('settings.models.customModel.contextWindow')}</label>
              <input
                type="number"
                value={draft.data.contextWindow}
                onChange={(e) => updateField('contextWindow', Number(e.target.value) || 0)}
                min="1024"
                step="1024"
              />
            </div>
            <div className="custom-model-form-field custom-model-form-field-full">
              <label>{t('settings.models.customModel.capabilities')}</label>
              <div className="custom-model-caps">
                <label className="custom-model-cap">
                  <input
                    type="checkbox"
                    checked={draft.data.media.includes('image')}
                    onChange={() => toggleMedia('image')}
                  />
                  <span>{t('settings.models.customModel.imageInput')}</span>
                </label>
                <label className="custom-model-cap">
                  <input
                    type="checkbox"
                    checked={draft.data.media.includes('audio')}
                    onChange={() => toggleMedia('audio')}
                  />
                  <span>{t('settings.models.customModel.audioInput')}</span>
                </label>
                <label className="custom-model-cap">
                  <input
                    type="checkbox"
                    checked={draft.data.supportsTools}
                    onChange={(e) => updateField('supportsTools', e.target.checked)}
                  />
                  <span>{t('settings.models.customModel.toolCalling')}</span>
                </label>
                <label className="custom-model-cap">
                  <input
                    type="checkbox"
                    checked={!!draft.data.reasoning}
                    onChange={(e) =>
                      updateField('reasoning', e.target.checked ? ['reasoning', 'standard'] : null)
                    }
                  />
                  <span>{t('settings.models.customModel.reasoningMode')}</span>
                </label>
              </div>
            </div>
          </div>
          <div className="custom-model-form-actions">
            <button type="button" className="settings-btn secondary" onClick={cancel}>{t('settings.models.customModel.cancel')}</button>
            <button type="button" className="settings-btn primary" onClick={commit}>
              {draft.index >= 0 ? t('settings.models.customModel.save') : t('settings.models.customModel.add')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatContext(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}
