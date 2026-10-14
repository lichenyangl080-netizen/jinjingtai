import test from "node:test";
import assert from "node:assert/strict";
import {
  groupProjectRecords,
  projectDisplayOrder,
  projectLabel,
  projectDisambiguator,
} from "../src/project-display.ts";
import { visibleRecords, workGroups } from "../src/model.ts";

const project = (id, name = id, extra = {}) => ({
  id,
  name,
  subject: "",
  status: "",
  next: "",
  ...extra,
});
const record = (id, projectId, extra = {}) => ({
  id,
  project: projectId,
  date: "2026-10-13",
  title: id,
  change: "合成测试记录",
  next: "",
  kind: "已验证成果",
  confirmed: false,
  manual: false,
  ...extra,
});

test("同名项目标签显示各自来源目录，独立身份保持不变", () => {
  const projects = [
    { id: "parent", name: "进境台", workspace: "e:\\chatgpt" },
    { id: "child", name: "进境台", workspace: "e:\\chatgpt\\进境台" },
  ];
  assert.notEqual(
    projectLabel(projects[0], projects),
    projectLabel(projects[1], projects),
  );
  assert.equal(
    projectDisambiguator(projects[0], projects),
    projects[0].workspace,
  );
  assert.deepEqual(
    projects.map((p) => p.id),
    ["parent", "child"],
  );
  assert.equal(projectLabel(projects[0], [projects[0]]), "进境台");
});

test("缺少目录的旧同名项目仍有可区分身份", () => {
  const projects = [
    { id: "manual-a", name: "同名" },
    { id: "manual-b", name: "同名" },
  ];
  assert.notEqual(
    projectLabel(projects[0], projects),
    projectLabel(projects[1], projects),
  );
});

test("项目显示保持普通与归档各自顺序、名称和同名身份，未归属始终置底", () => {
  const ordinary = [
    project("later-name", "乙项目"),
    project("same-a", "同名", { workspace: "e:\\parent" }),
    project("same-b", "同名", { workspace: "e:\\child", archived: true }),
    project("workspace-root", "通用工作"),
    project("named-other", "其他"),
  ];
  for (const position of [0, 2, ordinary.length]) {
    const projects = [...ordinary];
    projects.splice(position, 0, project("unassigned", "未归项目"));
    const before = structuredClone(projects);
    const displayed = projectDisplayOrder(projects);

    assert.deepEqual(
      displayed.map((p) => p.id),
      [
        "later-name",
        "same-a",
        "workspace-root",
        "named-other",
        "same-b",
        "unassigned",
      ],
    );
    assert.equal(displayed.at(-1).name, "未归项目");
    assert.equal(displayed.at(-1), projects[position]);
    assert.equal(displayed[0], ordinary[0]);
    assert.equal(displayed.find((p) => p.id === "same-b").archived, true);
    assert.notEqual(
      projectLabel(
        displayed.find((p) => p.id === "same-a"),
        displayed,
      ),
      projectLabel(
        displayed.find((p) => p.id === "same-b"),
        displayed,
      ),
    );
    assert.deepEqual(projects, before);
  }
});

test("每日记录顺序和跨日可见子集不改变项目页顺序，空项目不占分组", () => {
  const projects = [
    project("unassigned", "未归项目"),
    project("first", "第一项目"),
    project("empty", "当日无记录"),
    project("archived", "已归档项目", { archived: true }),
    project("last", "最后项目"),
  ];
  const records = [
    record("last-today", "last"),
    record("earlier", "empty", { date: "2026-10-12" }),
    record("other-today", "unassigned"),
    record("archived-today", "archived"),
    record("removed", "empty", { removed: true }),
    record("first-today", "first"),
    record("hidden", "empty", { progressHidden: true }),
    record("old-draft", "empty", { supersededDraftBy: "job" }),
  ];
  const store = { version: 1, projects, records, notes: {} };
  const before = structuredClone(store);
  const daily = visibleRecords(store, "2026-10-13");
  const groups = groupProjectRecords(projects, daily);
  const reversed = groupProjectRecords(projects, [...daily].reverse());

  assert.deepEqual(
    groups.map((g) => g.id),
    ["first", "last", "archived", "unassigned"],
  );
  const presentIds = new Set(groups.map((g) => g.id));
  assert.deepEqual(
    groups.map((g) => g.id),
    projectDisplayOrder(projects)
      .filter((p) => presentIds.has(p.id))
      .map((p) => p.id),
  );
  assert.deepEqual(
    reversed.map((g) => g.id),
    groups.map((g) => g.id),
  );
  assert.deepEqual(
    groups.flatMap((g) => g.records.map((r) => r.id)).sort(),
    ["first-today", "archived-today", "last-today", "other-today"].sort(),
  );
  assert.deepEqual(
    groupProjectRecords(projects, visibleRecords(store, "2026-10-12")).map(
      (g) => g.id,
    ),
    ["empty"],
  );
  assert.deepEqual(store, before);
});

