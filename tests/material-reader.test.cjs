const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process");
const R = require("../integration/material-reader.cjs"),
  I = require("../integration/organizer-input.cjs");
const items = [
  {
    id: "real:0",
    workspace: "authorized",
    kind: "attempt",
    title: "排除路线",
    summary: "前面的实验仍未验证。" + "细节".repeat(100) + "尾部失败原因",
    next: "重新核对",
    evidence: ["test"],
    relations: [{ type: "negates", target: "prior:0" }],
    personalText: "PRIVATE_HUMAN",
    attachments: ["PRIVATE_IMAGE"],
  },
];
test("初始只发摘录，完整原文留在只读能力；更正、未验证状态仍在", () => {
  const input = I.project(items, {
      aliases: true,
      compact: true,
      onDemand: true,
    }),
    row = input.payload.projects[0].items[0],
    c = R.capsule(items, input, {}, Date.now() + 10000);
  assert(row.more && row.hasNext);
  assert(row.summary.length <= 90);
  assert(!input.serialized.includes("尾部失败原因"));
  assert(!JSON.stringify(c).includes("PRIVATE_"));
  assert(!JSON.stringify(c).includes("authorized"));
  assert.equal(row.kind, "attempt");
  assert(row.relations.negates);
  assert.equal(
    JSON.parse(R.make(c).read({ ids: ["m1"], part: "summary" })).results[0]
      .text,
    items[0].summary,
  );
});
test("未知来源、路径注入和到期不能读取，错误审计不回显越界内容", () => {
  const c = {
      expiresAt: 100,
      materials: { m1: { summary: "safe", next: "", evidence: [] } },
    },
    r = R.make(c, { now: () => 50 });
  assert.throws(
    () => r.read({ ids: ["PRIVATE_OTHER"], part: "summary" }),
    /OUTSIDE/,
  );
  assert.throws(
    () =>
      R.make(c, { now: () => 50 }).read({
        ids: ["m1"],
        part: "summary",
        path: "PRIVATE_PATH",
      }),
    /OUTSIDE/,
  );
  assert(!JSON.stringify(r.state).includes("PRIVATE_"));
  assert.throws(
    () => R.make(c, { now: () => 101 }).read({ ids: ["m1"], part: "summary" }),
    /EXPIRED/,
  );
});
test("整个响应有字数硬上限，重启预算不重置，失败尝试也计数", () => {
  const c = {
    expiresAt: Date.now() + 10000,
    materials: { m1: { summary: '\\"'.repeat(20000), next: "", evidence: [] } },
  };
  let saved;
  const r = R.make(c, { save: (s) => (saved = structuredClone(s)) });
  const a = r.read({ ids: ["m1"], part: "summary" });
  assert(a.length <= 3000);
  assert(JSON.parse(a).results[0].truncated);
  const restarted = R.make(c, { state: saved });
  assert.equal(restarted.state.calls, 1);
  assert(restarted.state.chars <= 3000);
  assert.throws(
    () => restarted.read({ ids: ["m1"], part: "summary" }),
    /CALL_LIMIT/,
  );
});
test("真实STDIO协议可读指定项，持久化审计，重启继续计数", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-reader-test-")),
    file = path.join(dir, "capsule.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      expiresAt: Date.now() + 10000,
      materials: { m1: { summary: "stage only", next: "", evidence: [] } },
    }),
  );
  const input =
    [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05" },
      },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "read_material",
          arguments: { ids: ["m1"], part: "summary" },
        },
      },
    ]
      .map(JSON.stringify)
      .join("\n") + "\n";
  for (let n = 1; n <= 2; n++) {
    const p = spawnSync(
      process.execPath,
      [path.resolve(__dirname, "../integration/material-reader.cjs"), file],
      { input, encoding: "utf8" },
    );
    assert.equal(p.status, 0);
    const out = p.stdout.trim().split("\n").map(JSON.parse);
    assert.equal(out[1].result.tools.length, 1);
    assert(
      out[2].result.content[0].text.includes(
        n === 1 ? "stage only" : "READ_CALL_LIMIT",
      ),
    );
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(dir, "lookup-state.json"))).calls,
      1,
    );
  }
});
test("完成接收只允许本次指定读取工具，其他MCP和执行工具均拒收", () => {
  const C = require("../integration/consolidate.cjs");
  assert(
    C.allowedActivity({
      type: "mcp_tool_call",
      server: "jinjingtai_materials",
      tool: "read_material",
    }),
  );
  for (const item of [
    { type: "mcp_tool_call", server: "other", tool: "read_material" },
    { type: "mcp_tool_call", server: "jinjingtai_materials", tool: "write" },
    { type: "command_execution" },
    { type: "web_search" },
  ])
    assert(!C.allowedActivity(item));
});
