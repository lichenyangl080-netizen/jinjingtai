// The local archive and model input are deliberately different data surfaces.
// Do not accept personal records, notes, attachments or arbitrary source reads here.
const S = require("./store.cjs");
const MAX_ITEMS = 160,
  MAX_CHARS = 90000;
function collectStages(
  stages,
  {
    dailySummary = false,
    groupingIds = new Set(),
    groupingUnits = new Map(),
  } = {},
) {
  const evidenceCatalog = {};
  const items = stages.flatMap((stage) => {
    const refs = [
      ...new Set(
        (stage.assessment?.snapshots || []).map((snapshot) => {
          const id = S.hash(snapshot);
          evidenceCatalog[id] = snapshot;
          return id;
        }),
      ),
    ];
    return stage.items.map((item, n) => {
      const supported = !!(stage.assessment?.supportedItems
        ? stage.assessment.supportedItems.find((x) => x.n === n)?.verified
        : stage.assessment?.verified && stage.items.length === 1);
      const id = stage.id + ":" + n,
        groupOnly = groupingIds.has(id);
      return {
        id,
        ...(dailySummary
          ? { groupOnly, groupingUnit: groupingUnits.get(id) || null }
          : {}),
        workspace: S.workspace(stage.source.cwd),
        sourceAt: stage.at,
        kind:
          item.kind === "verified" && !supported ? "implementation" : item.kind,
        title: item.title,
        summary: item.summary,
        next: item.next || "",
        evidence:
          groupOnly && dailySummary ? [] : [...new Set(item.evidence || [])],
        evidenceRefs: groupOnly && dailySummary ? [] : refs,
        verification:
          item.kind === "verified"
            ? supported
              ? "supported"
              : "not_supported"
            : "not_claimed",
        relations: item.relations || [],
      };
    });
  });
  return { items, evidenceCatalog };
}
function excerpt(text, limit = 70) {
  if (text.length <= limit) return { text, more: false };
  const prefix = text.slice(0, limit),
    breaks = [...prefix.matchAll(/[。！？\n]/g)],
    last = breaks.at(-1)?.index;
  return { text: last >= 25 ? prefix.slice(0, last + 1) : prefix, more: true };
}
function pack(materials, originals, { onDemand = false, directory = {} } = {}) {
  const projects = [],
    projectAliases = {},
    groupAliases = {},
    historicalAliases = {};
  const projectIds = new Map(),
    groupIds = new Map(),
    historicalIds = new Map(),
    phases = new Map(),
    phaseTimes = new Map();
  const timeFormat = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    numberingSystem: "latn",
  });
  const shortTime = (date) => {
    const p = Object.fromEntries(
      timeFormat.formatToParts(date).map((x) => [x.type, x.value]),
    );
    return `${p.month}-${p.day} ${p.hour}:${p.minute}`;
  };
  const known = new Set(materials.map((m) => m.id));
  for (let n = 0; n < materials.length; n++) {
    const m = materials[n],
      original = originals[n],
      workspace = original.workspace || "";
    let project = projectIds.get(workspace);
    if (!project) {
      project = { id: "p" + (projects.length + 1), stages: [] };
      projects.push(project);
      projectIds.set(workspace, project);
      projectAliases[project.id] = workspace;
    }
    // One timestamp per captured stage, not per evidence item. Preserve original
    // stage order; minutes are display context, not a fabricated source ID.
    const stageId = /^[a-f0-9]{64}:\d+$/.test(original.id)
      ? original.id.split(":")[0]
      : original.id;
    const key = JSON.stringify([workspace, stageId, original.sourceAt || null]);
    let phase = phases.get(key);
    if (!phase) {
      const date = original.sourceAt ? new Date(original.sourceAt) : null,
        valid = date && Number.isFinite(date.getTime());
      phase = { ...(valid ? { time: shortTime(date) } : {}), items: [] };
      phaseTimes.set(phase, valid ? date.getTime() : Infinity);
      phases.set(key, phase);
      project.stages.push(phase);
    }
    const brief = onDemand
      ? excerpt(m.summary)
      : { text: m.summary, more: false };
    const row = { id: m.id, kind: m.kind, title: m.title, summary: brief.text };
    if (brief.more) row.more = true;
    if (m.next) {
      if (onDemand) row.hasNext = true;
      else row.next = m.next;
    }
    if (m.verification === "not_supported") row.verification = "not_supported";
    if (m.groupOnly) {
      const unit = m.groupingUnit || original.id;
      let id = groupIds.get(unit);
      if (!id) {
        id = "g" + (groupIds.size + 1);
        groupIds.set(unit, id);
        groupAliases[id] = unit;
      }
      row.lockedGroup = id;
    }
    if (m.relations.length) {
      row.relations = {};
      for (const r of m.relations) {
        let target = r.target;
        if (!known.has(target)) {
          let id = historicalIds.get(target);
          if (!id) {
            id = "h" + (historicalIds.size + 1);
            historicalIds.set(target, id);
            historicalAliases[id] = target;
          }
          target = id;
        }
        (row.relations[r.type] ||= []).push(target);
      }
    }
    if (m.recovery) {
      const { coverage, tests, files, omittedTests, omittedFiles } = m.recovery;
      row.recovery = onDemand
        ? {
            omitted: coverage.omitted || 0,
            tests: tests.length,
            failedTests: tests.filter((t) => t.exitCode !== 0).length,
            files: files.length,
            omittedTests,
            omittedFiles,
          }
        : {
            omitted: coverage.omitted || 0,
            tests,
            files: files.map((f) => ({
              path: f.path,
              hashMeaning: f.hashMeaning,
            })),
            omittedTests,
            omittedFiles,
          };
    }
    phase.items.push(row);
  }
  for (const p of projects)
    p.stages.sort((a, b) => phaseTimes.get(a) - phaseTimes.get(b));
  const payloadProjects = onDemand
    ? projects.map((p) => ({
        id: p.id,
        items: p.stages.flatMap((s) => s.items).filter((m) => !m.lockedGroup),
        directory: [
          ...new Set(
            p.stages
              .flatMap((s) => s.items)
              .map((m) => m.lockedGroup)
              .filter(Boolean),
          ),
        ].map((id) => {
          const rows = p.stages
            .flatMap((s) => s.items)
            .filter((m) => m.lockedGroup === id);
          const previous = directory[groupAliases[id]];
          return {
            id,
            title: previous?.title || rows.at(-1).title,
            summary: excerpt(previous?.summary || rows.at(-1).summary, 100)
              .text,
            more: !previous || (previous.summary?.length || 0) > 100,
            sources: Object.fromEntries(
              [...new Set(rows.map((m) => m.kind))].map((kind) => [
                kind,
                rows.filter((m) => m.kind === kind).map((m) => m.id),
              ]),
            ),
            ...(rows.some((m) => m.relations)
              ? {
                  relations: rows
                    .filter((m) => m.relations)
                    .map((m) => ({ id: m.id, ...m.relations })),
                }
              : {}),
            ...(rows.some((m) => m.verification === "not_supported")
              ? { verification: "not_supported" }
              : {}),
          };
        }),
      }))
    : projects;
  return {
    payload: {
      projects: payloadProjects,
      ...(historicalIds.size
        ? { historicalReferences: [...historicalIds.values()] }
        : {}),
    },
    projectAliases,
    groupAliases,
    historicalAliases,
  };
}
function project(
  items,
  { aliases = false, compact = false, onDemand = false, directory = {} } = {},
) {
  const sourceAliases = aliases
    ? Object.fromEntries(items.map((item, n) => ["m" + (n + 1), item.id]))
    : {};
  const aliasOf = new Map(
    Object.entries(sourceAliases).map(([alias, id]) => [id, alias]),
  );
  const materials = items.map((item) => {
    const projected = {
      id: aliasOf.get(item.id) || item.id,
      workspace: item.workspace,
      sourceAt: item.sourceAt,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
      next: item.next || "",
      relations: (item.relations || []).map((r) => ({
        ...r,
        target: aliasOf.get(r.target) || r.target,
      })),
      ...(item.groupOnly !== undefined
        ? { groupOnly: item.groupOnly, groupingUnit: item.groupingUnit || null }
        : {}),
      verification: item.verification || "not_claimed",
    };
    if (item.coverage?.mode === "necessary-test-and-artifact-fragments") {
      // Recovery has no short stage. Keep bounded, authorized test/artifact facts,
      // never its original JSON-filled summary or complete command output.
      const snapshots = item.snapshots || [],
        tests = snapshots.filter((s) => s.type === "test"),
        files = snapshots.filter((s) => s.type === "file");
      projected.summary =
        "这轮没有阶段小结，仅恢复部分测试和产物依据，不能推断完整工作或整体完成。";
      projected.recovery = {
        coverage: item.coverage,
        tests: tests.slice(0, 8).map((s) => ({
          command: s.command,
          exitCode: s.exitCode,
          output: (s.output || "").slice(-400),
        })),
        files: files.slice(0, 8).map((s) => ({
          path: s.path,
          observedAt: s.observedAt,
          hashMeaning: s.hashMeaning,
        })),
        omittedTests: Math.max(0, tests.length - 8),
        omittedFiles: Math.max(0, files.length - 8),
      };
    }
    return projected;
  });
  const packed = compact
    ? pack(materials, items, { onDemand, directory })
    : null;
  // Repeated field names need not be paid for in every source row. Keep the
  // named local projection for checks; the model gets documented positional rows.
  const wire =
    packed && onDemand
      ? {
          ...packed.payload,
          projects: packed.payload.projects.map((p) => ({
            id: p.id,
            ...(p.directory.length ? { directory: p.directory } : {}),
            items: p.items.map(({ id, kind, title, summary, ...flags }) => [
              id,
              kind,
              title,
              summary,
              ...(Object.keys(flags).length ? [flags] : []),
            ]),
          })),
        }
      : packed?.payload || materials;
  const serialized = JSON.stringify(wire);
  return {
    materials,
    serialized,
    sourceAliases,
    ...(packed || {}),
    stats: {
      items: items.length,
      stageChars: serialized.length,
      ...(packed
        ? {
            plainProjectionChars: JSON.stringify(materials).length,
            contentChars: materials.reduce(
              (sum, m) =>
                sum + m.title.length + m.summary.length + m.next.length,
              0,
            ),
          }
        : {}),
      localDeclaredEvidenceChars: items.reduce(
        (sum, item) => sum + JSON.stringify(item.evidence || []).length,
        0,
      ),
    },
  };
}
function restore(result, aliases) {
  const ids = (sources) => {
    if (!Array.isArray(sources)) throw Error("INVALID_CITATION");
    return sources.map((id) => {
      if (typeof id !== "string" || !Object.hasOwn(aliases, id))
        throw Error("INVALID_CITATION");
      return aliases[id];
    });
  };
  if (
    !result ||
    !Array.isArray(result.entries) ||
    !Array.isArray(result.highlights) ||
    !Array.isArray(result.unprocessed)
  )
    throw Error("INVALID_RESULT");
  return {
    ...result,
    entries: result.entries.map((e) => ({ ...e, sources: ids(e.sources) })),
    highlights: result.highlights.map((h) => ({
      ...h,
      sources: ids(h.sources),
    })),
    unprocessed: ids(result.unprocessed),
  };
}
function check(input) {
  if (input.materials.length > MAX_ITEMS) throw Error("SCOPE_ITEM_LIMIT");
  if (input.serialized.length > MAX_CHARS) throw Error("SCOPE_TEXT_LIMIT");
}
module.exports = {
  collectStages,
  project,
  restore,
  check,
  excerpt,
  MAX_ITEMS,
  MAX_CHARS,
};
