const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-project-aliases-"));
process.env.JINJINGTAI_HOME = path.join(root, "home");
const S = require("../integration/store.cjs");
const P = require("../integration/preferences.cjs");
const { validPersonal } = require("../integration/personal-schema.cjs");
const library = path.join(root, "library");
fs.mkdirSync(library, { recursive: true });
S.atomic(path.join(library, "personal.json"), {
  revision: 0,
  store: S.empty(),
});
S.atomic(path.join(S.HOME, "library-location.json"), { library });
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const parent = path.join(root, "work");
const child = path.join(parent, "jinjingtai");
fs.mkdirSync(child, { recursive: true });
const target = {
  ...P.project(child),
  subject: "",
  status: "",
  next: "",
  workspaceAliases: [parent],
};

test("合并后的旧目录只映射精确归属，保留来源路径，不吞并兄弟或子目录项目", () => {
  const before = structuredClone(target);
  const resolve = P.createProjectResolver([target]);
  assert.equal(resolve(parent).id, target.id);
  assert.equal(resolve(child).id, target.id);
  assert.equal(resolve(parent).workspace, S.workspace(parent));
  assert.notEqual(resolve(path.join(parent, "restaurant")).id, target.id);
  assert.notEqual(resolve(path.join(parent, "another")).id, target.id);
  assert.deepEqual(target, before);
  if (process.platform === "win32")
    assert.equal(resolve(parent.toUpperCase()).id, target.id);
});

test("归属设置可往返保存，不更改授权范围；错误或重复归属明确拒绝", () => {
  const personal = S.personal();
  const saved = S.savePersonal(
    { ...personal.store, projects: [...personal.store.projects, target] },
    personal.revision,
    personal.libraryId,
  );
  assert.deepEqual(saved.store.projects.at(-1).workspaceAliases, [parent]);
  assert.deepEqual(S.config().roots, []);
  assert.throws(() => S.authorize(parent), /NOT_AUTHORIZED/);
  assert.throws(
    () => P.createProjectResolver([target, { ...target, id: "another" }]),
    /PROJECT_ALIAS_CONFLICT/,
  );
  assert.throws(
    () =>
      P.createProjectResolver([
        target,
        { ...P.project(parent), subject: "", status: "", next: "" },
      ]),
    /PROJECT_ALIAS_CONFLICT/,
  );
  assert.throws(() =>
    P.createProjectResolver([{ ...target, workspaceAliases: ["relative"] }]),
  );
  assert.equal(
    validPersonal({
      revision: 0,
      store: {
        ...S.empty(),
        projects: [{ ...target, workspaceAliases: "bad" }],
      },
    }),
    false,
  );
});
