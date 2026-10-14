const test = require("node:test");
const { runIsolated } = require("./helpers/isolated-library.cjs");

const attachmentFixture = `
  const a=path.join(S.HOME,'a'),b=path.join(S.HOME,'b');
  fs.mkdirSync(a);fs.mkdirSync(b);S.selectLibrary(a);
  const identity=S.personal().libraryId;
  const input=path.join(S.HOME,'synthetic.txt');fs.writeFileSync(input,'Synthetic attachment');
  const handlers=new Map(),syncHandlers=new Map(),win={webContents:{}},Module=require('node:module'),original=Module._load;
  let prompts=0,choose=async()=>({canceled:false,filePaths:[input]});
  Module._load=function(name,...args){if(name==='electron')return {
    ipcMain:{on(name,fn){syncHandlers.set(name,fn);},handle(name,fn){handlers.set(name,fn);}},
    dialog:{async showOpenDialog(){prompts++;return choose();}},
    shell:{},app:{getPath(){return process.env.JINJINGTAI_PROFILE;}}
  };return original.call(this,name,...args);};
  try{require('./electron/integration.cjs').setup(win);}finally{Module._load=original;}
  const add=()=>handlers.get('jinjingtai:attachment')({sender:win.webContents},identity);
`;
test("附件请求正常写入原库；取消、缺身份与非法发送者不写入", () =>
  runIsolated(
    attachmentFixture +
      `
  (async()=>{
    const files=await add();assert.equal(files.length,1);
    assert.equal(fs.readFileSync(path.join(a,'attachments',files[0].id),'utf8'),'Synthetic attachment');
    const before=fs.readdirSync(path.join(a,'attachments'));
    choose=async()=>({canceled:true,filePaths:[]});assert.deepEqual(await add(),[]);
    const count=prompts;
    await assert.rejects(handlers.get('jinjingtai:attachment')({sender:win.webContents}),/LIBRARY_CHANGED/);
    await assert.rejects(handlers.get('jinjingtai:attachment')({sender:{}},identity),/INVALID_SENDER/);
    assert.equal(prompts,count);assert.deepEqual(fs.readdirSync(path.join(a,'attachments')),before);
  })().catch(e=>{console.error(e);process.exitCode=1;});
`,
  ));
test("附件选择等待期间真实子进程切库，原库和新库均不接收迟到文件", () =>
  runIsolated(
    attachmentFixture +
      `
  (async()=>{
    const beforeA=fs.readFileSync(path.join(a,'personal.json'));
    choose=async()=>{
      const child=spawnSync(process.execPath,['-e',"require('./integration/store.cjs').selectLibrary(process.argv[1])",b],{env:process.env,encoding:'utf8',windowsHide:true});
      assert.equal(child.status,0,child.stderr);
      return {canceled:false,filePaths:[input]};
    };
    await assert.rejects(add(),/LIBRARY_CHANGED/);
    assert(!fs.existsSync(path.join(a,'attachments')));assert(!fs.existsSync(path.join(b,'attachments')));
    assert(fs.readFileSync(path.join(a,'personal.json')).equals(beforeA));
    const count=prompts;await assert.rejects(add(),/LIBRARY_CHANGED/);assert.equal(prompts,count);
  })().catch(e=>{console.error(e);process.exitCode=1;});
`,
  ));
test("采集写操作拒绝旧资料库身份，不取消新库任务或写入可见性和候选决定", () =>
  runIsolated(
    attachmentFixture +
      `
  S.selectLibrary(b);
  for(const [method,args] of [
    ['cancel',['job',identity]],
    ['visibility',['a'.repeat(64),true,identity]],
    ['candidate-review',['a'.repeat(64),'discard',identity]]
  ]){
    const event={sender:win.webContents};syncHandlers.get('jinjingtai:'+method)(event,...args);
    assert.deepEqual(event.returnValue,{ok:false,error:'LIBRARY_CHANGED'});
  }
  assert(!fs.existsSync(path.join(b,'visibility')));assert(!fs.existsSync(path.join(b,'excluded')));
`,
  ));
