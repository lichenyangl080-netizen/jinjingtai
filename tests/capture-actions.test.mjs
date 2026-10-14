import test from "node:test";
import assert from "node:assert/strict";
import { createCaptureActions } from "../src/capture-actions.ts";

function fixture() {
  const writes = [],
    published = [],
    notices = [];
  const current = {
    stages: [{ id: "stage", binding: "bound", routine: false }],
  };
  const response = {
    libraryId: "library-a",
    store: { records: [] },
    revision: 1,
  };
  let failWrite = false,
    changed = false;
  const actions = createCaptureActions({
    api(method, ...args) {
      if (method === "status") return current;
      if (method === "candidate") return { id: "stage" };
      writes.push([method, ...args]);
      if (failWrite) throw Error("WRITE_FAILED");
      return method === "visibility" ? response : true;
    },
    getLibraryId: () => "library-a",
    acceptStatus: () => !changed,
    publishStatus: (value) => published.push(["status", value]),
    publishPersonal: (value) => published.push(["personal", value]),
    publishCandidate: (value) => published.push(["candidate", value]),
    notify: (text) => notices.push(text),
  });
  return {
    actions,
    writes,
    published,
    notices,
    fail() {
      failWrite = true;
    },
    change() {
      changed = true;
    },
  };
}
test("候选与可见性写入携带库身份，只在成功后发布状态和关闭对话框", () => {
  const f = fixture();
  assert(f.actions.toggleStageVisibility("stage"));
  assert.deepEqual(f.writes, [["visibility", "stage", true, "library-a"]]);
  assert.deepEqual(
    f.published.map(([name]) => name),
    ["personal", "candidate", "status"],
  );
  assert(f.actions.reviewCandidate("stage", "discard"));
  assert.deepEqual(f.writes.at(-1), [
    "candidate-review",
    "stage",
    "discard",
    "library-a",
  ]);
  assert(f.actions.cancelJob("job"));
  assert.deepEqual(f.writes.at(-1), ["cancel", "job", "library-a"]);
});
test("写入失败不关闭候选、不发布成功状态；切库时不调用写入", () => {
  for (const method of [
    "toggleStageVisibility",
    "reviewCandidate",
    "cancelJob",
  ]) {
    const f = fixture();
    f.fail();
    assert.equal(f.actions[method]("stage", "accept"), false);
    assert.equal(f.published.length, 0);
    assert.equal(f.notices.length, 1);
    const changed = fixture();
    changed.change();
    assert.equal(changed.actions[method]("stage", "accept"), false);
    assert.equal(changed.writes.length, 0);
    assert.equal(changed.published.length, 0);
  }
});
