const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { spawn } = require("node:child_process");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-reliability-"));
process.env.JINJINGTAI_HOME = path.join(root, "home");
const S = require("../integration/store.cjs"),
  O = require("../integration/consolidate.cjs");
const work = path.join(root, "work"),
  library = path.join(root, "library");
for (const p of [work, library, path.join(S.HOME, "internal")])
  fs.mkdirSync(p, { recursive: true });
S.atomic(path.join(S.HOME, "connection.json"), {
  enabled: true,
  library,
  roots: [work],
});
test("模拟多进程：8个并发提交含同轮重试，只留下2条完整记录", async () => {
  const worker = path.join(root, "worker.cjs");
  fs.writeFileSync(
    worker,
    `const S=require(${JSON.stringify(require.resolve("../integration/store.cjs"))});const n=Number(process.argv[2]);const h={cwd:${JSON.stringify(work)},session_id:'parallel-'+(n%2),turn_id:'turn',tool_use_id:'call-'+n,tool_input:{outcome:'change',items:[{kind:'implementation',title:'并发产物',summary:'尚未验证'}]}};h.tool_input._gate=S.issue(h);const r=S.submit(h.tool_input);S.bind(h);console.log(JSON.stringify(r));`,
  );
  const results = await Promise.all(
    Array.from(
      { length: 8 },
      (_, i) =>
        new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [worker, String(i)], {
            windowsHide: true,
          });
          let output = "";
          child.stdout.on("data", (s) => (output += s));
          child.stderr.on("data", (s) => (output += s));
          child.on("error", reject);
          child.on("close", (code) =>
            code ? reject(Error(output)) : resolve(JSON.parse(output)),
          );
        }),
    ),
  );
  assert.equal(S.list("stages").length, 2);
  assert(results.every((r) => r.saved));
  assert(S.list("stages").every(S.bound));
});
test("模拟崩溃：个人权威提交后、整理回执前退出，重放不覆盖人工内容", () => {
  const stage = S.list("stages")[0],
    id = stage.id + ":0",
    job = {
      id: "crash-job",
      date: "2026-10-01",
      state: "complete",
      materials: [
        {
          id,
          kind: "implementation",
          title: "原始",
          summary: "未验证",
          relations: [],
          evidence: [],
        },
      ],
      result: {
        entries: [
          { title: "原始", summary: "未验证", next: "", sources: [id] },
        ],
        unprocessed: [],
      },
    };
  S.atomic(path.join(library, "jobs", job.id + ".json"), job);
  const original = S.atomic;
  S.atomic = (file, data, ...rest) => {
    if (file.endsWith("crash-job.json") && data.applied)
      throw Error("SIMULATED_EXIT");
    return original(file, data, ...rest);
  };
  assert.throws(() => O.apply(job.id), /SIMULATED_EXIT/);
  S.atomic = original;
  const p = S.personal();
  p.store.records[0].change = "人工校正";
  p.store.records[0].removed = true;
  p.store.records[0].attachments = [{ id: "local", name: "附件", size: 0 }];
  S.savePersonal(p.store, p.revision, p.libraryId);
  assert.equal(O.apply(job.id).added, 0);
  assert.equal(S.personal().store.records.length, 1);
  assert.equal(S.personal().store.records[0].change, "人工校正");
  assert(S.personal().store.records[0].removed);
});
test("模拟恢复：未完成阶段临时文件不冒充成功，运行中整理标为中断", () => {
  fs.writeFileSync(path.join(library, "stages", "incomplete.tmp"), "partial");
  assert.equal(S.list("stages").length, 2);
  S.atomic(path.join(library, "jobs", "interrupted.json"), {
    id: "interrupted",
    state: "running",
    materials: [{ id: "missing" }],
  });
  O.recover();
  assert.equal(
    S.read(path.join(library, "jobs", "interrupted.json")).error,
    "INTERRUPTED",
  );
});
test("模拟迁移：已有正式草稿时仍保留旧人工编辑，重复载入不复活移除", () => {
  const M = require("../integration/migration.cjs");
  const sample = {
    version: 1,
    records: [{ id: "sample", title: "演示" }],
    projects: [],
    notes: {},
  };
  const legacy = {
    ...sample,
    records: [
      {
        id: "sample",
        date: "2026-10-02",
        project: "old",
        title: "人工改写",
        change: "旧内容",
        next: "",
        kind: "发现",
        confirmed: true,
        manual: true,
      },
    ],
    projects: [
      { id: "old", name: "旧项目", subject: "", status: "原概况", next: "" },
    ],
  };
  let p = M.migrate(legacy, sample, "old-profile");
  assert.equal(p.store.records.length, 2);
  assert(p.store.projects.some((p) => p.name === "旧项目"));
  p.store.records.find((r) => r.title === "人工改写").removed = true;
  S.savePersonal(p.store, p.revision, p.libraryId);
  assert.equal(
    M.migrate(legacy, sample, "old-profile").store.records.filter(
      (r) => r.title === "人工改写",
    ).length,
    1,
  );
  assert(
    S.personal().store.records.find((r) => r.title === "人工改写").removed,
  );
});
test("模拟来源适配：真实目录元数据先核准，范围外/歧义时不读取候选正文", () => {
  const { DatabaseSync } = require("node:sqlite"),
    home = path.join(root, "codex");
  fs.mkdirSync(home);
  S.atomic(path.join(S.HOME, "connection.json"), {
    ...S.config(),
    codexHome: home,
  });
  const state = new DatabaseSync(path.join(home, "state_5.sqlite")),
    history = new DatabaseSync(path.join(home, "thread_history_1.sqlite"));
  state.exec(
    "CREATE TABLE threads(id TEXT,cwd TEXT,cli_version TEXT,updated_at_ms INTEGER,updated_at INTEGER)",
  );
  history.exec(
    "CREATE TABLE thread_items(thread_id TEXT,turn_id TEXT,item_id TEXT,created_at_ms INTEGER,item_type TEXT,item_json TEXT,rollout_ordinal INTEGER);CREATE TABLE thread_turns(thread_id TEXT,turn_id TEXT,status TEXT,started_at INTEGER,completed_at INTEGER,rollout_ordinal INTEGER)",
  );
  state
    .prepare("INSERT INTO threads(id,cwd,cli_version) VALUES(?,?,?)")
    .run("allowed", work, "0.160.0");
  state
    .prepare("INSERT INTO threads(id,cwd,cli_version) VALUES(?,?,?)")
    .run("outside", root, "0.160.0");
  const body = { outcome: "no_change", items: [] },
    insert = history.prepare(
      "INSERT INTO thread_items(thread_id,turn_id,item_id,created_at_ms,item_type,item_json) VALUES(?,?,?,?,?,?)",
    );
  insert.run(
    "allowed",
    "t",
    "a",
    Date.now(),
    "mcpToolCall",
    JSON.stringify({
      server: "jinjingtai",
      tool: "record_stage",
      status: "inProgress",
      arguments: body,
    }),
  );
  insert.run(
    "outside",
    "t",
    "b",
    Date.now(),
    "mcpToolCall",
    JSON.stringify({
      server: "jinjingtai",
      tool: "record_stage",
      status: "inProgress",
      arguments: { PRIVATE_OUTSIDE_BODY: "secret" },
    }),
  );
  state.close();
  history.close();
  let bodyReads = 0;
  const prepare = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function (sql) {
    if (sql.includes("AS arguments")) bodyReads++;
    return prepare.call(this, sql);
  };
  const source = require("../integration/source.cjs");
  assert.throws(() => source.authorizeCall(body), /OUTSIDE_SCOPE/);
  assert.equal(bodyReads, 0);
  DatabaseSync.prototype.prepare = prepare;
  const h = new DatabaseSync(path.join(home, "thread_history_1.sqlite"));
  h.prepare("DELETE FROM thread_items WHERE thread_id='outside'").run();
  h.close();
  assert.equal(source.authorizeCall(body).session_id, "allowed");
  assert(!JSON.stringify(S.list("stages")).includes("PRIVATE_OUTSIDE_BODY"));
});
test.after(() => console.log("可靠性验收资料目录：" + root));
test("模拟异常前台退出：独立非AI看门程序终止到期的指定任务", async () => {
  const id = "watchdog-" + require("node:crypto").randomUUID();
  const child = spawn(
    process.execPath,
    ["-e", "setInterval(()=>{},1000)", "codex", "--ephemeral", id],
    { windowsHide: true, stdio: "ignore" },
  );
  const file = path.join(library, "jobs", id + ".json");
  S.atomic(file, {
    id,
    pid: child.pid,
    state: "running",
    startedAt: new Date(Date.now() - 240000).toISOString(),
    materials: [],
  });
  const closed = new Promise((resolve) => child.once("close", resolve));
  const watcher = spawn(
    process.execPath,
    [
      path.resolve(__dirname, "../integration/watchdog.cjs"),
      file,
      String(child.pid),
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  const watcherClosed = new Promise((resolve) =>
    watcher.once("close", resolve),
  );
  let timeout;
  try {
    await Promise.race([
      closed,
      new Promise(
        (_, reject) =>
          // Three bounded ownership queries can take 15s on a cold Windows host.
          (timeout = setTimeout(
            () => reject(Error("WATCHDOG_NOT_TERMINATED")),
            25000,
          )),
      ),
    ]);
    await watcherClosed;
    assert.equal(S.read(file).error, "TIMEOUT");
  } finally {
    clearTimeout(timeout);
    child.kill();
    watcher.kill();
  }
});
test("模拟取消：未应用任务保留覆盖范围；取消不生成假草稿", () => {
  const id = "cancel-job",
    file = path.join(library, "jobs", id + ".json");
  S.atomic(file, {
    id,
    state: "running",
    materials: [{ id: "cancel-material" }],
  });
  const before = S.personal();
  O.cancel(id);
  assert.equal(S.read(file).state, "cancelled");
  assert.deepEqual(S.read(file).unprocessed, ["cancel-material"]);
  assert.throws(() => O.apply(id), /JOB_NOT_COMPLETE/);
  assert.deepEqual(S.personal(), before);
});
