import test from "node:test";
import assert from "node:assert/strict";
import { workProgress } from "../src/work-progress.ts";
const record = (id, extra = {}) => ({
  id,
  date: "2026-10-06",
  project: "p",
  title: id,
  change: "",
  next: "",
  kind: "已验证成果",
  confirmed: true,
  manual: false,
  sourceIds: [id],
  ...extra,
});
const store = (records) => ({ version: 1, projects: [], notes: {}, records });
const group = (records) => ({
  id: "g",
  title: "一件事",
  summary: "保留原有准确小结。",
  records,
});

test("确认过的实现仍待核对，混合事项保留验证与未验证状态", () => {
  const records = [
    record("a"),
    record("b", { kind: "未验证实现", next: "验证实际流程" }),
  ];
  const result = workProgress(store(records), group(records));
  assert.deepEqual(result.badges, ["实现待核对", "有验证结果"]);
  assert.deepEqual(result.next, ["验证实际流程"]);
  assert.equal(result.summary, "保留原有准确小结。");
  assert.equal("completionRate" in result, false);
  assert.equal(result.caption, "实现尚未验证");
});

test("摘要前只显示重要事实状态，不以保存或确认冒充验证", () => {
  for (const [kind, expected] of [
    ["已验证成果", "已有验证结果"],
    ["未验证实现", "实现尚未验证"],
    ["阻塞", "仍有阻塞"],
    ["未采纳建议", "建议尚未采纳"],
  ]) {
    const r = record("r", { kind });
    assert.equal(workProgress(store([r]), group([r])).caption, expected);
  }
});

test("失败尝试和未采纳建议不会被投影成完成成果或已作决定", () => {
  const records = [
    record("attempt", { kind: "尝试" }),
    record("proposal", { kind: "未采纳建议" }),
  ];
  assert.deepEqual(workProgress(store(records), group(records)).badges, [
    "尝试",
    "建议待采纳",
  ]);
});

test("后续否定只标记历程，旧下一步不作为当前继续起点", () => {
  const old = record("old", { next: "继续旧方案" });
  const later = record("later", {
    date: "2026-10-07",
    kind: "决策",
    relations: [{ type: "negates", target: "old" }],
  });
  const state = store([old, later]),
    before = structuredClone(state);
  const result = workProgress(state, group([old]));
  assert.equal(result.historical, true);
  assert.deepEqual(result.badges, ["已有后续更正"]);
  assert.deepEqual(result.next, []);
  assert.deepEqual(
    result.corrections.map((r) => r.id),
    ["later"],
  );
  assert.deepEqual(state, before);
});

test("补充关系不使旧结论失效，保存的否定立即生效而无需确认", () => {
  const old = record("old", { next: "下一步" });
  for (const extra of [
    { relations: [{ type: "supplements", target: "old" }] },
    { confirmed: false, relations: [{ type: "negates", target: "old" }] },
  ]) {
    const later = record("later", extra);
    assert.deepEqual(
      workProgress(store([old, later]), group([old])).next,
      extra.relations[0].type === "negates" ? [] : ["下一步"],
    );
  }
});

test("同一事项的重复下一步只显示一次，不修改人工内容", () => {
  const records = [
    record("a", { manual: true, kind: "进展", next: "继续校正" }),
    record("b", { manual: true, kind: "进展", next: "继续校正" }),
  ];
  const result = workProgress(store(records), group(records));
  assert.deepEqual(result.badges, ["手动补记"]);
  assert.deepEqual(result.next, ["继续校正"]);
});
