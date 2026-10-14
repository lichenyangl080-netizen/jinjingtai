const test = require("node:test");
const { runIsolated } = require("./helpers/isolated-library.cjs");

test("另一进程切库后，相同revision也不能用旧资料覆盖新库", () =>
  runIsolated(`
  const a=path.join(S.HOME,'a'),b=path.join(S.HOME,'b');
  fs.mkdirSync(a);fs.mkdirSync(b);S.selectLibrary(b);
  let p=S.personal();p.store.notes['2026-10-07']={lesson:'B_ONLY',tomorrow:''};
  S.savePersonal(p.store,p.revision,p.libraryId);
  S.selectLibrary(a);p=S.personal();p.store.notes['2026-10-07']={lesson:'A_ONLY',tomorrow:''};
  S.savePersonal(p.store,p.revision,p.libraryId);
  const stale=S.personal(),beforeA=fs.readFileSync(path.join(a,'personal.json')),beforeB=fs.readFileSync(path.join(b,'personal.json'));
  assert.equal(stale.revision,S.read(path.join(b,'personal.json')).revision);
  const child=spawnSync(process.execPath,['-e',"require('./integration/store.cjs').selectLibrary(process.argv[1])",b],{env:process.env,encoding:'utf8',windowsHide:true});
  assert.equal(child.status,0,child.stderr);
  assert.throws(()=>S.savePersonal(stale.store,stale.revision,stale.libraryId),/LIBRARY_CHANGED/);
  assert.throws(()=>S.savePersonal(stale.store,stale.revision),/LIBRARY_CHANGED/);
  assert(fs.readFileSync(path.join(a,'personal.json')).equals(beforeA));
  assert(fs.readFileSync(path.join(b,'personal.json')).equals(beforeB));
  const fresh=S.personal();fresh.store.notes['2026-10-07'].tomorrow='B_EDIT';
  assert.equal(S.savePersonal(fresh.store,fresh.revision,fresh.libraryId).store.notes['2026-10-07'].tomorrow,'B_EDIT');
`));

test("写事务内切库仍固定原目标和锁目录，不把内容写到新库", () =>
  runIsolated(`
  const a=path.join(S.HOME,'a'),b=path.join(S.HOME,'b');
  fs.mkdirSync(a);fs.mkdirSync(b);S.selectLibrary(b);S.selectLibrary(a);
  const beforeB=fs.readFileSync(path.join(b,'personal.json'));
  S.withLock(()=>{
    const child=spawnSync(process.execPath,['-e',"require('./integration/store.cjs').selectLibrary(process.argv[1])",b],{env:process.env,encoding:'utf8',windowsHide:true});
    assert.equal(child.status,0,child.stderr);
    assert.equal(S.library(),S.canonical(a));
    const p=S.personal();p.store.notes['2026-10-07']={lesson:'ONLY_A',tomorrow:''};
    S.atomic(path.join(S.library(),'personal.json'),{revision:p.revision+1,store:p.store});
  });
  assert.equal(S.canonical(S.library()),S.canonical(b));
  assert(fs.readFileSync(path.join(b,'personal.json')).equals(beforeB));
  assert.equal(S.read(path.join(a,'personal.json')).store.notes['2026-10-07'].lesson,'ONLY_A');
  assert(!fs.existsSync(path.join(a,'.write-lock')));
`));

