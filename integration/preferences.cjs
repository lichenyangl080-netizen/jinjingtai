const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  S = require("./store.cjs");
const WorkspacePath = require("./workspace-path.cjs");
const OrganizerSettings = require("./organizer-settings.cjs");
const defaults = {
  ...OrganizerSettings.defaults,
  fontSize: 16,
  density: "comfortable",
  decoration: true,
  workspaceNames: {},
};
function load() {
  const saved = S.read(path.join(S.library(), "preferences.json"), {});
  return {
    ...defaults,
    ...saved,
    workspaceNames: saved.workspaceNames || {},
  };
}
function save(input, expectedLibraryId) {
  if (
    !input ||
    Object.keys(input).some((k) => !Object.keys(defaults).includes(k)) ||
    ![15, 16, 17].includes(input.fontSize) ||
    !["comfortable", "compact"].includes(input.density) ||
    typeof input.decoration !== "boolean" ||
    !input.workspaceNames ||
    typeof input.workspaceNames !== "object" ||
    Array.isArray(input.workspaceNames)
  )
    throw Error("INVALID_PREFERENCES");
  const organizer = OrganizerSettings.resolve(input);
  const names = {};
  for (const [cwd, name] of Object.entries(input.workspaceNames)) {
    if (typeof name !== "string" || !name.trim() || name.length > 60)
      throw Error("INVALID_PROJECT_NAME");
    let directory;
    try {
      directory = WorkspacePath.absolute(cwd);
    } catch {
      throw Error("INVALID_PROJECT_NAME");
    }
    // Persist absolute paths; legacy root identities belong to project IDs,
    // not preference keys that must survive the next save.
    names[WorkspacePath.normalized(S.workspace(directory))] = name.trim();
  }
  return S.withLock(() => {
    if (S.personal().libraryId !== expectedLibraryId)
      throw Error("LIBRARY_CHANGED");
    S.atomic(path.join(S.library(), "preferences.json"), {
      ...input,
      ...organizer,
      workspaceNames: names,
    });
    return load();
  });
}
// Snapshot and memoization live for one request, never across library switches
// or changes to preferences and filesystem aliases.
function createProjectResolver(projects = []) {
  const names = load().workspaceNames;
  const workspaces = new Map();
  const aliases = new Map();
  for (const project of projects) {
    for (const directory of project.workspaceAliases || []) {
      const identity = WorkspacePath.identity(
        S.workspace(WorkspacePath.absolute(directory)),
      );
      const directId = "workspace-" + S.hash(identity).slice(0, 16);
      if (projects.some((p) => p.id === directId && p.id !== project.id))
        throw Error("PROJECT_ALIAS_CONFLICT");
      if (aliases.has(identity) && aliases.get(identity).id !== project.id)
        throw Error("PROJECT_ALIAS_CONFLICT");
      aliases.set(identity, project);
    }
  }
  let legacyNames;
  const workspaceOf = (cwd) => {
    if (!workspaces.has(cwd)) workspaces.set(cwd, S.workspace(cwd));
    return workspaces.get(cwd);
  };
  function legacyName(identity) {
    if (!legacyNames) {
      legacyNames = new Map();
      for (const [directory, name] of Object.entries(names)) {
        if (!path.isAbsolute(directory)) continue;
        const key = WorkspacePath.identity(workspaceOf(directory));
        if (!legacyNames.has(key)) legacyNames.set(key, name);
      }
    }
    return legacyNames.get(identity);
  }
  return (cwd) => {
    const workspace = workspaceOf(cwd);
    const identity = WorkspacePath.identity(workspace);
    const owner = aliases.get(identity);
    if (owner) return { workspace, id: owner.id, name: owner.name };
    const info = {
      workspace,
      id: "workspace-" + S.hash(identity).slice(0, 16),
      name:
        names[workspace] ||
        names[identity] ||
        legacyName(identity) ||
        (WorkspacePath.rootWorkspace(workspace)
          ? "通用工作"
          : path.basename(workspace)),
    };
    const existing = projects.find((p) => p.id === info.id);
    return existing ? { ...info, name: existing.name } : info;
  };
}
function project(cwd, projects = []) {
  return createProjectResolver(projects)(cwd);
}
function pause(paused) {
  return S.connectionTransaction([], () => {
    const c = S.config();
    if (
      c.connectionError ||
      c.disconnected ||
      !c.instructionFiles?.length ||
      (!c.enabled && !c.paused)
    )
      throw Error("CONNECTION_NOT_INSTALLED");
    S.atomic(path.join(S.HOME, "connection.json"), {
      ...c,
      enabled: !paused,
      paused,
    });
    return S.config();
  });
}
function backup(destination) {
  const library = S.canonical(S.library()),
    root = S.canonical(destination);
  if (S.within(root, library) || S.within(root, S.canonical(S.HOME)))
    throw Error("BACKUP_DESTINATION_INSIDE_LIBRARY");
  const id =
      "进境台备份-" +
      new Date().toISOString().replace(/[:.]/g, "-") +
      "-" +
      crypto.randomUUID().slice(0, 8),
    pending = path.join(destination, id + ".incomplete"),
    complete = path.join(destination, id);
  fs.mkdirSync(pending);
  fs.writeFileSync(
    path.join(pending, ".jinjingtai-backup"),
    "internal local backup",
  );
  try {
    S.withLock(() => {
      fs.cpSync(S.library(), path.join(pending, "资料库"), {
        recursive: true,
        filter: (file) =>
          ![
            ".write-lock",
            "index.sqlite",
            "index.sqlite-wal",
            "index.sqlite-shm",
          ].includes(path.basename(file)) &&
          // Committed attachments can legitimately end in .tmp. Only our
          // UUID-suffixed write staging files are incomplete internal data.
          !/\.[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.tmp$/i.test(
            file,
          ),
      });
      const config = S.config();
      S.atomic(path.join(pending, "connection-description.json"), {
        library: config.library,
        scopeMode: config.scopeMode,
        roots: config.roots,
        at: new Date().toISOString(),
        authorizationRestored: false,
      });
      S.atomic(path.join(pending, "backup-complete.json"), {
        version: 1,
        at: new Date().toISOString(),
        includes: ["authority JSON", "attachments", "preferences"],
        credentials: false,
        index: "rebuildable",
        capture:
          "immutable stages copied; ongoing work after snapshot is not included",
      });
    });
    fs.renameSync(pending, complete);
    return { path: complete };
  } catch (e) {
    throw Error("BACKUP_FAILED");
  }
}
module.exports = { load, save, project, createProjectResolver, pause, backup };
if (require.main === module) {
  try {
    if (process.argv[2] !== "backup") throw Error("INVALID_ACTION");
    process.stdout.write(JSON.stringify(backup(process.argv[3])));
  } catch (e) {
    process.stderr.write(
      /^[A-Z_]+$/.test(e.message) ? e.message : "BACKUP_FAILED",
    );
    process.exitCode = 1;
  }
}
