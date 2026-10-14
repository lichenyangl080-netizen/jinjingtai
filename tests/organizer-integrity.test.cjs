const test = require("node:test");
const { runIsolated } = require("./helpers/isolated-library.cjs");

const fixture = `
  const O=require('./integration/consolidate.cjs');
  const library=path.join(S.HOME,'library');fs.mkdirSync(library);S.selectLibrary(library);
  const material={id:'synthetic:0',kind:'implementation',title:'合成来源',summary:'Synthetic source',workspace:'',evidence:[],relations:[]};
  const entry={title:'合成事项',summary:'Synthetic result',next:'',sources:[material.id],work:{title:'合成工作',summary:'Synthetic work'}};
  const job={id:'complete',date:'2026-10-10',policy:'daily-work-v3',state:'complete',mode:'drafts',materials:[material],result:{entries:[entry],unprocessed:[],highlights:[]}};
  const authority=path.join(library,'personal.json'),file=path.join(library,'jobs',job.id+'.json');
`;

test("任务文件名不匹配时隔离原文件，恢复不覆盖完好完成结果", () =>
  runIsolated(
    fixture +
      `
  S.atomic(file,job);const before=fs.readFileSync(file);
  const bad=path.join(library,'jobs','mismatch.json');S.atomic(bad,{id:job.id,state:'running',materials:[]});const badBefore=fs.readFileSync(bad);
  O.recover();assert(fs.readFileSync(file).equals(before));assert(fs.readFileSync(bad).equals(badBefore));
  assert.equal(S.list('jobs').length,1);assert.equal(S.status().metadataHealth.available,false);
  assert.throws(()=>O.apply('mismatch'),/LOCAL_METADATA_INVALID/);
`,
  ));

test("运行任务的已应用矛盾状态隔离，后续完好任务继续恢复", () =>
  runIsolated(
    fixture +
      `
  const bad=path.join(library,'jobs','a-bad.json');S.atomic(bad,{id:'a-bad',state:'running',applied:true});const before=fs.readFileSync(bad);
  S.atomic(file,{...job,state:'running'});O.recover();assert(fs.readFileSync(bad).equals(before));
  assert.equal(S.read(file).state,'failed');assert.equal(S.read(file).error,'INTERRUPTED');assert.equal(S.status().metadataHealth.available,false);
`,
  ));

test("显式未知策略拒绝应用且字节不变，已知旧策略和无策略资料仍兼容", () =>
  runIsolated(
    fixture +
      `
  job.policy='daily-work-v4';S.atomic(file,job);const before=fs.readFileSync(authority),receipt=fs.readFileSync(file);
  assert.equal(S.list('jobs').length,0);assert.throws(()=>O.apply(job.id),/LOCAL_METADATA_INVALID/);
  assert(fs.readFileSync(authority).equals(before));assert(fs.readFileSync(file).equals(receipt));
  const P=require('./integration/job-policy.cjs');assert.throws(()=>P.flags('daily-work-v4'),/JOB_POLICY_UNSUPPORTED/);
  for(const policy of ['daily-compact-v1','daily-summary-v1','daily-work-v2','daily-work-v3'])assert.equal(P.flags(policy).validate,true);
  delete job.policy;S.atomic(file,job);assert.equal(O.apply(job.id).added,1);assert.equal(S.personal().authorityIssues.length,0);
`,
  ));

test("旧资料库预览不能在新库启动整理或创建任务", () =>
  runIsolated(
    fixture +
      `
  const oldId=S.personal().libraryId;const other=path.join(S.HOME,'other');fs.mkdirSync(other);S.selectLibrary(other);
  const before=fs.readFileSync(path.join(other,'personal.json'));
  assert.throws(()=>O.start(job.date,[],{expectedLibraryId:oldId}),/LIBRARY_CHANGED/);
  assert(fs.readFileSync(path.join(other,'personal.json')).equals(before));assert.equal(S.list('jobs').length,0);
`,
  ));

test("请求超时归入网络诊断", () => {
  const E = require("../integration/organizer-errors.cjs");
  for (const message of ["request timed out", "request timeout", "ETIMEDOUT"]) {
    require("node:assert/strict").equal(
      E.classify(null, message),
      "CODEX_NETWORK_ERROR",
    );
  }
});

