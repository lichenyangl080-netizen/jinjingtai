// Recognize a data contract, not a Codex release number. Unknown semantics fail closed.
const contract = "codex-paginated-history-v1";
const object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const id = (v) => typeof v === "string" && v.length > 0 && v.length < 200;
function requireRecord(valid) {
  if (!valid) throw Error("SOURCE_RECORD_UNSUPPORTED");
}
function validateSchema(state, history) {
  for (const [db, table, fields] of [
    [
      state,
      "threads",
      ["id", "cwd", "cli_version", "updated_at_ms", "updated_at"],
    ],
    [
      history,
      "thread_items",
      [
        "thread_id",
        "turn_id",
        "item_id",
        "created_at_ms",
        "item_type",
        "item_json",
        "rollout_ordinal",
      ],
    ],
    [
      history,
      "thread_turns",
      [
        "thread_id",
        "turn_id",
        "status",
        "started_at",
        "completed_at",
        "rollout_ordinal",
      ],
    ],
  ]) {
    const names = new Map(
      db
        .prepare("PRAGMA table_info(" + table + ")")
        .all()
        .map((r) => [r.name, r.type]),
    );
    if (fields.some((f) => !names.has(f)))
      throw Error("SOURCE_SCHEMA_UNSUPPORTED");
    for (const field of fields) {
      const type = names.get(field);
      const numeric =
        /^(?:updated_at(?:_ms)?|created_at_ms|started_at|completed_at|rollout_ordinal)$/.test(
          field,
        );
      if (
        typeof type === "string" &&
        type.toUpperCase() !== (numeric ? "INTEGER" : "TEXT")
      )
        throw Error("SOURCE_SCHEMA_UNSUPPORTED");
    }
  }
  return contract;
}
function timestamp(value) {
  requireRecord(Number.isSafeInteger(value) && value > 0);
  const ms = value < 1e12 ? value * 1000 : value;
  requireRecord(
    Number.isSafeInteger(ms) && Number.isFinite(new Date(ms).getTime()),
  );
  return ms;
}
function thread(value) {
  requireRecord(
    object(value) &&
      id(value.id) &&
      typeof value.cwd === "string" &&
      value.cwd.length > 0,
  );
  return value;
}
function turn(value) {
  requireRecord(
    object(value) &&
      ["inProgress", "completed", "failed", "interrupted"].includes(
        value.status,
      ),
  );
  const started = timestamp(value.started_at);
  const ended =
    value.completed_at == null ? null : timestamp(value.completed_at);
  requireRecord(
    (ended === null || ended >= started) &&
      (value.status !== "completed" || ended !== null),
  );
  if (value.turn_id !== undefined) requireRecord(id(value.turn_id));
  return {
    ...value,
    at: new Date(started).toISOString(),
    completed: ended !== null,
  };
}
function liveCall(value) {
  requireRecord(
    object(value) &&
      id(value.thread_id) &&
      id(value.turn_id) &&
      id(value.item_id),
  );
  const at = timestamp(value.created_at_ms);
  requireRecord(at >= Date.now() - 120000 && at <= Date.now() + 5000);
  return value;
}
function argumentsBody(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw Error("SOURCE_RECORD_UNSUPPORTED");
  }
  requireRecord(object(body));
  return body;
}
function command(value) {
  requireRecord(
    id(value.item_id) &&
      typeof value.command === "string" &&
      (value.exitCode == null || Number.isSafeInteger(value.exitCode)) &&
      (value.status == null ||
        ["inProgress", "completed", "failed", "interrupted"].includes(
          value.status,
        )),
  );
  return value;
}
module.exports = {
  contract,
  validateSchema,
  thread,
  turn,
  liveCall,
  argumentsBody,
  command,
};
