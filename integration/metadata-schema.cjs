const object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v, keys) =>
  object(v) && keys.every((k) => typeof v[k] === "string");
const stringList = (v) =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
function validMetadata(folder, value, filename) {
  if (!object(value)) return false;
  if (folder === "stages")
    return (
      strings(value, ["id", "date", "at", "digest", "outcome"]) &&
      ["change", "no_change"].includes(value.outcome) &&
      strings(value.source, ["cwd", "session", "turn"]) &&
      Array.isArray(value.items) &&
      value.items.every(
        (i) =>
          strings(i, ["kind", "title", "summary"]) &&
          (i.next === undefined || typeof i.next === "string") &&
          (i.evidence === undefined || stringList(i.evidence)) &&
          (i.relations === undefined ||
            (Array.isArray(i.relations) &&
              i.relations.every((r) => strings(r, ["type", "target"])))),
      )
    );
  if (folder === "bindings") return strings(value, ["stage", "digest", "call"]);
  if (folder === "events") return strings(value, ["type", "at"]);
  if (folder === "excluded") return strings(value, ["id"]);
  if (folder === "visibility")
    return typeof value.hidden === "boolean" && stringList(value.sourceIds);
  if (folder === "jobs")
    return (
      strings(value, ["id", "state"]) &&
      /^[a-zA-Z0-9_-]+$/.test(value.id) &&
      (filename === undefined || filename === value.id + ".json") &&
      require("./job-policy.cjs").supported(value.policy) &&
      (value.applied === undefined || typeof value.applied === "boolean") &&
      ["running", "complete", "failed", "cancelled"].includes(value.state) &&
      (value.applied !== true || value.state === "complete") &&
      (value.state !== "complete" ||
        value.applied === true ||
        (object(value.result) && Array.isArray(value.result.entries))) &&
      (!(
        value.state === "running" ||
        (value.state === "complete" && !value.applied)
      ) ||
        (Array.isArray(value.materials) &&
          value.materials.every((m) => strings(m, ["id"])))) &&
      (value.result === undefined ||
        (object(value.result) &&
          (value.result.entries === undefined ||
            (Array.isArray(value.result.entries) &&
              value.result.entries.every(
                (e) =>
                  strings(e, ["title", "summary", "next"]) &&
                  stringList(e.sources),
              ))) &&
          (value.result.highlights === undefined ||
            (Array.isArray(value.result.highlights) &&
              value.result.highlights.every(
                (h) => object(h) && stringList(h.sources),
              )))))
    );
  return true;
}
module.exports = { validMetadata };
