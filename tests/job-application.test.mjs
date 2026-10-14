import test from "node:test";
import assert from "node:assert/strict";
import { createJobApplicationController } from "../src/job-application.ts";

const job = (id) => ({ id, date: "2026-10-08", state: "complete" });

test("一个结果保存失败只尝试一次，不影响后面的完好任务，明确重试可以恢复", () => {
  const applications = createJobApplicationController();
  const jobs = [job("bad"), job("good")],
    attempts = [];
  applications.reconcile("library-a", jobs);
  let recover = false;
  const write = (id) => {
    attempts.push(id);
    if (id === "bad" && !recover) throw Error("INCOMPLETE_COVERAGE");
    return { added: 1 };
  };
  assert.equal(applications.apply(jobs[0], write, null).state, "failed");
  assert.deepEqual(applications.apply(jobs[1], write, null), {
    state: "saved",
    response: { added: 1 },
  });
  jobs[1].applied = true;
  for (let i = 0; i < 3; i++) {
    applications.reconcile("library-a", jobs);
    for (const item of jobs) applications.apply(item, write, null);
  }
  assert.deepEqual(attempts, ["bad", "good"]);
  assert.deepEqual(applications.errors, { bad: "INCOMPLETE_COVERAGE" });
  assert.equal(applications.apply(jobs[0], write, null, true).state, "failed");
  recover = true;
  assert.equal(applications.apply(jobs[0], write, null, true).state, "saved");
  assert.deepEqual(applications.errors, {});
  assert.deepEqual(attempts, ["bad", "good", "bad", "bad"]);
});

test("编辑与隔离记录继续阻止应用，其他窗口已保存或切库清除旧失败", () => {
  const applications = createJobApplicationController(),
    item = job("same-id");
  applications.reconcile("library-a", [item]);
  const fail = () => {
    throw Error("LOCAL_OPERATION_FAILED");
  };
  assert.equal(
    applications.apply(item, fail, item.date, true).state,
    "editing",
  );
  assert.equal(
    applications.apply({ ...item, saveBlocked: true }, fail, null, true).state,
    "blocked",
  );
  assert.deepEqual(applications.errors, {});
  applications.apply(item, fail, null);
  applications.reconcile("library-a", [{ ...item, applied: true }]);
  assert.deepEqual(applications.errors, {});
  applications.apply(item, fail, null);
  applications.reconcile("library-b", [item]);
  assert.equal(applications.apply(item, () => true, null).state, "saved");
});
