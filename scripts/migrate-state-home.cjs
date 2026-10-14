// Keep the existing trusted Codex transport. Move authority outside MSIX AppData.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const digest = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + "." + crypto.randomUUID() + ".tmp";
  const fd = fs.openSync(temp, "wx");
  try {
    fs.writeFileSync(fd, JSON.stringify(data, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, file);
}
function snapshot(dir) {
  const result = {};
  function walk(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (
        (folder === dir &&
          (entry.name === ".write-lock" ||
            entry.name.startsWith("index.sqlite"))) ||
        /\.[a-f0-9-]{36}\.tmp$/i.test(entry.name)
      )
        continue;
      const file = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) throw Error("MIGRATION_SYMLINK_REFUSED");
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) result[path.relative(dir, file)] = digest(file);
    }
  }
  walk(dir);
  return result;
}
function migrate({ sourceHome, sourceLibrary, home, release, legacyHome }) {
  for (const item of [sourceHome, sourceLibrary, home, release, legacyHome])
    if (!path.isAbsolute(item)) throw Error("ABSOLUTE_PATH_REQUIRED");
  if (
    home.toLowerCase() === sourceHome.toLowerCase() ||
    home.toLowerCase().startsWith(sourceHome.toLowerCase() + path.sep)
  )
    throw Error("MIGRATION_TARGET_UNSAFE");
  const authority = JSON.parse(
    fs.readFileSync(path.join(sourceLibrary, "personal.json"), "utf8"),
  );
  if (
    !Array.isArray(authority.store?.records) ||
    !Number.isInteger(authority.revision)
  )
    throw Error("SOURCE_AUTHORITY_INVALID");
  const manifestFile = path.join(home, "migration-complete.json"),
    incomplete = path.join(home, "migration-incomplete.json"),
    library = path.join(home, "library");
  if (fs.existsSync(manifestFile))
    return JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const personalHash = digest(path.join(sourceLibrary, "personal.json"));
  if (fs.existsSync(home) && !fs.existsSync(incomplete))
    throw Error("TARGET_ALREADY_EXISTS");
  if (
    fs.existsSync(path.join(library, "personal.json")) &&
    digest(path.join(library, "personal.json")) !== personalHash
  )
    throw Error("TARGET_AUTHORITY_CHANGED");
  const config = JSON.parse(
    fs.readFileSync(path.join(sourceHome, "connection.json"), "utf8"),
  );
  const codexConfig = path.join(config.codexHome, "config.toml"),
    hooks = path.join(config.codexHome, "hooks.json");
  const before = { config: digest(codexConfig), hooks: digest(hooks) };
  fs.mkdirSync(home, { recursive: true });
  write(incomplete, {
    version: 1,
    sourceHome,
    sourceLibrary,
    home,
    library,
    personalHash,
    startedAt: new Date().toISOString(),
  });
  const backup = path.join(home, "backups", "state-home-migration");
  fs.mkdirSync(backup, { recursive: true });
  for (const file of ["connection.json", "library-location.json"])
    if (
      fs.existsSync(path.join(sourceHome, file)) &&
      !fs.existsSync(path.join(backup, file))
    )
      fs.copyFileSync(path.join(sourceHome, file), path.join(backup, file));
  for (const file of [codexConfig, hooks])
    if (!fs.existsSync(path.join(backup, path.basename(file))))
      fs.copyFileSync(file, path.join(backup, path.basename(file)));
  const locator = path.join(release, "state-location.json");
  if (
    fs.existsSync(locator) &&
    !fs.existsSync(path.join(backup, "state-location.json"))
  )
    fs.copyFileSync(locator, path.join(backup, "state-location.json"));
  // Same on-disk lock as submit/save, but its cleanup stays bound to the source
  // even after the configuration starts referring to the destination.
  const lock = path.resolve(sourceLibrary, ".write-lock");
  if (
    path.dirname(lock) !== path.resolve(sourceLibrary) ||
    path.basename(lock) !== ".write-lock"
  )
    throw Error("LOCK_PATH_UNSAFE");
  try {
    fs.mkdirSync(lock);
  } catch (e) {
    throw Error(e.code === "EEXIST" ? "STORE_BUSY" : "LOCK_FAILED");
  }
  write(path.join(lock, "owner.json"), { pid: process.pid });
  try {
    const files = snapshot(sourceLibrary);
    fs.mkdirSync(library, { recursive: true });
    for (const [relative, hash] of Object.entries(files)) {
      const destination = path.join(library, relative);
      if (fs.existsSync(destination) && digest(destination) !== hash)
        throw Error("TARGET_FILE_CHANGED");
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(sourceLibrary, relative), destination);
    }
    if (JSON.stringify(snapshot(library)) !== JSON.stringify(files))
      throw Error("COPY_VERIFICATION_FAILED");
    for (const name of ["runtime", "internal", "migrations"])
      if (fs.existsSync(path.join(sourceHome, name)))
        fs.cpSync(path.join(sourceHome, name), path.join(home, name), {
          recursive: true,
        });
    fs.copyFileSync(
      path.join(sourceHome, "gate.key"),
      path.join(home, "gate.key"),
    );
    const next = {
      ...config,
      library,
      runtimeNode: path.join(home, "runtime", "node.exe"),
      legacyConfigFiles: [
        path.join(sourceHome, "connection.json"),
        path.join(home, "connection.json"),
      ],
      legacyRuntimes: [
        path.join(legacyHome, "runtime"),
        path.join(sourceHome, "runtime"),
      ],
      legacyDataRoots: [sourceHome, legacyHome],
      stateHome: home,
    };
    // The MCP/Hook commands and their trust hashes remain byte-for-byte unchanged.
    write(path.join(home, "connection.json"), next);
    write(path.join(home, "library-location.json"), { library });
    write(path.join(sourceHome, "connection.json"), next);
    write(path.join(sourceHome, "library-location.json"), { library });
    const copied = JSON.parse(
      fs.readFileSync(path.join(library, "personal.json"), "utf8"),
    );
    if (
      JSON.stringify(copied) !== JSON.stringify(authority) ||
      !fs
        .readFileSync(path.join(home, "gate.key"))
        .equals(fs.readFileSync(path.join(sourceHome, "gate.key")))
    )
      throw Error("AUTHORITY_VERIFICATION_FAILED");
    if (digest(codexConfig) !== before.config || digest(hooks) !== before.hooks)
      throw Error("TRANSPORT_CONFIG_CHANGED");
    write(locator, { home });
    const manifest = {
      version: 1,
      sourceHome,
      sourceLibrary,
      home,
      library,
      backup,
      personalHash,
      files,
      records: copied.store.records.length,
      revision: copied.revision,
      confirmed: copied.store.records.filter((r) => r.confirmed).length,
      assignments: Object.keys(copied.store.workAssignments || {}).length,
      transportUnchanged: true,
      codexConfigHash: before.config,
      hooksHash: before.hooks,
      completedAt: new Date().toISOString(),
    };
    write(manifestFile, manifest);
    fs.renameSync(incomplete, path.join(home, "migration-operation.json"));
    return manifest;
  } finally {
    fs.rmSync(lock, { recursive: true });
  }
}
module.exports = { migrate, snapshot };
if (require.main === module) {
  try {
    const result = migrate(JSON.parse(process.argv[2]));
    console.log(
      JSON.stringify({
        home: result.home,
        library: result.library,
        records: result.records,
        revision: result.revision,
        files: Object.keys(result.files).length,
        transportUnchanged: result.transportUnchanged,
      }),
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
