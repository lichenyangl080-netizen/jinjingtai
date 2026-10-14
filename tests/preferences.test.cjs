const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-preferences-"));
process.env.JINJINGTAI_HOME = path.join(root, "home");
const S = require("../integration/store.cjs"),
  P = require("../integration/preferences.cjs");
const library = path.join(root, "library"),
  work = path.join(root, "work"),
  backup = path.join(root, "backup");
for (const p of [library, work, backup]) fs.mkdirSync(p, { recursive: true });
S.atomic(path.join(S.HOME, "connection.json"), {
  enabled: true,
  library,
  roots: [work],
  instructionFiles: ["fixture"],
  scopeMode: "selected",
});
test("显示偏好持久化、名称映射不扩大授权，不进入整理投影", () => {
  const prefs = P.save(
    {
      ...P.load(),
      fontSize: 17,
      density: "compact",
      decoration: false,
      workspaceNames: { [work]: "我的项目" },
    },
    S.personal().libraryId,
  );
  assert.equal(prefs.fontSize, 17);
  assert.equal(P.project(work).name, "我的项目");
  assert.throws(() => S.authorize(root), /OUTSIDE_SCOPE/);
  assert.throws(
    () => P.save({ ...prefs, fontSize: 99 }),
    /INVALID_PREFERENCES/,
  );
});
test("暂停拒收正文，恢复保留范围；不会把未知连接启用", () => {
  P.pause(true);
  assert.equal(S.config().paused, true);
  assert.throws(() => S.authorize(work), /NOT_AUTHORIZED/);
  P.pause(false);
  assert.equal(S.authorize(work), S.canonical(work));
  assert.deepEqual(S.config().roots, [work]);
});
test("备份包含人工正文、附件和偏好，不包含索引与登录信息，失败不回执成功", () => {
  S.atomic(path.join(library, "personal.json"), {
    revision: 1,
    store: {
      ...S.empty(),
      records: [
        {
          id: "manual",
          date: S.day(),
          project: "unassigned",
          change: "",
          next: "",
          kind: "发现",
          manual: true,
          title: "人工正文",
          attachments: [{ id: "fixture", name: "测试附件", size: 10 }],
        },
      ],
    },
  });
  fs.mkdirSync(path.join(library, "attachments"));
  fs.writeFileSync(path.join(library, "attachments", "fixture"), "attachment");
  fs.writeFileSync(path.join(library, "index.sqlite"), "rebuildable");
  fs.writeFileSync(path.join(S.HOME, "gate.key"), "not for export");
  const result = P.backup(backup);
  assert(fs.existsSync(path.join(result.path, "backup-complete.json")));
  assert.equal(
    S.read(path.join(result.path, "资料库", "personal.json")).store.records[0]
      .title,
    "人工正文",
  );
  assert.equal(
    fs.readFileSync(
      path.join(result.path, "资料库", "attachments", "fixture"),
      "utf8",
    ),
    "attachment",
  );
  assert(fs.existsSync(path.join(result.path, "资料库", "preferences.json")));
  assert(!fs.existsSync(path.join(result.path, "资料库", "index.sqlite")));
  assert(!fs.existsSync(path.join(result.path, "gate.key")));
  assert.throws(() => P.backup(library), /BACKUP_DESTINATION_INSIDE_LIBRARY/);
});

test("备份目录作为内部产物排除，正常工作目录仍可采集", () => {
  const c = S.config();
  S.atomic(path.join(S.HOME, "connection.json"), {
    ...c,
    scopeMode: "all-workspaces",
  });
  const folder = fs.readdirSync(backup).find((n) => !n.endsWith(".incomplete"));
  assert.throws(
    () => S.authorize(path.join(backup, folder, "资料库")),
    /INTERNAL_TASK/,
  );
  assert.equal(S.authorize(work), S.canonical(work));
});

test("撤销后不能仅靠恢复按钮假装重新连接", () => {
  const c = S.config();
  S.atomic(path.join(S.HOME, "connection.json"), {
    ...c,
    enabled: false,
    paused: false,
    disconnected: true,
  });
  assert.throws(() => P.pause(false), /CONNECTION_NOT_INSTALLED/);
  assert.equal(S.config().enabled, false);
  S.atomic(path.join(S.HOME, "connection.json"), c);
});
