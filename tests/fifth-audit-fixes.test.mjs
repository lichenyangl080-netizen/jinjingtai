import test from "node:test";
import assert from "node:assert/strict";
import { historicalRecordIds, recordRelationEdges } from "../src/model.ts";
const record = (id, extra = {}) => ({
  id,
  project: "p",
  date: "2026-10-13",
  title: id,
  change: "正文",
  next: "",
  kind: "发现",
  ...extra,
});
const store = (records) => ({ version: 1, projects: [], notes: {}, records });
test("历史状态来自真实更正，建议类型不等于历史，移除更正不复活结论", () => {
  const s = store([
    record("proposal", { kind: "未采纳建议" }),
    record("old", { sourceIds: ["source-old"] }),
    record("later", {
      removed: true,
      relations: [{ type: "negates", target: "source-old" }],
    }),
  ]);
  assert.deepEqual([...historicalRecordIds(s)], ["old"]);
});
test("内部来源补充不生成自身链接，真实跨记录关系及不可用目标仍保留", () => {
  const merged = record("merged", {
    sourceIds: ["a", "b"],
    relations: [
      { type: "supplements", target: "a" },
      { type: "supplements", target: "missing" },
    ],
  });
  const later = record("later", {
    relations: [{ type: "supplements", target: "b" }],
  });
  const s = store([merged, later]),
    before = structuredClone(s);
  const edges = recordRelationEdges(s, merged);
  assert.equal(edges.length, 2);
  assert.equal(edges[0].record, undefined);
  assert.equal(edges[1].record.id, "later");
  assert.equal(edges[1].incoming, true);
  assert.deepEqual(s, before);
});
