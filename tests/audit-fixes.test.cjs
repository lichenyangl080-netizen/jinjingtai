const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { spawnSync } = require("node:child_process");
function isolated(code) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-audit-fixes-"));
  const r = spawnSync(
    process.execPath,
    [
      "-e",
      `
    const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
    const S=require(${JSON.stringify(require.resolve("../integration/store.cjs"))});
    const first=path.join(S.HOME,'first'),second=path.join(S.HOME,'second');
    fs.mkdirSync(first,{recursive:true});fs.mkdirSync(second);
    ${code}
  `,
    ],
    { env: { ...process.env, JINJINGTAI_HOME: home }, encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
}
test("未连接也能选择、保存和重开本地库，不创建Codex配置或采集授权", () =>
  isolated(`
  S.selectLibrary(first);assert.equal(S.config().enabled,false);
  const p=S.personal();p.store.notes['2026-10-07']={lesson:'本地人工正文',tomorrow:''};
  S.savePersonal(p.store,p.revision,p.libraryId);S.selectLibrary(second);assert.equal(S.personal().store.notes['2026-10-07'],undefined);
  S.selectLibrary(first);assert.equal(S.personal().store.notes['2026-10-07'].lesson,'本地人工正文');
  assert(!fs.existsSync(path.join(S.HOME,'connection.json')));assert.throws(()=>S.authorize(first),/NOT_AUTHORIZED/);
`));

test("实际Electron资料库处理器在未连接时打开对话框，范围处理器仍拒绝未安装连接", () =>
  isolated(`
  S.selectLibrary(first);
  const handlers=new Map(),win={webContents:{}},Module=require('node:module'),original=Module._load;
  let dialogs=0;
  Module._load=function(name,...args){if(name==='electron')return {
    ipcMain:{on(){},handle(name,fn){handlers.set(name,fn);}},
    dialog:{async showOpenDialog(){dialogs++;return {canceled:false,filePaths:[second]};},async showMessageBox(){return {response:1};}},
    shell:{},app:{getPath(){return path.join(S.HOME,'profile');}}
  };return original.call(this,name,...args);};
  require(${JSON.stringify(require.resolve("../electron/integration.cjs"))}).setup(win);Module._load=original;
  (async()=>{
    const fn=handlers.get('jinjingtai:maintenance');
    await assert.rejects(()=>fn({sender:win.webContents},'scope'),/CONNECTION_NOT_INSTALLED/);
    await fn({sender:win.webContents},'library');assert.equal(dialogs,1);assert.equal(S.config().library,S.canonical(second));
    assert(!fs.existsSync(path.join(S.HOME,'connection.json')));
    fs.writeFileSync(path.join(second,'personal.json'),'{broken-authority');
    S.selectLibrary(first);fs.writeFileSync(path.join(first,'personal.json'),'{broken-authority');
    fs.writeFileSync(path.join(second,'personal.json'),JSON.stringify({revision:0,store:S.empty()}));
    await fn({sender:win.webContents},'library');assert.equal(dialogs,2);assert.equal(S.config().library,S.canonical(second));
  })().catch(e=>{console.error(e);process.exitCode=1;});
`));
test("已连接切库只更新位置，保留暂停、范围和其他配置；指针失败回滚", () =>
  isolated(`
  const legacy=path.join(S.HOME,'legacy','connection.json');
  S.atomic(path.join(S.HOME,'connection.json'),{enabled:false,paused:true,library:first,roots:[first],scopeMode:'selected',instructionFiles:['existing'],legacyConfigFiles:[legacy],custom:'preserve'});
  const before=S.config();S.selectLibrary(second);assert.deepEqual(S.config(),{...before,library:S.canonical(second)});
  assert.equal(S.read(legacy).library,S.canonical(second));
  const files=[path.join(S.HOME,'connection.json'),legacy,path.join(S.HOME,'library-location.json')],bytes=files.map(f=>fs.readFileSync(f));
  const rename=fs.renameSync;let failed=false;fs.renameSync=(a,b)=>{if(!failed&&b===files[2]){failed=true;throw Error('injected-pointer-failure');}return rename(a,b);};
  assert.throws(()=>S.selectLibrary(first),/injected-pointer-failure/);fs.renameSync=rename;
  files.forEach((f,i)=>assert(fs.readFileSync(f).equals(bytes[i])));
`));
test("单个坏任务不拖垮资料库，正文可保存，诊断保留且不包含坏正文", () =>
  isolated(`
  S.selectLibrary(first);const jobs=path.join(first,'jobs');fs.mkdirSync(jobs);
  const bad=path.join(jobs,'broken.json');fs.writeFileSync(bad,'{PRIVATE_BROKEN_BODY');
  S.atomic(path.join(jobs,'good.json'),{id:'good',date:'2026-10-07',state:'cancelled'});
  const st=S.status();assert.equal(st.libraryHealth.available,true);assert.equal(st.jobs.length,1);
  assert.equal(st.metadataHealth.available,false);assert(!JSON.stringify(st).includes('PRIVATE_BROKEN_BODY'));
  assert.throws(()=>S.requireHealthy('jobs'),/LOCAL_METADATA_INVALID/);
  const p=S.personal();p.store.notes['2026-10-07']={lesson:'可以保存',tomorrow:''};S.savePersonal(p.store,p.revision,p.libraryId);
  assert.equal(S.personal().store.notes['2026-10-07'].lesson,'可以保存');assert.equal(fs.readFileSync(bad,'utf8'),'{PRIVATE_BROKEN_BODY');
  fs.unlinkSync(bad);assert.equal(S.status().metadataHealth.available,true);
`));
test("缺字段、非法日期、错误嵌套和重复ID拒绝保存，原权威字节保留", () =>
  isolated(`
  S.selectLibrary(first);const file=path.join(first,'personal.json'),before=fs.readFileSync(file);
  const r={id:'valid',date:'2026-10-07',project:'unassigned',title:'标题',change:'正文',next:'',kind:'手动补记'};
  for(const records of [[{id:'bad'}],[{...r,date:'2026-02-30'}],[{...r,relations:[null]}],[{...r,work:{title:'缺摘要'}}],[{...r,sourceLinks:[null]}],[{...r,removed:'false'}],[r,r]]) {
    assert.throws(()=>S.savePersonal({...S.empty(),records},0,S.personal().libraryId),/INVALID_STORE/);assert(fs.readFileSync(file).equals(before));
  }
`));
test("损坏来源不悄悄缩小整理范围；备份本体及子目录不能写入", () =>
  isolated(`
  S.selectLibrary(first);fs.mkdirSync(path.join(first,'stages'));fs.writeFileSync(path.join(first,'stages','bad.json'),'{bad');
  const O=require(${JSON.stringify(require.resolve("../integration/consolidate.cjs"))});
  assert.throws(()=>O.preview('2026-10-07'),/LOCAL_METADATA_INVALID/);
  fs.writeFileSync(path.join(second,'.jinjingtai-backup'),'backup');const child=path.join(second,'data');fs.mkdirSync(child);
  assert.throws(()=>S.selectLibrary(child),/BACKUP_LIBRARY_READ_ONLY/);assert.equal(S.config().library,S.canonical(first));
`));

test("坏记录及重复ID隔离不丢原文，完好记录可改，整理和迟到结果暂停", () =>
  isolated(`
  S.selectLibrary(first);const file=path.join(first,'personal.json');
  const good={id:'good',date:'2026-10-07',project:'unassigned',title:'完好标题',change:'正文',next:'',kind:'发现'};
  const invalid={id:'broken',title:null,change:'PRIVATE_BAD_BODY',sourceIds:['source:0'],removed:true};
  const raw={revision:0,store:{...S.empty(),records:[good,invalid,{...good,id:'duplicate'},{...good,id:'duplicate'}]}};
  S.atomic(file,raw);let p=S.personal();assert.equal(p.store.records.length,1);assert.equal(p.authorityIssues.length,3);
  assert(!JSON.stringify(p.authorityIssues).includes('PRIVATE_BAD_BODY'));assert.equal(S.status().libraryHealth.available,true);
  p.store.records[0].change='人工更正';p.store.notes['2026-10-07']={lesson:'心得',tomorrow:''};S.savePersonal(p.store,p.revision,p.libraryId);
  const saved=S.read(file);assert.deepEqual(saved.store.records[1],invalid);assert.deepEqual(saved.store.records.slice(2),raw.store.records.slice(2));
  assert.equal(saved.store.records[0].change,'人工更正');
  const O=require(${JSON.stringify(require.resolve("../integration/consolidate.cjs"))});
  assert.throws(()=>O.preview('2026-10-07'),/PERSONAL_RECORDS_ISOLATED/);
  S.atomic(path.join(first,'jobs','complete.json'),{id:'complete',date:'2026-10-07',state:'complete',materials:[],result:{entries:[],unprocessed:[]}});
  assert.throws(()=>O.apply('complete'),/PERSONAL_RECORDS_ISOLATED/);assert.equal(S.status().jobs[0].saveBlocked,true);
  p=S.personal();assert.throws(()=>S.savePersonal({...p.store,records:[...p.store.records,{...good,id:'broken'}]},p.revision,p.libraryId),/ISOLATED_ID_CONFLICT/);
`));
