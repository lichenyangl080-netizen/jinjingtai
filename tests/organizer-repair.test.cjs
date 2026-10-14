const test = require("node:test");
const { runIsolated } = require("./helpers/isolated-library.cjs");
test("模型不可用与登录、网络错误分开报告，不静默回退", () => {
  const assert = require("node:assert/strict"),
    E = require("../integration/organizer-errors.cjs");
  assert.equal(
    E.classify(null, "model gpt-6-astra is not available for this account"),
    "CODEX_MODEL_UNAVAILABLE",
  );
  assert.equal(
    E.classify(null, "reasoning effort max is not supported"),
    "CODEX_MODEL_UNAVAILABLE",
  );
  assert.equal(E.classify(null, "401 unauthorized"), "CODEX_AUTH_REQUIRED");
});

test("长聊天和超过200个聊天分页检查，不读取聊天正文", () =>
  runIsolated(`
  const {DatabaseSync}=require('node:sqlite');
  const library=path.join(S.HOME,'library'),work=path.join(path.dirname(S.HOME),'work');
  fs.mkdirSync(library);fs.mkdirSync(work);fs.mkdirSync(process.env.CODEX_HOME);S.selectLibrary(library);
  S.atomic(path.join(S.HOME,'connection.json'),{enabled:true,roots:[work],library,codexHome:process.env.CODEX_HOME,installedAt:'2020-01-01T00:00:00Z'});
  const state=new DatabaseSync(path.join(process.env.CODEX_HOME,'state_5.sqlite'));
  state.exec('CREATE TABLE threads(id TEXT,cwd TEXT,cli_version TEXT,updated_at_ms INTEGER,updated_at INTEGER)');
  const history=new DatabaseSync(path.join(process.env.CODEX_HOME,'thread_history_1.sqlite'));
  history.exec('CREATE TABLE thread_items(thread_id TEXT,turn_id TEXT,item_id TEXT,created_at_ms INTEGER,item_type TEXT,item_json TEXT,rollout_ordinal INTEGER);CREATE TABLE thread_turns(thread_id TEXT,turn_id TEXT,status TEXT,started_at INTEGER,completed_at INTEGER,rollout_ordinal INTEGER)');
  state.exec('BEGIN');
  for(let n=0;n<205;n++)state.prepare('INSERT INTO threads VALUES(?,?,?,?,?)').run('s'+n,work,'0.160.0',Date.now(),Date.now()/1000);
  state.exec('COMMIT');history.exec('BEGIN');
  for(let n=0;n<286;n++)history.prepare('INSERT INTO thread_turns VALUES(?,?,?,?,?,?)').run('s0','t'+n,'completed',Date.now()-1000,Date.now(),n);
  history.prepare('INSERT INTO thread_turns VALUES(?,?,?,?,?,?)').run('s204','last','completed',Date.now()-1000,Date.now(),0);
  history.exec('COMMIT');
  const source=require('./integration/source.cjs'),rows=source.turns();
  assert.equal(rows.length,287);assert.equal(new Set(rows.map(t=>t.session+':'+t.turn)).size,287);
  assert(rows.some(t=>t.session==='s204'));assert.equal(source.health().available,true);
  // Out-of-scope metadata must never become an authorized turn.
  state.prepare('UPDATE threads SET cwd=? WHERE id=?').run(path.join(S.HOME,'internal'),'s0');
  assert.equal(source.turns().length,1);state.close();history.close();
`));

