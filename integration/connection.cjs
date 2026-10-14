const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const S = require("./store.cjs");
const START = "# BEGIN JINJINGTAI MANAGED CONNECTION";
const END = "# END JINJINGTAI MANAGED CONNECTION";
function codexHome() {
  return (
    process.env.CODEX_HOME ||
    S.config().codexHome ||
    path.join(os.homedir(), ".codex")
  );
}
function resolveCodex(configured) {
  if (configured && fs.existsSync(configured)) return configured;
  const bin = path.join(
    process.env.LOCALAPPDATA || os.homedir(),
    "OpenAI",
    "Codex",
    "bin",
  );
  // Only recover the standard desktop installation path, never silently replace
  // an explicitly selected custom CLI (including isolated unavailable fixtures).
  if (
    configured &&
    configured !== "codex" &&
    !path
      .resolve(configured)
      .toLowerCase()
      .startsWith(path.resolve(bin).toLowerCase() + path.sep)
  )
    return configured;
  if (fs.existsSync(bin)) {
    const files = fs
      .readdirSync(bin, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(bin, d.name, "codex.exe"))
      .filter((f) => fs.existsSync(f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (files.length) return files[0];
  }
  return configured || "codex";
}
function managed(text) {
  const a = text.indexOf(START),
    b = text.indexOf(END);
  if (a >= 0 && b < a) throw Error("MALFORMED_MANAGED_BLOCK");
  if (a < 0) return text;
  // Codex may append hook trust sections within this block. They belong to the
  // client, not to our MCP configuration, and must survive an incremental edit.
  const retained = text
    .slice(a + START.length, b)
    .split(/(?=^\s*\[)/m)
    .filter(
      (section) =>
        /^\s*\[/.test(section) &&
        !/^\s*\[mcp_servers\.jinjingtai(?:\.env)?\]/.test(section),
    )
    .join("")
    .trim();
  return (
    text.slice(0, a) +
    (retained ? retained + "\n" : "") +
    text.slice(b + END.length).replace(/^\r?\n/, "")
  );
}
function stripInstructions(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8"),
    start = "<!-- JINJINGTAI RECORDING -->",
    end = "<!-- /JINJINGTAI RECORDING -->",
    a = text.indexOf(start),
    b = text.indexOf(end);
  if (a >= 0 && b >= a)
    fs.writeFileSync(file, text.slice(0, a) + text.slice(b + end.length));
}
function stripHooks(groups, runtime) {
  return groups
    .map((g) => ({
      ...g,
      hooks: (g.hooks || []).filter(
        (h) => !h.command?.includes(path.join(runtime, "hook.cjs")),
      ),
    }))
    .filter((g) => g.hooks.length);
}
function backup(file, batch) {
  if (fs.existsSync(file))
    fs.copyFileSync(file, path.join(batch, path.basename(file)));
}
const transactionFile = () =>
  path.join(S.HOME, "internal", "connection-transaction.json");
function recover() {
  require("./file-transaction.cjs").recover(transactionFile());
}
function install(options) {
  recover();
  const c = S.config(),
    home = codexHome(),
    runtime = path.join(S.HOME, "runtime");
  const files = [
    path.join(home, "config.toml"),
    path.join(home, "hooks.json"),
    path.join(S.HOME, "connection.json"),
    path.join(S.HOME, "library-location.json"),
    ...(c.legacyConfigFiles || []),
    ...(c.instructionFiles || []),
    ...(c.instructionRoots || c.roots || []).map((r) =>
      path.join(r, "AGENTS.md"),
    ),
    ...(options.roots || []).map((r) => path.join(r, "AGENTS.md")),
    path.join(home, "AGENTS.md"),
    path.join(home, "AGENTS.override.md"),
    ...fs
      .readdirSync(__dirname)
      .filter((n) => n.endsWith(".cjs"))
      .map((n) => path.join(runtime, n)),
    path.join(runtime, "node.exe"),
  ];
  return S.connectionTransaction(files, () => installPrepared(options));
}
function installPrepared({
  library,
  roots = [],
  node,
  codex,
  scopeMode = "selected",
  paused = false,
}) {
  if (typeof paused !== "boolean") throw Error("INVALID_PAUSE");
  if (!["selected", "all-workspaces"].includes(scopeMode))
    throw Error("INVALID_SCOPE");
  if (!Array.isArray(roots) || (scopeMode === "selected" && !roots.length))
    throw Error("SELECT_WORK_DIRECTORIES");
  fs.mkdirSync(library, { recursive: true });
  fs.mkdirSync(path.join(S.HOME, "internal"), { recursive: true });
  const realRoots = roots.map(S.canonical),
    realLibrary = S.canonical(library);
  if (realRoots.some((r) => r === realLibrary))
    throw Error("LIBRARY_IS_WORK_ROOT");
  const runtime = path.join(S.HOME, "runtime");
  fs.mkdirSync(runtime, { recursive: true });
  for (const name of fs
    .readdirSync(__dirname)
    .filter((name) => name.endsWith(".cjs")))
    fs.copyFileSync(path.join(__dirname, name), path.join(runtime, name));
  const runtimeNode = path.join(runtime, "node.exe");
  require("./node-runtime.cjs").materialize(node, runtimeNode);
  const configFile = path.join(codexHome(), "config.toml"),
    hooksFile = path.join(codexHome(), "hooks.json");
  fs.mkdirSync(codexHome(), { recursive: true });
  const old = fs.existsSync(configFile)
    ? fs.readFileSync(configFile, "utf8")
    : "";
  if (/\[mcp_servers\.jinjingtai\]/.test(managed(old)))
    throw Error("EXISTING_SERVER_NAME_CONFLICT");
  const hooks = S.read(hooksFile, { hooks: {} });
  const originalHooks = S.hash(hooks);
  const batch = path.join(
    S.HOME,
    "backups",
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  fs.mkdirSync(batch, { recursive: true });
  backup(configFile, batch);
  backup(hooksFile, batch);
  backup(path.join(S.HOME, "connection.json"), batch);
  const psQuote = (s) => "'" + s.replaceAll("'", "''") + "'";
  const command =
    'powershell.exe -NoProfile -NonInteractive -Command "& ' +
    psQuote(runtimeNode) +
    " " +
    psQuote(path.join(runtime, "hook.cjs")) +
    '"';
  for (const name of [
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "Stop",
    "Interrupt",
  ]) {
    hooks.hooks[name] = stripHooks(hooks.hooks[name] || [], runtime);
    for (const prior of S.config().legacyRuntimes || [])
      hooks.hooks[name] = stripHooks(hooks.hooks[name], prior);
    hooks.hooks[name].push({
      ...(name.includes("ToolUse")
        ? { matcher: "mcp__jinjingtai__record_stage$" }
        : {}),
      hooks: [
        {
          type: "command",
          command,
          timeout: name === "Interrupt" ? 3 : 10,
          ...(name === "UserPromptSubmit"
            ? { additionalContextLimit: 650 }
            : {}),
          statusMessage: "进境台接入检查",
        },
      ],
    });
  }
  const block = `${START}\n[mcp_servers.jinjingtai]\ncommand = ${JSON.stringify(runtimeNode)}\nargs = [${JSON.stringify(path.join(runtime, "mcp.cjs"))}, "--runtime-v2"]\nstartup_timeout_sec = 20\n[mcp_servers.jinjingtai.env]\nJINJINGTAI_HOME = ${JSON.stringify(S.HOME)}\n${END}\n`;
  fs.writeFileSync(configFile, managed(old).trimEnd() + "\n\n" + block);
  S.atomic(hooksFile, hooks);
  const previousRoots = S.config().instructionRoots || S.config().roots || [];
  for (const root of previousRoots)
    if (
      !realRoots.includes(
        fs.existsSync(root)
          ? S.canonical(root)
          : path.resolve(root).toLowerCase(),
      )
    ) {
      const file = path.join(root, "AGENTS.md");
      if (fs.existsSync(file))
        fs.copyFileSync(
          file,
          path.join(batch, "AGENTS-" + S.hash(root).slice(0, 12) + ".md"),
        );
      stripInstructions(file);
    }
  const globalFile = path.join(
    codexHome(),
    fs.existsSync(path.join(codexHome(), "AGENTS.override.md")) &&
      fs
        .readFileSync(path.join(codexHome(), "AGENTS.override.md"), "utf8")
        .trim()
      ? "AGENTS.override.md"
      : "AGENTS.md",
  );
  const instructionFiles = [
    ...roots.map((root) => path.join(root, "AGENTS.md")),
    ...(scopeMode === "all-workspaces" ? [globalFile] : []),
  ];
  for (const prior of S.config().instructionFiles || [])
    if (!instructionFiles.includes(prior)) {
      backup(prior, batch);
      stripInstructions(prior);
    }
  for (const file of instructionFiles) {
    const root = path.dirname(file);
    let text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    const marker = "<!-- JINJINGTAI RECORDING -->",
      end = "<!-- /JINJINGTAI RECORDING -->";
    const a = text.indexOf(marker),
      b = text.indexOf(end);
    if (a >= 0 && b >= a) text = text.slice(0, a) + text.slice(b + end.length);
    const backupName = "AGENTS-" + S.hash(root).slice(0, 12) + ".md";
    if (fs.existsSync(file))
      fs.copyFileSync(file, path.join(batch, backupName));
    const instructions = `\n${marker}\n## 进境台阶段记录\n正常工作收尾前调用 jinjingtai.record_stage 一次，利用当前上下文记录本轮真正新增的变化；不要另外开记录聊天、不要每轮在最终回复通知保存。小结按信息需要决定长度，一句话足够就一句话。纯查询无新增时 outcome=no_change,items=[]。有变化 outcome=change。每项包含 kind,title,summary，可选 next,evidence,acceptance,relations。kind：verified（实际已验证且有具体文件/测试依据）、implementation（实现未验证）、attempt（含失败及实际验证/排除的内容）、finding、decision（用户明确采纳user_explicit或已实施implemented）、blocker、proposal（未采纳建议）。不把建议写成决定，不将自称完成当验证，不编造会话或工具编号，省略_gate。需要补充或推翻旧结论而上下文没有阶段ID时，先用 record_stage(outcome=inspect,items=[]) 只读当前实际目录最近8条阶段短材料；inspect不算收尾，不读取人工内容。工具返回真实阶段ID；补充/推翻旧结论使用relations的supplements/negates/supersedes，target为真实阶段ID:item序号。记录失败最多重试一次，不影响主要工作；失败会在工作台显示漏记。内部整理任务、资料库和运行产物不记录，正常开发进境台项目仍记录。\n${end}\n`;
    fs.writeFileSync(
      file,
      text.trimEnd() +
        instructions.replace(
          "可选 next,evidence,acceptance,relations。",
          "可选 next,evidence,acceptance,relations,relevance。relevance=progress 表示真正推动实际工作（功能、有效发现、采纳决定或排除重要路线）；routine 表示简单练习、接入验收、零碎操作，仅在采集明细保留，不进入每日进展。不要仅因文件名含 test 就判 routine，真实功能验证仍是 progress。纯查询仍 no_change；不要为练习凑进展。若旧聊天工具未提供 relevance 字段，routine 的 title 以「[日常操作]」开头，仍按真实 change 提交。",
        ),
    );
  }
  S.atomic(path.join(S.HOME, "connection.json"), {
    version: 1,
    enabled: !paused,
    ...(S.config().legacyConfigFiles
      ? {
          legacyConfigFiles: S.config().legacyConfigFiles,
          legacyRuntimes: S.config().legacyRuntimes,
          legacyDataRoots: S.config().legacyDataRoots,
          stateHome: S.config().stateHome,
        }
      : {}),
    ...(paused ? { paused: true } : {}),
    scopeMode,
    ...(scopeMode === "all-workspaces"
      ? {
          globalEnabledAt:
            S.config().globalEnabledAt || new Date().toISOString(),
        }
      : {}),
    library: path.resolve(library),
    roots: roots.map((r) => fs.realpathSync.native(r)),
    instructionRoots: roots.map((r) => fs.realpathSync.native(r)),
    instructionFiles,
    codex,
    codexHome: codexHome(),
    runtimeNode,
    backup: batch,
    installedAt: S.config().installedAt || new Date().toISOString(),
  });
  S.atomic(path.join(S.HOME, "library-location.json"), {
    library: path.resolve(library),
  });
  return {
    installed: true,
    backup: batch,
    needsTrust: originalHooks !== S.hash(hooks),
    configFile,
    hooksFile,
  };
}
function disconnect() {
  recover();
  const c = S.config();
  const files = [
    ...S.connectionFiles(c),
    path.join(codexHome(), "config.toml"),
    path.join(codexHome(), "hooks.json"),
    ...(c.instructionRoots || c.roots || []).map((root) =>
      path.join(root, "AGENTS.md"),
    ),
    ...(c.instructionFiles || []),
  ];
  const batch = path.join(
    S.HOME,
    "backups",
    "disconnect-" +
      new Date().toISOString().replace(/[:.]/g, "-") +
      "-" +
      require("node:crypto").randomUUID(),
  );
  fs.mkdirSync(batch, { recursive: true });
  const manifest = [...new Set(files)]
    .filter((file) => fs.existsSync(file))
    .map((file, i) => {
      const copy = i + "-" + path.basename(file);
      fs.copyFileSync(file, path.join(batch, copy));
      return { file, copy };
    });
  S.atomic(path.join(batch, "manifest.json"), manifest);
  return S.connectionTransaction(files, () => disconnectPrepared(batch));
}
function disconnectPrepared(backup) {
  const c = S.config();
  S.atomic(path.join(S.HOME, "connection.json"), {
    ...c,
    enabled: false,
    paused: false,
    disconnected: true,
  });
  const f = path.join(codexHome(), "config.toml");
  if (fs.existsSync(f))
    fs.writeFileSync(f, managed(fs.readFileSync(f, "utf8")));
  const hfile = path.join(codexHome(), "hooks.json");
  const h = S.read(hfile, null);
  if (h) {
    for (const key of Object.keys(h.hooks || {})) {
      h.hooks[key] = stripHooks(h.hooks[key], path.join(S.HOME, "runtime"));
      for (const prior of c.legacyRuntimes || [])
        h.hooks[key] = stripHooks(h.hooks[key], prior);
    }
    S.atomic(hfile, h);
  }
  for (const root of c.instructionRoots || c.roots || [])
    stripInstructions(path.join(root, "AGENTS.md"));
  for (const file of c.instructionFiles || []) stripInstructions(file);
  return { disconnected: true, library: c.library, backup };
}
module.exports = { install, disconnect, codexHome, resolveCodex, recover };
if (require.main === module) {
  try {
    const input = JSON.parse(process.argv[2]);
    console.log(
      JSON.stringify(
        input.action === "disconnect" ? disconnect() : install(input),
      ),
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
