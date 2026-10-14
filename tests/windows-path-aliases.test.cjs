const test = require("node:test");
const { runIsolated } = require("./helpers/isolated-library.cjs");

test("目录别名使用真实目录身份，兼容旧路径键且不改已命名项目或授权范围", () => {
  runIsolated(`
    const P=require('./integration/preferences.cjs');
    const parent=path.dirname(S.HOME),work=path.join(parent,'work'),alias=path.join(parent,'alias'),library=path.join(parent,'library');
    fs.mkdirSync(work);fs.mkdirSync(library);
    fs.symlinkSync(work,alias,process.platform==='win32'?'junction':'dir');
    S.atomic(path.join(S.HOME,'connection.json'),{enabled:true,library,roots:[work],scopeMode:'selected'});
    const id=S.personal().libraryId;
    const saved=P.save({...P.load(),workspaceNames:{[alias]:'我的项目'}},id);
    assert.equal(saved.workspaceNames[S.canonical(work)],'我的项目');
    assert.equal(P.project(work).name,'我的项目');
    assert.equal(P.project(alias).name,'我的项目');
    assert.equal(P.project(alias).id,P.project(work).id);
    assert.throws(()=>S.authorize(parent),/OUTSIDE_SCOPE/);
    assert.deepEqual(S.config().roots,[work]);
    S.atomic(path.join(library,'preferences.json'),{...saved,workspaceNames:{[alias.toLowerCase()]:'旧名称'}});
    const before=fs.readFileSync(path.join(library,'preferences.json'));
    assert.equal(P.project(work).name,'旧名称');
    const existing={id:P.project(work).id,name:'人工项目名'};
    assert.equal(P.project(alias,[existing]).name,'人工项目名');
    assert(fs.readFileSync(path.join(library,'preferences.json')).equals(before));
  `);
});

test("发行事务接受同一父目录的别名，仍拒绝越界、链接产物、错配和资料清理", () => {
  runIsolated(`
    (async()=>{
      const {validateTransaction,removeArtifact}=await import('./scripts/package-retention.mjs');
      const parent=path.dirname(S.HOME),release=path.join(parent,'release'),alias=path.join(parent,'release-alias'),outside=path.join(parent,'outside');
      fs.mkdirSync(release);fs.mkdirSync(outside);
      fs.symlinkSync(release,alias,process.platform==='win32'?'junction':'dir');
      const tx={target:path.join(alias,'进境台'),stage:path.join(alias,'.stage-123'),backup:path.join(alias,'进境台.previous-123')};
      assert.equal(validateTransaction(alias,tx),tx);
      assert.equal(validateTransaction(release,tx),tx);
      assert.throws(()=>validateTransaction(release,{...tx,backup:path.join(outside,'进境台.previous-123')}),/TRANSACTION_UNSAFE/);
      assert.throws(()=>validateTransaction(release,{...tx,stage:path.join(alias,'.stage-124')}),/TRANSACTION_UNSAFE/);
      fs.symlinkSync(outside,tx.stage,process.platform==='win32'?'junction':'dir');
      assert.throws(()=>validateTransaction(release,tx),/TRANSACTION_UNSAFE/);
      assert.throws(()=>removeArtifact(release,tx.stage,true),/PATH_UNSAFE/);
      const artifact=path.join(alias,'.stage-456');fs.mkdirSync(artifact);
      fs.writeFileSync(path.join(artifact,'personal.json'),'SYNTHETIC_AUTHORITY');
      assert.throws(()=>removeArtifact(release,artifact,true),/CONTAINS_AUTHORITY/);
      assert.equal(fs.readFileSync(path.join(artifact,'personal.json'),'utf8'),'SYNTHETIC_AUTHORITY');
      const clean=path.join(alias,'.stage-789');fs.mkdirSync(clean);
      removeArtifact(release,clean,true);assert(!fs.existsSync(clean));
    })().catch(e=>{console.error(e);process.exitCode=1;});
  `);
});