test("事务进程在写owner前退出，陈旧空锁可恢复；新锁和活跃锁仍拒绝", () =>
  runIsolated(`
  const T=require('./integration/file-transaction.cjs'),journal=path.join(S.HOME,'journal'),lock=journal+'.lock';
  const child=spawnSync(process.execPath,['-e',
    "const fs=require('node:fs'),T=require('./integration/file-transaction.cjs');const write=fs.writeFileSync;fs.writeFileSync=function(file,...args){if(typeof file==='number')process.exit(23);return write.call(this,file,...args)};T.recover(process.argv[1]);",journal],{env:process.env,windowsHide:true});
  assert.equal(child.status,23);assert.equal(fs.statSync(lock).size,0);
  assert.throws(()=>T.recover(journal),/CONNECTION_UPDATE_BUSY/);
  fs.utimesSync(lock,new Date('2020-01-01'),new Date('2020-01-01'));T.recover(journal);assert(!fs.existsSync(lock));
  fs.writeFileSync(lock,JSON.stringify({pid:process.pid}));fs.utimesSync(lock,new Date('2020-01-01'),new Date('2020-01-01'));
  assert.throws(()=>T.recover(journal),/CONNECTION_UPDATE_BUSY/);assert(fs.existsSync(lock));
  fs.writeFileSync(lock,'invalid owner');fs.utimesSync(lock,new Date('2020-01-01'),new Date('2020-01-01'));
  T.recover(journal);assert(!fs.existsSync(lock));
`));

test("枚举与漏记恢复按契约兼容新版本，未知状态和伪造退出类型仍拒绝", () =>
  runIsolated(`
  const {DatabaseSync}=require('node:sqlite');
  const work=path.join(path.dirname(S.HOME),'work'),library=path.join(S.HOME,'library');fs.mkdirSync(work);fs.mkdirSync(library);fs.mkdirSync(process.env.CODEX_HOME);
  S.atomic(path.join(S.HOME,'connection.json'),{enabled:true,roots:[work],library,codexHome:process.env.CODEX_HOME,installedAt:'2020-01-01T00:00:00Z'});
  const state=new DatabaseSync(path.join(process.env.CODEX_HOME,'state_5.sqlite'));
  state.exec('CREATE TABLE threads(id TEXT,cwd TEXT,cli_version TEXT,updated_at_ms INTEGER,updated_at INTEGER)');
  state.prepare('INSERT INTO threads VALUES(?,?,?,?,?)').run('session',work,'9.999.0',Date.now(),Date.now()/1000);
  const history=new DatabaseSync(path.join(process.env.CODEX_HOME,'thread_history_1.sqlite'));
  history.exec('CREATE TABLE thread_items(thread_id TEXT,turn_id TEXT,item_id TEXT,created_at_ms INTEGER,item_type TEXT,item_json TEXT,rollout_ordinal INTEGER);CREATE TABLE thread_turns(thread_id TEXT,turn_id TEXT,status TEXT,started_at INTEGER,completed_at INTEGER,rollout_ordinal INTEGER)');
  history.prepare('INSERT INTO thread_turns VALUES(?,?,?,?,?,?)').run('session','turn','completed',Date.now()-1000,Date.now(),0);
  history.prepare('INSERT INTO thread_items VALUES(?,?,?,?,?,?,?)').run('session','turn','item',Date.now(),'commandExecution',JSON.stringify({cwd:work,command:'node --test fixture.test.cjs',exitCode:0}),0);
  const Source=require('./integration/source.cjs');
  assert.equal(Source.turns().length,1);assert.equal(Source.health().available,true);
  assert.equal(Source.recoverTurn('session','turn').kind,'verified');
  history.prepare('UPDATE thread_turns SET status=?').run('unknown');
  assert.deepEqual(Source.turns(),[]);assert.equal(Source.health().error,'SOURCE_RECORD_UNSUPPORTED');
  assert.throws(()=>Source.recoverTurn('session','turn'),/SOURCE_RECORD_UNSUPPORTED/);
  history.prepare('UPDATE thread_turns SET status=?').run('completed');
  history.prepare('UPDATE thread_items SET item_json=?').run(JSON.stringify({cwd:work,command:'node --test fixture.test.cjs',exitCode:'0'}));
  assert.throws(()=>Source.recoverTurn('session','turn'),/SOURCE_RECORD_UNSUPPORTED/);
  history.prepare('UPDATE thread_items SET item_json=?').run(JSON.stringify({cwd:work,command:'node --test fixture.test.cjs',exitCode:0}));
  state.prepare('UPDATE threads SET cli_version=?').run('0.160.0');
  assert.equal(Source.turns().length,1);assert.equal(Source.health().available,true);
  assert.equal(Source.recoverTurn('session','turn').kind,'verified');state.close();history.close();
`));
