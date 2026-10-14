const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-acceptance-"));
process.env.JINJINGTAI_HOME = path.join(root, "home");
const S = require("../integration/store.cjs"),
  O = require("../integration/consolidate.cjs");
const work = path.join(root, "work");
fs.mkdirSync(work);
fs.mkdirSync(path.join(S.HOME, "internal"), { recursive: true });
const library = path.join(root, "library");
fs.mkdirSync(library);
S.atomic(path.join(S.HOME, "connection.json"), {
  version: 1,
  enabled: true,
  library,
  roots: [work],
});
function hook(
  turn,
  args = {
    outcome: "change",
    items: [
      {
        kind: "implementation",
        title: "实现一个函数",
        summary: "写入代码，尚未运行测试。",
      },
    ],
  },
) {
  return {
    cwd: work,
    session_id: "simulation-session",
    turn_id: turn,
    tool_use_id: "call-" + turn,
    tool_input: args,
  };
}
function record(h) {
  h.tool_input = { ...h.tool_input, _gate: S.issue(h) };
  const r = S.submit(h.tool_input);
  S.bind(h);
  return r;
}
test("模拟：正文接收前核准目录，伪造路径/缺少签名/篡改参数均拒收", () => {
  assert.throws(
    () =>
      S.submit({
        outcome: "change",
        items: [{ title: "PRIVATE_OUTSIDE_BODY" }],
        workspace: work,
      }),
    /GATE_REQUIRED/,
  );
  const outside = hook("outside");
  outside.cwd = root;
  assert.throws(() => S.issue(outside), /OUTSIDE_SCOPE/);
  const h = hook("tampered"),
    _gate = S.issue(h);
  assert.throws(
    () =>
      S.submit({
        ...h.tool_input,
        _gate,
        items: [{ title: "PRIVATE_OUTSIDE_BODY" }],
      }),
    /GATE_EXPIRED_OR_CHANGED/,
  );
  const spoof = hook("source-spoof", {
    outcome: "change",
    items: [
      {
        kind: "implementation",
        title: "伪造来源",
        summary: "不能覆盖可信来源",
      },
    ],
    source: { cwd: work, session: "fake" },
  });
  assert.throws(
    () => S.submit({ ...spoof.tool_input, _gate: S.issue(spoof) }),
    /UNKNOWN_RECORD_FIELD/,
  );
  assert.equal(S.list("stages").length, 0);
  assert.ok(!JSON.stringify(S.list("events")).includes("PRIVATE_OUTSIDE_BODY"));
});
test("模拟：有变化、无变化、失败和建议的状态保持区分，重试幂等", () => {
  const h = hook("one"),
    r = record(h);
  assert.ok(S.bound(S.list("stages").find((s) => s.id === r.id)));
  assert.equal(S.submit(h.tool_input).duplicate, true);
  record(hook("query", { outcome: "no_change", items: [] }));
  assert.throws(
    () =>
      record(
        hook("fake-verified", {
          outcome: "change",
          items: [{ kind: "verified", title: "声称完成", summary: "没有依据" }],
        }),
      ),
    /VERIFICATION_EVIDENCE_REQUIRED/,
  );
  assert.throws(
    () =>
      record(
        hook("unaccepted", {
          outcome: "change",
          items: [
            {
              kind: "decision",
              title: "建议B",
              summary: "用户未采纳",
              acceptance: "unaccepted",
            },
          ],
        }),
      ),
    /DECISION_NOT_ADOPTED/,
  );
  record(
    hook("failed", {
      outcome: "change",
      items: [
        {
          kind: "attempt",
          title: "实验失败",
          summary: "验证输出不符合预期，排除当前参数。",
        },
      ],
    }),
  );
  assert.equal(O.preview(S.day()).length, 2);
});
test("模拟：授权撤销立即失效；来源绑定失败保持隔离", () => {
  const h = hook("pending");
  h.tool_input = { ...h.tool_input, _gate: S.issue(h) };
  const r = S.submit(h.tool_input);
  assert.equal(S.bound(S.list("stages").find((s) => s.id === r.id)), false);
  assert.ok(!O.preview(S.day()).some((s) => s.id === r.id));
  const c = S.config();
  S.atomic(path.join(S.HOME, "connection.json"), { ...c, roots: [] });
  assert.throws(() => S.submit(h.tool_input), /OUTSIDE_SCOPE/);
  S.atomic(path.join(S.HOME, "connection.json"), c);
});
test("模拟：上海工作日3:59与4:00边界", () => {
  assert.equal(S.day("2026-10-05T03:59:59+08:00"), "2026-10-04");
  assert.equal(S.day("2026-10-05T04:00:00+08:00"), "2026-10-05");
});
test("模拟：人工内容不会进入整理投影；旧稿、附件和移除不会被重放覆盖", () => {
  const p = S.personal();
  p.store.records.push({
    id: "human",
    project: "unassigned",
    next: "",
    kind: "发现",
    date: S.day(),
    title: "PRIVATE_HUMAN_TEXT",
    change: "PRIVATE_MANUAL_EDIT",
    confirmed: true,
    manual: true,
    attachments: [{ id: "attachment", name: "PRIVATE_IMAGE", size: 0 }],
  });
  S.savePersonal(p.store, p.revision, p.libraryId);
  const stage = S.list("stages").find((s) => s.source.turn === "one"),
    sid = stage.id + ":0";
  const job = {
    id: "simulation-job",
    date: "2026-10-03",
    state: "complete",
    materials: [
      {
        id: sid,
        kind: "implementation",
        title: "函数",
        summary: "尚未验证",
        evidence: [],
        relations: [],
      },
    ],
    result: {
      entries: [
        { title: "函数", summary: "尚未验证", next: "", sources: [sid] },
      ],
      unprocessed: [],
    },
  };
  S.atomic(path.join(S.library(), "jobs", job.id + ".json"), job);
  const first = O.apply(job.id);
  assert.equal(first.date, "2026-10-03");
  assert.equal(first.added, 1);
  assert.equal(first.store.records[0].change, "PRIVATE_MANUAL_EDIT");
  const next = S.personal();
  next.store.records.at(-1).change = "人工校正";
  next.store.records.at(-1).removed = true;
  S.savePersonal(next.store, next.revision, next.libraryId);
  assert.equal(O.apply(job.id).added, 0);
  assert.equal(S.personal().store.records.at(-1).change, "人工校正");
  assert.equal(S.personal().store.records.at(-1).removed, true);
  assert.ok(!JSON.stringify(O.preview(S.day())).includes("PRIVATE_HUMAN_TEXT"));
});
test("模拟：日报引用与覆盖检查，不允许编造来源或混合已采纳/未采纳", () => {
  const materials = [
    { id: "a", kind: "proposal" },
    { id: "b", kind: "decision" },
  ];
  assert.throws(
    () =>
      O.validateResult(
        {
          entries: [
            { title: "决定", summary: "决定了", next: "", sources: ["a", "b"] },
          ],
          unprocessed: [],
        },
        materials,
      ),
    /MIXED_EVIDENCE_STATUS/,
  );
  assert.throws(
    () => O.validateResult({ entries: [], unprocessed: ["fake"] }, materials),
    /INVALID_COVERAGE/,
  );
  assert.throws(
    () => O.validateResult({ entries: [], unprocessed: ["a"] }, materials),
    /INCOMPLETE_COVERAGE/,
  );
});

