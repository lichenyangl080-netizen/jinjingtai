const test = require("node:test"),
  assert = require("node:assert/strict");
const P = require("../integration/workspace-path.cjs"),
  E = require("../integration/organizer-errors.cjs");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const home = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-root-path-"));
process.env.JINJINGTAI_HOME = home;
const S = require("../integration/store.cjs"),
  Prefs = require("../integration/preferences.cjs");
test("Windows根目录保留分隔符，旧盘符精确兼容，普通相对路径拒收", () => {
  assert.equal(P.normalized("C:\\"), "c:\\");
  assert.equal(P.absolute("c:"), "c:\\");
  assert.equal(P.identity("c:\\"), "c:");
  assert(P.contains("c:\\Users\\x", "c:\\"));
  assert(!P.contains("c:\\work-other", "c:\\work"));
  assert(!P.contains("e:\\work", "c:\\"));
  assert.throws(() => P.absolute("c:relative"), /INVALID_WORKSPACE_PATH/);
  assert.throws(() => P.absolute("relative"), /INVALID_WORKSPACE_PATH/);
  assert.equal(P.normalized("\\\\server\\share\\"), "\\\\server\\share\\");
});
test("真实根目录授权保留边界，项目身份与旧别名稳定，读取不改写资料", () => {
  const library = path.join(home, "library");
  fs.mkdirSync(library);
  S.atomic(path.join(home, "connection.json"), {
    enabled: true,
    library,
    roots: ["C:\\"],
    scopeMode: "selected",
  });
  assert.equal(S.canonical("C:\\"), "c:\\");
  assert.equal(S.authorize("C:\\"), "c:\\");
  assert.throws(() => S.authorize(home), /INTERNAL_TASK/);
  const other = path.parse(process.cwd()).root;
  if (other.toLowerCase() !== "c:\\")
    assert.throws(() => S.authorize(other), /OUTSIDE_SCOPE/);
  assert.equal(Prefs.project("c:").id, Prefs.project("C:\\").id);
  assert.equal(Prefs.project("C:\\").name, "通用工作");
  const prefFile = path.join(library, "preferences.json");
  S.atomic(prefFile, { workspaceNames: { "c:": "原有名称" } });
  const before = fs.readFileSync(prefFile);
  assert.equal(Prefs.project("C:\\").name, "原有名称");
  assert.deepEqual(fs.readFileSync(prefFile), before);
});
test("盘符根目录名称连续保存及修改字号，兼容旧键且拒绝相对路径", () => {
  const id = S.personal().libraryId;
  const projectId = Prefs.project("C:\\").id;
  const first = Prefs.save(
    { ...Prefs.load(), workspaceNames: { "C:\\": "根目录项目" } },
    id,
  );
  const second = Prefs.save(first, id);
  const third = Prefs.save({ ...second, fontSize: 17 }, id);
  assert.equal(third.fontSize, 17);
  assert.deepEqual(third.workspaceNames, { "c:\\": "根目录项目" });
  assert.equal(Prefs.project("C:\\").name, "根目录项目");
  assert.equal(Prefs.project("C:\\").id, projectId);
  const legacy = Prefs.save(
    { ...third, workspaceNames: { "c:": "旧根目录名称" } },
    id,
  );
  assert.deepEqual(legacy.workspaceNames, { "c:\\": "旧根目录名称" });
  for (const cwd of ["c:relative", "relative"]) {
    assert.throws(
      () => Prefs.save({ ...legacy, workspaceNames: { [cwd]: "无效" } }, id),
      /INVALID_PROJECT_NAME/,
    );
  }
  assert.deepEqual(Prefs.load(), legacy);
});

test("路径配置错误与启动、登录和网络失败分别报告", () => {
  assert.equal(
    E.classify(null, "filesystem path `c:` must be absolute"),
    "CODEX_CONFIGURATION_ERROR",
  );
  assert.equal(E.classify({ code: "ENOENT" }, ""), "CODEX_START_FAILED");
  assert.equal(E.classify(null, "401 Unauthorized"), "CODEX_AUTH_REQUIRED");
  assert.equal(E.classify(null, "network error"), "CODEX_NETWORK_ERROR");
  assert.equal(E.classify(null, "unknown error"), "CODEX_UNAVAILABLE");
});
