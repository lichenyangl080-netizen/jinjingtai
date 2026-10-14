import test from "node:test";
import assert from "node:assert/strict";
import * as personal from "../src/personal-workspace.ts";
import { panelHarness, Action } from "./helpers/panel-harness.mjs";

const record = (id, extra = {}) => ({
  id,
  date: "2026-10-13",
  project: "p",
  title: id,
  change: "人工正文",
  next: "继续对照",
  kind: "发现",
  manual: true,
  ...extra,
});
const fixture = () => ({
  version: 1,
  projects: [{ id: "p", name: "项目", status: "", next: "" }],
  notes: {},
  records: [record("a"), record("unrelated")],
  threads: {
    t: {
      id: "t",
      project: "p",
      title: "跨日过程",
      description: "",
      recordIds: ["a"],
      createdAt: "now",
      updatedAt: "now",
    },
  },
  continuations: { p: { text: "旧起点", updatedAt: "now" } },
});

test("主线的未采纳建议保留关联并按实际类型提示", () => {
  const s = fixture();
  s.records[0].kind = "未采纳建议";
  const h = interaction("ThreadPanel.tsx", s, { targetThreadId: "t" });
  h.button("编辑主线").props.onClick();
  h.flush();
  h.render();
  const text = h.text(
    h.nodes().find((n) => n.props?.["aria-label"] === "已关联记录"),
  );
  assert.ok(!text.includes("历史结论"));
  assert.ok(text.includes("未采纳建议"));
});

test("回望引用分页不会截断保存或连续阅读，选择阶段提示真实历史状态", () => {
  const s = fixture();
  s.records = Array.from({ length: 125 }, (_, i) => record("ref-" + i));
  s.records[124].relations = [{ type: "negates", target: "ref-0" }];
  const references = s.records.map((r) => ({
    recordId: r.id,
    title: r.title,
    date: r.date,
  }));
  s.periodReviews = {
    "月:2026-10-01": {
      period: "月",
      start: "2026-10-01",
      end: "2026-10-31",
      text: "旧正文",
      references,
      updatedAt: "now",
    },
  };
  const h = interaction("PeriodReviewPanel.tsx", s, {
    period: "月",
    start: "2026-10-01",
    end: "2026-10-31",
  });
  h.button("2026-10-13 · ref-1 · 项目").props.onClick();
  assert.equal(h.opened[0].sequence.length, 125);
  h.button("编辑回望").props.onClick();
  h.flush();
  h.render();
  assert.equal(
    h.nodes().filter((n) => n.type === Action && h.text(n) === "移除引用")
      .length,
    50,
  );
  h.button("加载更多已选引用").props.onClick();
  h.render();
  assert.equal(
    h.nodes().filter((n) => n.type === Action && h.text(n) === "移除引用")
      .length,
    100,
  );
  const filter = h
    .nodes()
    .find(
      (n) => n.type === "input" && n.props.placeholder === "标题或正文关键词",
    );
  filter.props.onChange({ target: { value: "ref-0" } });
  h.render();
  assert.ok(
    h
      .text(h.nodes().find((n) => n.props?.["aria-label"] === "本期引用候选"))
      .includes("历史结论"),
  );
  h.nodes()
    .find((n) => n.type === "textarea")
    .props.onChange({ target: { value: "新正文" } });
  h.render();
  h.button("保存回望").props.onClick();
  assert.equal(h.latest.periodReviews["月:2026-10-01"].references.length, 125);
  assert.equal(h.latest.periodReviews["月:2026-10-01"].text, "新正文");
});

