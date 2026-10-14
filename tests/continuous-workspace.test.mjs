import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { applyRecordUsage } from "../src/record-usage.ts";
import {
  continuationSourceSignature,
  rankThreadRecords,
} from "../src/personal-workspace.ts";
import { currentProjectRecords } from "../src/model.ts";
const require = createRequire(import.meta.url);
const { check } = require("../integration/connection-check.cjs");
const record = (id, extra = {}) => ({
  id,
  project: "p",
  date: "2026-10-14",
  title: id,
  change: "正文 " + id,
  next: "下一步 " + id,
  kind: "发现",
  manual: true,
  ...extra,
});
const fixture = () => ({
  version: 1,
  projects: [
    { id: "p", name: "项目", status: "", next: "" },
    { id: "q", name: "其他项目", status: "", next: "" },
  ],
  records: [
    record("old"),
    record("new", { relations: [{ type: "supersedes", target: "old" }] }),
    record("hidden", { progressHidden: true }),
    record("removed", { removed: true }),
    record("draft", { supersededDraftBy: "new" }),
  ],
  notes: {},
  threads: {
    a: {
      id: "a",
      project: "p",
      title: "A",
      recordIds: ["new"],
      createdAt: "now",
      updatedAt: "now",
    },
    b: {
      id: "b",
      project: "p",
      title: "B",
      recordIds: [],
      createdAt: "now",
      updatedAt: "now",
    },
    q: {
      id: "q",
      project: "q",
      title: "Q",
      recordIds: [],
      createdAt: "now",
      updatedAt: "now",
    },
  },
});
const input = (state, kind, extra = {}) => ({
  kind,
  text: state.records[1].next,
  threadId: "b",
  allowMove: false,
  allowHistorical: false,
  period: "月",
  sourceSignature: continuationSourceSignature(state.records[1]),
  ...extra,
});

test("历史主线选择显式开启，不复活隐藏、移除、归并稿或当前行动", () => {
  const s = fixture(),
    before = JSON.stringify(s);
  assert.deepEqual(
    rankThreadRecords(s, "p", []).records.map((r) => r.id),
    ["new"],
  );
  assert.deepEqual(
    new Set(rankThreadRecords(s, "p", [], true).records.map((r) => r.id)),
    new Set(["old", "new"]),
  );
  assert.deepEqual(
    currentProjectRecords(s, "p").map((r) => r.id),
    ["new"],
  );
  assert.throws(() => applyRecordUsage(s, "old", input(s, "thread")), /历史/);
  const next = applyRecordUsage(
    s,
    "old",
    input(s, "thread", { allowHistorical: true }),
  );
  assert.deepEqual(next.threads.b.recordIds, ["old"]);
  assert.deepEqual(next.records, s.records);
  assert.equal(JSON.stringify(s), before);
});
test("上下文操作原子移动并保留回望正文、引用及来源副本", () => {
  const s = fixture();
  assert.throws(() => applyRecordUsage(s, "new", input(s, "thread")), /移到/);
  const moved = applyRecordUsage(
    s,
    "new",
    input(s, "thread", { allowMove: true }),
  );
  assert.deepEqual(moved.threads.a.recordIds, []);
  assert.deepEqual(moved.threads.b.recordIds, ["new"]);
  assert.deepEqual(moved.records, s.records);
  assert.throws(
    () =>
      applyRecordUsage(
        s,
        "new",
        input(s, "thread", { threadId: "q", allowMove: true }),
      ),
    /同项目/,
  );
  const continued = applyRecordUsage(s, "new", input(s, "continuation"));
  assert.equal(continued.continuations.p.recordId, "new");
  assert.equal(continued.continuations.p.sourceNext, s.records[1].next);
  const edited = applyRecordUsage(
    s,
    "new",
    input(s, "continuation", { text: "手写修订" }),
  );
  assert.equal(edited.continuations.p.recordId, undefined);
  assert.throws(
    () =>
      applyRecordUsage(
        {
          ...s,
          records: s.records.map((r) =>
            r.id === "new" ? { ...r, next: "改过" } : r,
          ),
        },
        "new",
        input(s, "continuation"),
      ),
    /来源已改变/,
  );
  s.periodReviews = {
    "月:2026-10-01": {
      period: "月",
      start: "2026-10-01",
      end: "2026-10-31",
      text: "保留人工正文",
      references: [{ recordId: "old", title: "原题", date: "2026-10-14" }],
      updatedAt: "now",
    },
  };
  const review = applyRecordUsage(s, "new", input(s, "review"));
  assert.equal(review.periodReviews["月:2026-10-01"].text, "保留人工正文");
  assert.equal(review.periodReviews["月:2026-10-01"].references.length, 2);
  assert.equal(
    applyRecordUsage(review, "new", input(s, "review")).periodReviews[
      "月:2026-10-01"
    ].references.length,
    2,
  );
  for (const id of ["hidden", "removed", "draft"])
    assert.throws(() => applyRecordUsage(s, id, input(s, "review")), /不可用/);
});
test("环境检查只运行版本和登录查询，返回信息不含登录输出或凭据", async () => {
  const calls = [];
  const value = await check(
    { codex: "codex" },
    "E:\\isolated",
    async (_file, args, options) => {
      calls.push(args);
      assert(options.windowsHide && options.timeout === 4000);
      return args[0] === "--version"
        ? { stdout: "codex-cli 0.99.0", stderr: "" }
        : { stdout: "Logged in using API key sk-secret-test", stderr: "" };
    },
  );
  assert.deepEqual(calls, [["--version"], ["login", "status"]]);
  assert.equal(value.login, "signed_in");
  assert.equal(value.version, "0.99.0");
  assert(!JSON.stringify(value).includes("secret"));
  const missing = await check({ codex: "codex" }, "E:\\isolated", async () => {
    throw Object.assign(Error("private"), { code: "ENOENT" });
  });
  assert.equal(missing.available, false);
  assert.equal(missing.error, "CODEX_NOT_FOUND");
  const unknown = await check(
    { codex: "codex" },
    "E:\\isolated",
    async (_f, args) => ({
      stdout: args[0] === "--version" ? "codex-cli 0.99.0" : "unsupported",
      stderr: "",
    }),
  );
  assert.equal(unknown.login, "unknown");
});
