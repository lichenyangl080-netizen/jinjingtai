const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { spawnSync } = require("node:child_process");
test("实际连接处理器重新设置保持资料库、范围和暂停，撤销确认取消不改配置", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-settings-actions-"));
  const code = `
    const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
    const S=require(${JSON.stringify(require.resolve("../integration/store.cjs"))});
    const C=require(${JSON.stringify(require.resolve("../integration/connection.cjs"))});
    const library=path.join(S.HOME,'library'),work=path.join(S.HOME,'work');fs.mkdirSync(work,{recursive:true});fs.mkdirSync(library);S.selectLibrary(library);
    S.atomic(path.join(S.HOME,'connection.json'),{enabled:false,paused:true,library:S.library(),roots:[work],instructionFiles:[path.join(work,'AGENTS.md')],installedAt:'2026-10-07T00:00:00Z',scopeMode:'selected',runtimeNode:process.execPath,codex:'fixture-codex'});
    const before=fs.readFileSync(path.join(S.HOME,'connection.json'));
    const handlers=new Map(),win={webContents:{}},Module=require('node:module'),original=Module._load;
    let prompts=0,answer=0,installed,disconnected=0;
    C.install=options=>{installed=options;return {installed:true};};C.disconnect=()=>{disconnected++;return {disconnected:true};};
    Module._load=function(name,...args){if(name==='electron')return {
      ipcMain:{on(){},handle(name,fn){handlers.set(name,fn);}},
      dialog:{async showOpenDialog(){prompts++;throw Error('Unexpected library or range change');},async showMessageBox(){prompts++;return {response:answer};}},
      shell:{},app:{getPath(){return path.join(S.HOME,'profile');}}
    };return original.call(this,name,...args);};
    require(${JSON.stringify(require.resolve("../electron/integration.cjs"))}).setup(win);Module._load=original;
    (async()=>{
      await handlers.get('jinjingtai:connect')({sender:win.webContents});
      assert.equal(prompts,0);assert.equal(installed.library,S.library());assert.equal(installed.paused,true);assert.deepEqual(installed.roots,[work]);assert.equal(installed.scopeMode,'selected');
      const action=handlers.get('jinjingtai:maintenance');assert.deepEqual(await action({sender:win.webContents},'disconnect'),{cancelled:true});assert.equal(disconnected,0);
      assert(fs.readFileSync(path.join(S.HOME,'connection.json')).equals(before));
      answer=1;assert.equal((await action({sender:win.webContents},'disconnect')).disconnected,true);assert.equal(disconnected,1);
      await assert.rejects(action({sender:{}},'disconnect'),/INVALID_SENDER/);
    })().catch(e=>{console.error(e);process.exitCode=1;});
  `;
  const result = spawnSync(process.execPath, ["-e", code], {
    env: {
      ...process.env,
      JINJINGTAI_HOME: home,
      CODEX_HOME: path.join(home, "empty-codex"),
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});