test("偏好读取使用一个快照，坏 JSON 继续报错而非默认成功", () =>
  runIsolated(`
  const P=require('./integration/preferences.cjs');const library=path.join(S.HOME,'library');fs.mkdirSync(library);S.selectLibrary(library);
  const file=path.join(library,'preferences.json');S.atomic(file,{fontSize:15,workspaceNames:{first:'A'}});
  const read=S.read;let reads=0;
  S.read=(file,fallback)=>{
    const value=read(file,fallback);
    if(path.basename(file)==='preferences.json'){
      reads++;S.atomic(file,{fontSize:17,workspaceNames:{second:'B'}});
    }
    return value;
  };
  let loaded;try{loaded=P.load();}finally{S.read=read;}
  assert.equal(reads,1);assert.equal(loaded.fontSize,15);assert.deepEqual(loaded.workspaceNames,{first:'A'});
  assert.equal(P.load().fontSize,17);
  fs.writeFileSync(file,'{broken');assert.throws(()=>P.load(),SyntaxError);
`));
test("项目解析仅在本次请求复用设置和目录解析，新请求及时读取新别名且保留人工名称", () =>
  runIsolated(`
  const P=require('./integration/preferences.cjs');const library=path.join(S.HOME,'library'),work=path.join(S.HOME,'work');
  fs.mkdirSync(library);fs.mkdirSync(work);S.selectLibrary(library);
  P.save({...P.load(),workspaceNames:{[work]:'Before'}},S.personal().libraryId);
  const read=S.read,workspace=S.workspace;let reads=0,paths=0;
  S.read=(file,fallback)=>{if(path.basename(file)==='preferences.json')reads++;return read(file,fallback);};
  S.workspace=cwd=>{paths++;return workspace(cwd);};
  let info;
  try{
    const resolve=P.createProjectResolver();info=resolve(work);
    assert.equal(resolve(work).name,'Before');assert.equal(reads,1);assert.equal(paths,1);
    S.atomic(path.join(library,'preferences.json'),{...P.load(),workspaceNames:{[workspace(work)]:'After'}});
    assert.equal(resolve(work).name,'Before');
  }finally{S.read=read;S.workspace=workspace;}
  assert.equal(P.createProjectResolver()(work).name,'After');
  assert.equal(P.createProjectResolver([{id:info.id,name:'Human name'}])(work).name,'Human name');
`));

test("正确库身份允许采集动作，参数与目录授权校验仍生效", () =>
  runIsolated(
    attachmentFixture +
      `
  const work=path.join(path.dirname(S.HOME),'authorized-work');fs.mkdirSync(work);
  S.atomic(path.join(S.HOME,'connection.json'),{version:1,enabled:true,roots:[work],library:S.library()});
  const id='a'.repeat(64),stage={id,digest:id,date:S.day(),at:new Date().toISOString(),outcome:'change',source:{cwd:work,session:'synthetic',turn:'1',call:'call'},items:[{kind:'finding',title:'Synthetic',summary:'Synthetic summary'}]};
  S.atomic(path.join(a,'stages',id+'.json'),stage);
  const call=(method,...args)=>{const event={sender:win.webContents};syncHandlers.get('jinjingtai:'+method)(event,...args);return event.returnValue;};
  assert.equal(call('candidate-review',id,'accept',identity).ok,true);assert.equal(S.bound(stage),true);
  const hidden=call('visibility',id,true,identity);assert.equal(hidden.ok,true);assert.equal(hidden.value.libraryId,identity);
  assert(S.hiddenSourceIds().has(id+':0'));
  assert.equal(call('visibility',id,false,identity).ok,true);assert(!S.hiddenSourceIds().has(id+':0'));
  assert.equal(call('candidate-review',id,'discard',identity).ok,true);assert(fs.existsSync(path.join(a,'excluded',id+'.json')));
  S.atomic(path.join(a,'jobs','synthetic-job.json'),{id:'synthetic-job',state:'running',materials:[{id:'material'}]});
  assert.equal(call('cancel','synthetic-job',identity).ok,true);
  assert.equal(S.read(path.join(a,'jobs','synthetic-job.json')).state,'cancelled');
  assert.equal(call('visibility',id,'not-boolean',identity).error,'INVALID_ID');
  assert.equal(call('candidate-review',id,'unknown',identity).error,'INVALID_DECISION');
  const unauthorized='b'.repeat(64);S.atomic(path.join(a,'stages',unauthorized+'.json'),{...stage,id:unauthorized,source:{...stage.source,cwd:b}});
  assert.equal(call('candidate-review',unauthorized,'accept',identity).error,'INTERNAL_TASK');
  assert(!fs.existsSync(path.join(a,'bindings',unauthorized+'.json')));
`,
  ));
