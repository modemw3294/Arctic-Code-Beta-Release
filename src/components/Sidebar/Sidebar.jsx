import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useI18n } from '../../hooks/useI18n';
import './Sidebar.css';

// SVG Icons
const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconGrid = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

const IconFolder = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
  </svg>
);

// Project row chevron — rotates via CSS when the project is collapsed.
const IconChevron = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// Per-task hover menu trigger (three dots).
const IconMore = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="19" r="1" />
  </svg>
);

const IconPencil = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconMove = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="5 9 2 12 5 15" />
    <polyline points="9 5 12 2 15 5" />
    <polyline points="15 19 12 22 9 19" />
    <polyline points="19 9 22 12 19 15" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="2" x2="12" y2="22" />
  </svg>
);

const IconChevronRight = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const IconSnowflake = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M17 7l-5-5-5 5" />
    <path d="M17 17l-5 5-5-5" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M7 7l-5 5 5 5" />
    <path d="M17 7l5 5-5 5" />
  </svg>
);

const IconSettings = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

// Inline rename input. Split into a dedicated component so we can use
// `key` on the parent to remount it every time the user enters rename
// mode — that way the initial `draft` state cleanly inherits the current
// title without a setState-in-effect hack.
function TaskRenameInput({ initialValue, onCommit, onCancel }) {
  const [draft, setDraft] = useState(initialValue);
  const inputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit?.(draft.trim() || initialValue);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel?.();
    }
  };

  return (
    <input
      ref={inputRef}
      className="sidebar-task-rename-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit?.(draft.trim() || initialValue)}
      onKeyDown={handleKeyDown}
      onClick={(e) => e.stopPropagation()}
      spellCheck={false}
    />
  );
}

