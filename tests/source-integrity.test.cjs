const test = require("node:test");
const assert = require("node:assert/strict");
const { runIsolated } = require("./helpers/isolated-library.cjs");
const { isTestCommand } = require("../integration/test-command.cjs");
const V = require("../integration/verification.cjs");

test("Python模块和Node运行npm CLI的成功测试仍匹配同一声明", () => {
  for (const [command, evidence] of [
    ["python -m pytest tests/test_sample.py", "pytest tests/test_sample.py"],
    ["node ../.tools/package/bin/npm-cli.js run check", "npm run check"],
  ])
    assert(
      V.supports({ kind: "verified", evidence: [evidence] }, [
        { type: "test", command, exitCode: 0 },
      ]),
    );
});

test("测试取证接受明确运行器，打印、帮助及不明复合命令不授予验证", () => {
  for (const command of [
    "node --test sample.test.cjs",
    "npm.cmd run check",
    "npm test",
    "pytest tests/test_sample.py",
    "python -m pytest tests/test_sample.py",
    "node ../.tools/package/bin/npm-cli.js run check",
    '& "C:\\Program Files\\nodejs\\node.exe" --test sample.test.cjs',
  ])
    assert.equal(isTestCommand(command), true, command);
  for (const command of [
    "echo npm test",
    'Write-Output "npm test"',
    "node -e \"console.log('--test')\"",
    "npm test --help",
    "npm test -h",
    "pytest -h",
    "node --test -h",
    "npm run test --if-present",
    "pytest --collect-only",
    "echo ok; npm test",
    "npm test || echo success",
    'cmd /c "echo npm test"',
  ]) {
    assert.equal(isTestCommand(command), false, command);
    assert.equal(
      V.supports({ kind: "verified", evidence: ["npm test"] }, [
        { type: "test", command, exitCode: 0 },
      ]),
      false,
      command,
    );
  }
});

const databases = `
  const {DatabaseSync}=require('node:sqlite'),Source=require('./integration/source.cjs');
  const work=path.join(path.dirname(S.HOME),'work'),codex=path.join(S.HOME,'codex'),library=path.join(S.HOME,'library');
  for(const dir of [work,codex,library])fs.mkdirSync(dir);
  S.selectLibrary(library);S.atomic(path.join(S.HOME,'connection.json'),{...S.config(),enabled:true,roots:[work],library,codexHome:codex,installedAt:'2020-01-01T00:00:00Z'});
  const state=new DatabaseSync(path.join(codex,'state_42.sqlite')),history=new DatabaseSync(path.join(codex,'thread_history_42.sqlite'));
  state.exec('CREATE TABLE threads(id TEXT,cwd TEXT,cli_version TEXT,updated_at_ms INTEGER,updated_at INTEGER)');
  history.exec('CREATE TABLE thread_turns(thread_id TEXT,turn_id TEXT,status TEXT,started_at INTEGER,completed_at INTEGER,rollout_ordinal INTEGER);CREATE TABLE thread_items(thread_id TEXT,turn_id TEXT,item_id TEXT,created_at_ms INTEGER,item_type TEXT,item_json TEXT,rollout_ordinal INTEGER)');
  const now=Date.now();state.prepare('INSERT INTO threads VALUES(?,?,?,?,?)').run('session',work,'9.0.0',now,Math.floor(now/1000));
  history.prepare('INSERT INTO thread_turns VALUES(?,?,?,?,?,?)').run('session','good','completed',now-10000,now-9000,1);
`;

test("同一聊天坏时间轮次独立诊断，完好轮次保留并明确部分失败", () =>
  runIsolated(
    databases +
      `
  history.prepare('INSERT INTO thread_turns VALUES(?,?,?,?,?,?)').run('session','bad','completed',now-4000,now-5000,2);
  const turns=Source.turns();assert.equal(turns.length,1);assert.equal(turns[0].turn,'good');
  assert.equal(Source.health().available,false);assert.equal(Source.health().partial,true);assert.equal(Source.health().error,'SOURCE_RECORD_UNSUPPORTED');
  history.prepare("DELETE FROM thread_turns WHERE turn_id='bad'").run();assert.equal(Source.turns().length,1);assert.equal(Source.health().available,true);
  state.close();history.close();
`,
  ));

test("实际打印命令不生成测试证据，真实测试调用仍可恢复", () =>
  runIsolated(
    databases +
      `
  const command='echo npm test';const actual=spawnSync('cmd.exe',['/d','/c',command],{cwd:work,encoding:'utf8',windowsHide:true});assert.equal(actual.status,0);
  const insert=history.prepare('INSERT INTO thread_items VALUES(?,?,?,?,?,?,?)');
  insert.run('session','good','echo',now-9500,'commandExecution',JSON.stringify({cwd:work,command,exitCode:actual.status,status:'completed',aggregatedOutput:actual.stdout}),1);
  assert.throws(()=>Source.recoverTurn('session','good'),/NO_RECOVERABLE_EVIDENCE/);
  insert.run('session','good','test',now-9500,'commandExecution',JSON.stringify({cwd:work,command:'node --test sample.test.cjs',exitCode:0,status:'completed',aggregatedOutput:'synthetic test output'}),2);
  const recovered=Source.recoverTurn('session','good');assert.equal(recovered.kind,'verified');assert.equal(recovered.snapshots.length,1);assert.equal(recovered.coverage.omitted,1);
  assert.equal(require('./integration/verification.cjs').supports({kind:'verified',evidence:['node --test sample.test.cjs']},recovered.snapshots),true);
  state.close();history.close();
`,
  ));
