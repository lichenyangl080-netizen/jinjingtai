import fs from "node:fs";
import path from "node:path";
import { root, fingerprint } from "./build-manifest.mjs";
import { prepareApplication } from "./package-files.mjs";
import {
  pruneRelease,
  removeArtifact,
  withPackageLock,
} from "./package-retention.mjs";
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "dist/build-manifest.json")),
);
if (manifest.fingerprint !== fingerprint()) throw Error("STALE_BUILD");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
withPackageLock(path.join(root, "release"), () => {
  const folder = path.join(root, "release", "share-" + stamp),
    target = path.join(folder, "进境台");
  fs.mkdirSync(folder, { recursive: true });
  let count = 0,
    bytes = 0;
  // Start from the original Electron distribution, never an existing user's app.
  try {
    fs.cpSync(path.join(root, "node_modules/electron/dist"), target, {
      recursive: true,
    });
    fs.renameSync(
      path.join(target, "electron.exe"),
      path.join(target, "进境台.exe"),
    );
    prepareApplication(target);
    if (manifest.fingerprint !== fingerprint())
      throw Error("SOURCE_CHANGED_DURING_PACKAGE");
    const forbidden = new Set([
      "state-location.json",
      ".local-data",
      "connection.json",
      "personal.json",
      "auth.json",
      "config.toml",
      "hooks.json",
    ]);
    function inspect(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (forbidden.has(entry.name))
          throw Error("PRIVATE_FILE_IN_SHARE:" + entry.name);
        const f = path.join(dir, entry.name);
        if (entry.isDirectory()) inspect(f);
        else {
          count++;
          bytes += fs.statSync(f).size;
        }
      }
    }
    inspect(target);
    for (const name of [
      "进境台.exe",
      "resources/app/runtime/node.exe.br",
      "resources/app/dist/client/index.html",
    ])
      if (!fs.existsSync(path.join(target, name)))
        throw Error("INCOMPLETE_SHARE");
  } catch (error) {
    removeArtifact(path.join(root, "release"), folder, true);
    throw error;
  }
  const result = {
    folder,
    target,
    files: count,
    bytes,
    noUserState: true,
    noMachineLocator: true,
    builtAt: manifest.builtAt,
  };
  fs.mkdirSync(path.join(root, "qa"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "qa/share-package.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
  console.log(JSON.stringify(pruneRelease(path.join(root, "release"))));
});
