const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { isolatedQa } = require("../electron/qa-environment.cjs"),
  V = require("../integration/verification.cjs"),
  T = require("../integration/file-transaction.cjs");
test("写入验收必须显式隔离HOME、profile及library，正式库与越界库拒收", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-qa-guard-")),
    normal = path.join(dir, "normal"),
    home = path.join(dir, "qa");
  fs.mkdirSync(home);
  assert.throws(() => isolatedQa({}, normal), /REQUIRES/);
  assert.throws(
    () =>
      isolatedQa(
        {
          JINJINGTAI_HOME: normal,
          JINJINGTAI_PROFILE: path.join(dir, "profile"),
        },
        normal,
      ),
    /FORBIDDEN/,
  );
  const env = {
    JINJINGTAI_HOME: home,
    JINJINGTAI_PROFILE: path.join(dir, "profile"),
  };
  fs.writeFileSync(
    path.join(home, "connection.json"),
    JSON.stringify({ library: path.join(normal, "library") }),
  );
  assert.throws(() => isolatedQa(env, normal), /OUTSIDE/);
  fs.writeFileSync(
    path.join(home, "connection.json"),
    JSON.stringify({ library: path.join(home, "library") }),
  );
  assert.equal(isolatedQa(env, normal).home, home);
});
test("node、npm与pytest使用同一实际成功依据；失败、未验证声明和不同测试不升级", () => {
  for (const command of [
    "node --test sum.test.cjs",
    "npm test",
    "npm.cmd run check",
    "pytest tests/test_sum.py",
  ]) {
    const item = { kind: "verified", evidence: [command] };
    assert(V.supports(item, [{ type: "test", command, exitCode: 0 }]));
    assert(!V.supports(item, [{ type: "test", command, exitCode: 1 }]));
    assert(
      !V.supports({ ...item, kind: "implementation" }, [
        { type: "test", command, exitCode: 0 },
      ]),
    );
  }
  assert(
    !V.supports({ kind: "verified", evidence: ["pytest tests/other.py"] }, [
      { type: "test", command: "pytest tests/test_sum.py", exitCode: 0 },
    ]),
  );
});
test("多文件更新失败回滚所有字节，新文件移除；中断日志恢复，不把半套配置当成功", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-transaction-")),
    a = path.join(dir, "a"),
    b = path.join(dir, "b"),
    journal = path.join(dir, "journal");
  fs.writeFileSync(a, "old");
  assert.throws(
    () =>
      T.run(journal, [a, b], () => {
        fs.writeFileSync(a, "new");
        fs.writeFileSync(b, "partial");
        throw Error("fixture");
      }),
    /fixture/,
  );
  assert.equal(fs.readFileSync(a, "utf8"), "old");
  assert(!fs.existsSync(b));
  fs.writeFileSync(
    journal,
    JSON.stringify({
      state: "pending",
      entries: [
        { file: a, exists: true, bytes: Buffer.from("old").toString("base64") },
        { file: b, exists: false },
      ],
    }),
  );
  fs.writeFileSync(a, "crashed");
  fs.writeFileSync(b, "partial");
  T.recover(journal);
  assert.equal(fs.readFileSync(a, "utf8"), "old");
  assert(!fs.existsSync(b));
  assert.equal(
    T.run(journal, [a], () => {
      fs.writeFileSync(a, "committed");
      return true;
    }),
    true,
  );
  assert.equal(fs.readFileSync(a, "utf8"), "committed");
});
test("JSON目录缓存不重复读正文，外部更新与删除立即失效，调用方修改不污染权威", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-cache-"));
  process.env.JINJINGTAI_HOME = home;
  const S = require("../integration/store.cjs");
  S.atomic(path.join(home, "connection.json"), {
    enabled: false,
    roots: [],
    library: path.join(home, "library"),
  });
  const file = path.join(S.library(), "stages", "one.json");
  const stage = {
    id: "one",
    date: "2026-10-07",
    at: "2026-10-07T01:00:00Z",
    digest: "fixture",
    outcome: "change",
    source: { cwd: home, session: "test", turn: "one", call: "call" },
  };
  S.atomic(file, {
    ...stage,
    items: [{ kind: "finding", title: "原文", summary: "测试正文" }],
  });
  const first = S.list("stages");
  first[0].items[0].title = "内存改动";
  let reads = 0;
  const read = fs.readFileSync;
  fs.readFileSync = (f, ...args) => {
    if (path.resolve(f) === path.resolve(file)) reads++;
    return read(f, ...args);
  };
  try {
    assert.equal(S.list("stages")[0].items[0].title, "原文");
    assert.equal(reads, 0);
    S.atomic(file, {
      ...stage,
      items: [{ kind: "finding", title: "外部新增内容", summary: "测试正文" }],
    });
    assert.equal(S.list("stages")[0].items[0].title, "外部新增内容");
    assert.equal(reads, 1);
    fs.unlinkSync(file);
    assert.deepEqual(S.list("stages"), []);
  } finally {
    fs.readFileSync = read;
  }
});
test("来源适配按字段契约和实际语义判断，不按客户端版本号猜测", () => {
  const A = require("../integration/source-adapter.cjs");
  assert.equal(A.contract, "codex-paginated-history-v1");
  assert.throws(
    () => A.turn({ status: "unknown", started_at: Date.now() }),
    /RECORD_UNSUPPORTED/,
  );
  assert.throws(
    () =>
      A.validateSchema(
        { prepare: () => ({ all: () => [] }) },
        { prepare: () => ({ all: () => [] }) },
      ),
    /SCHEMA_UNSUPPORTED/,
  );
});
test("隔离验收也拒绝正式前台profile，尚未创建的子目录按真实祖先核查", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-profile-"));
  const normal = path.join(dir, "production"),
    profile = path.join(dir, "app-profile");
  fs.mkdirSync(normal);
  fs.mkdirSync(profile);
  assert.throws(
    () =>
      isolatedQa(
        { JINJINGTAI_HOME: path.join(dir, "qa"), JINJINGTAI_PROFILE: profile },
        normal,
        profile,
      ),
    /FORBIDDEN/,
  );
  const alias = path.join(dir, "alias");
  fs.symlinkSync(
    normal,
    alias,
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.throws(
    () =>
      isolatedQa(
        {
          JINJINGTAI_HOME: path.join(alias, "not-created"),
          JINJINGTAI_PROFILE: path.join(dir, "qa-profile"),
        },
        normal,
        profile,
      ),
    /FORBIDDEN/,
  );
});
