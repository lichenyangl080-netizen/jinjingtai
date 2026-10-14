import fs from "node:fs";
import path from "node:path";
import { root, fingerprint } from "./build-manifest.mjs";
import { prepareApplication } from "./package-files.mjs";
import {
  pruneRelease,
  removeArtifact,
  withPackageLock,
  validateTransaction,
} from "./package-retention.mjs";
const release = path.join(root, "release"),
  target = path.join(release, "进境台"),
  runtime = path.join(root, "node_modules/electron/dist");
function rename(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      if (!["EPERM", "EACCES", "EBUSY"].includes(error.code) || attempt >= 8)
        throw error;
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        Math.min(100 * 2 ** attempt, 1500),
      );
    }
  }
}
const journal = path.join(release, "package-transaction.json");
withPackageLock(release, () => {
  fs.mkdirSync(release, { recursive: true });
  if (fs.existsSync(journal)) {
    const previous = validateTransaction(
      release,
      JSON.parse(fs.readFileSync(journal)),
    );
    if (!fs.existsSync(target) && fs.existsSync(previous.backup))
      fs.renameSync(previous.backup, target);
    if (!fs.existsSync(target)) throw Error("PACKAGE_RECOVERY_REQUIRED");
    fs.unlinkSync(journal);
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "dist/build-manifest.json")),
  );
  if (manifest.fingerprint !== fingerprint())
    throw Error("STALE_BUILD: 请先重新构建");
  const stamp = Date.now(),
    stage = path.join(release, ".stage-" + stamp),
    backup = target + ".previous-" + stamp;
  try {
    fs.cpSync(runtime, stage, { recursive: true });
    fs.renameSync(
      path.join(stage, "electron.exe"),
      path.join(stage, "进境台.exe"),
    );
    prepareApplication(stage);
    for (const relative of [
      "state-location.json",
      "resources/app/.local-data",
      ".local-data",
    ]) {
      const prior = path.join(target, relative);
      if (fs.existsSync(prior))
        fs.cpSync(prior, path.join(stage, relative), { recursive: true });
    }
    if (
      !fs.existsSync(path.join(stage, "state-location.json")) &&
      fs.existsSync(path.join(root, "state-location.json"))
    )
      fs.copyFileSync(
        path.join(root, "state-location.json"),
        path.join(stage, "state-location.json"),
      );
    for (const f of [
      "进境台.exe",
      "resources/app/electron/qa-environment.cjs",
      "resources/app/dist/client/index.html",
      "resources/app/runtime/node.exe.br",
    ])
      if (!fs.existsSync(path.join(stage, f)))
        throw Error("INCOMPLETE_PACKAGE");
  } catch (error) {
    if (fs.existsSync(stage)) removeArtifact(release, stage, true);
    throw error;
  }
  if (manifest.fingerprint !== fingerprint()) {
    removeArtifact(release, stage, true);
    throw Error("SOURCE_CHANGED_DURING_PACKAGE");
  }
  const fd = fs.openSync(journal, "w");
  try {
    fs.writeFileSync(fd, JSON.stringify({ stage, target, backup }));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    if (fs.existsSync(target)) rename(target, backup);
    rename(stage, target);
    fs.unlinkSync(journal);
  } catch (error) {
    if (!fs.existsSync(target) && fs.existsSync(backup)) rename(backup, target);
    throw error;
  }
  console.log("桌面包已完整更新：" + path.join(target, "进境台.exe"));
  console.log(JSON.stringify(pruneRelease(release)));
});
