const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const prefix = process.argv[2] || "home-restart";
if (!["home-restart", "renderer-boundaries"].includes(prefix))
  throw Error("INVALID_QA_FIXTURE_PREFIX");
const root = path.resolve(__dirname, "../qa"),
  home = path.join(root, prefix + "-" + crypto.randomUUID());
process.env.JINJINGTAI_HOME = home;
const S = require("../integration/store.cjs"),
  work = path.join(home, "test-work"),
  library = path.join(home, "library");
fs.mkdirSync(work, { recursive: true });
S.atomic(path.join(home, "connection.json"), {
  version: 1,
  enabled: true,
  roots: [work],
  library,
  codexHome: path.join(home, "codex-unavailable"),
});
const day = S.day(),
  earlier = S.day(Date.now() - 2 * 86400000);
const records = [
  {
    id: "one",
    date: day,
    project: "p",
    kind: "未验证实现",
    title: "已写好保存流程",
    summary: "保存流程已写好，仍需核对异常退出。",
    change: "保存流程已写好，仍需核对异常退出。",
    next: "检查异常退出",
    confirmed: true,
    manual: false,
    sourceIds: ["consumed-one"],
  },
  {
    id: "two",
    date: day,
    project: "p",
    kind: "已验证成果",
    title: "保存文件可重读",
    summary: "文件重读已核对。",
    change: "文件重读已核对。",
    next: "",
    confirmed: true,
    manual: false,
    sourceIds: ["consumed-two"],
  },
];
S.savePersonal(
  {
    version: 1,
    records,
    projects: [
      { id: "unassigned", name: "未归项目", subject: "", status: "", next: "" },
      { id: "p", name: "测试项目", subject: "", status: "", next: "" },
    ],
    notes: {},
    workAssignments: Object.fromEntries(
      records.map((r) => [
        r.id,
        {
          title: "让记录可靠保存",
          summary: "已写好保存流程；文件重读通过，异常退出仍需核对。",
          sources: ["consumed-one", "consumed-two"],
        },
      ]),
    ),
  },
  0,
  S.personal().libraryId,
);
for (const [date, turn] of [
  [day, "new"],
  [earlier, "calendar"],
]) {
  const id = S.hash("simulation-only-" + turn),
    source = {
      cwd: work,
      session: "qa-isolated",
      turn,
      call: "qa-call-" + turn,
    },
    items = [
      {
        kind: "implementation",
        title: "完善异常处理",
        summary: "已实现异常反馈，仍需核对。",
        relevance: "progress",
      },
    ],
    digest = S.hash({ outcome: "change", items });
  S.atomic(path.join(library, "stages", id + ".json"), {
    id,
    date,
    at: new Date().toISOString(),
    outcome: "change",
    items,
    digest,
    source,
  });
  S.atomic(path.join(library, "bindings", id + ".json"), {
    stage: id,
    digest,
    call: source.call,
    mode: "isolated-fixture",
  });
}
console.log(JSON.stringify({ home, library }));
