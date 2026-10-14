import { planningLimit } from "./model";
import { isValidDay } from "./day-state";

export type PlanningDraft = {
  date: string;
  text: string;
  original: string;
  openedOn: string;
};

export function canStartPlanning(date: string, today: string) {
  return (
    isValidDay(date) &&
    isValidDay(today) &&
    date > today &&
    date <= planningLimit(today)
  );
}

// openedOn belongs only to the current in-memory editor. A draft that was valid
// when opened can still be saved to its original date after the 04:00 rollover.
export function createPlanningDraft(
  date: string,
  today: string,
  original = "",
): PlanningDraft | null {
  return canStartPlanning(date, today)
    ? { date, text: original, original, openedOn: today }
    : null;
}

export function canSavePlanningDraft(draft: PlanningDraft) {
  return canStartPlanning(draft.date, draft.openedOn);
}
