import test from "node:test";
import assert from "node:assert/strict";
import { panelHarness } from "./helpers/panel-harness.mjs";
import { saveContinuation } from "../src/personal-commands.ts";
import { PersonalValidationError } from "../src/personal-errors.ts";
import { continuationSourceSignature } from "../src/personal-workspace.ts";
import { reviewOffset } from "../src/review-navigation.ts";
import { periodRange } from "../src/model.ts";
import { restoreRecordReading } from "../src/record-reading.ts";

const record = {
  id: "r",
  project: "p",
  date: "2026-10-14",
  title: "记录",
  change: "正文",
  next: "原行动",
  kind: "发现",
  manual: true,
};
const fixture = () => ({
  version: 1,
  projects: [{ id: "p", name: "项目", status: "", next: "" }],
  records: [{ ...record }],
  notes: {},
});
function usagePanel() {
  const store = fixture();
  let editor,
    discarded = 0,
    closed = 0,
    saved = 0;
  const props = {
    store,
    recordId: "r",
    registerEditor: (value) => {
      editor = value;
    },
    commit(update, onError) {
      try {
        update(props.store);
        saved++;
        return true;
      } catch (error) {
        onError(error.message);
        return false;
      }
    },
    close: () => closed++,
    discard: () => discarded++,
    saved: () => {},
    safely: () => {},
    openRecord: () => {},
  };
  const h = panelHarness("RecordUsageDialog.tsx", props);
  return {
    ...h,
    props,
    get editor() {
      return editor;
    },
    get closed() {
      return closed;
    },
    get discarded() {
      return discarded;
    },
    get saved() {
      return saved;
    },
  };
}
test("用途草稿保护固定在打开时的基线，来源更新不清除dirty", () => {
  const h = usagePanel();
  h.nodes()
    .find((n) => n.type === "textarea")
    .props.onChange({ target: { value: "手写行动" } });
  h.render();
  assert.equal(h.editor.dirty, true);
  h.props.store = {
    ...h.props.store,
    records: [{ ...record, next: "手写行动" }],
  };
  h.render(h.props);
  assert.equal(h.editor.dirty, true);
  h.button("保存用途").props.onClick();
  h.render();
  assert.equal(h.saved, 0);
  assert.equal(h.closed, 0);
  assert.match(h.text(h.nodes()[0]), /来源已改变/);
  h.unmount();
  assert.equal(h.editor, null);
});
test("来源更新不把未修改草稿判脏；改变用途触发保护，discard不执行返回", () => {
  const h = usagePanel();
  h.props.store = {
    ...h.props.store,
    records: [{ ...record, next: "新来源" }],
  };
  h.render(h.props);
  assert.equal(h.editor.dirty, false);
  h.nodes()
    .find((n) => n.props?.["aria-label"] === "记录用途")
    .props.onChange({ target: { value: "review" } });
  h.render();
  assert.equal(h.editor.dirty, true);
  h.editor.discard();
  assert.equal(h.discarded, 1);
  assert.equal(h.closed, 0);
});
const stage = (id, binding = "bound") => ({
  id,
  binding,
  at: "2026-10-14T02:00:00Z",
  outcome: "no_change",
});
const capture = (stages) => ({ stages });
test("接入会话跨页面保留基线；pending与旧阶段不算新回执；重新等待和切库重置", () => {
  const h = panelHarness("../useConnectionSession.ts", [
    "lib-a",
    true,
    capture([stage("old")]),
  ]);
  h.value.toggleTrust();
  h.render();
  h.value.waitForReceipt();
  h.render();
  assert.equal(h.value.waiting, true);
  // The workspace stays mounted when its Settings child leaves and returns.
  h.render([
    "lib-a",
    true,
    capture([stage("pending", "pending"), stage("old")]),
  ]);
  assert.equal(h.value.received, undefined);
  h.render(["lib-a", true, capture([stage("new"), stage("old")])]);
  assert.equal(h.value.received.id, "new");
  h.value.waitForReceipt();
  h.render();
  assert.equal(h.value.received, undefined);
  h.render(["lib-b", true, capture([stage("new")])]);
  h.render();
  assert.equal(h.value.waiting, false);
  assert.equal(h.value.trustDone, false);
  h.unmount();
});
test("环境检查切库或工作区卸载后拒绝迟到结果", async () => {
  const oldWindow = globalThis.window;
  let resolve;
  globalThis.window = {
    jinjingtai: {
      checkConnection: () =>
        new Promise((r) => {
          resolve = r;
        }),
    },
  };
  try {
    const h = panelHarness("../useConnectionSession.ts", [
      "a",
      true,
      capture([]),
    ]);
    const pending = h.value.checkEnvironment();
    h.render(["b", true, capture([])]);
    h.render();
    resolve({ available: true, checkedAt: "now", login: "signed_in" });
    await pending;
    h.render();
    assert.equal(h.value.environment, null);
    const second = h.value.checkEnvironment();
    h.unmount();
    resolve({ available: true });
    await second;
    h.render(["b", true, capture([])]);
    assert.equal(h.value.environment, null);
  } finally {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
});
test("人工起点统一拒绝失效的新摘取，保留既有来源与手写内容", () => {
  const store = fixture();
  const command = {
    mode: "extract",
    text: record.next,
    recordId: record.id,
    sourceSignature: continuationSourceSignature(record),
  };
  const hidden = { ...store, records: [{ ...record, progressHidden: true }] };
  assert.throws(
    () => saveContinuation(hidden, "p", command),
    PersonalValidationError,
  );
  const modified = { ...store, records: [{ ...record, next: "改过" }] };
  assert.throws(() => saveContinuation(modified, "p", command), /来源已改变/);
  const retained = saveContinuation(hidden, "p", {
    mode: "retain",
    value: { text: "已保存副本", recordId: "r", sourceNext: "原行动" },
  });
  assert.equal(retained.continuations.p.recordId, "r");
  const manual = saveContinuation(retained, "p", {
    mode: "manual",
    text: "人工新行动",
  });
  assert.equal(manual.continuations.p.recordId, undefined);
  assert.deepEqual(manual.records, hidden.records);
});
test("两个回望入口统一使用日历偏移：跨年周、闰月、月与年", () => {
  for (const [period, target, today] of [
    ["周", "2025-12-30", "2026-01-14"],
    ["月", "2024-02-29", "2026-10-14"],
    ["年", "2024-02-29", "2026-10-14"],
  ]) {
    assert.deepEqual(
      periodRange(period, reviewOffset(period, target, today), today),
      periodRange(period, 0, target),
    );
  }
});
test("详情返回按最新记录解析并保留序列，切库或不可读时不恢复", () => {
  const store = fixture();
  const context = {
    library: "a",
    recordId: "r",
    sequence: ["r", "other"],
    expanded: true,
    fromSearch: true,
  };
  const latest = { ...store, records: [{ ...record, title: "最新标题" }] };
  const reading = restoreRecordReading(latest, "a", context);
  assert.equal(reading.record.title, "最新标题");
  assert.deepEqual(reading.sequence, context.sequence);
  assert.equal(restoreRecordReading(latest, "b", context), null);
  assert.equal(
    restoreRecordReading(
      { ...store, records: [{ ...record, removed: true }] },
      "a",
      context,
    ),
    null,
  );
});
