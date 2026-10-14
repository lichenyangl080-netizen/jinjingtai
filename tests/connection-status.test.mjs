import test from "node:test";
import assert from "node:assert/strict";
import { connectionStatus } from "../src/connection-status.ts";
const capture = (extra = {}) => ({
  config: {
    enabled: true,
    roots: [],
    library: "library",
    instructionFiles: ["AGENTS.md"],
  },
  libraryHealth: { available: true },
  stages: [],
  turns: [],
  errors: [],
  jobs: [],
  ...extra,
});
const stage = (binding) => ({ binding, at: "2026-10-13T10:00:00+08:00" });

test("保存连接或收到隔离候选不等于真实接通，只在绑定记录后显示已收到", () => {
  assert.equal(connectionStatus(null).title, "尚未连接");
  assert.equal(connectionStatus(capture()).title, "连接已保存，等待工作记录");
  assert.equal(
    connectionStatus(capture({ stages: [stage("pending")] })).title,
    "连接已保存，等待工作记录",
  );
  assert.equal(
    connectionStatus(capture({ stages: [stage("bound")] })).title,
    "已收到工作记录",
  );
});

test("暂停、撤销和异常状态不会被旧记录掩盖，也不虚构Hook信任状态", () => {
  const stages = [stage("bound")];
  const paused = capture({
    config: {
      enabled: false,
      paused: true,
      roots: [],
      instructionFiles: ["AGENTS.md"],
    },
    stages,
  });
  assert.equal(connectionStatus(paused).title, "采集已暂停");
  assert.equal(
    connectionStatus({
      ...paused,
      config: { ...paused.config, disconnected: true },
    }).title,
    "尚未连接",
  );
  assert.equal(
    connectionStatus({
      ...paused,
      sourceHealth: { available: false, error: "SOURCE_DB_UNAVAILABLE" },
    }).title,
    "连接需要处理",
  );
});

test("错误合并保留异常证据，隔离的历史整理任务不误报为连接失效", () => {
  const jobError = {
    code: "LOCAL_METADATA_INVALID",
    folder: "jobs",
    file: "bad.json",
  };
  const status = capture({
    errors: [jobError],
    metadataHealth: { available: false, errors: [jobError] },
  });
  assert.equal(connectionStatus(status).hasError, false);
  const sourceError = { code: "SOURCE_DB_UNAVAILABLE", folder: "stages" };
  const broken = {
    ...status,
    errors: [sourceError, sourceError],
    sourceHealth: { available: false, error: sourceError.code },
  };
  const before = structuredClone(broken);
  assert.deepEqual(connectionStatus(broken).errors, [sourceError.code]);
  assert.equal(connectionStatus(broken).title, "连接需要处理");
  assert.deepEqual(broken, before);
});
