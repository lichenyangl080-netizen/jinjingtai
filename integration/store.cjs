const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const WorkspacePath = require("./workspace-path.cjs");
const {
  validPersonal,
  projectPersonal,
  mergeIsolated,
} = require("./personal-schema.cjs");
const { validMetadata } = require("./metadata-schema.cjs");
const HOME =
  process.env.JINJINGTAI_HOME ||
  path.join(process.env.LOCALAPPDATA || os.homedir(), "Jinjingtai");
let lockedLibrary;
let connectionScope;
const stable = (value) =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, stable(value[k])]),
        )
      : value;
const hash = (value) =>
  crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(stable(value)))
    .digest("hex");
function read(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
}
function atomic(file, data, exclusive = false) {
  if (path.resolve(file) === path.resolve(HOME, "connection.json"))
    return writeConnection(data, exclusive);
  return writeJson(file, data, exclusive);
}
function writeJson(file, data, exclusive = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + "." + crypto.randomUUID() + ".tmp";
  const fd = fs.openSync(tmp, "wx");
  try {
    fs.writeFileSync(fd, JSON.stringify(data, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (exclusive) {
    try {
      fs.linkSync(tmp, file);
    } finally {
      fs.unlinkSync(tmp);
    }
  } else {
    // Windows readers can briefly deny replacement even after the temp file is
    // fully synced. Retry the atomic rename only; never unlink live authority.
    for (let retry = 0; ; retry++) {
      try {
        fs.renameSync(tmp, file);
        break;
      } catch (error) {
        if (
          process.platform !== "win32" ||
          !["EPERM", "EACCES", "EBUSY"].includes(error.code) ||
          retry >= 5
        )
          throw error;
        Atomics.wait(
          new Int32Array(new SharedArrayBuffer(4)),
          0,
          0,
          10 * 2 ** retry,
        );
      }
    }
  }
}
function connectionFiles(...configs) {
  const primary = path.resolve(HOME, "connection.json");
  return [
    ...new Set([
      primary,
      ...configs.flatMap((c) =>
        (Array.isArray(c?.legacyConfigFiles) ? c.legacyConfigFiles : [])
          .filter((file) => typeof file === "string" && path.isAbsolute(file))
          .map((file) => path.resolve(file)),
      ),
    ]),
  ];
}
function connectionTransaction(files, operation, ...configs) {
  const targets = [
    ...new Set([
      ...files.map((file) => path.resolve(file)),
      ...connectionFiles(
        read(path.join(HOME, "connection.json"), null),
        ...configs,
      ),
    ]),
  ];
  if (connectionScope) {
    if (targets.some((file) => !connectionScope.has(file)))
      throw Error("CONNECTION_TRANSACTION_SCOPE_MISMATCH");
    return operation();
  }
  return require("./file-transaction.cjs").run(
    path.join(HOME, "internal", "connection-transaction.json"),
    targets,
    () => {
      connectionScope = new Set(targets);
      try {
        return operation();
      } finally {
        connectionScope = undefined;
        lastConfig = undefined;
      }
    },
  );
}
function writeConnection(data, exclusive) {
  const targets = connectionFiles(data);
  const write = () => {
    if (targets.some((file) => !connectionScope.has(file)))
      throw Error("CONNECTION_TRANSACTION_SCOPE_MISMATCH");
    prepareConfiguredLibrary(data);
    // Legacy MCP processes stay synchronized, and every affected file belongs
    // to this transaction's byte snapshot before the first replacement.
    targets.forEach((file, index) =>
      writeJson(file, data, index === 0 && exclusive),
    );
  };
  if (connectionScope) return write();
  return connectionTransaction([], write, data);
}
let lastConfig;
function validLocation(value) {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.library === "string" &&
    path.isAbsolute(value.library)
  );
}
function validConfig(value) {
  return (
    validLocation(value) &&
    typeof value.enabled === "boolean" &&
    (value.roots === undefined ||
      (Array.isArray(value.roots) &&
        value.roots.every((r) => typeof r === "string" && path.isAbsolute(r))))
  );
}
function config() {
  const fallback = {
    version: 1,
    enabled: false,
    roots: [],
    library: path.join(HOME, "library"),
  };
  let c,
    error = "CONNECTION_CONFIG_MISSING";
  try {
    const file = path.join(HOME, "connection.json");
    c = read(file, null);
    if (c !== null || fs.existsSync(file)) {
      if (!validConfig(c)) {
        c = null;
        error = "CONNECTION_CONFIG_INVALID";
      }
    }
  } catch {
    error = "CONNECTION_CONFIG_UNREADABLE";
  }
  if (c) {
    lastConfig = { ...c, roots: c.roots || [] };
    return lastConfig;
  }
  // A missing connection must not enable capture or silently select an empty library.
  // The location contains no authorization or credentials; it is only for local reading.
  let location = lastConfig;
  if (!location) {
    const file = path.join(HOME, "library-location.json");
    try {
      location = read(file, null);
    } catch {
      throw Error("LIBRARY_LOCATION_UNREADABLE");
    }
    if (location !== null || fs.existsSync(file)) {
      if (!validLocation(location)) throw Error("LIBRARY_LOCATION_INVALID");
    }
  }
  if (location?.library)
    return { ...fallback, library: location.library, connectionError: error };
  if (error !== "CONNECTION_CONFIG_MISSING") throw Error(error);
  const receipts = path.join(HOME, "libraries");
  if (
    fs.existsSync(receipts) &&
    fs.readdirSync(receipts).some((file) => file.endsWith(".json"))
  )
    throw Error("LIBRARY_LOCATION_MISSING");
  return { ...fallback, connectionError: error };
}
function canonical(p) {
  let real = fs.realpathSync.native(WorkspacePath.absolute(p));
  if (real.startsWith("\\\\?\\")) {
    real = real.slice(4);
    if (real.startsWith("UNC\\")) real = "\\\\" + real.slice(4);
  }
  return WorkspacePath.normalized(real);
}
function within(p, root) {
  return WorkspacePath.contains(p, root);
}
function workspace(cwd) {
  let current;
  try {
    current = canonical(cwd);
  } catch {
    return WorkspacePath.normalized(cwd);
  }
  for (let dir = current; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    if (path.dirname(dir) === dir) break;
  }
  return current;
}
function authorize(cwd) {
  const c = config();
  if (!c.enabled || typeof cwd !== "string") throw Error("NOT_AUTHORIZED");
  const real = canonical(cwd);
  for (let dir = real; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".jinjingtai-backup")))
      throw Error("INTERNAL_TASK");
    if (path.dirname(dir) === dir) break;
  }
  const organizer = path.join(os.tmpdir(), "Jinjingtai-organizer");
  const internal = [
    c.library,
    HOME,
    c.codexHome,
    organizer,
    ...(c.legacyDataRoots || []),
  ].filter((p) => p && fs.existsSync(p));
  if (internal.some((p) => within(real, canonical(p))))
    throw Error("INTERNAL_TASK");
  if (
    c.scopeMode !== "all-workspaces" &&
    !c.roots.some((root) => within(real, canonical(root)))
  )
    throw Error("OUTSIDE_SCOPE");
  return real;
}
function libraryDirectory(p) {
  try {
    if (!fs.statSync(p).isDirectory()) throw Error("LIBRARY_DIRECTORY_INVALID");
  } catch (e) {
    if (e.message === "LIBRARY_DIRECTORY_INVALID") throw e;
    throw Error(
      e.code === "ENOENT"
        ? "LIBRARY_DIRECTORY_MISSING"
        : "LIBRARY_DIRECTORY_UNREADABLE",
    );
  }
}
function readPersonal(p) {
  let value;
  try {
    value = read(path.join(p, "personal.json"), null);
  } catch {
    throw Error("PERSONAL_DATA_UNREADABLE");
  }
  if (value === null) throw Error("PERSONAL_DATA_MISSING");
  return projectPersonal(value);
}
function receiptFile(p) {
  return path.join(
    HOME,
    "libraries",
    hash(path.resolve(p).toLowerCase()) + ".json",
  );
}
function prepareConfiguredLibrary(data) {
  if (!validConfig(data)) throw Error("CONNECTION_CONFIG_INVALID");
  // Connection setup and local selection share the same writable boundary.
  let ancestor = path.resolve(data.library);
  while (!fs.existsSync(ancestor) && path.dirname(ancestor) !== ancestor)
    ancestor = path.dirname(ancestor);
  for (let dir = canonical(ancestor); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".jinjingtai-backup")))
      throw Error("BACKUP_LIBRARY_READ_ONLY");
    if (path.dirname(dir) === dir) break;
  }
  const p = data.library,
    receipt = receiptFile(p);
  let previous;
  try {
    previous = read(path.join(HOME, "connection.json"), null);
  } catch {}
  let pointer;
  try {
    pointer = read(path.join(HOME, "library-location.json"), null);
  } catch {}
  const same = (value) =>
    validLocation(value) &&
    path.resolve(value.library).toLowerCase() === path.resolve(p).toLowerCase();
  const known = fs.existsSync(receipt) || same(previous) || same(pointer);
  if (!fs.existsSync(p)) {
    if (known) throw Error("LIBRARY_DIRECTORY_MISSING");
    fs.mkdirSync(p, { recursive: true });
  }
  libraryDirectory(p);
  if (fs.existsSync(path.join(p, "personal.json"))) readPersonal(p);
  else {
    const artifacts = [
      "stages",
      "jobs",
      "bindings",
      "events",
      "migration",
      "attachments",
      "visibility",
      "excluded",
      "index.sqlite",
      "index.sqlite-wal",
      "index.sqlite-shm",
    ];
    if (known || artifacts.some((name) => fs.existsSync(path.join(p, name))))
      throw Error("PERSONAL_DATA_MISSING");
    // Explicitly selecting a new library is the only place that creates empty
    // personal authority. Neither startup, load nor a failed read may do this.
    atomic(
      path.join(p, "personal.json"),
      { revision: 0, store: empty() },
      true,
    );
  }
  if (!fs.existsSync(receipt))
    atomic(
      receipt,
      {
        version: 1,
        library: path.resolve(p),
        personalInitialized: true,
        at: new Date().toISOString(),
      },
      true,
    );
}
function needsInitialization() {
  try {
    if (lastConfig) return false;
    if (
      ["connection.json", "library-location.json"].some((name) =>
        fs.existsSync(path.join(HOME, name)),
      )
    )
      return false;
    const receipts = path.join(HOME, "libraries");
    if (fs.existsSync(receipts) && fs.readdirSync(receipts).length)
      return false;
    const target = path.join(HOME, "library");
    return (
      !fs.existsSync(target) ||
      (fs.statSync(target).isDirectory() && fs.readdirSync(target).length === 0)
    );
  } catch {
    return false;
  }
}
function library() {
  if (lockedLibrary) return lockedLibrary;
  const c = config(),
    p = c.library;
  if (
    !fs.existsSync(p) &&
    c.connectionError === "CONNECTION_CONFIG_MISSING" &&
    !fs.existsSync(path.join(HOME, "library-location.json")) &&
    !fs.existsSync(receiptFile(p))
  )
    throw Error("LIBRARY_NOT_INITIALIZED");
  libraryDirectory(p);
  readPersonal(p);
  return p;
}
function selectLibrary(selected) {
  const target = canonical(selected);
  for (let dir = target; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".jinjingtai-backup")))
      throw Error("BACKUP_LIBRARY_READ_ONLY");
    if (path.dirname(dir) === dir) break;
  }
  const current = config();
  const connection = path.join(HOME, "connection.json");
  let active;
  try {
    active = read(connection, null);
  } catch {
    throw Error("CONNECTION_CONFIG_UNREADABLE");
  }
  if (active !== null && !validConfig(active))
    throw Error("CONNECTION_CONFIG_INVALID");
  const next = { ...current, library: target };
  prepareConfiguredLibrary(next);
  const pointer = path.join(HOME, "library-location.json");
  const files = [
    pointer,
    ...(active ? [connection, ...(active.legacyConfigFiles || [])] : []),
  ];
  connectionTransaction(files, () => {
    if (active) atomic(connection, { ...active, library: target });
    atomic(pointer, { version: 1, library: target });
  });
  lastConfig = undefined;
  listCache.clear();
  listErrors.clear();
  return { library: target };
}
function day(time = Date.now()) {
  return new Date(new Date(time).getTime() + 4 * 3600000)
    .toISOString()
    .slice(0, 10);
}
function planningLimit(date = day()) {
  const d = new Date(date + "T12:00:00Z"),
    n = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(
    Math.min(
      n,
      new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    ),
  );
  return d.toISOString().slice(0, 10);
}
function event(type, metadata = {}) {
  // Never persist arbitrary hook input, model body, prompt, command or error message.
  const data = { version: 1, type, at: new Date().toISOString(), ...metadata };
  atomic(path.join(library(), "events", crypto.randomUUID() + ".json"), data);
  return data;
}
function diagnostic(name, data) {
  if (
    !/^(?:(?:desktop-start|desktop-loaded|mcp-start)-\d+|last-hook)\.json$/.test(
      name,
    )
  )
    throw Error("INVALID_DIAGNOSTIC_NAME");
  atomic(path.join(HOME, "diagnostics", name), data);
  try {
    require("./retention.cjs").pruneDiagnostics(HOME);
  } catch {
    /* Retention cannot block recording or app startup. */
  }
}
const listCache = new Map();
const listErrors = new Map();
function requireHealthy(...folders) {
  if (folders.some((folder) => listErrors.get(folder)?.length))
    throw Error("LOCAL_METADATA_INVALID");
}
function list(folder) {
  const dir = path.join(library(), folder);
  listErrors.delete(folder);
  if (!fs.existsSync(dir)) {
    listCache.delete(dir);
    return [];
  }
  let cached = listCache.get(dir);
  if (!cached) {
    cached = new Map();
    listCache.set(dir, cached);
  }
  const names = fs.readdirSync(dir).filter((n) => n.endsWith(".json")),
    alive = new Set(names),
    values = [];
  for (const name of names) {
    try {
      const file = path.join(dir, name),
        stat = fs.statSync(file),
        key = [stat.size, stat.mtimeMs, stat.ctimeMs, stat.ino].join(":");
      let entry = cached.get(name);
      if (!entry || entry.key !== key) {
        entry = { key, value: read(file) };
        cached.set(name, entry);
      }
      if (!validMetadata(folder, entry.value, name))
        throw Error("INVALID_METADATA");
      values.push(entry.value);
    } catch (e) {
      // Preserve the original file; report metadata only, never its body.
      const errors = listErrors.get(folder) || [];
      errors.push({
        type: "error",
        code: "LOCAL_METADATA_INVALID",
        folder,
        file: name,
      });
      listErrors.set(folder, errors);
      cached.delete(name);
    }
  }
  for (const name of cached.keys()) if (!alive.has(name)) cached.delete(name);
  // Callers update jobs; never let a cached authority object be changed in memory.
  return structuredClone(
    values.sort((a, b) =>
      String(a.at || a.startedAt || "").localeCompare(
        String(b.at || b.startedAt || ""),
      ),
    ),
  );
}
function secret() {
  const file = path.join(HOME, "gate.key");
  fs.mkdirSync(HOME, { recursive: true });
  if (!fs.existsSync(file)) {
    const tmp = file + "." + crypto.randomUUID() + ".tmp",
      fd = fs.openSync(tmp, "wx", 0o600);
    try {
      fs.writeFileSync(fd, crypto.randomBytes(32));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    try {
      fs.linkSync(tmp, file);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    } finally {
      fs.unlinkSync(tmp);
    }
  }
  return fs.readFileSync(file);
}
function bodyOf(args) {
  const { _gate, ...body } = args;
  return body;
}
function sign(payload) {
  const text = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return (
    text +
    "." +
    crypto.createHmac("sha256", secret()).update(text).digest("hex")
  );
}
function issue(hook) {
  const cwd = authorize(hook.cwd);
  if (
    ![hook.session_id, hook.turn_id, hook.tool_use_id].every(
      (x) => typeof x === "string" && x.length > 0 && x.length < 200,
    )
  )
    throw Error("SOURCE_INCOMPLETE");
  return sign({
    cwd,
    session: hook.session_id,
    turn: hook.turn_id,
    call: hook.tool_use_id,
    digest: hash(bodyOf(hook.tool_input)),
    expires: Date.now() + 120000,
  });
}
function verify(args) {
  if (typeof args._gate !== "string") throw Error("GATE_REQUIRED");
  const [text, mac] = args._gate.split(".");
  const expected = crypto
    .createHmac("sha256", secret())
    .update(text || "")
    .digest("hex");
  if (
    !mac ||
    mac.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  )
    throw Error("GATE_INVALID");
  const grant = JSON.parse(Buffer.from(text, "base64url").toString());
  // Repeat realpath/allowlist check at receipt time; grants do not outlive revocation.
  if (
    grant.expires < Date.now() ||
    grant.digest !== hash(bodyOf(args)) ||
    authorize(grant.cwd) !== grant.cwd
  )
    throw Error("GATE_EXPIRED_OR_CHANGED");
  return grant;
}
const kinds = [
  "verified",
  "implementation",
  "attempt",
  "finding",
  "decision",
  "blocker",
  "proposal",
];
function validate(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Object.keys(body).some((k) => !["outcome", "items"].includes(k))
  )
    throw Error("UNKNOWN_RECORD_FIELD");
  if (
    !["change", "no_change"].includes(body.outcome) ||
    !Array.isArray(body.items) ||
    body.items.length > 12
  )
    throw Error("INVALID_RECORD");
  if (
    (body.outcome === "no_change" && body.items.length) ||
    (body.outcome === "change" && !body.items.length)
  )
    throw Error("INVALID_OUTCOME");
  if (JSON.stringify(body).length > 16000) throw Error("RECORD_TOO_LARGE");
  for (const i of body.items) {
    if (
      !i ||
      typeof i !== "object" ||
      Object.keys(i).some(
        (k) =>
          ![
            "kind",
            "title",
            "summary",
            "next",
            "acceptance",
            "evidence",
            "relations",
            "relevance",
          ].includes(k),
      )
    )
      throw Error("UNKNOWN_ITEM_FIELD");
    if (
      i.relevance !== undefined &&
      !["progress", "routine"].includes(i.relevance)
    )
      throw Error("INVALID_RELEVANCE");
    if (
      !kinds.includes(i.kind) ||
      typeof i.title !== "string" ||
      !i.title.trim() ||
      typeof i.summary !== "string" ||
      !i.summary.trim()
    )
      throw Error("INVALID_ITEM");
    if (
      i.kind === "verified" &&
      (!Array.isArray(i.evidence) || !i.evidence.length)
    )
      throw Error("VERIFICATION_EVIDENCE_REQUIRED");
    if (
      i.kind === "decision" &&
      i.acceptance !== "user_explicit" &&
      i.acceptance !== "implemented"
    )
      throw Error("DECISION_NOT_ADOPTED");
    if (
      (i.next !== undefined && typeof i.next !== "string") ||
      (i.evidence !== undefined &&
        (!Array.isArray(i.evidence) ||
          i.evidence.some((e) => typeof e !== "string"))) ||
      (i.acceptance !== undefined &&
        !["user_explicit", "implemented", "unaccepted"].includes(i.acceptance))
    )
      throw Error("INVALID_ITEM_FIELD");
    if (
      i.relations &&
      (!Array.isArray(i.relations) ||
        i.relations.some(
          (r) =>
            !["supplements", "negates", "supersedes"].includes(r.type) ||
            typeof r.target !== "string",
        ))
    )
      throw Error("INVALID_RELATION");
    for (const r of i.relations || []) {
      const match = /^([a-f0-9]{64}):(\d+)$/.exec(r.target),
        target =
          match &&
          read(path.join(library(), "stages", match[1] + ".json"), null);
      const archived =
        match &&
        personal().store.records.some((record) =>
          record.sourceIds?.includes(r.target),
        );
      if (!target) {
        if (!archived) throw Error("RELATION_TARGET_UNKNOWN");
        continue;
      }
      if (!bound(target) || !target.items[Number(match[2])])
        throw Error("RELATION_TARGET_UNKNOWN");
      authorize(target.source.cwd);
    }
  }
}
function submit(args, sourceProof, assessment) {
  const grant = verify(args);
  const body = bodyOf(args);
  validate(body);
  const id = hash([grant.session, grant.turn]);
  const file = path.join(library(), "stages", id + ".json");
  const prior = read(file, null);
  if (prior) {
    if (prior.digest !== hash(body)) throw Error("TURN_ALREADY_RECORDED");
    return {
      saved: true,
      duplicate: true,
      id,
      binding: bound(prior) ? "bound" : "pending",
    };
  }
  const record = {
    version: 1,
    id,
    date: day(),
    at: new Date().toISOString(),
    digest: hash(body),
    source: {
      cwd: grant.cwd,
      session: grant.session,
      turn: grant.turn,
      call: grant.call,
      ...(sourceProof
        ? { proof: sourceProof.proof, version: sourceProof.version }
        : {}),
    },
    ...(assessment ? { assessment } : {}),
    ...body,
  };
  // One immutable authority file = transaction commit; receipt is issued only after fsync+rename.
  try {
    atomic(file, record, true);
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    const committed = read(file);
    if (committed.digest !== record.digest)
      throw Error("TURN_ALREADY_RECORDED");
    return {
      saved: true,
      duplicate: true,
      id,
      binding: bound(committed) ? "bound" : "pending",
    };
  }
  return {
    saved: true,
    id,
    binding: bound(record) ? "bound" : "pending",
    source: record.source,
    characters: JSON.stringify(body).length,
  };
}
function bound(stage) {
  return (
    stage.source.proof === "codex-live-history" ||
    list("bindings").some(
      (b) =>
        b.stage === stage.id &&
        b.digest === stage.digest &&
        b.call === stage.source.call,
    )
  );
}
function bind(hook) {
  const g = verify(hook.tool_input);
  const id = hash([g.session, g.turn]);
  const stage = read(path.join(library(), "stages", id + ".json"), null);
  if (
    !stage ||
    g.digest !== stage.digest ||
    g.call !== hook.tool_use_id ||
    hook.session_id !== stage.source.session ||
    hook.turn_id !== stage.source.turn
  )
    throw Error("BINDING_MISMATCH");
  atomic(path.join(library(), "bindings", id + ".json"), {
    stage: id,
    digest: stage.digest,
    call: stage.source.call,
    observedCall: hook.tool_use_id,
    at: new Date().toISOString(),
    mode: "post-tool-hook",
  });
}
function withLock(fn) {
  return withLibraryLock(fn, canonical(library()));
}
function withLibraryLock(fn, target) {
  target = canonical(target);
  if (lockedLibrary === target) return fn();
  const dir = path.join(target, ".write-lock");
  const removeLock = () => {
    if (
      !within(canonical(dir), target) ||
      path.basename(canonical(dir)) !== ".write-lock"
    )
      throw Error("LOCK_PATH_UNSAFE");
    fs.rmSync(dir, { recursive: true });
  };
  try {
    fs.mkdirSync(dir);
    atomic(path.join(dir, "owner.json"), { pid: process.pid });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    const owner = read(path.join(dir, "owner.json"), null);
    let alive = true;
    if (owner) {
      try {
        process.kill(owner.pid, 0);
      } catch (err) {
        if (err.code === "ESRCH") alive = false;
      }
    }
    if (!owner && Date.now() - fs.statSync(dir).mtimeMs > 10000) alive = false;
    if (!alive) {
      removeLock();
      return withLibraryLock(fn, target);
    }
    throw Error("STORE_BUSY");
  }
  const previousLibrary = lockedLibrary;
  // Store mutations and organizer application are synchronous. Pin all their
  // library reads to the directory whose write lock is held until they return.
  lockedLibrary = target;
  try {
    return fn();
  } finally {
    lockedLibrary = previousLibrary;
    removeLock();
  }
}
const empty = () => ({
  version: 1,
  records: [],
  projects: [
    { id: "unassigned", name: "未归项目", subject: "", status: "", next: "" },
  ],
  notes: {},
});
// Visibility is a derived view; immutable source and human authority are retained.
function hiddenSourceIds() {
  const decisions = list("visibility"),
    shown = new Set(
      decisions.filter((v) => !v.hidden).flatMap((v) => v.sourceIds || []),
    );
  const hidden = new Set(
    decisions.filter((v) => v.hidden).flatMap((v) => v.sourceIds || []),
  );
  for (const s of list("stages"))
    for (const [n, i] of s.items.entries())
      if (
        !shown.has(s.id + ":" + n) &&
        (i.relevance === "routine" ||
          i.title.startsWith("[日常操作]") ||
          i.kind === "proposal")
      )
        hidden.add(s.id + ":" + n);
  return hidden;
}
function personal() {
  const target = canonical(library()),
    p = readPersonal(target),
    hidden = hiddenSourceIds();
  return {
    ...p,
    libraryId: hash(target),
    store: {
      ...p.store,
      records: p.store.records.map((r) => {
        const { progressHidden, ...authority } = r;
        return !r.manual &&
          !r.humanEdited &&
          r.sourceIds?.length &&
          r.sourceIds.every((id) => hidden.has(id))
          ? { ...authority, progressHidden: true }
          : authority;
      }),
    },
  };
}
function savePersonal(store, revision, expectedLibraryId) {
  return withLock(() => savePersonalLocked(store, revision, expectedLibraryId));
}
// Organizer application already owns the library lock. Keep every authority
// commit behind the same validation, revision and isolated-record rules.
function savePersonalLocked(store, revision, expectedLibraryId) {
  if (!lockedLibrary) throw Error("STORE_LOCK_REQUIRED");
  const p = personal();
  if (p.libraryId !== expectedLibraryId) throw Error("LIBRARY_CHANGED");
  if (p.revision !== revision) throw Error("REVISION_CONFLICT");
  if (!validPersonal({ revision, store })) throw Error("INVALID_STORE");
  if (store.plans !== undefined) {
    if (
      !store.plans ||
      typeof store.plans !== "object" ||
      Array.isArray(store.plans)
    )
      throw Error("INVALID_PLAN");
    for (const [date, text] of Object.entries(store.plans)) {
      if (typeof text !== "string" || text.length > 10000)
        throw Error("INVALID_PLAN");
      if (
        text !== p.store.plans?.[date] &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          date <= day() ||
          date > planningLimit() ||
          new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date)
      )
        throw Error("PLAN_DATE_OUT_OF_RANGE");
    }
  }
  const next = {
    revision: p.revision + 1,
    store: mergeIsolated(read(path.join(library(), "personal.json")), {
      ...store,
      records: store.records.map(({ progressHidden, ...r }) => r),
    }),
  };
  atomic(path.join(library(), "personal.json"), next);
  return personal();
}
function statusData() {
  const bindings = list("bindings"),
    isBound = (s) =>
      s.source.proof === "codex-live-history" ||
      bindings.some(
        (b) =>
          b.stage === s.id && b.digest === s.digest && b.call === s.source.call,
      );
  const stages = list("stages");
  const events = list("events");
  const scanned = require("./source.cjs").turns();
  const stageByTurn = new Map(
    stages.map((s) => [JSON.stringify([s.source.session, s.source.turn]), s]),
  );
  const endByTurn = new Map(
    events
      .filter((e) => ["stopped", "interrupted"].includes(e.type))
      .map((e) => [JSON.stringify([e.session, e.turn]), e]),
  );
  const starts = events.filter((e) => e.type === "started");
  for (const t of scanned)
    if (!starts.some((s) => s.session === t.session && s.turn === t.turn))
      starts.push({ ...t, type: "started" });
  const excluded = new Set(list("excluded").map((s) => s.id));
  const progressHidden = hiddenSourceIds();
  const personalData = personal();
  const hiddenSources = new Set([
    ...progressHidden,
    ...personalData.store.records
      .filter((r) => r.removed || r.humanEdited)
      .flatMap((r) => r.sourceIds || []),
  ]);
  return {
    config: config(),
    authorityIssues: personalData.authorityIssues,
    libraryHealth: {
      available: true,
      needsInitialization: false,
      libraryId: personalData.libraryId,
    },
    sourceHealth: require("./source.cjs").health(),
    metrics: {
      stageCharacters: stages.reduce(
        (n, s) =>
          n + JSON.stringify({ outcome: s.outcome, items: s.items }).length,
        0,
      ),
      acceptedStages: stages.length,
    },
    stages: stages
      .filter((s) => !excluded.has(s.id))
      .map((s) => ({
        id: s.id,
        date: s.date,
        outcome: s.outcome,
        at: s.at,
        cwd: s.source.cwd,
        routine:
          s.items.length > 0 &&
          s.items.every((i, n) => progressHidden.has(s.id + ":" + n)),
        session: s.source.session,
        turn: s.source.turn,
        items: s.items.map((i, n) => ({
          id: s.id + ":" + n,
          title: i.title,
          kind: i.kind,
          relevance: i.relevance,
          hidden: progressHidden.has(s.id + ":" + n),
        })),
        binding: isBound(s) ? "bound" : "pending",
      })),
    turns: starts.map((s) => {
      const key = JSON.stringify([s.session, s.turn]),
        stage = stageByTurn.get(key),
        end = endByTurn.get(key);
      return {
        ...s,
        state: stage
          ? stage.outcome === "no_change"
            ? "no_change"
            : isBound(stage)
              ? "recorded"
              : "pending"
          : end?.type === "interrupted" || s.status === "interrupted"
            ? "interrupted"
            : end || s.completed
              ? "missing"
              : Date.now() - Date.parse(s.at) > 86400000
                ? "unfinished"
                : "working",
      };
    }),
    errors: events.filter((e) => e.type === "error").slice(-20),
    jobs: list("jobs").map((j) => ({
      id: j.id,
      date: j.date,
      state: j.state,
      error: j.error,
      model: j.model,
      reasoningEffort: j.reasoningEffort,
      startedAt: j.startedAt,
      requestChars: j.requestChars,
      readStats: j.readStats,
      usage: j.usage,
      unprocessed: j.unprocessed,
      mode: j.mode,
      applied: j.applied,
      saveBlocked:
        !j.applied &&
        j.state === "complete" &&
        !!personalData.authorityIssues?.length,
      added: j.added ?? j.result?.entries?.length,
      replaced: j.replaced,
      skippedSources: j.skippedSources,
      highlights: j.result?.highlights?.filter((h) =>
        h.sources.every(
          (id) => !hiddenSources.has(id) && !excluded.has(id.split(":")[0]),
        ),
      ),
    })),
  };
}
function status() {
  try {
    const result = statusData();
    const diagnostics = [...listErrors.values()].flat();
    diagnostics.push(
      ...(result.authorityIssues || []).map((i) => ({
        type: "error",
        code: i.code,
        folder: "personal.json",
        file: `record[${i.index}]`,
      })),
    );
    result.errors.push(...diagnostics);
    result.metadataHealth = {
      available: diagnostics.length === 0,
      errors: diagnostics,
    };
    return result;
  } catch (e) {
    const error = /^[A-Z_]+$/.test(e.message)
      ? e.message
      : "LOCAL_DATA_UNREADABLE";
    let c;
    try {
      c = config();
    } catch {
      c = {
        version: 1,
        enabled: false,
        roots: [],
        library: null,
        connectionError: error,
      };
    }
    return {
      config: c,
      libraryHealth: {
        needsInitialization: needsInitialization(),
        available: (() => {
          try {
            readPersonal(library());
            return true;
          } catch {
            return false;
          }
        })(),
        error,
      },
      sourceHealth: { available: false, error },
      metrics: { stageCharacters: null, acceptedStages: null },
      stages: [],
      turns: [],
      errors: [{ type: "error", code: error }],
      jobs: [],
    };
  }
}
function rebuildIndex() {
  const { DatabaseSync } = require("node:sqlite");
  const file = path.join(library(), "index.sqlite"),
    temp = file + "." + crypto.randomUUID() + ".tmp";
  const db = new DatabaseSync(temp);
  const p = personal();
  const stages = list("stages");
  requireHealthy("stages");
  try {
    db.exec(
      "CREATE TABLE stages(id TEXT PRIMARY KEY,date TEXT,outcome TEXT,binding TEXT);CREATE TABLE records(id TEXT PRIMARY KEY,date TEXT,project TEXT,confirmed INTEGER,removed INTEGER,payload TEXT);CREATE TABLE projects(id TEXT PRIMARY KEY,payload TEXT);CREATE TABLE notes(date TEXT PRIMARY KEY,payload TEXT);BEGIN",
    );
    const insert = db.prepare("INSERT INTO stages VALUES(?,?,?,?)");
    for (const s of stages)
      insert.run(s.id, s.date, s.outcome, bound(s) ? "bound" : "pending");
    const records = db.prepare("INSERT INTO records VALUES(?,?,?,?,?,?)");
    for (const r of p.store.records)
      records.run(
        r.id,
        r.date || null,
        r.project || null,
        Number(!!r.confirmed),
        Number(!!r.removed),
        JSON.stringify(r),
      );
    const projects = db.prepare("INSERT INTO projects VALUES(?,?)");
    for (const project of p.store.projects)
      projects.run(project.id, JSON.stringify(project));
    const notes = db.prepare("INSERT INTO notes VALUES(?,?)");
    for (const [date, note] of Object.entries(p.store.notes))
      notes.run(date, JSON.stringify(note));
    db.exec("CREATE TABLE plans(date TEXT PRIMARY KEY,text TEXT)");
    const plans = db.prepare("INSERT INTO plans VALUES(?,?)");
    for (const [date, text] of Object.entries(p.store.plans || {}))
      plans.run(date, text);
    db.exec("COMMIT");
  } finally {
    db.close();
  }
  fs.renameSync(temp, file);
  return {
    rebuilt: true,
    count: stages.length,
    records: p.store.records.length,
    revision: p.revision,
  };
}
module.exports = {
  needsInitialization,
  HOME,
  hash,
  read,
  atomic,
  connectionFiles,
  connectionTransaction,
  config,
  canonical,
  within,
  authorize,
  library,
  day,
  event,
  diagnostic,
  list,
  requireHealthy,
  selectLibrary,
  issue,
  verify,
  bodyOf,
  submit,
  bound,
  bind,
  withLock,
  withLibraryLock,
  personal,
  savePersonal,
  savePersonalLocked,
  empty,
  status,
  rebuildIndex,
  kinds,
  hiddenSourceIds,
  workspace,
};
