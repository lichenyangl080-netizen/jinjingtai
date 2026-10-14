import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { root } from "../scripts/build-manifest.mjs";
import { nodeRuntimeLicense } from "../scripts/package-files.mjs";

test("打包许可严格匹配实际 Node 运行时，缺少对应版本时明确失败", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-node-license-"));
  try {
    fs.mkdirSync(path.join(fixture, "docs/licenses"), { recursive: true });
    fs.writeFileSync(
      path.join(fixture, "docs/licenses/Node-24.19.0.txt"),
      "fixture license",
    );
    assert.equal(
      nodeRuntimeLicense(fixture, "24.19.0").name,
      "Node-24.19.0.txt",
    );
    assert.throws(
      () => nodeRuntimeLicense(fixture, "24.20.0"),
      /NODE_LICENSE_MISSING: 24\.20\.0/,
    );
    const official = fs.readFileSync(nodeRuntimeLicense().source, "utf8");
    assert.match(official, /merve, located at deps\/merve/);
    assert.match(official, /Copyright 2026 Yagiz Nizipli/);
  } finally {
    assert.equal(path.dirname(fixture), path.resolve(os.tmpdir()));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

for (const isPackaged of [false, true]) {
  test(`${isPackaged ? "发行包" : "源码启动"}的实际说明与许可处理器打开正确文件`, () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-documents-"));
    try {
      const packageRoot = path.join(fixture, "application");
      const appPath = isPackaged
        ? path.join(packageRoot, "resources/app")
        : packageRoot;
      const guide = path.join(
        packageRoot,
        isPackaged ? "进境台-使用说明.md" : "docs/使用说明.md",
      );
      const licenses = path.join(packageRoot, "THIRD_PARTY_NOTICES.md");
      fs.mkdirSync(appPath, { recursive: true });
      fs.mkdirSync(path.dirname(guide), { recursive: true });
      fs.writeFileSync(guide, "guide fixture");
      fs.writeFileSync(licenses, "license fixture");
      const result = spawnSync(
        process.execPath,
        [
          "-e",
          `
            const fs=require('node:fs'),assert=require('node:assert/strict'),Module=require('node:module');
            const handlers=new Map(),win={webContents:{}},opened=[],original=Module._load;
            let failure='';
            Module._load=function(name,...args){
              if(name==='electron')return {
                ipcMain:{on(){},handle(name,fn){handlers.set(name,fn);}},dialog:{},
                shell:{async openPath(file){opened.push(file);return failure;}},
                app:{isPackaged:${isPackaged},getAppPath(){return ${JSON.stringify(appPath)};},getPath(){return process.env.JINJINGTAI_PROFILE;}}
              };
              return original.call(this,name,...args);
            };
            require(${JSON.stringify(path.join(root, "electron/integration.cjs"))}).setup(win);
            Module._load=original;
            (async()=>{
              const run=action=>handlers.get('jinjingtai:maintenance')({sender:win.webContents},action);
              assert.deepEqual(await run('guide'),{opened:true});
              assert.deepEqual(await run('licenses'),{opened:true});
              assert.deepEqual(opened,${JSON.stringify([guide, licenses])});
              fs.unlinkSync(${JSON.stringify(guide)});
              await assert.rejects(run('guide'),/FILE_MISSING/);
              assert.equal(opened.length,2);
              failure='system refused to open';
              await assert.rejects(run('licenses'),/OPEN_FAILED/);
            })().catch(error=>{console.error(error);process.exitCode=1;});
          `,
        ],
        {
          env: {
            ...process.env,
            JINJINGTAI_HOME: path.join(fixture, "home"),
            JINJINGTAI_PROFILE: path.join(fixture, "profile"),
            CODEX_HOME: path.join(fixture, "codex"),
          },
          encoding: "utf8",
          windowsHide: true,
          timeout: 30000,
        },
      );
      assert.equal(result.status, 0, result.stderr || result.error?.message);
    } finally {
      assert.equal(path.dirname(fixture), path.resolve(os.tmpdir()));
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });
}