test("起点来源按标题与下一步字面检索，呈现分页不改手写草稿", () => {
  const s = fixture();
  delete s.continuations;
  s.records = Array.from({ length: 1000 }, (_, i) =>
    record("source-" + i, { next: "动作-" + i }),
  );
  const h = interaction("ContinuationPanel.tsx", s);
  h.button("设置起点").props.onClick();
  h.flush();
  h.render();
  assert.equal(h.nodes().filter((n) => n.type === "option").length, 51);
  h.nodes()
    .find((n) => n.type === "textarea")
    .props.onChange({ target: { value: "自己的草稿" } });
  h.render();
  h.nodes()
    .find((n) => n.props?.["aria-label"] === "筛选起点来源")
    .props.onChange({ target: { value: "source-999 动作-999" } });
  h.render();
  assert.equal(h.nodes().filter((n) => n.type === "option").length, 2);
  assert.equal(
    h.nodes().find((n) => n.type === "textarea").props.value,
    "自己的草稿",
  );
  h.nodes()
    .find((n) => n.props?.["aria-label"] === "起点来源")
    .props.onChange({ target: { value: "source-999" } });
  h.render();
  h.button("保存起点").props.onClick();
  assert.equal(h.latest.continuations.p.text, "动作-999");
  assert.equal(h.latest.continuations.p.recordId, "source-999");
});

function interaction(file, initial, extra = {}) {
  let latest = initial;
  let pending;
  let editor;
  const opened = [];
  const props = {
    store: initial,
    project: initial.projects[0],
    commit(update) {
      assert.equal(typeof update, "function", "必须从最新资料生成变更");
      latest = update(latest);
      return true;
    },
    safely: (action) => {
      pending = action;
    },
    registerEditor: (value) => {
      editor = value;
    },
    openRecord: (record, sequence) => opened.push({ id: record.id, sequence }),
    ...extra,
  };
  const panel = panelHarness(file, props);
  return {
    ...panel,
    get latest() {
      return latest;
    },
    set latest(value) {
      latest = value;
    },
    get editor() {
      return editor;
    },
    opened,
    flush() {
      assert.ok(pending);
      const action = pending;
      pending = undefined;
      action();
    },
  };
}

test("回望和主线筛选包含下一步但不扩展到依据", () => {
  for (const file of ["PeriodReviewPanel.tsx", "ThreadPanel.tsx"]) {
    const state = fixture();
    state.records = [
      record("next-only", { next: "下一步独有词", evidence: "原始依据独有词" }),
    ];
    const h = interaction(file, state, {
      period: "月",
      start: "2026-10-01",
      end: "2026-10-31",
    });
    h.button(
      file.startsWith("Period") ? "写本期回望" : "新建主线",
    ).props.onClick();
    h.flush();
    h.render();
    const input = h
      .nodes()
      .find((n) => n.props?.placeholder === "标题或正文关键词");
    input.props.onChange({ target: { value: "下一步独有词" } });
    h.render();
    assert.equal(
      h.nodes().filter((n) => n.type === "input" && n.props.type === "checkbox")
        .length,
      1,
    );
    input.props.onChange({ target: { value: "原始依据独有词" } });
    h.render();
    assert.equal(
      h.nodes().filter((n) => n.type === "input" && n.props.type === "checkbox")
        .length,
      0,
    );
  }
});

test("回望编辑提示失效引用，保存仍保留全部摘取上下文", () => {
  for (const unavailable of ["removed", "progressHidden", "missing"]) {
    const state = fixture();
    const ref = { recordId: "lost", title: "摘取标题", date: "2026-10-13" };
    state.records =
      unavailable === "missing"
        ? []
        : [record("lost", { [unavailable]: true })];
    state.periodReviews = {
      "月:2026-10-01": {
        period: "月",
        start: "2026-10-01",
        end: "2026-10-31",
        text: "手写正文",
        references: [ref],
        updatedAt: "2026-10-13T12:00:00Z",
      },
    };
    const h = interaction("PeriodReviewPanel.tsx", state, {
      period: "月",
      start: "2026-10-01",
      end: "2026-10-31",
    });
    h.button("编辑回望").props.onClick();
    h.flush();
    h.render();
    assert.match(
      h.text(h.nodes().find((n) => n.props?.["aria-label"] === "已选引用")),
      /引用记录不可用/,
    );
    h.button("保存回望").props.onClick();
    assert.deepEqual(h.latest.periodReviews["月:2026-10-01"].references, [ref]);
    assert.equal(h.latest.periodReviews["月:2026-10-01"].text, "手写正文");
  }
});

