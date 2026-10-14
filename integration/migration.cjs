const path = require("node:path");
const S = require("./store.cjs");
function migrate(legacy, sample, profile) {
  const marker = path.join(S.HOME, "migrations", S.hash(profile) + ".json");
  const contentMarker = path.join(
    S.HOME,
    "migrations",
    "content-" + S.hash(legacy) + ".json",
  );
  const existing = S.personal();
  if (!legacy) return existing;
  if (
    legacy.version !== 1 ||
    !Array.isArray(legacy.records) ||
    !Array.isArray(legacy.projects) ||
    !legacy.notes
  )
    throw Error("INVALID_LEGACY_STORE");
  const archive = path.join(
    S.library(),
    "migration",
    "prototype-" + S.hash(profile) + ".json",
  );
  if (!S.read(archive, null)) S.atomic(archive, legacy, true);
  const first = path.join(S.library(), "migration", "prototype-original.json");
  if (!S.read(first, null)) S.atomic(first, legacy, true);
  if (S.read(marker, null) || S.read(contentMarker, null)) return existing;
  const store = structuredClone(existing.store),
    kept = legacy.records.flatMap((r) => {
      const demo = sample.records.find((s) => s.id === r.id);
      if (!demo) return [r];
      const fields = [
        "title",
        "change",
        "next",
        "summary",
        "evidence",
        "kind",
        "project",
        "attachments",
      ];
      if (fields.every((k) => S.hash(r[k] ?? null) === S.hash(demo[k] ?? null)))
        return [];
      const imported = {
        ...r,
        manual: true,
        humanEdited: true,
        project: r.project === demo.project ? "unassigned" : r.project,
        kind: r.kind === demo.kind ? "所得" : r.kind,
      };
      for (const k of ["change", "next", "summary", "evidence"])
        if (r[k] === demo[k]) imported[k] = "";
      if (r.title === demo.title) imported.title = "原型中的人工修改";
      return [imported];
    });
  const projectIds = new Set(kept.map((r) => r.project));
  for (const p of legacy.projects) {
    const edited =
      S.hash(p) !== S.hash(sample.projects.find((s) => s.id === p.id) || null);
    if (!edited && !projectIds.has(p.id)) continue;
    if (!store.projects.some((x) => x.id === p.id))
      store.projects.push(
        edited ? p : { ...p, subject: "", status: "", next: "" },
      );
  }
  for (const r of kept) {
    const prior = store.records.find((x) => x.id === r.id);
    if (prior?.removed) continue;
    if (prior && S.hash(prior) === S.hash(r)) continue;
    const imported = prior ? { ...r, id: "legacy-" + S.hash(r) } : r;
    if (!store.records.some((x) => x.id === imported.id))
      store.records.push(imported);
  }
  for (const [d, n] of Object.entries(legacy.notes)) {
    // Confirming a demo changes metadata, not authorship. Do not import its
    // unchanged sample prose merely because reviewed/confirmed was added.
    const demo = sample.notes[d];
    if (demo && n.lesson === demo.lesson && n.tomorrow === demo.tomorrow)
      continue;
    if (S.hash(n) === S.hash(sample.notes[d] || null)) continue;
    if (!store.notes[d]) store.notes[d] = n;
    else if (S.hash(n) !== S.hash(store.notes[d])) {
      const id = "legacy-note-" + S.hash([d, n]);
      if (!store.records.some((r) => r.id === id))
        store.records.push({
          id,
          date: d,
          project: "unassigned",
          title: "原型中的人工回顾",
          change: n.lesson || "",
          next: n.tomorrow || "",
          kind: "所得",
          manual: true,
          confirmed: true,
        });
    }
  }
  const next =
    S.hash(store) === S.hash(existing.store)
      ? existing
      : S.savePersonal(store, existing.revision, existing.libraryId);
  S.atomic(contentMarker, {
    library: S.library(),
    at: new Date().toISOString(),
  });
  S.atomic(marker, { library: S.library(), at: new Date().toISOString() });
  return next;
}
module.exports = { migrate };
