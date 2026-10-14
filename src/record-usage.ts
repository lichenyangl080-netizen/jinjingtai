import { periodRange, visibleRecords, type Store } from "./model.ts";
import {
  assignThreadRecord,
  threadForRecord,
  referenceState,
} from "./personal-workspace.ts";
import { saveContinuation, savePeriodReview } from "./personal-commands.ts";
import { PersonalValidationError } from "./personal-errors.ts";
import type { ReviewPeriod } from "./review-navigation.ts";

export type RecordUsage =
  | { kind: "continuation"; text: string; sourceSignature: string }
  | {
      kind: "thread";
      threadId: string;
      allowMove: boolean;
      allowHistorical: boolean;
    }
  | { kind: "review"; period: ReviewPeriod };

/** One updater, based on the latest authority, for all context actions. */
export function applyRecordUsage(
  store: Store,
  recordId: string,
  input: RecordUsage,
): Store {
  const record = visibleRecords(store).find((r) => r.id === recordId);
  if (!record) throw new PersonalValidationError("记录已不可用，请重新选择。");
  if (!store.projects.some((p) => p.id === record.project))
    throw new PersonalValidationError("请先为记录设置有效项目。");
  if (input.kind === "continuation") {
    return saveContinuation(store, record.project, {
      mode: "extract",
      recordId,
      text: input.text,
      sourceSignature: input.sourceSignature,
    });
  }
  if (input.kind === "thread") {
    const target = store.threads?.[input.threadId];
    if (!target || target.archived || target.project !== record.project)
      throw new PersonalValidationError("请选择同项目的未归档主线。");
    if (record.kind === "未采纳建议")
      throw new PersonalValidationError("未采纳建议不能作为有效主线成员新增。");
    const previous = threadForRecord(store, recordId);
    if (previous && previous.id !== target.id && !input.allowMove)
      throw new PersonalValidationError("请明确确认移到另一条主线。");
    if (
      referenceState(store, { recordId }) === "historical" &&
      !input.allowHistorical
    )
      throw new PersonalValidationError("请明确选择纳入历史判断。");
    return assignThreadRecord(
      store,
      target.id,
      recordId,
      input.allowHistorical,
    );
  }
  const [start, end] = periodRange(input.period, 0, record.date);
  const key = input.period + ":" + start;
  const saved = store.periodReviews?.[key];
  const references = saved?.references || [];
  return savePeriodReview(store, {
    period: input.period,
    start,
    end,
    text: saved?.text || "",
    references: references.some((ref) => ref.recordId === recordId)
      ? references
      : [...references, { recordId, title: record.title, date: record.date }],
  });
}
