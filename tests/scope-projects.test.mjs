import test from "node:test";
import assert from "node:assert/strict";
import { scopeProjects } from "../src/scope-projects.ts";

const material = (id, cwd, name = "进境台", projectId = cwd) => ({
  id,
  cwd,
  project: { id: projectId, name, workspace: cwd },
});

test("同名父子目录保留独立材料和身份，并暴露目录用于区分", () => {
  const parent = "e:\\chatgpt",
    child = "e:\\chatgpt\\进境台";
  const materials = [
    ...Array.from({ length: 11 }, (_, n) => material(`parent-${n}`, parent)),
    ...Array.from({ length: 5 }, (_, n) => material(`child-${n}`, child)),
  ];
  const groups = scopeProjects(materials);
  assert.deepEqual(
    groups.map((g) => ({
      key: g.key,
      sameName: g.sameName,
      directories: g.directories,
      count: g.materials.length,
    })),
    [
      { key: parent, sameName: true, directories: [parent], count: 11 },
      { key: child, sameName: true, directories: [child], count: 5 },
    ],
  );
  assert.deepEqual(
    groups.flatMap((g) => g.materials),
    materials,
  );
  assert.equal(
    groups[0].materials.some((m) => m.id.startsWith("child-")),
    false,
  );
});

test("名称相同才增加区分信息，单个项目的多份材料不算重名", () => {
  const groups = scopeProjects([
    material("a", "e:\\work\\a", "甲"),
    material("b", "e:\\work\\a", "甲"),
    material("c", "e:\\work\\b", "乙"),
  ]);
  assert.deepEqual(
    groups.map((g) => g.sameName),
    [false, false],
  );
  assert.deepEqual(groups[0].directories, ["e:\\work\\a"]);
});

test("没有项目身份时沿用来源目录归组，缺少workspace仍能区分", () => {
  const groups = scopeProjects([
    { id: "a", cwd: "e:\\a", project: { name: "同名" } },
    { id: "b", cwd: "e:\\b", project: { name: "同名" } },
  ]);
  assert.deepEqual(
    groups.map((g) => [g.key, g.directories, g.sameName]),
    [
      ["e:\\a", ["e:\\a"], true],
      ["e:\\b", ["e:\\b"], true],
    ],
  );
  assert.deepEqual(scopeProjects([]), []);
});