// A single task row. Handles its own hover state + inline rename to keep
// the sidebar parent clean. Parent only sees the final rename/delete
// callbacks.
function SidebarTaskRow({
  task,
  isActive,
  isRenaming,
  menuOpen,
  projects,
  onSelect,
  onOpenMenu,
  onCloseMenu,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDelete,
  onMoveToWorkspace,
}) {
  const { t } = useI18n();
  const menuRef = useRef(null);
  const moveRowRef = useRef(null);
  const submenuCloseTimer = useRef(null);
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);
  const [submenuPos, setSubmenuPos] = useState({ top: 0, left: 0 });

  // When the user hovers the "移动到工作区" row, capture its bounding
  // rect so the portal-rendered submenu can be positioned in viewport
  // coordinates and escape the sidebar's overflow clipping.
  const openSubmenu = () => {
    if (submenuCloseTimer.current) {
      clearTimeout(submenuCloseTimer.current);
      submenuCloseTimer.current = null;
    }
    const el = moveRowRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const submenuW = 180;
      const wouldOverflowRight = r.right + submenuW + 8 > window.innerWidth;
      const left = wouldOverflowRight
        ? Math.max(8, r.left - submenuW)
        : r.right;
      setSubmenuPos({ top: r.top - 4, left });
    }
    setShowMoveSubmenu(true);
  };
  // Delayed close so the cursor can travel from the parent row into
  // the portal-rendered submenu without losing hover state.
  const scheduleSubmenuClose = () => {
    if (submenuCloseTimer.current) clearTimeout(submenuCloseTimer.current);
    submenuCloseTimer.current = setTimeout(() => setShowMoveSubmenu(false), 120);
  };
  useEffect(() => () => {
    if (submenuCloseTimer.current) clearTimeout(submenuCloseTimer.current);
  }, []);

  // Close the kebab menu on outside click.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const handler = (e) => {
      if (!menuRef.current?.contains(e.target)) onCloseMenu?.();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen, onCloseMenu]);

  const handleContextMenu = (e) => {
    e.preventDefault();
    onOpenMenu?.(task.id);
  };

  return (
    <div
      className={`sidebar-task ${isActive ? 'active' : ''} ${isRenaming ? 'is-renaming' : ''} ${menuOpen ? 'menu-open' : ''}`}
      onClick={() => !isRenaming && onSelect?.()}
      onContextMenu={handleContextMenu}
    >
      {/* Status dot:
          - `unread` (blue) takes precedence — set when an assistant
            reply lands while the user is viewing a different task
          - falls back to `task.status` for terminal states ('completed' / 'error')
          - otherwise gray (idle / in-progress) */}
      <span
        className={`sidebar-task-status ${task.unread ? 'unread' : (task.status || '')}`}
      />
      {isRenaming ? (
        <TaskRenameInput
          key={`rename-${task.id}`}
          initialValue={task.title}
          onCommit={(title) => onCommitRename?.(title)}
          onCancel={() => onCancelRename?.()}
        />
      ) : (
        <span className="sidebar-task-title">{task.title}</span>
      )}
      {!isRenaming && (
        <div className="sidebar-task-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="sidebar-task-menu-trigger"
            title={t('sidebar.moreActions')}
            onClick={(e) => {
              e.stopPropagation();
              menuOpen ? onCloseMenu?.() : onOpenMenu?.(task.id);
            }}
          >
            <IconMore />
          </button>
          {menuOpen && (
            <div className="sidebar-task-menu" role="menu">
              <button
                type="button"
                className="sidebar-task-menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseMenu?.();
                  onStartRename?.(task.id);
                }}
              >
                <IconPencil />
                <span>{t('sidebar.rename')}</span>
              </button>
              {/* Move-to-workspace submenu — only when there are other
                  workspaces to move the task into. A task that is
                  already in Playground can still move to a project. */}
              {typeof onMoveToWorkspace === 'function' && [
                  { id: 'playground', name: 'Playground' },
                  ...projects,
                ].filter((p) => p.id !== task.projectId).length > 0 && (
                <div
                  ref={moveRowRef}
                  className="sidebar-task-menu-item has-submenu"
                  onMouseEnter={openSubmenu}
                  onMouseLeave={scheduleSubmenuClose}
                >
                  <IconMove />
                  <span>{t('sidebar.moveToWorkspace')}</span>
                  <IconChevronRight />
                  {showMoveSubmenu && createPortal(
                    <div
                      className="sidebar-task-submenu"
                      role="menu"
                      style={{ top: submenuPos.top, left: submenuPos.left }}
                      onMouseEnter={openSubmenu}
                      onMouseLeave={scheduleSubmenuClose}
                    >
                      {[
                        { id: 'playground', name: 'Playground' },
                        ...projects,
                      ]
                        .filter((p) => p.id !== task.projectId)
                        .map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="sidebar-task-menu-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowMoveSubmenu(false);
                              onCloseMenu?.();
                              onMoveToWorkspace(task.id, p.id);
                            }}
                          >
                            <span>{p.name}</span>
                          </button>
                        ))}
                    </div>,
                    document.body
                  )}
                </div>
              )}
              <button
                type="button"
                className="sidebar-task-menu-item danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseMenu?.();
                  onDelete?.(task.id);
                }}
              >
                <IconTrash />
                <span>{t('sidebar.deleteConversation')}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Sidebar({
  collapsed,
  mode,
  projects,
  tasks,
  activeTask,
  onSelectTask,
  onNewTask,
  onOpenSettings,
  activeView,
  onSelectView,
  onAddProject,
  onDeleteProject,
  onRenameTask,
  onDeleteTask,
  onMoveTaskToWorkspace,
}) {
  const { t } = useI18n();
  // Per-project collapse state, persisted so closing "Playground" stays
  // closed across sessions. Keyed by project id. A missing key = expanded.
  const [collapsedFolders, setCollapsedFolders] = useLocalStorage(
    'arctic-sidebarCollapsedFolders',
    {}
  );
  // UI-local state: which task's kebab menu is open and which task is
  // being inline-renamed (at most one of each at a time).
  const [openMenuTaskId, setOpenMenuTaskId] = useState(null);
  const [renamingTaskId, setRenamingTaskId] = useState(null);

  if (collapsed) return null;

  const toggleFolder = (projectId) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  const handleRenameCommit = (taskId, newTitle) => {
    const trimmed = (newTitle || '').trim();
    if (trimmed) onRenameTask?.(taskId, trimmed);
    setRenamingTaskId(null);
  };

  const handleDelete = (taskId) => {
    const task = tasks.find((t) => t.id === taskId);
    const confirmed = window.confirm(
      t('sidebar.deleteConfirm', { title: task?.title || t('sidebar.unnamed') })
    );
    if (confirmed) onDeleteTask?.(taskId);
  };

  // Show every project regardless of which mode it was originally
  // created in. The `mode` field on a project is purely historical
  // metadata at this point — projects (= folders) work with any
  // current mode. Filtering by mode used to silently hide workspaces
  // from users who toggled mode after creating them.
  const visibleProjects = [{ id: 'playground', name: 'Playground', mode }, ...projects];
  const visibleProjectIds = new Set(visibleProjects.map((p) => p.id));

  return (
    <aside className="sidebar">
      {/* New Task Button */}
      <button className="sidebar-new-task" onClick={onNewTask}>
        <IconPlus />
        <span>{t('sidebar.newTask')}</span>
      </button>

      {/* Skills */}
      <button
        className={`sidebar-menu-item ${activeView === 'skills' ? 'active' : ''}`}
        onClick={() => onSelectView('skills')}
      >
        <IconGrid />
        <span>{t('sidebar.skills')}</span>
      </button>

      {/* Project List */}
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span>{t('sidebar.projectList')}</span>
          <button className="sidebar-section-action" title={t('sidebar.newProject')} onClick={onAddProject}>
            <IconFolder />
          </button>
        </div>

        {visibleProjects.map((project) => {
          const isCollapsed = !!collapsedFolders[project.id];
          const projectTasks = tasks.filter((t) => {
            if (t.projectId === project.id) return true;
            // Fallback: orphaned tasks (no matching visible project) go under Playground
            if (project.id === 'playground' && !visibleProjectIds.has(t.projectId)) return true;
            return false;
          });

          // Playground is the universal fallback bucket; deleting it
          // would leave orphaned tasks nowhere to land, so the delete
          // affordance is gated to user-created projects only.
          const canDelete = project.id !== 'playground' && !!onDeleteProject;
          return (
            <div key={project.id} className={`sidebar-project ${isCollapsed ? 'is-collapsed' : ''}`}>
              <div className="sidebar-project-header-wrap">
                <button
                  type="button"
                  className="sidebar-project-header"
                  onClick={() => toggleFolder(project.id)}
                  title={isCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
                >
                  <span className={`sidebar-project-chevron ${isCollapsed ? 'is-collapsed' : ''}`}>
                    <IconChevron />
                  </span>
                  <span className="sidebar-project-icon"><IconFolder /></span>
                  <span className="sidebar-project-name">{project.name}</span>
                  {projectTasks.length > 0 && (
                    <span className="sidebar-project-count">{projectTasks.length}</span>
                  )}
                </button>
                {canDelete && (
                  <button
                    type="button"
                    className="sidebar-project-delete"
                    title={t('sidebar.deleteProject')}
                    onClick={(e) => {
                      // Prevent the parent header's collapse toggle.
                      e.stopPropagation();
                      onDeleteProject(project.id);
                    }}
                  >
                    <IconTrash />
                  </button>
                )}
              </div>
              {!isCollapsed && projectTasks.map((task) => (
                <SidebarTaskRow
                  key={task.id}
                  task={task}
                  isActive={activeTask?.id === task.id}
                  isRenaming={renamingTaskId === task.id}
                  menuOpen={openMenuTaskId === task.id}
                  onSelect={() => onSelectTask(task)}
                  onOpenMenu={(id) => setOpenMenuTaskId(id)}
                  onCloseMenu={() => setOpenMenuTaskId(null)}
                  onStartRename={(id) => setRenamingTaskId(id)}
                  onCommitRename={(title) => handleRenameCommit(task.id, title)}
                  onCancelRename={() => setRenamingTaskId(null)}
                  onDelete={handleDelete}
                  projects={projects.filter((p) => p.id !== 'playground')}
                  onMoveToWorkspace={onMoveTaskToWorkspace}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Settings Entry */}
      <div className="sidebar-footer">
        <button className="sidebar-settings-btn" onClick={onOpenSettings}>
          <IconSettings />
          <span>{t('sidebar.settings')}</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
