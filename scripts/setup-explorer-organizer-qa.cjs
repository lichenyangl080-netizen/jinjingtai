const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
process.env.JINJINGTAI_HOME = "E:\\ApplicationData\\Jinjingtai";
const real = require("../integration/store.cjs"),
  hidden = real.hiddenSourceIds();
const source = real
  .list("stages")
  .filter(
    (s) =>
      s.date === real.day() &&
      s.outcome === "change" &&
      real.bound(s) &&
      s.items.every((i, n) => !hidden.has(s.id + ":" + n)),
  )
  .sort(
    (a, b) => JSON.stringify(a.items).length - JSON.stringify(b.items).length,
  )[0];
if (!source) throw Error("NO_AUTHORIZED_PROGRESS_MATERIAL");
real.authorize(source.source.cwd);
const home = path.resolve(
    __dirname,
    "../qa/explorer-organizer-" + crypto.randomUUID(),
  ),
  library = path.join(home, "library");
fs.mkdirSync(path.join(library, "stages"), { recursive: true });
fs.mkdirSync(path.join(library, "bindings"), { recursive: true });
const {
  legacyConfigFiles,
  legacyRuntimes,
  stateHome,
  globalEnabledAt,
  ...original
} = real.config();
fs.writeFileSync(
  path.join(home, "connection.json"),
  JSON.stringify({
    ...original,
    library,
    scopeMode: "selected",
    roots: [source.source.cwd],
    legacyDataRoots: [real.HOME, ...(original.legacyDataRoots || [])],
  }),
);
fs.writeFileSync(
  path.join(library, "personal.json"),
  JSON.stringify({ revision: 0, store: real.empty() }),
);
fs.writeFileSync(
  path.join(library, "stages", source.id + ".json"),
  JSON.stringify(source),
);
for (const binding of real
  .list("bindings")
  .filter((b) => b.stage === source.id))
  fs.writeFileSync(
    path.join(library, "bindings", source.id + ".json"),
    JSON.stringify(binding),
  );
console.log(
  JSON.stringify({
    home,
    library,
    date: source.date,
    source: source.id,
    stageCharacters: JSON.stringify(source.items).length,
    containsPersonalText: false,
  }),
);
