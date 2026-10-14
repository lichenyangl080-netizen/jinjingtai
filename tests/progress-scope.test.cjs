const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-all-scope-"));
process.env.JINJINGTAI_HOME = path.join(root, "home");
process.env.CODEX_HOME = path.join(root, "codex");
const S = require("../integration/store.cjs"),
  C = require("../integration/connection.cjs"),
  O = require("../integration/consolidate.cjs");
const a = path.join(root, "alpha"),
  b = path.join(root, "beta"),
  library = path.join(root, "library");
for (const p of [a, b, library, process.env.CODEX_HOME])
  fs.mkdirSync(p, { recursive: true });
function record(turn, cwd, item) {
  const h = {
    cwd,
    session_id: "simulated",
    turn_id: turn,
    tool_use_id: turn,
    tool_input: { outcome: "change", items: [item] },
  };
  h.tool_input._gate = S.issue(h);
  const r = S.submit(h.tool_input);
  S.bind(h);
  return r.id;
}
test("模拟：全目录增量安装及撤销，保留全局覆盖指令和其他配置", () => {
  const override = path.join(process.env.CODEX_HOME, "AGENTS.override.md");
  fs.writeFileSync(override, "保留用户全局规则\n");
  C.install({
    library,
    roots: [a],
    node: process.execPath,
    codex: "unavailable",
    scopeMode: "all-workspaces",
  });
  assert.equal(S.authorize(b), S.canonical(b));
  assert.equal(S.config().scopeMode, "all-workspaces");
  assert(S.config().globalEnabledAt);
  assert(fs.readFileSync(override, "utf8").includes("relevance=progress"));
  assert(fs.readFileSync(override, "utf8").startsWith("保留用户全局规则"));
  assert.throws(() => S.authorize(S.HOME), /INTERNAL_TASK/);
  assert.throws(() => S.authorize(library), /INTERNAL_TASK/);
  assert.throws(() => S.authorize(process.env.CODEX_HOME), /INTERNAL_TASK/);
  const body = { outcome: "no_change", items: [] };
  assert.throws(() => S.submit(body), /GATE_REQUIRED/);
  C.disconnect();
  assert.throws(() => S.authorize(b), /NOT_AUTHORIZED/);
  assert(!fs.readFileSync(override, "utf8").includes("JINJINGTAI RECORDING"));
  assert(fs.readFileSync(override, "utf8").includes("保留用户全局规则"));
  C.install({
    library,
    roots: [a],
    node: process.execPath,
    codex: "unavailable",
    scopeMode: "all-workspaces",
  });
});
test("模拟：简单验收、建议不进入整理，实际功能测试和有效失败仍有进展", () => {
  const routine = record("routine", a, {
    kind: "verified",
    title: "加法练习",
    summary: "2+3=5",
    evidence: ["sum.test.cjs"],
    relevance: "routine",
  });
  const legacy = record("legacy", a, {
    kind: "attempt",
    title: "[日常操作] 验收故意失败",
    summary: "简单接入验收",
  });
  const feature = record("feature", b, {
    kind: "verified",
    title: "修复编辑覆盖问题并通过回归测试",
    summary: "并发编辑不再覆盖人工正文",
    evidence: ["regression.test.cjs"],
    relevance: "progress",
  });
  record("failed", a, {
    kind: "attempt",
    title: "排除会丢失附件的存储路线",
    summary: "实验确认替代路线不能持久保存附件",
    relevance: "progress",
  });
  record("proposal", a, {
    kind: "proposal",
    title: "建议迁移框架",
    summary: "尚未采纳",
  });
  const ids = O.preview(S.day()).map((s) => s.id);
  assert(!ids.includes(routine));
  assert(!ids.includes(legacy));
  assert(ids.includes(feature));
  assert.equal(ids.length, 2);
  assert.equal(O.start(S.day(), [routine, legacy]).skipped, true);
  assert.equal(S.list("jobs").length, 0);
  const mixed = [
    { id: "a", kind: "verified", workspace: a },
    { id: "b", kind: "verified", workspace: b },
  ];
  assert.throws(
    () =>
      O.validateResult(
        {
          entries: [
            { title: "合并", summary: "混合", next: "", sources: ["a", "b"] },
          ],
          unprocessed: [],
        },
        mixed,
      ),
    /MIXED_PROJECTS/,
  );
});
test("模拟：隐藏不改权威正文、确认或附件；人工编辑优先；要点同样过滤", () => {
  const stages = S.list("stages"),
    routine = stages.find((s) => s.items[0].relevance === "routine");
  const original = {
    revision: 1,
    store: {
      ...S.empty(),
      records: [
        {
          id: "auto",
          date: S.day(),
          project: "unassigned",
          change: "",
          next: "",
          kind: "发现",
          title: "保留原文",
          confirmed: true,
          attachments: [{ id: "attachment", name: "测试附件", size: 0 }],
          sourceIds: [routine.id + ":0"],
        },
        {
          id: "human",
          date: S.day(),
          project: "unassigned",
          change: "",
          next: "",
          kind: "发现",
          title: "人工改写",
          humanEdited: true,
          sourceIds: [routine.id + ":0"],
        },
      ],
    },
  };
  S.atomic(path.join(library, "personal.json"), original);
  const before = S.hash(
    fs.readFileSync(path.join(library, "personal.json"), "utf8"),
  );
  assert.equal(S.personal().store.records[0].progressHidden, true);
  assert.equal(S.personal().store.records[1].progressHidden, undefined);
  assert.equal(
    S.hash(fs.readFileSync(path.join(library, "personal.json"), "utf8")),
    before,
  );
  S.atomic(path.join(library, "jobs", "old.json"), {
    id: "old",
    state: "complete",
    applied: true,
    date: S.day(),
    result: {
      highlights: [{ text: "简单验收", sources: [routine.id + ":0"] }],
    },
  });
  assert.equal(
    S.status().jobs.find((j) => j.id === "old").highlights.length,
    0,
  );
  S.atomic(path.join(library, "visibility", routine.id + ".json"), {
    id: routine.id,
    hidden: false,
    sourceIds: [routine.id + ":0"],
  });
  assert(!S.personal().store.records[0].progressHidden);
  assert(O.preview(S.day()).some((s) => s.id === routine.id));
});
test("模拟：两个项目自动归属，整理后移除/重复应用不复活", () => {
  const materials = [
    {
      id: "x",
      workspace: a,
      kind: "finding",
      title: "A发现",
      summary: "真实发现",
      evidence: [],
      relations: [],
    },
    {
      id: "y",
      workspace: b,
      kind: "finding",
      title: "B发现",
      summary: "另一发现",
      evidence: [],
      relations: [],
    },
  ];
  S.atomic(path.join(library, "jobs", "projects.json"), {
    id: "projects",
    date: S.day(),
    state: "complete",
    materials,
    result: {
      entries: materials.map((m) => ({
        title: m.title,
        summary: m.summary,
        next: "",
        sources: [m.id],
      })),
      unprocessed: [],
    },
  });
  const out = O.apply("projects");
  assert.equal(out.added, 2);
  const records = out.store.records.filter((r) => r.id.startsWith("ai-"));
  assert.notEqual(records[0].project, records[1].project);
  assert(out.store.projects.some((p) => p.name === "alpha"));
  assert(out.store.projects.some((p) => p.name === "beta"));
  assert.equal(O.apply("projects").added, 0);
});

test("模拟：连接配置缺失或损坏时暂停采集，保留原资料库，不退回空库", () => {
  const file = path.join(S.HOME, "connection.json"),
    bytes = fs.readFileSync(file);
  S.config();
  try {
    fs.unlinkSync(file);
    assert.equal(S.config().connectionError, "CONNECTION_CONFIG_MISSING");
    assert.equal(S.config().library, library);
    assert.equal(S.config().enabled, false);
    assert.throws(() => S.authorize(a), /NOT_AUTHORIZED/);
    fs.writeFileSync(file, "broken");
    assert.equal(S.config().connectionError, "CONNECTION_CONFIG_UNREADABLE");
    assert.equal(S.config().library, library);
  } finally {
    fs.writeFileSync(file, bytes);
  }
});
