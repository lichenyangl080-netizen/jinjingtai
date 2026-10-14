const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

for (const scenario of [
  "default",
  "other",
  "connect-default",
  "connect-other",
  "cancel",
  "missing",
  "corrupt",
  "artifacts",
  "backup",
]) {
  test(`首次使用与资料保护：${scenario}`, () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-first-use-"));
    const code = `
      const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
      const S=require('./integration/store.cjs'),C=require('./integration/connection.cjs');
      const scenario=${JSON.stringify(scenario)};
      const target=path.join(S.HOME,scenario.includes('other') || scenario==='backup'?'other':'library');
      fs.mkdirSync(target,{recursive:true});
      if(['missing','corrupt'].includes(scenario)) {
        S.selectLibrary(target);
        if(scenario==='missing')fs.unlinkSync(path.join(target,'personal.json'));
        else fs.writeFileSync(path.join(target,'personal.json'),'broken authority');
      }
      if(scenario==='artifacts')fs.mkdirSync(path.join(target,'stages'));
      if(scenario==='backup')fs.writeFileSync(path.join(target,'.jinjingtai-backup'),'backup');
      const fresh=!['missing','corrupt','artifacts'].includes(scenario);
      assert.equal(S.needsInitialization(),fresh);
      assert.equal(S.status().libraryHealth.needsInitialization,fresh);
      assert.equal(fs.existsSync(path.join(target,'personal.json')),scenario==='corrupt');
      const handlers=new Map(),win={webContents:{}},Module=require('node:module'),original=Module._load;
      Module._load=function(name,...args){if(name==='electron')return {
        ipcMain:{on(){},handle(name,fn){handlers.set(name,fn);}},
        dialog:{async showOpenDialog(){return {canceled:scenario==='cancel',filePaths:[target]};},async showMessageBox(){return {response:scenario.startsWith('connect')?0:1};}},
        shell:{},app:{getPath(){return path.join(S.HOME,'profile');}}
      };return original.call(this,name,...args);};
      require('./electron/integration.cjs').setup(win);Module._load=original;
      // The test runs actual install with an isolated Codex home and the test Node runtime.
      const config=S.config;S.config=()=>({...config(),runtimeNode:process.execPath,codex:process.execPath});
      (async()=>{
        const event={sender:win.webContents};
        const run=()=>scenario.startsWith('connect')?handlers.get('jinjingtai:connect')(event):handlers.get('jinjingtai:maintenance')(event,'library');
        if(['missing','corrupt','artifacts','backup'].includes(scenario)) {
          await assert.rejects(run(),scenario==='backup'?/BACKUP_LIBRARY_READ_ONLY/:/PERSONAL_DATA_/);
          if(scenario==='corrupt')assert.equal(fs.readFileSync(path.join(target,'personal.json'),'utf8'),'broken authority');
          else assert.equal(fs.existsSync(path.join(target,'personal.json')),false);
        } else if(scenario==='cancel') {
          assert.deepEqual(await run(),{cancelled:true});assert.equal(S.needsInitialization(),true);
          assert.equal(fs.existsSync(path.join(target,'personal.json')),false);
        } else {
          await run();assert.equal(S.needsInitialization(),false);assert.equal(S.canonical(S.library()),S.canonical(target));
          assert.equal(S.personal().store.records.length,0);
          if(scenario.startsWith('connect'))assert(fs.existsSync(path.join(process.env.CODEX_HOME,'hooks.json')));
          assert.deepEqual(await handlers.get('jinjingtai:maintenance')(event,'library'),{cancelled:true});
        }
      })().catch(e=>{console.error(e);process.exitCode=1;});
    `;
    try {
      const result = spawnSync(process.execPath, ["-e", code], {
        cwd: path.join(__dirname, ".."),
        env: {
          ...process.env,
          JINJINGTAI_HOME: home,
          JINJINGTAI_PROFILE: path.join(home, "profile"),
          CODEX_HOME: path.join(home, "codex"),
        },
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
}
