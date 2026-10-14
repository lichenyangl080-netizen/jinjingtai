import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function directChild(base, value) {
  if (typeof value !== "string") return false;
  try {
    return (
      fs.realpathSync
        .native(path.dirname(path.resolve(value)))
        .toLowerCase() === base.toLowerCase()
    );
  } catch {
    return false;
  }
}

export function validateTransaction(release, transaction) {
  const base = fs.realpathSync.native(release);
  const valid = (value, pattern) =>
    directChild(base, value) &&
    pattern.test(path.basename(value)) &&
    (!fs.existsSync(value) ||
      (fs.lstatSync(value).isDirectory() &&
        !fs.lstatSync(value).isSymbolicLink()));
  if (
    !transaction ||
    !valid(transaction.target, /^进境台$/) ||
    !valid(transaction.stage, /^\.stage-\d+$/) ||
    !valid(transaction.backup, /^进境台\.previous-\d+$/) ||
    path.basename(transaction.stage).slice(7) !==
      path.basename(transaction.backup).split("previous-")[1]
  )
    throw Error("PACKAGE_TRANSACTION_UNSAFE");
  return transaction;
}

function safeArtifact(root, target, owned = false) {
  const base = fs.realpathSync.native(root),
    absolute = path.resolve(target);
  if (!directChild(base, absolute)) throw Error("ARTIFACT_PATH_UNSAFE");
  const stat = fs.lstatSync(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw Error("ARTIFACT_PATH_UNSAFE");
  if (!owned) {
    const application = path.basename(absolute).startsWith("share-")
      ? path.join(absolute, "进境台")
      : absolute;
    let manifest;
    try {
      manifest = JSON.parse(
        fs.readFileSync(
          path.join(application, "resources/app/build-manifest.json"),
          "utf8",
        ),
      );
    } catch {
      throw Error("UNKNOWN_RELEASE_ARTIFACT");
    }
    if (!/^[a-f0-9]{64}$/.test(manifest.fingerprint))
      throw Error("UNKNOWN_RELEASE_ARTIFACT");
  }
  function inspect(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (
        entry.isSymbolicLink() ||
        entry.name === "personal.json" ||
        ["attachments", "stages"].includes(entry.name)
      )
        throw Error("ARTIFACT_CONTAINS_AUTHORITY");
      if (entry.isDirectory()) inspect(path.join(dir, entry.name));
    }
  }
  inspect(absolute);
  return absolute;
}
export function removeArtifact(root, target, owned = false) {
  fs.rmSync(safeArtifact(root, target, owned), { recursive: true });
}

