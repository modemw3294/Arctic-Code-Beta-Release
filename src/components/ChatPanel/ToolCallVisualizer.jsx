// Visualized view for each tool call's expanded body.
//
// Each tool gets a hand-crafted rendering that maps its args + result into
// an intuitive, at-a-glance layout (e.g. run_command → "command / output"
// terminal strip, fetch_url → URL + markdown preview, web_search →
// result list). The raw JSON payload is still available but tucked
// inside a "raw data" disclosure so it doesn't dominate the view.
//
// Every renderer accepts `{ call }` and returns JSX. `call` shape:
//   { id, name, args, result, status }
// Status is one of 'running' | 'success' | 'error' | 'denied'.

import ReactMarkdown from 'react-markdown';
import { REMARK_PLUGINS, REHYPE_PLUGINS } from '../../lib/markdownPlugins';
import { MARKDOWN_COMPONENTS } from '../../lib/markdownComponents';
import { useI18n } from '../../hooks/useI18n';

// ────────────────────────────────────────────────────────────────
// Shared primitives
// ────────────────────────────────────────────────────────────────

function Section({ label, children, className = '' }) {
  return (
    <div className={`tool-viz-section ${className}`}>
      <div className="tool-viz-section-label">{label}</div>
      <div className="tool-viz-section-body">{children}</div>
    </div>
  );
}

function InlineCode({ children }) {
  return <code className="tool-viz-inline-code">{children}</code>;
}

function truncate(str, max = 2000) {
  if (typeof str !== 'string') return '';
  if (str.length <= max) return str;
  return str.slice(0, max) + `\n\n... (truncated ${str.length - max} characters)`;
}

// "raw data" disclosure: the original JSON payload, hidden behind a
// second click so the default view stays clean.
function RawDataDisclosure({ args, result }) {
  const { t } = useI18n();
  return (
    <details className="tool-viz-raw">
      <summary className="tool-viz-raw-summary">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span>{t('chat.tools.rawData')}</span>
      </summary>
      <div className="tool-viz-raw-body">
        <div className="tool-viz-section-label">{t('chat.tools.parameters')}</div>
        <pre className="chat-tool-pre">{JSON.stringify(args, null, 2)}</pre>
        {result !== undefined && result !== null && (
          <>
            <div className="tool-viz-section-label">{t('chat.tools.result')}</div>
            <pre className="chat-tool-pre">{JSON.stringify(result, null, 2)}</pre>
          </>
        )}
      </div>
    </details>
  );
}

function ErrorBlock({ message }) {
  const { t } = useI18n();
  if (!message) return null;
  return (
    <Section label={t('chat.tools.error')} className="tool-viz-error">
      <div className="tool-viz-error-message">{message}</div>
    </Section>
  );
}

// ────────────────────────────────────────────────────────────────
// Per-tool visualizers
// ────────────────────────────────────────────────────────────────

