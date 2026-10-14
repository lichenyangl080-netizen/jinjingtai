import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { saveRecord, displacedBy } from "../src/model.ts";
import {
  assignThreadRecord,
  continuationWarning,
  continuationSourceSignature,
  projectRecentRecords,
  threadCandidates,
  referenceState,
} from "../src/personal-workspace.ts";
import { buildSearchIndex, searchDocuments } from "../src/search-index.ts";
const { validPersonal, projectPersonal } = createRequire(import.meta.url)(
  "../integration/personal-schema.cjs",
);
const rec = (id, extra = {}) => ({
  id,
  date: "2026-10-13",
  project: "p",
  title: id,
  change: "正文关键判断",
  next: "下一步对照",
  kind: "发现",
  manual: false,
  confirmed: false,
  ...extra,
});
const thread = (id, extra = {}) => ({
  id,
  project: "p",
  title: "修复保存",
  description: "人工主线说明",
  recordIds: [],
  createdAt: "2026-10-13T01:00:00Z",
  updatedAt: "2026-10-13T01:00:00Z",
  ...extra,
});
const store = () => ({
  version: 1,
  records: [
    rec("a", { sourceIds: ["source-a"] }),
    rec("b", {
      evidence: "独有依据",
      relations: [{ type: "supersedes", target: "source-a" }],
    }),
  ],
  projects: [
    { id: "p", name: "项目", subject: "", status: "人工项目概况", next: "" },
  ],
  notes: { "2026-10-13": { lesson: "人工心得", tomorrow: "继续思考" } },
});
test("旧库读取不添加扩展，新结构校验并保留悬空引用", () => {
  const s = store();
  assert.equal(validPersonal({ revision: 0, store: s }), true);
  assert.equal(
    projectPersonal({ revision: 0, store: s }).store.threads,
    undefined,
  );
  s.threads = { t: thread("t", { recordIds: ["missing"] }) };
  s.continuations = {
    p: {
      text: "保存起点",
      recordId: "missing",
      sourceNext: "旧原文",
      updatedAt: "2026-10-13T01:00:00Z",
    },
  };
  s.periodReviews = {
    "月:2026-10-01": {
      period: "月",
      start: "2026-10-01",
      end: "2026-10-31",
      text: "回望",
      references: [
        { recordId: "missing", title: "旧标题", date: "2026-10-13" },
      ],
      updatedAt: "2026-10-13T01:00:00Z",
    },
  };
  assert.equal(validPersonal({ revision: 1, store: s }), true);
  assert.equal(
    validPersonal({
      revision: 1,
      store: { ...s, threads: { t: thread("wrong") } },
    }),
    false,
  );
  assert.equal(
    validPersonal({
      revision: 1,
      store: {
        ...s,
        periodReviews: { invalid: s.periodReviews["月:2026-10-01"] },
      },
    }),
    false,
  );
});
test("主线唯一关联、跨项目拒绝和移动记录自动解除关联，原记录不改", () => {
  const s = store();
  s.threads = { one: thread("one", { recordIds: ["b"] }), two: thread("two") };
  const before = structuredClone(s.records);
  const next = assignThreadRecord(s, "two", "b");
  assert.deepEqual(next.threads.one.recordIds, []);
  assert.deepEqual(next.threads.two.recordIds, ["b"]);
  assert.deepEqual(next.records, before);
  assert.deepEqual(s.threads.one.recordIds, ["b"]);
  assert.throws(() =>
    assignThreadRecord(
      { ...s, threads: { wrong: thread("wrong", { project: "other" }) } },
      "wrong",
      "b",
    ),
  );
  assert.deepEqual(
    saveRecord(next, { ...next.records[1], project: "other" }).threads.two
      .recordIds,
    [],
  );
  assert.equal(
    validPersonal({
      revision: 0,
      store: {
        ...s,
        threads: {
          one: thread("one", { recordIds: ["b"] }),
          two: thread("two", { recordIds: ["b"] }),
        },
      },
    }),
    false,
  );
});
test("起点保留副本且报告取代、修改、隐藏、移除，候选排除历史结论", () => {
  const s = store();
  s.continuations = {
    p: {
      text: "人工保存",
      recordId: "a",
      sourceNext: "下一步对照",
      updatedAt: "2026-10-13T01:00:00Z",
    },
  };
  assert.equal(referenceState(s, { recordId: "a" }), "historical");
  assert.match(continuationWarning(s, "p"), /取代/);
  assert.deepEqual(
    threadCandidates(s, thread("t")).map((r) => r.id),
    ["b"],
  );
  s.continuations.p.recordId = "b";
  s.records[1].next = "新下一步";
  assert.match(continuationWarning(s, "p"), /修改/);
  s.records[1].progressHidden = true;
  assert.match(continuationWarning(s, "p"), /隐藏/);
  s.records[1].removed = true;
  assert.match(continuationWarning(s, "p"), /移除/);
  assert.equal(s.continuations.p.text, "人工保存");
});
test("摘取已编辑来源不误报，摘取后正文和依据变化才提醒，旧起点仍兼容", () => {
  const ordered = rec("ordered", {
    relations: [
      { type: "supplements", target: "中文对象" },
      { type: "supplements", target: "ascii-object" },
    ],
  });
  assert.equal(
    continuationSourceSignature(ordered),
    continuationSourceSignature({
      ...ordered,
      relations: ordered.relations.toReversed(),
    }),
  );
  const s = store();
  s.records = [rec("edited", { humanEdited: true, evidence: "原依据" })];
  const source = s.records[0];
  s.continuations = {
    p: {
      text: source.next,
      recordId: source.id,
      sourceNext: source.next,
      sourceSignature: continuationSourceSignature(source),
      updatedAt: "2026-10-13T01:00:00Z",
    },
  };
  assert.equal(continuationWarning(s, "p"), "");
  source.humanEdited = false;
  assert.equal(continuationWarning(s, "p"), "");
  for (const field of [
    "title",
    "change",
    "summary",
    "next",
    "kind",
    "date",
    "project",
    "evidence",
  ]) {
    const original = source[field];
    source[field] = (original || "") + "修改";
    assert.match(continuationWarning(s, "p"), /修改/, field);
    source[field] = original;
  }
  source.relations = [{ type: "supplements", target: "another" }];
  assert.match(continuationWarning(s, "p"), /修改/);
  delete source.relations;
  delete s.continuations.p.sourceSignature;
  source.humanEdited = true;
  assert.equal(continuationWarning(s, "p"), "");
  source.next = "后续修改";
  assert.match(continuationWarning(s, "p"), /修改/);
  assert.equal(s.continuations.p.text, "下一步对照");
});
test("项目最近变化按概况保存时的记录身份识别跨日新增，不复活历史和隐藏记录", () => {
  const s = store();
  const project = s.projects[0];
  project.overviewEditedAt = "2026-10-13T12:00:00Z";
  project.overviewRecordIds = s.records.map((record) => record.id);
  s.records.push(
    rec("backlog", { date: "2026-09-29", sourceAt: "2026-09-29T03:00:00Z" }),
    rec("hidden", { progressHidden: true }),
    rec("removed", { removed: true }),
    rec("proposal", { kind: "未采纳建议" }),
    rec("other", { project: "other" }),
  );
  assert.deepEqual(
    projectRecentRecords(s, project).map((record) => record.id),
    ["backlog"],
  );
  project.overviewRecordIds.push("backlog");
  assert.deepEqual(projectRecentRecords(s, project), []);
  delete project.overviewRecordIds;
  s.records.push(rec("newer", { sourceAt: "2026-10-13T13:00:00Z" }));
  assert.deepEqual(
    projectRecentRecords(s, project).map((record) => record.id),
    ["newer"],
  );
  project.overviewRecordIds = [];
  assert.deepEqual(
    projectRecentRecords(s, project).map((record) => record.id),
    ["newer", "b", "backlog"],
  );
});
test("来源签名和概况基线校验、隔离投影、记录编辑保存都保留，损坏值拒绝", () => {
  const s = store();
  s.projects[0].overviewRecordIds = ["a", "b", "missing"];
  s.continuations = {
    p: { text: "保存起点", sourceSignature: "v1:signature", updatedAt: "now" },
  };
  assert.equal(validPersonal({ revision: 0, store: s }), true);
  const projected = projectPersonal({ revision: 0, store: s }).store;
  assert.deepEqual(
    projected.projects[0].overviewRecordIds,
    s.projects[0].overviewRecordIds,
  );
  assert.deepEqual(projected.continuations, s.continuations);
  const updated = saveRecord(projected, {
    ...projected.records[1],
    change: "改动正文",
  });
  assert.deepEqual(
    updated.projects[0].overviewRecordIds,
    s.projects[0].overviewRecordIds,
  );
  assert.deepEqual(updated.continuations, s.continuations);
  for (const broken of [null, "a", [""], [1], ["a", "a"]])
    assert.equal(
      validPersonal({
        revision: 0,
        store: {
          ...s,
          projects: [{ ...s.projects[0], overviewRecordIds: broken }],
        },
      }),
      false,
    );
  for (const broken of [null, 1, [], {}])
    assert.equal(
      validPersonal({
        revision: 0,
        store: {
          ...s,
          continuations: {
            p: { ...s.continuations.p, sourceSignature: broken },
          },
        },
      }),
      false,
    );
});
test("项目检索只覆盖当前继续起点，空的新起点不会恢复旧兼容下一步", () => {
  const s = store();
  s.projects[0].next = "旧起点独有关键词";
  assert.equal(
    searchDocuments(buildSearchIndex(s), { text: "旧起点独有关键词" }).length,
    1,
  );
  s.continuations = { p: { text: "新起点独有关键词", updatedAt: "now" } };
  assert.equal(
    searchDocuments(buildSearchIndex(s), { text: "旧起点独有关键词" }).length,
    0,
  );
  assert.equal(
    searchDocuments(buildSearchIndex(s), { text: "新起点独有关键词" }).length,
    1,
  );
  s.continuations.p.text = "";
  assert.equal(
    searchDocuments(buildSearchIndex(s), { text: "旧起点独有关键词" }).length,
    0,
  );
  assert.equal(s.projects[0].next, "旧起点独有关键词");
});
test("检索覆盖人工正文，依据显式开启，多词全部匹配，历史不复活移除内容", () => {
  const s = store();
  s.records.push(rec("removed", { removed: true, change: "已移除秘密" }));
  s.periodReviews = {
    "月:2026-10-01": {
      period: "月",
      start: "2026-10-01",
      end: "2026-10-31",
      text: "人工周期结论",
      references: [],
      updatedAt: "now",
    },
  };
  s.threads = { t: thread("t") };
  const index = buildSearchIndex(s);
  assert.deepEqual(
    searchDocuments(index, { text: "正文 判断" }).map((r) => r.id),
    ["b"],
  );
  assert.equal(
    searchDocuments(index, { text: "正文", historical: true }).length,
    2,
  );
  assert.equal(searchDocuments(index, { text: "依据" }).length, 0);
  assert.equal(
    searchDocuments(index, { text: "依据", evidence: true }).length,
    1,
  );
  for (const text of [
    "人工心得",
    "人工项目概况",
    "人工周期结论",
    "人工主线说明",
  ])
    assert.equal(searchDocuments(index, { text }).length, 1);
  assert.equal(
    searchDocuments(index, { text: "已移除", historical: true }).length,
    0,
  );
  assert.equal(
    searchDocuments(index, { text: "人工心得", project: "p" }).length,
    0,
  );
  assert.equal(
    searchDocuments(index, { text: "正文", start: "2026-10-14" }).length,
    0,
  );
});
test("1万条索引查询性能和重建删除失效", () => {
  const s = store();
  s.records = Array.from({ length: 10000 }, (_, i) =>
    rec("r" + i, { change: "性能合成材料 专用关键词 " + i }),
  );
  const index = buildSearchIndex(s);
  const start = performance.now();
  assert.equal(searchDocuments(index, { text: "专用关键词 9999" }).length, 1);
  assert.ok(performance.now() - start < 300, "索引完成后查询超过300ms");
  s.records[9999].removed = true;
  assert.equal(
    searchDocuments(buildSearchIndex(s), { text: "专用关键词 9999" }).length,
    0,
  );
});
test("更正同时支持记录身份与来源身份，移除更正不复活旧结论", () => {
  for (const target of ["a", "source-a"]) {
    const s = store();
    s.records[1].relations = [{ type: "supersedes", target }];
    assert.equal(displacedBy(s, s.records[0])?.id, "b");
    assert.equal(displacedBy(s, s.records[0], "2026-10-12"), undefined);
    assert.deepEqual(
      searchDocuments(buildSearchIndex(s), { text: "正文" }).map((r) => r.id),
      ["b"],
    );
    s.records[1].removed = true;
    assert.equal(displacedBy(s, s.records[0])?.id, "b");
    assert.equal(
      searchDocuments(buildSearchIndex(s), { text: "正文" }).length,
      0,
    );
    s.records[1].relations = [{ type: "supplements", target }];
    assert.equal(displacedBy(s, s.records[0]), undefined);
  }
});
test("主线候选按真实关联优先，记录ID和来源ID排序一致", () => {
  for (const target of ["member", "member-source"]) {
    const s = store();
    s.records = [
      rec("member", { sourceIds: ["member-source"] }),
      rec("related", {
        date: "2026-10-10",
        relations: [{ type: "supplements", target }],
      }),
      rec("newer", { date: "2026-10-13" }),
    ];
    const t = thread("t", { recordIds: ["member"] });
    assert.deepEqual(
      threadCandidates(s, t).map((r) => r.id),
      ["related", "newer"],
    );
  }
});
