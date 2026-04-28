import { useState, useEffect, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import { REMARK_PLUGINS, REHYPE_PLUGINS } from '../../lib/markdownPlugins';
import { MARKDOWN_COMPONENTS } from '../../lib/markdownComponents';
import { useI18n } from '../../hooks/useI18n';
import './ArtifactPreviewModal.css';

// Derive a sensible Monaco language from the artifact's declared language/type
// and (as last resort) from the file extension.
function resolveLanguage(artifact) {
  if (!artifact) return 'plaintext';
  const lang = (artifact.language || '').toLowerCase().trim();
  const type = (artifact.type || '').toLowerCase().trim();
  const name = (artifact.name || '').toLowerCase();

  const aliasMap = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    py: 'python', rb: 'ruby', sh: 'shell', bash: 'shell', zsh: 'shell',
    yml: 'yaml', md: 'markdown', htm: 'html',
    'c++': 'cpp', 'c#': 'csharp',
  };
  if (lang) return aliasMap[lang] || lang;
  if (type === 'json') return 'json';
  if (type === 'markdown') return 'markdown';
  if (type === 'html') return 'html';
  const ext = /\.([^.]+)$/.exec(name)?.[1];
  if (ext) return aliasMap[ext] || ext;
  return 'plaintext';
}

// Strict sandbox for HTML previews: no scripts, no forms, no top-nav.
// scripts are allowed for html artifacts because authors expect them to run.
const HTML_SANDBOX = 'allow-scripts';

const IconClose = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconDownload = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconTrash = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

const IconCopy = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

const IconSave = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

function ArtifactPreviewModal({ artifact, onClose, onUpdate, onDelete, theme = 'light' }) {
  const { t } = useI18n();
  // Local editor buffer (so edits don't bleed into state until "Save")
  const [draft, setDraft] = useState(artifact?.content ?? '');
  const [viewMode, setViewMode] = useState('preview'); // 'preview' | 'source'
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  // Note: we rely on the parent rendering this modal with `key={artifact.id}`
  // so switching to a different artifact remounts and fully resets state.
  const language = useMemo(() => resolveLanguage(artifact), [artifact]);
  const isCode = ['code', 'json', 'text'].includes((artifact?.type || '').toLowerCase()) || language !== 'plaintext';
  const isMarkdown = (artifact?.type || '').toLowerCase() === 'markdown' || language === 'markdown';
  const isHtml = (artifact?.type || '').toLowerCase() === 'html' || language === 'html';

  const dirty = draft !== (artifact?.content ?? '');

  // Esc to close. Ctrl/Cmd+S to save.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty) onUpdate?.({ ...artifact, content: draft });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [artifact, draft, dirty, onUpdate, onClose]);

  if (!artifact) return null;

  const handleDownload = () => {
    const blob = new Blob([draft], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifact.name || 'artifact.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const handleSave = () => {
    if (!dirty) return;
    onUpdate?.({ ...artifact, content: draft });
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    onDelete?.(artifact.id);
    onClose?.();
  };

  const renderPreview = () => {
    if (isHtml) {
      return (
        <iframe
          title={artifact.name}
          className="artifact-html-iframe"
          sandbox={HTML_SANDBOX}
          srcDoc={draft}
        />
      );
    }
    if (isMarkdown) {
      return (
        <div className="artifact-markdown">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MARKDOWN_COMPONENTS}>{draft}</ReactMarkdown>
        </div>
      );
    }
    // For code/text there's nothing meaningful to "preview" vs "source" —
    // fall through to the editor below.
    return null;
  };

  const canTogglePreview = isHtml || isMarkdown;

  return (
    <div className="artifact-overlay" onClick={onClose}>
      <div className="artifact-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="artifact-header">
          <div className="artifact-title-group">
            <span className="artifact-title" title={artifact.name}>{artifact.name}</span>
            <span className="artifact-type-badge">{artifact.type}{artifact.language ? ` · ${artifact.language}` : ''}</span>
            {dirty && <span className="artifact-dirty-dot" title={t('artifactPreview.unsaved')} />}
          </div>
          <div className="artifact-actions">
            {canTogglePreview && (
              <div className="artifact-view-toggle" role="tablist">
                <button
                  type="button"
                  className={viewMode === 'preview' ? 'active' : ''}
                  onClick={() => setViewMode('preview')}
                >{t('artifactPreview.preview')}</button>
                <button
                  type="button"
                  className={viewMode === 'source' ? 'active' : ''}
                  onClick={() => setViewMode('source')}
                >{t('artifactPreview.source')}</button>
              </div>
            )}
            <button type="button" className="artifact-btn" onClick={handleCopy} title={t('artifactPreview.copyContent')}>
              <IconCopy />{copied ? t('artifactPreview.copied') : t('artifactPreview.copy')}
            </button>
            <button type="button" className="artifact-btn" onClick={handleDownload} title={t('artifactPreview.downloadLocal')}>
              <IconDownload />{t('artifactPreview.download')}
            </button>
            <button
              type="button"
              className={`artifact-btn ${dirty ? 'primary' : ''}`}
              onClick={handleSave}
              disabled={!dirty}
              title={t('artifactPreview.saveTitle')}
            >
              <IconSave />{t('artifactPreview.save')}
            </button>
            <button
              type="button"
              className={`artifact-btn danger ${confirmDelete ? 'armed' : ''}`}
              onClick={handleDelete}
              title={confirmDelete ? t('artifactPreview.confirmDeleteTitle') : t('artifactPreview.deleteTitle')}
            >
              <IconTrash />{confirmDelete ? t('artifactPreview.confirmDelete') : t('artifactPreview.delete')}
            </button>
            <button type="button" className="artifact-close-btn" onClick={onClose} title={t('artifactPreview.closeTitle')}>
              <IconClose />
            </button>
          </div>
        </header>

        <div className="artifact-body">
          {canTogglePreview && viewMode === 'preview' ? (
            renderPreview()
          ) : (
            <Editor
              height="100%"
              language={language}
              value={draft}
              onChange={(v) => setDraft(v ?? '')}
              theme={theme === 'dark' ? 'vs-dark' : 'vs'}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: isMarkdown ? 'on' : 'off',
                lineNumbers: isCode ? 'on' : 'off',
                renderWhitespace: 'selection',
                smoothScrolling: true,
                padding: { top: 12, bottom: 12 },
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default ArtifactPreviewModal;
