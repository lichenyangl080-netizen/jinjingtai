const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-daily-flow-"));
process.env.JINJINGTAI_HOME = path.join(root, "home");
process.env.CODEX_HOME = path.join(root, "codex");
const S = require("../integration/store.cjs"),
  O = require("../integration/consolidate.cjs");
const library = path.join(root, "library"),
  work = path.join(root, "work");
fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(process.env.CODEX_HOME, { recursive: true });
S.atomic(path.join(S.HOME, "connection.json"), {
  library,
  roots: [work],
  enabled: true,
});
const date = S.day(),
  ref = (id) => ({
    id,
    workspace: work,
    kind: "finding",
    title: "授权发现",
    summary: "阶段短材料",
    evidence: [],
    relations: [],
  });
function job(id, entries, unprocessed = []) {
  S.atomic(path.join(library, "jobs", id + ".json"), {
    id,
    date,
    policy: "daily-summary-v1",
    mode: "drafts",
    state: "complete",
    materials: ["a", "b", "c", "d"].map(ref),
    result: { entries, highlights: [], unprocessed },
  });
}
function entry(sources, title = "归纳成果") {
  return { sources, title, summary: "简洁结果", next: "" };
}
function reset(records) {
  S.atomic(path.join(library, "personal.json"), {
    revision: 1,
    store: { ...S.empty(), records },
  });
}
const base = {
  id: "old",
  date,
  project: "unassigned",
  title: "原草稿",
  change: "原始正文",
  next: "",
  kind: "发现",
  confirmed: false,
  manual: false,
  sourceIds: ["a", "b"],
};
test("免确认流程：已有未确认记录只更新归组，不重写正文、不重复添加", () => {
  const original = { ...base, sourceIds: ["a"] };
  reset([original]);
  const id = "saved-without-confirm";
  S.atomic(path.join(library, "jobs", id + ".json"), {
    id,
    date,
    policy: "daily-work-v3",
    mode: "drafts",
    state: "complete",
    materials: [{ ...ref("a"), groupOnly: true, groupingUnit: "old" }],
    result: {
      highlights: [],
      entries: [
        { ...entry(["a"]), work: { title: "完整成果", summary: "归组摘要" } },
      ],
      unprocessed: [],
    },
  });
  const result = O.apply(id);
  assert.equal(result.added, 0);
  assert.equal(result.grouped, 1);
  assert.deepEqual(result.store.records, [original]);
  assert.equal(result.store.workAssignments.old.title, "完整成果");
  assert.equal(O.apply(id).added, 0);
});
test("模拟整理：归并未确认草稿，保留原文与来源，重放不重复", () => {
  reset([base]);
  job("merge", [entry(["a", "b", "c"])], ["d"]);
  const p = O.apply("merge");
  assert.equal(p.added, 1);
  assert.equal(p.replaced, 1);
  assert.equal(p.store.records[0].change, "原始正文");
  assert.equal(p.store.records[0].supersededDraftBy, "merge");
  assert.deepEqual(p.store.records[1].sourceIds, ["a", "b", "c"]);
  assert(p.store.records[1].dailySummary);
  assert.equal(O.apply("merge").added, 0);
});
test("模拟整理：整理期间人工更正或确认，返回后不覆盖也不重复", () => {
  for (const protection of [
    { humanEdited: true },
    { confirmed: true },
    { removed: true },
    { manual: true },
  ]) {
    reset([{ ...base, ...protection }]);
    const id = "protect-" + Object.keys(protection)[0];
    job(id, [entry(["a", "b"]), entry(["c"])], ["d"]);
    const p = O.apply(id);
    assert.equal(p.added, 1);
    assert.deepEqual(p.store.records[0], { ...base, ...protection });
    assert.deepEqual(
      S.read(path.join(library, "jobs", id + ".json")).skippedSources,
      ["a", "b"],
    );
  }
});
test("模拟整理：只选择旧成果的一部分不替换或重复该成果", () => {
  reset([base]);
  job("partial", [entry(["a"]), entry(["c"])], ["b", "d"]);
  const p = O.apply("partial");
  assert.equal(p.added, 1);
  assert.equal(p.replaced, 0);
  assert.deepEqual(p.store.records[0], base);
  assert.deepEqual(
    S.read(path.join(library, "jobs", "partial.json")).skippedSources,
    ["a"],
  );
});
test("模拟整理：权威文件提交后回执丢失，恢复应用仍只有一个归纳结果", () => {
  reset([base]);
  job("crash", [entry(["a", "b", "c"])], ["d"]);
  O.apply("crash");
  const file = path.join(library, "jobs", "crash.json"),
    j = S.read(file);
  delete j.applied;
  S.atomic(file, j);
  const p = O.apply("crash");
  assert.equal(p.added, 0);
  assert.equal(p.store.records.filter((r) => !r.supersededDraftBy).length, 1);
});
test("完整事项跨类型归组，内部仍拒绝混合验证状态、跨项目和重复引用", () => {
  const materials = [
    { ...ref("a"), kind: "decision" },
    { ...ref("b"), kind: "implementation" },
    { ...ref("c"), kind: "verified" },
    { ...ref("d"), kind: "proposal" },
  ];
  const work = {
    title: "第五期视频制作",
    summary: "选题确定，文案与配音待核对，导出测试通过；建议未采纳。",
  };
  const result = {
    highlights: [],
    entries: materials.map((m) => ({ ...entry([m.id]), work })),
    unprocessed: [],
  };
  O.validateResult(result, materials, false, true, true);
  assert.throws(
    () =>
      O.validateResult(
        {
          ...result,
          entries: [{ ...entry(["a", "b"]), work }, ...result.entries.slice(2)],
        },
        materials,
        false,
        true,
        true,
      ),
    /MIXED_EVIDENCE_STATUS/,
  );
  assert.throws(
    () =>
      O.validateResult(
        {
          ...result,
          entries: [{ ...entry(["a", "b"]), work }, ...result.entries.slice(2)],
        },
        materials.map((m) => ({
          ...m,
          kind: "finding",
          workspace: m.id === "b" ? "other" : m.workspace,
        })),
        false,
        true,
        true,
      ),
    /MIXED_PROJECTS/,
  );
  assert.throws(
    () =>
      O.validateResult(
        {
          ...result,
          entries: result.entries.map((e, n) =>
            n === 1 ? { ...e, work: { ...work, summary: "不一致" } } : e,
          ),
        },
        materials,
        false,
        true,
        true,
      ),
    /INCONSISTENT_WORK/,
  );
  assert.throws(
    () =>
      O.validateResult(
        { ...result, entries: [...result.entries, result.entries[0]] },
        materials,
        false,
        true,
        true,
      ),
    /INVALID_CITATION/,
  );
  assert.throws(
    () =>
      O.validateResult(
        {
          ...result,
          entries: result.entries.map((e, n) => ({
            ...e,
            work: { title: "独立事项" + n, summary: "各自摘要" },
          })),
        },
        materials,
        false,
        true,
        true,
      ),
    /TOO_MANY_DAILY_ENTRIES/,
  );
});
test("事项保存保留各类型、来源及更正关系，重放不重复", () => {
  reset([]);
  const materials = [
      { ...ref("a"), kind: "decision" },
      {
        ...ref("b"),
        kind: "implementation",
        relations: [{ type: "supersedes", target: "a" }],
      },
    ],
    work = { title: "第五期视频制作", summary: "采用新的时长，文案仍需核对。" };
  const id = "work-v2",
    result = {
      highlights: [],
      entries: materials.map((m) => ({ ...entry([m.id]), work })),
      unprocessed: [],
    };
  S.atomic(path.join(library, "jobs", id + ".json"), {
    id,
    date,
    policy: "daily-work-v2",
    state: "complete",
    materials,
    result,
  });
  const p = O.apply(id);
  assert.equal(p.added, 2);
  assert.deepEqual(
    p.store.records.map((r) => r.kind),
    ["决策", "未验证实现"],
  );
  assert(p.store.records.every((r) => r.work.title === work.title));
  assert.equal(p.store.records[1].relations[0].target, "a");
  assert.equal(O.apply(id).added, 0);
});
test("部分事项被人工保护时不发布包含跳过内容的整体摘要", () => {
  reset([{ ...base, sourceIds: ["a"], confirmed: true }]);
  const work = { title: "第五期视频制作", summary: "包括不能替换的选题。" },
    id = "work-protection";
  S.atomic(path.join(library, "jobs", id + ".json"), {
    id,
    date,
    policy: "daily-work-v2",
    state: "complete",
    materials: ["a", "b"].map(ref),
    result: {
      highlights: [],
      entries: [
        { ...entry(["a"]), work },
        { ...entry(["b"]), work },
      ],
      unprocessed: [],
    },
  });
  const p = O.apply(id);
  assert.equal(p.added, 1);
  assert(!p.store.records[1].work);
  assert.deepEqual(p.store.records[0], {
    ...base,
    sourceIds: ["a"],
    confirmed: true,
  });
});
test("所有项目已有确认内容仅新增归组元数据，正文附件状态保持原样", () => {
  const originals = [
    {
      ...base,
      id: "ui-plan",
      confirmed: true,
      sourceIds: ["a"],
      attachments: [{ id: "attachment", name: "测试附件", size: 0 }],
    },
    { ...base, id: "ui-build", confirmed: true, sourceIds: ["b"] },
  ];
  reset(originals);
  const work = {
      title: "改善工作台使用体验",
      summary: "操作入口和阅读方式得到改善，部分实现仍待核对。",
    },
    id = "generic-groups";
  S.atomic(path.join(library, "jobs", id + ".json"), {
    id,
    date,
    policy: "daily-work-v3",
    state: "complete",
    materials: ["a", "b"].map((id) => ({ ...ref(id), groupOnly: true })),
    result: {
      highlights: [],
      entries: [{ ...entry(["a", "b"]), work }],
      unprocessed: [],
    },
  });
  const p = O.apply(id);
  assert.equal(p.added, 0);
  assert.equal(p.grouped, 2);
  assert.deepEqual(p.store.records, originals);
  assert.equal(p.store.workAssignments["ui-plan"].title, work.title);
  assert.equal(p.store.workAssignments["ui-build"].title, work.title);
  assert.equal(O.apply(id).added, 0);
  assert.deepEqual(
    S.read(path.join(library, "jobs", id + ".json")).skippedSources,
    [],
  );
});
test("归组期间更正、移除或仅覆盖一部分来源，不赋予误导性的整体归组", () => {
  for (const change of [
    { humanEdited: true },
    { removed: true },
    { manual: true },
    { sourceIds: ["a", "c"] },
  ]) {
    reset([{ ...base, confirmed: true, ...change }]);
    const work = { title: "完善预约下单", summary: "预约流程得到改善" },
      id = "generic-protect-" + Object.keys(change)[0];
    S.atomic(path.join(library, "jobs", id + ".json"), {
      id,
      date,
      policy: "daily-work-v3",
      state: "complete",
      materials: [{ ...ref("a"), groupOnly: true }],
      result: {
        highlights: [],
        entries: [{ ...entry(["a"]), work }],
        unprocessed: [],
      },
    });
    const p = O.apply(id);
    assert.equal(p.added, 0);
    assert(!p.store.workAssignments.old);
  }
});
test("已确认归组来源不能与新增草稿混入同一内部条目，避免吞掉新增材料", () => {
  const work = { title: "文章修订", summary: "结构和措辞得到改善" };
  assert.throws(
    () =>
      O.validateResult(
        {
          highlights: [],
          entries: [{ ...entry(["a", "b"]), work }],
          unprocessed: [],
        },
        [
          { ...ref("a"), groupOnly: true },
          { ...ref("b"), groupOnly: false },
        ],
        false,
        true,
        true,
      ),
    /MIXED_GROUPING_MODE/,
  );
});
test("同一已确认记录的来源不能拆到不同事项", () => {
  assert.throws(
    () =>
      O.validateResult(
        {
          highlights: [],
          entries: [
            { ...entry(["a"]), work: { title: "事项A", summary: "A" } },
            { ...entry(["b"]), work: { title: "事项B", summary: "B" } },
          ],
          unprocessed: [],
        },
        [
          { ...ref("a"), groupOnly: true, groupingUnit: "record" },
          { ...ref("b"), groupOnly: true, groupingUnit: "record" },
        ],
        false,
        true,
        true,
      ),
    /SPLIT_CONFIRMED_SCOPE/,
  );
});
