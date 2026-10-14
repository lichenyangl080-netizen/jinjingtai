import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export function fingerprint(directory = root) {
  const hash = crypto.createHash("sha256");
  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const f = path.join(dir, name);
      if (fs.statSync(f).isDirectory()) walk(f);
      else {
        hash.update(path.relative(directory, f) + "\0");
        hash.update(
          crypto.createHash("sha256").update(fs.readFileSync(f)).digest(),
        );
      }
    }
  }
  for (const n of [
    "src",
    "electron",
    "integration",
    "public",
    "scripts",
    "docs",
  ])
    walk(path.join(directory, n));
  for (const n of [
    "package.json",
    "package-lock.json",
    "vite.config.mjs",
    "tsconfig.json",
    "index.html",
    "THIRD_PARTY_NOTICES.md",
    "LICENSE",
  ])
    if (fs.existsSync(path.join(directory, n))) {
      hash.update(n + "\0");
      hash.update(
        crypto
          .createHash("sha256")
          .update(fs.readFileSync(path.join(directory, n)))
          .digest(),
      );
    }
  return hash.digest("hex");
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  fs.writeFileSync(
    path.join(root, "dist", "build-manifest.json"),
    JSON.stringify({
      fingerprint: fingerprint(),
      builtAt: new Date().toISOString(),
    }),
  );
}
