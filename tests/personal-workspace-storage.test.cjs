const test = require("node:test");
const { runIsolated } = require("./helpers/isolated-library.cjs");
const fixture = `
const library=path.join(S.HOME,'library');fs.mkdirSync(library);S.selectLibrary(library);
const record={id:'manual',date:S.day(),project:'unassigned',title:'人工记录',change:'人工正文',next:'人工下一步',kind:'发现',manual:true,confirmed:true};
const extensions={
 threads:{t:{id:'t',project:'unassigned',title:'人工主线',description:'PRIVATE_THREAD_SENTINEL',recordIds:['manual'],createdAt:'2026-10-13T01:00:00Z',updatedAt:'2026-10-13T01:00:00Z'}},
 continuations:{unassigned:{text:'PRIVATE_CONTINUATION_SENTINEL',recordId:'manual',sourceNext:record.next,sourceSignature:'PRIVATE_SOURCE_SIGNATURE_SENTINEL',updatedAt:'2026-10-13T01:00:00Z'}},
 periodReviews:{['周:'+S.day()]:{period:'周',start:S.day(),end:S.day(),text:'PRIVATE_REVIEW_SENTINEL',references:[{recordId:'manual',title:record.title,date:record.date}],updatedAt:'2026-10-13T01:00:00Z'}}
};
const overviewRecordIds=['manual','PRIVATE_OVERVIEW_BASELINE_SENTINEL'];
let personal=S.personal();S.savePersonal({...personal.store,projects:personal.store.projects.map(p=>({...p,overviewRecordIds})),records:[record],...extensions},personal.revision,personal.libraryId);
const file=path.join(library,'personal.json');
`;

test("人工扩展写入遇到磁盘错误保留权威原件并允许重试", () =>
  runIsolated(
    fixture +
      `
const before=fs.readFileSync(file), snapshot=S.personal();
const alias=path.join(path.dirname(S.HOME),'library-alias');fs.symlinkSync(library,alias,'junction');
const aliasFile=path.join(alias,'personal.json');
const physical=p=>path.join(fs.realpathSync.native(path.dirname(p)),path.basename(p)).toLowerCase();
const rename=fs.renameSync;
fs.renameSync=(from,to)=>{if(physical(to)===physical(aliasFile)){const e=Error('disk-full');e.code='ENOSPC';throw e;}return rename(from,to);};
const draft={...snapshot.store,continuations:{...snapshot.store.continuations,unassigned:{text:'保留待保存输入',updatedAt:'2026-10-13T01:00:00Z'}}};
try {assert.throws(()=>S.savePersonal(draft,snapshot.revision,snapshot.libraryId),/disk-full/);} finally {fs.renameSync=rename;}
assert(fs.readFileSync(file).equals(before));
assert.equal(draft.continuations.unassigned.text,'保留待保存输入');
S.savePersonal(draft,snapshot.revision,snapshot.libraryId);
assert.equal(S.personal().store.continuations.unassigned.text,'保留待保存输入');
assert.deepEqual(S.personal().store.periodReviews,extensions.periodReviews);
`,
  ));

test("人工扩展损坏拒绝读取和保存，保留原始字节", () =>
  runIsolated(
    fixture +
      `
const original=fs.readFileSync(file);
for(const field of ['threads','continuations','periodReviews']) {
 const broken=JSON.parse(original);broken.store[field]={broken:null};
 fs.writeFileSync(file,JSON.stringify(broken,null,3));const bytes=fs.readFileSync(file);
 assert.throws(()=>S.personal(),/PERSONAL_DATA_INVALID/);
 assert.throws(()=>S.savePersonal(S.empty(),broken.revision,personal.libraryId),/PERSONAL_DATA_INVALID/);
 assert(fs.readFileSync(file).equals(bytes),field+' corruption changed authority');
 fs.writeFileSync(file,original);
}
assert.deepEqual(S.personal().store.threads,extensions.threads);
`,
  ));

