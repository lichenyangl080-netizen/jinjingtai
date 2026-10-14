const assert = require("node:assert/strict");
exports.run = async (win, errors) => {
  const js = (s) => win.webContents.executeJavaScript(s);
  await new Promise((r) => setTimeout(r, 400));
  for (const page of ["今日", "日历", "项目", "回望", "设置"]) {
    await js(
      `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='${page}').click()`,
    );
    await new Promise((r) => setTimeout(r, 100));
    assert(await js("document.documentElement.scrollWidth<=innerWidth"));
    assert(
      await js(
        "!document.querySelector('.day-footer')&&!document.querySelector('.draft-label')",
      ),
    );
  }
  assert.equal(errors.length, 0);
};
