import { useState, useEffect, useRef } from 'react';
import { useI18n } from '../../hooks/useI18n';
import './CommandExecuteModal.css';

// Dangerous patterns trigger a red warning banner. Heuristic only — the
// final decision rests with the user (who has to paste the output back
// anyway). Keep this conservative; false-positives cost less than
// false-negatives for destructive operations.
const DANGEROUS_PATTERNS = [
  /\brm\s+-[rf]+/i,
  /\bsudo\b/i,
  /\b(curl|wget)\b.*\|\s*(sh|bash|zsh)/i,
  /\bchmod\s+[0-7]{3,}/i,
  /\bmkfs\b/,
  /\bdd\s+if=/i,
  />\s*\/dev\/[sh]d[a-z]/i,
  /\bformat\b.*[cC]:/,
  /:\(\)\{.*:\|:&\};:/, // fork bomb
];

function detectRisk(command) {
  for (const re of DANGEROUS_PATTERNS) {
    if (re.test(command)) return true;
  }
  return false;
}

const IconTerminal = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

const IconCopy = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconWarning = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

// Props:
//   request   { command, cwd, explanation } | null  (null = closed)
//   onSubmit  ({ stdout, stderr, exit_code }) => void
//   onDeny    () => void   — user refused; resolves tool with ok:false
//
// The outer component is just a gate: it remounts `CommandExecuteBody`
// whenever a new request arrives (via the `key` prop) so the body's local
// state always starts fresh — avoiding the "setState in useEffect"
// anti-pattern that ESLint rightfully dislikes.
function CommandExecuteModal({ request, onSubmit, onDeny }) {
  if (!request) return null;
  return (
    <CommandExecuteBody
      // key depends on the command + cwd so distinct requests produce a
      // brand-new body with fresh stdout / exitCode / copied state.
      key={`${request.command}::${request.cwd || ''}`}
      request={request}
      onSubmit={onSubmit}
      onDeny={onDeny}
    />
  );
}

