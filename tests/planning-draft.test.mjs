import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { workingDay } from "../src/model.ts";
const hook = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(
      ["./model", "./day-state"].includes(specifier) &&
        ["/src/planning-draft.ts", "/src/day-state.ts"].some((path) =>
          context.parentURL?.endsWith(path),
        )
        ? specifier + ".ts"
        : specifier,
      context,
    );
  },
});
const { createPlanningDraft, canSavePlanningDraft } =
  await import("../src/planning-draft.ts");
hook.deregister();

test("04点前合法打开的规划草稿可以在工作日切换后仍按原日期保存", () => {
  const before = workingDay(Date.parse("2026-10-08T03:59:59+08:00"));
  const after = workingDay(Date.parse("2026-10-08T04:00:00+08:00"));
  const draft = createPlanningDraft("2026-10-08", before, "原规划");
  assert.equal(before, "2026-10-07");
  assert.equal(after, "2026-10-08");
  assert(draft);
  draft.text = "跨日仍要保留的正文";
  assert(canSavePlanningDraft(draft));
  assert.equal(draft.date, after);
  assert.equal(draft.text, "跨日仍要保留的正文");
  assert.equal(createPlanningDraft(draft.date, after), null);
  assert.equal(createPlanningDraft("2026-10-06", before), null);
  assert.equal(createPlanningDraft("2026-11-08", before), null);
});
