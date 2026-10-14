import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchIndex, searchDocuments } from "../src/search-index.ts";

test("概况与起点按独立更新时间搜索，上海凌晨四点工作日边界一致", () => {
  const store = {
    version: 1,
    records: [],
    notes: {},
    projects: [
      {
        id: "p",
        name: "项目",
        subject: "",
        status: "概况独有词",
        next: "旧起点",
        overviewEditedAt: "2026-09-01T02:00:00Z",
      },
    ],
    continuations: {
      p: { text: "起点独有词", updatedAt: "2026-10-12T22:00:00Z" },
    },
    threads: {
      t: {
        id: "t",
        project: "p",
        title: "主线独有词",
        description: "",
        recordIds: [],
        updatedAt: "2026-10-12T22:00:00Z",
      },
    },
  };
  const index = buildSearchIndex(store);
  const october = { start: "2026-10-01", end: "2026-10-31" };
  const result = searchDocuments(index, { text: "起点独有词", ...october });
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, "continuation");
  assert.equal(result[0].date, "2026-10-13");
  assert.equal(
    searchDocuments(index, { text: "概况独有词", ...october }).length,
    0,
  );
  assert.equal(
    searchDocuments(index, { text: "主线独有词" })[0].date,
    "2026-10-13",
  );
  store.continuations.p.updatedAt = "2026-10-12T19:59:59Z";
  assert.equal(
    searchDocuments(buildSearchIndex(store), { text: "起点独有词" })[0].date,
    "2026-10-12",
  );
  store.continuations.p.text = "";
  assert.equal(
    searchDocuments(buildSearchIndex(store), { text: "旧起点" }).length,
    0,
  );
  delete store.continuations;
  assert.equal(
    searchDocuments(buildSearchIndex(store), { text: "旧起点" })[0].date,
    "2026-09-01",
  );
});
