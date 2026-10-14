import test from "node:test";
import assert from "node:assert/strict";
import { periodRange, currentProjectRecords } from "../src/model.ts";
import { buildSearchIndex, searchDocuments } from "../src/search-index.ts";
import { createRequire } from "node:module";
const { validPersonal } = createRequire(import.meta.url)(
  "../integration/personal-schema.cjs",
);

test("合并记录中的内部更正不将同一记录标成历史，外部更正仍生效", () => {
  const record = {
    id: "merged",
    project: "p",
    date: "2026-10-13",
    title: "当前合并判断",
    change: "正文",
    next: "",
    kind: "发现",
    confirmed: true,
    sourceIds: ["original", "correction"],
    relations: [{ type: "supersedes", target: "original" }],
  };
  const store = { version: 1, projects: [], notes: {}, records: [record] };
  assert.equal(currentProjectRecords(store, "p").length, 1);
  assert.equal(
    searchDocuments(buildSearchIndex(store), { text: "当前合并判断" }).length,
    1,
  );
  store.records.push({
    ...record,
    id: "later",
    title: "外部更正",
    sourceIds: ["later-source"],
    relations: [{ type: "negates", target: "original" }],
  });
  assert.deepEqual(
    currentProjectRecords(store, "p").map((r) => r.id),
    ["later"],
  );
  assert.equal(
    searchDocuments(buildSearchIndex(store), { text: "当前合并判断" }).length,
    0,
  );
});

test("人工周期跨年周和闰年月份具有稳定的起止日期与键", () => {
  const ranges = [
    ["周", "2026-01-01", "2025-12-29", "2026-01-04"],
    ["月", "2024-02-29", "2024-02-01", "2024-02-29"],
    ["月", "2025-02-28", "2025-02-01", "2025-02-28"],
    ["年", "2024-02-29", "2024-01-01", "2024-12-31"],
  ];
  const periodReviews = {};
  for (const [period, anchor, start, end] of ranges) {
    assert.deepEqual(periodRange(period, 0, anchor), [start, end]);
    periodReviews[`${period}:${start}`] = {
      period,
      start,
      end,
      text: "独立手写回望",
      references: [{ recordId: "missing", title: "已不可用记录", date: start }],
      updatedAt: "2026-10-13T00:00:00Z",
    };
  }
  const envelope = {
    revision: 0,
    store: { version: 1, projects: [], records: [], notes: {}, periodReviews },
  };
  assert.equal(validPersonal(envelope), true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(envelope)).store.periodReviews,
    periodReviews,
  );
  assert.deepEqual(periodRange("月", -1, "2026-01-01"), [
    "2025-12-01",
    "2025-12-31",
  ]);
});
