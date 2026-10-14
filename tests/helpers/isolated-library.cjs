const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

exports.runIsolated = (code) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-regression-"));
  try {
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        `
      const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
      const {spawnSync}=require('node:child_process');
      const S=require('./integration/store.cjs');
      fs.mkdirSync(S.HOME,{recursive:true});
      ${code}
    `,
      ],
      {
        cwd: path.resolve(__dirname, "../.."),
        env: {
          ...process.env,
          JINJINGTAI_HOME: path.join(root, "home"),
          JINJINGTAI_PROFILE: path.join(root, "profile"),
          CODEX_HOME: path.join(root, "codex"),
        },
        encoding: "utf8",
        windowsHide: true,
        timeout: 30000,
      },
    );
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true });
  }
};
