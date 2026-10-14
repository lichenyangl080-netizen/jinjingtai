const fs = require("node:fs");
const path = require("node:path");

// Only disposable per-process diagnostics are eligible. Stages, events, jobs,
// backups and human authority never enter this retention policy.
function pruneDiagnostics(home, keep = 12) {
  const directory = path.join(home, "diagnostics");
  if (!fs.existsSync(directory)) return;
  const realHome = fs.realpathSync.native(home);
  const realDirectory = fs.realpathSync.native(directory);
  if (path.dirname(realDirectory).toLowerCase() !== realHome.toLowerCase())
    throw Error("DIAGNOSTIC_PATH_UNSAFE");
  const groups = new Map();
  for (const name of fs.readdirSync(directory)) {
    const match = /^(desktop-start|desktop-loaded|mcp-start)-\d+\.json$/.exec(
      name,
    );
    if (!match) continue;
    const file = path.join(directory, name),
      stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    const group = groups.get(match[1]) || [];
    group.push({ file, at: stat.mtimeMs });
    groups.set(match[1], group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => b.at - a.at || b.file.localeCompare(a.file));
    for (const { file } of group.slice(keep)) {
      try {
        fs.unlinkSync(file);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
}
module.exports = { pruneDiagnostics };