test("任务身份和回执不能绕过共享校验", () => {
  const { validMetadata } = require("../integration/metadata-schema.cjs");
  const assert = require("node:assert/strict");
  assert.equal(
    validMetadata("jobs", {
      id: "../../personal",
      state: "running",
      materials: [],
    }),
    false,
  );
  assert.equal(
    validMetadata("jobs", { id: "running", state: "running", applied: "yes" }),
    false,
  );
});

test("完成任务缺少结果时隔离并保留原文件", () =>
  runIsolated(
    fixture +
      `
  delete job.result;S.atomic(file,job);const before=fs.readFileSync(file);
  assert.equal(S.list('jobs').length,0);assert(fs.readFileSync(file).equals(before));
  assert.equal(S.status().metadataHealth.available,false);
`,
  ));

test("缺字段整理结果拒绝提交，个人资料与任务回执字节不变", () =>
  runIsolated(
    fixture +
      `
  delete entry.next;S.atomic(file,job);
  const before=fs.readFileSync(authority),receipt=fs.readFileSync(file);
  assert.throws(()=>O.validateResult(job.result,job.materials,false,true,true),/INVALID_ENTRY/);
  assert.throws(()=>O.apply(job.id),/LOCAL_METADATA_INVALID/);
  assert(fs.readFileSync(authority).equals(before));assert(fs.readFileSync(file).equals(receipt));
  assert.equal(S.personal().authorityIssues.length,0);
`,
  ));

test("损坏隐藏状态阻止迟到结果，修复后才可重试且保留隐藏决定", () =>
  runIsolated(
    fixture +
      `
  const visibility=path.join(library,'visibility','decision.json');
  S.atomic(file,job);S.atomic(visibility,{hidden:true,sourceIds:null});
  const before=fs.readFileSync(authority),receipt=fs.readFileSync(file);
  assert.throws(()=>O.apply(job.id),/LOCAL_METADATA_INVALID/);
  assert(fs.readFileSync(authority).equals(before));assert(fs.readFileSync(file).equals(receipt));
  S.atomic(visibility,{hidden:true,sourceIds:[material.id]});
  assert.equal(O.apply(job.id).added,0);assert.equal(S.personal().store.records.length,0);
`,
  ));

test("结构坏任务独立报告，完好运行任务仍能恢复", () =>
  runIsolated(
    fixture +
      `
  const bad=path.join(library,'jobs','a-bad.json');S.atomic(bad,{id:'a-bad',state:'running'});
  const bytes=fs.readFileSync(bad);S.atomic(file,{...job,state:'running'});
  O.recover();assert(fs.readFileSync(bad).equals(bytes));
  assert.equal(S.read(file).state,'failed');assert.equal(S.read(file).error,'INTERRUPTED');
  const status=S.status();assert.equal(status.metadataHealth.available,false);
  assert(status.metadataHealth.errors.some(e=>e.folder==='jobs'&&e.file==='a-bad.json'));
`,
  ));

test("整理与手工提交共享个人资料校验，非法日期不落盘，正常结果重载有效且幂等", () =>
  runIsolated(
    fixture +
      `
  job.date='2026-02-30';S.atomic(file,job);const before=fs.readFileSync(authority);
  assert.throws(()=>O.apply(job.id),/INVALID_STORE/);assert(fs.readFileSync(authority).equals(before));assert(!S.read(file).applied);
  job.date='2026-10-10';S.atomic(file,job);assert.equal(O.apply(job.id).added,1);
  assert.equal(S.personal().authorityIssues.length,0);assert.equal(S.personal().store.records.length,1);
  assert.equal(O.apply(job.id).added,0);
  assert.throws(()=>S.savePersonalLocked(S.personal().store,S.personal().revision,S.personal().libraryId),/STORE_LOCK_REQUIRED/);
`,
  ));

test("整理预览采用现有人工项目名称，目录别名仍用于首次创建", () =>
  runIsolated(`
  const P=require('./integration/preferences.cjs');
  const library=path.join(S.HOME,'library'),work=path.join(S.HOME,'work');fs.mkdirSync(library);fs.mkdirSync(work);S.selectLibrary(library);
  const info=P.project(work);assert.equal(P.project(work,[{...info,name:'人工名称'}]).name,'人工名称');
  assert.equal(P.project(work).name,info.name);
`));
