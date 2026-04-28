import { useState, useRef, useEffect } from 'react';
import { getAllModels, getModelGroups, reasoningLabels } from '../../lib/models';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import './TitleBar.css';
import { useI18n } from '../../hooks/useI18n';

/* ── Helpers ── */

// Split "ChatGPT 5.5" → { brand: "ChatGPT", version: "5.5" }
// Handles names like "Claude Opus 4.7", "Gemini 3.1 Pro", "Kimi 2.6"
function parseModelDisplay(name = '') {
    const parts = name.trim().split(/\s+/);
    // Find last token that looks like a version (contains a digit)
    let versionIdx = -1;
    for (let i = parts.length - 1; i >= 0; i--) {
        if (/\d/.test(parts[i])) { versionIdx = i; break; }
    }
    if (versionIdx <= 0) return { brand: name, version: '' };
    // Everything before versionIdx is brand, from versionIdx onward is version
    const brand = parts.slice(0, versionIdx).join(' ');
    const version = parts.slice(versionIdx).join(' ');
    return { brand, version };
}

// Reasoning level → tier: 'none' | 'standard' | 'reasoning'
function reasoningTier(level) {
    if (!level) return 'none';
    const lower = level.toLowerCase();
    if (['standard', 'low', 'minimal'].includes(lower)) return 'standard';
    return 'reasoning'; // high, medium, xhigh, max, reasoning
}

const IconStar = ({ filled }) => (
    <svg
        width="12" height="12" viewBox="0 0 24 24"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0 }}
    >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
);

const IconCode = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
    </svg>
);

const IconAgent = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="10" r="3" />
        <path d="M7 20.662V19a2 2 0 012-2h6a2 2 0 012 2v1.662" />
    </svg>
);

const modeConfig = {
    code: { label: 'Code', icon: <IconCode /> },
    agent: { label: 'Agent', icon: <IconAgent /> },
};

const IconChevronDown = () => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

const IconCheck = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

