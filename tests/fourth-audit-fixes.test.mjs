import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchIndex, searchDocuments } from "../src/search-index.ts";
import { recordCorrections } from "../src/model.ts";
import { rankThreadRecords } from "../src/personal-workspace.ts";
const record = (id, extra = {}) => ({
  id,
  project: "p",
  date: "2026-10-13",
  kind: "发现",
  title: id,
  change: "正文",
  next: "",
  ...extra,
});
const store = (records) => ({
  version: 1,
  projects: [{ id: "p", name: "项目", status: "", next: "" }],
  records,
  notes: {},
});
test("分散的字面关键词均提供片段，依据只在授权时参与匹配", () => {
  const s = store([
    record("words", {
      change: "ALPHA " + "间隔".repeat(400) + "OMEGA",
      evidence: "[basis] 独有依据",
    }),
  ]);
  const index = buildSearchIndex(s);
  const hit = searchDocuments(index, { text: "alpha omega" })[0];
  assert.match(hit.snippet, /ALPHA/);
  assert.match(hit.snippet, /OMEGA/);
  assert.deepEqual(hit.matchedFields, ["变化"]);
  assert.equal(searchDocuments(index, { text: "[basis]" }).length, 0);
  assert.deepEqual(
    searchDocuments(index, { text: "[basis]", evidence: true })[0]
      .matchedFields,
    ["已保存依据"],
  );
  assert.equal(searchDocuments(index, { text: "alpha missing" }).length, 0);
});
test("历史标记保留，首条更正不可读不会遮蔽后续更正", () => {
  const s = store([
    record("old"),
    record("removed", {
      removed: true,
      relations: [{ type: "supersedes", target: "old" }],
    }),
    record("visible", { relations: [{ type: "negates", target: "old" }] }),
    record("supplement", {
      relations: [{ type: "supplements", target: "old" }],
    }),
  ]);
  assert.equal(searchDocuments(buildSearchIndex(s), { text: "old" }).length, 0);
  assert.equal(
    searchDocuments(buildSearchIndex(s), { text: "old", historical: true })[0]
      .historical,
    true,
  );
  assert.deepEqual(
    recordCorrections(s, s.records[0]).map((r) => r.id),
    ["removed", "visible"],
  );
});
test("主线候选关联按真实来源身份双向排序，拒绝跨项目和历史结论", () => {
  const s = store([
    record("member", {
      sourceIds: ["source-member"],
      relations: [{ type: "supplements", target: "source-forward" }],
    }),
    record("plain"),
    record("back", {
      relations: [{ type: "supplements", target: "source-member" }],
    }),
    record("forward", { sourceIds: ["source-forward"] }),
    record("other", { project: "q" }),
    record("removed", { removed: true }),
  ]);
  const before = structuredClone(s);
  const ranked = rankThreadRecords(s, "p", ["member"]);
  assert.deepEqual([...ranked.relatedIds].sort(), ["back", "forward"]);
  assert.deepEqual(
    ranked.records
      .slice(0, 2)
      .map((r) => r.id)
      .sort(),
    ["back", "forward"],
  );
  assert.ok(!ranked.records.some((r) => ["other", "removed"].includes(r.id)));
  assert.deepEqual(s, before);
});
