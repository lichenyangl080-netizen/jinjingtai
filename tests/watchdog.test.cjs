const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawn } = require("node:child_process");

async function scenario(mode, verify) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jjt-watchdog-case-"));
  const id = "watchdog-" + crypto.randomUUID();
  fs.mkdirSync(path.join(root, "jobs"));
  const file = path.join(root, "jobs", id + ".json");
  const counter = path.join(root, "queries.txt");
  const preload = path.join(root, "query-fixture.cjs");
  fs.writeFileSync(
    preload,
    `const fs=require('node:fs'),cp=require('node:child_process');
    const original=cp.execFileSync,counter=${JSON.stringify(counter)},mode=${JSON.stringify(mode)};
    cp.execFileSync=function(command,...args){
      if(command!=='powershell.exe')return original.call(this,command,...args);
      const count=fs.existsSync(counter)?Number(fs.readFileSync(counter,'utf8'))+1:1;
      fs.writeFileSync(counter,String(count));
      if(mode==='unknown'||(mode==='transient'&&count===1))throw Object.assign(Error('injected query timeout'),{code:'ETIMEDOUT'});
      if(mode==='other')return 'node codex --ephemeral unrelated-task';
      return original.call(this,command,...args);
    };`,
  );
  const child = spawn(
    process.execPath,
    ["-e", "setInterval(()=>{},1000)", "codex", "--ephemeral", id],
    { windowsHide: true, stdio: "ignore" },
  );
  const childClosed = new Promise((resolve) => child.once("close", resolve));
  fs.writeFileSync(
    file,
    JSON.stringify({
      id,
      pid: child.pid,
      state: "running",
      // Also cover a late watcher or resuming Windows after the job deadline.
      startedAt: new Date(Date.now() - 300000).toISOString(),
      materials: [{ id: "synthetic-material" }],
    }),
  );
  const watcher = spawn(
    process.execPath,
    [
      "--require",
      preload,
      path.resolve(__dirname, "../integration/watchdog.cjs"),
      file,
      String(child.pid),
    ],
    {
      env: { ...process.env, JINJINGTAI_HOME: path.join(root, "home") },
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  let stderr = "",
    timeout;
  watcher.stderr.on("data", (chunk) => (stderr += chunk));
  const watcherClosed = new Promise((resolve, reject) => {
    watcher.once("error", reject);
    watcher.once("close", (code) => resolve(code));
  });
  try {
    await Promise.race([
      (async () => {
        const code = await watcherClosed;
        assert.equal(code, 0, stderr);
        const result = JSON.parse(fs.readFileSync(file, "utf8"));
        await verify({ result, child, childClosed });
      })(),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(Error("WATCHDOG_NOT_BOUNDED: " + stderr)),
          25000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    child.kill();
    watcher.kill();
    await Promise.all([childClosed, watcherClosed]);
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("迟到的看门程序遇到一次查询超时后重新核验，实际终止任务并确认退出", async () => {
  await scenario("transient", async ({ result, child, childClosed }) => {
    assert.equal(result.error, "TIMEOUT");
    await childClosed;
    assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
    assert(result.watchdog.attempts >= 2 && result.watchdog.attempts <= 3);
    assert.equal(result.watchdog.queryError, "ETIMEDOUT");
    assert.deepEqual(result.unprocessed, ["synthetic-material"]);
  });
});

test("持续无法核验进程时限定三次查询，明确报告且不终止未验证进程", async () => {
  await scenario("unknown", ({ result, child }) => {
    assert.equal(result.error, "WATCHDOG_PROCESS_UNVERIFIED");
    assert.equal(result.watchdog.attempts, 3);
    assert.equal(result.watchdog.queryError, "ETIMEDOUT");
    assert.doesNotThrow(() => process.kill(child.pid, 0));
    assert.deepEqual(result.unprocessed, ["synthetic-material"]);
  });
});

test("进程身份不符时拒绝终止，保留任务材料并报告身份变化", async () => {
  await scenario("other", ({ result, child }) => {
    assert.equal(result.error, "WATCHDOG_PROCESS_MISMATCH");
    assert.equal(result.watchdog.attempts, 1);
    assert.doesNotThrow(() => process.kill(child.pid, 0));
    assert.deepEqual(result.unprocessed, ["synthetic-material"]);
  });
});
