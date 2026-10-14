const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { spawnSync } = require("node:child_process");
const product = path.resolve(__dirname, "..");

function isolated(code) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-round3-data-"));
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
    const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
    const root=${JSON.stringify(root)},product=${JSON.stringify(product)};
    const S=require(path.join(product,'integration/store.cjs'));
    const C=require(path.join(product,'integration/connection.cjs'));
    const P=require(path.join(product,'integration/preferences.cjs'));
    ${code}
  `,
    ],
    {
      cwd: product,
      env: {
        ...process.env,
        JINJINGTAI_HOME: path.join(root, "home"),
        JINJINGTAI_PROFILE: path.join(root, "profile"),
        CODEX_HOME: path.join(root, "codex"),
        LOCALAPPDATA: path.join(root, "local-appdata"),
      },
      encoding: "utf8",
      windowsHide: true,
      timeout: 30000,
    },
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);
}

const configurationFixture = `
  const primary=path.join(S.HOME,'connection.json');
  const first=path.join(root,'library-a'),second=path.join(root,'library-b');
  const work=path.join(root,'work-a'),otherWork=path.join(root,'work-b');
  const legacy1=path.join(root,'legacy-one','connection.json'),legacy2=path.join(root,'legacy-two','connection.json');
  for(const dir of [first,second,work,otherWork,process.env.CODEX_HOME])fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(work,'AGENTS.md'),'Original work A rules\\n');
  fs.writeFileSync(path.join(otherWork,'AGENTS.md'),'Original work B rules\\n');
  fs.writeFileSync(path.join(process.env.CODEX_HOME,'AGENTS.md'),'Original Codex user rules\\n');
  const codexConfig=path.join(process.env.CODEX_HOME,'config.toml'),hooks=path.join(process.env.CODEX_HOME,'hooks.json');
  fs.writeFileSync(codexConfig,'model = "fixture"\\n[mcp_servers.other]\\ncommand = "other-tool"\\n');
  S.atomic(hooks,{hooks:{Stop:[{hooks:[{type:'command',command:'echo original-hook'}]}]}});
  S.atomic(primary,{version:1,enabled:true,library:first,roots:[work],codexHome:process.env.CODEX_HOME,legacyConfigFiles:[legacy1,legacy2,primary]});
  C.install({library:first,roots:[work],node:process.execPath,codex:'fixture-codex'});
  const p=S.personal();p.store.notes['2026-10-07']={lesson:'Synthetic personal content',tomorrow:''};S.savePersonal(p.store,p.revision,p.libraryId);
  // Byte equality must preserve each file's original formatting too.
  fs.writeFileSync(legacy1,' \\n'+JSON.stringify(S.read(legacy1))+'\\n');
  fs.writeFileSync(legacy2,JSON.stringify(S.read(legacy2),null,4)+'\\r\\n');
  const pointer=path.join(S.HOME,'library-location.json');
  const files=[primary,legacy1,legacy2,pointer,codexConfig,hooks,path.join(work,'AGENTS.md'),path.join(otherWork,'AGENTS.md'),path.join(process.env.CODEX_HOME,'AGENTS.md'),path.join(S.HOME,'runtime','store.cjs'),path.join(first,'personal.json')];
  const bytes=files.map(file=>fs.readFileSync(file));
  const assertRestored=()=>{
    files.forEach((file,i)=>assert(fs.readFileSync(file).equals(bytes[i]),file));
    assert(!fs.existsSync(path.join(S.HOME,'internal','connection-transaction.json')));
    assert(!fs.existsSync(path.join(S.HOME,'internal','connection-transaction.json.lock')));
  };
