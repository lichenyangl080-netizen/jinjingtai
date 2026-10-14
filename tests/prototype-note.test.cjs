const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-prototype-note-"));
process.env.JINJINGTAI_HOME = path.join(root, "home");
const S = require("../integration/store.cjs"),
  M = require("../integration/migration.cjs");
S.atomic(path.join(S.HOME, "connection.json"), {
  version: 1,
  enabled: true,
  library: path.join(root, "library"),
  roots: [],
});
test("确认样例回顾的元数据不使原型示例变成人工正文，也不增修订号", () => {
  const sample = {
      version: 1,
      records: [],
      projects: [],
      notes: { "2026-10-04": { lesson: "示例感想", tomorrow: "示例下一步" } },
    },
    legacy = {
      ...sample,
      notes: {
        "2026-10-04": {
          ...sample.notes["2026-10-04"],
          reviewed: true,
          confirmed: { ...sample.notes["2026-10-04"] },
        },
      },
    };
  assert.equal(
    M.migrate(legacy, sample, path.join(root, "profile")).revision,
    0,
  );
  assert.deepEqual(S.personal().store.notes, {});
  const edited = {
    ...legacy,
    notes: {
      "2026-10-04": {
        ...legacy.notes["2026-10-04"],
        lesson: "我的真实手写回顾",
      },
    },
  };
  M.migrate(edited, sample, path.join(root, "second-profile"));
  assert.equal(
    S.personal().store.notes["2026-10-04"].lesson,
    "我的真实手写回顾",
  );
});
