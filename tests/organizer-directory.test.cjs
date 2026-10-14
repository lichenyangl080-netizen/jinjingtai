const test = require("node:test"),
  assert = require("node:assert/strict");
const { runIsolated } = require("./helpers/isolated-library.cjs");
test("目录按事项压缩旧材料，保留类型、来源和更正关系，完整旧材料只留本地", () => {
  const I = require("../integration/organizer-input.cjs");
  const items = Array.from({ length: 20 }, (_, n) => ({
    id: "old" + n,
    workspace: "w",
    kind: n % 2 ? "attempt" : "implementation",
    title: "旧步骤" + n,
    summary: "不重复发送的阶段原文" + n,
    groupOnly: true,
    groupingUnit: "work",
    relations: n === 19 ? [{ type: "negates", target: "old0" }] : [],
  }));
  items.push({
    id: "new",
    workspace: "w",
    kind: "implementation",
    title: "添加字幕",
    summary: "字幕已添加，尚未验证",
    relations: [],
  });
  const input = I.project(items, {
    aliases: true,
    compact: true,
    onDemand: true,
    directory: {
      work: { title: "第五期视频制作", summary: "完成剪辑，字幕尚未完成" },
    },
  });
  const wire = JSON.parse(input.serialized),
    p = wire.projects[0];
  assert.equal(p.items.length, 1);
  assert.equal(p.directory.length, 1);
  assert.equal(p.directory[0].title, "第五期视频制作");
  assert.equal(p.directory[0].sources.attempt.length, 10);
  assert.equal(p.directory[0].relations[0].negates[0], "m1");
  assert(!input.serialized.includes("不重复发送的阶段原文"));
  assert.equal(input.materials[0].summary, items[0].summary);
  assert.equal(Object.keys(input.sourceAliases).length, 21);
});

test("新增接入旧事项目录、重复整理跳过、人工正文隔离、历史准确与切库拒绝", () =>
  runIsolated(`
  (async()=>{
    const cp=require('node:child_process'),{EventEmitter}=require('node:events');
    const library=path.join(S.HOME,'library'), work=path.join(path.dirname(S.HOME),'work'); fs.mkdirSync(library);fs.mkdirSync(work); S.selectLibrary(library);
    S.atomic(path.join(S.HOME,'connection.json'),{enabled:true,library,roots:[work],codex:'simulated'});
    let child, sent, dir;
    cp.spawn=(_,args)=>{dir=args[args.indexOf('-C')+1]; child=new EventEmitter(); child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=t=>sent=t;child.kill=()=>{};return child;};
    const O=require('./integration/consolidate.cjs');
    function capture(turn,title,summary){const body={outcome:'change',items:[{kind:'implementation',title,summary}]};const h={cwd:work,session_id:'test',turn_id:turn,tool_use_id:turn,tool_input:body};h.tool_input={...body,_gate:S.issue(h)};S.submit(h.tool_input);S.bind(h);}
    async function finish(job,workTitle){const j=S.read(path.join(library,'jobs',job.id+'.json'));S.atomic(path.join(dir,'result.json'),{entries:j.materials.map((m,n)=>({title:m.title,summary:m.summary,next:'',sources:['m'+(n+1)],work:{title:workTitle,summary:'隔离测试：剪辑与字幕实现尚未验证'}})),highlights:[],unprocessed:[]}); child.emit('close',0);await new Promise(r=>setTimeout(r,30));assert.equal(S.read(path.join(library,'jobs',job.id+'.json')).state,'complete'); return O.apply(job.id);}
    capture('first','完成剪辑','OLD_STAGE_BODY');const first=O.start(S.day(),null,{dailySummary:true});await finish(first,'第五期视频制作');
    capture('second','添加字幕','NEW_STAGE_BODY'); const second=O.start(S.day(),null,{dailySummary:true});
    assert(sent.includes('第五期视频制作'), JSON.stringify({sent,records:S.personal().store.records,jobs:S.list('jobs')}));assert(sent.includes('NEW_STAGE_BODY'));assert(!sent.includes('OLD_STAGE_BODY'));
    const h=O.history(second.id,S.personal().libraryId);assert.equal(h.requestText,sent);assert.equal(h.directory.length,1);assert.equal(h.materials.length,2);
    const applied=await finish(second,'第五期视频制作');assert.equal(applied.added,1);assert.equal(S.personal().store.records.length,2);
    assert.equal(O.start(S.day(),null,{dailySummary:true}).skipped,true);
    const history=O.history(second.id,S.personal().libraryId);assert(history.result.entries.length);assert(history.applied);
    assert.throws(()=>O.history('../personal',S.personal().libraryId),/LOCAL_METADATA_INVALID/);
    assert.throws(()=>O.history(second.id,'other-library'),/LIBRARY_CHANGED/);
    // Even if a machine record was manually changed, never feed its text back.
    const p=S.personal();p.store.records[0].humanEdited=true;p.store.records[0].title='PRIVATE_HUMAN_TITLE';p.store.records[0].change='PRIVATE_HUMAN_BODY';S.savePersonal(p.store,p.revision,p.libraryId);
    capture('third','导出视频','NEW_EXPORT_BODY');const third=O.start(S.day(),null,{dailySummary:true});assert(!sent.includes('PRIVATE_HUMAN'));assert(!sent.includes('OLD_STAGE_BODY'));
    // A partial authorized old group must not reuse its full prior summary.
    assert(!sent.includes('隔离测试：剪辑与字幕实现尚未验证'));
    O.cancel(third.id);child.emit('close',0);O.shutdown();
  })().catch(e=>{console.error(e);process.exit(1)});
`));
