const path = require("node:path");
if (path.basename(__dirname) === "runtime")
  process.env.JINJINGTAI_HOME = path.dirname(__dirname);
const S = require("./store.cjs");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (s) => (input += s));
process.stdin.on("end", () => {
  let h;
  try {
    h = JSON.parse(input);
    S.diagnostic("last-hook.json", {
      event: h.hook_event_name,
      session: h.session_id,
      turn: h.turn_id,
      cwdHash: S.hash(h.cwd || ""),
      at: new Date().toISOString(),
    });
    S.authorize(h.cwd);
    const meta = { session: h.session_id, turn: h.turn_id };
    const recording = /mcp__jinjingtai__record_stage$/.test(h.tool_name || "");
    if (h.hook_event_name === "PreToolUse" && recording) {
      const token = S.issue(h);
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "allow",
            updatedInput: { ...S.bodyOf(h.tool_input), _gate: token },
          },
        }),
      );
    } else if (h.hook_event_name === "PostToolUse" && recording) {
      if (S.bodyOf(h.tool_input).outcome !== "inspect") S.bind(h);
      console.log("{}");
    } else if (h.hook_event_name === "UserPromptSubmit") {
      S.event("started", meta);
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext:
              "进境台已对本工作目录授权。正常收尾前调用 jinjingtai.record_stage 一次，用当前上下文记录本轮真正新增变化；纯查询无新增用 outcome=no_change, items=[]。类型区分 verified(需具体证据)、implementation、attempt、finding、decision(用户明确采纳或已实施)、blocker、proposal(未采纳)。短句即可；失败写实际排除/验证的内容。relevance=progress表示实际工作推进，routine表示简单练习、接入验收、零碎操作，仅保留采集明细；真实功能测试仍可为progress，不能按test文件名过滤。旧工具没有relevance字段时，routine的title用[日常操作]前缀，仍如实change。不编造来源编号，不填写_gate，由接入程序注入。需要旧阶段ID时先用outcome=inspect,items=[]只读最近阶段材料，inspect不算收尾；先前结论被推翻时填写relations，target是已保存阶段ID:item序号。记录不替代工作，失败最多重试一次，最终回复维持正常表达，不重复通知保存。",
          },
        }),
      );
    } else if (h.hook_event_name === "Stop") {
      S.event("stopped", meta);
      console.log("{}");
    } else if (h.hook_event_name === "Interrupt") {
      S.event("interrupted", meta);
      console.log("{}");
    } else console.log("{}");
  } catch (e) {
    const code = /^[A-Z_]+$/.test(e.message) ? e.message : "HOOK_FAILED";
    if (
      h &&
      !["OUTSIDE_SCOPE", "INTERNAL_TASK", "NOT_AUTHORIZED"].includes(code)
    )
      S.event("error", { code, session: h.session_id, turn: h.turn_id });
    if (
      h?.hook_event_name === "PreToolUse" &&
      /mcp__jinjingtai__record_stage$/.test(h.tool_name || "")
    )
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: "进境台目录或来源核准失败：" + code,
          },
        }),
      );
    else console.log("{}");
  }
});
