import {
  currentProjectRecords,
  type Store,
  type Continuation,
  type PeriodReview,
} from "./model.ts";
import { continuationSourceSignature } from "./personal-workspace.ts";
import { PersonalValidationError } from "./personal-errors.ts";

export type ContinuationCommand =
  | { mode: "manual"; text: string }
  | { mode: "extract"; text: string; recordId: string; sourceSignature: string }
  | { mode: "retain"; value: Omit<Continuation, "updatedAt"> };

/** Retaining an old attribution is different from choosing a new source. */
export function saveContinuation(
  store: Store,
  project: string,
  command: ContinuationCommand,
): Store {
  if (!store.projects.some((p) => p.id === project))
    throw new PersonalValidationError("请先为记录设置有效项目。");
  let value: Omit<Continuation, "updatedAt">;
  if (command.mode === "retain") value = command.value;
  else if (command.mode === "manual") value = { text: command.text };
  else {
    const source = currentProjectRecords(store, project).find(
      (r) => r.id === command.recordId,
    );
    if (!source || !source.next.trim())
      throw new PersonalValidationError(
        "只有当前有效记录的下一步可以摘取为起点。",
      );
    if (continuationSourceSignature(source) !== command.sourceSignature)
      throw new PersonalValidationError("来源已改变，请重新核对后选择。");
    value =
      command.text === source.next
        ? {
            text: command.text,
            recordId: source.id,
            sourceNext: source.next,
            sourceSignature: command.sourceSignature,
          }
        : { text: command.text };
  }
  return {
    ...store,
    continuations: {
      ...store.continuations,
      [project]: { ...value, updatedAt: new Date().toISOString() },
    },
  };
}

/** Both whole-review editing and context citation use the same write contract. */
export function savePeriodReview(
  store: Store,
  value: Omit<PeriodReview, "updatedAt">,
): Store {
  return {
    ...store,
    periodReviews: {
      ...store.periodReviews,
      [value.period + ":" + value.start]: {
        ...value,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}
