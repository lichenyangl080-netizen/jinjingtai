// Read-only adapter for recognized Codex paginated history contracts.
// No conversation text is scanned. The live MCP item and its actual thread cwd
// are checked before its arguments are read, and before an incoming body is saved.
const path = require("node:path");
const fs = require("node:fs");
const S = require("./store.cjs");
const Adapter = require("./source-adapter.cjs");
let adapterHealth = { available: null, error: null };
const SCAN_LIMITS = { pageSize: 200, rows: 100000, milliseconds: 5000 };
// Metadata only. Pagination never loads conversation bodies or calls a model.
function* pages(statement, args, budget) {
  for (let offset = 0; ; offset += SCAN_LIMITS.pageSize) {
    if (budget.rows >= SCAN_LIMITS.rows || Date.now() >= budget.deadline)
      throw Error("SOURCE_SCAN_TRUNCATED");
    const rows = statement.all(...args, SCAN_LIMITS.pageSize, offset);
    for (const row of rows) {
      if (++budget.rows > SCAN_LIMITS.rows || Date.now() >= budget.deadline)
        throw Error("SOURCE_SCAN_TRUNCATED");
      yield row;
    }
    if (rows.length < SCAN_LIMITS.pageSize) return;
  }
}
function databaseFile(home, pattern) {
  const matches = fs.readdirSync(home).filter((name) => pattern.test(name));
  if (matches.length !== 1)
    throw Error(
      matches.length ? "SOURCE_DATABASE_AMBIGUOUS" : "SOURCE_DATABASE_MISSING",
    );
  return path.join(home, matches[0]);
}
function databases() {
  const { DatabaseSync } = require("node:sqlite");
  const home = S.config().codexHome || process.env.CODEX_HOME;
  if (!home) throw Error("SOURCE_HOME_UNKNOWN");
  const state = new DatabaseSync(databaseFile(home, /^state_\d+\.sqlite$/), {
    readOnly: true,
  });
  let history;
  try {
    history = new DatabaseSync(
      databaseFile(home, /^thread_history_\d+\.sqlite$/),
      {
        readOnly: true,
      },
    );
  } catch (e) {
    state.close();
    throw e;
  }
  try {
    Adapter.validateSchema(state, history);
  } catch (error) {
    state.close();
    history.close();
    throw error;
  }
  return { state, history };
}
function authorizeCall(args, tool = "record_stage") {
  let db;
  try {
    db = databases();
    const rows = db.history
      .prepare(
        "SELECT thread_id,turn_id,item_id,created_at_ms FROM thread_items WHERE item_type='mcpToolCall' AND created_at_ms>=? AND json_extract(item_json,'$.server')='jinjingtai' AND json_extract(item_json,'$.tool')=? AND json_extract(item_json,'$.status')='inProgress' LIMIT 101",
      )
      .all(Date.now() - 120000, tool);
    if (!rows.length) throw Error("LIVE_SOURCE_NOT_FOUND");
    if (rows.length > 100) throw Error("SOURCE_BUSY");
    // Check all candidate directories first. No recorded arguments are read until
    // all ambiguous live callers are known to be inside the user's scope.
    const verified = rows.map((row) => {
      Adapter.liveCall(row);
      const meta = db.state
        .prepare("SELECT id,cwd,cli_version FROM threads WHERE id=?")
        .get(row.thread_id);
      if (!meta) throw Error("SOURCE_THREAD_UNKNOWN");
      Adapter.thread(meta);
      return { ...row, cwd: S.authorize(meta.cwd), version: meta.cli_version };
    });
    const accepted = [];
    for (const row of verified) {
      const stored = db.history
        .prepare(
          "SELECT json_extract(item_json,'$.arguments') AS arguments FROM thread_items WHERE thread_id=? AND turn_id=? AND item_id=?",
        )
        .get(row.thread_id, row.turn_id, row.item_id);
      const body = Adapter.argumentsBody(stored.arguments);
      if (S.hash(S.bodyOf(body)) === S.hash(S.bodyOf(args))) accepted.push(row);
    }
    if (accepted.length !== 1) throw Error("SOURCE_AMBIGUOUS");
    const r = accepted[0];
    return {
      cwd: r.cwd,
      session_id: r.thread_id,
      turn_id: r.turn_id,
      tool_use_id: r.item_id,
      createdAt: r.created_at_ms,
      version: r.version,
      proof: "codex-live-history",
    };
  } catch (e) {
    if (/^[A-Z_]+$/.test(e.message)) throw e;
    throw Error("SOURCE_ADAPTER_UNAVAILABLE");
  } finally {
    db?.state.close();
    db?.history.close();
  }
}
function turns() {
  let db;
  const out = [];
  const errors = [];
  try {
    const c = S.config();
    if (!c.enabled) {
      adapterHealth = { available: null, error: null, disabled: true };
      return [];
    }
    db = databases();
    const budget = { rows: 0, deadline: Date.now() + SCAN_LIMITS.milliseconds };
    const threads = pages(
      db.state.prepare(
        "SELECT id,cwd,cli_version FROM threads WHERE COALESCE(updated_at_ms,updated_at*1000)>=? ORDER BY COALESCE(updated_at_ms,updated_at*1000) DESC,id LIMIT ? OFFSET ?",
      ),
      [Date.parse(c.installedAt || 0)],
      budget,
    );
    try {
      for (const thread of threads) {
        try {
          S.authorize(thread.cwd);
        } catch {
          continue;
        }
        try {
          Adapter.thread(thread);
          const threadTurns = pages(
            db.history.prepare(
              "SELECT turn_id,status,started_at,completed_at FROM thread_turns WHERE thread_id=? ORDER BY rollout_ordinal DESC,turn_id LIMIT ? OFFSET ?",
            ),
            [thread.id],
            budget,
          );
          for (const t of threadTurns) {
            try {
              const parsed = Adapter.turn(t);
              const milliseconds = Date.parse(parsed.at);
              if (
                milliseconds >=
                Date.parse(
                  c.scopeMode === "all-workspaces" &&
                    !c.roots.some((r) =>
                      S.within(S.canonical(thread.cwd), S.canonical(r)),
                    )
                    ? c.globalEnabledAt || c.installedAt || 0
                    : c.installedAt || 0,
                )
              )
                out.push({
                  session: thread.id,
                  turn: t.turn_id,
                  status: t.status,
                  at: parsed.at,
                  completed: parsed.completed,
                  cwd: thread.cwd,
                });
            } catch (error) {
              errors.push({
                error: /^[A-Z_]+$/.test(error.message)
                  ? error.message
                  : "SOURCE_RECORD_UNSUPPORTED",
                version: thread.cli_version,
              });
            }
          }
        } catch (error) {
          if (error.message === "SOURCE_SCAN_TRUNCATED") throw error;
          errors.push({
            error: /^[A-Z_]+$/.test(error.message)
              ? error.message
              : "SOURCE_RECORD_UNSUPPORTED",
            version: thread.cli_version,
          });
        }
      }
    } catch (error) {
      if (error.message !== "SOURCE_SCAN_TRUNCATED") throw error;
      errors.push({ error: "SOURCE_SCAN_TRUNCATED" });
    }
    adapterHealth = {
      available: errors.length === 0,
      error: errors[0]?.error || null,
      contract: Adapter.contract,
      partial: errors.length > 0 && out.length > 0,
      errors,
      scannedRows: budget.rows,
    };
    return out;
  } catch (error) {
    adapterHealth = {
      available: false,
      error: /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "SOURCE_ADAPTER_UNAVAILABLE",
    };
    return [];
  } finally {
    db?.state.close();
    db?.history.close();
  }
}
function recoverTurn(session, turn, requireClosed = true) {
  let db;
  try {
    db = databases();
    const meta = db.state
      .prepare("SELECT id,cwd,cli_version FROM threads WHERE id=?")
      .get(session);
    if (!meta) throw Error("SOURCE_THREAD_UNKNOWN");
    S.authorize(meta.cwd);
    Adapter.thread(meta);
    const source = db.history
      .prepare(
        "SELECT status,started_at,completed_at FROM thread_turns WHERE thread_id=? AND turn_id=?",
      )
      .get(session, turn);
    if (!source || (requireClosed && !source.completed_at))
      throw Error("TURN_NOT_FINISHED");
    Adapter.turn(source);
    const rows = db.history
      .prepare(
        "SELECT item_id,item_type,json_extract(item_json,'$.cwd') cwd,json_extract(item_json,'$.command') command,json_extract(item_json,'$.exitCode') exitCode,json_extract(item_json,'$.status') status,json_type(item_json,'$.changes') changesType FROM thread_items WHERE thread_id=? AND turn_id=? AND item_type IN ('commandExecution','fileChange') ORDER BY rollout_ordinal LIMIT 101",
      )
      .all(session, turn);
    if (rows.length > 100) throw Error("RECOVERY_SCOPE_TOO_LARGE");
    const evidence = [];
    let verified = false;
    let implementation = false;
    let omitted = 0;
    for (const row of rows) {
      if (row.item_type === "commandExecution") {
        try {
          S.authorize(row.cwd);
        } catch {
          omitted++;
          continue;
        }
        if (!require("./test-command.cjs").isTestCommand(row.command)) {
          omitted++;
          continue;
        }
        Adapter.command(row);
        const output = db.history
          .prepare(
            "SELECT json_extract(item_json,'$.aggregatedOutput') output FROM thread_items WHERE thread_id=? AND turn_id=? AND item_id=?",
          )
          .get(session, turn, row.item_id);
        if (output.output != null && typeof output.output !== "string")
          throw Error("SOURCE_RECORD_UNSUPPORTED");
        evidence.push({
          call: row.item_id,
          type: "test",
          command: row.command.slice(-500),
          exitCode: row.exitCode,
          output: (output.output || "").slice(-1600),
        });
        if (
          row.exitCode === 0 &&
          (row.status == null || row.status === "completed")
        )
          verified = true;
      } else {
        if (row.changesType !== "array")
          throw Error("SOURCE_RECORD_UNSUPPORTED");
        const files = db.history
          .prepare(
            "SELECT json_extract(value,'$.path') path FROM thread_items,json_each(json_extract(item_json,'$.changes')) WHERE thread_id=? AND turn_id=? AND item_id=?",
          )
          .all(session, turn, row.item_id);
        for (const f of files) {
          if (typeof f.path !== "string" || !f.path)
            throw Error("SOURCE_RECORD_UNSUPPORTED");
          try {
            const file = path.resolve(meta.cwd, f.path);
            S.authorize(path.dirname(file));
            const fs = require("node:fs");
            if (fs.existsSync(file) && fs.statSync(file).isFile()) {
              implementation = true;
              evidence.push({
                call: row.item_id,
                type: "file",
                path: file,
                digest: S.hash(fs.readFileSync(file).toString("base64")),
                observedAt: new Date().toISOString(),
                hashMeaning:
                  "current artifact at inspection; not historical contents",
              });
            }
          } catch {
            omitted++;
          }
        }
      }
    }
    if (!evidence.length) throw Error("NO_RECOVERABLE_EVIDENCE");
    const id = "recovery:" + session + ":" + turn;
    return {
      id,
      workspace: S.workspace(meta.cwd),
      kind: verified
        ? "verified"
        : implementation
          ? "implementation"
          : "attempt",
      title: "漏记或中断工作的来源补整理",
      summary:
        "这轮没有阶段小结。仅依据以下经过目录核准的测试与产物信息整理，不能当作完整聊天覆盖。" +
        JSON.stringify(evidence),
      next: "",
      evidence: evidence.map((e) => JSON.stringify(e)),
      relations: [],
      coverage: {
        session,
        turn,
        omitted,
        mode: "necessary-test-and-artifact-fragments",
      },
      snapshots: evidence,
    };
  } catch (e) {
    if (/^[A-Z_]+$/.test(e.message)) throw e;
    throw Error("SOURCE_ADAPTER_UNAVAILABLE");
  } finally {
    db?.state.close();
    db?.history.close();
  }
}
module.exports = {
  authorizeCall,
  turns,
  recoverTurn,
  health: () => adapterHealth,
};
