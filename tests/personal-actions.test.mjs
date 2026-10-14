import test from "node:test";
import assert from "node:assert/strict";
import { createPersonalActions } from "../src/personal-actions.ts";

test("恢复从最新资料生成变更，保留后来新增的记录；写入失败不通知成功", () => {
  let store = {
    records: [{ id: "a", date: "2026-10-11", removed: true }],
    projects: [],
  };
  const notifications = [];
  let writable = true;
  const actions = createPersonalActions({
    read: () => store,
    commit(next) {
      if (!writable) return false;
      store = next;
      return true;
    },
    notify: (text) => notifications.push(text),
    safely: (action) => action(),
  });
  store = {
    ...store,
    records: [...store.records, { id: "new", date: "2026-10-11" }],
  };
  writable = false;
  assert.equal(actions.restoreRecord("a"), false);
  assert.equal(store.records[0].removed, true);
  assert.equal(notifications.length, 0);
  writable = true;
  assert(actions.restoreDay("2026-10-11"));
  assert.equal(store.records[0].removed, false);
  assert.equal(store.records[1].id, "new");
  assert.equal(notifications.length, 1);
  assert.equal(actions.restoreRecord("missing"), false);
});
test("归档先经过未保存输入保护，真正执行时使用最新项目状态", () => {
  let pending,
    writes = 0;
  let store = { records: [], projects: [{ id: "p", archived: false }] };
  const actions = createPersonalActions({
    read: () => store,
    commit(next) {
      writes++;
      store = next;
      return true;
    },
    notify() {},
    safely: (action) => {
      pending = action;
    },
  });
  actions.toggleProjectArchive("p");
  assert.equal(writes, 0);
  store = { ...store, projects: [{ id: "p", archived: true }, { id: "new" }] };
  pending();
  assert.equal(writes, 1);
  assert.equal(store.projects[0].archived, false);
  assert.equal(store.projects[1].id, "new");
});
