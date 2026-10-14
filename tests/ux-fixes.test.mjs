import test from "node:test";
import assert from "node:assert/strict";
import { preferredProject } from "../src/project-display.ts";
import { retrospectiveDays, lessonPreview } from "../src/retrospective.ts";
const project = (id, extra = {}) => ({
  id,
  name: id,
  subject: "",
  status: "",
  next: "",
  ...extra,
});
const record = (id, project, date, extra = {}) => ({
  id,
  project,
  date,
  title: id,
  change: "",
  next: "",
  kind: "已验证成果",
  confirmed: false,
  manual: false,
  ...extra,
});
test("默认项目选择尊重记忆，否则使用最近可见普通项目，且不修改资料", () => {
  const store = {
    version: 1,
    projects: [
      project("unassigned"),
      project("a"),
      project("b"),
      project("archived", { archived: true }),
    ],
    notes: {},
    records: [
      record("old", "a", "2026-01-01"),
      record("recent", "b", "2026-10-01"),
      record("hidden", "a", "2026-10-13", { progressHidden: true }),
      record("archived", "archived", "2026-10-13"),
    ],
  };
  const before = structuredClone(store);
  assert.equal(preferredProject(store), "b");
  assert.equal(preferredProject(store, "a"), "a");
  assert.equal(preferredProject(store, "missing"), "b");
  assert.equal(preferredProject({ ...store, records: [] }), "a");
  assert.equal(
    preferredProject({ ...store, projects: [], records: [] }),
    "unassigned",
  );
  assert.deepEqual(store, before);
});
test("回望标题筛选保留事项全部证据，并限制项目月份日期及可见性", () => {
  const work = { title: "可靠保存", summary: "", sources: ["one", "two"] };
  const store = {
    version: 1,
    projects: [project("p"), project("q")],
    notes: {},
    records: [
      record("one", "p", "2026-10-12", {
        title: "实现保存",
        sourceIds: ["one"],
        work,
      }),
      record("two", "p", "2026-10-12", {
        title: "重读验证",
        sourceIds: ["two"],
        work,
      }),
      record("other", "q", "2026-10-12"),
      record("early", "p", "2026-09-12"),
      record("orphan", "missing", "2026-10-11"),
      record("removed", "p", "2026-10-12", { removed: true }),
    ],
  };
  const before = structuredClone(store);
  const days = retrospectiveDays(
    store,
    "2026-01-01",
    "2026-12-31",
    "p",
    "2026-10",
    "重读",
  );
  assert.equal(days.length, 1);
  assert.deepEqual(
    days[0].projects[0].works[0].records.map((r) => r.id).sort(),
    ["one", "two"],
  );
  assert.equal(
    retrospectiveDays(store, "2026-10-13", "2026-12-31", "", "", "").length,
    0,
  );
  assert.equal(
    retrospectiveDays(store, "2026-01-01", "2026-12-31", "", "", "不存在")
      .length,
    0,
  );
  assert.equal(
    retrospectiveDays(
      store,
      "2026-01-01",
      "2026-12-31",
      "unassigned",
      "",
      "",
    )[0].projects[0].records[0].project,
    "missing",
  );
  assert.deepEqual(store, before);
});
test("心得预览只展示首句，原文仍完整保留", () => {
  const text = "  首句心得。第二句\n下一段";
  assert.equal(lessonPreview(text), "首句心得");
  assert.equal(lessonPreview("字".repeat(100)).length, 80);
  assert.equal(text, "  首句心得。第二句\n下一段");
});
