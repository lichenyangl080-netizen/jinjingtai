import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// The frontend uses extensionless bundler imports; resolve that one local import
// to the actual TypeScript source for Node's native type stripping.
const hook = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(
      specifier === "./model" &&
        context.parentURL?.endsWith("/src/day-state.ts")
        ? "./model.ts"
        : specifier,
      context,
    );
  },
});
const { dayState, isValidDay, latestSavedDay } =
  await import("../src/day-state.ts");
hook.deregister();

const date = "2026-10-06";
const store = (records) => ({
  version: 1,
  projects: [{ id: "p", name: "项目", status: "", next: "", subject: "" }],
  records: records || [],
  notes: {},
});
const record = (id, extra = {}) => ({
  id,
  date,
  project: "p",
  title: id,
  change: "",
  next: "",
  kind: "已验证成果",
  confirmed: false,
  manual: false,
  sourceIds: [id],
  ...extra,
});
const stage = (id, items, extra = {}) => ({
  id,
  date,
  binding: "bound",
  outcome: "change",
  items,
  ...extra,
});
const capture = (stages) => ({
  config: { enabled: true },
  sourceHealth: { available: true },
  stages: stages || [],
  turns: [],
});

test("待整理按准确材料来源计数，已有草稿只消费覆盖过的项", () => {
  const s = store([record("draft", { sourceIds: ["a:0", "a:1"] })]);
  const c = capture([
    stage("a", [{ id: "a:0" }, { id: "a:1" }, { id: "a:2" }]),
    stage("b", [{ id: "b:0" }]),
  ]);
  const before = structuredClone({ s, c });
  assert.deepEqual(dayState(s, c, date), {
    state: "collected",
    materialCount: 2,
    savedWorkCount: 1,
    noChangeTurns: 0,
    issueCount: 0,
  });
  assert.deepEqual({ s, c }, before);
});

test("移除、人工编辑、隐藏和旧归并稿的来源均不被重放为待整理", () => {
  const s = store([
    record("removed", { removed: true }),
    record("edited", { humanEdited: true }),
    record("hidden", { progressHidden: true }),
    record("old", { supersededDraftBy: "job" }),
  ]);
  const c = capture([
    stage(
      "s",
      ["removed", "edited", "hidden", "old", "new"].map((id) => ({ id })),
    ),
  ]);
  assert.equal(dayState(s, c, date).materialCount, 1);
});

test("范围待绑定、无变化和日常操作不制造待整理进展", () => {
  const c = capture([
    stage("pending", [{ id: "pending:0" }], {
      binding: "pending",
      session: "a",
      turn: "1",
    }),
    stage("none", [{ id: "none:0" }], { outcome: "no_change" }),
    stage("routine", [{ id: "routine:0" }], { routine: true }),
    stage("mixed", [
      { id: "m:0", hidden: true },
      { id: "m:1", relevance: "routine" },
      { id: "m:2", title: "[日常操作]测试" },
      { id: "m:3", kind: "proposal" },
      { id: "m:4", relevance: "progress" },
    ]),
  ]);
  c.turns = [
    {
      at: "2026-10-06T09:00:00+08:00",
      state: "pending",
      session: "a",
      turn: "1",
    },
  ];
  const result = dayState(store(), c, date);
  assert.equal(result.materialCount, 1);
  assert.equal(result.issueCount, 1);
  assert.equal(result.state, "issues");
});

test("用户显式计入进展后的有效可见性覆盖旧routine/proposal分类", () => {
  const c = capture([
    stage("s", [
      {
        id: "a",
        relevance: "routine",
        title: "[日常操作]旧标题",
        hidden: false,
      },
      { id: "b", kind: "proposal", hidden: false },
      { id: "c", relevance: "progress", hidden: true },
    ]),
  ]);
  assert.equal(dayState(store(), c, date).materialCount, 2);
});

test("完整事项含多个证据状态时保存即计入，不依赖旧确认标记", () => {
  const work = {
    title: "完成一次交付",
    summary: "准确的小结",
    sources: ["a", "b"],
  };
  const s = store([
    record("a", { work, confirmed: true }),
    record("b", { work, kind: "未验证实现" }),
    record("c", { confirmed: true }),
  ]);
  const result = dayState(s, capture(), date);
  assert.equal(result.savedWorkCount, 2);
  assert.equal(result.state, "saved");
  assert.equal("completionRate" in result, false);
});

