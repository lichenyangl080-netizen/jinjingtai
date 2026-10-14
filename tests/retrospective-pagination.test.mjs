import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkContext,
  displacedBy,
  visibleRecords,
  workGroups,
} from "../src/model.ts";
import {
  retrospectiveDays,
  filterRetrospectiveDays,
  sliceRetrospectiveDays,
} from "../src/retrospective.ts";

const record = (id, extra = {}) => ({
  id,
  project: "p",
  date: "2026-10-13",
  title: id,
  change: id,
  next: "",
  kind: "发现",
  manual: true,
  ...extra,
});
const store = (records) => ({
  version: 1,
  projects: [{ id: "p", name: "合成项目", subject: "", status: "", next: "" }],
  records,
  notes: {},
});

test("prepared grouping preserves corrections, self/source identity, removed authors, and invalidated summaries", () => {
  const state = store([
    record("a", {
      manual: false,
      sourceIds: ["source-a"],
      work: { title: "一项工作", summary: "旧摘要", sources: ["source-a"] },
    }),
    record("b", {
      removed: true,
      relations: [{ type: "negates", target: "source-a" }],
    }),
    record("c", {
      progressHidden: true,
      relations: [{ type: "supersedes", target: "a" }],
    }),
    record("self", {
      sourceIds: ["source-self"],
      relations: [{ type: "negates", target: "source-self" }],
    }),
    record("draft", {
      supersededDraftBy: "a",
      relations: [{ type: "negates", target: "self" }],
    }),
    record("supplement", {
      relations: [{ type: "supplements", target: "self" }],
    }),
  ]);
  const snapshot = JSON.stringify(state);
  const prepared = buildWorkContext(state);
  for (const r of state.records)
    assert.equal(prepared.corrections.get(r), displacedBy(state, r));
  assert.deepEqual(
    workGroups(state, visibleRecords(state), prepared),
    workGroups(state, visibleRecords(state)),
  );
  assert.equal(JSON.stringify(state), snapshot);
  state.records.push(
    record("removed-member", {
      removed: true,
      manual: false,
      work: { title: "一项工作", summary: "旧摘要" },
    }),
  );
  const refreshed = buildWorkContext(state);
  assert.deepEqual(
    workGroups(state, visibleRecords(state), refreshed),
    workGroups(state, visibleRecords(state)),
  );
});

test("pagination never truncates filtering, source groups, full reading sequence or original data", () => {
  const state = store(
    Array.from({ length: 450 }, (_, i) =>
      record("r" + i, { date: i < 240 ? "2026-10-12" : "2026-10-13" }),
    ),
  );
  const before = JSON.stringify(state);
  const days = retrospectiveDays(state, "2026-10-01", "2026-10-31", "", "", "");
  const ids = (days) =>
    days.flatMap((d) =>
      d.projects.flatMap((p) =>
        p.works.flatMap((w) => w.records.map((r) => r.id)),
      ),
    );
  assert.equal(ids(sliceRetrospectiveDays(days, 200)).length, 200);
  assert.equal(ids(sliceRetrospectiveDays(days, 400)).length, 400);
  assert.equal(ids(days).length, 450);
  const found = filterRetrospectiveDays(days, "", "", "r449");
  assert.deepEqual(ids(found), ["r449"]);
  assert.deepEqual(ids(filterRetrospectiveDays(days, "p", "2026-10", "r449")), [
    "r449",
  ]);
  assert.equal(JSON.stringify(state), before);
});
