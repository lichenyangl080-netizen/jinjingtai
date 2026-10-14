const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { spawn } = require("node:child_process"),
  readline = require("node:readline");
const home = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-inspect-"));
process.env.JINJINGTAI_HOME = path.join(home, "runtime-home");
const S = require("../integration/store.cjs"),
  work = path.join(home, "work"),
  library = path.join(home, "library");
fs.mkdirSync(work);
fs.mkdirSync(library);
fs.mkdirSync(path.join(S.HOME, "internal"), { recursive: true });
S.atomic(path.join(S.HOME, "connection.json"), {
  enabled: true,
  library,
  roots: [work],
});
test("模拟签名来源 + 真实MCP stdio：跨聊天只读阶段检索，移除保护与次数边界", async () => {
  const h = {
    cwd: work,
    session_id: "previous-chat",
    turn_id: "old",
    tool_use_id: "old-call",
    tool_input: {
      outcome: "change",
      items: [
        {
          kind: "decision",
          acceptance: "user_explicit",
          title: "迁移验收文件",
          summary: "仅用于验收",
        },
      ],
    },
  };
  h.tool_input._gate = S.issue(h);
  const stage = S.submit(h.tool_input);
  S.bind(h);
  const child = spawn(
    process.execPath,
    [path.resolve(__dirname, "../integration/mcp.cjs")],
    { env: process.env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );
  const waits = new Map();
  let seq = 0;
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    const r = JSON.parse(line);
    waits.get(r.id)?.(r.result);
    waits.delete(r.id);
  });
  const call = async (query) => {
    const body = { outcome: "inspect", items: [], query },
      id = ++seq;
    const input = {
      ...body,
      _gate: S.issue({
        cwd: work,
        session_id: "new-chat",
        turn_id: "new",
        tool_use_id: "inspect-" + id,
        tool_input: body,
      }),
    };
    return new Promise((resolve) => {
      waits.set(id, resolve);
      child.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: { name: "record_stage", arguments: input },
        }) + "\n",
      );
    });
  };
  try {
    const first = await call("迁移");
    assert.equal(
      JSON.parse(first.content[0].text).stages[0].items[0].id,
      stage.id + ":0",
    );
    const p = S.personal();
    p.store.records.push({
      id: "removed",
      date: S.day(),
      project: "unassigned",
      title: "已移除",
      change: "",
      next: "",
      kind: "发现",
      sourceIds: [stage.id + ":0"],
      removed: true,
    });
    S.savePersonal(p.store, p.revision, p.libraryId);
    const second = await call("验收");
    assert(!JSON.stringify(second).includes("仅用于验收"));
    const third = await call("文件");
    assert.equal(third.isError, true);
    assert.equal(third.content[0].text, "INSPECTION_LIMIT");
    assert.equal(S.list("stages").length, 1);
  } finally {
    child.stdin.end();
    child.kill();
  }
});
