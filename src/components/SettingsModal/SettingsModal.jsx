import { useState, useEffect } from 'react';
import { useI18n } from '../../hooks/useI18n';
import { AVAILABLE_LOCALES } from '../../lib/i18n';
import { readToolsConfig, writeToolsConfig, DEFAULT_TOOLS_CONFIG } from '../../lib/toolsConfig';
import McpTab from './McpTab';
import { getAllModels, reasoningLabels } from '../../lib/models';
import CustomModelEditor from './CustomModelEditor';
import './SettingsModal.css';
import arcticCodeLogo from '../../assets/arctic-code-logo.svg';

// Provider catalogue rendered by the Models tab.
//   isLocal       — Wisector is a hardware-bound local engine, rendered
//                   in a wholly different "setup" layout.
//   isLocalEngine — Ollama / LM Studio: localhost daemons, no API key
//                   required; user adds their own models at runtime.
const PROVIDERS = [
  { id: 'wisector', nameKey: 'settings.models.providers.wisector', isLocal: true, color: '#FF6B2B', disabled: true },
  { id: 'openai', nameKey: 'settings.models.providers.openai', color: '#10A37F' },
  { id: 'anthropic', nameKey: 'settings.models.providers.anthropic', color: '#D4A574' },
  { id: 'google', nameKey: 'settings.models.providers.google', color: '#4285F4' },
  { id: 'zai', nameKey: 'settings.models.providers.zai', color: '#6366F1' },
  { id: 'ollama', nameKey: 'settings.models.providers.ollama', color: '#3B82F6', isLocalEngine: true },
  { id: 'lmstudio', nameKey: 'settings.models.providers.lmstudio', color: '#8B5CF6', isLocalEngine: true },
];

const Icons = {
  general: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33h.09A1.65 1.65 0 009 3.09V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51h.09a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.09a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
  ),
  models: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>
  ),
  chat: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
  ),
  mcp: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
  ),
  skill: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>
  ),
  about: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
  ),
  eye: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  ),
  eyeOff: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
  ),
  chevron: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
  ),
  sparkle: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>
  ),
  tools: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
  ),
  // Stacked-layers icon for the Context Compression tab — visually
  // suggests "many turns being squeezed into fewer tokens".
  context: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
  ),
  python: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8 2 8 4 8 4v2h8V4s0-2-4-2z"/><rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 18v2s0 2 4 2 4-2 4-2v-2"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/></svg>
  ),
};

// TABS will be dynamically generated with translations in the component
const TABS_BASE = [
  { id: 'general', icon: Icons.general },
  { id: 'models', icon: Icons.models },
  { id: 'tools', icon: Icons.tools },
  { id: 'context', icon: Icons.context },
  { id: 'chat', icon: Icons.chat },
  { id: 'mcp', icon: Icons.mcp },
  { id: 'python', icon: Icons.python },
  { id: 'skill', icon: Icons.skill },
  { id: 'about', icon: Icons.about }
];

const IconClose = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconSnowflake = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--arctic-blue)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M17 7l-5-5-5 5" />
    <path d="M17 17l-5 5-5-5" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M7 7l-5 5 5 5" />
    <path d="M17 7l5 5-5 5" />
  </svg>
);

const IconClipboard = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: '-2px' }}>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
  </svg>
);

