const { execFile } = require("node:child_process");
const { resolveCodex } = require("./connection.cjs");
const execute = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) =>
      error
        ? reject(Object.assign(error, { stdout, stderr }))
        : resolve({ stdout, stderr }),
    );
  });

// Explicit, read-only local CLI checks. Never start a model or expose login output.
async function check(config, home, run = execute) {
  const options = {
    timeout: 4000,
    maxBuffer: 16384,
    windowsHide: true,
    env: { ...process.env, CODEX_HOME: home },
  };
  const file = resolveCodex(config.codex);
  const result = {
    checkedAt: new Date().toISOString(),
    available: false,
    version: "",
    login: "unknown",
    error: "",
  };
  try {
    const { stdout } = await run(file, ["--version"], options);
    result.available = true;
    result.version = /codex(?:-cli)?\s+(\d[\w.+-]*)/i.exec(stdout)?.[1] || "";
  } catch (error) {
    result.error =
      error.code === "ENOENT" ? "CODEX_NOT_FOUND" : "CODEX_CHECK_FAILED";
    return result;
  }
  try {
    const { stdout, stderr } = await run(file, ["login", "status"], options);
    const text = String(stdout || "") + String(stderr || "");
    result.login = /not logged in/i.test(text)
      ? "signed_out"
      : /logged in/i.test(text)
        ? "signed_in"
        : "unknown";
  } catch (error) {
    result.login = /not logged in/i.test(
      String(error.stderr || "") + String(error.stdout || ""),
    )
      ? "signed_out"
      : "unknown";
  }
  return result;
}
module.exports = { check };