test("版本冲突不覆盖人工扩展；保存、重开与备份保留完整资料", () =>
  runIsolated(
    fixture +
      `
const stale=S.personal();const current=S.savePersonal({...stale.store,notes:{[S.day()]:{lesson:'新心得',tomorrow:''}}},stale.revision,stale.libraryId);
const before=fs.readFileSync(file);
assert.throws(()=>S.savePersonal({...stale.store,threads:{},records:[]},stale.revision,stale.libraryId),/REVISION_CONFLICT/);
assert(fs.readFileSync(file).equals(before));
for(const field of Object.keys(extensions))assert.deepEqual(S.personal().store[field],extensions[field]);
for(const project of S.personal().store.projects)assert.deepEqual(project.overviewRecordIds,overviewRecordIds);
const reopened=spawnSync(process.execPath,['-e',"const assert=require('node:assert/strict');const S=require('./integration/store.cjs');const p=S.personal();assert.equal(p.store.threads.t.description,'PRIVATE_THREAD_SENTINEL');assert.equal(p.store.continuations.unassigned.text,'PRIVATE_CONTINUATION_SENTINEL');assert.equal(p.store.continuations.unassigned.sourceSignature,'PRIVATE_SOURCE_SIGNATURE_SENTINEL');assert(p.store.projects.find(project=>project.id==='unassigned').overviewRecordIds.includes('PRIVATE_OVERVIEW_BASELINE_SENTINEL'));assert.equal(Object.values(p.store.periodReviews)[0].text,'PRIVATE_REVIEW_SENTINEL');"],{cwd:process.cwd(),env:process.env,encoding:'utf8',windowsHide:true});
assert.equal(reopened.status,0,reopened.stderr);
const destination=path.join(path.dirname(S.HOME),'backup-destination');fs.mkdirSync(destination);
const backup=require('./integration/preferences.cjs').backup(destination);
assert(fs.readFileSync(path.join(backup.path,'资料库','personal.json')).equals(before));
assert.deepEqual(S.read(path.join(backup.path,'资料库','personal.json')).store.records,current.store.records);
`,
  ));

test("整理与按需读取不接受人工扩展；应用结果保留主线、起点、周期正文", () =>
  runIsolated(
    fixture +
      `
(async()=>{
const cp=require('node:child_process'),{EventEmitter}=require('node:events');
const work=path.join(path.dirname(S.HOME),'work');fs.mkdirSync(work);
S.atomic(path.join(S.HOME,'connection.json'),{enabled:true,library,roots:[work],codex:'simulated'});
let child,sent,dir;
cp.spawn=(_,args)=>{dir=args[args.indexOf('-C')+1];child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=t=>sent=t;child.kill=()=>{};return child;};
const O=require('./integration/consolidate.cjs');
function capture(turn,title){const body={outcome:'change',items:[{kind:'implementation',title,summary:'SAFE_SOURCE_STAGE'}]};const h={cwd:work,session_id:'private-test',turn_id:turn,tool_use_id:turn,tool_input:body};h.tool_input={...body,_gate:S.issue(h)};S.submit(h.tool_input);S.bind(h);}
async function finish(job){const j=S.read(path.join(library,'jobs',job.id+'.json'));S.atomic(path.join(dir,'result.json'),{entries:j.materials.map((m,n)=>({title:m.title,summary:m.summary,next:'',sources:['m'+(n+1)],work:{title:'来源事项',summary:'来源实现尚未验证'}})),highlights:[],unprocessed:[]});child.emit('close',0);await new Promise(r=>setTimeout(r,50));assert.equal(S.read(path.join(library,'jobs',job.id+'.json')).state,'complete');O.apply(job.id);}
capture('first','添加来源功能');const first=O.start(S.day(),null,{dailySummary:true});
const capsule=S.read(path.join(dir,'capsule.json'));
const Reader=require('./integration/material-reader.cjs');
const response=Reader.make(capsule).read({ids:[Object.keys(capsule.materials)[0]],part:'summary'});
for(const serialized of [sent,JSON.stringify(capsule),response])assert(!serialized.includes('PRIVATE_'),serialized);
await finish(first);
for(const field of Object.keys(extensions))assert.deepEqual(S.personal().store[field],extensions[field]);
assert.deepEqual(S.personal().store.projects.find(p=>p.id==='unassigned').overviewRecordIds,overviewRecordIds);
assert(S.personal().store.records.some(r=>r.id==='manual'&&r.change===record.change));
capture('second','添加后续来源');const second=O.start(S.day(),null,{dailySummary:true});
const history=O.history(second.id,S.personal().libraryId);
assert(history.directory.length>0,'second organize must reuse machine source directory');
for(const serialized of [sent,JSON.stringify(history.directory),JSON.stringify(S.read(path.join(dir,'capsule.json')))])assert(!serialized.includes('PRIVATE_'));
await finish(second);
for(const field of Object.keys(extensions))assert.deepEqual(S.personal().store[field],extensions[field]);
assert.deepEqual(S.personal().store.projects.find(p=>p.id==='unassigned').overviewRecordIds,overviewRecordIds);
O.shutdown();
})().catch(e=>{console.error(e);process.exit(1)});
`,
  ));

