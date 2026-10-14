const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fixture = JSON.parse(
  execFileSync(
    process.execPath,
    [path.join(__dirname, "setup-daily-home-qa.cjs"), "renderer-boundaries"],
    { encoding: "utf8" },
  ),
);
process.env.JINJINGTAI_HOME = fixture.home;
const S = require("../integration/store.cjs");
const personal = S.personal();
const day = S.day();
const previous = new Date(day + "T12:00:00Z");
previous.setUTCDate(previous.getUTCDate() - 1);
const prior = previous.toISOString().slice(0, 10);
previous.setUTCDate(1);
previous.setUTCMonth(previous.getUTCMonth() - 1);
const oldMonth = previous.toISOString().slice(0, 10);
const record = (id, date, title, change, next) => ({
  id,
  date,
  project: "p",
  title,
  change,
  next,
  kind: "未验证实现",
  manual: true,
  confirmed: false,
  createdAt: date + "T12:00:00Z",
});
personal.store.records.push(
  record(
    "redesign-current",
    day,
    "核对保存边界",
    "隔离合成正文：仅正文定位词，保存实现尚未验证。",
    "检查隔离重开后的正文",
  ),
  record(
    "redesign-prior",
    prior,
    "调整保存方式",
    "隔离合成正文：先保留原记录，再调整保存。",
    "对照不同工作日",
  ),
  record(
    "redesign-old-month",
    oldMonth,
    "检查历史读取",
    "隔离合成正文：跨月记录用于年月定位。",
    "检查历史月份",
  ),
);
personal.store.notes[day] = {
  lesson: "隔离验收心得，不进入模型。",
  tomorrow: "继续核对人工资料。",
};
// Visibility applies to source-backed records, never to manually written prose.
const sourceRecord = personal.store.records.find(
  (r) => r.id === "redesign-current",
);
sourceRecord.manual = false;
sourceRecord.sourceIds = ["redesign-source:0"];
S.savePersonal(personal.store, personal.revision, personal.libraryId);
// A trusted synthetic historical stage exercises the cross-month backlog UI.
const backlogId = S.hash("redesign-cross-month-backlog");
const backlogItems = [
  {
    kind: "implementation",
    title: "核对历史积压入口",
    summary: "隔离验收材料，禁止调用模型。",
    relevance: "progress",
  },
];
const backlogDigest = S.hash({ outcome: "change", items: backlogItems });
S.atomic(path.join(fixture.library, "stages", backlogId + ".json"), {
  id: backlogId,
  date: oldMonth,
  at: oldMonth + "T12:00:00Z",
  outcome: "change",
  items: backlogItems,
  digest: backlogDigest,
  source: {
    cwd: path.join(fixture.home, "test-work"),
    session: "redesign-isolated",
    turn: "backlog",
    call: "redesign-backlog-call",
  },
});
S.atomic(path.join(fixture.library, "bindings", backlogId + ".json"), {
  stage: backlogId,
  digest: backlogDigest,
  call: "redesign-backlog-call",
  mode: "isolated-fixture",
});
console.log(
  JSON.stringify({
    ...fixture,
    profile: path.join(fixture.home, "redesign-profile"),
    day,
    prior,
    oldMonth,
    mode: "redesign",
    ids: ["redesign-current", "redesign-prior", "redesign-old-month"],
  }),
);
