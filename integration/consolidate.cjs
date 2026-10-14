const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const S = require("./store.cjs");
const running = new Map();
const Input = require("./organizer-input.cjs");
const Prompt = require("./organizer-prompt.cjs");
const Reader = require("./material-reader.cjs");
const WorkspacePath = require("./workspace-path.cjs");
const OrganizerErrors = require("./organizer-errors.cjs");
const { validMetadata } = require("./metadata-schema.cjs");
const JobState = require("./job-state.cjs");
function allowedActivity(item) {
  return (
    !item?.type ||
    ["agent_message", "reasoning", "error"].includes(item.type) ||
    (item.type === "mcp_tool_call" &&
      item.server === "jinjingtai_materials" &&
      item.tool === "read_material")
  );
}
const toml = (v) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? "{" +
      Object.entries(v)
        .map(([k, x]) => JSON.stringify(k) + " = " + toml(x))
        .join(", ") +
      "}"
    : JSON.stringify(v);
const labels = {
  verified: "已验证成果",
  implementation: "未验证实现",
  attempt: "尝试",
  finding: "发现",
  decision: "决策",
  blocker: "阻塞",
  proposal: "未采纳建议",
};
function candidates(date, selected) {
  if (S.personal().authorityIssues?.length)
    throw Error("PERSONAL_RECORDS_ISOLATED");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error("INVALID_DATE");
  const excluded = new Set(S.list("excluded").map((s) => s.id));
  const hidden = S.hiddenSourceIds();
  const all = S.list("stages").filter(
    (s) =>
      s.date === date &&
      S.bound(s) &&
      s.outcome === "change" &&
      !excluded.has(s.id) &&
      s.items.some((i, n) => !hidden.has(s.id + ":" + n)),
  );
  S.requireHealthy("stages", "excluded", "visibility", "bindings");
  return all
    .filter((s) => !selected || selected.includes(s.id))
    .sort((a, b) => a.at.localeCompare(b.at));
}
function preview(date) {
  const p = S.personal();
  const projectOf = require("./preferences.cjs").createProjectResolver(
    p.store.projects,
  );
  const used = new Set(p.store.records.flatMap((r) => r.sourceIds || []));
  const protectedIds = new Set(
    p.store.records
      .filter((r) => r.removed || r.manual || r.humanEdited)
      .flatMap((r) => r.sourceIds || []),
  );
  const hidden = S.hiddenSourceIds();
  const out = candidates(date).map((s) => ({
    id: s.id,
    cwd: s.source.cwd,
    project: projectOf(s.source.cwd),
    at: s.at,
    items: s.items
      .map((i, n) => ({
        id: s.id + ":" + n,
        title: i.title,
        kind: i.kind,
        used: used.has(s.id + ":" + n),
        protected: protectedIds.has(s.id + ":" + n),
        groupOnly: p.store.records.some(
          (r) =>
            !r.manual &&
            !r.humanEdited &&
            !r.removed &&
            r.sourceIds?.includes(s.id + ":" + n),
        ),
      }))
      .filter((i) => !hidden.has(i.id)),
  }));
  const stages = S.list("stages");
  for (const t of require("./source.cjs").turns()) {
    const id = "recovery:" + t.session + ":" + t.turn;
    if (
      S.day(t.at) === date &&
      t.completed &&
      !stages.some(
        (s) => s.source.session === t.session && s.source.turn === t.turn,
      ) &&
      !used.has(id)
    )
      out.push({
        id,
        cwd: t.cwd,
        project: projectOf(t.cwd),
        at: t.at,
        recovery: true,
        items: [
          {
            id,
            title: "漏记/中断：仅补整理必要测试与产物片段",
            kind: "待核准",
            used: false,
          },
        ],
      });
  }
  return out;
}
function resultSchema(
  overviewOnly = false,
  projects = 0,
  workMode = false,
  allowedSources = [],
) {
  const source = {
    type: "string",
    ...(allowedSources.length ? { enum: allowedSources } : {}),
  };
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      highlights: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string" },
            sources: { type: "array", items: source },
          },
          required: ["text", "sources"],
        },
      },
      entries: {
        type: "array",
        ...(overviewOnly
          ? { maxItems: 0 }
          : projects
            ? { maxItems: workMode ? 160 : projects * 3 }
            : {}),
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            ...(workMode
              ? {
                  work: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      title: { type: "string" },
                      summary: { type: "string" },
                    },
                    required: ["title", "summary"],
                  },
                }
              : {}),
            title: { type: "string" },
            summary: { type: "string" },
            next: { type: "string" },
            sources: { type: "array", items: source },
          },
          required: workMode
            ? ["work", "title", "summary", "next", "sources"]
            : ["title", "summary", "next", "sources"],
        },
      },
      unprocessed: { type: "array", items: source },
    },
    required: ["highlights", "entries", "unprocessed"],
  };
}
function start(date, selected, options = {}) {
  return S.withLock(() => startLocked(date, selected, options));
}
function startLocked(date, selected, options) {
  if (
    options.expectedLibraryId &&
    S.personal().libraryId !== options.expectedLibraryId
  )
    throw Error("LIBRARY_CHANGED");
  const overviewOnly = options?.overviewOnly === true;
  const dailySummary = options?.dailySummary === true && !overviewOnly;
  const materials = candidates(date, selected);
  const p = S.personal();
  const used = new Set(p.store.records.flatMap((r) => r.sourceIds || []));
  const removed = new Set(
    p.store.records
      .filter(
        (r) =>
          r.removed ||
          (overviewOnly && r.humanEdited) ||
          (dailySummary && (r.manual || r.humanEdited)),
      )
      .flatMap((r) => r.sourceIds || []),
  );
  for (const id of S.hiddenSourceIds()) removed.add(id);
  // Memory is derived from machine-produced job results only. Never read a
  // record's editable title/body (including previously human-edited text).
  const directory = {};
  const previousJobs = new Map(
    S.list("jobs")
      .filter((j) => j.state === "complete")
      .map((j) => [j.id, j]),
  );
  const unitOf = (r) => {
    const assignment = p.store.workAssignments?.[r.id];
    const job =
      previousJobs.get(assignment?.job || r.organizeJob) ||
      [...previousJobs.values()].findLast(
        (j) =>
          j.applied &&
          j.date === date &&
          j.result?.entries?.some((e) =>
            r.sourceIds?.every((id) => e.sources.includes(id)),
          ),
      );
    const entry = job?.result?.entries?.find((e) =>
      r.sourceIds?.every((id) => e.sources.includes(id)),
    );
    const work = entry?.work;
    const unit = work ? S.hash([job.id, r.project, work.title]) : r.id;
    if (work)
      directory[unit] = {
        title: work.title,
        summary: work.summary,
        sourceIds: job.result.entries
          .filter(
            (e) =>
              e.work?.title === work.title &&
              job.materials?.find((m) => m.id === e.sources[0])?.workspace ===
                job.materials?.find((m) => m.id === entry.sources[0])
                  ?.workspace,
          )
          .flatMap((e) => e.sources),
      };
    return unit;
  };
  const groupingUnits = new Map(
    p.store.records
      .filter(
        (r) =>
          !r.manual && !r.humanEdited && !r.removed && !r.supersededDraftBy,
      )
      .flatMap((r) => (r.sourceIds || []).map((id) => [id, unitOf(r)])),
  );
  const groupingIds = new Set(
    p.store.records
      .filter(
        (r) =>
          !r.manual && !r.humanEdited && !r.removed && !r.supersededDraftBy,
      )
      .flatMap((r) => r.sourceIds || []),
  );
  // The model projection is built solely from captured stages. Human text never enters it.
  const collected = Input.collectStages(materials, {
    dailySummary,
    groupingIds,
    groupingUnits,
  });
  const items = collected.items.filter(
    (i) =>
      !removed.has(i.id) && (overviewOnly || dailySummary || !used.has(i.id)),
  );
  for (const id of selected || [])
    if (!overviewOnly && id.startsWith("recovery:") && !used.has(id)) {
      const [, session, turn] = id.split(":");
      const material = require("./source.cjs").recoverTurn(session, turn);
      const actual = require("./source.cjs")
        .turns()
        .find((t) => t.session === session && t.turn === turn);
      if (!actual || S.day(actual.at) !== date)
        throw Error("RECOVERY_DATE_MISMATCH");
      items.push({ ...material, sourceAt: actual.at });
    }
  if (options.groupExistingOnly === true) {
    for (let n = items.length - 1; n >= 0; n--)
      if (!items[n].groupOnly) items.splice(n, 1);
  }
  if (!items.length) return { skipped: true, date, reason: "NO_NEW_MATERIAL" };
  if (
    dailySummary &&
    items.every((i) => used.has(i.id)) &&
    !p.store.records.some(
      (r) =>
        !r.supersededDraftBy &&
        !r.manual &&
        !r.humanEdited &&
        !r.removed &&
        !r.work &&
        !p.store.workAssignments?.[r.id] &&
        r.sourceIds?.some((id) => items.some((i) => i.id === id)),
    )
  )
    return { skipped: true, date, reason: "NO_NEW_MATERIAL" };
  const allowedDirectoryIds = new Set(items.map((i) => i.id));
  for (const [unit, previous] of Object.entries(directory))
    if (!previous.sourceIds.every((id) => allowedDirectoryIds.has(id)))
      delete directory[unit];
  const input = Input.project(items, {
    aliases: true,
    compact: true,
    onDemand: true,
    directory,
  });
  Input.check(input);
  const evidenceRefs = new Set(items.flatMap((i) => i.evidenceRefs || []));
  const evidenceCatalog = Object.fromEntries(
    Object.entries(collected.evidenceCatalog).filter(([id]) =>
      evidenceRefs.has(id),
    ),
  );
  const fingerprint = S.hash([
    "short-stage-v5-directory",
    dailySummary ? "daily-work-v3" : "meaningful-progress-v5-compact",
    overviewOnly,
    date,
    items,
  ]);
  const active = S.list("jobs").find(
    (j) =>
      j.fingerprint === fingerprint &&
      ["running", "complete"].includes(j.state),
  );
  // Invalid historical jobs stay quarantined by store.list and are reported in
  // status. They cannot be applied, but do not contaminate a new frozen scope.
  if (active) return { id: active.id, date, duplicate: true };
  const organizer = require("./organizer-settings.cjs").resolve(
    require("./preferences.cjs").load(),
  );
  // Windows sandbox denies directory traversal through a denied ancestor.
  // Keep the permitted job outside HOME/library, both of which remain denied.
  const id = crypto.randomUUID(),
    dir = path.join(require("node:os").tmpdir(), "Jinjingtai-organizer", id);
  fs.mkdirSync(dir, { recursive: true });
  const job = {
    id,
    date,
    fingerprint,
    policy: dailySummary ? "daily-work-v3" : "daily-compact-v1",
    mode: overviewOnly ? "overview" : "drafts",
    state: "running",
    startedAt: new Date().toISOString(),
    materials: items,
    evidenceCatalog,
    inputVersion: "short-stage-v5-directory",
    sourceAliases: input.sourceAliases,
    projectAliases: input.projectAliases,
    groupAliases: input.groupAliases,
    historicalAliases: input.historicalAliases,
    inputStats: {
      ...input.stats,
      localSnapshotChars: JSON.stringify(evidenceCatalog).length,
    },
    unprocessed: [],
    processStarts: 1,
    ownerPid: process.pid,
    model: organizer.organizerModel,
    reasoningEffort: organizer.organizerEffort,
    modelRequests: null,
    transportRetries: "not observable",
    retries: 0,
  };
  const actualPrompt = Prompt.build(date, input, {
    overviewOnly,
    dailySummary,
  });
  job.requestChars = actualPrompt.length;
  job.requestText = actualPrompt;
  job.directory =
    input.payload?.projects?.flatMap((p) =>
      (p.directory || []).map((d) => ({ ...d, project: p.id })),
    ) || [];
  const jobFile = path.join(S.library(), "jobs", id + ".json");
  S.atomic(
    path.join(dir, "schema.json"),
    resultSchema(
      overviewOnly,
      new Set(items.map((i) => i.workspace || "")).size,
      dailySummary,
      input.materials.map((i) => i.id),
    ),
  );
  S.atomic(jobFile, job);
  const c = S.config();
  fs.copyFileSync(
    path.join(__dirname, "material-reader.cjs"),
    path.join(dir, "reader.cjs"),
  );
  S.atomic(
    path.join(dir, "capsule.json"),
    Reader.capsule(items, input, evidenceCatalog, Date.now() + 240000),
  );
  // Only the frozen selection reader; no shell/image/browser/subagents or project instructions.
  // Existing Codex login is used in place; no credential file is read or exported by this app.
  const overrides = {
    "features.plugins": false,
    "features.remote_plugin": false,
    "features.workspace_dependencies": false,
    "features.tool_suggest": false,
    "features.unbounded_connection_retries": false,
    "features.hooks": false,
    "features.apps": false,
    "features.shell_tool": false,
    "features.code_mode": false,
    "features.code_mode_host": true,
    "features.browser_use": false,
    "features.computer_use": false,
    "features.image_generation": false,
    "features.view_image": false,
    "features.multi_agent": false,
    "features.memories": false,
    "features.skill_search": false,
    "features.sleep_tool": false,
    project_doc_max_bytes: 0,
    web_search: "disabled",
    model_provider: "openai",
    model: organizer.organizerModel,
    model_reasoning_effort: organizer.organizerEffort,
  };
  overrides["mcp_servers.jinjingtai_materials"] = {
    command: c.runtimeNode,
    args: [path.join(dir, "reader.cjs"), path.join(dir, "capsule.json")],
    enabled_tools: ["read_material"],
    startup_timeout_sec: 10,
    tool_timeout_sec: 10,
  };
  overrides["skills.include_instructions"] = false;
  overrides["skills.bundled.enabled"] = false;
  overrides["cloud.skills.enabled"] = false;
  overrides.default_permissions = "jinjingtai-organizer";
  overrides["permissions.jinjingtai-organizer.filesystem"] = {
    ":root": "read",
    ":minimal": "read",
    [S.HOME]: "deny",
    [S.library()]: "deny",
    ...(c.codexHome ? { [c.codexHome]: "deny" } : {}),
    ...Object.fromEntries(
      [
        ...c.roots,
        ...(c.legacyDataRoots || []),
        ...materials.map((s) => s.source.cwd),
        ...items.map((i) => i.workspace).filter(Boolean),
      ].map((r) => [WorkspacePath.absolute(r), "deny"]),
    ),
    [dir]: "read",
  };
  overrides["permissions.jinjingtai-organizer.network.enabled"] = false;
  const args = [
    "--no-daemon",
    "exec",
    "--ignore-user-config",
    "--ignore-rules",
    "--ephemeral",
    "--skip-git-repo-check",
    "-C",
    dir,
    "--json",
    "--output-schema",
    path.join(dir, "schema.json"),
    "-o",
    path.join(dir, "result.json"),
  ];
  for (const [k, v] of Object.entries(overrides))
    args.push("-c", k + "=" + toml(v));
  args.push("-");
  const child = spawn(require("./connection.cjs").resolveCodex(c.codex), args, {
    windowsHide: true,
    env: {
      ...process.env,
      CODEX_HOME: c.codexHome || require("./connection.cjs").codexHome(),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  running.set(id, child);
  if (child.pid) {
    job.pid = child.pid;
    S.atomic(jobFile, job);
    if (c.runtimeNode) {
      const watchdog = spawn(
        c.runtimeNode,
        [path.join(__dirname, "watchdog.cjs"), jobFile, String(child.pid)],
        { windowsHide: true, detached: true, stdio: "ignore" },
      );
      watchdog.on("error", () => {});
      watchdog.unref();
    }
  }
  child.stdin.on("error", () => {});
  child.stdin.end(actualPrompt);
  let output = "",
    stderr = "";
  let cancelled = false;
  let finished = false;
  child.stdout.on("data", (chunk) => {
    output += chunk;
    if (output.length > 2000000) child.kill();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    if (stderr.length > 100000) stderr = stderr.slice(-100000);
  });
  const timer = setTimeout(() => {
    cancelled = true;
    child.kill();
  }, 240000);
  async function finish(code, spawnError) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    running.delete(id);
    const current = S.read(jobFile);
    if (current.state !== "running") {
      try {
        fs.unlinkSync(path.join(dir, "capsule.json"));
      } catch {}
      return;
    }
    const events = output
      .trim()
      .split("\n")
      .flatMap((x) => {
        try {
          return [JSON.parse(x)];
        } catch {
          return [];
        }
      });
    const usage =
      events.findLast((e) => e.type === "turn.completed")?.usage || null;
    const readStats = S.read(path.join(dir, "lookup-state.json"), {
      calls: 0,
      chars: 0,
      requests: [],
    });
    const networkRetriesObserved = Math.max(
      0,
      ...[...stderr.matchAll(/retries=(\d+)/g)].map((m) => Number(m[1])),
    );
    const diagnostic = {
      exitCode: code,
      itemTypes: [...new Set(events.map((e) => e.item?.type).filter(Boolean))],
      networkRetriesObserved,
      stderr: stderr
        .slice(-3000)
        .replace(/Bearer\s+\S+|sk-[\w-]+/g, "[redacted]"),
    };
    let rawResult = null;
    try {
      if (spawnError || code !== 0 || cancelled)
        throw Error(
          cancelled ? "TIMEOUT" : OrganizerErrors.classify(spawnError, stderr),
        );
      rawResult = S.read(path.join(dir, "result.json"));
      if (!rawResult) throw Error("NO_RESULT");
      const result = Input.restore(rawResult, input.sourceAliases);
      validateResult(result, items, overviewOnly, true, dailySummary);
      // Any unexpected tool activity invalidates this isolated整理 run.
      if (events.some((e) => !allowedActivity(e.item)))
        throw Error("UNEXPECTED_TOOL_ACTIVITY");
      const calls = events.filter(
        (e) => e.type === "item.completed" && e.item?.type === "mcp_tool_call",
      );
      if (
        calls.length !== readStats.calls ||
        readStats.calls > Reader.LIMITS.calls ||
        readStats.chars > Reader.LIMITS.totalChars
      )
        throw Error("INVALID_READ_AUDIT");
      await JobState.finishEventually(jobFile, {
        state: "complete",
        result,
        rawResult,
        usage,
        readStats,
        diagnostic,
        unprocessed: result.unprocessed,
        completedAt: new Date().toISOString(),
      });
    } catch (e) {
      await JobState.finishEventually(jobFile, {
        state: "failed",
        rawResult,
        usage,
        readStats,
        diagnostic,
        error: /^[A-Z_]+$/.test(e.message) ? e.message : "INVALID_RESULT",
        unprocessed: items.map((i) => i.id),
      });
    }
    // Remove the read capability after the bounded job; immutable materials remain in the local job.
    try {
      fs.unlinkSync(path.join(dir, "capsule.json"));
    } catch {}
  }
  const reportFailure = (e) =>
    S.diagnostic("organizer-receipt-" + id + ".json", {
      id,
      error: /^[A-Z_]+$/.test(e.message)
        ? e.message
        : "JOB_RECEIPT_WRITE_FAILED",
      at: new Date().toISOString(),
    });
  child.once("error", (e) => finish(null, e).catch(reportFailure));
  child.once("close", (code) => finish(code).catch(reportFailure));
  return { id, date };
}
function validateResult(
  result,
  items,
  overviewOnly = false,
  compact = false,
  workMode = false,
) {
  const allowed = new Set(items.map((i) => i.id));
  const seen = new Set();
  const projectCounts = new Map(),
    works = new Map(),
    unitWorks = new Map();
  if (!Array.isArray(result.entries) || !Array.isArray(result.unprocessed))
    throw Error("INVALID_RESULT");
  if (
    result.highlights !== undefined &&
    (!Array.isArray(result.highlights) || result.highlights.length > 3)
  )
    throw Error("INVALID_HIGHLIGHTS");
  for (const h of result.highlights || []) {
    if (
      typeof h.text !== "string" ||
      !h.text.trim() ||
      !Array.isArray(h.sources) ||
      !h.sources.length ||
      h.sources.some((id) => !allowed.has(id))
    )
      throw Error("INVALID_HIGHLIGHTS");
    // Highlights are an overview, not a typed accomplishment. Mixed source
    // states are allowed here; individual entries retain homogeneous kinds.
    if (overviewOnly)
      for (const id of h.sources) {
        if (seen.has(id)) throw Error("INVALID_CITATION");
        seen.add(id);
      }
  }
  if (overviewOnly && result.entries.length)
    throw Error("OVERVIEW_CHANGED_RECORDS");
  for (const e of result.entries) {
    if (
      typeof e.title !== "string" ||
      !e.title.trim() ||
      typeof e.summary !== "string" ||
      !e.summary.trim() ||
      typeof e.next !== "string" ||
      !Array.isArray(e.sources) ||
      !e.sources.length
    )
      throw Error("INVALID_ENTRY");
    for (const id of e.sources) {
      if (!allowed.has(id) || seen.has(id)) throw Error("INVALID_CITATION");
      seen.add(id);
    }
    const kinds = new Set(
      e.sources.map((id) => items.find((i) => i.id === id).kind),
    );
    // Prevent verified/unverified/proposed/adopted material being merged into one claimed outcome.
    if (kinds.size !== 1) throw Error("MIXED_EVIDENCE_STATUS");
    if (
      new Set(
        e.sources.map((id) => items.find((i) => i.id === id).workspace || ""),
      ).size !== 1
    )
      throw Error("MIXED_PROJECTS");
    if (workMode) {
      if (
        new Set(
          e.sources.map((id) => !!items.find((i) => i.id === id).groupOnly),
        ).size !== 1
      )
        throw Error("MIXED_GROUPING_MODE");
      if (
        !e.work ||
        typeof e.work.title !== "string" ||
        !e.work.title.trim() ||
        e.work.title.length > 80 ||
        typeof e.work.summary !== "string" ||
        !e.work.summary.trim() ||
        e.work.summary.length > 700
      )
        throw Error("INVALID_WORK");
      const key = JSON.stringify([
        items.find((i) => i.id === e.sources[0]).workspace || "",
        e.work.title,
      ]);
      if (works.has(key) && works.get(key) !== e.work.summary)
        throw Error("INCONSISTENT_WORK");
      works.set(key, e.work.summary);
    }
    if (compact) {
      const workspace =
          items.find((i) => i.id === e.sources[0]).workspace || "",
        count = workMode
          ? new Set(
              [...works.keys()]
                .map((k) => JSON.parse(k))
                .filter((k) => k[0] === workspace)
                .map((k) => k[1]),
            ).size
          : (projectCounts.get(workspace) || 0) + 1;
      projectCounts.set(workspace, count);
      if (count > 3) throw Error("TOO_MANY_DAILY_ENTRIES");
    }
    if (
      e.sources.some((id) =>
        items
          .find((i) => i.id === id)
          .relations?.some(
            (r) => r.type !== "supplements" && e.sources.includes(r.target),
          ),
      )
    )
      throw Error("RELATION_MERGE_NOT_ALLOWED");
    if (workMode)
      for (const id of e.sources) {
        const m = items.find((i) => i.id === id);
        if (!m.groupingUnit) continue;
        const key = JSON.stringify([m.workspace || "", e.work.title]);
        if (
          unitWorks.has(m.groupingUnit) &&
          unitWorks.get(m.groupingUnit) !== key
        )
          throw Error("SPLIT_CONFIRMED_SCOPE");
        unitWorks.set(m.groupingUnit, key);
      }
  }
  for (const id of result.unprocessed) {
    if (!allowed.has(id) || seen.has(id)) throw Error("INVALID_COVERAGE");
    seen.add(id);
  }
  if (seen.size !== allowed.size) throw Error("INCOMPLETE_COVERAGE");
}
function readJob(id) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id))
    throw Error("LOCAL_METADATA_INVALID");
  const job = S.read(path.join(S.library(), "jobs", id + ".json"));
  if (job && !validMetadata("jobs", job, id + ".json"))
    throw Error("LOCAL_METADATA_INVALID");
  return job;
}
function history(id, expectedLibraryId) {
  if (S.personal().libraryId !== expectedLibraryId)
    throw Error("LIBRARY_CHANGED");
  const j = readJob(id);
  if (!j) throw Error("JOB_MISSING");
  return {
    id: j.id,
    date: j.date,
    startedAt: j.startedAt,
    state: j.state,
    model: j.model,
    reasoningEffort: j.reasoningEffort,
    requestText: j.requestText ?? null,
    directory: j.directory || [],
    sourceAliases: j.sourceAliases || {},
    materials: (j.materials || []).map(({ id, title, summary, groupOnly }) => ({
      id,
      title,
      summary,
      groupOnly: !!groupOnly,
    })),
    readStats: j.readStats || null,
    result: j.rawResult || j.result || null,
    error: j.error || null,
    applied: !!j.applied,
    unprocessed: j.unprocessed || [],
    skippedSources: j.skippedSources || [],
    usage: j.usage || null,
  };
}
function apply(id) {
  return S.withLock(() => {
    if (S.personal().authorityIssues?.length)
      throw Error("PERSONAL_RECORDS_ISOLATED");
    const j = readJob(id);
    if (!j || j.state !== "complete") throw Error("JOB_NOT_COMPLETE");
    if (j.applied) return { ...S.personal(), added: 0, date: j.date };
    const policy = require("./job-policy.cjs").flags(j.policy);
    if (policy.validate)
      validateResult(
        j.result,
        j.materials,
        j.mode === "overview",
        true,
        policy.work,
      );
    if (j.mode === "overview") {
      S.atomic(path.join(S.library(), "jobs", id + ".json"), {
        ...j,
        applied: true,
      });
      return { ...S.personal(), added: 0, date: j.date };
    }
    const p = S.personal(),
      store = structuredClone(p.store),
      dailySummary = policy.replace;
    const projectOf = require("./preferences.cjs").createProjectResolver(
      store.projects,
    );
    const protectedRecords = store.records.filter(
      (r) => r.removed || r.confirmed || r.manual || r.humanEdited,
    );
    const used = new Set(
      (dailySummary ? protectedRecords : store.records).flatMap(
        (r) => r.sourceIds || [],
      ),
    );
    const activeDrafts = dailySummary
      ? store.records.filter(
          (r) =>
            r.organizeJob !== j.id &&
            !r.supersededDraftBy &&
            !r.removed &&
            !r.confirmed &&
            !r.manual &&
            !r.humanEdited,
        )
      : [];
    const hidden = S.hiddenSourceIds();
    const excluded = new Set(S.list("excluded").map((s) => s.id));
    S.list("bindings");
    S.requireHealthy("stages", "excluded", "visibility", "bindings");
    for (const material of j.materials)
      if (excluded.has(material.id.split(":")[0])) hidden.add(material.id);
    const covered = new Set(
      j.result.entries
        .filter((e) => !e.sources.some((s) => used.has(s) || hidden.has(s)))
        .flatMap((e) => e.sources),
    );
    // A partial selection cannot replace half an existing outcome or duplicate it.
    const partial = new Set(
      activeDrafts
        .filter(
          (r) =>
            r.sourceIds?.some((s) => covered.has(s)) &&
            !r.sourceIds.every((s) => covered.has(s)),
        )
        .flatMap((r) => r.sourceIds),
    );
    const protectedAtApply = new Set(used);
    const accepted = new Set(),
      skippedSources = new Set();
    // Only original stage IDs, never personal text, determine existing-record grouping.
    const groupedSources = new Set();
    let grouped = 0;
    if (j.policy === "daily-work-v3") {
      const workSets = new Map();
      for (const e of j.result.entries) {
        const key = JSON.stringify([
          j.materials.find((m) => m.id === e.sources[0]).workspace || "",
          e.work.title,
        ]);
        const w = workSets.get(key) || { ...e.work, sources: [] };
        w.sources.push(...e.sources);
        workSets.set(key, w);
      }
      const assignments = { ...store.workAssignments };
      for (const r of store.records) {
        if (
          r.date !== j.date ||
          r.manual ||
          r.humanEdited ||
          r.removed ||
          r.progressHidden ||
          r.supersededDraftBy ||
          !r.sourceIds?.length
        )
          continue;
        const matches = [...workSets.values()].filter(
          (w) =>
            r.sourceIds.every((s) => w.sources.includes(s)) &&
            !w.sources.some((s) => hidden.has(s)),
        );
        if (matches.length !== 1) continue;
        assignments[r.id] = { ...matches[0], job: j.id };
        r.sourceIds.forEach((s) => groupedSources.add(s));
        grouped++;
      }
      store.workAssignments = assignments;
    }
    let added = 0;
    for (const entry of j.result.entries) {
      if (
        entry.sources.some(
          (s) => used.has(s) || hidden.has(s) || partial.has(s),
        )
      ) {
        entry.sources
          .filter((s) => !groupedSources.has(s))
          .forEach((s) => skippedSources.add(s));
        continue;
      }
      const workComplete =
        !entry.work ||
        j.result.entries
          .filter(
            (e) =>
              e.work?.title === entry.work.title &&
              j.materials.find((i) => i.id === e.sources[0])?.workspace ===
                j.materials.find((i) => i.id === entry.sources[0])?.workspace,
          )
          .every(
            (e) =>
              !e.sources.some(
                (s) =>
                  (protectedAtApply.has(s) && !groupedSources.has(s)) ||
                  hidden.has(s) ||
                  partial.has(s),
              ),
          );
      const refs = entry.sources.map((id) =>
        j.materials.find((i) => i.id === id),
      );
      const sourceLinks = entry.sources
        .map((id) => {
          const [stageId] = id.split(":");
          const stage =
            /^[a-f0-9]{64}$/.test(stageId) &&
            S.read(path.join(S.library(), "stages", stageId + ".json"), null);
          if (stage) return { id: stageId, ...stage.source };
          const material = refs.find((r) => r.id === id);
          return material?.coverage
            ? {
                id,
                session: material.coverage.session,
                turn: material.coverage.turn,
              }
            : null;
        })
        .filter(Boolean);
      const cwd = refs[0].workspace,
        info = cwd ? projectOf(cwd) : null,
        project = info?.id || "unassigned";
      if (cwd && !store.projects.some((p) => p.id === project))
        store.projects.push({
          id: project,
          name: info.name,
          workspace: cwd,
          subject: "",
          status: "",
          next: "",
        });
      const recordId =
        "ai-" +
        S.hash([
          ...(dailySummary ? [j.id] : []),
          ...entry.sources.slice().sort(),
        ]);
      if (store.records.some((r) => r.id === recordId)) {
        entry.sources.forEach((s) => accepted.add(s));
        continue;
      }
      store.records.push({
        id: recordId,
        date: j.date,
        project,
        title: entry.title,
        change: entry.summary,
        next: entry.next,
        kind: labels[refs[0].kind],
        confirmed: false,
        manual: false,
        ...(dailySummary ? { dailySummary: true, organizeJob: j.id } : {}),
        ...(entry.work && (workComplete || j.policy === "daily-work-v3")
          ? {
              work: {
                ...entry.work,
                summary: workComplete ? entry.work.summary : "",
                ...(j.policy === "daily-work-v3"
                  ? {
                      sources: j.result.entries
                        .filter(
                          (e) =>
                            e.work?.title === entry.work.title &&
                            j.materials.find((i) => i.id === e.sources[0])
                              ?.workspace === cwd,
                        )
                        .flatMap((e) => e.sources),
                    }
                  : {}),
              },
            }
          : {}),
        sourceIds: entry.sources,
        sourceLinks,
        sourceAt: refs
          .map((r) => r.sourceAt || "")
          .sort()
          .at(-1),
        relations: refs.flatMap((r) => r.relations),
        evidence: refs
          .map(
            (r) =>
              r.id +
              "\n" +
              r.title +
              "\n" +
              r.summary +
              "\n" +
              r.evidence.join("\n"),
          )
          .join("\n\n"),
      });
      entry.sources.forEach((s) => accepted.add(s));
      entry.sources.forEach((s) => used.add(s));
      added++;
    }
    let replaced = 0;
    for (const r of activeDrafts)
      if (r.sourceIds?.length && r.sourceIds.every((s) => accepted.has(s))) {
        r.supersededDraftBy = j.id;
        replaced++;
      }
    // Authority commit precedes job receipt. Reapplying after a crash is idempotent.
    store.records = store.records.map(({ progressHidden, ...r }) => r);
    S.savePersonalLocked(store, p.revision, p.libraryId);
    S.atomic(path.join(S.library(), "jobs", id + ".json"), {
      ...j,
      applied: true,
      added,
      replaced,
      grouped,
      skippedSources: [...skippedSources],
    });
    return { ...S.personal(), added, replaced, grouped, date: j.date };
  });
}
function cancel(id) {
  const j = readJob(id),
    file = path.join(S.library(), "jobs", id + ".json");
  if (!j || j.state !== "running") return;
  JobState.finish(file, {
    state: "cancelled",
    unprocessed: j.materials.map((i) => i.id),
  });
  running.get(id)?.kill();
}
function recover() {
  for (const j of S.list("jobs"))
    if (j.state === "running" && !running.has(j.id)) {
      // Another frontend may still own the task. A watcher handles its timeout.
      const pid = j.ownerPid || j.pid;
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
          continue;
        } catch (e) {
          if (e.code !== "ESRCH") continue;
        }
      }
      JobState.finish(path.join(S.library(), "jobs", j.id + ".json"), {
        state: "failed",
        error: "INTERRUPTED",
        unprocessed: j.materials.map((i) => i.id),
      });
    }
}
function shutdown() {
  for (const id of running.keys()) cancel(id);
}
module.exports = {
  history,
  preview,
  start,
  apply,
  cancel,
  recover,
  validateResult,
  shutdown,
  allowedActivity,
};