test("主线归档和删除在编辑保护保存后保留最新起点及其他人工扩展", () => {
  for (const operation of ["归档主线", "确认删除主线"]) {
    const original = fixture();
    const h = interaction("ThreadPanel.tsx", original, { targetThreadId: "t" });
    if (operation === "确认删除主线") {
      h.button("删除主线").props.onClick();
      h.flush();
      h.render();
    }
    h.button(operation).props.onClick();
    h.latest = {
      ...h.latest,
      continuations: {
        p: { text: "保护流程刚保存的新起点", updatedAt: "later" },
      },
      periodReviews: { "月:2026-10-01": { text: "独立人工回望" } },
      records: [...h.latest.records, record("added-after-render")],
    };
    const records = structuredClone(h.latest.records);
    h.flush();
    assert.equal(h.latest.continuations.p.text, "保护流程刚保存的新起点");
    assert.equal(h.latest.periodReviews["月:2026-10-01"].text, "独立人工回望");
    assert.deepEqual(h.latest.records, records);
    if (operation === "归档主线")
      assert.equal(h.latest.threads.t.archived, true);
    else assert.equal(h.latest.threads.t, undefined);
  }
});

test("主线阅读只沿本主线成员，已被取代的旧关联仍可解除且不改记录", () => {
  const s = fixture();
  s.records[1].relations = [{ type: "supersedes", target: "a" }];
  const before = structuredClone(s.records);
  const h = interaction("ThreadPanel.tsx", s, { targetThreadId: "t" });
  const row = h.nodes().find((node) => node.props?.["data-record-id"] === "a");
  row.props.onClick();
  assert.deepEqual(h.opened, [{ id: "a", sequence: ["a"] }]);
  h.button("编辑主线").props.onClick();
  h.flush();
  h.render();
  assert.match(h.text(h.nodes()[0]), /a（历史结论）/);
  h.button("解除关联").props.onClick();
  h.render();
  h.button("保存主线").props.onClick();
  assert.deepEqual(h.latest.threads.t.recordIds, []);
  assert.deepEqual(h.latest.records, before);
});

test("历史引用保留原类型，提供可读更正入口且不复活已隐藏更正正文", () => {
  const s = fixture();
  s.records[1].relations = [{ type: "negates", target: "a" }];
  const before = structuredClone(s.records);
  const h = interaction("ReferenceHistory.tsx", s, { record: s.records[0] });
  assert.match(h.text(h.nodes()[0]), /历史结论/);
  h.button("查看更正：unrelated").props.onClick();
  assert.deepEqual(h.opened, [
    { id: "unrelated", sequence: ["a", "unrelated"] },
  ]);
  assert.deepEqual(s.records, before);
  s.records[1].progressHidden = true;
  h.render();
  assert.match(h.text(h.nodes()[0]), /更正记录不可用/);
  assert.ok(!h.text(h.nodes()[0]).includes("查看更正："));
});

test("历史起点来源仍可追溯，隐藏来源不进入依据入口", () => {
  const s = fixture();
  s.records[1].relations = [{ type: "supersedes", target: "a" }];
  s.continuations.p.recordId = "a";
  s.continuations.p.sourceNext = s.records[0].next;
  const h = interaction("ContinuationPanel.tsx", s);
  assert.match(h.text(h.nodes()[0]), /已被否定或取代/);
  h.button("依据：a").props.onClick();
  assert.deepEqual(h.opened, [{ id: "a", sequence: ["a"] }]);
  s.records[0].removed = true;
  h.render();
  assert.ok(!h.text(h.nodes()[0]).includes("依据：a"));
});

test("一万条记录主线折叠不生成成员，展开分页但连续阅读覆盖全部", () => {
  const s = fixture();
  s.records = Array.from({ length: 10000 }, (_, i) => record("r" + i));
  s.threads.t.recordIds = s.records.slice(0, 5000).map((r) => r.id);
  const h = interaction("ThreadPanel.tsx", s);
  assert.equal(h.nodes().filter((n) => n.props?.["data-record-id"]).length, 0);
  assert.match(h.text(h.nodes()[0]), /5000 条记录/);
  h.nodes()
    .find((n) => n.type === "details")
    .props.onToggle({ currentTarget: { open: true } });
  h.render();
  const rows = h.nodes().filter((n) => n.props?.["data-record-id"]);
  assert.equal(rows.length, 50);
  rows[0].props.onClick();
  assert.equal(h.opened[0].sequence.length, 5000);
  h.button("加载更多主线记录").props.onClick();
  h.render();
  assert.equal(
    h.nodes().filter((n) => n.props?.["data-record-id"]).length,
    100,
  );
});