test("不混同日期和项目下同名事项，重复材料ID不重复计账", () => {
  const work = { title: "修订一章", summary: "" };
  const s = store([
    record("a", { work }),
    record("b", { work, project: "another" }),
    record("c", { work, date: "2026-10-05" }),
  ]);
  const c = capture([
    stage("s", [{ id: "n" }, { id: "n" }]),
    stage("prev", [{ id: "previous" }], { date: "2026-10-05" }),
  ]);
  assert.equal(dayState(s, c, date).savedWorkCount, 2);
  assert.equal(dayState(s, c, date).materialCount, 1);
});

test("03:59与04:00按上海工作日分别归属，无变化和问题按轮次去重", () => {
  const c = capture();
  c.turns = [
    { at: "2026-10-06T19:59:59Z", state: "no_change", session: "s", turn: "a" },
    { at: "2026-10-06T19:59:59Z", state: "no_change", session: "s", turn: "a" },
    { at: "2026-10-06T20:00:00Z", state: "missing", session: "s", turn: "b" },
    { at: "invalid", state: "missing", session: "s", turn: "bad" },
  ];
  assert.equal(dayState(store(), c, date).noChangeTurns, 1);
  assert.equal(dayState(store(), c, date).issueCount, 0);
  assert.equal(dayState(store(), c, "2026-10-07").issueCount, 1);
});

test("漏记、中断、未收尾和隔离候选保留可见问题，工作中不算漏记", () => {
  const c = capture([
    stage("isolated", [], { binding: "pending", session: "s", turn: "4" }),
  ]);
  c.turns = ["missing", "interrupted", "unfinished", "pending", "working"].map(
    (state, n) => ({
      at: "2026-10-06T10:00:00+08:00",
      state,
      session: "s",
      turn: String(n + 1),
    }),
  );
  assert.equal(dayState(store(), c, date).issueCount, 4);
});

test("纯无变化不变成成果；已采集、已确认和空白分别显示", () => {
  const c = capture();
  c.turns = [{ at: "2026-10-06T10:00:00+08:00", state: "no_change" }];
  assert.equal(dayState(store(), c, date).state, "empty");
  assert.equal(dayState(store(), c, date).noChangeTurns, 1);
  assert.equal(
    dayState(store(), capture([stage("s", [{ id: "a" }])]), date).state,
    "collected",
  );
  assert.equal(
    dayState(store([record("a", { confirmed: true })]), capture(), date).state,
    "saved",
  );
  assert.equal(dayState(store(), capture(), date).state, "empty");
});

test("采集不可用仍保留已保存事项及本地状态计数", () => {
  const s = store([record("a", { confirmed: true }), record("b")]);
  for (const c of [
    null,
    undefined,
    { ...capture(), sourceHealth: { available: false } },
    { ...capture(), config: { connectionError: "unreadable" } },
    { ...capture(), config: { enabled: false } },
  ]) {
    const result = dayState(s, c, date);
    assert.equal(result.state, "unavailable");
    assert.equal(result.savedWorkCount, 2);
  }
});

test("日期校验拒绝不存在的日期和未来恢复，支持闰年", () => {
  assert(isValidDay("2028-02-29"));
  for (const invalid of [
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-10-6",
    "0000-01-01",
    null,
    {},
    "2026-10-06junk",
  ])
    assert.equal(isValidDay(invalid), false);
  assert.equal(isValidDay("2026-10-07", date), false);
  assert.equal(isValidDay(date, date), true);
});

test("最新保存日来自保留记录或回顾，不把未来规划、移除与无效日期当作成果日", () => {
  const s = store([
    record("a", { date: "2026-10-02" }),
    record("removed", { date: date, removed: true }),
    record("hidden", { date: date, progressHidden: true }),
    record("old", { date: date, supersededDraftBy: "job" }),
    record("future", { date: "2026-10-09" }),
    record("invalid", { date: "2026-13-01" }),
  ]);
  s.notes = {
    "2026-10-04": { lesson: "人工本地回顾", tomorrow: "" },
    "2026-10-05": { lesson: " ", tomorrow: "" },
    "2026-10-07": { lesson: "未来正文不应影响恢复", tomorrow: "" },
  };
  s.plans = { [date]: "未来规划也不是已做事项" };
  const before = structuredClone(s);
  assert.equal(latestSavedDay(s, date), "2026-10-04");
  assert.equal(latestSavedDay(store(), date), null);
  assert.equal(latestSavedDay(s, "invalid"), null);
  assert.deepEqual(s, before);
});
