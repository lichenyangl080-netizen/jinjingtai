const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { migrate, snapshot } = require("../scripts/migrate-state-home.cjs");
test("迁移完整权威资料，保留原库、正文/确认/移除/附件及现有Hook信任", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-home-migration-")),
    sourceHome = path.join(root, "package-home"),
    sourceLibrary = path.join(sourceHome, "data"),
    home = path.join(root, "stable"),
    release = path.join(root, "release"),
    codexHome = path.join(root, "codex");
  for (const dir of [
    sourceLibrary,
    release,
    codexHome,
    path.join(sourceHome, "runtime"),
    path.join(sourceLibrary, "attachments"),
  ])
    fs.mkdirSync(dir, { recursive: true });
  const authority = {
    revision: 7,
    store: {
      version: 1,
      projects: [{ id: "p", name: "项目" }],
      records: [
        {
          id: "r",
          confirmed: true,
          humanEdited: true,
          removed: true,
          change: "人工修改",
          attachments: [{ id: "a" }],
        },
      ],
      notes: { "2026-10-05": { lesson: "手写回顾" } },
      workAssignments: { r: { title: "完整的一件事" } },
    },
  };
  fs.writeFileSync(
    path.join(sourceLibrary, "personal.json"),
    JSON.stringify(authority),
  );
  fs.writeFileSync(path.join(sourceLibrary, "attachments", "a"), "attachment");
  fs.writeFileSync(
    path.join(sourceLibrary, "attachments", "original.tmp"),
    "user attachment with a temporary extension",
  );
  fs.writeFileSync(
    path.join(sourceLibrary, "attachments", "index.sqlite"),
    "user attachment, not the root index",
  );
  fs.writeFileSync(
    path.join(sourceHome, "connection.json"),
    JSON.stringify({
      version: 1,
      enabled: true,
      scopeMode: "selected",
      roots: [root],
      library: sourceLibrary,
      codexHome,
    }),
  );
  fs.writeFileSync(path.join(sourceHome, "gate.key"), Buffer.alloc(32, 7));
  fs.writeFileSync(path.join(sourceHome, "runtime", "node.exe"), "fixture");
  const trusted =
    '[hooks.state."real-hook"]\ntrusted_hash="actual-user-trust"\n';
  fs.writeFileSync(path.join(codexHome, "config.toml"), trusted);
  fs.writeFileSync(path.join(codexHome, "hooks.json"), "{}");
  const input = {
      sourceHome,
      sourceLibrary,
      home,
      release,
      legacyHome: path.join(root, "alias"),
    },
    before = snapshot(sourceLibrary),
    report = migrate(input);
  assert.equal(report.records, 1);
  assert(report.transportUnchanged);
  assert.deepEqual(snapshot(sourceLibrary), before);
  assert.deepEqual(snapshot(path.join(home, "library")), before);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(home, "library", "personal.json"))),
    authority,
  );
  assert.equal(
    fs.readFileSync(path.join(codexHome, "config.toml"), "utf8"),
    trusted,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(release, "state-location.json"))).home,
    home,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(sourceHome, "connection.json")))
      .library,
    path.join(home, "library"),
  );
  assert(!fs.existsSync(path.join(sourceLibrary, ".write-lock")));
  assert.deepEqual(migrate(input), report);
});
