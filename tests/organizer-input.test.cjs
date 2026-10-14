const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { EventEmitter } = require("node:events");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-short-input-"));
process.env.JINJINGTAI_HOME = path.join(root, "home");
process.env.CODEX_HOME = path.join(root, "codex");
const S = require("../integration/store.cjs"),
  Input = require("../integration/organizer-input.cjs");
const work = path.join(root, "work"),
  library = path.join(root, "library");
fs.mkdirSync(work, { recursive: true });
S.atomic(path.join(S.HOME, "connection.json"), {
  library,
  roots: [work],
  enabled: true,
  codex: "simulated-codex",
});
const snapshot = {
  type: "test",
  call: "fixture-call",
  command: "node --test feature.test.cjs",
  exitCode: 0,
  output: "LOCAL_LOG_ONLY " + "test output ".repeat(1000),
};
function stage(n) {
  return {
    id: S.hash(["stage", n]),
    at: "2026-10-06T00:00:00Z",
    source: { cwd: work },
    assessment: {
      verified: true,
      supportedItems: [
        { n: 0, verified: true },
        { n: 1, verified: false },
      ],
      snapshots: [snapshot, snapshot],
    },
    items: [
      {
        kind: "verified",
        title: "修复持久保存",
        summary: "重开可以看到已保存记录",
        evidence: ["node --test feature.test.cjs"],
      },
      {
        kind: "verified",
        title: "界面改动",
        summary: "实际效果还需核对",
        evidence: ["layout.tsx"],
        relations: [{ type: "supplements", target: "real-stage:0" }],
      },
    ],
  };
}
test("36份材料不因长日志或重复依据触发输入上限，完整来源和状态仍保留", () => {
  const stages = Array.from({ length: 36 }, (_, n) => stage(n)),
    before = JSON.stringify(stages),
    collected = Input.collectStages(stages),
    input = Input.project(collected.items);
  assert.equal(input.materials.length, 72);
  Input.check(input);
  assert(input.serialized.length < 40000);
  assert(!input.serialized.includes("LOCAL_LOG_ONLY"));
  assert(!input.serialized.includes("fixture-call"));
  assert.equal(Object.keys(collected.evidenceCatalog).length, 1);
  assert.equal(
    collected.evidenceCatalog[S.hash(snapshot)].output,
    snapshot.output,
  );
  assert.equal(JSON.stringify(stages), before);
  assert.deepEqual(
    input.materials.map((i) => i.id),
    collected.items.map((i) => i.id),
  );
  assert.equal(input.materials[0].kind, "verified");
  assert.equal(input.materials[0].verification, "supported");
  assert.equal(input.materials[1].kind, "implementation");
  assert.equal(input.materials[1].verification, "not_supported");
  assert.deepEqual(input.materials[1].relations, stages[0].items[1].relations);
});
test("投影使用白名单，已确认归组保持范围，人工文字附件和额外字段无法混入", () => {
  const s = stage(1),
    id = s.id + ":0",
    collected = Input.collectStages([s], {
      dailySummary: true,
      groupingIds: new Set([id]),
      groupingUnits: new Map([[id, "confirmed-record"]]),
    });
  const input = Input.project(
    collected.items.map((i) => ({
      ...i,
      personalText: "PRIVATE_HUMAN",
      attachments: ["PRIVATE_IMAGE"],
      evidence: [...i.evidence, "PRIVATE_LOG"],
    })),
  );
  assert(!input.serialized.includes("PRIVATE_"));
  assert.equal(input.materials[0].groupingUnit, "confirmed-record");
  assert.equal(input.materials[0].groupOnly, true);
  assert.equal(input.materials[1].groupOnly, false);
  assert.deepEqual(collected.items[0].evidenceRefs, []);
});
test("漏记补整理只提交有限必要片段，不提交JSON长总结、哈希或完整输出", () => {
  const snapshots = [
    ...Array.from({ length: 12 }, () => snapshot),
    ...Array.from({ length: 12 }, (_, n) => ({
      type: "file",
      path: "file" + n,
      digest: "LOCAL_HASH",
      observedAt: "now",
      hashMeaning: "current only",
    })),
  ];
  const original = {
    id: "recovery:fixture:turn",
    kind: "attempt",
    title: "恢复来源",
    summary: "LONG_SUMMARY_LOCAL " + JSON.stringify(snapshots),
    snapshots,
    evidence: snapshots.map((s) => JSON.stringify(s)),
    coverage: {
      mode: "necessary-test-and-artifact-fragments",
      session: "fixture",
      turn: "turn",
      omitted: 3,
    },
  };
  const input = Input.project([original]);
  assert(!input.serialized.includes("LONG_SUMMARY_LOCAL"));
  assert(!input.serialized.includes("LOCAL_HASH"));
  assert.equal(input.materials[0].recovery.tests.length, 8);
  assert.equal(input.materials[0].recovery.tests[0].output.length, 400);
  assert.equal(input.materials[0].recovery.omittedTests, 4);
  assert.equal(input.materials[0].recovery.omittedFiles, 4);
  assert.equal(input.materials[0].recovery.coverage.omitted, 3);
  assert(original.summary.includes("LONG_SUMMARY_LOCAL"));
});
test("真正超长的小结和超量条目分别报错，不截断或静默丢材料", () => {
  const item = {
    id: "a",
    kind: "finding",
    title: "发现",
    summary: "x".repeat(90001),
  };
  assert.throws(() => Input.check(Input.project([item])), /SCOPE_TEXT_LIMIT/);
  assert.throws(
    () =>
      Input.check(
        Input.project(
          Array.from({ length: 161 }, (_, n) => ({
            ...item,
            id: String(n),
            summary: "短句",
          })),
        ),
      ),
    /SCOPE_ITEM_LIMIT/,
  );
  assert.equal(item.summary.length, 90001);
});
test("短引用仅经明确映射还原，不猜测或修补编造来源", () => {
  const collected = Input.collectStages([stage(3)]),
    input = Input.project(collected.items, { aliases: true });
  assert.deepEqual(
    input.materials.map((i) => i.id),
    ["m1", "m2"],
  );
  assert.equal(input.sourceAliases.m1, collected.items[0].id);
  const result = {
      entries: [{ sources: ["m1"] }],
      highlights: [{ sources: ["m2"] }],
      unprocessed: [],
    },
    restored = Input.restore(result, input.sourceAliases);
  assert.equal(restored.entries[0].sources[0], collected.items[0].id);
  assert.equal(restored.highlights[0].sources[0], collected.items[1].id);
  for (const id of ["m999", collected.items[0].id, "__proto__"])
    assert.throws(
      () =>
        Input.restore({ ...result, unprocessed: [id] }, input.sourceAliases),
      /INVALID_CITATION/,
    );
});
test("紧凑输入共享项目和阶段时间，不发送真实目录、长归组键或历史哈希", () => {
  const stages = [stage(1), stage(2)],
    id = stages[0].id + ":0",
    old = "a".repeat(64) + ":2";
  stages[1].items[0].relations = [{ type: "negates", target: old }];
  const collected = Input.collectStages(stages, {
    dailySummary: true,
    groupingIds: new Set([id, stages[0].id + ":1"]),
    groupingUnits: new Map([
      [id, "PRIVATE_LONG_GROUP"],
      [stages[0].id + ":1", "PRIVATE_LONG_GROUP"],
    ]),
  });
  const input = Input.project(collected.items, {
      aliases: true,
      compact: true,
    }),
    payload = JSON.parse(input.serialized),
    p = payload.projects[0];
  assert.equal(payload.projects.length, 1);
  assert.equal(p.stages.length, 2);
  assert.equal(p.stages[0].items.length, 2);
  assert.equal(p.stages[0].time, "10-06 08:00");
  assert.equal(
    p.stages[0].items[0].lockedGroup,
    p.stages[0].items[1].lockedGroup,
  );
  assert(!input.serialized.includes(work));
  assert(!input.serialized.includes("PRIVATE_LONG_GROUP"));
  assert(!input.serialized.includes(old));
  assert.equal(
    input.historicalAliases[p.stages[1].items[0].relations.negates[0]],
    old,
  );
  assert(input.serialized.length < input.stats.plainProjectionChars);
  const rows = p.stages.flatMap((s) => s.items);
  assert.deepEqual(
    rows.map((i) => input.sourceAliases[i.id]),
    collected.items.map((i) => i.id),
  );
  assert.deepEqual(
    rows.map((i) => i.summary),
    collected.items.map((i) => i.summary),
  );
});
test("紧凑输入保留跨项目边界、凌晨更正先后及空值省略，不截短小结", () => {
  const items = [
    {
      id: "b",
      workspace: "PROJECT_B",
      sourceAt: "2026-10-05T19:59:00Z",
      kind: "decision",
      title: "采用B",
      summary: "先前决定",
      next: "",
      relations: [],
    },
    {
      id: "a",
      workspace: "PROJECT_A",
      sourceAt: "2026-10-05T20:00:00Z",
      kind: "attempt",
      title: "排除B",
      summary: "失败说明".repeat(400),
      relations: [{ type: "negates", target: "b" }],
    },
    {
      id: "c",
      workspace: "PROJECT_A",
      sourceAt: "2026-10-05T19:59:00Z",
      kind: "finding",
      title: "发现风险",
      summary: "更早的发现",
    },
  ];
  const input = Input.project(items, { aliases: true, compact: true }),
    payload = JSON.parse(input.serialized);
  assert.equal(payload.projects.length, 2);
  assert.deepEqual(Object.values(input.projectAliases), [
    "PROJECT_B",
    "PROJECT_A",
  ]);
  assert.equal(payload.projects[1].stages[0].items[0].title, "发现风险");
  assert.equal(
    payload.projects[1].stages[1].items[0].summary,
    items[1].summary,
  );
  assert.deepEqual(payload.projects[1].stages[1].items[0].relations.negates, [
    "m1",
  ]);
  assert.equal(payload.projects[1].stages[0].time, "10-06 03:59");
  assert.equal(payload.projects[1].stages[1].time, "10-06 04:00");
  assert(!Object.hasOwn(payload.projects[0].stages[0].items[0], "next"));
});
test("紧凑漏记输入保留必要片段及遗漏计数，真实会话轮次仅存本地", () => {
  const item = {
    id: "recovery:REAL_SESSION:REAL_TURN",
    workspace: work,
    kind: "attempt",
    title: "恢复",
    summary: "不能作为完整覆盖",
    coverage: {
      mode: "necessary-test-and-artifact-fragments",
      session: "REAL_SESSION",
      turn: "REAL_TURN",
      omitted: 5,
    },
    snapshots: [
      {
        type: "test",
        command: "node --test failure.cjs",
        exitCode: 1,
        output: "expected 6; actual 5",
      },
    ],
  };
  const input = Input.project([item], { aliases: true, compact: true }),
    row = input.payload.projects[0].stages[0].items[0];
  assert.equal(row.recovery.omitted, 5);
  assert.equal(row.recovery.tests[0].exitCode, 1);
  assert.equal(row.recovery.tests[0].output, "expected 6; actual 5");
  assert(!input.serialized.includes("REAL_SESSION"));
  assert(!input.serialized.includes("REAL_TURN"));
  assert.equal(input.sourceAliases.m1, item.id);
});
test("Windows短暂替换冲突只重试原子rename，不删除已有权威文件", () => {
  if (process.platform !== "win32") return;
  const target = path.join(root, "authority.json");
  S.atomic(target, { revision: 1 });
  const rename = fs.renameSync;
  let attempts = 0;
  fs.renameSync = (from, to) => {
    if (to === target && attempts++ < 2) {
      assert.equal(S.read(target).revision, 1);
      const e = Error("transient sharing violation");
      e.code = "EPERM";
      throw e;
    }
    return rename(from, to);
  };
  try {
    S.atomic(target, { revision: 2 });
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(attempts, 3);
  assert.equal(S.read(target).revision, 2);
});
test("实际启动入口仅向模拟进程stdin发送短材料，本地完整依据和人工记录保留", async () => {
  const cp = require("node:child_process"),
    originalSpawn = cp.spawn;
  let sent = "",
    child,
    spawnDir;
  cp.spawn = (_exe, _args, opts) => {
    spawnDir = _args[_args.indexOf("-C") + 1];
    child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.end = (text) => {
      sent = text;
    };
    child.kill = () => {};
    return child;
  };
  const O = require("../integration/consolidate.cjs");
  cp.spawn = originalSpawn;
  const h = {
    cwd: work,
    session_id: "fixture",
    turn_id: "record",
    tool_use_id: "record",
    tool_input: {
      outcome: "change",
      items: stage(0).items.map((i) => ({ ...i, relations: [] })),
    },
  };
  h.tool_input._gate = S.issue(h);
  const receipt = S.submit(h.tool_input, null, stage(0).assessment);
  S.bind(h);
  const p = S.personal();
  p.store.notes[S.day()] = { lesson: "PRIVATE_REVIEW", tomorrow: "" };
  p.store.records.push({
    id: "human",
    project: "unassigned",
    next: "",
    kind: "发现",
    date: S.day(),
    manual: true,
    confirmed: true,
    title: "PRIVATE_BODY",
    change: "PRIVATE_TEXT",
    attachments: [{ id: "PRIVATE_ATTACHMENT", name: "PRIVATE_IMAGE", size: 0 }],
  });
  S.savePersonal(p.store, p.revision, p.libraryId);
  const before = S.personal();
  const result = O.start(S.day(), [receipt.id], { dailySummary: true }),
    j = S.read(path.join(library, "jobs", result.id + ".json"));
  assert(!sent.includes("LOCAL_LOG_ONLY"));
  assert(!sent.includes("PRIVATE_"));
  assert(!sent.includes(work));
  assert.equal(Object.keys(j.evidenceCatalog).length, 1);
  assert.equal(j.materials[0].evidenceRefs.length, 1);
  assert.equal(j.inputVersion, "short-stage-v5-directory");
  assert(j.requestChars < 10000);
  assert.equal(j.processStarts, 1);
  const schema = S.read(path.join(spawnDir, "schema.json"));
  assert.deepEqual(
    schema.properties.entries.items.properties.sources.items.enum,
    Object.keys(j.sourceAliases),
  );
  const workResult = {
    title: "让记录可靠保存",
    summary: "重开保存已通过验证，界面改动仍需核对。",
  };
  S.atomic(path.join(spawnDir, "result.json"), {
    highlights: [],
    entries: j.materials.map((i, n) => ({
      title: i.title,
      summary: i.summary,
      next: "",
      sources: ["m" + (n + 1)],
      work: workResult,
    })),
    unprocessed: [],
  });
  child.stdout.emit(
    "data",
    JSON.stringify({
      type: "turn.completed",
      usage: { input_tokens: 1, output_tokens: 1 },
    }) + "\n",
  );
  child.emit("close", 0);
  assert.equal(
    S.read(path.join(library, "jobs", result.id + ".json")).state,
    "complete",
  );
  const applied = O.apply(result.id);
  assert.equal(applied.added, 2);
  assert.deepEqual(applied.store.records[0], before.store.records[0]);
  assert.deepEqual(applied.store.notes, before.store.notes);
  assert.equal(O.apply(result.id).added, 0);
  assert.deepEqual(
    S.list("stages")[0].assessment.snapshots,
    stage(0).assessment.snapshots,
  );
});
