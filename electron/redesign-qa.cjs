const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
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
  const originalRecords = structuredClone(S.personal().store.records);
  const oldMonthRecord = originalRecords.find(
    (r) => r.id === "redesign-old-month",
  );
  assert(originalRecords.some((r) => r.id === "redesign-current"));
  const snapshot = async (name) => {
    await wait(260);
    // Portable Windows builds may not expose a capturePage surface for an
    // offscreen window. Capture the actual offscreen paint frame instead.
    const frame = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        win.webContents.removeListener("paint", painted);
        reject(Error("OFFSCREEN_PAINT_TIMEOUT"));
      }, 5000);
      function painted(_event, _dirty, image) {
        if (image.isEmpty()) return;
        clearTimeout(timeout);
        win.webContents.removeListener("paint", painted);
        resolve(image);
      }
      win.webContents.on("paint", painted);
      win.webContents.invalidate();
    });
    const bytes = frame.toPNG();
    assert(bytes.length >= 100, "Screenshot must contain a nonempty PNG");
    fs.writeFileSync(output.replace(".json", `-${name}.png`), bytes);
  };
  const select = async (selector, value) => {
    assert(
      await js(
        `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`,
      ),
      selector,
    );
    await wait(120);
  };
  const scopedClick = async (selector, text) => {
    assert(
      await js(
        `(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector + " button")})].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`,
      ),
      text,
    );
    await wait(120);
  };
  const checkbox = async (scope, title) => {
    if (scope === ".period-review-panel") {
      await js(
        `(()=>{const details=document.querySelector('.period-reference-chooser');if(details&&!details.open)details.querySelector('summary').click()})()`,
      );
      await wait(80);
    }
    assert(
      await js(
        `(()=>{const label=[...document.querySelectorAll(${JSON.stringify(scope + " label")})].find(e=>e.textContent.includes(${JSON.stringify(title)})&&e.querySelector('input[type="checkbox"]'));if(!label)return false;label.querySelector('input').click();return true})()`,
      ),
      title,
    );
    await wait(80);
  };
  const reload = async () => {
    await new Promise((resolve) => {
      win.webContents.once("did-finish-load", resolve);
      win.webContents.reload();
    });
    await wait(700);
  };
  await click("工作台");
  await snapshot("workbench-baseline");
  await check(
    "three main navigation entries and workspace day/calendar tabs",
    `['工作台','项目','回望'].every(t=>[...document.querySelectorAll('.sidebar button')].some(b=>b.textContent.trim()===t))&&['今日','日历'].every(t=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===t))`,
  );
  await click("日历");
  await check(
    "calendar remains reachable inside workbench",
    `!!document.querySelector('[data-calendar-date]')`,
  );
  win.setBounds({ width: 1024, height: 720 });
  await wait(150);
  await check(
    "small calendar retains independent day scrolling",
    `document.documentElement.scrollWidth<=innerWidth&&getComputedStyle(document.querySelector('.calendar-summary-body')).overflowY==='auto'`,
  );
  await snapshot("calendar-1024");
  win.setBounds({ width: 1180, height: 850 });
  await click("今日");
  await js(`document.querySelector('.backlog-panel summary')?.click()`);
  await wait(150);
  await check(
    "cross-month pending materials remain visible",
    `document.querySelector('.backlog-list')?.textContent.includes(${JSON.stringify(oldMonthRecord.date)})`,
  );
  await js(
    `(()=>{const b=[...document.querySelectorAll('.backlog-list button')].find(e=>e.textContent.includes(${JSON.stringify(oldMonthRecord.date)}));b.click()})()`,
  );
  await wait(180);
  await check(
    "backlog selection opens exactly its historical day",
    `!!document.querySelector('.historical-date-label')&&document.querySelector('.workbench').textContent.includes('检查历史读取')`,
  );
  await click("回到今天");
  win.webContents.sendInputEvent({
    type: "keyDown",
    keyCode: "k",
    modifiers: ["control"],
  });
  win.webContents.sendInputEvent({
    type: "keyUp",
    keyCode: "k",
    modifiers: ["control"],
  });
  await wait(260);
  await check(
    "native Ctrl K does not open search",
    `!document.querySelector('.search-dialog')`,
  );
  await click("搜索本地资料");
  await check(
    "sidebar search transfers focus",
    `document.activeElement===document.querySelector('[aria-label="全文搜索"]')`,
  );
  await js(
    `(()=>{const buttons=[...document.querySelectorAll('.search-dialog button:not([disabled])')];buttons[buttons.length-1].focus()})()`,
  );
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Tab" });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Tab" });
  await wait(120);
  await check(
    "native Tab loops inside search dialog",
    `document.querySelector('.search-dialog')?.contains(document.activeElement)`,
  );
  await fill('[aria-label="全文搜索"]', "仅正文定位词");
  await wait(450);
  await check(
    "worker full text finds a term absent from title",
    `document.querySelectorAll('.search-result').length===1&&document.querySelector('.search-result strong').textContent==='核对保存边界'&&document.querySelector('.search-result').textContent.includes('仅正文定位词')`,
  );
  await js(`document.querySelector('.search-result').click()`);
  await wait(120);
  await check(
    "search opens original dated record details",
    `document.querySelector('.record-title')?.textContent==='核对保存边界'&&document.querySelector('.detail-meta time')?.dateTime===${JSON.stringify(S.day())}`,
  );
  await snapshot("search-detail");
  await click("关闭详情");
  await click("搜索本地资料");
  await check(
    "search preserves query after reading detail",
    `document.querySelector('[aria-label="全文搜索"]')?.value==='仅正文定位词'`,
  );
  await click("关闭搜索");
  await click("项目");
  await snapshot("project-baseline");
  await click("全部历程");
  await select('[aria-label="定位项目月份"]', oldMonthRecord.date.slice(0, 7));
  await check(
    "project month locator isolates the selected month",
    `document.querySelectorAll('.project-history-day').length===1&&document.querySelector('.project-history-day').textContent.includes('检查历史读取')&&!document.querySelector('.project-history-day').textContent.includes('核对保存边界')`,
  );
  await select('[aria-label="定位项目月份"]', "");
  await check(
    "project distinguishes overview and continuation",
    `!!document.querySelector('.continuation-panel')&&document.querySelector('.project-body').textContent.includes('项目概况')`,
  );
  await scopedClick(".continuation-panel", "设置起点");
  await fill(".continuation-panel textarea", "隔离验收：手写继续位置");
  await click("回望");
  await check(
    "leaving personal draft shows unsaved guard",
    `!!document.querySelector('[aria-labelledby="guard-title"]')`,
  );
  await click("继续编辑");
  await check(
    "continue editing retains personal draft",
    `document.querySelector('.continuation-panel textarea')?.value==='隔离验收：手写继续位置'`,
  );
  await scopedClick(".continuation-panel", "保存起点");
  assert.equal(
    S.personal().store.continuations.p.text,
    "隔离验收：手写继续位置",
  );
  report.checks.push(
    "handwritten continuation reaches isolated authoritative JSON",
  );
  await scopedClick(".continuation-panel", "编辑起点");
  await select(".continuation-panel select", "redesign-current");
  await scopedClick(".continuation-panel", "保存起点");
  assert.equal(S.personal().store.continuations.p.recordId, "redesign-current");
  assert.equal(S.personal().store.continuations.p.text, "检查隔离重开后的正文");
  await reload();
  await click("项目");
  await check(
    "source continuation survives renderer reopen",
    `document.querySelector('.continuation-panel').textContent.includes('检查隔离重开后的正文')`,
  );
  await scopedClick(".continuation-panel", "编辑起点");
  await fill(".continuation-panel textarea", "冲突时保留的起点");
  const concurrent = S.personal();
  S.savePersonal(concurrent.store, concurrent.revision, concurrent.libraryId);
  const beforeConflict = fs.readFileSync(
    path.join(S.library(), "personal.json"),
  );
  await scopedClick(".continuation-panel", "保存起点");
  await check(
    "revision conflict retains personal draft and inline error",
    `document.querySelector('.continuation-panel textarea')?.value==='冲突时保留的起点'&&!!document.querySelector('.continuation-panel [role="alert"]')`,
  );
  assert(
    fs
      .readFileSync(path.join(S.library(), "personal.json"))
      .equals(beforeConflict),
  );
  await scopedClick(".continuation-panel", "取消");
  await click("放弃修改");
  // Refresh authoritative revision after rejecting stale edits.
  await reload();
  await click("回望");
  await click("月");
  await scopedClick(".period-review-panel", "写本期回望");
  await fill(
    ".period-review-panel textarea",
    "隔离月度自由回望：保留尝试与验证的边界。",
  );
  await checkbox(".period-review-panel", "核对保存边界");
  await scopedClick(".period-review-panel", "保存回望");
  const review = Object.values(S.personal().store.periodReviews).find(
    (r) => r.period === "月",
  );
  assert.equal(review.text, "隔离月度自由回望：保留尝试与验证的边界。");
  assert(review.references.some((r) => r.recordId === "redesign-current"));
  await snapshot("monthly-review");
  await reload();
  await click("回望");
  await click("月");
  await check(
    "free monthly review and source reference survive reopening",
    `document.querySelector('.period-review-panel').textContent.includes('隔离月度自由回望')&&document.querySelector('.personal-reference').textContent.includes('核对保存边界')`,
  );
  await click("项目");
  // The project view may initialize either timeline or threads; select the dedicated tab if present.
  await js(
    `(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='事项主线');b?.click()})()`,
  );
  await wait(100);
  await scopedClick(".thread-panel", "新建主线");
  await fill(".thread-panel .person-editor > label input", "隔离跨日保存主线");
  await fill(".thread-panel textarea", "人工选择两日的尝试，不表示完成。");
  await checkbox(".thread-panel", "核对保存边界");
  await checkbox(".thread-panel", "调整保存方式");
  await scopedClick(".thread-panel", "保存主线");
  const thread = Object.values(S.personal().store.threads).find(
    (t) => t.title === "隔离跨日保存主线",
  );
  assert.deepEqual(
    new Set(thread.recordIds),
    new Set(["redesign-current", "redesign-prior"]),
  );
  await js(`document.querySelector('.thread-item summary').click()`);
  await wait(100);
  await check(
    "manual thread reads both days in original chronology",
    `document.querySelector('.thread-item[open]')?.textContent.includes('核对保存边界')&&document.querySelector('.thread-item[open]')?.textContent.includes('调整保存方式')`,
  );
  await snapshot("cross-day-thread");
  await reload();
  await click("项目");
  await js(
    `(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='事项主线');b?.click()})()`,
  );
  await wait(100);
  await check(
    "manual thread survives reopening",
    `document.querySelector('.thread-panel').textContent.includes('隔离跨日保存主线')`,
  );
  assert.deepEqual(S.personal().store.records, originalRecords);
  report.checks.push(
    "record bodies, next steps and verification kinds remain unchanged",
  );
  win.setBounds({ width: 1024, height: 720 });
  await wait(180);
  await check(
    "minimum project window has no horizontal document overflow",
    `document.documentElement.scrollWidth<=innerWidth`,
  );
  await snapshot("project-1024");
  await js(
    `document.querySelector('.workbench').style.setProperty('--reading-font','20px')`,
  );
  await wait(100);
  await check(
    "large reading font preserves viewport bounds",
    `document.documentElement.scrollWidth<=innerWidth`,
  );
  await snapshot("project-large-font");
  win.setBounds({ width: 1180, height: 850 });
  const sourceRecord = originalRecords.find((r) => r.id === "redesign-current");
  assert(
    !sourceRecord.manual && sourceRecord.sourceIds?.length,
    "fresh redesign setup must use source-backed visibility fixture",
  );
  const visibilityFile = path.join(
    S.library(),
    "visibility",
    "redesign-visibility.json",
  );
  S.atomic(visibilityFile, { hidden: true, sourceIds: sourceRecord.sourceIds });
  assert(
    S.personal().store.records.find((r) => r.id === sourceRecord.id)
      .progressHidden,
  );
  await reload();
  await click("搜索本地资料");
  await fill('[aria-label="全文搜索"]', "仅正文定位词");
  await wait(450);
  await check(
    "reloaded worker excludes a newly hidden record",
    `document.querySelectorAll('.search-result').length===0&&document.querySelector('.search-results').textContent.includes('没有找到')`,
  );
  await click("关闭搜索");
  S.atomic(visibilityFile, {
    hidden: false,
    sourceIds: sourceRecord.sourceIds,
  });
  await reload();
  await click("搜索本地资料");
  await fill('[aria-label="全文搜索"]', "仅正文定位词");
  await wait(450);
  await check(
    "reloaded worker rebuilds restored local records",
    `document.querySelectorAll('.search-result').length===1`,
  );
  await fill('[aria-label="全文搜索"]', "隔离合成正文");
  await wait(450);
  await check(
    "search returns cross-day reading sequence",
    `document.querySelectorAll('.search-result').length===3`,
  );
  await js(`document.querySelector('.search-result').click()`);
  await wait(260);
  await click("展开阅读");
  await check(
    "expanded reader retains original text",
    `document.querySelector('.detail-drawer').classList.contains('reader-expanded')&&document.querySelector('.detail-drawer').textContent.includes('仅正文定位词')`,
  );
  await snapshot("expanded-reader");
  await click("下一条记录");
  await check(
    "next reader item follows search order",
    `document.querySelector('.record-title')?.textContent==='调整保存方式'`,
  );
  await click("上一条记录");
  await check(
    "previous reader returns without changing records",
    `document.querySelector('.record-title')?.textContent==='核对保存边界'`,
  );
  await click("收起阅读");
  await click("关闭详情");
  await check(
    "return from sequence restores search query",
    `document.querySelector('[aria-label="全文搜索"]')?.value==='隔离合成正文'`,
  );
  await click("关闭搜索");
  assert.deepEqual(S.personal().store.records, originalRecords);
  report.checks.push(
    "isolated hidden-record fixture restored without changing original prose",
  );
  const assetDir = path.join(
    require("electron").app.getAppPath(),
    "dist",
    "client",
    "assets",
  );
  const workerAsset = fs
    .readdirSync(assetDir)
    .find((name) => name.startsWith("search.worker-") && name.endsWith(".js"));
  assert(workerAsset, "built search worker asset");
  report.workerPerformance = await js(`(async()=>{
    const rows=[];
    for(const size of [1000,10000]){
      const worker=new Worker(new URL(${JSON.stringify("assets/" + workerAsset)},location.href),{type:'module'});
      let ticks=0;const heartbeat=setInterval(()=>ticks++,0);
      const records=Array.from({length:size},(_,i)=>({id:'perf-'+i,date:'2026-10-13',project:'p',title:'性能记录'+i,change:'合成性能关键词 '+i,next:'',kind:'发现',manual:true,confirmed:false}));
      const began=performance.now();
      await new Promise((resolve,reject)=>{worker.onmessage=({data})=>{if(data.type==='indexed')resolve()};worker.onerror=reject;worker.postMessage({type:'index',store:{version:1,records,projects:[],notes:{}},libraryId:'isolated-perf',generation:size})});
      const indexMs=performance.now()-began;const queryStart=performance.now();
      const results=await new Promise((resolve,reject)=>{worker.onmessage=({data})=>{if(data.type==='results')resolve(data.results)};worker.onerror=reject;worker.postMessage({type:'query',query:{text:'合成性能关键词 '+(size-1)},requestId:size,generation:size})});
      const queryMs=performance.now()-queryStart;
      clearInterval(heartbeat);worker.terminate();rows.push({size,indexMs,queryMs,heartbeatTicks:ticks,matches:results.length});
    }
    return rows;
  })()`);
  for (const row of report.workerPerformance) {
    assert.equal(row.matches, 1);
    assert(row.queryMs < 300, `worker ${row.size} query ${row.queryMs}ms`);
    assert(
      row.heartbeatTicks > 0,
      "renderer heartbeat continued while worker indexed",
    );
  }
  report.checks.push(
    "production renderer Worker handles 1000/10000 records under 300ms query with live main-thread heartbeat",
  );
  await click("回望");
  for (const period of ["周", "年"]) {
    await click(period);
    await scopedClick(".period-review-panel", "写本期回望");
    const text = `隔离${period}度自由回望，保留人工判断。`;
    await fill(".period-review-panel textarea", text);
    await scopedClick(".period-review-panel", "保存回望");
    assert(
      Object.values(S.personal().store.periodReviews).some(
        (r) => r.period === period && r.text === text,
      ),
    );
    await reload();
    await click("回望");
    await click(period);
    await check(
      `${period} free review survives renderer reopen`,
      `document.querySelector('.period-review-panel').textContent.includes(${JSON.stringify(text)})`,
    );
  }
  await scopedClick(".period-review-panel", "编辑回望");
  await fill(".period-review-panel textarea", "未保存周期草稿");
  await click("周");
  await check(
    "period switch protects unsaved review draft",
    `!!document.querySelector('[aria-labelledby="guard-title"]')`,
  );
  await click("继续编辑");
  await check(
    "period continue restores original draft",
    `document.querySelector('.period-review-panel textarea')?.value==='未保存周期草稿'`,
  );
  await click("周");
  await click("放弃修改");
  assert(
    Object.values(S.personal().store.periodReviews).some(
      (r) => r.period === "年" && r.text === "隔离年度自由回望，保留人工判断。",
    ),
  );
  report.checks.push(
    "discarding period draft preserves previously saved annual prose",
  );
  await click("项目");
  await click("事项主线");
  const originalThreads = structuredClone(S.personal().store.threads);
  const originalThread = Object.values(originalThreads).find((t) =>
    t.recordIds.includes("redesign-current"),
  );
  assert(originalThread, "original source thread");
  await scopedClick(".thread-panel", "新建主线");
  await fill(".thread-panel .person-editor > label input", "隔离明确移动验收");
  await fill(".thread-panel textarea", "移动关联、归档和删除不改变原记录。");
  await check(
    "already associated member offers explicit move action",
    `!![...document.querySelectorAll('.thread-candidate')].find(e=>e.textContent.includes('核对保存边界')&&e.textContent.includes('移动到本主线'))`,
  );
  await js(
    `(()=>{const e=[...document.querySelectorAll('.thread-candidate')].find(e=>e.textContent.includes('核对保存边界'));e.querySelector('button').click()})()`,
  );
  await wait(100);
  await check(
    "pending move is explicit before saving",
    `[...document.querySelectorAll('.thread-candidate')].find(e=>e.textContent.includes('核对保存边界')).textContent.includes('保存后移动到本主线')`,
  );
  await scopedClick(".thread-panel", "保存主线");
  const moved = Object.values(S.personal().store.threads).find(
    (t) => t.title === "隔离明确移动验收",
  );
  assert.deepEqual(moved.recordIds, ["redesign-current"]);
  assert(
    !S.personal().store.threads[originalThread.id].recordIds.includes(
      "redesign-current",
    ),
  );
  assert.deepEqual(S.personal().store.records, originalRecords);
  report.checks.push(
    "explicit move changes unique thread membership without changing record bodies",
  );
  await js(
    `(()=>{const e=[...document.querySelectorAll('.thread-item')].find(e=>e.querySelector('summary').textContent.includes('隔离明确移动验收'));e.open=true;e.dataset.qaMove='true'})()`,
  );
  const movePanel = '.thread-item[data-qa-move="true"]';
  await scopedClick(movePanel, "归档主线");
  assert.equal(S.personal().store.threads[moved.id].archived, true);
  await scopedClick(movePanel, "取消归档");
  assert.equal(S.personal().store.threads[moved.id].archived, false);
  await scopedClick(movePanel, "删除主线");
  await check(
    "thread deletion explicitly retains original records",
    `document.querySelector('.thread-delete-confirm')?.textContent.includes('原记录仍保留')`,
  );
  await scopedClick(movePanel, "确认删除主线");
  assert.equal(S.personal().store.threads[moved.id], undefined);
  assert.deepEqual(S.personal().store.records, originalRecords);
  const afterRemoval = S.personal();
  S.savePersonal(
    { ...afterRemoval.store, threads: originalThreads },
    afterRemoval.revision,
    afterRemoval.libraryId,
  );
  await reload();
  assert.deepEqual(S.personal().store.threads, originalThreads);
  assert.deepEqual(S.personal().store.records, originalRecords);
  report.checks.push(
    "archive, unarchive and delete preserve records; original cross-day thread restored",
  );
};
