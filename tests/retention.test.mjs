import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";
import {
  pruneRelease,
  removeArtifact,
  withPackageLock,
  trimLocales,
  validateTransaction,
} from "../scripts/package-retention.mjs";
import Retention from "../integration/retention.cjs";

test("双进程恢复死亡凭证时，竞争者不能移除活跃凭证或进入操作", () => {
  const release = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-lock-race-"));
  const directory = path.join(release, ".package-locks");
  fs.mkdirSync(directory);
  const stale = path.join(directory, `2147483647-${crypto.randomUUID()}.lock`);
  assert.throws(
    () => process.kill(2147483647, 0),
    (e) => e.code === "ESRCH",
  );
  fs.writeFileSync(stale, "{}");
  const unlink = fs.unlinkSync;
  let competitor,
    entered = 0;
  const module = pathToFileURL(
    path.resolve("scripts/package-retention.mjs"),
  ).href;
  try {
    fs.unlinkSync = function (file, ...args) {
      if (file === stale) {
        const source = `import {withPackageLock} from ${JSON.stringify(module)};try{withPackageLock(${JSON.stringify(release)},()=>console.log('ENTERED'))}catch(e){console.log(e.message)}`;
        competitor = spawnSync(
          process.execPath,
          ["--input-type=module", "-e", source],
          { encoding: "utf8", windowsHide: true, timeout: 5000 },
        );
      }
      return unlink.call(this, file, ...args);
    };
    withPackageLock(release, () => entered++);
    assert.equal(entered, 1);
    assert.equal(competitor.status, 0);
    assert.equal(competitor.stdout.trim(), "PACKAGE_BUSY");
    assert.deepEqual(fs.readdirSync(directory), []);
    // A legacy dead lock is inert and preserved, not unlinked by new owners.
    const legacy = path.join(release, "package.lock");
    fs.writeFileSync(legacy, JSON.stringify({ pid: 2147483647 }));
    withPackageLock(release, () => entered++);
    assert.equal(entered, 2);
    assert(fs.existsSync(legacy));
  } finally {
    fs.unlinkSync = unlink;
    assert.equal(path.dirname(release), path.resolve(os.tmpdir()));
    fs.rmSync(release, { recursive: true, force: true });
  }
});

test("发行保留有上限，失败暂存可清理，权威资料和陌生目录原位保留", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-retention-"));
  try {
    const release = path.join(fixture, "release");
    fs.mkdirSync(release);
    const transaction = {
      target: path.join(release, "进境台"),
      stage: path.join(release, ".stage-123"),
      backup: path.join(release, "进境台.previous-123"),
    };
    assert.equal(validateTransaction(release, transaction), transaction);
    assert.throws(
      () =>
        validateTransaction(release, {
          ...transaction,
          backup: path.join(fixture, "进境台.previous-123"),
        }),
      /TRANSACTION_UNSAFE/,
    );
    assert.throws(
      () =>
        validateTransaction(release, {
          ...transaction,
          stage: path.join(release, ".stage-124"),
        }),
      /TRANSACTION_UNSAFE/,
    );
    for (const name of [
      "进境台.previous-1",
      "进境台.previous-2",
      ".stage-1",
      ".stage-2",
      "进境台",
      "share-2026-10-10T12-00-00-000Z/进境台",
      "share-2026-10-11T12-00-00-000Z/进境台",
    ]) {
      const app = path.join(release, name, "resources/app");
      fs.mkdirSync(app, { recursive: true });
      fs.writeFileSync(
        path.join(app, "build-manifest.json"),
        JSON.stringify({ fingerprint: "a".repeat(64) }),
      );
    }
    fs.writeFileSync(
      path.join(release, ".stage-2", "personal.json"),
      "PRIVATE_SYNTHETIC_AUTHORITY",
    );
    fs.mkdirSync(path.join(release, ".stage-3"));
    const journal = path.join(release, "package-transaction.json");
    fs.writeFileSync(journal, JSON.stringify(transaction));
    assert.throws(() => pruneRelease(release), /PACKAGE_TRANSACTION_ACTIVE/);
    assert(fs.existsSync(path.join(release, "进境台.previous-1")));
    assert(fs.existsSync(path.join(release, "进境台.previous-2")));
    fs.unlinkSync(journal);
    const result = withPackageLock(release, () => pruneRelease(release));
    assert.deepEqual(result.removed.sort(), [
      ".stage-1",
      "share-2026-10-10T12-00-00-000Z",
      "进境台.previous-1",
      "进境台.previous-2",
    ]);
    assert(fs.existsSync(path.join(release, "进境台")));
    assert(fs.existsSync(path.join(release, "share-2026-10-11T12-00-00-000Z")));
    assert.equal(result.retained.length, 2);
    assert.equal(
      fs.readFileSync(path.join(release, ".stage-2", "personal.json"), "utf8"),
      "PRIVATE_SYNTHETIC_AUTHORITY",
    );
    assert.throws(() => removeArtifact(release, fixture, true), /PATH_UNSAFE/);
    withPackageLock(release, () =>
      assert.throws(() => withPackageLock(release, () => {}), /PACKAGE_BUSY/),
    );
  } finally {
    assert.equal(path.dirname(fixture), path.resolve(os.tmpdir()));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("诊断只保留指定进程文件，正文和未知文件不参与清理；语言保留中文与回退", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-diagnostics-"));
  try {
    const diagnostics = path.join(fixture, "diagnostics");
    fs.mkdirSync(diagnostics);
    for (let n = 0; n < 20; n++)
      fs.writeFileSync(path.join(diagnostics, `mcp-start-${n}.json`), "{}");
    fs.writeFileSync(path.join(diagnostics, "personal.json"), "keep");
    Retention.pruneDiagnostics(fixture, 3);
    assert.equal(
      fs.readdirSync(diagnostics).filter((n) => n.startsWith("mcp-start-"))
        .length,
      3,
    );
    assert.equal(
      fs.readFileSync(path.join(diagnostics, "personal.json"), "utf8"),
      "keep",
    );
    const locales = path.join(fixture, "locales");
    fs.mkdirSync(locales);
    for (const name of ["en-US.pak", "zh-CN.pak", "fr.pak"])
      fs.writeFileSync(path.join(locales, name), "locale");
    trimLocales(fixture);
    assert.deepEqual(fs.readdirSync(locales).sort(), [
      "en-US.pak",
      "zh-CN.pak",
    ]);
  } finally {
    assert.equal(path.dirname(fixture), path.resolve(os.tmpdir()));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