function TitleBar({
    mode,
    onModeChange,
    taskTitle,
    sidebarCollapsed,
    onToggleSidebar,
    rightPanelCollapsed,
    onToggleRightPanel,
    theme,
    selectedModel,
    onModelChange,
}) {
    const { t } = useI18n();
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [reasoningLevel, setReasoningLevel] = useLocalStorage('arctic-reasoningLevel', {});
    const dropdownRef = useRef(null);
    const isModern = theme === 'modern' || theme === 'modern-dark' || theme === 'modern-system' || theme === 'modern-plus';

    const allModels = getAllModels();
    const modelGroups = getModelGroups();
    const currentModel = allModels.find(m => m.id === selectedModel) || allModels[0];
    const currentReasoning = reasoningLevel[selectedModel] || currentModel?.reasoning?.[0];
    const displayName = currentModel
        ? currentReasoning && currentModel.reasoning
            ? `${currentModel.name} · ${reasoningLabels[currentReasoning]}`
            : currentModel.name
        : 'Select Model';

    useEffect(() => {
        if (!showModelDropdown) return;
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowModelDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showModelDropdown]);

    return (
        <div className="titlebar" data-tauri-drag-region>
            {/* macOS traffic light space */}
            <div className="titlebar-drag-region" />

            <div className="titlebar-left">
                <button
                    className="titlebar-btn"
                    onClick={onToggleSidebar}
                    title={sidebarCollapsed ? t('titleBar.expandSidebar') : t('titleBar.collapseSidebar')}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <line x1="9" y1="3" x2="9" y2="21" />
                    </svg>
                </button>

                {/* Mode Switcher — hidden; mode is fixed to agent */}
                <div className="mode-switcher" style={{ display: 'none' }}>
                    {Object.entries(modeConfig).map(([key, { label, icon }]) => (
                        <button
                            key={key}
                            className={`mode-btn ${mode === key ? 'active' : ''}`}
                            onClick={() => onModeChange(key)}
                        >
                            <span className="mode-icon">{icon}</span>
                            <span className="mode-label">{label}</span>
                        </button>
                    ))}
                </div>

                {/* Modern theme: model selector in titlebar */}
                {isModern && onModelChange && (() => {
                    const { brand, version } = parseModelDisplay(currentModel?.name || '');
                    const tier = currentModel?.reasoning ? reasoningTier(currentReasoning) : 'none';
                    return (
                        <div className="titlebar-model-selector model-selector-wrap" ref={dropdownRef} style={{ WebkitAppRegion: 'no-drag' }}>
                            <button
                                className={`model-selector-btn titlebar-model-btn ${showModelDropdown ? 'active' : ''}`}
                                onClick={() => setShowModelDropdown(!showModelDropdown)}
                            >
                                <span className="tbm-brand">{brand}</span>
                                {version && <span className="tbm-version">{version}</span>}
                                {tier !== 'none' && (
                                    <span className={`tbm-reasoning-badge tbm-tier-${tier}`}>
                                        {tier === 'reasoning' && <IconStar filled />}
                                        <span>{reasoningLabels[currentReasoning] || currentReasoning}</span>
                                    </span>
                                )}
                                {tier === 'none' && currentModel?.reasoning && (
                                    <span className="tbm-reasoning-badge tbm-tier-standard">
                                        <span>标准</span>
                                    </span>
                                )}
                                <span className="tbm-chevron">
                                    <IconChevronDown />
                                </span>
                            </button>
                            {showModelDropdown && (
                                <div className="model-dropdown titlebar-model-dropdown">
                                    <div className="model-dropdown-scroll">
                                        {modelGroups.map((group) => (
                                            <div key={group.provider} className="model-group">
                                                <div className="model-group-header">
                                                    <span className="model-group-dot" style={{ background: group.color }} />
                                                    <span className="model-group-name">{group.provider}</span>
                                                </div>
                                                {group.models.map((model) => {
                                                    const isWisector = group.provider === 'Orange Studio';
                                                    const disabled = isWisector;
                                                    const isActive = selectedModel === model.id;
                                                    const lvl = reasoningLevel[model.id] || model.reasoning?.[0];
                                                    const t = model.reasoning ? reasoningTier(lvl) : 'none';
                                                    const { brand: mb, version: mv } = parseModelDisplay(model.name);
                                                    return (
                                                        <button
                                                            key={model.id}
                                                            className={`model-dropdown-item tbm-dropdown-row ${isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                                                            onClick={() => {
                                                                if (disabled) return;
                                                                onModelChange(model.id);
                                                                if (model.reasoning && !reasoningLevel[model.id]) {
                                                                    setReasoningLevel(prev => ({ ...prev, [model.id]: model.reasoning[0] }));
                                                                }
                                                                setShowModelDropdown(false);
                                                            }}
                                                            disabled={disabled}
                                                        >
                                                            <span className="tbm-row-name">
                                                                <span className="tbm-brand">{mb}</span>
                                                                {mv && <span className="tbm-version">{mv}</span>}
                                                            </span>
                                                            <span className="tbm-row-right">
                                                                {isWisector && <span className="model-tag model-tag-unavailable">暂不可用</span>}
                                                                {!isWisector && model.reasoning && (
                                                                    <span className={`tbm-reasoning-badge tbm-tier-${t}`}>
                                                                        {t === 'reasoning' && <IconStar filled />}
                                                                        <span>{reasoningLabels[lvl] || lvl}</span>
                                                                    </span>
                                                                )}
                                                                {!isWisector && model.tag && (
                                                                    <span className={`model-tag model-tag-${model.tag.toLowerCase()}`}>{model.tag}</span>
                                                                )}
                                                                {isActive && <IconCheck />}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                    {/* Reasoning level pills for current model */}
                                    {currentModel?.reasoning && (
                                        <div className="model-reasoning-bar">
                                            <span className="model-reasoning-label">推理强度</span>
                                            <div className="model-reasoning-pills">
                                                {currentModel.reasoning.map((level) => {
                                                    const lt = reasoningTier(level);
                                                    return (
                                                        <button
                                                            key={level}
                                                            className={`model-reasoning-pill tbm-pill-${lt} ${currentReasoning === level ? 'active' : ''}`}
                                                            onClick={() => setReasoningLevel(prev => ({ ...prev, [selectedModel]: level }))}
                                                        >
                                                            {lt === 'reasoning' && <IconStar filled />}
                                                            {reasoningLabels[level]}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>

            <div className="titlebar-center">
                {taskTitle && (
                    <span className="titlebar-task-title">{taskTitle}</span>
                )}
            </div>

            <div className="titlebar-right">
                <button
                    className="titlebar-btn"
                    onClick={onToggleRightPanel}
                    title={rightPanelCollapsed ? t('titleBar.expandPanel') : t('titleBar.collapsePanel')}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <line x1="15" y1="3" x2="15" y2="21" />
                    </svg>
                </button>
            </div>
        </div>
    );
}

export default TitleBar;
