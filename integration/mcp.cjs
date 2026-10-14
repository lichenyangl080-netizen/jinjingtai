const readline = require("node:readline");
let S = require("./store.cjs");
S.diagnostic("mcp-start-" + process.pid + ".json", {
  pid: process.pid,
  parent: process.ppid,
  cwd: process.cwd(),
  sourceEnvironment: Object.fromEntries(
    Object.entries(process.env).filter(([k]) =>
      /^(CODEX_THREAD_ID|CODEX_SESSION_ID|CODEX_TURN_ID)$/.test(k),
    ),
  ),
  at: new Date().toISOString(),
});
const schema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      maxLength: 120,
      description:
        "仅inspect可用，检索授权阶段材料的标题或小结；留空读取最近8条。",
    },
    outcome: { type: "string", enum: ["change", "no_change", "inspect"] },
    items: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        properties: {
          relevance: {
            type: "string",
            enum: ["progress", "routine"],
            description:
              "progress为实际工作推进；routine为简单练习、接入验收、零碎操作，不进入进展。功能测试和有效排除路线仍可为progress。",
          },
          kind: { type: "string", enum: S.kinds },
          title: { type: "string" },
          summary: { type: "string" },
          next: { type: "string" },
          acceptance: {
            type: "string",
            enum: ["user_explicit", "implemented", "unaccepted"],
          },
          evidence: { type: "array", items: { type: "string" } },
          relations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["supplements", "negates", "supersedes"],
                },
                target: { type: "string" },
              },
              required: ["type", "target"],
            },
          },
        },
        required: ["kind", "title", "summary"],
      },
    },
    _gate: {
      type: "string",
      description: "由已信任的PreToolUse接入程序注入；模型省略此字段。",
    },
  },
  required: ["outcome", "items"],
  additionalProperties: false,
};
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  let req;
  try {
    req = JSON.parse(line);
    if (req.id === undefined) return;
    let result;
    if (req.method === "initialize")
      result = {
        protocolVersion: req.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "jinjingtai", version: "1.0.0" },
      };
    else if (req.method === "ping") result = {};
    else if (req.method === "tools/list")
      result = {
        tools: [
          {
            name: "record_stage",
            description:
              "收尾保存 change/no_change。仅需查旧结论ID时用 outcome=inspect,items=[]，只返回当前实际目录最近8条阶段短材料；inspect不算收尾，不读人工正文。模型省略_gate。",
            inputSchema: schema,
          },
        ],
      };
    else if (
      req.method === "tools/call" &&
      req.params.name === "record_stage"
    ) {
      // A desktop chat can retain its MCP process across runtime updates.
      // Refresh program modules at the request boundary, never mid-transaction.
      for (const name of ["./source.cjs", "./store.cjs"])
        delete require.cache[require.resolve(name)];
      S = require("./store.cjs");
      S.atomic(
        require("node:path").join(
          S.HOME,
          "diagnostics",
          "last-mcp-envelope.json",
        ),
        {
          paramsKeys: Object.keys(req.params),
          metaKeys: Object.keys(req.params._meta || {}),
          at: new Date().toISOString(),
        },
      );
      try {
        const body = S.bodyOf(req.params.arguments);
        let receipt;
        if (body.outcome === "inspect") {
          if (
            Object.keys(body).some(
              (k) => !["outcome", "items", "query"].includes(k),
            ) ||
            !Array.isArray(body.items) ||
            body.items.length ||
            (body.query !== undefined &&
              (typeof body.query !== "string" || body.query.length > 120))
          )
            throw Error("INVALID_INSPECTION");
          const grant = req.params.arguments._gate
            ? S.verify(req.params.arguments)
            : null;
          const proof = grant
            ? {
                cwd: grant.cwd,
                session_id: grant.session,
                turn_id: grant.turn,
                tool_use_id: grant.call,
              }
            : require("./source.cjs").authorizeCall(body);
          const reads = S.list("events").filter(
            (e) =>
              e.type === "inspected" &&
              e.session === proof.session_id &&
              e.turn === proof.turn_id,
          );
          if (
            new Set(reads.map((r) => r.call)).size >= 2 &&
            !reads.some((r) => r.call === proof.tool_use_id)
          )
            throw Error("INSPECTION_LIMIT");
          S.event("inspected", {
            session: proof.session_id,
            turn: proof.turn_id,
            call: proof.tool_use_id,
          });
          const roots = S.config()
            .roots.map(S.canonical)
            .filter((root) => S.within(proof.cwd, root))
            .sort((a, b) => b.length - a.length);
          const root =
            S.config().scopeMode === "all-workspaces"
              ? S.workspace(proof.cwd)
              : roots[0];
          const query = (body.query || "").trim().toLowerCase();
          const removed = new Set(
            S.personal()
              .store.records.filter((r) => r.removed)
              .flatMap((r) => r.sourceIds || []),
          );
          const excluded = new Set(S.list("excluded").map((s) => s.id));
          receipt = {
            stages: S.list("stages")
              .filter(
                (s) =>
                  S.bound(s) &&
                  s.outcome === "change" &&
                  root &&
                  S.within(s.source.cwd, root) &&
                  !excluded.has(s.id) &&
                  (!query ||
                    s.items.some((i) =>
                      (i.title + " " + i.summary).toLowerCase().includes(query),
                    )),
              )
              .sort((a, b) => b.at.localeCompare(a.at))
              .slice(0, 8)
              .map((s) => ({
                id: s.id,
                date: s.date,
                items: s.items
                  .map((i, n) => ({
                    id: s.id + ":" + n,
                    kind: i.kind,
                    title: i.title,
                    summary: i.summary.slice(0, 400),
                    relations: i.relations || [],
                  }))
                  .filter((i) => !removed.has(i.id)),
              })),
          };
        } else {
          let proof, grant;
          if (req.params.arguments._gate) {
            grant = S.verify(req.params.arguments);
            try {
              proof = require("./source.cjs").authorizeCall(body);
              if (
                proof.session_id !== grant.session ||
                proof.turn_id !== grant.turn ||
                proof.tool_use_id !== grant.call
              )
                throw Error("BINDING_MISMATCH");
            } catch (e) {
              if (e.message === "BINDING_MISMATCH") throw e;
            }
          } else proof = require("./source.cjs").authorizeCall(body);
          const session = proof?.session_id || grant.session,
            turn = proof?.turn_id || grant.turn;
          let assessment = { verified: false, snapshots: [] };
          if (body.outcome === "change") {
            try {
              const evidence = require("./source.cjs").recoverTurn(
                session,
                turn,
                false,
              );
              const passed = evidence.snapshots.filter(
                (e) => e.type === "test" && e.exitCode === 0,
              );
              const supportedItems = body.items.map((i, n) => ({
                n,
                verified: require("./verification.cjs").supports(i, passed),
              }));
              assessment = {
                verified: evidence.kind === "verified",
                supportedItems,
                snapshots: evidence.snapshots,
              };
            } catch {}
          }
          receipt = S.submit(
            req.params.arguments._gate
              ? req.params.arguments
              : { ...body, _gate: S.issue({ ...proof, tool_input: body }) },
            proof,
            assessment,
          );
        }
        result = { content: [{ type: "text", text: JSON.stringify(receipt) }] };
      } catch (e) {
        const code = /^[A-Z_]+$/.test(e.message) ? e.message : "SAVE_FAILED";
        S.event("error", { code });
        result = { isError: true, content: [{ type: "text", text: code }] };
      }
    } else {
      console.log(
        JSON.stringify({
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32601, message: "Method not found" },
        }),
      );
      return;
    }
    console.log(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }));
  } catch {
    if (req?.id !== undefined)
      console.log(
        JSON.stringify({
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32603, message: "Invalid request" },
        }),
      );
  }
});
