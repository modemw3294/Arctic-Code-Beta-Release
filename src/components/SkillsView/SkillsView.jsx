import { useState, useRef } from 'react';
import { useI18n } from '../../hooks/useI18n';
import SkillEditorModal from '../SkillEditorModal/SkillEditorModal';
import { buildSkillFromMarkdown } from '../../lib/skills/parser';
import './SkillsView.css';

const MAX_SKILL_CHARS = 40_000; // per-skill cap to keep prompt budget sane

// HTTP fetch helper that prefers the Electron main-process bridge so
// imports from arbitrary URLs aren't blocked by browser CORS. Falls
// back to window.fetch in pure-browser environments.
async function fetchTextSmart(url) {
  if (window.arcticAPI?.fetchUrl) {
    const res = await window.arcticAPI.fetchUrl({ url });
    if (!res?.ok) {
      throw new Error(res?.error || `HTTP ${res?.status || '?'}`);
    }
    return String(res.body || '');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function formatBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

const IconImport = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconLink = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </svg>
);

const IconTrash = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

const IconPlus = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
  </svg>
);

function SkillsView({
  skills = [],
  onAddSkill,
  onRemoveSkill,
  onToggleSkill,
  onUpdateSkill,
}) {
  const { t } = useI18n();
  const fileInputRef = useRef(null);
  const [showLinkPrompt, setShowLinkPrompt] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [importError, setImportError] = useState(null);
  // Editor modal state — shared between create-from-scratch and the
  // edit-existing-skill flow. `editorMode` toggles which copy strings
  // and which save callback are used.
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState('create');
  const [editingSkillId, setEditingSkillId] = useState(null);
  // Per-skill in-flight refresh state — holds the id while a URL
  // re-fetch is in progress so the spinner / disabled state knows
  // exactly which card to render busy.
  const [refreshingId, setRefreshingId] = useState(null);

  const makeSkillId = () => `skill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files);
    setImportError(null);
    for (const file of files) {
      if (!file.name.endsWith('.md')) continue;
      try {
        const raw = await readTextFile(file);
        const content = raw.slice(0, MAX_SKILL_CHARS);
        // Use the filename (sans extension) as a fallback name when
        // there's no `name:` frontmatter key. This matches the
        // Anthropic-style SKILL.md convention while staying friendly
        // to plain-markdown notes that pre-date frontmatter.
        const fallback = file.name.replace(/\.md$/i, '');
        const meta = buildSkillFromMarkdown(content, fallback);
        onAddSkill({
          id: makeSkillId(),
          name: meta.name,
          description: meta.description,
          whenToUse: meta.whenToUse,
          tags: meta.tags,
          version: meta.version,
          type: 'file',
          content,
          size: content.length,
          truncated: raw.length > MAX_SKILL_CHARS,
          enabled: true,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        setImportError(t('skillsView.cannotReadFile', { name: file.name, error: err.message || err }));
      }
    }
    e.target.value = null;
  };

  const handleLinkImport = async () => {
    const url = linkInput.trim();
    if (!url) return;
    setShowLinkPrompt(false);
    setLinkInput('');
    setImportError(null);

    try {
      // Use the Electron-aware fetcher so users can import from origins
      // that wouldn't allow a CORS-friendly browser fetch (the vast
      // majority of public websites). Falls back to window.fetch.
      const raw = await fetchTextSmart(url);
      const content = raw.slice(0, MAX_SKILL_CHARS);
      const meta = buildSkillFromMarkdown(content, url);
      onAddSkill({
        id: makeSkillId(),
        name: meta.name,
        description: meta.description,
        whenToUse: meta.whenToUse,
        tags: meta.tags,
        version: meta.version,
        type: 'link',
        url,
        content,
        size: content.length,
        truncated: raw.length > MAX_SKILL_CHARS,
        enabled: true,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      setImportError(t('skillsView.cannotFetchUrl', { url, error: err.message || err }));
    }
  };

  // Re-fetch a link skill's content. Preserves id/name/enabled/timestamp
  // so toggle state and ordering don't reset. The model picks up the
  // refreshed text on the next request automatically because skill
  // content is read from localStorage on every send.
  const handleRefreshSkill = async (skill) => {
    const url = skill?.url || (skill?.type === 'link' ? skill.name : null);
    if (!url) return;
    setRefreshingId(skill.id);
    setImportError(null);
    try {
      const raw = await fetchTextSmart(url);
      const content = raw.slice(0, MAX_SKILL_CHARS);
      // Re-parse frontmatter on every refresh so renamed / re-described
      // upstream skills get their metadata refreshed too. Keep the
      // existing name if the new content has no `name:` field.
      const meta = buildSkillFromMarkdown(content, skill.name);
      onUpdateSkill?.(skill.id, {
        name: meta.name || skill.name,
        description: meta.description,
        whenToUse: meta.whenToUse,
        tags: meta.tags,
        version: meta.version,
        content,
        size: content.length,
        truncated: raw.length > MAX_SKILL_CHARS,
        // Bump timestamp so the meta line shows the most recent fetch.
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      setImportError(t('skillsView.cannotFetchUrl', { url, error: err.message || err }));
    } finally {
      setRefreshingId(null);
    }
  };

  // Open the editor for a brand-new manually-authored skill.
  const openCreateEditor = () => {
    setEditorMode('create');
    setEditingSkillId(null);
    setEditorOpen(true);
  };

  // Open the editor for an existing skill — works for any source type
  // (file / link / manual). Lets the user tweak the name and content
  // freely; on save we mark it as 'manual' since it no longer matches
  // the original source verbatim.
  const openEditor = (skill) => {
    setEditorMode('edit');
    setEditingSkillId(skill.id);
    setEditorOpen(true);
  };

  const handleEditorSave = ({ name, content }) => {
    // Re-parse the edited content so any frontmatter the user typed
    // by hand (description, when_to_use, tags) flows back into the
    // structured fields. The editor still treats the content area as
    // a single markdown blob — this just keeps the metadata fresh.
    const meta = buildSkillFromMarkdown(content, name);
    if (editorMode === 'edit' && editingSkillId) {
      onUpdateSkill?.(editingSkillId, {
        name,
        description: meta.description,
        whenToUse: meta.whenToUse,
        tags: meta.tags,
        version: meta.version,
        content,
        size: content.length,
        truncated: false, // user-controlled length
        timestamp: new Date().toISOString(),
      });
    } else {
      onAddSkill({
        id: makeSkillId(),
        name,
        description: meta.description,
        whenToUse: meta.whenToUse,
        tags: meta.tags,
        version: meta.version,
        type: 'manual',
        content,
        size: content.length,
        truncated: false,
        enabled: true,
        timestamp: new Date().toISOString(),
      });
    }
    setEditorOpen(false);
    setEditingSkillId(null);
  };

  const editingSkill =
    editorMode === 'edit' && editingSkillId
      ? skills.find((s) => s.id === editingSkillId)
      : null;

  return (
    <div className="skills-view">
      <div className="skills-header">
        <div className="skills-title-group">
          <h2>{t('skillsView.title')}</h2>
          <p>{t('skillsView.subtitle')}</p>
        </div>
        <div className="skills-actions">
          <button className="skills-btn secondary" onClick={openCreateEditor}>
            <IconPlus /> {t('skillsView.newSkill')}
          </button>
          <button className="skills-btn secondary" onClick={() => setShowLinkPrompt(true)}>
            <IconLink /> {t('skillsView.importFromLink')}
          </button>
          <button className="skills-btn primary" onClick={() => fileInputRef.current?.click()}>
            <IconImport /> {t('skillsView.batchImport')}
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            multiple 
            accept=".md" 
            onChange={handleFiles} 
          />
        </div>
      </div>

      {showLinkPrompt && (
        <div className="settings-overlay" onClick={() => setShowLinkPrompt(false)}>
          <div className="settings-modal" style={{ width: '400px', height: 'auto', maxHeight: 'calc(100vh - 80px)', flexDirection: 'column', overflow: 'visible', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '500' }}>{t('skillsView.importWebKnowledge')}</h3>
            <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary)' }}>{t('skillsView.enterUrlPrompt')}</p>
            <input 
              type="text" 
              value={linkInput}
              onChange={e => setLinkInput(e.target.value)}
              placeholder="https://..."
              style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: '6px', color: 'var(--text-primary)', marginBottom: '24px' }}
              autoFocus
              onKeyDown={e => { if(e.key === 'Enter') handleLinkImport() }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="skills-btn secondary" onClick={() => setShowLinkPrompt(false)}>{t('skillsView.cancel')}</button>
              <button className="skills-btn primary" onClick={handleLinkImport}>{t('skillsView.confirmImport')}</button>
            </div>
          </div>
        </div>
      )}

      {importError && (
        <div className="skills-error-banner">{importError}</div>
      )}

      <div className="skills-content">
        {skills.length === 0 ? (
          <div className="skills-empty">
            <div className="skills-empty-icon">
               <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
            </div>
            <h3>{t('skillsView.noSkills')}</h3>
            <p>{t('skillsView.noSkillsHint')}</p>
          </div>
        ) : (
          <div className="skills-grid">
            {skills.map(skill => {
              const enabled = skill.enabled !== false; // default on, for legacy data
              const hasContent = typeof skill.content === 'string' && skill.content.length > 0;
              const icon =
                skill.type === 'file' ? '📄'
                : skill.type === 'link' ? '🔗'
                : '✏️';
              const isRefreshing = refreshingId === skill.id;
              const canRefresh =
                (skill.type === 'link' && (skill.url || skill.name)) &&
                typeof onUpdateSkill === 'function';
              return (
                <div
                  key={skill.id}
                  className={`skill-card animate-fade-in ${enabled ? 'is-enabled' : 'is-disabled'}`}
                >
                  <label
                    className="skill-card-toggle"
                    title={enabled ? t('skillsView.disableSkill') : t('skillsView.enableSkill')}
                    // Stop the click from bubbling up to the card-level
                    // open-editor handler below.
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => onToggleSkill?.(skill.id)}
                    />
                    <span className="skill-card-toggle-track"><span className="skill-card-toggle-thumb" /></span>
                  </label>
                  {/* The body of the card is the click target for the
                      preview/edit modal. We don't want clicks on the
                      toggle / refresh / delete buttons to also open the
                      editor, so each of those calls stopPropagation. */}
                  <button
                    type="button"
                    className="skill-card-body"
                    onClick={() => openEditor(skill)}
                    title={t('skillsView.viewOrEdit')}
                  >
                    <div className="skill-card-icon">{icon}</div>
                    <div className="skill-card-info">
                      <h4 className="truncate" title={skill.name}>{skill.name}</h4>
                      {skill.description && (
                        <p
                          className="skill-card-desc"
                          title={skill.description}
                        >
                          {skill.description}
                        </p>
                      )}
                      <div className="skill-card-meta">
                        {hasContent ? (
                          <>
                            <span className="skill-card-size">{formatBytes(skill.size || skill.content.length)}</span>
                            {skill.truncated && <span className="skill-card-flag">{t('skillsView.truncated')}</span>}
                          </>
                        ) : (
                          <span className="skill-card-flag skill-card-flag-warn">{t('skillsView.legacyDataNoContent')}</span>
                        )}
                        <span className="skill-card-date">· {new Date(skill.timestamp).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </button>
                  {canRefresh && (
                    <button
                      className={`skill-refresh-btn ${isRefreshing ? 'is-busy' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRefreshSkill(skill);
                      }}
                      disabled={isRefreshing}
                      title={t('skillsView.refresh')}
                    >
                      <IconRefresh />
                    </button>
                  )}
                  <button
                    className="skill-remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveSkill(skill.id);
                    }}
                    title={t('skillsView.remove')}
                  >
                    <IconTrash />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <SkillEditorModal
        open={editorOpen}
        mode={editorMode}
        initial={editingSkill}
        onSave={handleEditorSave}
        onCancel={() => {
          setEditorOpen(false);
          setEditingSkillId(null);
        }}
      />
    </div>
  );
}

export default SkillsView;
