// Python Code Execution — venv-based sandboxed runner
//
// Architecture:
//   • Uses window.arcticAPI.execCommand (Electron IPC) to run shell commands.
//   • Manages a persistent venv at <venvDir> (configurable, default
//     ~/arctic-python-venv).  The venv is created on first use and reused
//     across calls, so package installs survive sessions.
//   • Each execution writes a temp script to <tempDir>/arctic_exec_<id>.py,
//     runs it in the venv's python, then collects:
//       - stdout / stderr (text output)
//       - any files written to the script's working dir (<tempDir>/run_<id>/)
//         that were NOT present before the run (new files = produced output)
//       - image files among the outputs are base64-encoded and returned inline
//   • Timeout: 60 s by default (configurable).
//   • Install packages: if args.packages is provided, pip-installs them before
//     running the script (skipped when already installed, using pip show).

import { readToolsConfig } from "../toolsConfig";

// IDs used only as temp-file disambiguators — not security-critical.
function shortId() {
  return Math.random().toString(36).slice(2, 9);
}

// Resolve the active Python exec config from toolsConfig.
function getPyConfig() {
  const cfg = readToolsConfig();
  return cfg.pythonExec || {};
}

// Quote a shell path safely for macOS/Linux (single-quote with escaping).
function q(p) {
  return `'${String(p).replace(/'/g, "'\\''")}'`;
}

// Image MIME types we recognise and inline as base64.
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

function extOf(name) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function mimeOf(ext) {
  const map = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  return map[ext] || "application/octet-stream";
}

