import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fingerprint, root } from "../scripts/build-manifest.mjs";

test("真实配置、资产、入口、锁文件和打包脚本变化都会使旧构建失效", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-build-inputs-"));
  try {
    for (const name of [
      "src",
      "electron",
      "integration",
      "scripts",
      "public",
      "docs",
    ])
      fs.mkdirSync(path.join(fixture, name));
    const inputs = [
      "vite.config.mjs",
      "public/ink.svg",
      "index.html",
      "package-lock.json",
      "scripts/package-share.mjs",
      "docs/使用说明.md",
    ];
    for (const name of inputs)
      fs.writeFileSync(path.join(fixture, name), "initial");
    for (const name of inputs) {
      const before = fingerprint(fixture);
      fs.appendFileSync(path.join(fixture, name), "changed");
      assert.notEqual(fingerprint(fixture), before, name);
    }
  } finally {
    assert.equal(path.dirname(fixture), path.resolve(os.tmpdir()));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("两种发行包共用版本与仓库内说明，不需要仓库外文件", async () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-package-files-"));
  try {
    for (const name of [
      "scripts",
      "electron",
      "integration",
      "dist/client",
      "docs/licenses",
      "node_modules/react",
      "node_modules/react-dom",
      "node_modules/@phosphor-icons/react",
    ])
      fs.mkdirSync(path.join(fixture, name), { recursive: true });
    for (const name of [
      "build-manifest.mjs",
      "package-files.mjs",
      "package-retention.mjs",
    ])
      fs.copyFileSync(
        path.join(root, "scripts", name),
        path.join(fixture, "scripts", name),
      );
    fs.writeFileSync(
      path.join(fixture, "package.json"),
      JSON.stringify({
        type: "module",
        version: "0.1.1-review",
        license: "MIT",
      }),
    );
    fs.writeFileSync(path.join(fixture, "dist/build-manifest.json"), "{}");
    fs.writeFileSync(path.join(fixture, "docs/使用说明.md"), "isolated guide");
    const nodeLicense = `Node-${process.versions.node}.txt`;
    fs.writeFileSync(
      path.join(fixture, "docs/licenses", nodeLicense),
      "fixture Node license",
    );
    fs.writeFileSync(
      path.join(fixture, "THIRD_PARTY_NOTICES.md"),
      "fixture notices",
    );
    fs.writeFileSync(path.join(fixture, "LICENSE"), "fixture license");
    for (const name of ["react", "react-dom", "@phosphor-icons/react"])
      fs.writeFileSync(
        path.join(fixture, "node_modules", name, "LICENSE"),
        "fixture",
      );
    const { prepareApplication } = await import(
      pathToFileURL(path.join(fixture, "scripts/package-files.mjs"))
    );
    for (const name of ["update", "share"]) {
      const target = path.join(fixture, name);
      prepareApplication(target);
      const pkg = JSON.parse(
        fs.readFileSync(path.join(target, "resources/app/package.json")),
      );
      assert.equal(pkg.version, "0.1.1-review");
      assert.equal(pkg.license, "MIT");
      assert.equal(
        fs.readFileSync(path.join(target, "licenses", nodeLicense), "utf8"),
        "fixture Node license",
      );
      assert.equal(
        fs.readFileSync(path.join(target, "进境台-使用说明.md"), "utf8"),
        "isolated guide",
      );
      assert.equal(
        fs.readFileSync(path.join(target, "LICENSE.jinjingtai"), "utf8"),
        "fixture license",
      );
    }
    fs.unlinkSync(path.join(fixture, "LICENSE"));
    assert.throws(
      () => prepareApplication(path.join(fixture, "missing-app-license")),
      /ENOENT/,
    );
    fs.unlinkSync(path.join(fixture, "docs/licenses", nodeLicense));
    const missingLicenseTarget = path.join(fixture, "missing-node-license");
    assert.throws(
      () => prepareApplication(missingLicenseTarget),
      /NODE_LICENSE_MISSING/,
    );
    assert.equal(fs.existsSync(missingLicenseTarget), false);
  } finally {
    assert.equal(path.dirname(fixture), path.resolve(os.tmpdir()));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