test("跨月积压逐日显式整理，冻结来源不跨日且保留人工资料", () =>
  runIsolated(
    fixture +
      `
(async()=>{
const cp=require('node:child_process'),{EventEmitter}=require('node:events');
const work=path.join(path.dirname(S.HOME),'work');fs.mkdirSync(work);
S.atomic(path.join(S.HOME,'connection.json'),{enabled:true,library,roots:[work],codex:'simulated'});
let child,dir,calls=0;
cp.spawn=(_,args)=>{calls++;dir=args[args.indexOf('-C')+1];child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=()=>{};child.kill=()=>{};return child;};
const O=require('./integration/consolidate.cjs');
const previous=new Date(S.day()+'T12:00:00Z');previous.setUTCDate(previous.getUTCDate()-1);const prior=previous.toISOString().slice(0,10);previous.setUTCDate(1);previous.setUTCMonth(previous.getUTCMonth()-1);const older=previous.toISOString().slice(0,10);
for(const date of [older,prior]) {
 const body={outcome:'change',items:[{kind:'implementation',title:'逐日来源'+date,summary:'隔离模拟材料，未验证实现'}]};
 const h={cwd:work,session_id:'cross-month',turn_id:date,tool_use_id:date,tool_input:body};h.tool_input={...body,_gate:S.issue(h)};S.submit(h.tool_input);S.bind(h);
 const stage=S.list('stages').find(s=>s.source.turn===date);stage.date=date;S.atomic(path.join(library,'stages',stage.id+'.json'),stage);
}
for(const date of [older,prior]) {
 const job=O.start(date,null,{dailySummary:true}),j=S.read(path.join(library,'jobs',job.id+'.json'));
 assert.equal(j.date,date);assert(j.materials.length>0);assert(j.materials.every(m=>m.title.includes(date)));
 S.atomic(path.join(dir,'result.json'),{entries:j.materials.map((m,n)=>({title:m.title,summary:m.summary,next:'',sources:['m'+(n+1)],work:{title:m.title,summary:m.summary}})),highlights:[],unprocessed:[]});
 child.emit('close',0);await new Promise(r=>setTimeout(r,50));assert.equal(S.read(path.join(library,'jobs',job.id+'.json')).state,'complete');O.apply(job.id);
 assert(S.personal().store.records.some(r=>r.date===date&&r.title.includes(date)));
 for(const field of Object.keys(extensions))assert.deepEqual(S.personal().store[field],extensions[field]);
 assert.equal(O.start(date,null,{dailySummary:true}).reason,'NO_NEW_MATERIAL');
}
assert.equal(calls,2);O.shutdown();
})().catch(e=>{console.error(e);process.exit(1)});
`,
  ));
