const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
// The portable app must use the same physical state as Codex; MSIX virtualizes AppData.
const locator = path.join(
  path.dirname(process.execPath),
  "state-location.json",
);
let locatorError = false;
try {
  if (!process.env.JINJINGTAI_HOME && fs.existsSync(locator)) {
    const location = JSON.parse(fs.readFileSync(locator, "utf8"));
    if (typeof location.home !== "string" || !path.isAbsolute(location.home))
      throw Error("INVALID_STATE_LOCATION");
    process.env.JINJINGTAI_HOME = location.home;
  }
} catch {
  locatorError = true;
}
const smoke = process.argv.includes("--smoke");
const qa = process.argv.includes("--qa") || smoke;
const integrationQa =
  process.argv.includes("--integration-qa") ||
  process.argv.includes("--integration-live-qa");
if (integrationQa) {
  let productionHome;
  try {
    productionHome = JSON.parse(fs.readFileSync(locator, "utf8")).home;
  } catch {}
  try {
    require("./qa-environment.cjs").isolatedQa(
      process.env,
      productionHome,
      path.join(__dirname, "..", ".local-data", "profile"),
    );
  } catch (error) {
    console.error(error.message);
    app.exit(1);
  }
}
app.setName("进境台");
// This portable app is updated in place. Never reuse cached file:// bundles.
app.commandLine.appendSwitch("disable-http-cache");
app.setPath(
  "userData",
  process.env.JINJINGTAI_PROFILE ||
    path.join(__dirname, "..", ".local-data", qa ? "qa-profile" : "profile"),
);
if (!qa && !integrationQa && !app.requestSingleInstanceLock()) app.exit(0);
let win;
let closing = false;
app.whenReady().then(async () => {
  if (locatorError) {
    await dialog.showMessageBox({
      type: "error",
      message: "资料位置配置无法读取",
      detail:
        "进境台没有打开空资料库。请检查软件旁的 state-location.json，原有记录仍保留。",
    });
    app.exit(1);
    return;
  }
  if (!qa) {
    const S = require("../integration/store.cjs");
    try {
      const c = S.config();
      S.diagnostic("desktop-start-" + process.pid + ".json", {
        at: new Date().toISOString(),
        appPath: app.getAppPath(),
        home: S.HOME,
        physicalHome: fs.existsSync(S.HOME)
          ? fs.realpathSync.native(S.HOME)
          : null,
        library: c.library,
        enabled: c.enabled,
        profile: app.getPath("userData"),
        override: !!process.env.JINJINGTAI_HOME,
      });
    } catch {}
  }
  win = new BrowserWindow({
    width: 1180,
    height: 850,
    minWidth: 1024,
    minHeight: 720,
    title: "进境台 · 见日有所行，知身有所至",
    icon: path.join(
      __dirname,
      "..",
      "dist",
      "client",
      "assets",
      "ink-circle.png",
    ),
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    show: !qa && !integrationQa,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      offscreen: qa || integrationQa,
      additionalArguments: qa ? ["--jinjingtai-prototype"] : [],
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  win.on("close", (event) => {
    if (closing || qa) return;
    event.preventDefault();
    win.webContents.executeJavaScript(
      "window.dispatchEvent(new Event('jinjingtai-close'))",
    );
  });
  ipcMain.on("jinjingtai:close-approved", (event) => {
    if (event.sender === win.webContents) {
      closing = true;
      win.destroy();
    }
  });
  win.setMenu(null);
  if (!qa) require("./integration.cjs").setup(win);
  require("./window-security.cjs").protectContents(win.webContents);
  const errors = [];
  win.webContents.on("console-message", (event) => {
    if (event.level === "error") errors.push(event.message);
  });
  await win.webContents.session.clearCache();
  const entry = path.join(__dirname, "..", "dist", "client", "index.html");
  await win.loadFile(entry, {
    query: {
      build: require("node:crypto")
        .createHash("sha256")
        .update(fs.readFileSync(entry))
        .digest("hex")
        .slice(0, 16),
    },
  });
  if (!qa && !integrationQa) {
    const S = require("../integration/store.cjs"),
      file = path.join(S.HOME, "connection.json");
    const probe = (reader) => {
      try {
        const bytes = reader.readFileSync(file);
        const c = JSON.parse(bytes);
        return {
          exists: true,
          bytes: bytes.length,
          enabled: c.enabled,
          library: c.library,
        };
      } catch (e) {
        return { error: e.code || e.name };
      }
    };
    setTimeout(async () => {
      try {
        S.diagnostic("desktop-loaded-" + process.pid + ".json", {
          at: new Date().toISOString(),
          pid: process.pid,
          home: S.HOME,
          nodeFs: probe(fs),
          nativeFs: probe(require("original-fs")),
          config: S.config(),
          entryHash: require("node:crypto")
            .createHash("sha256")
            .update(fs.readFileSync(entry))
            .digest("hex"),
          ui: await win.webContents.executeJavaScript(
            `(()=>{let personal;try{const p=window.jinjingtai.call('load',null,null);personal={records:p.store.records.length,revision:p.revision}}catch(e){personal={error:e.message}}return {scripts:[...document.scripts].map(s=>s.src),date:document.querySelector('.day-date')?.textContent,overview:document.querySelector('.day-overview')?.textContent,works:document.querySelectorAll('.work-group').length,text:document.querySelector('.capture-status')?.textContent,personal,ipc:window.jinjingtai.call('status').config}})()`,
          ),
        });
      } catch {}
    }, 1500);
  }
  if (process.argv.includes("--connection-check")) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const check = await win.webContents.executeJavaScript(
      `(()=>{const s=window.jinjingtai.call('status');return {enabled:s.config.enabled,library:s.config.library,stages:s.stages.length,personalRecords:window.jinjingtai.call('load',null,null).store.records.length};})()`,
    );
    await win.webContents.executeJavaScript(
      `document.querySelector('[aria-label="上一日"]').click()`,
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='整理这一天').click()`,
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    check.ui = await win.webContents.executeJavaScript(
      `({date:document.querySelector('.day-date').textContent,rows:document.querySelectorAll('.record-row').length,status:document.querySelector('.capture-status').textContent,notice:document.querySelector('[role="status"]')?.textContent||''})`,
    );
    fs.writeFileSync(
      path.join(__dirname, "..", "normal-connection-check.json"),
      JSON.stringify(
        {
          tier: "normal packaged desktop startup, existing real library, no QA environment",
          at: new Date().toISOString(),
          ...check,
        },
        null,
        2,
      ),
    );
    await win.webContents.executeJavaScript(
      `document.querySelector('.scope-dialog .dialog-actions button')?.click()`,
    );
  }
  if (integrationQa) {
    try {
      await require("./integration-qa.cjs").run(
        win,
        errors,
        process.argv.includes("--integration-live-qa"),
      );
      app.exit(0);
    } catch (e) {
      console.error(e);
      app.exit(1);
    }
    return;
  }
  if (qa) {
    if (smoke) {
      try {
        await win.webContents.executeJavaScript(
          "Promise.all([document.fonts.load('16px \"Jinjingtai Sans\"', '进境台'), document.fonts.load('16px \"Jinjingtai Serif\"', '进境台')]).then(groups => { if(groups.some(g => !g.length || g.some(f => f.status !== 'loaded'))) throw Error('FONT_LOAD_FAILED'); return document.fonts.ready.then(() => true); })",
        );
        const valid = await win.webContents.executeJavaScript(
          "document.body.textContent.includes('今日有所进') && [...document.images].every(i=>i.complete&&i.naturalWidth>0)",
        );
        if (!valid || errors.length)
          throw Error("发行包界面加载失败：" + errors.join(";"));
        const output = process.env.JINJINGTAI_QA_OUTPUT;
        if (output)
          fs.writeFileSync(
            output,
            JSON.stringify(
              {
                passed: true,
                electron: process.versions.electron,
                appPath: app.getAppPath(),
                errors,
              },
              null,
              2,
            ),
          );
        console.log("Portable desktop smoke passed");
        app.exit(0);
      } catch (error) {
        console.error(error);
        app.exit(1);
      }
      return;
    }
    try {
      await require("./qa.cjs").run(win, errors);
      app.exit(0);
    } catch (error) {
      fs.mkdirSync(path.join(__dirname, "..", "qa"), { recursive: true });
      fs.writeFileSync(
        path.join(__dirname, "..", "qa", "failure.txt"),
        error.stack,
      );
      console.error(error);
      app.exit(1);
    }
  }
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  if (!qa) require("../integration/consolidate.cjs").shutdown();
});
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});
