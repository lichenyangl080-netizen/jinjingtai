const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  S = require("../integration/store.cjs");
exports.run = async (win, errors) => {
  const output = process.env.JINJINGTAI_QA_OUTPUT,
    mode = process.env.JINJINGTAI_QA_HOME_RESTART,
    appPath = require("electron").app.getAppPath(),
    manifestFile = [
      path.join(appPath, "build-manifest.json"),
      path.join(appPath, "dist", "build-manifest.json"),
    ].find((file) => fs.existsSync(file));
  const report = {
    tier: "production Electron UI, isolated local authority and simulated capture, no model",
    appPath,
    electron: process.versions.electron,
    build: manifestFile
      ? { ...JSON.parse(fs.readFileSync(manifestFile, "utf8")), manifestFile }
      : null,
    mode,
    checks: [],
    at: new Date().toISOString(),
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)),
    js = (code) => win.webContents.executeJavaScript(code);
  const check = async (name, code) => {
    assert(await js(code), name);
    report.checks.push(name);
  };
  const click = async (text) => {
    assert(
      await js(
        `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}||b.getAttribute('aria-label')===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`,
      ),
      text,
    );
    await wait(120);
  };
  const fill = async (selector, value) => {
    report.step = selector;
    assert(
      await js(`!!document.querySelector(${JSON.stringify(selector)})`),
      "missing field " + selector,
    );
    await js(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`,
    );
    await wait(80);
  };
  await wait(700);
  try {
    if (mode === "redesign") {
      await require("./redesign-qa.cjs").run({
        win,
        S,
        report,
        js,
        check,
        click,
        fill,
        wait,
        output,
      });
    } else if (mode === "ux-fixes") {
      await require("./ux-fixes-qa.cjs").run({
        win,
        S,
        report,
        js,
        check,
        click,
        fill,
        wait,
        output,
      });
    } else if (mode === "scope-material-labels") {
      assert(S.HOME.includes("Directory-QA"));
      report.tier =
        "packaged Electron renderer/preload/IPC, isolated old records and synthetic new stage; no model";
      const original = S.personal();
      S.atomic(path.join(S.HOME, "connection.json"), {
        ...S.config(),
        instructionFiles: [path.join(S.config().roots[0], "AGENTS.md")],
      });
      const body = {
        outcome: "change",
        items: [
          {
            kind: "implementation",
            title: "第五期视频调整字幕位置",
            summary: "隔离界面测试材料：调整字幕位置，尚未检查完整成片。",
          },
        ],
      };
      const h = {
        cwd: S.config().roots[0],
        session_id: "synthetic-labels",
        turn_id: "labels",
        tool_use_id: "labels",
        tool_input: body,
      };
      h.tool_input = { ...body, _gate: S.issue(h) };
      S.submit(h.tool_input);
      S.bind(h);
      await wait(2200);
      await click("今日");
      await click("整理这一天");
      await check(
        "title states that old tasks send only a short directory",
        `document.querySelector('.scope-heading .scope-directory-hint')?.textContent==='旧事项仅发送短目录'`,
      );
      await js(
        `document.querySelectorAll('.scope-project-details').forEach(e=>e.open=true)`,
      );
      await check(
        "new stage has a visible new-material label beside its title",
        `[...document.querySelectorAll('.scope-material-title')].some(e=>e.textContent.includes('第五期视频调整字幕位置')&&e.querySelector('.is-new')?.textContent==='新材料')`,
      );
      await check(
        "old stages are labeled short directory, not new material",
        `[...document.querySelectorAll('.scope-material-tag')].filter(e=>e.textContent==='短目录').length===2`,
      );
      await check(
        "no horizontal overflow",
        `document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.scope-dialog').scrollWidth<=document.querySelector('.scope-dialog').clientWidth`,
      );
      fs.writeFileSync(
        output.replace(".json", "-scope.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      await click("取消");
      assert.deepEqual(S.personal(), original);
      assert.equal(S.list("jobs").length, 2);
      report.checks.push(
        "opening and cancelling scope preserves personal records and makes no model request",
      );
    } else if (mode === "organizer-directory-history") {
      assert(S.HOME.includes("Directory-QA"));
      report.tier =
        "packaged Electron renderer/preload/IPC; isolated real CLI task receipts";
      await click("设置");
      await check(
        "history entry is visible in connection settings",
        `!!document.querySelector('.organizer-history')`,
      );
      await js(`document.querySelector('.organizer-history').open=true`);
      await wait(100);
      const jobs = S.list("jobs");
      await check(
        "all previous tasks are listed",
        `document.querySelectorAll('.organizer-history-list button').length===${jobs.length}`,
      );
      await click("查看记录");
      await check(
        "actual input is available via production IPC",
        `document.querySelector('.organizer-history pre').textContent.includes('directory')`,
      );
      await check(
        "memory and raw result sections are readable",
        `document.querySelector('.organizer-history').textContent.includes('已整理事项目录（1 项）')&&document.querySelector('.organizer-history').textContent.includes('模型返回结果')`,
      );
      await check(
        "history does not overflow the window",
        `document.documentElement.scrollWidth<=innerWidth`,
      );
      fs.writeFileSync(
        output.replace(".json", "-history.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
    } else if (mode === "organizer-repair-settings") {
      assert(S.HOME.includes("Repair-QA"));
      const P = require("../integration/preferences.cjs");
      const snapshot = async (name) =>
        fs.writeFileSync(
          output.replace(".json", `-${name}.png`),
          (await win.webContents.capturePage()).toPNG(),
        );
      const columns = () =>
        js(
          `(()=>{const sections=[...document.querySelectorAll('.day-notes > section')];return sections.map(e=>({left:e.getBoundingClientRect().left,width:e.getBoundingClientRect().width}))})()`,
        );
      const emptyColumns = await columns();
      await snapshot("empty");
      await click("补记一件事");
      await fill('textarea[aria-label="记录标题"]', "隔离测试：检查整理设置");
      await fill(
        'textarea[placeholder="与之前相比，发生了什么？"]',
        "仅用于界面验收，不是真实工作成果。",
      );
      await click("保存补记");
      const savedColumns = await columns();
      assert.deepEqual(emptyColumns, savedColumns);
      report.checks.push(
        "empty and saved day notes have identical column positions and widths",
      );
      report.noteColumns = { emptyColumns, savedColumns };
      await snapshot("saved");
      await click("设置");
      const select = async (label, value) => {
        await js(
          `(()=>{const e=document.querySelector('select[aria-label="${label}"]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`,
        );
        await wait(120);
      };
      for (const model of ["gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna"]) {
        await select("整理模型", model);
        for (const effort of ["low", "medium", "high", "xhigh", "max"]) {
          await select("推理强度", effort);
          assert.equal(P.load().organizerModel, model);
          assert.equal(P.load().organizerEffort, effort);
        }
      }
      await select("推理强度", "none");
      assert.equal(P.load().organizerEffort, "none");
      await select("整理模型", "gpt-6-astra");
      assert.equal(P.load().organizerEffort, "medium");
      await check(
        "unsupported none effort is removed when switching from Luna",
        `![...document.querySelector('select[aria-label="推理强度"]').options].some(o=>o.value==='none')`,
      );
      await select("整理模型", "gpt-6.1-sol");
      report.checks.push(
        "all three models and all supported effort choices persist through production preload and IPC",
      );
      await snapshot("settings");
      await click("今日");
      await click("设置");
      await check(
        "saved selection survives page navigation",
        `document.querySelector('select[aria-label="整理模型"]').value==='gpt-6.1-sol'&&document.querySelector('select[aria-label="推理强度"]').value==='medium'`,
      );
      await check(
        "no horizontal overflow",
        `document.documentElement.scrollWidth<=innerWidth`,
      );
    } else if (mode === "organizer-repair-reopen") {
      assert(S.HOME.includes("Repair-QA"));
      await check(
        "synthetic record survives closing and reopening the packaged app",
        `document.body.innerText.includes('隔离测试：检查整理设置')`,
      );
      await click("设置");
      await check(
        "model and effort selection survive process restart",
        `document.querySelector('select[aria-label="整理模型"]').value==='gpt-6.1-sol'&&document.querySelector('select[aria-label="推理强度"]').value==='medium'`,
      );
    } else if (mode === "code-audit-boundaries") {
      assert(S.HOME.includes("code-audit"));
      report.tier =
        "production Electron renderer/preload/IPC, isolated libraries, simulated file picker, no model";
      const { dialog } = require("electron");
      const originalPicker = dialog.showOpenDialog;
      const library = S.library();
      const files = ["normal", "late-edit", "late-library"].map((name) => {
        const file = path.join(S.HOME, name + ".txt");
        fs.writeFileSync(file, "Synthetic " + name);
        return file;
      });
      let resolvePicker;
      try {
        await click("编辑回顾");
        await fill('textarea[aria-label="今日所得"]', "组件拆分后的回顾正文");
        await click("保存回顾");
        assert.equal(
          S.personal().store.notes[S.day()].lesson,
          "组件拆分后的回顾正文",
        );
        report.checks.push(
          "extracted note component saves through production IPC",
        );
        await click("补记一件事");
        await fill('textarea[aria-label="记录标题"]', "隔离附件验收");
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [files[0]],
        });
        await click("添加图片或附件");
        await check(
          "normal attachment belongs to the current editor",
          `document.querySelector('.detail-drawer').textContent.includes('normal.txt')`,
        );
        await click("保存补记");
        const saved = S.personal().store.records.find(
          (record) => record.title === "隔离附件验收",
        );
        assert.equal(saved.attachments.length, 1);
        assert.equal(
          fs.readFileSync(
            path.join(library, "attachments", saved.attachments[0].id),
            "utf8",
          ),
          "Synthetic normal",
        );
        await click("编辑记录");
        dialog.showOpenDialog = () =>
          new Promise((resolve) => {
            resolvePicker = resolve;
          });
        await click("添加图片或附件");
        assert(resolvePicker);
        await click("保存修改");
        await click("编辑记录");
        resolvePicker({ canceled: false, filePaths: [files[1]] });
        resolvePicker = null;
        await wait(200);
        await check(
          "same record reopened in a new edit session rejects late picker result",
          `!document.querySelector('.detail-drawer').textContent.includes('late-edit.txt')`,
        );
        await click("添加图片或附件");
        assert(resolvePicker);
        const beforeFiles = fs.readdirSync(path.join(library, "attachments"));
        const target = path.join(S.HOME, "library-b");
        fs.mkdirSync(target);
        S.selectLibrary(target);
        const before = fs.readFileSync(path.join(target, "personal.json"));
        resolvePicker({ canceled: false, filePaths: [files[2]] });
        resolvePicker = null;
        await wait(200);
        assert(!fs.existsSync(path.join(target, "attachments")));
        assert.deepEqual(
          fs.readdirSync(path.join(library, "attachments")),
          beforeFiles,
        );
        assert(
          fs.readFileSync(path.join(target, "personal.json")).equals(before),
        );
        await check(
          "library switch rejects attachment without discarding editor text",
          `document.querySelector('textarea[aria-label="记录标题"]').value==='隔离附件验收'&&!document.querySelector('.detail-drawer').textContent.includes('late-library.txt')&&document.body.textContent.includes('附件未添加')`,
        );
        report.checks.push(
          "both libraries receive no late cross-library attachment; new authority unchanged",
        );
      } finally {
        resolvePicker?.({ canceled: true, filePaths: [] });
        dialog.showOpenDialog = originalPicker;
      }
    } else if (mode === "scope-names") {
      assert(S.HOME.includes("renderer-boundaries"));
      const library = S.library(),
        parent = path.join(S.HOME, "来源目录".repeat(12)),
        child = path.join(parent, "进境台"),
        other = path.join(S.HOME, "视频制作");
      for (const directory of [parent, child, other])
        fs.mkdirSync(directory, { recursive: true });
      S.atomic(path.join(library, "preferences.json"), {
        ...require("../integration/preferences.cjs").load(),
        workspaceNames: { [S.workspace(parent)]: "进境台" },
      });
      const sources = [
        ...Array(11).fill(parent),
        ...Array(5).fill(child),
        other,
      ];
      sources.forEach((cwd, n) => {
        const id = S.hash(["scope-names", n]),
          call = `scope-names-${n}`;
        S.atomic(path.join(library, "stages", id + ".json"), {
          id,
          digest: id,
          date: S.day(),
          at: new Date(Date.now() + n).toISOString(),
          outcome: "change",
          source: { cwd, session: "scope-names", turn: String(n), call },
          items: [
            {
              kind: "finding",
              title: `隔离材料${n}`,
              summary: "同名目录显示验收的合成材料",
            },
          ],
        });
        S.atomic(path.join(library, "bindings", id + ".json"), {
          stage: id,
          digest: id,
          call,
        });
      });
      const before = S.personal();
      await wait(2300);
      await click("整理这一天");
      await check(
        "same-name directories stay in separate groups with exact counts",
        `(()=>{const groups=[...document.querySelectorAll('.scope-project')];return groups.length===3&&groups[0].querySelector('.scope-project-title').textContent.includes('11/11')&&groups[1].querySelector('.scope-project-title').textContent.includes('5/5')&&document.querySelector('.scope-count').textContent.includes('17 份材料 · 3 个项目')})()`,
      );
      await check(
        "same-name groups expose distinct directories; unique names stay concise",
        `(()=>{const paths=[...document.querySelectorAll('.scope-project-directory')].map(e=>e.textContent);return paths.length===2&&paths[0].includes(${JSON.stringify(S.workspace(parent))})&&paths[1].includes(${JSON.stringify(S.workspace(child))})&&!document.querySelectorAll('.scope-project')[2].querySelector('.scope-project-directory')})()`,
      );
      fs.writeFileSync(
        output.replace(".json", "-screen.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      await js(
        `document.querySelectorAll('.scope-project-title input')[0].click()`,
      );
      await wait(100);
      await check(
        "deselecting parent does not deselect same-name child",
        `document.querySelector('.scope-count').textContent.includes('6 份材料 · 2 个项目')&&document.querySelectorAll('.scope-project-title input')[1].checked&&document.querySelectorAll('.scope-project-directory').length===2`,
      );
      win.setBounds({ width: 1024, height: 720 });
      await wait(120);
      await check(
        "long same-name source paths wrap inside the minimum window",
        `document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.scope-project-directory')].every(e=>e.scrollWidth<=e.clientWidth&&e.getBoundingClientRect().right<=innerWidth)`,
      );
      fs.writeFileSync(
        output.replace(".json", "-minimum.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      await click("取消");
      assert.deepEqual(S.personal(), before);
      assert.equal(S.list("jobs").length, 0);
      report.checks.push(
        "preview and selection preserve personal records and start no model job",
      );
    } else if (mode === "state-boundaries") {
      assert(S.HOME.includes("renderer-boundaries"));
      report.tier =
        "production Electron renderer/preload/integration, isolated synthetic complete jobs and simulated Shanghai 04:00 rollover, no model";
      const O = require("../integration/consolidate.cjs"),
        realApply = O.apply,
        badId = "00000000-0000-4000-8000-000000000001",
        goodId = "ffffffff-ffff-4fff-8fff-ffffffffffff",
        attempts = [],
        today = S.day(),
        jobs = path.join(S.library(), "jobs");
      const material = (id) => ({
        id,
        workspace: "",
        kind: "finding",
        title: "隔离验收来源",
        summary: "合成短材料",
        evidence: [],
        relations: [],
      });
      const result = (source, title) => ({
        entries: [
          {
            sources: [source],
            title,
            summary: "完整覆盖的合成结果",
            next: "",
            work: { title, summary: "完整覆盖的合成结果" },
          },
        ],
        highlights: [],
        unprocessed: [],
      });
      const badJob = {
        id: badId,
        startedAt: today + "T00:00:00Z",
        date: today,
        state: "complete",
        policy: "daily-work-v3",
        mode: "drafts",
        materials: [material("bad:0")],
        result: { entries: [], highlights: [], unprocessed: [] },
      };
      O.apply = (...args) => {
        attempts.push(args[0]);
        return realApply(...args);
      };
      try {
        S.atomic(path.join(jobs, badId + ".json"), badJob);
        S.atomic(path.join(jobs, goodId + ".json"), {
          ...badJob,
          id: goodId,
          startedAt: today + "T01:00:00Z",
          materials: [material("good:0")],
          result: result("good:0", "完好任务继续保存"),
        });
        await wait(2300);
        await check(
          "apply failure shows a retained result and retry, while status still succeeds",
          `(()=>{const s=window.jinjingtai.call('status');return s.libraryHealth.available&&document.querySelector('[data-job-apply-error="${badId}"]')?.textContent.includes('部分材料未处理')&&!document.body.innerText.includes('采集状态读取失败')&&!document.body.innerText.includes('正在保存整理结果')})()`,
        );
        assert(
          S.personal().store.records.some(
            (r) => r.title === "完好任务继续保存",
          ),
        );
        assert.equal(S.read(path.join(jobs, goodId + ".json")).applied, true);
        report.checks.push(
          "one failed apply does not starve a subsequent valid complete job",
        );
        await wait(4300);
        assert.deepEqual(attempts, [badId, goodId]);
        report.checks.push(
          "polling does not repeat either a failed apply or an already saved job",
        );
        await click("查看保存问题");
        await check(
          "settings shows save failure and does not claim this result is completed or saved",
          `(()=>{const p=[...document.querySelectorAll('.settings-section > p')].find(p=>p.textContent.includes('部分材料未处理'));return p?.textContent.includes('整理结果未保存')&&!p.textContent.includes('已完成')&&p.querySelector('button')?.textContent.trim()==='重试保存'&&p.getClientRects().length>0})()`,
        );
        await click("重试保存");
        assert.deepEqual(attempts, [badId, goodId, badId]);
        await wait(2200);
        assert.equal(attempts.length, 3);
        await check(
          "a failed explicit retry remains visible and stops automatic retries again",
          `document.body.innerText.includes('部分材料未处理')&&document.body.innerText.includes('自动重试已停止')`,
        );
        S.atomic(path.join(jobs, badId + ".json"), {
          ...badJob,
          result: result("bad:0", "明确重试后保存"),
        });
        await wait(2200);
        assert.equal(attempts.length, 3);
        await click("重试保存");
        assert.deepEqual(attempts, [badId, goodId, badId, badId]);
        assert.equal(S.read(path.join(jobs, badId + ".json")).applied, true);
        assert(
          S.personal().store.records.some((r) => r.title === "明确重试后保存"),
        );
        await check(
          "successful explicit retry clears the save error",
          `!document.body.innerText.includes('整理结果未保存')&&!document.body.innerText.includes('部分材料未处理')`,
        );
        report.applyAttempts = [...attempts];
      } finally {
        O.apply = realApply;
      }
      const tomorrow = new Date(Date.parse(today + "T12:00:00Z") + 86400000)
          .toISOString()
          .slice(0, 10),
        planText = "跨 04:00 仍然保留并保存的规划正文",
        beforeRecords = S.personal().store.records;
      await click("日历");
      await js(
        `document.querySelector('[data-calendar-date="${tomorrow}"]').click()`,
      );
      await wait(120);
      await click("写下规划");
      await fill('textarea[aria-label="未来规划"]', planText);
      await js(
        `window.__qaOriginalDateNow=Date.now;Date.now=()=>${Date.parse(tomorrow + "T04:00:00+08:00")};true`,
      );
      try {
        await wait(1300);
        await check(
          "Shanghai 04:00 rollover retains a visible editable planning draft with original date",
          `document.querySelector('textarea[aria-label="未来规划"]')?.value===${JSON.stringify(planText)}&&document.querySelector('.calendar-summary-header').textContent.includes('今天')&&document.querySelector('.future-plan [role="status"]').textContent.includes('工作日已切换')`,
        );
        fs.writeFileSync(
          output.replace(".json", "-rollover.png"),
          (await win.webContents.capturePage()).toPNG(),
        );
        await click("今日");
        await check(
          "navigation still guards the retained rollover draft",
          `!!document.querySelector('#guard-title')`,
        );
        await click("保存并离开");
        await check(
          "save and leave completes rollover planning without a hidden editor or a stuck guard",
          `!document.querySelector('#guard-title')&&!document.querySelector('textarea[aria-label="未来规划"]')&&document.querySelector('[aria-current="page"]').textContent==='今日'`,
        );
        assert.equal(S.personal().store.plans[tomorrow], planText);
        assert.deepEqual(S.personal().store.records, beforeRecords);
        report.checks.push(
          "rollover save uses the original plan date and preserves every progress record",
        );
        await click("日历");
        await check(
          "saved rollover text is visible as the original date plan and offers no past-date creation",
          `document.querySelector('.calendar-past-plan')?.textContent.includes(${JSON.stringify(planText)})&&![...document.querySelectorAll('button')].some(b=>['写下规划','编辑规划'].includes(b.textContent.trim()))`,
        );
      } finally {
        await js(
          "Date.now=window.__qaOriginalDateNow;delete window.__qaOriginalDateNow;true",
        );
      }
    } else if (mode === "settings-library-boundary") {
      assert(S.HOME.includes("renderer-boundaries"));
      report.tier =
        "production Electron renderer/preload/integration, isolated libraries and synthetic directory source, no model";
      const currentLibrary = S.library(),
        work = path.join(S.HOME, "alias-work");
      fs.mkdirSync(work);
      const workspace = S.workspace(work),
        originalPreferences = {
          fontSize: 16,
          density: "compact",
          decoration: true,
          workspaceNames: { [workspace]: "资料库A原名称" },
        };
      S.atomic(
        path.join(currentLibrary, "preferences.json"),
        originalPreferences,
      );
      S.atomic(path.join(currentLibrary, "stages", "settings-fixture.json"), {
        id: "settings-fixture",
        date: S.day(),
        at: new Date().toISOString(),
        digest: "settings-fixture",
        outcome: "change",
        source: { cwd: work, session: "settings-fixture", turn: "one" },
        items: [
          { kind: "finding", title: "目录名隔离验收", summary: "合成来源" },
        ],
      });
      await click("设置");
      await click("重新检查");
      await js(
        `(()=>{const summary=[...document.querySelectorAll('summary')].find(s=>s.textContent==='整理时使用的目录名称');summary.click()})()`,
      );
      await wait(120);
      await check(
        "a loaded library exposes its saved directory name",
        `document.querySelector('.workspace-mapping input')?.value==='资料库A原名称'`,
      );
      await fill(".workspace-mapping input", "切库仍保留的未保存名称");
      const beforeA = fs.readFileSync(
          path.join(currentLibrary, "preferences.json"),
        ),
        target = path.join(S.HOME, "second-library");
      fs.mkdirSync(target);
      S.selectLibrary(target);
      S.atomic(path.join(target, "preferences.json"), {
        ...originalPreferences,
        fontSize: 17,
        workspaceNames: { [workspace]: "资料库B原名称" },
      });
      const beforeB = fs.readFileSync(path.join(target, "preferences.json"));
      await wait(2200);
      await check(
        "external library switch retains alias draft and disables stale name saving",
        `document.querySelector('.workspace-mapping input')?.value==='切库仍保留的未保存名称'&&[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='保存名称')?.disabled&&[...document.querySelectorAll('[role="alert"]')].some(p=>p.textContent.includes('当前目录名称输入仍保留'))`,
      );
      for (let n = 0; n < 2; n++) {
        await js(
          `(()=>{const summary=[...document.querySelectorAll('summary')].find(s=>s.textContent==='整理时使用的目录名称');summary.click()})()`,
        );
        await wait(120);
      }
      await check(
        "closing and reopening alias controls does not reload the other library over the retained draft",
        `document.querySelector('.workspace-mapping input')?.value==='切库仍保留的未保存名称'&&document.querySelector('.workspace-mapping input').getClientRects().length>0`,
      );
      await click("阅读");
      await check(
        "alias draft still guards tab navigation after external library switch",
        `!!document.querySelector('#guard-title')`,
      );
      await click("保存并离开");
      await check(
        "save and leave refuses stale alias write and retains original input",
        `!document.querySelector('#guard-title')&&document.querySelector('.workspace-mapping input')?.value==='切库仍保留的未保存名称'&&document.querySelector('[role="tab"][aria-selected="true"]').textContent==='Codex连接'`,
      );
      assert(
        fs
          .readFileSync(path.join(currentLibrary, "preferences.json"))
          .equals(beforeA),
      );
      assert(
        fs.readFileSync(path.join(target, "preferences.json")).equals(beforeB),
      );
      await click("阅读");
      await click("放弃修改");
      await js(
        `(()=>{const e=document.querySelector('select[aria-label="正文大小"]');e.value='17';e.dispatchEvent(new Event('change',{bubbles:true}))})()`,
      );
      await wait(120);
      await check(
        "reading size change also refuses stale library write and keeps the loaded preference",
        `document.querySelector('select[aria-label="正文大小"]').value==='16'&&document.body.innerText.includes('设置尚未保存')`,
      );
      assert(
        fs
          .readFileSync(path.join(currentLibrary, "preferences.json"))
          .equals(beforeA),
      );
      assert(
        fs.readFileSync(path.join(target, "preferences.json")).equals(beforeB),
      );
      report.checks.push(
        "both libraries' preference files remain byte-for-byte unchanged after stale alias and reading attempts",
      );
    } else if (mode === "repair-regressions") {
      await check(
        "manual library is a normal empty state",
        `document.body.innerText.includes('尚未连接 Codex，可以直接补记')&&!document.body.innerText.includes('当前采集状态不可核实')`,
      );
      const tomorrow = new Date(Date.parse(S.day() + "T12:00:00Z") + 86400000)
        .toISOString()
        .slice(0, 10);
      for (const choice of ["放弃修改", "保存并离开"]) {
        await click("日历");
        await click("回到今天");
        await js(
          `document.querySelector('[data-calendar-date="${tomorrow}"]').click()`,
        );
        await wait(120);
        await click("写下规划");
        await fill('textarea[aria-label="未来规划"]', "repair-" + choice);
        const previousMonth = await js(
          `document.querySelector('.month-controls h2').textContent`,
        );
        await click("上一月");
        await check(
          "month navigation protects unsaved planning",
          `!!document.querySelector('#guard-title')`,
        );
        await click(choice);
        assert.notEqual(
          await js(`document.querySelector('.month-controls h2').textContent`),
          previousMonth,
        );
        await check(
          "one leave choice completes month navigation",
          `!document.querySelector('#guard-title')&&!document.querySelector('textarea[aria-label="未来规划"]')`,
        );
        if (choice === "保存并离开")
          assert.equal(S.personal().store.plans[tomorrow], "repair-" + choice);
      }
      await click("项目");
      await click("新建项目");
      await fill(".dialog input", "关闭前保存的新项目");
      await js("window.dispatchEvent(new Event('jinjingtai-close'))");
      await wait(120);
      await check(
        "project input protects closing",
        `!!document.querySelector('#guard-title')`,
      );
      await click("继续编辑");
      await check(
        "continue editing retains project input",
        `document.querySelector('.dialog input').value==='关闭前保存的新项目'`,
      );
      await click("取消");
      await click("保存并离开");
      assert(
        S.personal().store.projects.some(
          (p) => p.name === "关闭前保存的新项目",
        ),
      );
      await check(
        "project save leaves once",
        `!document.querySelector('#guard-title')&&!document.querySelector('.dialog input')`,
      );
      await click("新建项目");
      await fill(".dialog input", "放弃的新项目");
      await click("取消");
      await click("放弃修改");
      assert(
        !S.personal().store.projects.some((p) => p.name === "放弃的新项目"),
      );
      await click("设置");
      await check(
        "settings version matches the packaged application version",
        `document.querySelector('.settings-footer span').textContent===${JSON.stringify("进境台 · " + require("../package.json").version)}`,
      );
      await js(
        `document.querySelector('[role="tab"][aria-selected="true"]').focus()`,
      );
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Right" });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Right" });
      await wait(100);
      await check(
        "settings tabs support keyboard selection and focus",
        `document.querySelector('[role="tab"][aria-selected="true"]').textContent==='资料与备份'&&document.activeElement.textContent==='资料与备份'`,
      );
      S.event("error", { code: "SOURCE_SCHEMA_UNSUPPORTED" });
      await wait(2200);
      await click("Codex连接");
      await check(
        "unsupported history contract has direct actionable explanation",
        `[...document.querySelectorAll('p[role="alert"]')].some(p=>p.textContent.includes('历史来源结构')&&p.getClientRects().length>0)`,
      );
      win.setBounds({ width: 1024, height: 720 });
      await wait(100);
      await check(
        "minimum window has no horizontal overflow",
        `document.documentElement.scrollWidth<=innerWidth`,
      );
      fs.writeFileSync(
        output.replace(".json", "-settings.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      await click("今日");
      await click("补记一件事");
      await fill('textarea[aria-label="记录标题"]', "切库前的输入保留");
      const target = path.join(S.HOME, "second-library");
      fs.mkdirSync(target);
      S.selectLibrary(target);
      const targetBefore = fs.readFileSync(path.join(target, "personal.json"));
      await wait(2200);
      await check(
        "external library switch stops stale UI writes",
        `document.body.innerText.includes('资料库已被另一个窗口切换')&&document.querySelector('textarea[aria-label="记录标题"]').value==='切库前的输入保留'`,
      );
      await click("保存补记");
      assert(
        fs
          .readFileSync(path.join(target, "personal.json"))
          .equals(targetBefore),
      );
      assert.equal(S.personal().store.records.length, 0);
      await check(
        "failed cross-library save retains editor",
        `document.querySelector('textarea[aria-label="记录标题"]').value==='切库前的输入保留'`,
      );
      report.checks.push(
        "new library authority is byte-for-byte unchanged after stale save",
      );
    } else if (mode === "retrospective-compact") {
      assert(S.HOME.includes("retrospective-compact"));
      const before = S.personal();
      await click("回望");
      await check(
        "one header for each date, including multiple projects",
        `(()=>{const dates=[...document.querySelectorAll('.review-day > h3')].map(e=>e.textContent);return dates.length===2&&new Set(dates).size===2&&document.querySelectorAll('.review-day').length===2})()`,
      );
      await check(
        "items have titles only before expansion, without repeated row dates",
        `document.querySelectorAll('.review-day .work-heading').length>=3&&!document.querySelector('.review-day .timeline-date')&&!document.querySelector('.review-day .work-heading .work-result')&&!document.querySelector('.review-header + p.muted')`,
      );
      await check(
        "aside text is hidden until opened",
        `!document.body.innerText.includes('保存的每日所得会留在这里')&&[...document.querySelectorAll('.review-aside .review-note p')].every(p=>!p.closest('details').open&&!p.checkVisibility())`,
      );
      report.typography = await js(
        `(()=>{const selectors={page:'.review-header h1',section:'.review-section > h2',date:'.review-day > h3',project:'.review-group > h4',item:'.review-day .work-heading strong',aside:'.review-note h3'};return {fonts:Object.fromEntries(Object.entries(selectors).map(([k,s])=>[k,getComputedStyle(document.querySelector(s)).fontSize])),rowHeights:[...document.querySelectorAll('.review-day .work-heading')].map(e=>e.getBoundingClientRect().height)}})()`,
      );
      assert.deepEqual(report.typography.fonts, {
        page: "28px",
        section: "18px",
        date: "16px",
        project: "13px",
        item: "15px",
        aside: "15px",
      });
      assert(report.typography.rowHeights.every((h) => h >= 44 && h <= 52));
      report.checks.push("deliberate type hierarchy and compact readable rows");
      await js(`document.querySelector('.review-day .work-heading').click()`);
      await wait(100);
      await check(
        "summary is available inside the opened details",
        `document.querySelector('.review-day .work-group[open] .work-details > .outcome-summary').getBoundingClientRect().height>0`,
      );
      await js(
        `document.querySelector('.review-day .work-group[open] button.record-row').click()`,
      );
      await wait(100);
      await check(
        "original record remains editable in the drawer",
        `!!document.querySelector('.detail-drawer')&&!!document.querySelector('[aria-label="编辑记录"]')`,
      );
      await click("关闭详情");
      await js(
        `document.querySelector('.review-day .work-group[open] > summary').click()`,
      );
      assert.deepEqual(S.personal(), before);
      fs.writeFileSync(
        output.replace(".json", "-screen.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      win.setBounds({ width: 1024, height: 720 });
      await wait(100);
      await check(
        "compact retrospective fits the minimum window",
        `document.documentElement.scrollWidth<=innerWidth`,
      );
      await check(
        "larger reading preference still scales the item titles",
        `(()=>{const root=document.querySelector('.workbench'),old=root.style.getPropertyValue('--reading-font');root.style.setProperty('--reading-font','20px');const ok=getComputedStyle(document.querySelector('.review-day .work-heading strong')).fontSize==='19px'&&document.documentElement.scrollWidth<=innerWidth;root.style.setProperty('--reading-font',old);return ok})()`,
      );
      fs.writeFileSync(
        output.replace(".json", "-minimum.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
    } else if (mode === "saved-flow" || mode === "saved-flow-restart") {
      assert(S.HOME.includes("saved-flow-home"));
      report.tier =
        "packaged production Electron, isolated existing records, no model";
      const baseline = S.personal();
      assert(baseline.store.records.some((r) => !r.confirmed));
      await check(
        "home has no confirmation badge, review mode or confirmation footer",
        `!document.querySelector('.work-evidence-status')&&!document.querySelector('.day-footer')&&!document.querySelector('.draft-label')&&!/待确认|审阅草稿|确认并保存/.test(document.body.innerText)`,
      );
      await check(
        "saved content is immediately visible",
        `document.querySelectorAll('.work-heading').length>0`,
      );
      await click("回望");
      await check(
        "legacy unconfirmed saved record participates immediately in retrospective",
        `document.querySelector('.work-group')&&window.jinjingtai.call('load',null,null).store.records.some(r=>!r.confirmed&&r.title==='无需确认直接回望验收')&&!document.querySelector('.draft-label')&&!document.querySelector('.day-footer')`,
      );
      assert.deepEqual(S.personal(), baseline);
      await click("今日");
      if (mode === "saved-flow") {
        await click("编辑回顾");
        await fill('textarea[aria-label="今日所得"]', "简化流程保存验收");
        await click("保存回顾");
        await click("回望");
        await check(
          "saved handwritten note enters retrospective without another confirmation",
          `document.body.innerText.includes('简化流程保存验收')`,
        );
        await click("今日");
        await js(`document.querySelector('.work-heading').click()`);
        await wait(100);
        await js(
          `document.querySelector('.work-group[open] button.record-row').click()`,
        );
        await wait(100);
        await check(
          "details retain editing and removal without a confirmation action",
          `document.querySelector('[aria-label="编辑记录"]')&&document.querySelector('[aria-label="记录选项"]')&&!document.querySelector('.detail-drawer .drawer-footer')`,
        );
        await click("编辑记录");
        const original = await js(
          `document.querySelector('textarea[aria-label="记录标题"]').value`,
        );
        await fill('textarea[aria-label="记录标题"]', original + " · 保存验收");
        await click("保存修改");
        await click("关闭详情");
        const after = S.personal();
        for (const r of baseline.store.records) {
          const saved = after.store.records.find((x) => x.id === r.id);
          assert.equal(saved.change, r.change);
          assert.deepEqual(saved.sourceIds, r.sourceIds);
          assert.deepEqual(saved.attachments, r.attachments);
          assert.equal(saved.confirmed, r.confirmed);
        }
        report.checks.push(
          "edit preserves bodies, sources, attachments and legacy confirmation metadata",
        );
      } else {
        await check(
          "saved note survives reopening",
          `window.jinjingtai.call('load',null,null).store.notes['${S.day()}'].lesson==='简化流程保存验收'`,
        );
        assert(
          baseline.store.records.some((r) => r.title.endsWith(" · 保存验收")),
        );
        report.checks.push("edited title survives independent app restart");
      }
      fs.writeFileSync(
        output.replace(".json", "-home.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      win.setBounds({ width: 1024, height: 720 });
      await wait(100);
      await check(
        "simplified page fits minimum native window",
        `document.documentElement.scrollWidth<=innerWidth&&!document.querySelector('.day-footer')`,
      );
      const beforeBrowse = S.personal();
      await click("项目");
      await js(
        `[...document.querySelectorAll('.project-option')].find(b=>b.querySelector('strong')?.textContent==='隔离验收项目').click()`,
      );
      await wait(120);
      await check(
        "current progress excludes archived and negated records",
        `!!document.querySelector('.project-current')&&!/归并旧稿不应成为当前进展|已推翻的旧方案/.test(document.querySelector('.project-current').innerText)`,
      );
      await check(
        "current progress paragraphs do not overlap",
        `(()=>{const rows=[...document.querySelectorAll('.project-current p')].map(e=>e.getBoundingClientRect());return rows.length>1&&rows.every((r,i)=>!i||r.top>=rows[i-1].bottom)})()`,
      );
      await click("日历");
      await check(
        "calendar keeps original scale and independent scrolling",
        `getComputedStyle(document.querySelector('.calendar-day')).minHeight==='70px'&&getComputedStyle(document.querySelector('.calendar-summary-body')).overflowY==='auto'&&document.documentElement.scrollWidth<=innerWidth`,
      );
      await click("设置");
      await check(
        "settings render without confirmation UI",
        `!!document.querySelector('.settings-body')&&!document.querySelector('.day-footer')`,
      );
      await click("今日");
      assert.deepEqual(S.personal(), beforeBrowse);
      report.checks.push("browsing all pages preserves saved authority");
    } else if (mode === "short-input-result") {
      assert(S.HOME.includes("short-input-live-home"));
      report.tier =
        "packaged production UI, actual model result from authorized stages, isolated output library, no additional model";
      const before = S.personal(),
        job = S.list("jobs").find(
          (j) =>
            j.inputVersion ===
              (process.env.JINJINGTAI_QA_INPUT_VERSION || "short-stage-v2") &&
            j.state === "complete",
        );
      assert(job?.applied);
      assert(job.added > 0);
      await click("今日");
      fs.writeFileSync(
        output.replace(".json", "-home.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      report.ui = await js(
        `({date:document.querySelector('.day-date')?.textContent,heading:document.querySelector('h1')?.textContent,drafts:document.querySelectorAll('.draft-label').length,buttons:[...document.querySelectorAll('.day-actions button')].map(b=>b.textContent.trim())})`,
      );

      const expected = job.result.entries.map((e) =>
        JSON.stringify([...e.sources].sort()),
      );
      await check(
        "real short-input model result is shown as editable drafts for its actual date",
        `!document.querySelector('.draft-label')&&window.jinjingtai.call('load',null,null).store.records.some(r=>!r.confirmed&&r.date==='${job.date}'&&${JSON.stringify(expected)}.includes(JSON.stringify([...(r.sourceIds||[])].sort())))`,
      );
      assert.deepEqual(S.personal(), before);
      const ids = require("../integration/consolidate.cjs")
          .preview(job.date)
          .filter((s) => !s.recovery && s.items.some((i) => !i.protected))
          .map((s) => s.id),
        repeat = require("../integration/consolidate.cjs").start(
          job.date,
          ids,
          { dailySummary: true },
        );
      assert(repeat.skipped || repeat.duplicate);
      report.checks.push(
        "repeating the same scope without new materials starts no model process",
      );
      fs.writeFileSync(
        output.replace(".json", "-home.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      report.job = {
        id: job.id,
        date: job.date,
        added: job.added,
        unprocessed: job.unprocessed.length,
      };
    } else if (mode === "calendar") {
      report.tier =
        "packaged production Electron, actual personal library read only, native wheel input, no model";
      const original = S.personal();
      await click("日历");
      await js(
        `document.querySelector('[data-calendar-date="2026-10-06"]').click()`,
      );
      await wait(100);
      await check(
        "calendar groups saved records into complete works by project",
        `document.querySelectorAll('.calendar-work').length>0&&document.querySelectorAll('.calendar-work').length<window.jinjingtai.call('load',null,null).store.records.filter(r=>r.date==='2026-10-06').length&&document.querySelector('.calendar-project h3 svg')`,
      );
      await check(
        "date header and body use distinct layout regions",
        `document.querySelector('.calendar-summary-header').parentElement===document.querySelector('.calendar-summary-body').parentElement&&getComputedStyle(document.querySelector('.calendar-summary-body')).overflowY==='auto'`,
      );
      await check(
        "original large month size and column proportions are restored",
        `document.querySelector('.calendar-month').getBoundingClientRect().width>=380&&getComputedStyle(document.querySelector('.calendar-day')).minHeight==='83px'&&getComputedStyle(document.querySelector('.month-controls h2')).fontSize==='24px'`,
      );
      fs.writeFileSync(
        output.replace(".json", "-home.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      win.setBounds({ width: 1024, height: 720 });
      await wait(160);
      await check(
        "minimum window contains both columns without page overflow",
        `document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.calendar-layout').getBoundingClientRect().bottom<=innerHeight&&document.querySelector('.calendar-summary-body').clientHeight>100`,
      );
      await check(
        "original minimum-window calendar scale is retained",
        `document.querySelector('.calendar-month').getBoundingClientRect().width>=315&&getComputedStyle(document.querySelector('.calendar-day')).minHeight==='70px'`,
      );
      fs.writeFileSync(
        output.replace(".json", "-1024.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      await js(
        `document.querySelectorAll('.calendar-other').forEach(d=>d.open=true)`,
      );
      await wait(100);
      const before = await js(
        `(()=>{const b=document.querySelector('.calendar-summary-body'),r=b.getBoundingClientRect();return{month:document.querySelector('.calendar-month').getBoundingClientRect().top,header:document.querySelector('.calendar-summary-header').getBoundingClientRect().top,x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),height:b.clientHeight,content:b.scrollHeight}})()`,
      );
      assert(
        before.content > before.height,
        "actual expanded works must overflow for native scroll verification",
      );
      win.webContents.sendInputEvent({
        type: "mouseWheel",
        x: before.x,
        y: before.y,
        deltaY: -450,
        deltaX: 0,
      });
      await wait(300);
      const after = await js(
        `({month:document.querySelector('.calendar-month').getBoundingClientRect().top,header:document.querySelector('.calendar-summary-header').getBoundingClientRect().top,body:document.querySelector('.calendar-summary-body').scrollTop,page:document.querySelector('.calendar-pane').scrollTop})`,
      );
      assert(after.body > 0, "native wheel scrolls day body");
      assert.equal(after.month, before.month);
      assert.equal(after.header, before.header);
      assert.equal(after.page, 0);
      report.scroll = { before, after };
      report.checks.push(
        "native wheel scrolls only right body; month and date header stay fixed",
      );
      win.webContents.sendInputEvent({
        type: "mouseWheel",
        x: before.x,
        y: before.y,
        deltaY: -4500,
        deltaX: 0,
      });
      await wait(200);
      await check(
        "scroll at body boundary cannot move whole page",
        `document.querySelector('.calendar-pane').scrollTop===0`,
      );
      await js(
        `document.querySelector('[data-calendar-date="2026-10-05"]').click()`,
      );
      await wait(120);
      await check(
        "switching date resets body scroll",
        `document.querySelector('.calendar-summary-body').scrollTop===0&&document.querySelector('.calendar-summary-header h2').textContent==='10月5日'`,
      );
      await click("下一月");
      await check(
        "month navigation selects a date within displayed month",
        `document.querySelector('.calendar-day.chosen')&&!document.querySelector('.calendar-day.chosen').classList.contains('outside')`,
      );
      await check(
        "beyond one-month planning limit is disabled",
        `[...document.querySelectorAll('[data-calendar-date]')].filter(b=>b.dataset.calendarDate>'2026-11-06').every(b=>b.disabled)`,
      );
      await js(
        `document.querySelector('[data-calendar-date="2026-11-06"]').click()`,
      );
      await wait(100);
      await check(
        "future dates offer local planning rather than completed progress",
        `document.querySelector('.future-plan')&&!document.querySelector('.calendar-work')`,
      );
      await click("回到今天");
      await js(
        `document.querySelector('.calendar-summary-state .text-button')?.click()`,
      );
      await wait(100);
      await check(
        "calendar organizing opens the selected date scope without launching a model",
        `document.querySelector('#scope-title')?.textContent.includes('2026年10月6日')`,
      );
      await click("取消");
      await js(
        `document.querySelector('[data-calendar-date="2026-10-01"]').click()`,
      );
      await wait(100);
      await click("补记一件事");
      await check(
        "open editor keeps calendar and independent body within viewport",
        `document.querySelector('.detail-drawer')&&document.querySelector('.calendar-summary-body').clientHeight>90&&document.querySelector('.calendar-layout').getBoundingClientRect().bottom<=innerHeight`,
      );
      await click("关闭详情");
      await click("回到今天");
      assert.deepEqual(S.personal(), original);
      report.checks.push(
        "browsing and scrolling preserve all personal records, notes and grouping metadata",
      );
    } else if (mode === "calendar-plan" || mode === "calendar-plan-reopen") {
      assert(S.HOME.includes("calendar-plan-home"));
      report.tier =
        "packaged production Electron, isolated personal library, production planning IPC, no model";
      const date = S.day(Date.now() + 86400000);
      await click("日历");
      await js(
        `document.querySelector('[data-calendar-date="${date}"]').click()`,
      );
      await wait(100);
      if (mode === "calendar-plan-reopen") {
        await check(
          "future plan survives full packaged process restart",
          `document.querySelector('.calendar-plan-text')?.textContent==='推进一件完整的工作'`,
        );
      } else {
        const original = S.personal();
        await click("写下规划");
        await fill('[aria-label="未来规划"]', "推进一件完整的工作");
        await click("取消");
        await check(
          "cancel protects unsaved plan",
          `document.querySelector('#guard-title')?.textContent==='还有未保存的内容'`,
        );
        await click("继续编辑");
        await js(
          `document.querySelector('[data-calendar-date="${S.day(Date.now())}"]').click()`,
        );
        await wait(100);
        await check(
          "date navigation protects unsaved plan",
          `!!document.querySelector('#guard-title')`,
        );
        await click("继续编辑");
        await check(
          "continue editing preserves plan text and selected date",
          `document.querySelector('[aria-label="未来规划"]').value==='推进一件完整的工作'&&document.querySelector('.calendar-day.chosen').dataset.calendarDate==='${date}'`,
        );
        await click("保存规划");
        assert.equal(S.personal().store.plans[date], "推进一件完整的工作");
        assert.deepEqual(S.personal().store.records, original.store.records);
        report.checks.push(
          "production IPC saves only selected future plan, preserving original records",
        );
      }
    } else if (mode === "calendar-before") {
      report.tier =
        "packaged production Electron, actual library read-only calendar capture";
      const before = S.personal();
      await click("日历");
      fs.writeFileSync(
        output.replace(".json", "-home.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      assert.deepEqual(S.personal(), before);
    } else if (mode === "organize") {
      report.tier =
        "actual Explorer process tree, packaged production UI, real authorized short stage, real CLI model, isolated output library";
      report.pid = process.pid;
      report.parent = process.ppid;
      assert(S.HOME.includes("explorer-organizer-"));
      assert.equal(S.personal().store.records.length, 0);
      await click("整理这一天");
      await check(
        "range dialog includes only one authorized stage by default",
        `document.querySelector('.scope-count').textContent.includes('已选 1 份材料')`,
      );
      await click("开始整理");
      let job;
      const deadline = Date.now() + 250000;
      while (Date.now() < deadline) {
        await wait(2000);
        job = S.list("jobs").at(-1);
        if (job && ["complete", "failed", "cancelled"].includes(job.state))
          break;
      }
      assert.equal(
        job?.state,
        "complete",
        job?.error || "model task did not finish",
      );
      await wait(2500);
      await check(
        "actual model result enters selected-day editable draft flow",
        `document.querySelector('.work-group')&&!document.querySelector('.draft-label')`,
      );
      assert(
        S.personal().store.records.every(
          (r) => r.date === job.date && !r.confirmed,
        ),
      );
      report.job = {
        id: job.id,
        date: job.date,
        state: job.state,
        usage: job.usage,
        requestChars: job.requestChars,
        processStarts: job.processStarts,
        networkRetriesObserved: job.diagnostic?.networkRetriesObserved,
        added: job.added,
        sourceIds: job.materials.map((m) => m.id),
      };
    } else if (mode === "missing") {
      await check(
        "missing authority has an explicit error instead of empty progress",
        `!!document.querySelector('.library-error')&&!document.querySelector('.empty-day')&&document.body.textContent.includes('记录文件缺失')`,
      );
      await check(
        "organize is disabled and no empty authority is recreated",
        `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='整理这一天').disabled`,
      );
      assert(!fs.existsSync(path.join(S.config().library, "personal.json")));
    } else if (mode === "read") {
      const p = S.personal();
      assert(
        p.store.records.some(
          (r) =>
            r.title === "重开仍保留我的补记" &&
            r.manual &&
            r.confirmed &&
            r.change === "这是我自己写的长期记录。",
        ),
      );
      assert.equal(
        p.store.notes[S.day(Date.now() - 86400000)].lesson,
        "这段回顾需要长期保留。",
      );
      await check(
        "independent process restores the last viewed historical day",
        `document.querySelector('.historical-date-label')?.textContent==='历史日'&&document.body.textContent.includes('重开仍保留我的补记')`,
      );
      await check(
        "confirmed manual record is not labelled task completed",
        `!document.querySelector('.day-overview').textContent.includes('完成')&&document.querySelector('.day-overview').textContent.includes('事项')`,
      );
      const snapshot = JSON.stringify(S.personal());
      await click("回到今天");
      await check(
        "today differs from the restored day",
        `!document.querySelector('.historical-date-label')`,
      );
      assert.equal(JSON.stringify(S.personal()), snapshot);
      await check(
        "unorganized captured work remains visible after reopening",
        `document.querySelector('.day-overview').textContent.includes('新材料待整理')`,
      );
    } else if (mode === "write") {
      await check(
        "real work groups replace per-turn rows in the initial overview",
        `document.querySelectorAll('.work-group').length===1&&document.querySelectorAll('.work-group:not([open]) .record-row').length>1`,
      );
      await check(
        "result and verification boundary are separately readable",
        `document.querySelector('.work-result-caption').textContent==='本日推进'&&document.querySelector('.work-evidence-status').textContent.includes('待核对')`,
      );
      await check(
        "captured but unprocessed progress is clearly distinguished",
        `document.querySelector('.day-overview').textContent.includes('1份新材料待整理')`,
      );
      const before = S.personal();
      await js(`document.querySelector('.work-heading').click()`);
      await wait(80);
      await check(
        "details keep the next step and original editable evidence",
        `document.querySelector('.work-group[open] .work-next')&&document.querySelector('.work-group[open] .work-records-head').textContent.includes('记录与依据')`,
      );
      assert.deepEqual(S.personal(), before);
      await click("日历");
      await check(
        "calendar marks collected days without manufactured records",
        `!!document.querySelector('.material-dot')&&[...document.querySelectorAll('.calendar-day')].some(b=>b.getAttribute('aria-label').includes('有材料待整理'))`,
      );
      await click("今日");
      await click("上一日");
      await click("补记一件事");
      await fill('[aria-label="记录标题"]', "重开仍保留我的补记");
      await fill(
        '[placeholder="与之前相比，发生了什么？"]',
        "这是我自己写的长期记录。",
      );
      await click("保存补记");
      await click("关闭详情");
      await click("编辑回顾");
      await fill('[aria-label="今日所得"]', "这段回顾需要长期保留。");
      await click("保存回顾");
      await check(
        "view state and text are saved through production IPC",
        `document.querySelector('.historical-date-label')?.textContent==='历史日'&&document.body.textContent.includes('重开仍保留我的补记')`,
      );
      assert.equal(
        S.read(path.join(S.HOME, "desktop-view.json")).libraries[
          S.hash(S.library())
        ].date,
        S.day(Date.now() - 86400000),
      );
    } else if (mode === "formal") {
      report.tier =
        "packaged production Electron, actual personal library read only, no new model";
      const original = S.personal();
      await check(
        "all actual projects and original records remain loaded",
        `window.jinjingtai.call('load',null,null).store.records.length>=20&&document.querySelectorAll('.work-project-head').length>=3`,
      );
      await check(
        "overview counts work rather than splitting into every record",
        `document.querySelector('.day-overview').textContent.includes('件事项')&&document.querySelectorAll('.work-group').length<window.jinjingtai.call('load',null,null).store.records.filter(r=>r.date==='2026-10-06').length`,
      );
      await check(
        "ordinary text, verification status and result have distinct roles",
        `document.querySelector('.work-result')&&!document.querySelector('.work-evidence-status')&&document.querySelector('.work-project-head svg')`,
      );
      await js(`document.querySelector('.work-heading').click()`);
      await wait(100);
      await check(
        "original evidence is available behind the work summary",
        `!!document.querySelector('.work-group[open] .work-records-head')`,
      );
      assert.deepEqual(S.personal(), original);
      await js(`document.querySelector('.work-heading').click()`);
      fs.writeFileSync(
        output.replace(".json", "-home.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      win.setBounds({ width: 1024, height: 720 });
      await wait(120);
      await check(
        "minimum native window has no horizontal overflow",
        `document.documentElement.scrollWidth<=innerWidth&&!document.querySelector('.day-footer')`,
      );
      fs.writeFileSync(
        output.replace(".json", "-1024.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
    }
    if (!report.checks.length && !["calendar-before"].includes(mode))
      throw Error("QA_CHECKS_REQUIRED: unsupported or empty mode " + mode);
    assert.deepEqual(errors, []);
    report.passed = true;
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
  } catch (e) {
    report.error = e.stack;
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    throw e;
  }
};