test("新整理绕过异常旧任务，冻结模型设置与所选日期，通过回执后保存", () =>
  runIsolated(`
  (async()=>{
  const cp=require('node:child_process'),{EventEmitter}=require('node:events');
  const library=path.join(S.HOME,'library'),work=path.join(path.dirname(S.HOME),'work');fs.mkdirSync(library);fs.mkdirSync(work);S.selectLibrary(library);
  S.atomic(path.join(S.HOME,'connection.json'),{enabled:true,library,roots:[work],codex:'synthetic-codex'});
  const P=require('./integration/preferences.cjs');const identity=S.personal().libraryId;
  for(const model of ['gpt-6-astra','gpt-6.1-sol','gpt-6-luna'])for(const effort of ['low','medium','high','xhigh','max'])
    assert.equal(P.save({...P.load(),organizerModel:model,organizerEffort:effort},identity).organizerEffort,effort);
  assert.throws(()=>P.save({...P.load(),organizerModel:'gpt-6-astra',organizerEffort:'none'},identity),/INVALID_ORGANIZER_SETTINGS/);
  P.save({...P.load(),organizerModel:'gpt-6-luna',organizerEffort:'none'},identity);
  P.save({...P.load(),organizerModel:'gpt-6-astra',organizerEffort:'high'},identity);
  const old=path.join(library,'jobs','old.json');S.atomic(old,{id:'old',state:'failed',applied:true});const bytes=fs.readFileSync(old);
  function record(turn,summary){const body={outcome:'change',items:[{kind:'implementation',title:'实现导出',summary}]};const h={cwd:work,session_id:'synthetic',turn_id:turn,tool_use_id:turn,tool_input:body};h.tool_input={...body,_gate:S.issue(h)};S.submit(h.tool_input);S.bind(h);}
  record('now','SELECTED_DAY_TEXT');
  const foreign={...S.list('stages')[0],id:'b'.repeat(64),date:'2026-01-01',items:[{kind:'finding',title:'旧日期',summary:'OTHER_DAY_MUST_NOT_SEND'}]};
  S.atomic(path.join(library,'stages',foreign.id+'.json'),foreign);S.atomic(path.join(library,'bindings',foreign.id+'.json'),{stage:foreign.id,digest:foreign.digest,call:'foreign'});
  const personal=S.personal();personal.store.notes[S.day()]={lesson:'PRIVATE_NOTE_MUST_NOT_SEND',tomorrow:''};S.savePersonal(personal.store,personal.revision,personal.libraryId);
  let child,args,sent;cp.spawn=(exe,a)=>{args=a;child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=t=>sent=t;child.kill=()=>{};return child;};
  const O=require('./integration/consolidate.cjs'),started=O.start(S.day(),null,{dailySummary:true});
  assert(started.id);assert(args.includes('model="gpt-6-astra"'));assert(args.includes('model_reasoning_effort="high"'));
  assert(sent.includes('SELECTED_DAY_TEXT'));assert(!sent.includes('OTHER_DAY_MUST_NOT_SEND'));assert(!sent.includes('PRIVATE_NOTE_MUST_NOT_SEND'));
  const file=path.join(library,'jobs',started.id+'.json'),job=S.read(file),dir=args[args.indexOf('-C')+1];
  P.save({...P.load(),organizerModel:'gpt-6-luna',organizerEffort:'low'},identity);
  assert.equal(job.model,'gpt-6-astra');assert.equal(job.reasoningEffort,'high');
  O.recover();assert.equal(S.read(file).state,'running');
  S.atomic(path.join(dir,'result.json'),{highlights:[],entries:[{title:'实现导出',summary:'导出实现尚未验证',next:'',sources:['m1'],work:{title:'实现导出',summary:'导出实现尚未验证'}}],unprocessed:[]});
  child.emit('close',0);await new Promise(r=>setTimeout(r,30));assert.equal(S.read(file).state,'complete');
  assert.equal(O.apply(started.id).added,1);assert.equal(O.apply(started.id).added,0);
  assert.equal(S.personal().store.notes[S.day()].lesson,'PRIVATE_NOTE_MUST_NOT_SEND');assert(fs.readFileSync(old).equals(bytes));
  assert.equal(S.status().jobs.find(j=>j.id===started.id).model,'gpt-6-astra');
  const J=require('./integration/job-state.cjs');assert.equal(J.finish(file,{state:'failed',error:'INTERRUPTED'}),false);
  assert.equal(S.read(file).state,'complete');assert.equal(S.read(file).applied,true);
  O.shutdown();fs.rmSync(dir,{recursive:true,force:true});
  })().catch(e=>{console.error(e);process.exitCode=1});
`));

test("同事项总览允许多种状态，内部条目仍不混淆完成与尝试", () =>
  runIsolated(`
  const O=require('./integration/consolidate.cjs');const items=[{id:'a',kind:'attempt'},{id:'b',kind:'implementation'}];
  const result={entries:[],unprocessed:[],highlights:[{text:'尝试未解决卡顿，替代实现尚未验证',sources:['a','b']}]};
  O.validateResult(result,items,true);
  assert.throws(()=>O.validateResult({...result,highlights:[{text:'编造',sources:['unknown']}]},items,true),/INVALID_HIGHLIGHTS/);
  assert.throws(()=>O.validateResult({entries:[{title:'功能完成',summary:'全部完成',next:'',sources:['a','b']}],highlights:[],unprocessed:[]},items),/MIXED_EVIDENCE_STATUS/);
`));