test("同名项目记录独立分组，归档状态不会把记录移入其他", () => {
  const projects = [
    project("same-a", "同名", { workspace: "e:\\parent" }),
    project("unassigned", "未归项目"),
    project("same-b", "同名", { workspace: "e:\\child", archived: true }),
  ];
  const records = [record("b", "same-b"), record("a", "same-a")];
  const before = structuredClone({ projects, records });
  const groups = groupProjectRecords(projects, records);

  assert.deepEqual(
    groups.map((g) => g.id),
    ["same-a", "same-b"],
  );
  assert.deepEqual(
    groups.map((g) => g.records.map((r) => r.id)),
    [["a"], ["b"]],
  );
  assert.equal(groups[1].archived, true);
  assert.deepEqual({ projects, records }, before);
});

test("未知或空项目ID与未归属记录汇入唯一末尾其他，不漏记、重记或改写身份", () => {
  for (const hasUnassigned of [true, false]) {
    const projects = [
      ...(hasUnassigned ? [project("unassigned", "旧未归属名称")] : []),
      project("p", "项目"),
    ];
    const records = [
      record("orphan-a", "missing-a"),
      record("bound", "p"),
      record("blank", ""),
      record("unassigned", "unassigned"),
      record("orphan-b", "missing-b"),
    ];
    const before = structuredClone({ projects, records });
    const groups = groupProjectRecords(projects, records);

    assert.deepEqual(
      groups.map((g) => g.id),
      ["p", "unassigned"],
    );
    assert.equal(groups.at(-1).name, "其他");
    assert.deepEqual(
      groups.at(-1).records.map((r) => [r.id, r.project]),
      [
        ["orphan-a", "missing-a"],
        ["blank", ""],
        ["unassigned", "unassigned"],
        ["orphan-b", "missing-b"],
      ],
    );
    const groupedIds = groups.flatMap((g) => g.records.map((r) => r.id));
    assert.equal(groupedIds.length, records.length);
    assert.equal(new Set(groupedIds).size, records.length);
    assert.deepEqual(groupedIds.sort(), records.map((r) => r.id).sort());
    assert.deepEqual({ projects, records }, before);
  }
});

test("其他中的两个孤立项目同名事项仍保持各自项目身份", () => {
  const projects = [project("p", "已知项目")];
  const records = [
    record("a", "missing-a", { work: { title: "同名事项", summary: "" } }),
    record("b", "missing-b", { work: { title: "同名事项", summary: "" } }),
  ];
  const store = { version: 1, projects, records, notes: {} };
  const before = structuredClone(store);
  const groups = groupProjectRecords(projects, records);
  const works = workGroups(store, groups[0].records);

  assert.deepEqual(
    groups.map((g) => g.id),
    ["unassigned"],
  );
  assert.equal(works.length, 2);
  assert.equal(new Set(works.map((w) => w.id)).size, 2);
  assert.deepEqual(works.map((w) => w.records.map((r) => r.project)).sort(), [
    ["missing-a"],
    ["missing-b"],
  ]);
  assert.deepEqual(store, before);
});

test("空数据不生成空分组，缺少项目时已有记录仍可阅读", () => {
  assert.deepEqual(projectDisplayOrder([]), []);
  assert.deepEqual(groupProjectRecords([], []), []);
  assert.deepEqual(
    groupProjectRecords([project("unassigned"), project("p")], []),
    [],
  );
  const records = [record("only", "missing")];
  const before = structuredClone(records);
  const groups = groupProjectRecords([], records);
  assert.deepEqual(
    groups.map((g) => [g.id, g.name]),
    [["unassigned", "其他"]],
  );
  assert.equal(groups[0].records[0], records[0]);
  assert.deepEqual(records, before);
});