// run_command — terminal-style "command / output"
function RunCommandViz({ call }) {
  const { t } = useI18n();
  const { args = {}, result = {}, status } = call;
  const { command = '', cwd, explanation } = args;
  const { stdout = '', stderr = '', exit_code, error, timed_out } = result || {};
  const exitOk = exit_code === 0;
  return (
    <div className="tool-viz-runcmd">
      {explanation && (
        <div className="tool-viz-explanation">{explanation}</div>
      )}
      <Section label={t('chat.tools.command')}>
        <div className="tool-viz-terminal">
          <div className="tool-viz-terminal-prompt">
            <span className="tool-viz-terminal-sigil">$</span>
            <code>{command}</code>
          </div>
          {cwd && (
            <div className="tool-viz-terminal-cwd">{t('chat.tools.workingDirectory')}: <InlineCode>{cwd}</InlineCode></div>
          )}
        </div>
      </Section>

      {status === 'running' ? (
        <Section label={t('chat.tools.status')}>
          <div className="tool-viz-running-hint">
            <span className="tool-viz-running-dot" />
            {t('chat.tools.waitingExecution')}
          </div>
        </Section>
      ) : error ? (
        <ErrorBlock message={error} />
      ) : (
        <Section label={t('chat.tools.output')}>
          <div className="tool-viz-terminal-output">
            {stdout && <pre className="tool-viz-stdout">{truncate(stdout)}</pre>}
            {stderr && <pre className="tool-viz-stderr">{truncate(stderr)}</pre>}
            {!stdout && !stderr && (
              <div className="tool-viz-empty">{t('chat.tools.noOutput')}</div>
            )}
            <div className="tool-viz-terminal-footer">
              <span className={`tool-viz-exit ${exitOk ? 'is-ok' : 'is-fail'}`}>
                exit {typeof exit_code === 'number' ? exit_code : '?'}
              </span>
              {timed_out && <span className="tool-viz-exit is-fail">{t('chat.tools.timeout')}</span>}
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

// fetch_url — URL header + Markdown preview
function FetchUrlViz({ call }) {
  const { t } = useI18n();
  const { args = {}, result = {}, status } = call;
  const { url } = args;
  const { title, url: finalUrl, content = '', truncated, source, format, error } = result || {};
  return (
    <div className="tool-viz-fetch">
      <Section label="URL">
        <a
          className="tool-viz-link"
          href={finalUrl || url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {finalUrl || url}
        </a>
        {source && (
          <span className="tool-viz-badge">{
            source === 'electron' ? t('chat.tools.nativeFetch') :
            source === 'dom' ? t('chat.tools.browserFetch') :
            source === 'jina' ? 'Jina Reader' : source
          }</span>
        )}
        {format && <span className="tool-viz-badge">{format}</span>}
      </Section>

      {title && (
        <Section label={t('chat.tools.title')}>
          <div className="tool-viz-title">{title}</div>
        </Section>
      )}

      {status === 'running' ? (
        <Section label={t('chat.tools.status')}>
          <div className="tool-viz-running-hint">
            <span className="tool-viz-running-dot" />
            {t('chat.tools.fetching')}
          </div>
        </Section>
      ) : error ? (
        <ErrorBlock message={error} />
      ) : (
        <Section label={format === 'html' ? t('chat.tools.contentHtml') : t('chat.tools.content')}>
          {format === 'html' ? (
            <pre className="tool-viz-html">{truncate(content, 4000)}</pre>
          ) : (
            <div className="tool-viz-markdown">
              <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MARKDOWN_COMPONENTS}>{truncate(content, 4000)}</ReactMarkdown>
            </div>
          )}
          {truncated && (
            <div className="tool-viz-hint">{t('chat.tools.truncated')}</div>
          )}
        </Section>
      )}
    </div>
  );
}

// web_search — result list or model-generated summary
function WebSearchViz({ call }) {
  const { t } = useI18n();
  const { args = {}, result = {}, status } = call;
  const { query } = args;
  const { provider, summary, results = [], sources = [], answer, error } = result || {};

  return (
    <div className="tool-viz-search">
      <Section label={t('chat.tools.query')}>
        <div className="tool-viz-query">&quot;{query}&quot;</div>
        {provider && <span className="tool-viz-badge">{provider}</span>}
      </Section>

      {status === 'running' ? (
        <Section label={t('chat.tools.status')}>
          <div className="tool-viz-running-hint">
            <span className="tool-viz-running-dot" />
            {t('chat.tools.searching')}
          </div>
        </Section>
      ) : error ? (
        <ErrorBlock message={error} />
      ) : (
        <>
          {summary && (
            <Section label={provider === 'model' ? t('chat.tools.researchReport') : t('chat.tools.summary')}>
              <div className="tool-viz-markdown">
                <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MARKDOWN_COMPONENTS}>{summary}</ReactMarkdown>
              </div>
            </Section>
          )}
          {answer && !summary && (
            <Section label={t('chat.tools.answer')}>
              <div className="tool-viz-markdown">
                <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MARKDOWN_COMPONENTS}>{answer}</ReactMarkdown>
              </div>
            </Section>
          )}
          {results.length > 0 && (
            <Section label={`${t('chat.tools.results')} (${results.length})`}>
              <ol className="tool-viz-results">
                {results.map((r, i) => (
                  <li key={i} className="tool-viz-result">
                    <a
                      className="tool-viz-link"
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {r.title || r.url}
                    </a>
                    {r.url && <div className="tool-viz-result-url">{r.url}</div>}
                    {r.snippet && (
                      <div className="tool-viz-result-snippet">{r.snippet}</div>
                    )}
                  </li>
                ))}
              </ol>
            </Section>
          )}
          {sources.length > 0 && (
            <Section label={`${t('chat.tools.sources')} (${sources.length})`}>
              <ul className="tool-viz-sources">
                {sources.map((s, i) => (
                  <li key={i}>
                    <a
                      className="tool-viz-link"
                      href={s.url || s}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {s.title || s.url || s}
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {!summary && !answer && results.length === 0 && sources.length === 0 && (
            <Section label={t('chat.tools.results')}>
              <div className="tool-viz-empty">{t('chat.tools.noResults')}</div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

// Code / file tools: read_file / create_file / edit_file / delete_file
function FileOpViz({ call }) {
  const { t } = useI18n();
  const { name, args = {}, result = {}, status } = call;
  const { path, content: argContent } = args;
  const { content: resContent, error, linesAdded, linesRemoved, totalLines } = result || {};
  const showArgContent = ['create_file', 'edit_file'].includes(name);
  // Show a "+N -M" diff badge for create/edit results when we have line
  // metrics. linesAdded / linesRemoved are populated by lib/toolsExec/
  // fileOps.js's quickLineDiff (best-effort prefix/suffix trim).
  const showDiffBadge =
    result?.ok &&
    ['create_file', 'edit_file'].includes(name) &&
    (typeof linesAdded === 'number' || typeof linesRemoved === 'number');
  // For read_file, surface the line range (either user-requested via
  // args.start_line/end_line, or echoed back from the result when the
  // model omitted them and we used defaults). Helps the user spot at a
  // glance "oh it only read lines 120–180, not the whole file".
  const isRead = name === 'read_file';
  const resStart = result?.start_line;
  const resEnd = result?.end_line;
  const resTotal = result?.total_lines;
  const rangeLabel =
    isRead &&
    typeof resStart === 'number' &&
    typeof resEnd === 'number' &&
    resTotal > 0
      ? `${resStart}–${resEnd}${typeof resTotal === 'number' ? ` / ${resTotal}` : ''}`
      : isRead && (args.start_line || args.end_line)
        ? `${args.start_line ?? '1'}–${args.end_line ?? '∞'}`
        : null;
  return (
    <div className="tool-viz-file">
      <Section label={t('chat.tools.path')}>
        <InlineCode>{path || t('chat.tools.notSpecified')}</InlineCode>
        {rangeLabel && (
          <span className="tool-viz-range-badge" title={t('chat.tools.lineRange')}>
            L{rangeLabel}
            {result?.truncated && (
              <span className="tool-viz-range-trunc">·trunc</span>
            )}
          </span>
        )}
      </Section>
      {showArgContent && argContent && (
        <Section label={name === 'edit_file' ? t('chat.tools.newContent') : t('chat.tools.fileContent')}>
          <pre className="tool-viz-code">{truncate(argContent, 3000)}</pre>
        </Section>
      )}
      {status === 'running' ? (
        <Section label={t('chat.tools.status')}>
          <div className="tool-viz-running-hint">
            <span className="tool-viz-running-dot" />
            {t('chat.tools.processing')}
          </div>
        </Section>
      ) : error ? (
        <ErrorBlock message={error} />
      ) : name === 'read_file' && resContent ? (
        <Section label={t('chat.tools.fileContent')}>
          <pre className="tool-viz-code">{truncate(resContent, 4000)}</pre>
        </Section>
      ) : (
        result?.ok && (
          <Section label={t('chat.tools.status')}>
            <div className="tool-viz-success">
              {t('chat.tools.completed')}
              {showDiffBadge && (
                <span className="tool-viz-diff-badge">
                  {linesAdded > 0 && (
                    <span className="tool-viz-diff-add">+{linesAdded}</span>
                  )}
                  {linesRemoved > 0 && (
                    <span className="tool-viz-diff-del">−{linesRemoved}</span>
                  )}
                  {typeof totalLines === 'number' && (
                    <span className="tool-viz-diff-total">{t('chat.tools.totalLines', { n: totalLines })}</span>
                  )}
                </span>
              )}
            </div>
          </Section>
        )
      )}
    </div>
  );
}

// Code search tools: search_workspace / grep_workspace / fast_context
function SearchWorkspaceViz({ call }) {
  const { t } = useI18n();
  const { name, args = {}, result = {}, status } = call;
  const { query, pattern } = args;
  const { matches = [], summary, answer, error } = result || {};
  const q = query || pattern || '';
  return (
    <div className="tool-viz-search">
      <Section label={t('chat.tools.query')}>
        <div className="tool-viz-query">&quot;{q}&quot;</div>
      </Section>
      {status === 'running' ? (
        <Section label={t('chat.tools.status')}>
          <div className="tool-viz-running-hint">
            <span className="tool-viz-running-dot" />
            {t('chat.tools.retrieving')}
          </div>
        </Section>
      ) : error ? (
        <ErrorBlock message={error} />
      ) : (
        <>
          {(summary || answer) && (
            <Section label={name === 'fast_context' ? t('chat.tools.retrievalReport') : t('chat.tools.summary')}>
              <div className="tool-viz-markdown">
                <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MARKDOWN_COMPONENTS}>{summary || answer}</ReactMarkdown>
              </div>
            </Section>
          )}
          {matches.length > 0 && (
            <Section label={`${t('chat.tools.matches')} (${matches.length})`}>
              <ul className="tool-viz-matches">
                {matches.slice(0, 30).map((m, i) => (
                  <li key={i} className="tool-viz-match">
                    {(m.path || m.file) && (
                      <div className="tool-viz-match-path">
                        <InlineCode>{m.path || m.file}</InlineCode>
                        {typeof m.line === 'number' && <span className="tool-viz-match-line">:{m.line}</span>}
                      </div>
                    )}
                    {(m.preview || m.text) && (
                      <pre className="tool-viz-match-preview">{truncate(m.preview || m.text, 300)}</pre>
                    )}
                  </li>
                ))}
                {matches.length > 30 && (
                  <li className="tool-viz-hint">{t('chat.tools.moreMatches', { count: matches.length - 30 })}</li>
                )}
              </ul>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

// list_directory — compact grid of entries with type/size hints
function ListDirectoryViz({ call }) {
  const { t } = useI18n();
  const { args = {}, result = {}, status } = call;
  const { entries = [], truncated, error } = result || {};
  const dirs = entries.filter((e) => e.type === 'dir');
  const files = entries.filter((e) => e.type !== 'dir');
  return (
    <div className="tool-viz-listdir">
      <Section label={t('chat.tools.path')}>
        <InlineCode>{args.path || '.'}</InlineCode>
      </Section>
      {status === 'running' ? (
        <Section label={t('chat.tools.status')}>
          <div className="tool-viz-running-hint">
            <span className="tool-viz-running-dot" />
            {t('chat.tools.retrieving')}
          </div>
        </Section>
      ) : error ? (
        <ErrorBlock message={error} />
      ) : (
        <Section label={`${entries.length}${truncated ? '+' : ''} ${t('chat.tools.entries')}`}>
          <div className="tool-viz-listdir-grid">
            {dirs.slice(0, 80).map((e) => (
              <span key={'d:' + e.name} className="tool-viz-listdir-item is-dir">
                <span className="tool-viz-listdir-icon">▸</span>
                {e.name}/
              </span>
            ))}
            {files.slice(0, 200).map((e) => (
              <span key={'f:' + e.name} className="tool-viz-listdir-item">
                <span className="tool-viz-listdir-icon">·</span>
                {e.name}
              </span>
            ))}
          </div>
          {truncated && (
            <div className="tool-viz-hint">{t('chat.tools.truncatedHint')}</div>
          )}
        </Section>
      )}
    </div>
  );
}

// move_file / copy_file — "from → to" pair
function MoveCopyViz({ call }) {
  const { t } = useI18n();
  const { name, args = {}, result = {}, status } = call;
  const { error } = result || {};
  return (
    <div className="tool-viz-file">
      <Section label={t('chat.tools.path')}>
        <div className="tool-viz-from-to">
          <InlineCode>{args.from_path || '?'}</InlineCode>
          <span className="tool-viz-arrow">→</span>
          <InlineCode>{args.to_path || '?'}</InlineCode>
          {args.overwrite && (
            <span className="tool-viz-flag">overwrite</span>
          )}
        </div>
      </Section>
      {status === 'running' ? (
        <Section label={t('chat.tools.status')}>
          <div className="tool-viz-running-hint">
            <span className="tool-viz-running-dot" />
            {t('chat.tools.processing')}
          </div>
        </Section>
      ) : error ? (
        <ErrorBlock message={error} />
      ) : (
        result?.ok && (
          <Section label={t('chat.tools.status')}>
            <div className="tool-viz-success">
              {name === 'move_file' ? t('chat.tools.moved') : t('chat.tools.copied')}
              {result.bytes ? ` · ${result.bytes} B` : ''}
            </div>
          </Section>
        )
      )}
    </div>
  );
}

// search_replace — show old/new snippets + the standard diff badge
function SearchReplaceViz({ call }) {
  const { t } = useI18n();
  const { args = {}, result = {}, status } = call;
  const { error, linesAdded, linesRemoved, totalLines, replacements } = result || {};
  const showDiffBadge =
    result?.ok &&
    (typeof linesAdded === 'number' || typeof linesRemoved === 'number');
  return (
    <div className="tool-viz-file">
      <Section label={t('chat.tools.path')}>
        <InlineCode>{args.path || args.reference_id || t('chat.tools.notSpecified')}</InlineCode>
        {args.replace_all && (
          <span className="tool-viz-flag">replace_all</span>
        )}
      </Section>
      <Section label={t('chat.tools.oldString')}>
        <pre className="tool-viz-code tool-viz-code-old">{truncate(args.old_string || '', 1500)}</pre>
      </Section>
      <Section label={t('chat.tools.newString')}>
        <pre className="tool-viz-code tool-viz-code-new">{truncate(args.new_string || '', 1500)}</pre>
      </Section>
      {status === 'running' ? (
        <Section label={t('chat.tools.status')}>
          <div className="tool-viz-running-hint">
            <span className="tool-viz-running-dot" />
            {t('chat.tools.processing')}
          </div>
        </Section>
      ) : error ? (
        <ErrorBlock message={error} />
      ) : (
        result?.ok && (
          <Section label={t('chat.tools.status')}>
            <div className="tool-viz-success">
              {t('chat.tools.completed')}
              {replacements > 1 && ` · ${replacements}×`}
              {showDiffBadge && (
                <span className="tool-viz-diff-badge">
                  {linesAdded > 0 && (
                    <span className="tool-viz-diff-add">+{linesAdded}</span>
                  )}
                  {linesRemoved > 0 && (
                    <span className="tool-viz-diff-del">−{linesRemoved}</span>
                  )}
                  {typeof totalLines === 'number' && (
                    <span className="tool-viz-diff-total">{t('chat.tools.totalLines', { n: totalLines })}</span>
                  )}
                </span>
              )}
            </div>
          </Section>
        )
      )}
    </div>
  );
}

// update_todo_list — pretty checklist
function TodoListViz({ call }) {
  const { t } = useI18n();
  const { args = {}, result = {} } = call;
  const items = Array.isArray(args.items) ? args.items : [];
  const STATUS_MAP = {
    pending: { icon: '○', label: t('chat.tools.todoPending'), className: 'is-pending' },
    in_progress: { icon: '◐', label: t('chat.tools.todoInProgress'), className: 'is-active' },
    completed: { icon: '●', label: t('chat.tools.todoCompleted'), className: 'is-done' },
    skipped: { icon: '⊘', label: t('chat.tools.todoSkipped'), className: 'is-skipped' },
    failed: { icon: '✗', label: t('chat.tools.todoFailed'), className: 'is-failed' },
  };
  return (
    <div className="tool-viz-todos">
      <Section label={`${t('chat.tools.todo')} (${items.length})`}>
        <ul className="tool-viz-todo-list">
          {items.map((it, i) => {
            const meta = STATUS_MAP[it.status] || STATUS_MAP.pending;
            return (
              <li key={it.id || i} className={`tool-viz-todo ${meta.className}`}>
                <span className="tool-viz-todo-icon">{meta.icon}</span>
                <span className="tool-viz-todo-text">{it.content || it.text || t('chat.tools.unnamed')}</span>
                <span className="tool-viz-todo-status">{meta.label}</span>
              </li>
            );
          })}
        </ul>
      </Section>
      {result?.error && <ErrorBlock message={result.error} />}
    </div>
  );
}

// create_artifact
function CreateArtifactViz({ call }) {
  const { t } = useI18n();
  const { args = {}, result = {} } = call;
  const { name, type, content } = args;
  return (
    <div className="tool-viz-artifact">
      <Section label={t('chat.tools.artifactName')}>
        <div className="tool-viz-title">{name || t('chat.tools.unnamed')}</div>
        {type && <span className="tool-viz-badge">{type}</span>}
      </Section>
      {content && (
        <Section label={t('chat.tools.content')}>
          <pre className="tool-viz-code">{truncate(content, 3000)}</pre>
        </Section>
      )}
      {result?.error && <ErrorBlock message={result.error} />}
    </div>
  );
}

// add_reference / read_reference
function ReferenceViz({ call }) {
  const { t } = useI18n();
  const { name, args = {}, result = {} } = call;
  const title = args.title || result?.title;
  const content = args.content || result?.content;
  const refId = args.reference_id || result?.reference_id;
  return (
    <div className="tool-viz-reference">
      {name === 'read_reference' && refId && (
        <Section label={t('chat.tools.referenceId')}>
          <InlineCode>{refId}</InlineCode>
        </Section>
      )}
      {title && (
        <Section label={t('chat.tools.title')}>
          <div className="tool-viz-title">{title}</div>
        </Section>
      )}
      {content && (
        <Section label={t('chat.tools.content')}>
          <div className="tool-viz-markdown">
            <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MARKDOWN_COMPONENTS}>{truncate(content, 3000)}</ReactMarkdown>
          </div>
        </Section>
      )}
      {result?.error && <ErrorBlock message={result.error} />}
    </div>
  );
}

// Fallback: generic key/value view for tools we don't special-case.
function GenericViz({ call }) {
  const { t } = useI18n();
  const { args = {}, result, status } = call;
  return (
    <div className="tool-viz-generic">
      {Object.keys(args).length > 0 && (
        <Section label={t('chat.tools.args')}>
          <dl className="tool-viz-kv">
            {Object.entries(args).map(([k, v]) => (
              <div key={k} className="tool-viz-kv-row">
                <dt>{k}</dt>
                <dd>{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      {status === 'running' ? (
        <Section label={t('chat.tools.status')}>
          <div className="tool-viz-running-hint">
            <span className="tool-viz-running-dot" />
            {t('chat.tools.running')}
          </div>
        </Section>
      ) : result && (
        result.error ? (
          <ErrorBlock message={result.error} />
        ) : (
          <Section label={t('chat.tools.result')}>
            {typeof result === 'string' ? (
              <pre className="tool-viz-code">{result}</pre>
            ) : (
              <dl className="tool-viz-kv">
                {Object.entries(result).map(([k, v]) => (
                  <div key={k} className="tool-viz-kv-row">
                    <dt>{k}</dt>
                    <dd>{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Section>
        )
      )}
    </div>
  );
}

// execute_python — stdout + output files + inline images
function ExecutePythonViz({ call }) {
  const { args, result, status } = call;
  const { t } = useI18n();
  const script = typeof args?.script === 'string' ? args.script : '';
  const packages = Array.isArray(args?.packages) && args.packages.length > 0
    ? args.packages.join(', ') : null;

  return (
    <div>
      {/* Script preview */}
      <Section label={t('chat.tools.python.script')}>
        <pre className="tool-viz-code" style={{ maxHeight: 200, overflowY: 'auto' }}>
          {truncate(script, 1000)}
        </pre>
      </Section>

      {packages && (
        <Section label={t('chat.tools.python.packages')}>
          <span className="tool-viz-inline-code">{packages}</span>
        </Section>
      )}

      {/* Running state */}
      {status === 'running' && (
        <Section label={t('chat.tools.running')}>
          <div className="tool-viz-running">
            <span className="tool-viz-running-dot" />
            {t('chat.tools.running')}
          </div>
        </Section>
      )}

      {/* Results */}
      {result && (
        result.error ? (
          <ErrorBlock message={result.error} />
        ) : (
          <>
            {/* stdout */}
            {result.stdout && (
              <Section label={t('chat.tools.python.output')}>
                <pre className="tool-viz-code" style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {truncate(result.stdout, 4000)}
                </pre>
              </Section>
            )}

            {/* Images */}
            {Array.isArray(result.images) && result.images.length > 0 && (
              <Section label={t('chat.tools.python.images')}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {result.images.map((img, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <img
                        src={`data:${img.mime};base64,${img.data}`}
                        alt={img.filename}
                        style={{
                          maxWidth: '100%',
                          maxHeight: 320,
                          borderRadius: 8,
                          border: '1px solid var(--border-secondary)',
                          objectFit: 'contain',
                          background: 'var(--bg-primary)',
                        }}
                      />
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{img.filename}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Output text files */}
            {Array.isArray(result.output_files) && result.output_files.length > 0 && (
              <Section label={t('chat.tools.python.files')}>
                {result.output_files.map((f, i) => (
                  <details key={i} style={{ marginBottom: 6 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--arctic-blue)', fontFamily: 'var(--font-mono)' }}>
                      {f.filename}
                    </summary>
                    <pre className="tool-viz-code" style={{ marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
                      {truncate(f.content, 2000)}
                    </pre>
                  </details>
                ))}
              </Section>
            )}

            {/* Exit code badge */}
            {result.exit_code !== undefined && (
              <div style={{ marginTop: 4, fontSize: 11, color: result.exit_code === 0 ? 'var(--status-success)' : 'var(--status-error)' }}>
                {t('chat.tools.python.exitCode')}: {result.exit_code}
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Dispatcher
// ────────────────────────────────────────────────────────────────

const VISUALIZERS = {
  run_command: RunCommandViz,
  fetch_url: FetchUrlViz,
  web_search: WebSearchViz,
  read_file: FileOpViz,
  create_file: FileOpViz,
  edit_file: FileOpViz,
  delete_file: FileOpViz,
  search_workspace: SearchWorkspaceViz,
  grep_workspace: SearchWorkspaceViz,
  fast_context: SearchWorkspaceViz,
  // Phase 2 file system tools
  list_directory: ListDirectoryViz,
  find_files: SearchWorkspaceViz, // result has matches[{path,size}] — same shape
  grep_files: SearchWorkspaceViz, // result has matches[{path,line,text}]
  move_file: MoveCopyViz,
  copy_file: MoveCopyViz,
  execute_python: ExecutePythonViz,
  search_replace: SearchReplaceViz,
  update_todo_list: TodoListViz,
  create_artifact: CreateArtifactViz,
  add_reference: ReferenceViz,
  read_reference: ReferenceViz,
};

export function ToolCallVisualizer({ call }) {
  const Viz = VISUALIZERS[call.name] || GenericViz;
  return (
    <div className="tool-viz">
      <Viz call={call} />
      <RawDataDisclosure args={call.args} result={call.result} />
    </div>
  );
}
