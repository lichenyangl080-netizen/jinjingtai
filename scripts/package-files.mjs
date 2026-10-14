import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { trimLocales } from "./package-retention.mjs";
import { root } from "./build-manifest.mjs";

export function nodeRuntimeLicense(
  directory = root,
  version = process.versions.node,
) {
  const name = `Node-${version}.txt`;
  const source = path.join(directory, "docs", "licenses", name);
  if (!fs.existsSync(source))
    throw Error(`NODE_LICENSE_MISSING: ${version} (${source})`);
  return { name, source };
}

// Both update and share packages use the same application files and metadata.
export function prepareApplication(target) {
  const nodeLicense = nodeRuntimeLicense();
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json")));
  const appDir = path.join(target, "resources/app");
  trimLocales(target);
  fs.mkdirSync(appDir, { recursive: true });
  for (const name of ["electron", "integration", "dist/client"])
    fs.cpSync(path.join(root, name), path.join(appDir, name), {
      recursive: true,
    });
  fs.mkdirSync(path.join(appDir, "runtime"), { recursive: true });
  const node = fs.readFileSync(process.execPath);
  fs.writeFileSync(
    path.join(appDir, "runtime/node.exe.br"),
    zlib.brotliCompressSync(node, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 },
    }),
  );
  fs.writeFileSync(
    path.join(appDir, "runtime/node-runtime.json"),
    JSON.stringify({
      version: process.versions.node,
      size: node.length,
      sha256: crypto.createHash("sha256").update(node).digest("hex"),
    }),
  );
  fs.copyFileSync(
    path.join(root, "dist/build-manifest.json"),
    path.join(appDir, "build-manifest.json"),
  );
  fs.writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify({
      name: "jinjingtai",
      version: pkg.version,
      main: "electron/main.cjs",
      ...(pkg.license ? { license: pkg.license } : {}),
    }),
  );
  for (const [source, name] of [
    ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
    ["docs/使用说明.md", "进境台-使用说明.md"],
    ["LICENSE", "LICENSE.jinjingtai"],
  ]) {
    fs.copyFileSync(path.join(root, source), path.join(target, name));
  }
  fs.mkdirSync(path.join(target, "licenses"), { recursive: true });
  fs.copyFileSync(
    nodeLicense.source,
    path.join(target, "licenses", nodeLicense.name),
  );
  for (const [name, source] of [
    ["React", "react/LICENSE"],
    ["React-DOM", "react-dom/LICENSE"],
    ["Phosphor", "@phosphor-icons/react/LICENSE"],
  ])
    fs.copyFileSync(
      path.join(root, "node_modules", source),
      path.join(target, "licenses", name + ".txt"),
    );
}