export function pruneQa(qa, keepImages = 20, keepProfiles = 2) {
  if (!fs.existsSync(qa)) return { removed: [], retained: [] };
  const removed = [],
    retained = [],
    images = [],
    profiles = [];
  for (const entry of fs.readdirSync(qa, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const file = path.join(qa, entry.name),
      at = fs.statSync(file).mtimeMs;
    if (
      entry.isFile() &&
      entry.name.endsWith(".png") &&
      !entry.name.endsWith("-final.png")
    )
      images.push({ file, at });
    if (
      entry.isDirectory() &&
      entry.name.endsWith("-profile") &&
      Date.now() - at > 3600000
    )
      profiles.push({ file, at });
  }
  for (const { file } of images.sort((a, b) => b.at - a.at).slice(keepImages)) {
    fs.unlinkSync(file);
    removed.push(path.basename(file));
  }
  for (const { file } of profiles
    .sort((a, b) => b.at - a.at)
    .slice(keepProfiles)) {
    try {
      removeArtifact(qa, file, true);
      removed.push(path.basename(file));
    } catch (error) {
      retained.push({
        name: path.basename(file),
        reason: error.code || error.message,
      });
    }
  }
  return { removed, retained };
}
export function pruneRelease(release, { previous = 0, share = 1 } = {}) {
  if (fs.existsSync(path.join(release, "package-transaction.json")))
    throw Error("PACKAGE_TRANSACTION_ACTIVE");
  const groups = { previous: [], share: [], stage: [] },
    removed = [],
    retained = [];
  for (const name of fs.readdirSync(release)) {
    const group = /^进境台\.previous-\d+$/.test(name)
      ? "previous"
      : /^share-\d{4}-\d{2}-\d{2}T[\d-]+Z$/.test(name)
        ? "share"
        : /^\.stage-\d+$/.test(name)
          ? "stage"
          : null;
    if (group) groups[group].push(path.join(release, name));
  }
  for (const [group, files] of Object.entries(groups)) {
    files.sort((a, b) => b.localeCompare(a));
    const keep =
      group === "previous" ? previous : group === "share" ? share : 0;
    for (const file of files.slice(keep)) {
      try {
        removeArtifact(release, file);
        removed.push(path.basename(file));
      } catch (error) {
        retained.push({
          name: path.basename(file),
          reason: error.code || error.message,
        });
      }
    }
  }
  return { removed, retained };
}

export function trimLocales(target, languages = ["en-US", "zh-CN"]) {
  const directory = path.join(target, "locales");
  if (!fs.existsSync(directory)) return;
  const allowed = new Set(languages.map((language) => language + ".pak"));
  for (const name of fs.readdirSync(directory)) {
    if (!name.endsWith(".pak") || allowed.has(name)) continue;
    const file = path.join(directory, name),
      stat = fs.lstatSync(file);
    if (stat.isFile() && !stat.isSymbolicLink()) fs.unlinkSync(file);
  }
}

// Each contender owns an immutable, uniquely named ticket before inspecting
// other contenders. An overlapping contender must see it and refuse to enter.
// Dead tickets can be removed without ever unlinking a replacement owner's lock.
export function withPackageLock(release, operation) {
  fs.mkdirSync(release, { recursive: true });
  const tickets = path.join(release, ".package-locks");
  fs.mkdirSync(tickets, { recursive: true });
  if (fs.lstatSync(tickets).isSymbolicLink())
    throw Error("ARTIFACT_PATH_UNSAFE");
  const name = `${process.pid}-${crypto.randomUUID()}.lock`,
    file = path.join(tickets, name);
  const fd = fs.openSync(file, "wx");
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if (error.code === "ESRCH") return false;
      throw Error("PACKAGE_BUSY");
    }
  };
  try {
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid }));
    fs.fsyncSync(fd);
    // Old fixed-name locks are read for compatibility, never deleted: their
    // pathname could already refer to a replacement owner. Dead ones are inert.
    const legacy = path.join(release, "package.lock");
    if (fs.existsSync(legacy)) {
      if (fs.lstatSync(legacy).isSymbolicLink())
        throw Error("ARTIFACT_PATH_UNSAFE");
      let owner;
      try {
        owner = JSON.parse(fs.readFileSync(legacy, "utf8"));
      } catch {
        throw Error("PACKAGE_BUSY");
      }
      if (!Number.isSafeInteger(owner.pid) || owner.pid < 1 || alive(owner.pid))
        throw Error("PACKAGE_BUSY");
    }
    for (const other of fs.readdirSync(tickets)) {
      if (other === name) continue;
      const match = /^(\d+)-[a-f0-9-]{36}\.lock$/.exec(other);
      if (
        !match ||
        !Number.isSafeInteger(Number(match[1])) ||
        Number(match[1]) < 1
      )
        throw Error("PACKAGE_BUSY");
      const otherFile = path.join(tickets, other);
      try {
        if (fs.lstatSync(otherFile).isSymbolicLink())
          throw Error("ARTIFACT_PATH_UNSAFE");
        if (alive(Number(match[1]))) throw Error("PACKAGE_BUSY");
        fs.unlinkSync(otherFile);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    return operation();
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(file);
  }
}
