const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
function write(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + "." + crypto.randomUUID() + ".tmp",
    fd = fs.openSync(temp, "wx");
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, file);
}
function rollback(journal) {
  for (const entry of journal.entries) {
    if (entry.exists) {
      const bytes = Buffer.from(entry.bytes, "base64");
      if (
        !fs.existsSync(entry.file) ||
        !fs.readFileSync(entry.file).equals(bytes)
      )
        write(entry.file, bytes);
    } else if (fs.existsSync(entry.file)) fs.unlinkSync(entry.file);
  }
}
function recoverUnlocked(file) {
  if (!fs.existsSync(file)) return;
  const journal = JSON.parse(fs.readFileSync(file, "utf8"));
  if (
    journal.state === "pending" &&
    journal.pid &&
    journal.pid !== process.pid
  ) {
    try {
      process.kill(journal.pid, 0);
      throw Error("CONNECTION_UPDATE_BUSY");
    } catch (error) {
      if (error.message === "CONNECTION_UPDATE_BUSY" || error.code === "EPERM")
        throw Error("CONNECTION_UPDATE_BUSY");
    }
  }
  if (journal.state === "pending") rollback(journal);
  fs.unlinkSync(file);
}
function runUnlocked(file, files, operation) {
  recoverUnlocked(file);
  const entries = [...new Set(files.map((f) => path.resolve(f)))].map(
    (file) => ({
      file,
      exists: fs.existsSync(file),
      ...(fs.existsSync(file)
        ? { bytes: fs.readFileSync(file).toString("base64") }
        : {}),
    }),
  );
  const journal = { version: 1, state: "pending", pid: process.pid, entries };
  write(file, JSON.stringify(journal));
  try {
    const result = operation();
    write(file, JSON.stringify({ ...journal, state: "committed" }));
    fs.unlinkSync(file);
    return result;
  } catch (error) {
    try {
      rollback(journal);
      fs.unlinkSync(file);
    } catch (rollbackError) {
      throw Error("CONNECTION_ROLLBACK_PENDING", { cause: rollbackError });
    }
    throw error;
  }
}
function locked(file, operation) {
  const lock = file + ".lock";
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  let fd;
  try {
    fd = fs.openSync(lock, "wx");
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const before = fs.statSync(lock);
    let owner;
    try {
      owner = JSON.parse(fs.readFileSync(lock, "utf8"));
    } catch {}
    if (Number.isInteger(owner?.pid) && owner.pid > 0) {
      try {
        process.kill(owner.pid, 0);
        throw Error("CONNECTION_UPDATE_BUSY");
      } catch (e) {
        if (e.code !== "ESRCH") throw Error("CONNECTION_UPDATE_BUSY");
      }
    } else if (Date.now() - before.mtimeMs < 10000) {
      // Another process may still be writing the owner immediately after wx.
      throw Error("CONNECTION_UPDATE_BUSY");
    }
    const current = fs.statSync(lock);
    if (
      current.ino !== before.ino ||
      current.mtimeMs !== before.mtimeMs ||
      current.size !== before.size
    )
      throw Error("CONNECTION_UPDATE_BUSY");
    fs.unlinkSync(lock);
    fd = fs.openSync(lock, "wx");
  }
  try {
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid }));
    fs.fsyncSync(fd);
    return operation();
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}
const run = (file, files, operation) =>
  locked(file, () => runUnlocked(file, files, operation));
const recover = (file) => locked(file, () => recoverUnlocked(file));
module.exports = { run, recover };