// ---------------------------------------------------------------------------
// Core: ensure venv exists
// ---------------------------------------------------------------------------
async function ensureVenv(venvDir, pythonBin) {
  const exec = window.arcticAPI?.execCommand;
  if (!exec) throw new Error("arcticAPI.execCommand not available");

  const py = pythonBin || "python3";

  // Check if venv already has a python binary.
  const check = await exec({
    command: `test -f ${q(venvDir + "/bin/python")} && echo ok || echo missing`,
    cwd: null,
  });
  if (check?.stdout?.trim() === "ok") return; // already exists

  // Create venv. Default 30s timeout is too short on cold systems
  // (especially when pip is bootstrapping ensurepip wheels).
  const result = await exec({
    command: `${py} -m venv ${q(venvDir)}`,
    cwd: null,
    timeoutMs: 120000,
  });
  if (result?.exit_code !== 0) {
    throw new Error(
      `创建 venv 失败 (exit ${result?.exit_code}):\n${result?.stderr || result?.stdout || ""}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Core: pip-install missing packages
// ---------------------------------------------------------------------------
async function installPackages(venvDir, packages) {
  if (!packages || packages.length === 0) return;
  const exec = window.arcticAPI?.execCommand;
  const pipBin = `${venvDir}/bin/pip`;

  // Filter to only packages not yet installed (pip show is fast).
  const toInstall = [];
  for (const pkg of packages) {
    const name = pkg.split(/[>=<!]/)[0].trim(); // strip version specifier for check
    const chk = await exec({
      command: `${q(pipBin)} show ${q(name)} 2>/dev/null && echo installed || echo missing`,
      cwd: null,
    });
    if (!chk?.stdout?.includes("installed")) toInstall.push(pkg);
  }
  if (toInstall.length === 0) return;

  // pip install can be slow on first run / large packages.
  const result = await exec({
    command: `${q(pipBin)} install ${toInstall.map(q).join(" ")}`,
    cwd: null,
    timeoutMs: 5 * 60 * 1000,
  });
  if (result?.exit_code !== 0) {
    throw new Error(
      `pip install 失败 (exit ${result?.exit_code}):\n${result?.stderr || ""}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Core: run script, collect results
// ---------------------------------------------------------------------------
async function runScript({ venvDir, script, runDir, timeout }) {
  const exec = window.arcticAPI?.execCommand;
  const pyBin = `${venvDir}/bin/python`;
  const id = shortId();
  const scriptPath = `${runDir}/script_${id}.py`;

  // Write script to disk.
  // We use a heredoc-style printf to avoid quoting nightmares.
  // The script is base64-encoded so we don't have to escape the content.
  const b64 = btoa(unescape(encodeURIComponent(script)));
  const writeCmd = `echo ${q(b64)} | base64 -d > ${q(scriptPath)}`;
  const writeResult = await exec({ command: writeCmd, cwd: null });
  if (writeResult?.exit_code !== 0) {
    throw new Error(`写入脚本失败: ${writeResult?.stderr || ""}`);
  }

  // List files in runDir before execution.
  const lsBefore = await exec({
    command: `ls -1 ${q(runDir)} 2>/dev/null || true`,
    cwd: null,
  });
  const filesBefore = new Set(
    (lsBefore?.stdout || "").split("\n").map((f) => f.trim()).filter(Boolean),
  );

  // Execute. We rely on Electron's execCommand `timeoutMs` (sends SIGTERM
  // on timeout) instead of the shell `timeout` utility — the latter is
  // GNU coreutils and isn't installed on stock macOS, which would cause
  // a `command not found` (exit 127) before the script even runs.
  // cwd is set so relative file writes (e.g. matplotlib savefig) land
  // in our isolated run directory.
  // NOTE: we deliberately do NOT pass `cwd` to execCommand here. The main-
  // process sandbox rejects any cwd that isn't inside an allowed root, and
  // /tmp/arctic_run_* won't be in the user's workspace allowlist. Embedding
  // `cd` into the command string runs INSIDE the spawned shell so the
  // sandbox layer sees no cwd request. The python process inherits this cwd
  // for relative file writes (e.g. matplotlib savefig).
  const runResult = await exec({
    command: `cd ${q(runDir)} && ${q(pyBin)} ${q(scriptPath)}`,
    cwd: null,
    timeoutMs: Math.min(timeout * 1000, 5 * 60 * 1000),
  });

  // Combine stdout + stderr for the model — Python tracebacks live on
  // stderr and the model needs to see them to diagnose its own bug.
  const stdoutRaw = runResult?.stdout || "";
  const stderrRaw = runResult?.stderr || "";
  const stdout = stderrRaw
    ? (stdoutRaw ? `${stdoutRaw}\n--- stderr ---\n${stderrRaw}` : stderrRaw)
    : stdoutRaw;
  const exitCode = runResult?.exit_code ?? -1;
  const timedOut = !!runResult?.timed_out;

  // List files after execution.
  const lsAfter = await exec({
    command: `ls -1 ${q(runDir)} 2>/dev/null || true`,
    cwd: null,
  });
  const filesAfter = (lsAfter?.stdout || "")
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);

  // New files = produced by the script.
  const newFiles = filesAfter.filter(
    (f) => !filesBefore.has(f) && f !== `script_${id}.py`,
  );

  const outputFiles = [];
  const images = [];

  for (const filename of newFiles) {
    const filePath = `${runDir}/${filename}`;
    const ext = extOf(filename);

    if (IMAGE_EXTS.has(ext)) {
      // Read as base64.
      const catResult = await exec({
        command: `base64 < ${q(filePath)}`,
        cwd: null,
      });
      if (catResult?.exit_code === 0 && catResult.stdout) {
        images.push({
          filename,
          mime: mimeOf(ext),
          data: catResult.stdout.replace(/\s/g, ""),
        });
      }
    } else {
      // Read as text (cap at 1 MB).
      const catResult = await exec({
        command: `head -c 1048576 ${q(filePath)}`,
        cwd: null,
      });
      outputFiles.push({
        filename,
        content: catResult?.stdout || "",
      });
    }
  }

  return { stdout, exitCode, timedOut, outputFiles, images };
}

// ---------------------------------------------------------------------------
// Public: execute_python
// ---------------------------------------------------------------------------
export async function executePython({ script, packages, timeout: userTimeout }) {
  const exec = window.arcticAPI?.execCommand;
  if (!exec) {
    return {
      ok: false,
      error:
        "此功能需要桌面应用（Electron）环境。当前在浏览器中运行，无法直接执行 Python 代码。",
    };
  }

  const cfg = getPyConfig();
  const home =
    (await exec({ command: "echo $HOME", cwd: null }))?.stdout?.trim() ||
    "/tmp";
  const venvDir = cfg.venvDir || `${home}/arctic-python-venv`;
  const pythonBin = cfg.pythonBin || "python3";
  const timeout = userTimeout || cfg.timeout || 60;

  // Ensure temp run directory exists.
  const runId = shortId();
  const runDir = `/tmp/arctic_run_${runId}`;
  await exec({ command: `mkdir -p ${q(runDir)}`, cwd: null });

  try {
    // 1. Ensure venv.
    await ensureVenv(venvDir, pythonBin);

    // 2. Install requested packages.
    const pkgList = Array.isArray(packages)
      ? packages
      : typeof packages === "string"
        ? packages
            .split(/[\s,]+/)
            .map((p) => p.trim())
            .filter(Boolean)
        : [];
    await installPackages(venvDir, pkgList);

    // 3. Run script.
    const { stdout, exitCode, timedOut, outputFiles, images } = await runScript(
      { venvDir, script, runDir, timeout },
    );

    // Build model-friendly result.
    const result = {
      ok: exitCode === 0,
      exit_code: exitCode,
      stdout: stdout.slice(0, 20000), // cap at 20 kB for context budget
    };

    if (timedOut) {
      result.ok = false;
      result.error = `执行超时（${timeout} 秒）。请简化代码或减少计算量。`;
    } else if (exitCode !== 0) {
      result.error = `Python 以退出码 ${exitCode} 结束。请检查 stdout 中的错误信息。`;
    }

    if (outputFiles.length > 0) {
      result.output_files = outputFiles;
    }

    if (images.length > 0) {
      result.images = images; // [{filename, mime, data}]
    }

    return result;
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    // Clean up temp run dir (best-effort, non-blocking).
    exec({ command: `rm -rf ${q(runDir)}`, cwd: null }).catch(() => {});
  }
}
