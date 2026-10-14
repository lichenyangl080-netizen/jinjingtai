const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
exports.run = async ({
  win,
  S,
  report,
  js,
  check,
  click,
  fill,
  wait,
  output,
}) => {
  assert(/renderer-boundaries-/.test(S.HOME));
  assert(path.resolve(S.library()).startsWith(path.resolve(S.HOME) + path.sep));
  const snapshot = async (name) =>
    fs.writeFileSync(
      output.replace(".json", `-${name}.png`),
      (await win.webContents.capturePage()).toPNG(),
    );
  const original = S.personal();
  await click("项目");
  await check(
    "default project selects populated ordinary project",
    `document.querySelector('.project-option[aria-pressed="true"] strong')?.textContent==='测试项目'`,
  );
  await click("新建项目");
  await check(
    "project form is named and receives focus",
    `document.querySelector('[role="dialog"]')?.getAttribute('aria-labelledby')==='project-form-title'&&document.activeElement===document.querySelector('.dialog input')`,
  );
  await fill(".dialog input", "隔离验收项目");
  await click("取消");
  await check(
    "leave guard is the only dialog, focused, with inert background",
    `document.querySelectorAll('[role="dialog"]').length===1&&document.querySelector('[aria-labelledby="guard-title"]')?.contains(document.activeElement)&&document.querySelector('.main-area').inert&&document.querySelector('.sidebar').inert`,
  );
  await snapshot("guard");
  await js(
    `(()=>{const e=document.querySelector('[aria-labelledby="guard-title"] .dialog-actions button:last-child');e.focus()})()`,
  );
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Tab" });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Tab" });
  await wait(100);
  await check(
    "native Tab wraps within active guard",
    `document.activeElement.textContent.trim()==='继续编辑'`,
  );
  await click("继续编辑");
  await check(
    "continue restores project input and focus",
    `document.querySelector('.dialog input')?.value==='隔离验收项目'&&document.activeElement===document.querySelector('.dialog input')`,
  );
  await click("取消");
  await click("放弃修改");
  assert.deepEqual(S.personal(), original);
  report.checks.push(
    "discard leaves authoritative records and projects unchanged",
  );
  await click("新建项目");
  await fill(".dialog input", "保存并离开验收");
  await click("取消");
  await click("保存并离开");
  assert(S.personal().store.projects.some((p) => p.name === "保存并离开验收"));
  await check(
    "save and leave closes dialogs",
    `!document.querySelector('[role="dialog"]')`,
  );
  await click("新建项目");
  await fill(".dialog input", "冲突时保留输入");
  const concurrent = S.personal();
  S.savePersonal(concurrent.store, concurrent.revision, concurrent.libraryId);
  await click("保存项目");
  await check(
    "revision failure persists inside form with input intact",
    `!!document.querySelector('#project-form-error[role="alert"]')&&document.querySelector('.dialog input').value==='冲突时保留输入'&&document.querySelector('.dialog input').getAttribute('aria-invalid')==='true'`,
  );
  await snapshot("save-error");
  await wait(8200);
  await check(
    "form error remains after transient toast expires",
    `!!document.querySelector('#project-form-error')&&document.querySelector('.dialog input').value==='冲突时保留输入'&&!document.querySelector('.toast')`,
  );
  await click("取消");
  await click("放弃修改");
  await click("日历");
  win.setBounds({ width: 1024, height: 720 });
  await wait(150);
  await check(
    "calendar minimum window retains independent day scrolling",
    `document.documentElement.scrollWidth<=innerWidth&&getComputedStyle(document.querySelector('.calendar-summary-body')).overflowY==='auto'`,
  );
  await snapshot("calendar-1024");
  win.setBounds({ width: 1180, height: 850 });
  await wait(150);
  await check(
    "calendar dates use a single tab stop",
    `document.querySelectorAll('[data-calendar-date][tabindex="0"]').length===1`,
  );
  await js(
    `(()=>{const e=document.querySelector('button.calendar-work');e.focus();e.click()})()`,
  );
  await wait(150);
  await check(
    "calendar single item opens dated details and transfers focus",
    `document.activeElement===document.querySelector('.detail-drawer')&&document.querySelector('.detail-meta time')?.dateTime===${JSON.stringify(S.day())}`,
  );
  await snapshot("calendar-detail");
  await click("关闭详情");
  await check(
    "closing detail restores opening button focus",
    `document.activeElement.matches('button.calendar-work')`,
  );
  await js(`document.querySelector('.calendar-work-group summary').click()`);
  await wait(100);
  await check(
    "calendar grouped work exposes all member records",
    `document.querySelectorAll('.calendar-work-group[open] .record-row').length===2`,
  );
  await js(
    `(()=>{const e=document.querySelector('.calendar-work-group[open] .record-row');e.focus();e.click()})()`,
  );
  await wait(100);
  await check(
    "calendar grouped record opens original detail",
    `['已写好保存流程','保存文件可重读'].includes(document.querySelector('.record-title')?.textContent)`,
  );
  await click("关闭详情");
  await click("回望");
  await click("年");
  await check(
    "annual retrospective offers project month and title filters and lesson preview",
    `!!document.querySelector('[aria-label="定位月份"]')&&!!document.querySelector('[aria-label="筛选项目"]')&&document.querySelector('.review-lesson-preview')?.textContent==='异常必须明确显示'`,
  );
  await fill('[aria-label="查找事项"]', "不存在的事项");
  await check(
    "filtered no-match is distinct from empty library",
    `document.querySelector('.review-section [role="status"]')?.textContent==='没有符合筛选条件的进展。'`,
  );
  await click("清除筛选");
  await js(
    `(()=>{const e=document.querySelector('[aria-label="筛选项目"]');e.value='unassigned';e.dispatchEvent(new Event('change',{bubbles:true}))})()`,
  );
  await wait(100);
  await check(
    "project filter excludes other project work",
    `document.querySelectorAll('.review-day').length===0&&document.querySelector('.review-section [role="status"]')?.textContent==='没有符合筛选条件的进展。'`,
  );
  await click("清除筛选");
  await js(
    `(()=>{const e=document.querySelector('[aria-label="定位月份"]');e.value='${S.day().slice(0, 4)}-09';e.dispatchEvent(new Event('change',{bubbles:true}))})()`,
  );
  await wait(100);
  await check(
    "month filter locates only that month",
    `document.querySelectorAll('.review-day').length===1&&document.querySelector('.review-day').textContent.includes('九月验收事项')`,
  );
  await click("清除筛选");
  win.setBounds({ width: 1024, height: 720 });
  await wait(200);
  await check(
    "retrospective minimum window has no horizontal overflow",
    `document.documentElement.scrollWidth<=innerWidth`,
  );
  await snapshot("retrospective-1024");
  await js(
    `document.querySelector('.workbench').style.setProperty('--reading-font','20px')`,
  );
  await wait(100);
  await check(
    "larger reading font retains no horizontal overflow",
    `document.documentElement.scrollWidth<=innerWidth`,
  );
  await snapshot("retrospective-large");
  const file = path.join(S.library(), "personal.json"),
    bytes = fs.readFileSync(file);
  try {
    fs.writeFileSync(file, "{broken");
    win.webContents.reload();
    await wait(1000);
    for (const page of ["项目", "回望"]) {
      await click(page);
      await check(
        `${page} shows read error rather than empty state`,
        `!!document.querySelector('.library-error[role="alert"]')&&!document.body.textContent.includes('这段时间还没有记录。')`,
      );
    }
    await snapshot("library-error");
  } finally {
    fs.writeFileSync(file, bytes);
    win.webContents.reload();
    await wait(1000);
  }
  await click("项目");
  await check(
    "restored authority reloads without error",
    `!document.querySelector('.library-error')&&!!document.querySelector('.project-index')`,
  );
  await check(
    "last selected project survives renderer restart",
    `document.querySelector('.project-option[aria-pressed="true"] strong')?.textContent==='保存并离开验收'`,
  );
  assert.deepEqual(S.personal().store.records, original.store.records);
  assert.deepEqual(S.personal().store.notes, original.store.notes);
  report.checks.push(
    "all original fixture records and notes survive errors and edits unchanged",
  );
};