test("回望引用按全库身份解析改期记录，新增候选仍限定本期", () => {
  const s = fixture();
  s.records[0].date = "2026-09-30";
  s.periodReviews = {
    "月:2026-10-01": {
      period: "月",
      start: "2026-10-01",
      end: "2026-10-31",
      text: "我的回望",
      references: [{ recordId: "a", title: "摘取标题", date: "2026-10-13" }],
      updatedAt: "now",
    },
  };
  const h = interaction("PeriodReviewPanel.tsx", s, {
    period: "月",
    start: "2026-10-01",
    end: "2026-10-31",
  });
  h.button("2026-10-13 · 摘取标题 · 项目").props.onClick();
  assert.deepEqual(h.opened, [{ id: "a", sequence: ["a"] }]);
  assert.match(h.text(h.nodes()[0]), /记录日期已改为 2026-09-30/);
  h.button("编辑回望").props.onClick();
  h.flush();
  h.render();
  assert.equal(
    h
      .nodes()
      .filter((node) => node.type === "input" && node.props.type === "checkbox")
      .length,
    1,
  );
  h.button("移除引用").props.onClick();
  h.render();
  h.button("保存回望").props.onClick();
  assert.deepEqual(h.latest.periodReviews["月:2026-10-01"].references, []);
  assert.equal(h.latest.records[0].date, "2026-09-30");
});

test("起点摘取已编辑来源保存签名，写入失败保留编辑输入", () => {
  const s = fixture();
  s.records[0].humanEdited = true;
  const h = interaction("ContinuationPanel.tsx", s);
  h.button("编辑起点").props.onClick();
  h.flush();
  h.render();
  h.nodes()
    .find((node) => node.type === "select")
    .props.onChange({ target: { value: "a" } });
  h.render();
  h.button("保存起点").props.onClick();
  assert.equal(
    h.latest.continuations.p.sourceSignature,
    personal.continuationSourceSignature(s.records[0]),
  );
  assert.equal(personal.continuationWarning(h.latest, "p"), "");
  h.render({
    store: h.latest,
    project: h.latest.projects[0],
    commit: (_update, onError) => {
      onError("磁盘写入失败");
      return false;
    },
    safely: (action) => action(),
    registerEditor() {},
    openRecord() {},
  });
  h.button("编辑起点").props.onClick();
  h.render();
  h.nodes()
    .find((node) => node.type === "textarea")
    .props.onChange({ target: { value: "不能丢失的手写输入" } });
  h.render();
  h.button("保存起点").props.onClick();
  h.render();
  assert.equal(
    h.nodes().find((node) => node.type === "textarea").props.value,
    "不能丢失的手写输入",
  );
  assert.match(h.text(h.nodes()[0]), /磁盘写入失败/);
});
test("主线编辑已关联记录分页，但保存包含全部成员且不改原正文", () => {
  const s = fixture();
  s.records = Array.from({ length: 125 }, (_, i) => record("member-" + i));
  s.threads.t.recordIds = s.records.map((r) => r.id);
  const originalRecords = structuredClone(s.records);
  const h = interaction("ThreadPanel.tsx", s, { targetThreadId: "t" });
  h.button("编辑主线").props.onClick();
  h.flush();
  h.render();
  const rows = () =>
    h.nodes().filter((n) => n.type === Action && h.text(n) === "解除关联")
      .length;
  assert.equal(rows(), 50);
  h.button("加载更多已关联记录").props.onClick();
  h.render();
  assert.equal(rows(), 100);
  h.nodes()
    .find((n) => n.type === "input" && n.props.value === "跨日过程")
    .props.onChange({ target: { value: "已编辑标题" } });
  h.render();
  h.button("保存主线").props.onClick();
  h.render();
  assert.equal(h.latest.threads.t.recordIds.length, 125);
  assert.deepEqual(h.latest.records, originalRecords);
});