`;

for (const action of [
  "atomic",
  "pause",
  "install",
  "disconnect",
  "select-library",
  "atomic-new-legacy",
])
  test(`${action} 失败后主配置、全部迁移兼容文件及用户原始字节一起回滚`, () =>
    isolated(
      configurationFixture +
        `
      const action=${JSON.stringify(action)},newLegacy=path.join(root,'new-legacy','connection.json');
      const failure=action==='install'||action==='select-library'?pointer:action==='disconnect'?hooks:legacy2;
      const rename=fs.renameSync;let injected=false;
      fs.renameSync=function(from,to){
        if(!injected&&path.resolve(to)===path.resolve(failure)){injected=true;throw Error('INJECTED_CONFIG_WRITE_FAILURE');}
        return rename.call(this,from,to);
      };
      try {
        assert.throws(()=>{
          if(action==='pause')return P.pause(true);
          if(action==='install')return C.install({library:first,roots:[otherWork],node:process.execPath,codex:'fixture-codex'});
          if(action==='disconnect')return C.disconnect();
          if(action==='select-library')return S.selectLibrary(second);
          const c=S.config();
          return S.atomic(primary,{...c,enabled:false,paused:true,...(action==='atomic-new-legacy'?{legacyConfigFiles:[legacy1,newLegacy,legacy2,primary]}:{})});
        },/INJECTED_CONFIG_WRITE_FAILURE/);
      } finally {fs.renameSync=rename;}
      assert(injected);assertRestored();assert(!fs.existsSync(newLegacy));
      assert.equal(S.config().enabled,true);assert.equal(S.read(legacy1).enabled,true);assert.equal(S.read(legacy2).enabled,true);
    `,
    ));

test("撤销异常退出后恢复全部兼容配置，备份清单包含兼容文件", () =>
  isolated(
    configurationFixture +
      `
    const child=require('node:child_process').spawnSync(process.execPath,['-e',
      "const path=require('node:path'),S=require('./integration/store.cjs'),C=require('./integration/connection.cjs');const atomic=S.atomic;S.atomic=(file,...args)=>{if(file===path.join(process.env.CODEX_HOME,'hooks.json'))process.exit(23);return atomic(file,...args);};C.disconnect();"
    ],{cwd:product,env:process.env,windowsHide:true});
    assert.equal(child.status,23);
    assert.equal(S.read(primary).enabled,false);assert.equal(S.read(legacy1).enabled,false);assert.equal(S.read(legacy2).enabled,false);
    C.recover();assertRestored();
    const backups=path.join(S.HOME,'backups');
    const batch=fs.readdirSync(backups).find(name=>name.startsWith('disconnect-'));
    const manifest=S.read(path.join(backups,batch,'manifest.json'));
    for(const legacy of [legacy1,legacy2])assert(manifest.some(entry=>entry.file===legacy));
  `,
  ));

test("成功暂停、恢复、切库与撤销保持全部兼容进程配置一致", () =>
  isolated(
    configurationFixture +
      `
    for(const paused of [true,false]){
      P.pause(paused);const current=S.read(primary);
      for(const legacy of [legacy1,legacy2])assert.deepEqual(S.read(legacy),current);
      assert.equal(current.paused,paused);assert.equal(current.enabled,!paused);
    }
    S.selectLibrary(second);for(const legacy of [legacy1,legacy2])assert.deepEqual(S.read(legacy),S.read(primary));
    assert.equal(S.read(primary).library,S.canonical(second));
    C.disconnect();for(const legacy of [legacy1,legacy2])assert.deepEqual(S.read(legacy),S.read(primary));
    assert.equal(S.read(primary).disconnected,true);
    assert(!fs.readFileSync(codexConfig,'utf8').includes('[mcp_servers.jinjingtai]'));
    assert(fs.readFileSync(codexConfig,'utf8').includes('[mcp_servers.other]'));
  `,
  ));

test("事务内未声明的新兼容文件在任何配置替换前拒绝", () =>
  isolated(
    configurationFixture +
      `
    const extra=path.join(root,'undeclared','connection.json'),next={...S.config(),legacyConfigFiles:[legacy1,legacy2,extra]};
    assert.throws(()=>S.connectionTransaction([],()=>S.atomic(primary,next)),/CONNECTION_TRANSACTION_SCOPE_MISMATCH/);
    assertRestored();assert(!fs.existsSync(extra));
  `,
  ));

test("正常 .tmp 附件备份后复制恢复仍可打开，内部暂存、索引与凭据不进入备份", () =>
  isolated(`
    const library=path.join(root,'library'),backupRoot=path.join(root,'backups');
    fs.mkdirSync(library);fs.mkdirSync(backupRoot);S.selectLibrary(library);
    const inputs=[path.join(root,'normal.tmp'),path.join(root,'normal.txt')];
    inputs.forEach((file,i)=>fs.writeFileSync(file,'Original attachment '+i));
    const Module=require('node:module'),original=Module._load,handlers=new Map(),win={webContents:{}},opened=[];
    Module._load=function(name,...args){if(name==='electron')return {
      ipcMain:{on(){},handle(name,fn){handlers.set(name,fn);}},
      dialog:{async showOpenDialog(){return {canceled:false,filePaths:inputs};}},
      shell:{async openPath(file){opened.push({file,bytes:fs.readFileSync(file)});return '';}},
      app:{getPath(){return process.env.JINJINGTAI_PROFILE;}}
    };return original.call(this,name,...args);};
    try{require('./electron/integration.cjs').setup(win);}finally{Module._load=original;}
    (async()=>{
      const attachments=await handlers.get('jinjingtai:attachment')({sender:win.webContents},S.personal().libraryId);
      const p=S.personal();p.store.records.push({id:'manual',date:'2026-10-07',project:'unassigned',title:'Normal attachments',change:'Synthetic body',next:'',kind:'手动补记',manual:true,attachments});
      S.savePersonal(p.store,p.revision,p.libraryId);
      const tempName='personal.json.'+require('node:crypto').randomUUID()+'.tmp';
      fs.writeFileSync(path.join(library,tempName),'incomplete authority');
      const attachmentTemp=attachments[0].id+'.'+require('node:crypto').randomUUID()+'.tmp';
      fs.writeFileSync(path.join(library,'attachments',attachmentTemp),'incomplete attachment');
      fs.writeFileSync(path.join(library,'index.sqlite'),'rebuildable');fs.writeFileSync(path.join(S.HOME,'gate.key'),'not an exported credential');
      const result=P.backup(backupRoot),copy=path.join(result.path,'资料库');
      assert(fs.existsSync(path.join(result.path,'backup-complete.json')));
      assert(!fs.existsSync(path.join(copy,tempName)));assert(!fs.existsSync(path.join(copy,'attachments',attachmentTemp)));
      assert(!fs.existsSync(path.join(copy,'index.sqlite')));assert(!fs.existsSync(path.join(result.path,'gate.key')));
      attachments.forEach((attachment,i)=>assert(fs.readFileSync(path.join(copy,'attachments',attachment.id)).equals(fs.readFileSync(inputs[i]))));
      assert.throws(()=>S.selectLibrary(copy),/BACKUP_LIBRARY_READ_ONLY/);
      const restored=path.join(root,'restored');fs.cpSync(copy,restored,{recursive:true});S.selectLibrary(restored);
      for(const attachment of attachments)await handlers.get('jinjingtai:open-attachment')({sender:win.webContents},attachment.id);
      assert.equal(opened.length,2);opened.forEach((item,i)=>{assert(item.bytes.equals(fs.readFileSync(inputs[i])));assert.equal(path.dirname(item.file),path.join(S.canonical(restored),'attachments'));});
      assert.deepEqual(S.personal().store.records[0].attachments,attachments);
    })().catch(error=>{console.error(error);process.exitCode=1;});
  `));