test("每日成果限制每项目三条，合并保留来源，其他材料去向明确且不混合状态", () => {
  const items = Array.from({ length: 5 }, (_, n) => ({
    id: "compact-" + n,
    workspace: "project-a",
    kind: "verified",
  }));
  const split = {
    entries: items.map((i) => ({
      title: i.id,
      summary: "变化",
      next: "",
      sources: [i.id],
    })),
    unprocessed: [],
  };
  assert.throws(
    () => O.validateResult(split, items, false, true),
    /TOO_MANY_DAILY_ENTRIES/,
  );
  const grouped = {
    entries: [
      {
        title: "改善工作台",
        summary: "多轮改动合并",
        next: "",
        sources: items.map((i) => i.id),
      },
    ],
    unprocessed: [],
  };
  assert.doesNotThrow(() => O.validateResult(grouped, items, false, true));
  assert.doesNotThrow(() =>
    O.validateResult(
      {
        entries: [
          {
            title: "重要进展",
            summary: "结果",
            next: "",
            sources: ["compact-0"],
          },
        ],
        unprocessed: items.slice(1).map((i) => i.id),
      },
      items,
      false,
      true,
    ),
  );
  assert.throws(
    () =>
      O.validateResult(
        grouped,
        [...items.slice(0, 4), { ...items[4], kind: "implementation" }],
        false,
        true,
      ),
    /MIXED_EVIDENCE_STATUS/,
  );
  assert.doesNotThrow(() => O.validateResult(split, items));
});
test("模拟：旧进程锁恢复、版本冲突保护与损坏索引重建", () => {
  const p = S.personal();
  assert.throws(
    () => S.savePersonal(p.store, p.revision - 1, p.libraryId),
    /REVISION_CONFLICT/,
  );
  const lock = path.join(S.library(), ".write-lock");
  fs.mkdirSync(lock);
  S.atomic(path.join(lock, "owner.json"), { pid: 2147483647 });
  assert.ok(
    S.savePersonal(p.store, p.revision, p.libraryId).revision > p.revision,
  );
  fs.writeFileSync(path.join(S.library(), "index.sqlite"), "corrupt");
  assert.equal(S.rebuildIndex().rebuilt, true);
});
test.after(() => {
  console.log("模拟验收资料目录：" + root);
});
test("要点引用受控，只提炼不会改写任何个人记录或重复加条目", () => {
  const before = S.personal(),
    items = [
      { id: "a", kind: "verified" },
      { id: "b", kind: "attempt" },
    ];
  const result = {
    highlights: [
      { text: "测试通过。", sources: ["a"] },
      { text: "错误预期会导致失败。", sources: ["b"] },
    ],
    entries: [],
    unprocessed: [],
  };
  O.validateResult(result, items, true);
  assert.throws(
    () =>
      O.validateResult(
        { ...result, highlights: [{ text: "编造", sources: ["fake"] }] },
        items,
        true,
      ),
    /INVALID_HIGHLIGHTS/,
  );
  S.atomic(path.join(S.library(), "jobs", "overview-test.json"), {
    id: "overview-test",
    date: S.day(),
    mode: "overview",
    state: "complete",
    materials: items,
    result,
  });
  O.apply("overview-test");
  assert.deepEqual(S.personal(), before);
});
test("未来规划限一个月并可靠保存，越界不能写入", () => {
  const p = S.personal(),
    next = new Date(Date.parse(S.day() + "T12:00:00Z") + 86400000)
      .toISOString()
      .slice(0, 10);
  const saved = S.savePersonal(
    { ...p.store, plans: { [next]: "PRIVATE_PLAN_TEXT" } },
    p.revision,
    p.libraryId,
  );
  assert.equal(saved.store.plans[next], "PRIVATE_PLAN_TEXT");
  assert.throws(
    () =>
      S.savePersonal(
        {
          ...saved.store,
          plans: { ...saved.store.plans, "2099-01-01": "越界" },
        },
        saved.revision,
        saved.libraryId,
      ),
    /PLAN_DATE_OUT_OF_RANGE/,
  );
  assert(S.rebuildIndex().rebuilt);
  assert(!JSON.stringify(O.preview(S.day())).includes("PRIVATE_PLAN_TEXT"));
});
