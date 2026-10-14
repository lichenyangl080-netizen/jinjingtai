// A capability for one frozen, authorized stage selection. No path arguments,
// personal-library access, network, shell or arbitrary source traversal.
const fs = require("node:fs");
const LIMITS = {
  calls: 1,
  perCallChars: 3000,
  totalChars: 3000,
  idsPerCall: 6,
};
function capsule(items, input, evidenceCatalog, expiresAt) {
  const originals = new Map(items.map((i) => [i.id, i]));
  return {
    expiresAt,
    materials: Object.fromEntries(
      Object.entries(input.sourceAliases).map(([alias, id]) => {
        const i = originals.get(id);
        // Explicit whitelist: no personal data, arbitrary files or transcript access.
        const evidence = {
          declared: i.evidence || [],
          snapshots: (
            i.snapshots ||
            i.evidenceRefs?.map((ref) => evidenceCatalog[ref]) ||
            []
          )
            .filter(Boolean)
            .map((s) =>
              s.type === "test"
                ? {
                    type: "test",
                    command: s.command,
                    exitCode: s.exitCode,
                    output: (s.output || "").slice(-400),
                  }
                : { type: s.type, path: s.path, hashMeaning: s.hashMeaning },
            ),
        };
        return [
          alias,
          {
            summary: i.coverage
              ? "仅恢复有限测试与产物依据，不能推断完整工作。"
              : i.summary,
            next: i.next || "",
            evidence,
          },
        ];
      }),
    ),
  };
}
function make(
  capsule,
  {
    save = () => {},
    state = { calls: 0, chars: 0, requests: [] },
    now = Date.now,
  } = {},
) {
  const ids = Object.keys(capsule.materials);
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      ids: {
        type: "array",
        minItems: 1,
        maxItems: LIMITS.idsPerCall,
        uniqueItems: true,
        items: { type: "string", enum: ids },
      },
      part: { type: "string", enum: ["summary", "next", "evidence"] },
    },
    required: ["ids", "part"],
  };
  function read(args) {
    // Invalid and failed attempts count too; budget persists across MCP restarts.
    if (state.calls >= LIMITS.calls) throw Error("READ_CALL_LIMIT");
    state.calls++;
    state.requests.push({
      ids: Array.isArray(args?.ids)
        ? args.ids
            .filter((x) => typeof x === "string" && ids.includes(x))
            .slice(0, LIMITS.idsPerCall)
        : [],
      part: ["summary", "next", "evidence"].includes(args?.part)
        ? args.part
        : "invalid",
    });
    save(state);
    if (now() > capsule.expiresAt) throw Error("READ_SCOPE_EXPIRED");
    if (
      !args ||
      Object.keys(args).some((k) => !["ids", "part"].includes(k)) ||
      !Array.isArray(args.ids) ||
      !args.ids.length ||
      args.ids.length > LIMITS.idsPerCall ||
      new Set(args.ids).size !== args.ids.length ||
      !["summary", "next", "evidence"].includes(args.part) ||
      args.ids.some((id) => !Object.hasOwn(capsule.materials, id))
    )
      throw Error("READ_OUTSIDE_SELECTION");
    const remaining = Math.min(
      LIMITS.perCallChars,
      LIMITS.totalChars - state.chars,
    );
    if (remaining < 250) throw Error("READ_TEXT_LIMIT");
    const results = args.ids.map((id) => {
      const item = capsule.materials[id];
      return {
        id,
        text:
          args.part === "summary"
            ? item.summary
            : args.part === "next"
              ? item.next
              : JSON.stringify(item.evidence),
        truncated: false,
      };
    });
    // Bound the entire serialized tool response, not just evidence strings.
    const budget = Math.max(0, Math.floor((remaining - 250) / results.length));
    for (const row of results)
      if (row.text.length > budget) {
        row.text = row.text.slice(0, budget);
        row.truncated = true;
      }
    let text = JSON.stringify({ part: args.part, results });
    while (text.length > remaining) {
      const longest = results.reduce((a, b) =>
        a.text.length >= b.text.length ? a : b,
      );
      if (!longest.text.length) throw Error("READ_TEXT_LIMIT");
      longest.text = longest.text.slice(
        0,
        Math.max(0, longest.text.length - (text.length - remaining)),
      );
      longest.truncated = true;
      text = JSON.stringify({ part: args.part, results });
    }
    state.chars += text.length;
    state.requests.at(-1).chars = text.length;
    state.requests.at(-1).response = text;
    save(state);
    return text;
  }
  return { schema, read, state };
}
function serve(file) {
  const path = require("node:path"),
    readline = require("node:readline"),
    stateFile = path.join(path.dirname(file), "lookup-state.json");
  const capsule = JSON.parse(fs.readFileSync(file, "utf8"));
  let state;
  try {
    state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const reader = make(capsule, {
    state,
    save: (s) => {
      const temp = stateFile + ".tmp";
      const fd = fs.openSync(temp, "w");
      try {
        fs.writeFileSync(fd, JSON.stringify(s));
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(temp, stateFile);
    },
  });
  const tool = {
    name: "read_material",
    description:
      "仅摘要不能解释矛盾或决定验证边界时，批量读取本次m编号的完整小结/下一步/必要依据。最多一次，最多6项/3000字符；truncated仍不完整。人工正文、回顾和附件不在接口内。",
    inputSchema: reader.schema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false,
    },
  };
  const lines = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });
  lines.on("line", (line) => {
    let req;
    try {
      req = JSON.parse(line);
      if (req.id === undefined) return;
      let result;
      if (req.method === "initialize")
        result = {
          protocolVersion: req.params?.protocolVersion || "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "jinjingtai-materials", version: "1.0.0" },
        };
      else if (req.method === "tools/list") result = { tools: [tool] };
      else if (req.method === "tools/call") {
        if (req.params?.name !== "read_material")
          throw Error("READ_TOOL_NOT_ALLOWED");
        result = {
          content: [{ type: "text", text: reader.read(req.params.arguments) }],
        };
      } else if (req.method === "ping") result = {};
      else {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: req.id,
            error: { code: -32601, message: "Method not found" },
          }) + "\n",
        );
        return;
      }
      process.stdout.write(
        JSON.stringify({ jsonrpc: "2.0", id: req.id, result }) + "\n",
      );
    } catch (e) {
      if (req?.id !== undefined)
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: req.id,
            result: {
              isError: true,
              content: [
                {
                  type: "text",
                  text: /^READ_[A-Z_]+$/.test(e.message)
                    ? e.message
                    : "READ_FAILED",
                },
              ],
            },
          }) + "\n",
        );
    }
  });
  lines.on("close", () => process.exit(0));
}
if (require.main === module) serve(process.argv[2]);
module.exports = { make, LIMITS, capsule };
