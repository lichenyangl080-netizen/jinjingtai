// A bounded non-AI watchdog survives an unexpected Electron exit.
const S = require("./store.cjs"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process"),
  { validMetadata } = require("./metadata-schema.cjs");

function ownership(pid, id) {
  if (process.platform !== "win32")
    return { state: "unknown", error: "UNSUPPORTED_PLATFORM" };
  try {
    const command = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`,
      ],
      { encoding: "utf8", windowsHide: true, timeout: 5000 },
    );
    return {
      state:
        command.includes(id) &&
        command.includes("--ephemeral") &&
        command.includes("codex")
          ? "owned"
          : "other",
    };
  } catch (error) {
    return { state: "unknown", error: error.code || "PROCESS_QUERY_FAILED" };
  }
}

function run(file, pid) {
  const job = S.read(file, null);
  const deadline = Date.parse(job?.startedAt) + 240000;
  if (
    !validMetadata("jobs", job, path.basename(file)) ||
    job.state !== "running" ||
    !Number.isInteger(pid) ||
    pid < 1 ||
    job.pid !== pid ||
    !Number.isFinite(deadline)
  )
    return process.exit(1);
  let attempts = 0,
    terminationRequested = false,
    verificationDeadline,
    queryError;
  function finish(error) {
    clearInterval(timer);
    const current = S.read(file, null);
    if (
      current?.id === job.id &&
      current.pid === pid &&
      current.state === "running"
    )
      return require("./job-state.cjs")
        .finishEventually(
          file,
          {
            state: "failed",
            error,
            watchdog: { attempts, ...(queryError ? { queryError } : {}) },
            unprocessed: current.materials.map((i) => i.id),
          },
          pid,
        )
        .then(
          () => process.exit(0),
          () => process.exit(1),
        );
    process.exit(0);
  }
  const timer = setInterval(() => {
    const current = S.read(file, null);
    if (
      current?.id !== job.id ||
      current.pid !== pid ||
      current.state !== "running"
    ) {
      clearInterval(timer);
      return process.exit(0);
    }
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") {
        if (terminationRequested) return finish("TIMEOUT");
        clearInterval(timer);
        return process.exit(0);
      }
      queryError = error.code || "PROCESS_QUERY_FAILED";
      return finish("WATCHDOG_PROCESS_UNVERIFIED");
    }
    if (Date.now() < deadline) return;
    // Start the bounded query budget when this watcher can actually run,
    // including after Windows resumes from sleep past the job deadline.
    verificationDeadline ??= Date.now() + 20000;
    if (attempts >= 3 || Date.now() >= verificationDeadline)
      return finish(
        terminationRequested
          ? "WATCHDOG_TERMINATION_FAILED"
          : "WATCHDOG_PROCESS_UNVERIFIED",
      );
    attempts++;
    const result = ownership(pid, job.id);
    if (result.state === "other") return finish("WATCHDOG_PROCESS_MISMATCH");
    if (result.state === "unknown") {
      queryError = result.error;
      return;
    }
    try {
      process.kill(pid);
      terminationRequested = true;
    } catch (error) {
      if (error.code === "ESRCH") return finish("TIMEOUT");
      queryError = error.code || "PROCESS_TERMINATION_FAILED";
      return finish("WATCHDOG_TERMINATION_FAILED");
    }
  }, 1000);
}

if (require.main === module) run(process.argv[2], Number(process.argv[3]));
