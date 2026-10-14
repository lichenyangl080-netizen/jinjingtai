import test from "node:test";
import assert from "node:assert/strict";
import { projectOverview, projectTimeline } from "../src/project-progress.ts";
import {
  projectDisplayOrder,
  groupProjectRecords,
} from "../src/project-display.ts";

const project = (id, extra = {}) => ({
  id,
  name: id,
  subject: "",
  status: "",
  next: "",
  ...extra,
});
const record = (id, extra = {}) => ({
  id,
  project: "p",
  date: "2026-10-13",
  title: id,
  change: "调整界面，尚未验证",
  next: "进行界面验证",
  kind: "未验证实现",
  confirmed: true,
  manual: false,
  sourceIds: [id + ":0"],
  ...extra,
});
const state = (records, projects = [project("p")]) => ({
  version: 1,
  projects,
  records,
  notes: {},
});

test("概况逐项注明手写与记录来源，确认过的实现仍注明尚未验证", () => {
  const p = project("p", { status: "人工维护的总体状态" });
  const latest = record("latest");
  const store = state([record("old", { date: "2026-10-12" }), latest], [p]);
  const before = structuredClone(store);
  const overview = projectOverview(store, p);
  assert.deepEqual(overview.status, { source: "manual", text: p.status });
  assert.equal(overview.next.source, "record");
  assert.equal(overview.next.record, latest);
  assert.equal(overview.next.caption, "实现尚未验证");
  assert.equal(overview.next.text, latest.next);
  assert.deepEqual(store, before);
});

test("概况只参考当前有效记录，不把未采纳建议、旧稿、隐藏或已推翻内容当总体状态", () => {
  const old = record("old", { change: "被否定的结论" });
  const replacement = record("replacement", {
    date: "2026-10-14",
    kind: "阻塞",
    change: "接入仍有阻塞",
    relations: [{ type: "negates", target: "old:0" }],
  });
  const store = state([
    old,
    replacement,
    record("proposal", { date: "2026-10-15", kind: "未采纳建议" }),
    record("draft", { date: "2026-10-15", supersededDraftBy: "job" }),
    record("hidden", { date: "2026-10-15", progressHidden: true }),
    record("removed", { date: "2026-10-15", removed: true }),
    record("elsewhere", { date: "2026-10-15", project: "other" }),
  ]);
  const before = structuredClone(store);
  const overview = projectOverview(store, store.projects[0]);
  assert.equal(overview.status.record.id, "replacement");
  assert.equal(overview.status.text, "接入仍有阻塞");
  assert.equal(overview.status.caption, "仍有阻塞");
  assert.deepEqual(store, before);
});

test("空概况分别提示状态与下一步，不凭空生成来源或进展", () => {
  const p = project("p");
  const overview = projectOverview(state([]), p);
  assert.deepEqual(overview, {
    status: { source: "empty", text: "尚未填写当前状态" },
    next: { source: "empty", text: "尚未填写下一步" },
  });
  const withoutNext = record("latest", { next: "" });
  assert.equal(projectOverview(state([withoutNext]), p).next.source, "empty");
});

test("项目历程按日期归并，保留历史更正且不显示移除、隐藏、旧稿或其他项目", () => {
  const store = state([
    record("older", { date: "2026-10-12" }),
    record("today-a", { work: { title: "一次界面调整", summary: "调整布局" } }),
    record("today-b", {
      work: { title: "一次界面调整", summary: "调整布局" },
      relations: [{ type: "negates", target: "older:0" }],
    }),
    record("removed", { removed: true }),
    record("hidden", { progressHidden: true }),
    record("old-draft", { supersededDraftBy: "job" }),
    record("elsewhere", { project: "other" }),
  ]);
  const before = structuredClone(store);
  const timeline = projectTimeline(store, "p");
  assert.deepEqual(
    timeline.map((day) => day.date),
    ["2026-10-13", "2026-10-12"],
  );
  assert.equal(timeline[0].groups.length, 1);
  assert.deepEqual(timeline[0].groups[0].records.map((r) => r.id).sort(), [
    "today-a",
    "today-b",
  ]);
  assert.deepEqual(
    timeline[1].groups[0].records.map((r) => r.id),
    ["older"],
  );
  assert.deepEqual(projectTimeline(store, "absent"), []);
  assert.deepEqual(store, before);
});

test("项目页与首页都将归档项目稳定收于普通项目之后，其他始终最后", () => {
  const projects = [
    project("unassigned"),
    project("archive-b", { archived: true }),
    project("active-b"),
    project("archive-a", { archived: true }),
    project("active-a"),
  ];
  const before = structuredClone(projects);
  const expected = [
    "active-b",
    "active-a",
    "archive-b",
    "archive-a",
    "unassigned",
  ];
  assert.deepEqual(
    projectDisplayOrder(projects).map((p) => p.id),
    expected,
  );
  assert.deepEqual(
    groupProjectRecords(
      projects,
      projects.map((p) => record(p.id, { project: p.id })).reverse(),
    ).map((g) => g.id),
    expected,
  );
  assert.deepEqual(projects, before);
});
