const { ipcMain, dialog, shell, app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const S = require("../integration/store.cjs");
const C = require("../integration/connection.cjs");
const O = require("../integration/consolidate.cjs");
const P = require("../integration/preferences.cjs");
const { documentPath } = require("./document-path.cjs");
function setup(win) {
  C.recover();
  // A missing authority is an explicit UI error, not a reason to skip IPC setup.
  try {
    O.recover();
  } catch {
    /* status/load report the actual local failure. */
  }
  const sync = (name, fn) =>
    ipcMain.on("jinjingtai:" + name, (event, ...args) => {
      if (event.sender !== win.webContents) {
        event.returnValue = { ok: false, error: "INVALID_SENDER" };
        return;
      }
      try {
        event.returnValue = { ok: true, value: fn(...args) };
      } catch (e) {
        event.returnValue = {
          ok: false,
          error: /^[A-Z_]+$/.test(e.message)
            ? e.message
            : "LOCAL_OPERATION_FAILED",
        };
      }
    });
  const inLibrary = (expectedLibraryId, fn) =>
    S.withLock(() => {
      if (S.personal().libraryId !== expectedLibraryId)
        throw Error("LIBRARY_CHANGED");
      return fn();
    });
  sync("load", (legacy, sample) => {
    return require("../integration/migration.cjs").migrate(
      legacy,
      sample,
      app.getPath("userData"),
    );
  });
  sync("save", (store, revision, libraryId) =>
    S.savePersonal(store, revision, libraryId),
  );
  sync(
    "view-state",
    () =>
      S.read(path.join(S.HOME, "desktop-view.json"), {}).libraries?.[
        S.hash(S.library())
      ] || {},
  );
  sync("view-state-save", (date) => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date ||
      date > S.day()
    )
      throw Error("INVALID_DATE");
    const file = path.join(S.HOME, "desktop-view.json"),
      view = S.read(file, {});
    view.libraries = { ...view.libraries, [S.hash(S.library())]: { date } };
    S.atomic(file, view);
    return true;
  });
  sync("status", () => S.status());
  ipcMain.handle(
    "jinjingtai:check-connection",
    async (event, expectedLibraryId) => {
      if (event.sender !== win.webContents) throw Error("INVALID_SENDER");
      if (S.personal().libraryId !== expectedLibraryId)
        throw Error("LIBRARY_CHANGED");
      const result = await require("../integration/connection-check.cjs").check(
        S.config(),
        C.codexHome(),
      );
      if (S.personal().libraryId !== expectedLibraryId)
        throw Error("LIBRARY_CHANGED");
      return result;
    },
  );
  sync("preview", (date) => O.preview(date));
  sync("preferences", () => P.load());
  sync("preferences-save", (value, libraryId) => P.save(value, libraryId));
  sync("pause", (paused) => {
    if (typeof paused !== "boolean") throw Error("INVALID_PAUSE");
    return P.pause(paused);
  });
  sync("workspace-list", () => {
    const groups = new Map();
    const projectOf = P.createProjectResolver();
    for (const stage of S.list("stages")) {
      const cwd = stage.source.cwd,
        p = projectOf(cwd),
        group = groups.get(p.workspace);
      if (group) {
        if (!group.dirs.includes(cwd)) group.dirs.push(cwd);
      } else groups.set(p.workspace, { cwd, ...p, dirs: [cwd] });
    }
    return [...groups.values()];
  });
  sync("open-library", () => {
    shell.openPath(S.library());
    return true;
  });
  ipcMain.handle("jinjingtai:maintenance", async (event, action) => {
    if (event.sender !== win.webContents) throw Error("INVALID_SENDER");
    if (action === "disconnect") {
      const answer = await dialog.showMessageBox(win, {
        type: "question",
        buttons: ["取消", "撤销连接"],
        defaultId: 0,
        cancelId: 0,
        message: "撤销进境台与 Codex 的连接？",
        detail:
          "停止接收新记录，移除进境台的 Hook 和记录指令。已有资料及其他 Codex 工具保留。",
      });
      if (answer.response === 0) return { cancelled: true };
      return C.disconnect();
    }
    if (["open-library", "open-state", "guide", "licenses"].includes(action)) {
      const file =
        action === "open-state"
          ? S.HOME
          : action === "open-library"
            ? S.library()
            : documentPath(app.getAppPath(), app.isPackaged, action);
      if (!fs.existsSync(file)) throw Error("FILE_MISSING");
      const failure = await shell.openPath(file);
      if (failure) throw Error("OPEN_FAILED");
      return { opened: true };
    }
    if (action === "backup") {
      const chosen = await dialog.showOpenDialog(win, {
        title: "选择备份保存位置",
        properties: ["openDirectory", "createDirectory"],
      });
      if (chosen.canceled) return { cancelled: true };
      const node = require("../integration/node-runtime.cjs").materialize(
        require("../integration/node-runtime.cjs").source(
          app.getAppPath(),
          S.config().runtimeNode,
        ),
        path.join(S.HOME, "runtime", "node.exe"),
      );
      const result = await new Promise((resolve, reject) => {
        require("node:child_process").execFile(
          node,
          [
            path.join(__dirname, "..", "integration", "preferences.cjs"),
            "backup",
            chosen.filePaths[0],
          ],
          {
            windowsHide: true,
            env: { ...process.env, JINJINGTAI_HOME: S.HOME },
            timeout: 600000,
          },
          (error, stdout) => {
            if (error) return reject(Error("BACKUP_FAILED"));
            try {
              resolve(JSON.parse(stdout));
            } catch {
              reject(Error("BACKUP_FAILED"));
            }
          },
        );
      });
      shell.showItemInFolder(result.path);
      return result;
    }
    if (action === "scope") {
      const c = S.config();
      if (
        c.connectionError ||
        c.disconnected ||
        (!c.enabled && !c.paused) ||
        !c.instructionFiles?.length
      )
        throw Error("CONNECTION_NOT_INSTALLED");
      const choice = await dialog.showMessageBox(win, {
        type: "question",
        buttons: ["所有正常目录", "选择部分目录", "取消"],
        cancelId: 2,
        defaultId: c.scopeMode === "all-workspaces" ? 0 : 1,
        message: "调整采集范围",
        detail: "资料库不变；仍排除内部任务，不导入完整历史聊天。",
      });
      if (choice.response === 2) return { cancelled: true };
      const roots =
        choice.response === 1
          ? await dialog.showOpenDialog(win, {
              title: "选择允许采集的工作目录",
              properties: ["openDirectory", "multiSelections"],
            })
          : { canceled: false, filePaths: [] };
      if (roots.canceled) return { cancelled: true };
      return C.install({
        library: c.library,
        roots: roots.filePaths,
        node: c.runtimeNode,
        codex: c.codex,
        scopeMode: choice.response === 0 ? "all-workspaces" : "selected",
        paused: !!c.paused,
      });
    }
    if (action === "library") {
      const c = S.config();
      const firstUse = S.needsInitialization();
      const chosen = await dialog.showOpenDialog(win, {
        title: "选择进境台资料库文件夹",
        properties: ["openDirectory", "createDirectory"],
      });
      if (chosen.canceled) return { cancelled: true };
      const library = chosen.filePaths[0];
      if (
        !firstUse &&
        S.canonical(library) ===
          (fs.existsSync(c.library) ? S.canonical(c.library) : c.library)
      ) {
        S.library();
        return { cancelled: true };
      }
      const answer = firstUse
        ? { response: 1 }
        : await dialog.showMessageBox(win, {
            type: "question",
            buttons: ["取消", "切换资料库"],
            defaultId: 0,
            cancelId: 0,
            message: "切换到另一个资料库？",
            detail:
              "原资料保留；读取所选资料库，不搬移、不合并。采集范围及暂停状态保持原设置。",
          });
      if (answer.response === 0) return { cancelled: true };
      let jobs = [];
      try {
        jobs = S.list("jobs");
      } catch (error) {
        if (!/^(PERSONAL_DATA_|LIBRARY_)/.test(error.message)) throw error;
        // A broken authority cannot apply running jobs. Still allow opening its backup copy.
      }
      for (const job of jobs) if (job.state === "running") O.cancel(job.id);
      return S.selectLibrary(library);
    }
    throw Error("INVALID_ACTION");
  });
  sync("organize", (date, ids, options) => O.start(date, ids, options));
  sync("organizer-history", (id, libraryId) => O.history(id, libraryId));
  sync("apply", (id) => O.apply(id));
  sync("cancel", (id, libraryId) => inLibrary(libraryId, () => O.cancel(id)));
  sync("job-materials", (id) => {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("INVALID_ID");
    const j = S.read(path.join(S.library(), "jobs", id + ".json"));
    if (!j) throw Error("JOB_MISSING");
    const ids = new Set([
      ...(j.unprocessed || []),
      ...(j.skippedSources || []),
    ]);
    return {
      date: j.date,
      items: (j.materials || [])
        .filter((i) => ids.has(i.id))
        .map((i) => ({
          id: i.id,
          title: i.title,
          summary: i.summary,
          protected: (j.skippedSources || []).includes(i.id),
        })),
    };
  });
  sync("disconnect", () => C.disconnect());
  sync("rebuild", () => S.rebuildIndex());
  sync("candidate-review", (id, decision, libraryId) =>
    inLibrary(libraryId, () => {
      if (!/^[a-f0-9]{64}$/.test(id)) throw Error("INVALID_ID");
      const s = S.read(path.join(S.library(), "stages", id + ".json"));
      if (!s) throw Error("NOT_FOUND");
      if (decision === "accept") {
        S.authorize(s.source.cwd);
        S.atomic(path.join(S.library(), "bindings", id + ".json"), {
          stage: id,
          digest: s.digest,
          call: s.source.call,
          mode: "user-reviewed",
          at: new Date().toISOString(),
        });
      } else if (decision === "discard")
        S.atomic(path.join(S.library(), "excluded", id + ".json"), {
          id,
          at: new Date().toISOString(),
        });
      else throw Error("INVALID_DECISION");
      return true;
    }),
  );
  sync("candidate", (id) => {
    if (!/^[a-f0-9]{64}$/.test(id)) throw Error("INVALID_ID");
    return S.read(path.join(S.library(), "stages", id + ".json"));
  });
  sync("visibility", (id, hidden, libraryId) =>
    inLibrary(libraryId, () => {
      if (!/^[a-f0-9]{64}$/.test(id) || typeof hidden !== "boolean")
        throw Error("INVALID_ID");
      const stage = S.read(
        path.join(S.library(), "stages", id + ".json"),
        null,
      );
      if (!stage || !S.bound(stage)) throw Error("SOURCE_NOT_BOUND");
      S.atomic(path.join(S.library(), "visibility", id + ".json"), {
        id,
        hidden,
        sourceIds: stage.items.map((_, n) => id + ":" + n),
        reason: "user_visibility",
        at: new Date().toISOString(),
      });
      return S.personal();
    }),
  );
  sync("source-info", (ids) => {
    if (!Array.isArray(ids) || ids.length > 160) throw Error("INVALID_ID");
    return [...new Set(ids.map((id) => String(id).split(":")[0]))].flatMap(
      (id) => {
        if (!/^[a-f0-9]{64}$/.test(id)) return [];
        const stage = S.read(
          path.join(S.library(), "stages", id + ".json"),
          null,
        );
        return stage ? [{ id, ...stage.source }] : [];
      },
    );
  });
  sync("open-source", (id) => {
    if (!/^[a-f0-9]{64}$/.test(id)) throw Error("INVALID_ID");
    const file = path.join(S.library(), "stages", id + ".json");
    if (!fs.existsSync(file)) throw Error("SOURCE_MISSING");
    shell.showItemInFolder(file);
    return true;
  });
  ipcMain.handle("jinjingtai:connect", async (event) => {
    if (event.sender !== win.webContents) throw Error("INVALID_SENDER");
    const current = S.config();
    const firstUse = S.needsInitialization();
    const existing =
      !!current.installedAt || !!current.instructionFiles?.length;
    const library = existing
      ? { canceled: false, filePaths: [S.library()] }
      : await dialog.showOpenDialog(win, {
          title: "选择进境台资料库文件夹",
          properties: ["openDirectory", "createDirectory"],
        });
    if (library.canceled) return { cancelled: true };
    const range = existing
      ? { response: current.scopeMode === "all-workspaces" ? 0 : 1 }
      : await dialog.showMessageBox(win, {
          type: "question",
          buttons: ["所有正常工作目录", "选择部分目录", "取消"],
          defaultId: 0,
          cancelId: 2,
          message: "选择采集范围",
          detail:
            "所有目录模式适用于本 Codex 配置中的聊天和项目；仍核准真实工作目录，并排除资料库、运行目录和内部整理。不会导入过去的完整聊天。",
        });
    if (range.response === 2) return { cancelled: true };
    const scopeMode = range.response === 0 ? "all-workspaces" : "selected";
    const roots = existing
      ? { canceled: false, filePaths: current.roots || [] }
      : scopeMode === "selected"
        ? await dialog.showOpenDialog(win, {
            title: "选择允许采集的工作目录（包含子目录）",
            properties: ["openDirectory", "multiSelections"],
          })
        : { canceled: false, filePaths: [] };
    if (roots.canceled) return { cancelled: true };
    if (
      !firstUse &&
      current.library !== library.filePaths[0] &&
      S.personal().store.records.length
    ) {
      const answer = await dialog.showMessageBox(win, {
        type: "question",
        buttons: ["取消", "切换资料库"],
        defaultId: 0,
        cancelId: 0,
        message: "切换到另一个资料库？",
        detail:
          "原资料保留在原文件夹；当前窗口将读取所选资料库，不自动搬移或合并旧资料。",
      });
      if (answer.response === 0) return { cancelled: true };
    }
    if (!existing && !firstUse)
      for (const j of S.list("jobs")) if (j.state === "running") O.cancel(j.id);
    const actualNode = require("../integration/node-runtime.cjs").source(
      path.join(__dirname, ".."),
      current.runtimeNode,
    );
    if (!actualNode || !fs.existsSync(actualNode))
      throw Error("RUNTIME_NODE_MISSING");
    const codex = C.resolveCodex(current.codex);
    return C.install({
      library: library.filePaths[0],
      roots: roots.filePaths,
      node: actualNode,
      codex,
      scopeMode,
      paused: !!current.paused,
    });
  });
  ipcMain.handle("jinjingtai:attachment", async (event, expectedLibraryId) => {
    if (event.sender !== win.webContents) throw Error("INVALID_SENDER");
    if (S.personal().libraryId !== expectedLibraryId)
      throw Error("LIBRARY_CHANGED");
    const chosen = await dialog.showOpenDialog(win, {
      title: "添加本地附件",
      properties: ["openFile", "multiSelections"],
    });
    if (chosen.canceled) return [];
    return S.withLock(() => {
      if (S.personal().libraryId !== expectedLibraryId)
        throw Error("LIBRARY_CHANGED");
      const library = S.library();
      return chosen.filePaths.map((file) => {
        if (fs.statSync(file).size > 20 * 1024 * 1024)
          throw Error("附件应小于20MB");
        const buffer = fs.readFileSync(file),
          digest = S.hash(buffer.toString("base64")),
          ext = path
            .extname(file)
            .toLowerCase()
            .replace(/[^.a-z0-9]/g, "");
        const id = digest + ext,
          destination = path.join(library, "attachments", id);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        if (!fs.existsSync(destination)) {
          const temp =
              destination + "." + require("node:crypto").randomUUID() + ".tmp",
            fd = fs.openSync(temp, "wx");
          try {
            fs.writeFileSync(fd, buffer);
            fs.fsyncSync(fd);
          } finally {
            fs.closeSync(fd);
          }
          try {
            fs.linkSync(temp, destination);
          } catch (e) {
            if (e.code !== "EEXIST") throw e;
          } finally {
            fs.unlinkSync(temp);
          }
        }
        return { id, name: path.basename(file), size: buffer.length };
      });
    });
  });
  ipcMain.handle("jinjingtai:open-attachment", async (event, id) => {
    if (event.sender !== win.webContents) throw Error("INVALID_SENDER");
    if (!/^[a-f0-9]{64}(\.[a-z0-9]+)?$/.test(id))
      throw Error("INVALID_ATTACHMENT");
    const file = path.join(S.library(), "attachments", id);
    if (!fs.existsSync(file)) throw Error("SOURCE_MISSING");
    if (await shell.openPath(file)) throw Error("ATTACHMENT_OPEN_FAILED");
    return true;
  });
}
module.exports = { setup };
