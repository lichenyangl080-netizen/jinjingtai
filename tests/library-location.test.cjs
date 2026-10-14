const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { spawnSync } = require("node:child_process");
const store = path.resolve(__dirname, "../integration/store.cjs");
function isolated(code) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-location-"));
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const S=require(${JSON.stringify(store)});const library=path.join(S.HOME,'data');const configure=()=>S.atomic(path.join(S.HOME,'connection.json'),{version:1,enabled:true,library,roots:[]});${code}`,
    ],
    { env: { ...process.env, JINJINGTAI_HOME: home }, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
}
test("新资料库只在明确配置时初始化，首次读取不创建假空资料", () =>
  isolated(
    `assert.throws(()=>S.personal(),/LIBRARY_NOT_INITIALIZED/);assert(!fs.existsSync(path.join(S.HOME,'library')));configure();assert.equal(S.personal().revision,0);assert.equal(S.status().libraryHealth.available,true);`,
  ));
test("已选择的目录丢失不会重建，save不能覆盖为零条", () =>
  isolated(
    `configure();fs.renameSync(library,library+'-moved');assert.throws(()=>S.personal(),/LIBRARY_DIRECTORY_MISSING/);assert.throws(()=>S.savePersonal(S.empty(),0),/LIBRARY_DIRECTORY_MISSING/);assert.equal(S.status().libraryHealth.error,'LIBRARY_DIRECTORY_MISSING');assert(!fs.existsSync(library));`,
  ));
test("权威JSON缺失或损坏阻止load、save和capture正文写入", () =>
  isolated(
    `configure();fs.renameSync(path.join(library,'personal.json'),path.join(library,'retained.json'));assert.throws(()=>S.personal(),/PERSONAL_DATA_MISSING/);assert.throws(()=>S.savePersonal(S.empty(),0),/PERSONAL_DATA_MISSING/);assert(!fs.existsSync(path.join(library,'personal.json')));fs.writeFileSync(path.join(library,'personal.json'),'{damaged');assert.throws(()=>S.personal(),/PERSONAL_DATA_UNREADABLE/);assert.equal(S.status().libraryHealth.error,'PERSONAL_DATA_UNREADABLE');assert.equal(fs.readFileSync(path.join(library,'personal.json'),'utf8'),'{damaged');`,
  ));
test("结构损坏不能当合法空资料，重新安装也不静默清空", () =>
  isolated(
    `configure();fs.writeFileSync(path.join(library,'personal.json'),JSON.stringify({revision:0,store:{records:[]}}));assert.throws(()=>S.personal(),/PERSONAL_DATA_INVALID/);assert.throws(()=>configure(),/PERSONAL_DATA_INVALID/);`,
  ));
test("配置缺失时可信位置仅允许本地读取，不恢复采集授权", () =>
  isolated(
    `configure();S.atomic(path.join(S.HOME,'library-location.json'),{library});const before=S.personal();fs.renameSync(path.join(S.HOME,'connection.json'),path.join(S.HOME,'saved-connection.json'));assert.equal(S.config().connectionError,'CONNECTION_CONFIG_MISSING');assert.equal(S.config().enabled,false);assert.deepEqual(S.personal(),before);assert.throws(()=>S.authorize(S.HOME),/NOT_AUTHORIZED/);`,
  ));
test("位置指针损坏与历史位置丢失明确报错，不能回退默认库", () =>
  isolated(
    `configure();fs.renameSync(path.join(S.HOME,'connection.json'),path.join(S.HOME,'saved-connection.json'));assert.throws(()=>S.config(),/LIBRARY_LOCATION_MISSING/);fs.writeFileSync(path.join(S.HOME,'library-location.json'),'{broken');assert.throws(()=>S.config(),/LIBRARY_LOCATION_UNREADABLE/);assert(!fs.existsSync(path.join(S.HOME,'library')));`,
  ));
test("已有阶段而无个人权威文件拒绝初始化，旧合法库原文保留", () =>
  isolated(
    `fs.mkdirSync(path.join(library,'stages'),{recursive:true});assert.throws(()=>configure(),/PERSONAL_DATA_MISSING/);fs.writeFileSync(path.join(library,'personal.json'),JSON.stringify({revision:4,store:{...S.empty(),notes:{'2026-10-05':{lesson:'我的手写内容',tomorrow:''}}}}));configure();assert.equal(S.personal().revision,4);assert.equal(S.personal().store.notes['2026-10-05'].lesson,'我的手写内容');`,
  ));
test("迁移兼容配置同步，旧人工资料目录不能被all-workspaces采集", () =>
  isolated(
    `const legacy=path.join(S.HOME,'old','connection.json');S.atomic(path.join(S.HOME,'connection.json'),{version:1,enabled:true,library,roots:[],scopeMode:'all-workspaces',legacyConfigFiles:[legacy],legacyDataRoots:[path.dirname(legacy)]});assert.equal(JSON.parse(fs.readFileSync(legacy)).library,library);assert.throws(()=>S.authorize(path.dirname(legacy)),/INTERNAL_TASK/);`,
  ));
