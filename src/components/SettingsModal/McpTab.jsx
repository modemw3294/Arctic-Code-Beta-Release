// MCP (Model Context Protocol) management panel.
//
// Lets the user add / edit / remove MCP servers and watch their connection
// status update live. Persistence goes through `writeToolsConfig` so the
// config survives reloads, and saving triggers a re-connect via the
// window-level handle exposed by App.jsx (`__arcticReconnectMcp`).
//
// The list shown here is sourced from two places merged on render:
//   • Persisted config (`readToolsConfig().mcp.servers`) — name/url/headers
//   • Live registry snapshot (`mcp.subscribe`) — status / tool count / error
// We key by `id` (stable per server entry) so reorder / rename doesn't
// thrash the DOM.

import { useEffect, useMemo, useState } from 'react';
import { readToolsConfig, writeToolsConfig } from '../../lib/toolsConfig';
import * as mcp from '../../lib/mcp/registry';
import { useI18n } from '../../hooks/useI18n';

function uid() {
  return `mcp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Validate a server name: required (used as routing prefix), URL-safe.
function nameError(name, otherNames) {
  if (!name) return 'required';
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) return 'invalid';
  if (otherNames.has(name)) return 'duplicate';
  return null;
}

function StatusBadge({ status, t }) {
  const map = {
    connecting: { cls: 'mcp-status-connecting', label: t('settings.mcp.status.connecting') },
    ready: { cls: 'mcp-status-ready', label: t('settings.mcp.status.ready') },
    error: { cls: 'mcp-status-error', label: t('settings.mcp.status.error') },
    disabled: { cls: 'mcp-status-disabled', label: t('settings.mcp.status.disabled') },
    idle: { cls: 'mcp-status-disabled', label: t('settings.mcp.status.idle') },
  };
  const m = map[status] || map.idle;
  return <span className={`mcp-status ${m.cls}`}>{m.label}</span>;
}

function HeadersEditor({ value, onChange, t }) {
  // value: { [key]: string }. We keep an array internally for stable
  // editing (otherwise typing a key character-by-character would re-key
  // the object every keystroke and lose focus).
  const [rows, setRows] = useState(() =>
    Object.entries(value || {}).map(([k, v]) => ({ id: uid(), k, v })),
  );
  // Sync up: convert rows back to a flat object whenever they change.
  useEffect(() => {
    const obj = {};
    for (const r of rows) {
      if (r.k.trim()) obj[r.k.trim()] = r.v;
    }
    onChange(obj);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const update = (id, patch) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id) => setRows((prev) => prev.filter((r) => r.id !== id));
  const add = () => setRows((prev) => [...prev, { id: uid(), k: '', v: '' }]);

  return (
    <div className="mcp-headers">
      {rows.map((r) => (
        <div key={r.id} className="mcp-header-row">
          <input
            className="settings-input mcp-header-key"
            placeholder={t('settings.mcp.headerKey')}
            value={r.k}
            onChange={(e) => update(r.id, { k: e.target.value })}
          />
          <input
            className="settings-input mcp-header-val"
            placeholder={t('settings.mcp.headerValue')}
            value={r.v}
            onChange={(e) => update(r.id, { v: e.target.value })}
          />
          <button
            type="button"
            className="settings-btn-icon"
            onClick={() => remove(r.id)}
            title={t('settings.mcp.removeHeader')}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="settings-btn small" onClick={add}>
        + {t('settings.mcp.addHeader')}
      </button>
    </div>
  );
}

export default function McpTab() {
  const { t } = useI18n();
  const [servers, setServers] = useState(() =>
    (readToolsConfig().mcp?.servers || []).map((s) => ({ ...s, id: s.id || uid() })),
  );
  const [statuses, setStatuses] = useState(() => mcp.getStatus());
  const [editing, setEditing] = useState(null); // server id currently expanded

  // Live registry status — updates as connections settle.
  useEffect(() => mcp.subscribe(setStatuses), []);

  const statusByName = useMemo(() => {
    const m = new Map();
    for (const s of statuses) m.set(s.name, s);
    return m;
  }, [statuses]);

  const persist = (next) => {
    setServers(next);
    // Strip the in-memory `id` field if you want — but we keep it so the
    // UI can stable-key entries across reloads.
    writeToolsConfig({ mcp: { servers: next } });
  };

  const reconnect = () => {
    if (typeof window !== 'undefined' && window.__arcticReconnectMcp) {
      window.__arcticReconnectMcp();
    }
  };

  const addServer = () => {
    const next = [
      ...servers,
      {
        id: uid(),
        name: `server${servers.length + 1}`,
        url: '',
        headers: {},
        enabled: true,
      },
    ];
    persist(next);
    setEditing(next[next.length - 1].id);
  };

  const removeServer = (id) => {
    const next = servers.filter((s) => s.id !== id);
    persist(next);
    reconnect();
  };

  const updateServer = (id, patch) => {
    const next = servers.map((s) => (s.id === id ? { ...s, ...patch } : s));
    persist(next);
  };

  const saveAndReconnect = () => {
    reconnect();
    setEditing(null);
  };

  // Detect duplicate names so we can show inline errors. Computed once
  // per render — the list is short.
  const nameCounts = useMemo(() => {
    const c = new Map();
    for (const s of servers) c.set(s.name, (c.get(s.name) || 0) + 1);
    return c;
  }, [servers]);

  return (
    <div className="settings-content-section">
      <h2>{t('settings.mcp.title')}</h2>
      <p className="settings-section-desc">{t('settings.mcp.description')}</p>

      <div className="mcp-server-list">
        {servers.length === 0 && (
          <div className="mcp-empty">
            <div className="mcp-empty-text">{t('settings.mcp.empty')}</div>
            <div className="mcp-empty-hint">{t('settings.mcp.emptyHint')}</div>
          </div>
        )}

        {servers.map((s) => {
          const status = statusByName.get(s.name);
          const isEditing = editing === s.id;
          const others = new Set(
            servers.filter((x) => x.id !== s.id).map((x) => x.name),
          );
          const nErr = nameError(s.name, others);
          const dup = nameCounts.get(s.name) > 1;
          return (
            <div key={s.id} className={`mcp-server ${isEditing ? 'expanded' : ''}`}>
              <div className="mcp-server-head">
                <div className="mcp-server-head-left">
                  <input
                    type="checkbox"
                    checked={s.enabled !== false}
                    onChange={(e) => {
                      updateServer(s.id, { enabled: e.target.checked });
                      reconnect();
                    }}
                    title={t('settings.mcp.enableTitle')}
                  />
                  <div className="mcp-server-summary">
                    <span className="mcp-server-name">{s.name || '(unnamed)'}</span>
                    <span className="mcp-server-url">{s.url || t('settings.mcp.noUrl')}</span>
                  </div>
                </div>
                <div className="mcp-server-head-right">
                  {status && (
                    <>
                      <StatusBadge status={status.status} t={t} />
                      {status.status === 'ready' && (
                        <span className="mcp-tool-count">
                          {t('settings.mcp.toolCount', { count: status.toolCount })}
                        </span>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    className="settings-btn small secondary"
                    onClick={() => setEditing(isEditing ? null : s.id)}
                  >
                    {isEditing ? t('settings.mcp.collapse') : t('settings.mcp.edit')}
                  </button>
                </div>
              </div>

              {status?.status === 'error' && status.error && (
                <div className="mcp-server-error">{status.error}</div>
              )}

              {isEditing && (
                <div className="mcp-server-body">
                  <div className="settings-field">
                    <label>{t('settings.mcp.fields.name')}</label>
                    <input
                      className="settings-input"
                      value={s.name}
                      onChange={(e) => updateServer(s.id, { name: e.target.value })}
                    />
                    {nErr === 'invalid' && (
                      <div className="settings-field-error">
                        {t('settings.mcp.errors.nameInvalid')}
                      </div>
                    )}
                    {dup && (
                      <div className="settings-field-error">
                        {t('settings.mcp.errors.nameDuplicate')}
                      </div>
                    )}
                  </div>

                  <div className="settings-field">
                    <label>{t('settings.mcp.fields.url')}</label>
                    <input
                      className="settings-input"
                      placeholder="https://example.com/mcp"
                      value={s.url}
                      onChange={(e) => updateServer(s.id, { url: e.target.value })}
                    />
                  </div>

                  <div className="settings-field">
                    <label>{t('settings.mcp.fields.headers')}</label>
                    <HeadersEditor
                      value={s.headers || {}}
                      onChange={(h) => updateServer(s.id, { headers: h })}
                      t={t}
                    />
                  </div>

                  {status?.status === 'ready' && status.tools.length > 0 && (
                    <div className="settings-field">
                      <label>{t('settings.mcp.fields.tools')}</label>
                      <ul className="mcp-tool-list">
                        {status.tools.map((tool) => (
                          <li key={tool.name} className="mcp-tool-item">
                            <code>{tool.name}</code>
                            {tool.description && (
                              <span className="mcp-tool-desc">{tool.description}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mcp-server-actions">
                    <button
                      type="button"
                      className="settings-btn small danger"
                      onClick={() => removeServer(s.id)}
                    >
                      {t('settings.mcp.delete')}
                    </button>
                    <button
                      type="button"
                      className="settings-btn small"
                      onClick={saveAndReconnect}
                      disabled={!!nErr || dup}
                    >
                      {t('settings.mcp.saveAndReconnect')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mcp-actions">
        <button type="button" className="settings-btn" onClick={addServer}>
          + {t('settings.mcp.addServer')}
        </button>
        <button type="button" className="settings-btn secondary" onClick={reconnect}>
          {t('settings.mcp.reconnectAll')}
        </button>
      </div>
    </div>
  );
}
