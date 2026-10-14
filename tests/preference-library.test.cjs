const test = require("node:test");
const { runIsolated } = require("./helpers/isolated-library.cjs");

test("另一进程切库后，旧阅读与目录别名设置不能覆盖新库；缺身份同样拒收", () =>
  runIsolated(`
    const P=require('./integration/preferences.cjs');
    const a=path.join(S.HOME,'a'),b=path.join(S.HOME,'b');
    fs.mkdirSync(a);fs.mkdirSync(b);S.selectLibrary(b);
    P.save({...P.load(),fontSize:17,workspaceNames:{[path.join(S.HOME,'work-b')]:'B'}},S.personal().libraryId);
    const beforeB=fs.readFileSync(path.join(b,'preferences.json'));
    S.selectLibrary(a);
    P.save({...P.load(),fontSize:15,workspaceNames:{[path.join(S.HOME,'work-a')]:'A'}},S.personal().libraryId);
    const stale=P.load(),identity=S.personal().libraryId,beforeA=fs.readFileSync(path.join(a,'preferences.json'));
    const child=spawnSync(process.execPath,['-e',"require('./integration/store.cjs').selectLibrary(process.argv[1])",b],{env:process.env,encoding:'utf8',windowsHide:true});
    assert.equal(child.status,0,child.stderr);
    assert.throws(()=>P.save(stale,identity),/LIBRARY_CHANGED/);
    assert.throws(()=>P.save(stale),/LIBRARY_CHANGED/);
    assert(fs.readFileSync(path.join(a,'preferences.json')).equals(beforeA));
    assert(fs.readFileSync(path.join(b,'preferences.json')).equals(beforeB));
    const fresh={...P.load(),fontSize:16};
    assert.equal(P.save(fresh,S.personal().libraryId).fontSize,16);
    assert.deepEqual(P.load().workspaceNames,fresh.workspaceNames);
  `));
