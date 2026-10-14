import test from "node:test";
import assert from "node:assert/strict";
import {
  beginAttachmentRequest,
  appendAttachments,
} from "../src/attachment-session.ts";

const drawer = (id) => ({
  mode: "edit",
  editSession: id + "-session",
  original: id,
  record: { id, title: "original" },
});
const files = [{ id: "file", name: "synthetic.txt", size: 1 }];
test("附件回填保留等待期间的输入，仅接收同一编辑会话和资料库的结果", () => {
  const initial = drawer("a");
  const request = beginAttachmentRequest(initial, "library-a");
  const edited = { ...initial, record: { ...initial.record, title: "edited" } };
  const updated = appendAttachments(request, edited, "library-a", files);
  assert.equal(updated.record.title, "edited");
  assert.deepEqual(updated.record.attachments, files);
  const other = drawer("b");
  assert.equal(appendAttachments(request, other, "library-a", files), other);
});
test("关闭再打开同条记录、进入查看模式、切库均拒绝迟到附件", () => {
  for (const transition of ["reopen", "view", "library"]) {
    const initial = drawer("a");
    const request = beginAttachmentRequest(initial, "a");
    let current = initial,
      library = "a";
    if (transition === "reopen")
      current = { ...initial, editSession: "reopened" };
    if (transition === "view") current = { ...initial, mode: "view" };
    if (transition === "library") library = "b";
    assert.equal(appendAttachments(request, current, library, files), current);
  }
});
