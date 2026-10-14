import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { root, fingerprint } from "./build-manifest.mjs";
const manifest = path.join(root, "dist/build-manifest.json");
const sourceFingerprint = fingerprint();
if (fs.existsSync(manifest)) fs.unlinkSync(manifest);
const result = spawnSync(
  process.execPath,
  [path.join(root, "node_modules/vite/bin/vite.js"), "build"],
  { cwd: root, stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
if (fingerprint() !== sourceFingerprint)
  throw Error("SOURCE_CHANGED_DURING_BUILD");
fs.writeFileSync(
  manifest,
  JSON.stringify({
    fingerprint: sourceFingerprint,
    version: JSON.parse(fs.readFileSync(path.join(root, "package.json")))
      .version,
    builtAt: new Date().toISOString(),
  }),
);