const IconCheckSmall = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: '-2px' }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconXSmall = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: '-2px' }}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const PROVIDER_MODELS = {
  wisector: [
    { id: 'wisector-code-pro-1', name: 'Wisector Code Pro 1 Preview', defaultApiId: 'wisector-code-pro-1' },
    { id: 'wisector-1', name: 'Wisector 1 Preview', defaultApiId: 'wisector-1' },
  ],
  openai: [
    { id: 'chatgpt-5.5', name: 'ChatGPT 5.5', defaultApiId: 'gpt-5.5', note: '推理强度通过参数控制，无需分模型 ID' },
    { id: 'chatgpt-5.4', name: 'ChatGPT 5.4', defaultApiId: 'gpt-5.4', note: '推理强度通过参数控制' },
    { id: 'chatgpt-5.3-codex', name: 'ChatGPT 5.3 Codex', defaultApiId: 'gpt-5.3-codex', note: '推理强度通过参数控制' },
    { id: 'chatgpt-5.2', name: 'ChatGPT 5.2', defaultApiId: 'gpt-5.2', note: '推理强度通过参数控制' },
  ],
  anthropic: [
    { id: 'claude-opus-4.6-reasoning', name: 'Claude Opus 4.6 (推理)', defaultApiId: 'claude-opus-4-6-20260401', group: 'Claude Opus 4.6' },
    { id: 'claude-opus-4.6-standard', name: 'Claude Opus 4.6 (标准)', defaultApiId: 'claude-opus-4-6-20260401', group: 'Claude Opus 4.6' },
    { id: 'claude-opus-4.5-reasoning', name: 'Claude Opus 4.5 (推理)', defaultApiId: 'claude-opus-4-5-20250220', group: 'Claude Opus 4.5' },
    { id: 'claude-opus-4.5-standard', name: 'Claude Opus 4.5 (标准)', defaultApiId: 'claude-opus-4-5-20250220', group: 'Claude Opus 4.5' },
    { id: 'claude-sonnet-4.6-reasoning', name: 'Claude Sonnet 4.6 (推理)', defaultApiId: 'claude-sonnet-4-6-20260401', group: 'Claude Sonnet 4.6' },
    { id: 'claude-sonnet-4.6-standard', name: 'Claude Sonnet 4.6 (标准)', defaultApiId: 'claude-sonnet-4-6-20260401', group: 'Claude Sonnet 4.6' },
    { id: 'claude-sonnet-4.5-reasoning', name: 'Claude Sonnet 4.5 (推理)', defaultApiId: 'claude-sonnet-4-5-20250514', group: 'Claude Sonnet 4.5' },
    { id: 'claude-sonnet-4.5-standard', name: 'Claude Sonnet 4.5 (标准)', defaultApiId: 'claude-sonnet-4-5-20250514', group: 'Claude Sonnet 4.5' },
  ],
  google: [
    { id: 'gemini-3.1-pro-thinking-high', name: 'Gemini 3.1 Pro (高推理)', defaultApiId: 'gemini-3.1-pro-preview', group: 'Gemini 3.1 Pro' },
    { id: 'gemini-3.1-pro-thinking-low', name: 'Gemini 3.1 Pro (低推理)', defaultApiId: 'gemini-3.1-pro-preview', group: 'Gemini 3.1 Pro' },
    { id: 'gemini-3-flash-thinking-high', name: 'Gemini 3 Flash (高推理)', defaultApiId: 'gemini-3-flash-preview', group: 'Gemini 3 Flash' },
    { id: 'gemini-3-flash-thinking-low', name: 'Gemini 3 Flash (低推理)', defaultApiId: 'gemini-3-flash-preview', group: 'Gemini 3 Flash' },
    { id: 'gemini-3.1-flash-lite-thinking-high', name: 'Gemini 3.1 Flash Lite (高推理)', defaultApiId: 'gemini-3.1-flash-lite-preview', group: 'Gemini 3.1 Flash Lite' },
    { id: 'gemini-3.1-flash-lite-thinking-low', name: 'Gemini 3.1 Flash Lite (低推理)', defaultApiId: 'gemini-3.1-flash-lite-preview', group: 'Gemini 3.1 Flash Lite' },
    { id: 'gemini-2.5-pro-thinking-high', name: 'Gemini 2.5 Pro (高推理)', defaultApiId: 'gemini-2.5-pro', group: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-pro-thinking-low', name: 'Gemini 2.5 Pro (低推理)', defaultApiId: 'gemini-2.5-pro', group: 'Gemini 2.5 Pro' },
    { id: 'gemma-4-31b-it-thinking-high', name: 'Gemma 4 31B IT (高推理)', defaultApiId: 'gemma-4-31b-it', group: 'Gemma 4 31B IT' },
    { id: 'gemma-4-31b-it-thinking-minimal', name: 'Gemma 4 31B IT (最低推理)', defaultApiId: 'gemma-4-31b-it', group: 'Gemma 4 31B IT' },
    { id: 'gemma-4-26b-a4b-it-thinking-high', name: 'Gemma 4 26B A4B IT (高推理)', defaultApiId: 'gemma-4-26b-a4b-it', group: 'Gemma 4 26B A4B IT' },
    { id: 'gemma-4-26b-a4b-it-thinking-minimal', name: 'Gemma 4 26B A4B IT (最低推理)', defaultApiId: 'gemma-4-26b-a4b-it', group: 'Gemma 4 26B A4B IT' },
  ],
  zai: [
    { id: 'chatglm-5.1-reasoning', name: 'ChatGLM 5.1 (推理)', defaultApiId: 'glm-5.1', group: 'ChatGLM 5.1' },
    { id: 'chatglm-5.1-standard', name: 'ChatGLM 5.1 (标准)', defaultApiId: 'glm-5.1', group: 'ChatGLM 5.1' },
    { id: 'chatglm-5-reasoning', name: 'ChatGLM 5 (推理)', defaultApiId: 'glm-5', group: 'ChatGLM 5' },
    { id: 'chatglm-5-standard', name: 'ChatGLM 5 (标准)', defaultApiId: 'glm-5', group: 'ChatGLM 5' },
    { id: 'chatglm-5v-turbo-reasoning', name: 'ChatGLM 5V Turbo (推理)', defaultApiId: 'glm-5v-turbo', group: 'ChatGLM 5V Turbo' },
    { id: 'chatglm-5v-turbo-standard', name: 'ChatGLM 5V Turbo (标准)', defaultApiId: 'glm-5v-turbo', group: 'ChatGLM 5V Turbo' },
  ],
};

function SettingsModal({ isOpen, onClose, theme, onThemeChange, initialTab = null }) {
  const { t, locale, changeLocale } = useI18n();
  const [activeTab, setActiveTab] = useState('general');
  // Honour the optional `initialTab` prop on every open transition. We
  // only react when the modal opens (not on every parent rerender) so
  // the user can still freely click around tabs while it's open.
  useEffect(() => {
    if (isOpen && initialTab) setActiveTab(initialTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTab]);
  const [wisectorStatus, setWisectorStatus] = useState(null);
  const [providerConfigs, setProviderConfigs] = useState({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSavedSuccess, setIsSavedSuccess] = useState(false);
  const [testResults, setTestResults] = useState({});

  // Dynamically generate TABS with translations
  const TABS = TABS_BASE.map(tab => ({
    ...tab,
    label: t(`settings.tabs.${tab.id}`)
  }));
  // Per-provider UI state: whether the API key is revealed, whether the card
  // is collapsed, and whether the (usually-untouched) per-model ID mapping
  // section is expanded. Defaults keep the page compact and scannable.
  const [revealedKeys, setRevealedKeys] = useState({});
  const [collapsedProviders, setCollapsedProviders] = useState({});
  const [expandedMappings, setExpandedMappings] = useState({});
  // Startup toggle: persisted so it survives app relaunches.
  const [launchAtLogin, setLaunchAtLogin] = useState(() => {
    try { return localStorage.getItem('arctic-launchAtLogin') === '1'; } catch { return false; }
  });
  // Tools tab — search/fetch/subagent configuration. Writes to a separate
  // localStorage key (`arctic-toolsConfig`) so it's independent of the
  // model-provider save flow. We persist on every change (no "save"
  // button) to match expectations for a settings page without state.
  const [toolsConfig, setToolsConfig] = useState(DEFAULT_TOOLS_CONFIG);
  const [toolsAdvancedOpen, setToolsAdvancedOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      try {
        setProviderConfigs(JSON.parse(localStorage.getItem('arctic-providerConfigs') || '{}'));
      } catch { setProviderConfigs({}); }
      setHasUnsavedChanges(false);
      setIsSavedSuccess(false);
      setTestResults({});
      setRevealedKeys({});
      setToolsConfig(readToolsConfig());
    }
  }, [isOpen]);

  // Writes tools config both to local state (for immediate UI) and to
  // localStorage (for the next tool call to pick up). Uses a deep merge so
  // partial updates don't wipe out sibling keys.
  const updateToolsConfig = (partial) => {
    const next = writeToolsConfig(partial);
    setToolsConfig(next);
  };

  // Close-with-unsaved-changes guard. Called from X button, Esc key, and overlay click.
  const safeClose = () => {
    if (hasUnsavedChanges) {
      const ok = window.confirm(t('settings.models.unsavedChanges'));
      if (!ok) return;
    }
    onClose();
  };

  // Keyboard shortcuts: Esc to close, Cmd/Ctrl+S to save (only useful on Models tab).
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        safeClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        if (activeTab === 'models' && hasUnsavedChanges) {
          e.preventDefault();
          handleSaveChanges();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab, hasUnsavedChanges]);

  if (!isOpen) return null;

  const updateProviderConfig = (providerId, key, value) => {
    setProviderConfigs(prev => ({
      ...prev,
      [providerId]: { ...(prev[providerId] || {}), [key]: value }
    }));
    setHasUnsavedChanges(true);
    setIsSavedSuccess(false);
  };

  const toggleKeyVisibility = (providerId) => {
    setRevealedKeys(prev => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  const toggleProviderCollapsed = (providerId) => {
    setCollapsedProviders(prev => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  const toggleMappingExpanded = (providerId) => {
    setExpandedMappings(prev => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  // Collapse or expand every (non-local) provider at once.
  const setAllProvidersCollapsed = (collapsed) => {
    const next = {};
    for (const p of PROVIDERS) {
      if (!p.isLocal) next[p.id] = collapsed;
    }
    setCollapsedProviders(next);
  };

  // Whether most of the non-local providers are currently expanded. Drives
  // the label of the "全部展开 / 收起" toggle button.
  const nonLocalProviders = PROVIDERS.filter(p => !p.isLocal);
  const allCollapsed = nonLocalProviders.every(p => collapsedProviders[p.id]);

  const resetProvider = (providerId, providerName) => {
    if (!window.confirm(t('settings.modelsIO.clearConfigConfirm', { name: providerName }))) return;
    setProviderConfigs(prev => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });
    setHasUnsavedChanges(true);
    setIsSavedSuccess(false);
  };

  // Serialize all provider configs to the clipboard as JSON so the user can
  // back them up or move them between machines.
  const handleExportConfig = async () => {
    try {
      const payload = JSON.stringify(providerConfigs, null, 2);
      if (window.arcticAPI?.writeClipboard) {
        await window.arcticAPI.writeClipboard(payload);
        alert(t('settings.modelsIO.exportSuccess'));
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(payload);
        alert(t('settings.modelsIO.exportSuccess'));
      } else {
        window.prompt(t('settings.modelsIO.exportPrompt'), payload);
      }
    } catch {
      window.prompt(t('settings.modelsIO.exportPrompt'), JSON.stringify(providerConfigs, null, 2));
    }
  };

  const handleImportConfig = async () => {
    let text = '';
    try {
      text = window.arcticAPI?.readClipboard
        ? await window.arcticAPI.readClipboard()
        : await navigator.clipboard.readText();
    } catch {
      text = window.prompt(t('settings.modelsIO.importPrompt')) || '';
    }
    if (!text.trim()) return;
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(t('settings.modelsIO.importError'));
      }
      setProviderConfigs(prev => ({ ...prev, ...parsed }));
      setHasUnsavedChanges(true);
      setIsSavedSuccess(false);
      alert(t('settings.modelsIO.importSuccess'));
    } catch (err) {
      alert(`${t('settings.modelsIO.importFailed')}: ${err.message || err}`);
    }
  };

  const handleLaunchAtLoginToggle = (next) => {
    setLaunchAtLogin(next);
    try { localStorage.setItem('arctic-launchAtLogin', next ? '1' : '0'); } catch { /* ignore */ }
    // If the desktop bridge exposes this capability, sync it.
    if (window.arcticAPI?.setLaunchAtLogin) {
      try { window.arcticAPI.setLaunchAtLogin(next); } catch { /* ignore */ }
    }
  };

  const handleSaveChanges = () => {
    localStorage.setItem('arctic-providerConfigs', JSON.stringify(providerConfigs));
    setHasUnsavedChanges(false);
    setIsSavedSuccess(true);
    setTimeout(() => setIsSavedSuccess(false), 2000);
    // Let the rest of the app (ChatPanel model picker, etc.) pick up the
    // new custom models / URL / key changes without a full reload.
    try {
      window.dispatchEvent(new CustomEvent('arctic-providerConfigs-updated'));
    } catch { /* older browsers */ }
  };

  const handleTestApi = async (providerId, url, key) => {
    if (!key) return;
    setTestResults(prev => ({ ...prev, [providerId]: { ok: null, msg: '连接中...' } }));
    try {
      const res = await fetch(`${url}/models`, {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.ok) {
        setTestResults(prev => ({ ...prev, [providerId]: { ok: true, msg: `连接成功 (${res.status})` } }));
      } else {
        setTestResults(prev => ({ ...prev, [providerId]: { ok: false, msg: `错误 ${res.status}: ${res.statusText}` } }));
      }
    } catch (err) {
      setTestResults(prev => ({ ...prev, [providerId]: { ok: false, msg: `网络错误: ${err.message}` } }));
    }
  };

  const handleWisectorCheckAndDownload = async () => {
    if (!window.arcticAPI?.getSystemSpecs) {
      setWisectorStatus({ ok: false, msg: '环境不支持环境检测，请在 Electron 桌面端运行。' });
      return;
    }
    const specs = await window.arcticAPI.getSystemSpecs();
    const isAppleSilicon = specs.platform === 'darwin' && specs.arch === 'arm64';
    
    let ok = false;
    let hardwareMsg = "";

    if (isAppleSilicon) {
      ok = true;
      hardwareMsg = '硬件检测通过 (Apple Silicon)：全面原生支持运行 Wisector Code Pro 1。';
    } else {
      if (specs.mockVramGB >= 5) {
        ok = true;
        hardwareMsg = '硬件检测通过：检测到系统或显卡支持，满足 ≥ 5GB 显存要求。';
      } else {
        ok = false;
        hardwareMsg = '硬件不够：Mac Intel/Windows/Linux 需要 ≥ 5GB 显存。';
      }
    }

    if (ok) {
      const confirmDownload = window.confirm(`${hardwareMsg}\n\nWisector 模型及核心依赖体积约为 4.2GB，是否现在开始下载安装？`);
      if (confirmDownload) {
        setWisectorStatus({ ok: true, msg: '正在建立连接，准备高速下载 Wisector 引擎环境...' });
      } else {
        setWisectorStatus({ ok: true, msg: '已取消本次下载任务。' });
      }
    } else {
      setWisectorStatus({ ok: false, msg: hardwareMsg });
    }
  };

  const handleImportOwmf = async () => {
    if (window.arcticAPI?.openOwmfFile) {
      const filePath = await window.arcticAPI.openOwmfFile();
      if (filePath) {
        alert(`已成功引入本地模型文件：\n${filePath}\n\n该参数已生效。`);
      }
    } else {
      alert("环境不支持文件选择，请在 Electron 桌面端运行。");
    }
  };

  // Subagent-eligible models: anything with function calling support.
  // Wisector (Orange Studio) is excluded because it's not yet functional;
  // Claude / ChatGPT / Gemini / Gemma / ChatGLM all support tool calls.
  // We pull from the LIVE catalogue (incl. user-added custom models) so
  // e.g. a local Qwen running on Ollama can serve as the digest model.
  const subagentModelOptions = getAllModels().filter(
    (m) => !['wisector-code-pro-1', 'wisector-code-pro-2', 'wisector-agent-1'].includes(m.id)
      && (m.supportsTools !== false)
  );

// Shared Toggle component for tools settings tabs
const Toggle = ({ checked, onChange, title, desc, disabled }) => (
  <label className={`tools-toggle-row ${disabled ? 'is-disabled' : ''}`}>
    <div className="tools-toggle-text">
      <div className="tools-toggle-title">{title}</div>
      <div className="tools-toggle-desc">{desc}</div>
    </div>
    <input
      type="checkbox"
      className="tools-toggle-input"
      checked={!!checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  </label>
);

  // Chat preferences tab — send shortcut, agent loop, system prompt, etc.
  const renderChatTab = () => {
    const safeConfig = toolsConfig || DEFAULT_TOOLS_CONFIG;
    const chat = safeConfig.chat || DEFAULT_TOOLS_CONFIG.chat;
    const updateChat = (partial) => updateToolsConfig({ chat: partial });

    return (
      <div className="settings-content-section settings-tools-section">
        <h2>{t('settings.chatSettings.title')}</h2>

        {/* Send shortcut */}
        <div className="settings-block">
          <div className="settings-block-title">
            <h3>{t('settings.chatSettings.send.title')}</h3>
            <p>{t('settings.chatSettings.send.desc')}</p>
          </div>
          <div className="tools-field">
            <label className="tools-radio-row">
              <input
                type="radio"
                name="sendShortcut"
                checked={chat.sendShortcut !== 'cmd-enter'}
                onChange={() => updateChat({ sendShortcut: 'enter' })}
              />
              <span>{t('settings.chatSettings.send.enter')}</span>
            </label>
            <label className="tools-radio-row">
              <input
                type="radio"
                name="sendShortcut"
                checked={chat.sendShortcut === 'cmd-enter'}
                onChange={() => updateChat({ sendShortcut: 'cmd-enter' })}
              />
              <span>{t('settings.chatSettings.send.cmdEnter')}</span>
            </label>
          </div>
        </div>

        {/* Agent iterations */}
        <div className="settings-block">
          <div className="settings-block-title">
            <h3>{t('settings.chatSettings.iterations.title')}</h3>
            <p>{t('settings.chatSettings.iterations.desc')}</p>
          </div>
          <div className="tools-field">
            <label className="tools-field-label">
              {t('settings.chatSettings.iterations.label')}: <strong>{chat.maxAgentIterations ?? 8}</strong>
            </label>
            <input
              type="range"
              className="tools-range"
              min="1"
              max="20"
              step="1"
              value={chat.maxAgentIterations ?? 8}
              onChange={(e) => updateChat({ maxAgentIterations: Number(e.target.value) })}
            />
            <div className="tools-field-hint">{t('settings.chatSettings.iterations.hint')}</div>
          </div>
        </div>

        {/* Custom system prompt */}
        <div className="settings-block">
          <div className="settings-block-title">
            <h3>{t('settings.chatSettings.systemPrompt.title')}</h3>
            <p>{t('settings.chatSettings.systemPrompt.desc')}</p>
          </div>
          <div className="tools-field">
            <textarea
              className="tools-input"
              rows={5}
              placeholder={t('settings.chatSettings.systemPrompt.placeholder')}
              value={chat.customSystemPrompt || ''}
              onChange={(e) => updateChat({ customSystemPrompt: e.target.value })}
              spellCheck={false}
              style={{ resize: 'vertical', minHeight: '80px', fontFamily: 'inherit' }}
            />
            <div className="tools-field-hint">{t('settings.chatSettings.systemPrompt.hint')}</div>
          </div>
        </div>

        {/* Behavior toggles */}
        <div className="settings-block">
          <div className="settings-block-title">
            <h3>{t('settings.chatSettings.behavior.title')}</h3>
            <p>{t('settings.chatSettings.behavior.desc')}</p>
          </div>
          <div className="tools-toggle-list">
            <Toggle
              checked={chat.clearAttachmentsAfterSend !== false}
              onChange={(v) => updateChat({ clearAttachmentsAfterSend: v })}
              title={t('settings.chatSettings.behavior.clearAfterSend')}
              desc={t('settings.chatSettings.behavior.clearAfterSendDesc')}
            />
            <Toggle
              checked={!!chat.confirmBeforeStop}
              onChange={(v) => updateChat({ confirmBeforeStop: v })}
              title={t('settings.chatSettings.behavior.confirmStop')}
              desc={t('settings.chatSettings.behavior.confirmStopDesc')}
            />
            <Toggle
              checked={chat.autoScrollOnStream !== false}
              onChange={(v) => updateChat({ autoScrollOnStream: v })}
              title={t('settings.chatSettings.behavior.autoScroll')}
              desc={t('settings.chatSettings.behavior.autoScrollDesc')}
            />
            <Toggle
              checked={!!chat.showTimestamps}
              onChange={(v) => updateChat({ showTimestamps: v })}
              title={t('settings.chatSettings.behavior.showTimestamps')}
              desc={t('settings.chatSettings.behavior.showTimestampsDesc')}
            />
          </div>
        </div>
      </div>
    );
  };

  // Python Execution tab — configure the venv-based Python runner.
  const renderPythonTab = () => {
    const safeConfig = toolsConfig || DEFAULT_TOOLS_CONFIG;
    const pyExec = safeConfig.pythonExec || DEFAULT_TOOLS_CONFIG.pythonExec;
    const updatePyConfig = (partial) => updateToolsConfig({ pythonExec: partial });

    return (
      <div className="settings-content-section settings-tools-section">
        <h2>{t('settings.python.title')}</h2>

        {/* Enable / disable */}
        <div className="settings-block">
          <div className="settings-block-title">
            <h3>{t('settings.python.enable.title')}</h3>
            <p>{t('settings.python.enable.desc')}</p>
          </div>
          <Toggle
            checked={pyExec.enabled !== false}
            onChange={(v) => updatePyConfig({ enabled: v })}
            title={t('settings.python.enable.toggle')}
            desc={t('settings.python.enable.toggleDesc')}
          />
        </div>

        {/* Venv directory */}
        <div className="settings-block">
          <div className="settings-block-title">
            <h3>{t('settings.python.venv.title')}</h3>
            <p>{t('settings.python.venv.desc')}</p>
          </div>
          <div className="tools-field">
            <label className="tools-field-label">{t('settings.python.venv.dir')}</label>
            <input
              className="tools-input"
              type="text"
              placeholder="~/arctic-python-venv"
              value={pyExec.venvDir || ''}
              onChange={(e) => updatePyConfig({ venvDir: e.target.value })}
              spellCheck={false}
              autoComplete="off"
            />
            <div className="tools-field-hint">{t('settings.python.venv.dirHint')}</div>
          </div>
          <div className="tools-field">
            <label className="tools-field-label">{t('settings.python.venv.pythonBin')}</label>
            <input
              className="tools-input tools-input-small"
              type="text"
              placeholder="python3"
              value={pyExec.pythonBin || ''}
              onChange={(e) => updatePyConfig({ pythonBin: e.target.value })}
              spellCheck={false}
              autoComplete="off"
            />
            <div className="tools-field-hint">{t('settings.python.venv.pythonBinHint')}</div>
          </div>
        </div>

        {/* Timeout */}
        <div className="settings-block">
          <div className="settings-block-title">
            <h3>{t('settings.python.timeout.title')}</h3>
            <p>{t('settings.python.timeout.desc')}</p>
          </div>
          <div className="tools-field">
            <label className="tools-field-label">
              {t('settings.python.timeout.label')}: <strong>{pyExec.timeout ?? 60}s</strong>
            </label>
            <input
              type="range"
              className="tools-range"
              min="10"
              max="300"
              step="10"
              value={pyExec.timeout ?? 60}
              onChange={(e) => updatePyConfig({ timeout: Number(e.target.value) })}
            />
            <div className="tools-field-hint">{t('settings.python.timeout.hint')}</div>
          </div>
        </div>

        {/* Info note */}
        <div className="settings-block">
          <div className="settings-block-title">
            <h3>{t('settings.python.info.title')}</h3>
          </div>
          <div className="tools-footnote" style={{ padding: 0 }}>
            <p>{t('settings.python.info.line1')}</p>
            <p style={{ marginTop: 6 }}>{t('settings.python.info.line2')}</p>
            <p style={{ marginTop: 6 }}>{t('settings.python.info.line3')}</p>
          </div>
        </div>
      </div>
    );
  };

  // The Context Compression tab — the "压箱底" feature controls. Each
  // toggle maps 1:1 to a key in toolsConfig.contextCompression and is
  // applied per-request by lib/contextCompressor.js. Persists immediately.
  const renderContextTab = () => {
    const safeConfig = toolsConfig || DEFAULT_TOOLS_CONFIG;
    const cc = safeConfig.contextCompression || DEFAULT_TOOLS_CONFIG.contextCompression;
    const setCC = (patch) => updateToolsConfig({ contextCompression: patch });

    const masterDisabled = cc.enabled === false;

    return (
      <div className="settings-content-section settings-tools-section">
        <h2>{t('settings.context.title')}</h2>

        {/* Master toggle */}
        <div className="settings-block">
          <div className="settings-block-title">
            <h3>{t('settings.context.master.title')}</h3>
            <p>{t('settings.context.description')}</p>
          </div>
          <Toggle
            checked={cc.enabled !== false}
            onChange={(v) => setCC({ enabled: v })}
            title={t('settings.context.master.title')}
            desc={t('settings.context.master.desc')}
          />
        </div>

        {/* Compression layers */}
        <div className="settings-block">
          <div className="settings-block-title">
            <h3>{t('settings.context.layers.title')}</h3>
            <p>{t('settings.context.layers.desc')}</p>
          </div>
          <div className="tools-toggle-list">
            <Toggle
              checked={cc.evictThinking !== false}
              disabled={masterDisabled}
              onChange={(v) => setCC({ evictThinking: v })}
              title={t('settings.context.thinking.title')}
              desc={t('settings.context.thinking.desc')}
            />
            <Toggle
              checked={cc.evictToolResults !== false}
              disabled={masterDisabled}
              onChange={(v) => setCC({ evictToolResults: v })}
              title={t('settings.context.toolEviction.title')}
              desc={t('settings.context.toolEviction.desc')}
            />
            <Toggle
              checked={cc.enableCaching !== false}
              disabled={masterDisabled}
              onChange={(v) => setCC({ enableCaching: v })}
              title={t('settings.context.caching.title')}
              desc={t('settings.context.caching.desc')}
            />
          </div>
        </div>

        {/* Token stats */}
        <div className="settings-block">
          <div className="settings-block-title">
            <h3>{t('settings.context.tokenStats.title')}</h3>
          </div>
          <Toggle
            checked={cc.showTokenStats === true}
            onChange={(v) => setCC({ showTokenStats: v })}
            title={t('settings.context.tokenStats.title')}
            desc={t('settings.context.tokenStats.desc')}
          />
        </div>

        {/* Sliding window */}
        <div className="settings-block">
          <div className="settings-block-title">
            <h3>{t('settings.context.window.title')}</h3>
            <p>{t('settings.context.window.desc')}</p>
          </div>

          <div className="tools-field">
            <label className="tools-field-label">
              {t('settings.context.window.size')}: <strong>{cc.slidingWindow ?? 4}</strong>
            </label>
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={cc.slidingWindow ?? 4}
              disabled={masterDisabled}
              onChange={(e) => setCC({ slidingWindow: Number(e.target.value) })}
              className="tools-range"
            />
            <div className="tools-field-hint">{t('settings.context.window.sizeHint')}</div>
          </div>

          <div className="tools-field">
            <label className="tools-field-label">
              {t('settings.context.window.minChars')}: <strong>{cc.evictionMinChars ?? 800}</strong>
            </label>
            <input
              type="range"
              min="100"
              max="5000"
              step="100"
              value={cc.evictionMinChars ?? 800}
              disabled={masterDisabled}
              onChange={(e) => setCC({ evictionMinChars: Number(e.target.value) })}
              className="tools-range"
            />
            <div className="tools-field-hint">{t('settings.context.window.minCharsHint')}</div>
          </div>
        </div>
      </div>
    );
  };

  // The Tools tab: search provider + API keys + mode + subagent model.
  // All fields persist immediately on change (separate flow from the
  // Models tab's explicit "Save" button).
  const renderToolsTab = () => {
    const search = toolsConfig.search || DEFAULT_TOOLS_CONFIG.search;
    const fetchUrl = toolsConfig.fetchUrl || DEFAULT_TOOLS_CONFIG.fetchUrl;
    const subagent = toolsConfig.subagent || DEFAULT_TOOLS_CONFIG.subagent;

    // Unified Jina API Key - used by both web search and fetch URL fallback
    const jinaApiKey = search.jinaApiKey || fetchUrl.jinaApiKey || '';
    const handleJinaKeyChange = (value) => {
      updateToolsConfig({ 
        search: { jinaApiKey: value }, 
        fetchUrl: { jinaApiKey: value } 
      });
    };

    const renderModelOption = (model) => {
      const label = model.reasoning
        ? `${model.name} · ${reasoningLabels[model.reasoning[0]] || model.reasoning[0]}`
        : model.name;
      return (
        <option key={model.id} value={model.id}>{label}</option>
      );
    };

    return (
      <div className="settings-content-section settings-tools-section">
        <h2>{t('settings.tools.title')}</h2>

        {/* ──────── Web Search ──────── */}
        <div className="settings-block">
          <div className="settings-block-title">
            <h3>{t('settings.tools.webSearch.title')}</h3>
            <p>{t('settings.tools.webSearch.description')}</p>
          </div>

          <div className="tools-field">
            <label className="tools-field-label">{t('settings.tools.webSearch.provider')}</label>
            <div className="tools-provider-cards">
              {[
                { id: 'jina', name: t('settings.tools.webSearch.providers.jina'), badge: t('settings.tools.webSearch.badges.freeKey'), desc: t('settings.tools.webSearch.descriptions.jina') },
                { id: 'tavily', name: t('settings.tools.webSearch.providers.tavily'), badge: t('settings.tools.webSearch.badges.recommended'), desc: t('settings.tools.webSearch.descriptions.tavily') },
                { id: 'brave', name: t('settings.tools.webSearch.providers.brave'), badge: '', desc: t('settings.tools.webSearch.descriptions.brave') },
                { id: 'model', name: t('settings.tools.webSearch.providers.model'), badge: t('settings.tools.webSearch.badges.experimental'), desc: t('settings.tools.webSearch.descriptions.model') },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`tools-provider-card ${search.provider === p.id ? 'active' : ''}`}
                  onClick={() => updateToolsConfig({ search: { provider: p.id } })}
                >
                  <div className="tools-provider-card-head">
                    <span className="tools-provider-card-name">{p.name}</span>
                    {p.badge && <span className="tools-provider-card-badge">{p.badge}</span>}
                  </div>
                  <div className="tools-provider-card-desc">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Conditionally show API Key field based on selected provider */}
          {search.provider === 'tavily' && (
            <div className="tools-field">
              <label className="tools-field-label">{t('settings.tools.webSearch.tavilyKey')}</label>
              <input
                type="password"
                className="tools-input"
                placeholder="tvly-..."
                value={search.tavilyApiKey || ''}
                onChange={(e) => updateToolsConfig({ search: { tavilyApiKey: e.target.value } })}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          )}

          {search.provider === 'brave' && (
            <div className="tools-field">
              <label className="tools-field-label">{t('settings.tools.webSearch.braveKey')}</label>
              <input
                type="password"
                className="tools-input"
                placeholder="BSA..."
                value={search.braveApiKey || ''}
                onChange={(e) => updateToolsConfig({ search: { braveApiKey: e.target.value } })}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          )}

          {search.provider === 'jina' && (
            <div className="tools-field">
              <label className="tools-field-label">{t('settings.tools.webSearch.jinaKey')} <span className="tools-field-hint">{t('settings.tools.webSearch.jinaKeyHint')}</span></label>
              <input
                type="password"
                className="tools-input"
                placeholder="jina_..."
                value={jinaApiKey}
                onChange={(e) => handleJinaKeyChange(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          )}

          {/* Result mode - not applicable for model provider */}
          {search.provider !== 'model' && (
            <>
              <div className="tools-field">
                <label className="tools-field-label">{t('settings.tools.webSearch.resultMode')}</label>
                <div className="tools-segment">
                  <button
                    type="button"
                    className={`tools-segment-btn ${search.mode === 'digest' ? 'active' : ''}`}
                    onClick={() => updateToolsConfig({ search: { mode: 'digest' } })}
                  >
                    {t('settings.tools.webSearch.digest')}
                    <span className="tools-segment-hint">{t('settings.tools.webSearch.digestHint')}</span>
                  </button>
                  <button
                    type="button"
                    className={`tools-segment-btn ${search.mode === 'raw' ? 'active' : ''}`}
                    onClick={() => updateToolsConfig({ search: { mode: 'raw' } })}
                  >
                    {t('settings.tools.webSearch.raw')}
                    <span className="tools-segment-hint">{t('settings.tools.webSearch.rawHint')}</span>
                  </button>
                </div>
              </div>

              <div className="tools-field">
                <label className="tools-field-label">{t('settings.tools.webSearch.maxResults')}</label>
                <input
                  type="number"
                  className="tools-input tools-input-small"
                  min="1"
                  max="10"
                  value={search.maxResults || 5}
                  onChange={(e) => {
                    const n = Math.max(1, Math.min(10, Number(e.target.value) || 5));
                    updateToolsConfig({ search: { maxResults: n } });
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* ──────── Fetch URL ──────── */}
        <div className="settings-block">
          <div className="settings-block-title">
            <h3>{t('settings.tools.fetchUrl.title')}</h3>
            <p>{t('settings.tools.fetchUrl.description')}</p>
          </div>

          <div className="tools-field">
            <label className="tools-field-label">{t('settings.tools.fetchUrl.format')}</label>
            <div className="tools-segment tools-segment-3">
              {[
                { id: 'markdown', label: t('settings.tools.fetchUrl.formats.markdown'), hint: t('settings.tools.fetchUrl.formats.markdownHint') },
                { id: 'html', label: t('settings.tools.fetchUrl.formats.html'), hint: t('settings.tools.fetchUrl.formats.htmlHint') },
                { id: 'text', label: t('settings.tools.fetchUrl.formats.text'), hint: t('settings.tools.fetchUrl.formats.textHint') },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`tools-segment-btn ${fetchUrl.format === opt.id ? 'active' : ''}`}
                  onClick={() => updateToolsConfig({ fetchUrl: { format: opt.id } })}
                >
                  {opt.label}
                  <span className="tools-segment-hint">{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Unified Jina Key for fetch URL fallback - only show if not already shown in search */}
          {search.provider !== 'jina' && (
            <div className="tools-field">
              <label className="tools-field-label">{t('settings.tools.webSearch.jinaReaderKey')} <span className="tools-field-hint">{t('settings.tools.webSearch.jinaReaderKeyHint')}</span></label>
              <input
                type="password"
                className="tools-input"
                placeholder="jina_..."
                value={jinaApiKey}
                onChange={(e) => handleJinaKeyChange(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          )}
        </div>

        {/* ──────── Subagent Model ──────── */}
        <div className="settings-block">
          <div className="settings-block-title">
            <h3>{t('settings.tools.subagent.title')}</h3>
            <p>{t('settings.tools.subagent.description')}</p>
          </div>

          <div className="tools-field">
            <label className="tools-field-label">{t('settings.tools.subagent.defaultModel')}</label>
            <select
              className="tools-input tools-select"
              value={subagent.model || ''}
              onChange={(e) => updateToolsConfig({ subagent: { model: e.target.value } })}
            >
              {subagentModelOptions.map(renderModelOption)}
            </select>
          </div>

          <button
            type="button"
            className="tools-advanced-toggle"
            onClick={() => setToolsAdvancedOpen((v) => !v)}
          >
            <span className={`tools-advanced-chevron ${toolsAdvancedOpen ? 'open' : ''}`}>
              <Icons.chevron width="12" height="12" />
            </span>
            {t('settings.tools.subagent.advanced')}
          </button>

          {toolsAdvancedOpen && (
            <div className="tools-advanced-panel">
              <div className="tools-field">
                <label className="tools-field-label">
                  <code>web_search</code> {t('settings.tools.subagent.webSearchModel')}
                </label>
                <select
                  className="tools-input tools-select"
                  value={subagent.overrides?.web_search || ''}
                  onChange={(e) => updateToolsConfig({ subagent: { overrides: { web_search: e.target.value } } })}
                >
                  <option value="">{t('settings.tools.subagent.followDefault')}</option>
                  {subagentModelOptions.map(renderModelOption)}
                </select>
              </div>

              <div className="tools-field">
                <label className="tools-field-label">
                  <code>fast_context</code> {t('settings.tools.subagent.fastContextModel')}
                </label>
                <select
                  className="tools-input tools-select"
                  value={subagent.overrides?.fast_context || ''}
                  onChange={(e) => updateToolsConfig({ subagent: { overrides: { fast_context: e.target.value } } })}
                >
                  <option value="">{t('settings.tools.subagent.followDefault')}</option>
                  {subagentModelOptions.map(renderModelOption)}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="tools-footnote">
          {t('settings.tools.footnote')}
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className="settings-content-section">
            <h2>{t('settings.general.title')}</h2>

            {/* Theme — visual card picker instead of a dropdown so the user
                can preview each option's look at a glance. */}
            <div className="settings-block">
              <div className="settings-block-title">
                <h3>{t('settings.general.theme.title')}</h3>
                <p>{t('settings.general.theme.system')}</p>
              </div>
              <div className="theme-picker-grouped">
                {[
                  {
                    groupLabel: t('settings.general.theme.groupBase'),
                    items: [
                      { id: 'light', label: t('settings.general.theme.light'), sub: 'Default' },
                      { id: 'dark', label: t('settings.general.theme.dark'), sub: 'Eye Care' },
                      { id: 'system', label: t('settings.general.theme.system'), sub: 'Auto' },
                    ],
                  },
                  {
                    groupLabel: t('settings.general.theme.groupModern'),
                    items: [
                      { id: 'modern', label: t('settings.general.theme.modern'), sub: 'Mica' },
                      { id: 'modern-dark', label: t('settings.general.theme.modernDark'), sub: 'Dark Mica' },
                      { id: 'modern-system', label: t('settings.general.theme.modernSystem'), sub: 'Auto' },
                    ],
                  },
                  {
                    groupLabel: t('settings.general.theme.groupModernPlus'),
                    items: [
                      { id: 'modern-plus', label: t('settings.general.theme.modernPlus'), sub: t('settings.general.theme.modernPlusSub') },
                    ],
                  },
                ].map(group => (
                  <div key={group.groupLabel} className="theme-picker-group">
                    <span className="theme-picker-group-label">{group.groupLabel}</span>
                    <div className="theme-picker">
                      {group.items.map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`theme-card theme-card-${opt.id} ${theme === opt.id ? 'is-active' : ''}`}
                          onClick={() => onThemeChange(opt.id)}
                          aria-pressed={theme === opt.id}
                        >
                          <div className="theme-card-preview" aria-hidden="true">
                            <span className="theme-card-preview-bar" />
                            <span className="theme-card-preview-block" />
                            <span className="theme-card-preview-dot" />
                          </div>
                          <div className="theme-card-meta">
                            <span className="theme-card-label">{opt.label}</span>
                            <span className="theme-card-sub">{opt.sub}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Language selector */}
            <div className="settings-block">
              <div className="settings-block-title">
                <h3>{t('settings.general.language.title')}</h3>
                <p>{t('settings.general.language.description')}</p>
              </div>
              <div className="theme-picker">
                {AVAILABLE_LOCALES.map((opt) => (
                  <button
                    key={opt.code}
                    type="button"
                    className={`theme-card ${locale === opt.code ? 'active' : ''}`}
                    onClick={() => changeLocale(opt.code)}
                  >
                    <div className="theme-card-body">
                      <span className="theme-card-label">{opt.name}</span>
                      <span className="theme-card-sub">{opt.code}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Startup behavior — persisted via localStorage + desktop bridge. */}
            <div className="settings-block">
              <div className="settings-block-title">
                <h3>{t('settings.general.launchAtLogin')}</h3>
              </div>
              <div className="settings-group">
                <div className="settings-item">
                  <div className="settings-item-info">
                    <h3>{t('settings.general.launchAtLogin')}</h3>
                    <p>Auto-start on login and hide in system tray</p>
                  </div>
                  <label className="settings-switch">
                    <input
                      type="checkbox"
                      checked={launchAtLogin}
                      onChange={(e) => handleLaunchAtLoginToggle(e.target.checked)}
                    />
                    <span className="settings-switch-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        );
      case 'models':
        return (
          <div className="settings-content-section settings-models-section">
            {/* Sticky header. Stays pinned while users scroll through providers
                so the Save button + bulk actions are always one click away. */}
            <div className="settings-section-header-row">
              <div className="settings-section-heading">
                <h2>{t('settings.models.title')}</h2>
                <p className="settings-section-subtitle">
                  {t('settings.models.subtitle')}
                </p>
              </div>
              <div className="settings-section-actions">
                <div className="settings-section-toolbar">
                  <button
                    type="button"
                    className="settings-icon-chip"
                    onClick={() => setAllProvidersCollapsed(!allCollapsed)}
                    title={allCollapsed ? t('settings.models.expandAll') : t('settings.models.collapseAll')}
                  >
                    {allCollapsed ? t('settings.models.expandAll') : t('settings.models.collapseAll')}
                  </button>
                  <button
                    type="button"
                    className="settings-icon-chip"
                    onClick={handleImportConfig}
                    title={t('settings.models.import')}
                  >
                    {t('settings.models.import')}
                  </button>
                  <button
                    type="button"
                    className="settings-icon-chip"
                    onClick={handleExportConfig}
                    title={t('settings.models.export')}
                    disabled={Object.keys(providerConfigs).length === 0}
                  >
                    {t('settings.models.export')}
                  </button>
                </div>
                <button
                  className={`settings-save-btn ${isSavedSuccess ? 'success' : ''}`}
                  onClick={handleSaveChanges}
                  disabled={!hasUnsavedChanges && !isSavedSuccess}
                >
                  {isSavedSuccess ? <><IconCheckSmall /> {t('settings.models.saveSuccess')}</> : t('settings.models.save')}
                </button>
              </div>
            </div>
            
            <div className="settings-providers-list">
              {PROVIDERS.map((provider) => {
                const models = PROVIDER_MODELS[provider.id] || [];
                const cfg = providerConfigs[provider.id] || {};
                const baseUrl = cfg.baseUrl || '';
                const apiKey = cfg.apiKey || '';
                const testResult = testResults[provider.id];
                const isCollapsed = !!collapsedProviders[provider.id];
                const isKeyRevealed = !!revealedKeys[provider.id];
                const overrideCount = Object.values(cfg.modelOverrides || {}).filter(v => v && v.trim()).length;

                // Build preview URL — must stay in sync with
                // providerRouting.DEFAULT_URLS. Google's OpenAI-compat
                // layer lives under /v1beta/openai; Ollama + LM Studio
                // ship a /v1 endpoint on loopback.
                const defaultUrls = {
                  openai: 'https://api.openai.com/v1',
                  anthropic: 'https://api.anthropic.com/v1',
                  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
                  zai: 'https://open.bigmodel.cn/api/paas/v4',
                  ollama: 'http://127.0.0.1:11434/v1',
                  lmstudio: 'http://127.0.0.1:1234/v1',
                };
                const effectiveUrl = baseUrl || defaultUrls[provider.id] || '';
                const customModelsList = Array.isArray(cfg.customModels) ? cfg.customModels : [];
                // Validate custom base URL only if the user typed one; official defaults are always fine.
                const urlInvalid = !!baseUrl && !/^https?:\/\//i.test(baseUrl.trim());
                const isMappingExpanded = !!expandedMappings[provider.id];

                return (
                <div
                  key={provider.id}
                  className={`provider-card ${provider.isLocal ? 'provider-card-local' : ''} ${isCollapsed ? 'is-collapsed' : ''}`}
                >
                  <button
                    type="button"
                    className="provider-card-header"
                    onClick={() => !provider.isLocal && toggleProviderCollapsed(provider.id)}
                    aria-expanded={!isCollapsed}
                  >
                    <div className="provider-card-title">
                      <span className="provider-dot" style={{ background: provider.color }}></span>
                      <h3>{t(provider.nameKey)}</h3>
                    </div>
                    <div className="provider-card-header-right">
                      {provider.isLocal ? (
                        <span className="provider-badge local">{t('settings.models.localProvider.localEngine')}</span>
                      ) : (
                        <>
                          {overrideCount > 0 && (
                            <span className="provider-badge info">{t('settings.models.customCount', { count: overrideCount })}</span>
                          )}
                          {customModelsList.length > 0 && (
                            <span className="provider-badge info">{t('settings.models.modelCount', { count: customModelsList.length })}</span>
                          )}
                          {provider.isLocalEngine ? (
                            <span className="provider-status ok">
                              <span className="provider-status-dot" />
                              {t('settings.models.providerStatus.local')}
                            </span>
                          ) : (
                            <span className={`provider-status ${apiKey ? 'ok' : 'warn'}`}>
                              <span className="provider-status-dot" />
                              {apiKey ? t('settings.models.providerStatus.configured') : t('settings.models.providerStatus.needsConfig')}
                            </span>
                          )}
                          <span
                            role="button"
                            tabIndex={0}
                            className="provider-card-reset"
                            title={t('settings.models.resetProvider')}
                            onClick={(e) => { e.stopPropagation(); resetProvider(provider.id, t(provider.nameKey)); }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                resetProvider(provider.id, t(provider.nameKey));
                              }
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/>
                            </svg>
                          </span>
                          <span className="provider-card-chevron" aria-hidden="true">
                            <Icons.chevron width="14" height="14" />
                          </span>
                        </>
                      )}
                    </div>
                  </button>

                  {!isCollapsed && (
                  <div className="provider-card-body">
                    {provider.isLocal ? (
                      <div className="provider-local-setup">
                        <p className="provider-desc">{t('settings.models.localProvider.description')}</p>
                        {provider.disabled && (
                          <div className="wisector-coming-soon">
                            <strong>🚧 {t('settings.models.localProvider.comingSoonTitle')}</strong>
                            <p>{t('settings.models.localProvider.comingSoonDesc')}</p>
                          </div>
                        )}
                        {wisectorStatus && !provider.disabled && (
                          <div className={`wisector-status ${wisectorStatus.ok ? 'ok' : 'error'}`} style={{ fontSize: '13px', marginBottom: '12px', color: wisectorStatus.ok ? 'var(--status-success)' : 'var(--status-error)' }}>
                            {wisectorStatus.msg}
                          </div>
                        )}
                        <div className="provider-actions">
                          <button
                            className="settings-btn primary"
                            onClick={handleWisectorCheckAndDownload}
                            disabled={provider.disabled}
                          >
                            {t('settings.models.localProvider.checkHardware')}
                          </button>
                          <button
                            className="settings-btn secondary"
                            onClick={handleImportOwmf}
                            disabled={provider.disabled}
                          >
                            {t('settings.models.localProvider.importOwmf')}
                          </button>
                        </div>
                        <div className="provider-models-list" style={{ marginTop: '16px', opacity: 0.5 }}>
                          {models.map(m => (
                            <div key={m.id} className="provider-model-row disabled">
                              <span className="provider-model-name">{m.name}</span>
                              <span className="provider-model-badge unavailable">
                                {provider.disabled
                                  ? t('settings.models.localProvider.comingSoonBadge')
                                  : t('settings.models.localProvider.notInstalled')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        {provider.description && (
                          <div className="provider-desc provider-desc-compact">{provider.description}</div>
                        )}
                        <div className="settings-input-group">
                          <label>
                            {t('settings.models.apiKey')}
                            {provider.isLocalEngine && <span className="settings-field-hint"> {t('settings.models.apiKeyOptional')}</span>}
                          </label>
                          <div className="settings-input-with-action">
                            <input 
                              type={isKeyRevealed ? 'text' : 'password'} 
                              placeholder={provider.isLocalEngine ? t('settings.models.apiKeyHint') : `${t('settings.models.enterApiKey', { provider: provider.name })}`}
                              value={apiKey}
                              onChange={e => updateProviderConfig(provider.id, 'apiKey', e.target.value)}
                              autoComplete="off"
                              spellCheck={false}
                            />
                            <button
                              className="settings-paste-btn settings-icon-btn"
                              title={isKeyRevealed ? t('settings.models.hideKey') : t('settings.models.showKey')}
                              onClick={() => toggleKeyVisibility(provider.id)}
                            >
                              {isKeyRevealed ? <Icons.eyeOff width="14" height="14" /> : <Icons.eye width="14" height="14" />}
                            </button>
                            <button 
                              className="settings-paste-btn" 
                              title={t('settings.models.pasteFromClipboard')}
                              onClick={async () => {
                                try {
                                  const text = window.arcticAPI?.readClipboard 
                                    ? await window.arcticAPI.readClipboard() 
                                    : await navigator.clipboard.readText();
                                  if (text) updateProviderConfig(provider.id, 'apiKey', text.trim());
                                } catch {
                                  alert(t('settings.models.clipboardError'));
                                }
                              }}
                            >
                              <IconClipboard /> {t('common.paste')}
                            </button>
                          </div>
                        </div>
                        <div className={`settings-input-group ${urlInvalid ? 'has-error' : ''}`}>
                          <label>{t('settings.models.baseUrl')}</label>
                          <div className="settings-input-with-action">
                            <input 
                              type="text" 
                              placeholder={defaultUrls[provider.id] || 'https://api.example.com/v1'}
                              value={baseUrl}
                              onChange={e => updateProviderConfig(provider.id, 'baseUrl', e.target.value)}
                              autoComplete="off"
                              spellCheck={false}
                            />
                            <button
                              className="settings-paste-btn"
                              title={t('settings.models.pasteFromClipboard')}
                              onClick={async () => {
                                try {
                                  const text = window.arcticAPI?.readClipboard
                                    ? await window.arcticAPI.readClipboard()
                                    : await navigator.clipboard.readText();
                                  if (text) updateProviderConfig(provider.id, 'baseUrl', text.trim());
                                } catch {
                                  alert(t('settings.models.clipboardError'));
                                }
                              }}
                            >
                              <IconClipboard /> {t('common.paste')}
                            </button>
                          </div>
                          {urlInvalid && (
                            <span className="settings-input-error">{t('settings.models.urlError')}</span>
                          )}
                        </div>

                        {effectiveUrl && (
                          <div className="provider-url-preview">
                            <span className="provider-url-label">{t('settings.models.urlPreview')}</span>
                            <code>{effectiveUrl}/chat/completions</code>
                          </div>
                        )}

                        <div className="provider-test-row">
                          <button
                            className="settings-btn secondary"
                            onClick={() => handleTestApi(provider.id, effectiveUrl, apiKey || 'local')}
                            disabled={!provider.isLocalEngine && !apiKey}
                          >
                            {t('settings.models.testApi')}
                          </button>
                          {testResult && (
                            <span className={`provider-test-result ${testResult.ok ? 'ok' : 'error'}`}>
                              {testResult.ok === true && <IconCheckSmall />}
                              {testResult.ok === false && <IconXSmall />}
                              {testResult.msg}
                            </span>
                          )}
                        </div>

                        {/* Custom models editor — always available so the user
                            can extend any provider (e.g. add a newer GPT
                            before we catalog it, or plug Ollama models). */}
                        <CustomModelEditor
                          providerId={provider.id}
                          models={customModelsList}
                          onChange={(next) => updateProviderConfig(provider.id, 'customModels', next)}
                        />

                        {/* Per-model ID override section — hidden for providers
                            with no pre-declared built-in models (e.g.
                            ollama/lmstudio) since there's nothing to map. */}
                        {models.length > 0 && (
                        <div className={`provider-models-section ${isMappingExpanded ? 'is-expanded' : ''}`}>
                          <button
                            type="button"
                            className="provider-models-header"
                            onClick={() => toggleMappingExpanded(provider.id)}
                            aria-expanded={isMappingExpanded}
                          >
                            <span>
                              {t('settings.models.modelMapping')}
                              <span className="provider-models-count">{models.length}</span>
                              {overrideCount > 0 && (
                                <span className="provider-models-count provider-models-count-active">{t('settings.models.overrideCount', { count: overrideCount })}</span>
                              )}
                            </span>
                            <span className="provider-models-header-right">
                              <span className="provider-models-hint">{t('settings.models.mappingHint')}</span>
                              <span className="provider-models-chevron" aria-hidden="true">
                                <Icons.chevron width="12" height="12" />
                              </span>
                            </span>
                          </button>
                          {isMappingExpanded && (
                          <div className="provider-models-list">
                            {(() => {
                              const modelOverrides = cfg.modelOverrides || {};
                              let lastGroup = null;
                              return models.map(m => {
                                const showGroupHeader = m.group && m.group !== lastGroup;
                                lastGroup = m.group || null;
                                return (
                                  <div key={m.id}>
                                    {showGroupHeader && (
                                      <div className="provider-model-group-label">{m.group}</div>
                                    )}
                                    <div className="provider-model-row">
                                      <span className="provider-model-name" title={m.name}>{m.name}</span>
                                      <input 
                                        className="provider-model-id-input"
                                        type="text"
                                        placeholder={m.defaultApiId}
                                        value={modelOverrides[m.id] || ''}
                                        onChange={e => {
                                          const newOverrides = { ...modelOverrides, [m.id]: e.target.value };
                                          updateProviderConfig(provider.id, 'modelOverrides', newOverrides);
                                        }}
                                      />
                                    </div>
                                    {m.note && (
                                      <div className="provider-model-note">{m.note}</div>
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                          )}
                        </div>
                        )}
                      </>
                    )}
                  </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        );
      case 'tools':
        return renderToolsTab();
      case 'context':
        return renderContextTab();
      case 'chat':
        return renderChatTab();
      case 'python':
        return renderPythonTab();
      case 'mcp':
        return <McpTab />;
      case 'about':
        return (
          <div className="settings-content-section settings-about-section">
            <div className="settings-about">
              <div className="settings-about-logo">
                <img src={arcticCodeLogo} alt="Arctic Code" width="56" height="56" />
              </div>
              <h3>{t('settings.about.title')}</h3>
              <p className="settings-about-version">{t('settings.about.version')}</p>

              <div className="settings-about-meta">
                <div className="settings-about-meta-row">
                  <span>{t('settings.about.meta.platform')}</span>
                  <code>{typeof navigator !== 'undefined' ? navigator.platform || 'Unknown' : 'Unknown'}</code>
                </div>
                <div className="settings-about-meta-row">
                  <span>{t('settings.about.meta.engine')}</span>
                  <code>React 19 · Vite 8 · Electron 41</code>
                </div>
                <div className="settings-about-meta-row">
                  <span>{t('settings.about.meta.workspace')}</span>
                  <code>{window.arcticAPI ? 'Electron Desktop' : 'Browser Preview'}</code>
                </div>
              </div>

              <div className="settings-about-links">
                <button className="settings-btn secondary" onClick={() => {
                  try { localStorage.removeItem('arctic-providerConfigs'); } catch { /* ignore */ }
                  alert(t('settings.about.clearConfigConfirm'));
                }}>{t('settings.about.links.clearConfig')}</button>
              </div>
            </div>
          </div>
        );
      default: {
        // Friendly WIP placeholder for chat / mcp / skill tabs.
        const tab = TABS.find(t => t.id === activeTab);
        const hints = {
          chat: t('settings.placeholder.chat'),
          mcp: t('settings.placeholder.mcp'),
          skill: t('settings.placeholder.skill'),
        };
        return (
          <div className="settings-content-section">
            <h2>{tab?.label}</h2>
            <div className="settings-placeholder">
              <div className="settings-placeholder-icon">
                {tab?.icon ? tab.icon({ width: 28, height: 28 }) : null}
              </div>
              <div className="settings-placeholder-title">{t('settings.placeholder.title')}</div>
              <div className="settings-placeholder-hint">{hints[activeTab] || t('settings.placeholder.default')}</div>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="settings-overlay" onClick={safeClose}>
      <div
        className="settings-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        {/* Left Sidebar */}
        <div className="settings-sidebar">
          <div className="settings-sidebar-header">
            <h3 id="settings-title">设置</h3>
            <span className="settings-sidebar-version">{t('settings.version')}</span>
          </div>
          <div className="settings-tabs">
            {TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="settings-tab-icon" aria-hidden="true">
                    {Icon ? <Icon width="16" height="16" /> : null}
                  </span>
                  <span className="settings-tab-label">{tab.label}</span>
                  {tab.id === 'models' && hasUnsavedChanges && (
                    <span className="settings-tab-dot" aria-label="未保存" title="有未保存的修改" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="settings-sidebar-footer">
            <span className="settings-shortcut-hint">
              <kbd>Esc</kbd> 关闭 · <kbd>⌘S</kbd> 保存
            </span>
          </div>
        </div>

        {/* Right Content */}
        <div className="settings-main">
          <button className="settings-close-btn" onClick={safeClose} title="关闭 (Esc)">
            <IconClose />
          </button>
          <div className="settings-content-body">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