function CommandExecuteBody({ request, onSubmit, onDeny }) {
  const { t } = useI18n();
  const [stdout, setStdout] = useState('');
  const [exitCode, setExitCode] = useState('0');
  const [copied, setCopied] = useState(false);
  // Native-run state: transitions 'idle' → 'running' → (closes) when the
  // Electron IPC exec path is invoked. Disables the manual fields so the
  // user can't half-submit during a native run.
  const [runState, setRunState] = useState('idle');
  const [runError, setRunError] = useState('');
  const textareaRef = useRef(null);

  // Detect whether we're in an Electron shell with IPC native exec.
  const nativeAvailable =
    typeof window !== 'undefined' && !!window.arcticAPI?.execCommand;

  // Focus the output textarea on mount.
  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Esc = deny (safer default than accidentally submitting empty output).
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (runState !== 'running') onDeny?.();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onDeny, runState]);

  const { command, cwd, explanation, nativeOnly, outsideWorkspace, workspaceRoot } = request;
  // `nativeOnly` (set by the runner when in Electron + risky command)
  // hides the copy-paste fallback entirely — user only sees "允许运行"
  // or "拒绝". Non-Electron paths keep the legacy paste-back UI.
  const confirmOnlyMode = !!nativeOnly && nativeAvailable;
  const risky = detectRisk(command);

  // Run the command natively via Electron IPC. Result is returned straight
  // to the Agent without the paste-back step.
  const handleNativeRun = async () => {
    if (!nativeAvailable || runState === 'running') return;
    setRunState('running');
    setRunError('');
    try {
      // If this command's cwd is outside the registered workspace, the
      // user just approved the exception by clicking "允许运行". Tell the
      // main-process sandbox to add a session grant for that cwd BEFORE
      // we kick off the actual exec — otherwise the sandbox would reject
      // it with access_denied even though the user said yes.
      if (outsideWorkspace && cwd && window.arcticAPI?.addAllowedRoot) {
        try { await window.arcticAPI.addAllowedRoot(cwd); } catch { /* noop */ }
      }
      const result = await window.arcticAPI.execCommand({ command, cwd });
      // Hand the raw exec result to onSubmit. The Agent receives the full
      // { ok, stdout, stderr, exit_code } payload.
      onSubmit?.({
        ok: result.ok,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exit_code: typeof result.exit_code === 'number' ? result.exit_code : (result.ok ? 0 : 1),
        timed_out: !!result.timed_out,
        native: true,
      });
    } catch (err) {
      setRunState('idle');
      setRunError(err?.message || String(err));
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select via a temporary textarea (rare in modern browsers).
      const el = document.createElement('textarea');
      el.value = command;
      document.body.appendChild(el);
      el.select();
      try { document.execCommand('copy'); setCopied(true); } catch { /* noop */ }
      document.body.removeChild(el);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleSubmit = () => {
    const parsedExit = Number.parseInt(exitCode, 10);
    const code = Number.isFinite(parsedExit) ? parsedExit : 0;
    onSubmit?.({
      ok: code === 0,
      stdout,
      stderr: '',
      exit_code: code,
    });
  };

  return (
    <div className="cmdexec-overlay" onClick={onDeny}>
      <div className="cmdexec-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cmdexec-header">
          <span className="cmdexec-header-icon"><IconTerminal /></span>
          <div className="cmdexec-header-text">
            <div className="cmdexec-title">
              {confirmOnlyMode
                ? (risky
                    ? t('cmdExec.riskAuthRequired')
                    : outsideWorkspace
                      ? t('cmdExec.outsideAuthRequired')
                      : t('cmdExec.riskAuthRequired'))
                : t('cmdExec.agentRequest')}
            </div>
            <div className="cmdexec-subtitle">
              {confirmOnlyMode
                ? (risky
                    ? t('cmdExec.riskAuthSubtitle')
                    : outsideWorkspace
                      ? t('cmdExec.outsideAuthSubtitle')
                      : t('cmdExec.riskAuthSubtitle'))
                : nativeAvailable
                  ? t('cmdExec.nativeAvailableSubtitle')
                  : t('cmdExec.browserNoExecSubtitle')}
            </div>
          </div>
        </div>

        {risky && (
          <div className="cmdexec-warning">
            <IconWarning />
            <span>
              <strong>⚠ {t('cmdExec.riskWarning')}</strong>
              {t('cmdExec.riskHint')}
            </span>
          </div>
        )}

        {outsideWorkspace && (
          <div className="cmdexec-warning cmdexec-warning-outside">
            <IconWarning />
            <span>
              <strong>⚠ {t('cmdExec.outsideWorkspaceTitle')}</strong>
              {t('cmdExec.outsideWorkspaceDesc', { workspace: workspaceRoot || '—', cwd: cwd || '—' })}
            </span>
          </div>
        )}

        {explanation && (
          <div className="cmdexec-section">
            <div className="cmdexec-section-label">{t('cmdExec.purpose')}</div>
            <div className="cmdexec-explanation">{explanation}</div>
          </div>
        )}

        <div className="cmdexec-section">
          <div className="cmdexec-section-label">
            {t('cmdExec.command')}
            {cwd && <span className="cmdexec-cwd">  (cwd: <code>{cwd}</code>)</span>}
          </div>
          <div className="cmdexec-command-box">
            <code>{command}</code>
            <button
              className={`cmdexec-copy-btn ${copied ? 'copied' : ''}`}
              onClick={handleCopy}
              title={t('cmdExec.copyToClipboard')}
              disabled={runState === 'running'}
            >
              {copied ? <IconCheck /> : <IconCopy />}
              <span>{copied ? t('cmdExec.copied') : t('cmdExec.copy')}</span>
            </button>
          </div>
        </div>

        {/* Running indicator (native mode only). While the command is
            executing, the body is locked and we show a subtle pulsing
            status line instead of the paste-back fields. */}
        {runState === 'running' && (
          <div className="cmdexec-running">
            <span className="cmdexec-running-spinner" />
            <span>{t('cmdExec.running')}</span>
          </div>
        )}

        {runError && (
          <div className="cmdexec-warning cmdexec-warning-soft">
            <IconWarning />
            <span>{t('cmdExec.runFailed', { error: runError })}</span>
          </div>
        )}

        {/* Manual paste-back section. Hidden entirely in confirm-only
            mode (Electron + risky command) since the user only needs to
            approve, not paste back. Still shown when Electron isn't
            available, or as an optional fallback next to the native
            button for non-risky cases. */}
        {!confirmOnlyMode && (!nativeAvailable || runState === 'idle') && (
          <FallbackPasteback
            nativeAvailable={nativeAvailable}
            textareaRef={textareaRef}
            stdout={stdout}
            setStdout={setStdout}
            exitCode={exitCode}
            setExitCode={setExitCode}
          />
        )}

        <div className="cmdexec-actions">
          <button
            className="cmdexec-btn cmdexec-btn-deny"
            onClick={onDeny}
            disabled={runState === 'running'}
          >
            {runState === 'running' ? t('cmdExec.pleaseWait') : t('cmdExec.deny')}
          </button>
          <div className="cmdexec-actions-right">
            {/* Manual-submit button: suppressed in confirm-only mode. */}
            {!confirmOnlyMode && (!nativeAvailable || runState !== 'running') && (
              <button
                className="cmdexec-btn cmdexec-btn-submit-alt"
                onClick={handleSubmit}
                disabled={runState === 'running'}
                title={t('cmdExec.submitOutputTitle')}
              >
                {nativeAvailable ? t('cmdExec.manualSubmit') : t('cmdExec.submitToAgent')}
              </button>
            )}
            {nativeAvailable && (
              <button
                className="cmdexec-btn cmdexec-btn-native"
                onClick={handleNativeRun}
                disabled={runState === 'running'}
              >
                {runState === 'running' ? t('cmdExec.runningButton') : (confirmOnlyMode ? t('cmdExec.allowRun') : t('cmdExec.nativeRun'))}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// The manual "copy command → paste output → submit" fallback. Extracted to
// its own component so the main body stays readable. Kept visible on both
// Electron (as a secondary option) and browser (as the only option).
function FallbackPasteback({
  nativeAvailable,
  textareaRef,
  stdout,
  setStdout,
  exitCode,
  setExitCode,
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="cmdexec-section">
        <div className="cmdexec-section-label">
          {nativeAvailable ? t('cmdExec.pasteOutputAlt') : t('cmdExec.pasteOutput')}
        </div>
        <textarea
          ref={textareaRef}
          className="cmdexec-output"
          value={stdout}
          onChange={(e) => setStdout(e.target.value)}
          placeholder={t('cmdExec.stdoutPlaceholder')}
          rows={nativeAvailable ? 5 : 8}
          spellCheck={false}
        />
      </div>

      <div className="cmdexec-section cmdexec-exit-row">
        <label className="cmdexec-section-label" htmlFor="cmdexec-exit">
          {t('cmdExec.exitCode')}
        </label>
        <input
          id="cmdexec-exit"
          type="number"
          className="cmdexec-exit-input"
          value={exitCode}
          onChange={(e) => setExitCode(e.target.value)}
          placeholder="0"
        />
        <div className="cmdexec-exit-hint">
          {t('cmdExec.exitCodeHint')}
        </div>
      </div>
    </>
  );
}

export default CommandExecuteModal;
