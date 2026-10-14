// Authority validation is shared by reads and writes. Unknown extension fields survive.
const object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v, keys) =>
  object(v) && keys.every((k) => typeof v[k] === "string");
const optional = (v, keys, type) =>
  keys.every((k) => v[k] === undefined || typeof v[k] === type);
const stringList = (v) =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const work = (v) =>
  strings(v, ["title", "summary"]) &&
  optional(v, ["label", "lead"], "string") &&
  (v.sources === undefined || stringList(v.sources));
const date = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v + "T12:00:00Z")) &&
  new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v;
function validRecord(r) {
  return (
    strings(r, ["id", "date", "project", "title", "change", "next", "kind"]) &&
    r.id.length > 0 &&
    r.project.trim().length > 0 &&
    r.title.trim().length > 0 &&
    date(r.date) &&
    optional(
      r,
      [
        "confirmed",
        "manual",
        "removed",
        "humanEdited",
        "dailySummary",
        "progressHidden",
      ],
      "boolean",
    ) &&
    optional(r, ["summary", "evidence", "sourceAt", "createdAt"], "string") &&
    (r.work === undefined || work(r.work)) &&
    (r.sourceLinks === undefined ||
      (Array.isArray(r.sourceLinks) &&
        r.sourceLinks.every(
          (x) =>
            strings(x, ["id", "session", "turn"]) &&
            optional(x, ["cwd", "call"], "string"),
        ))) &&
    (r.sourceIds === undefined || stringList(r.sourceIds)) &&
    (r.relations === undefined ||
      (Array.isArray(r.relations) &&
        r.relations.every(
          (x) =>
            strings(x, ["type", "target"]) &&
            ["supplements", "negates", "supersedes"].includes(x.type),
        ))) &&
    (r.attachments === undefined ||
      (Array.isArray(r.attachments) &&
        r.attachments.every(
          (x) =>
            strings(x, ["id", "name"]) &&
            Number.isFinite(x.size) &&
            x.size >= 0,
        )))
  );
}
function validEnvelope(p) {
  if (
    !object(p) ||
    !Number.isSafeInteger(p.revision) ||
    p.revision < 0 ||
    !object(p.store) ||
    p.store.version !== 1
  )
    return false;
  const s = p.store;
  return (
    Array.isArray(s.records) &&
    Array.isArray(s.projects) &&
    object(s.notes) &&
    s.projects.every(
      (p) =>
        strings(p, ["id", "name", "subject", "status", "next"]) &&
        p.id.length > 0 &&
        optional(p, ["archived"], "boolean") &&
        (p.overviewRecordIds === undefined ||
          (stringList(p.overviewRecordIds) &&
            p.overviewRecordIds.every((id) => id.trim().length > 0) &&
            new Set(p.overviewRecordIds).size ===
              p.overviewRecordIds.length)) &&
        (p.workspaceAliases === undefined ||
          (stringList(p.workspaceAliases) &&
            p.workspaceAliases.every(
              (directory) => directory.trim().length > 0,
            ))),
    ) &&
    new Set(s.projects.map((p) => p.id)).size === s.projects.length &&
    Object.entries(s.notes).every(
      ([d, n]) => date(d) && strings(n, ["lesson", "tomorrow"]),
    ) &&
    validExtensions(s) &&
    (s.workAssignments === undefined ||
      (object(s.workAssignments) &&
        Object.values(s.workAssignments).every(work))) &&
    (s.plans === undefined ||
      (object(s.plans) &&
        Object.entries(s.plans).every(
          ([d, t]) => date(d) && typeof t === "string",
        )))
  );
}
function validExtensions(s) {
  if (
    s.continuations !== undefined &&
    (!object(s.continuations) ||
      !Object.entries(s.continuations).every(
        ([project, c]) =>
          project.length > 0 &&
          strings(c, ["text", "updatedAt"]) &&
          optional(c, ["recordId", "sourceNext", "sourceSignature"], "string"),
      ))
  )
    return false;
  if (
    s.periodReviews !== undefined &&
    (!object(s.periodReviews) ||
      !Object.entries(s.periodReviews).every(
        ([key, r]) =>
          strings(r, ["period", "start", "end", "text", "updatedAt"]) &&
          ["周", "月", "年"].includes(r.period) &&
          date(r.start) &&
          date(r.end) &&
          r.start <= r.end &&
          key === r.period + ":" + r.start &&
          Array.isArray(r.references) &&
          r.references.every(
            (ref) =>
              strings(ref, ["recordId", "title", "date"]) &&
              ref.recordId.length > 0 &&
              date(ref.date),
          ) &&
          new Set(r.references.map((ref) => ref.recordId)).size ===
            r.references.length,
      ))
  )
    return false;
  if (s.threads !== undefined) {
    if (!object(s.threads)) return false;
    const assigned = new Set();
    for (const [key, t] of Object.entries(s.threads)) {
      if (
        !strings(t, [
          "id",
          "project",
          "title",
          "description",
          "createdAt",
          "updatedAt",
        ]) ||
        key !== t.id ||
        !t.id ||
        !t.project ||
        !t.title.trim() ||
        !optional(t, ["archived"], "boolean") ||
        !stringList(t.recordIds)
      )
        return false;
      for (const id of t.recordIds) {
        if (!id || assigned.has(id)) return false;
        assigned.add(id);
        // Dangling references remain readable; live references must belong to this project.
        if (
          s.records.some(
            (r) => validRecord(r) && r.id === id && r.project !== t.project,
          )
        )
          return false;
      }
    }
  }
  return true;
}
function projectPersonal(p) {
  if (!validEnvelope(p)) throw Error("PERSONAL_DATA_INVALID");
  const counts = new Map();
  for (const r of p.store.records)
    if (typeof r?.id === "string")
      counts.set(r.id, (counts.get(r.id) || 0) + 1);
  const records = [],
    issues = [];
  p.store.records.forEach((r, index) => {
    if (validRecord(r) && counts.get(r.id) === 1) records.push(r);
    else issues.push({ index, code: "PERSONAL_RECORD_INVALID" });
  });
  return { ...p, store: { ...p.store, records }, authorityIssues: issues };
}
function validPersonal(p) {
  if (!validEnvelope(p)) return false;
  return (
    p.store.records.every(validRecord) &&
    new Set(p.store.records.map((r) => r.id)).size === p.store.records.length
  );
}
function mergeIsolated(raw, incoming) {
  const view = projectPersonal(raw),
    isolated = new Set((view.authorityIssues || []).map((i) => i.index));
  const blockedIds = new Set(
    raw.store.records
      .filter((r, index) => isolated.has(index) && typeof r?.id === "string")
      .map((r) => r.id),
  );
  if (incoming.records.some((r) => blockedIds.has(r.id)))
    throw Error("ISOLATED_ID_CONFLICT");
  const remaining = new Map(incoming.records.map((r) => [r.id, r]));
  const records = raw.store.records.flatMap((r, index) => {
    if (isolated.has(index)) return [r];
    const value = remaining.get(r.id);
    remaining.delete(r.id);
    return value ? [value] : [];
  });
  return { ...incoming, records: [...records, ...remaining.values()] };
}
module.exports = { validPersonal, projectPersonal, mergeIsolated };
