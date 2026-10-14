const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { protectContents } = require("../electron/window-security.cjs");

test("本地与外部文档导航、子框架、重定向不能继承桌面接口", () => {
  const contents = new EventEmitter();
  let open, request, check;
  contents.setWindowOpenHandler = (fn) => {
    open = fn;
  };
  contents.session = {
    setPermissionRequestHandler(fn) {
      request = fn;
    },
    setPermissionCheckHandler(fn) {
      check = fn;
    },
  };
  protectContents(contents);
  for (const name of [
    "will-navigate",
    "will-frame-navigate",
    "will-redirect",
    "will-attach-webview",
  ]) {
    for (const url of [
      "file:///C:/untrusted.html",
      "https://example.test",
      "data:text/html,untrusted",
    ]) {
      let prevented = false;
      contents.emit(
        name,
        {
          url,
          preventDefault() {
            prevented = true;
          },
        },
        url,
      );
      assert.equal(prevented, true, `${name}: ${url}`);
    }
  }
  assert.deepEqual(open({ url: "file:///C:/untrusted.html" }), {
    action: "deny",
  });
  let granted;
  request(contents, "media", (value) => {
    granted = value;
  });
  assert.equal(granted, false);
  assert.equal(check(contents, "media", "file://", {}), false);
});
