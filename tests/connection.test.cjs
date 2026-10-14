const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-config-"));
process.env.JINJINGTAI_HOME = root + "/home";
process.env.CODEX_HOME = root + "/codex";
const S = require("../integration/store.cjs"),
  C = require("../integration/connection.cjs");
test("撤销连接中途失败回滚配置、Hook和指令，保留可检查备份", () => {
  const work = path.join(root, "disconnect-work");
  fs.mkdirSync(work);
  C.install({
    library: path.join(root, "disconnect-library"),
    roots: [work],
    node: process.execPath,
    codex: "fixture-codex",
    paused: true,
  });
  const files = [
    path.join(S.HOME, "connection.json"),
    path.join(process.env.CODEX_HOME, "config.toml"),
    path.join(process.env.CODEX_HOME, "hooks.json"),
    path.join(work, "AGENTS.md"),
    ...S.config().instructionFiles,
  ];
  const bytes = files.map((file) => fs.readFileSync(file));
  const atomic = S.atomic;
  S.atomic = (file, ...args) => {
    if (file.endsWith("hooks.json")) throw Error("INJECTED_DISCONNECT_FAILURE");
    return atomic(file, ...args);
  };
  try {
    assert.throws(() => C.disconnect(), /INJECTED_DISCONNECT_FAILURE/);
  } finally {
    S.atomic = atomic;
  }
  files.forEach((file, i) =>
    assert(fs.readFileSync(file).equals(bytes[i]), file),
  );
  assert.equal(S.config().paused, true);
  assert(
    !fs.existsSync(
      path.join(S.HOME, "internal", "connection-transaction.json"),
    ),
  );
  const backup = fs
    .readdirSync(path.join(S.HOME, "backups"))
    .find((name) => name.startsWith("disconnect-"));
  const folder = path.join(S.HOME, "backups", backup);
  const manifest = S.read(path.join(folder, "manifest.json"));
  manifest.forEach((entry) =>
    assert(fs.existsSync(path.join(folder, entry.copy))),
  );
});
test("撤销连接进程异常退出后恢复原配置，不留下半撤销状态", () => {
  const files = [
    path.join(S.HOME, "connection.json"),
    path.join(process.env.CODEX_HOME, "config.toml"),
    path.join(process.env.CODEX_HOME, "hooks.json"),
    ...S.config().instructionFiles,
  ];
  const before = files.map((file) => fs.readFileSync(file));
  const code = `const S=require(${JSON.stringify(require.resolve("../integration/store.cjs"))});
    const C=require(${JSON.stringify(require.resolve("../integration/connection.cjs"))});
    const atomic=S.atomic;S.atomic=(file,...args)=>{if(file.endsWith('hooks.json'))process.exit(23);return atomic(file,...args);};C.disconnect();`;
  const child = require("node:child_process").spawnSync(
    process.execPath,
    ["-e", code],
    { env: process.env },
  );
  assert.equal(child.status, 23);
  assert(
    fs.existsSync(path.join(S.HOME, "internal", "connection-transaction.json")),
  );
  C.recover();
  files.forEach((file, i) =>
    assert(fs.readFileSync(file).equals(before[i]), file),
  );
  assert.equal(!!S.config().disconnected, false);
});
test("隔离配置：先备份、增量合并及撤销，保留其他MCP、Hook和用户指令", () => {
  const work = root + "/work",
    library = root + "/library";
  fs.mkdirSync(work);
  fs.mkdirSync(process.env.CODEX_HOME, { recursive: true });
  const config =
    'model = "original"\n[mcp_servers.other]\ncommand = "other-tool"\n';
  fs.writeFileSync(process.env.CODEX_HOME + "/config.toml", config);
  fs.writeFileSync(work + "/AGENTS.md", "用户原有规则\n");
  const other = { type: "command", command: "echo other" };
  S.atomic(process.env.CODEX_HOME + "/hooks.json", {
    hooks: { Stop: [{ hooks: [other] }] },
  });
  const result = C.install({
    library,
    roots: [work],
    node: process.execPath,
    codex: "fixture-codex",
  });
  assert.equal(fs.readFileSync(result.backup + "/config.toml", "utf8"), config);
  assert(
    fs.readFileSync(result.configFile, "utf8").includes("[mcp_servers.other]"),
  );
  const hooks = S.read(result.hooksFile);
  assert(
    hooks.hooks.Stop.some((g) =>
      g.hooks.some((h) => h.command === other.command),
    ),
  );
  assert(
    fs.readFileSync(work + "/AGENTS.md", "utf8").startsWith("用户原有规则"),
  );
  C.disconnect();
  assert.equal(S.config().enabled, false);
  assert(
    fs.readFileSync(result.configFile, "utf8").includes("[mcp_servers.other]"),
  );
  assert(
    !fs
      .readFileSync(result.configFile, "utf8")
      .includes("[mcp_servers.jinjingtai]"),
  );
  assert.deepEqual(S.read(result.hooksFile).hooks.Stop, [{ hooks: [other] }]);
  assert(fs.readFileSync(work + "/AGENTS.md", "utf8").includes("用户原有规则"));
  assert(
    !fs
      .readFileSync(work + "/AGENTS.md", "utf8")
      .includes("JINJINGTAI RECORDING"),
  );
  assert(fs.existsSync(library));
});
test("更新及撤销MCP托管块保留客户端写入其中的真实Hook信任节", () => {
  const work = root + "/work",
    library = root + "/library";
  C.install({
    library,
    roots: [work],
    node: process.execPath,
    codex: "fixture-codex",
  });
  const file = process.env.CODEX_HOME + "/config.toml",
    trust =
      '[hooks.state."existing-user-trust"]\ntrusted_hash = "sha256:fixture"\n';
  fs.writeFileSync(
    file,
    fs
      .readFileSync(file, "utf8")
      .replace(
        "# END JINJINGTAI MANAGED CONNECTION",
        trust + "# END JINJINGTAI MANAGED CONNECTION",
      ),
  );
  C.install({
    library,
    roots: [work],
    node: process.execPath,
    codex: "fixture-codex",
  });
  assert(fs.readFileSync(file, "utf8").includes(trust));
  C.disconnect();
  assert(fs.readFileSync(file, "utf8").includes(trust));
});
test("旧工作目录已删除仍可重新设置；写Hook时失败回滚配置、指令及运行模块", () => {
  const work = root + "/replacement",
    gone = root + "/deleted";
  fs.mkdirSync(work);
  const previous = S.config();
  S.atomic(path.join(S.HOME, "connection.json"), {
    ...previous,
    roots: [gone],
    instructionRoots: [gone],
  });
  const options = {
    library: root + "/library",
    roots: [work],
    node: process.execPath,
    codex: "fixture-codex",
  };
  C.install(options);
  assert.equal(S.config().roots[0], fs.realpathSync.native(work));
  const files = [
    process.env.CODEX_HOME + "/config.toml",
    process.env.CODEX_HOME + "/hooks.json",
    S.HOME + "/connection.json",
    work + "/AGENTS.md",
    S.HOME + "/runtime/store.cjs",
  ];
  const before = files.map((f) => fs.readFileSync(f));
  const atomic = S.atomic;
  let injected = false;
  S.atomic = (f, ...args) => {
    if (!injected && f.endsWith("hooks.json")) {
      injected = true;
      throw Error("INJECTED_HOOK_WRITE_FAILURE");
    }
    return atomic(f, ...args);
  };
  try {
    assert.throws(() => C.install(options), /INJECTED_HOOK/);
  } finally {
    S.atomic = atomic;
  }
  assert(injected);
  files.forEach((f, n) => assert(fs.readFileSync(f).equals(before[n]), f));
  assert(!fs.existsSync(S.HOME + "/internal/connection-transaction.json"));
});
