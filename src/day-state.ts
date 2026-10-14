import { visibleRecords, workGroups, workingDay, type Store } from "./model";

export type CaptureItem = {
  id: string;
  kind?: string;
  title?: string;
  relevance?: string;
  hidden?: boolean;
};
export type CaptureStage = {
  id: string;
  at?: string;
  date: string;
  outcome: string;
  routine?: boolean;
  binding: string;
  session?: string;
  turn?: string;
  items?: CaptureItem[];
};
export type CaptureTurn = {
  at: string;
  state: string;
  session?: string;
  turn?: string;
};
export type DayCapture = {
  config?: { enabled?: boolean; connectionError?: unknown };
  sourceHealth?: { available?: boolean };
  stages?: CaptureStage[];
  turns?: CaptureTurn[];
};
export type DayState = {
  state: "empty" | "collected" | "saved" | "issues" | "unavailable";
  materialCount: number;
  savedWorkCount: number;
  noChangeTurns: number;
  issueCount: number;
};

/** A real calendar date; optional latest prevents restoring a future workday. */
export function isValidDay(value: unknown, latest?: string): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith("0000")
  )
    return false;
  const time = Date.parse(value + "T00:00:00.000Z");
  return (
    Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === value &&
    (!latest || value <= latest)
  );
}

function sourceKey(
  source: { session?: string; turn?: string },
  fallback: string,
): string {
  return source.session && source.turn
    ? JSON.stringify([source.session, source.turn])
    : fallback;
}

function progressItem(item: CaptureItem): boolean {
  // hidden is the effective visibility projection, after explicit user overrides.
  // Older status projections use the immutable classification as a fallback.
  if (typeof item.hidden === "boolean") return !item.hidden;
  return (
    item.relevance !== "routine" &&
    !item.title?.startsWith("[日常操作]") &&
    item.kind !== "proposal"
  );
}

/** Local display only: never derives a completion rate or sends personal text to AI. */
export function dayState(
  store: Store,
  capture: DayCapture | null | undefined,
  date: string,
): DayState {
  const groups = workGroups(store, visibleRecords(store, date));
  const savedWorkCount = groups.length;
  // All prior records consume their original sources, including removed, hidden,
  // and archived drafts. A display projection must not revive those materials.
  const used = new Set(store.records.flatMap((r) => r.sourceIds || []));
  const materials = new Set<string>();
  const issues = new Set<string>();
  const noChange = new Set<string>();
  for (const [index, turn] of (capture?.turns || []).entries()) {
    const time = Date.parse(turn.at);
    if (!Number.isFinite(time) || workingDay(time) !== date) continue;
    const key = sourceKey(turn, "turn:" + index);
    if (
      ["missing", "interrupted", "pending", "unfinished"].includes(turn.state)
    )
      issues.add(key);
    if (turn.state === "no_change") noChange.add(key);
  }
  for (const stage of capture?.stages || []) {
    if (stage.date !== date) continue;
    if (stage.binding === "pending")
      issues.add(sourceKey(stage, "stage:" + stage.id));
    if (
      stage.binding !== "bound" ||
      stage.outcome !== "change" ||
      stage.routine
    )
      continue;
    for (const item of stage.items || []) {
      if (item.id && progressItem(item) && !used.has(item.id))
        materials.add(item.id);
    }
  }
  const unavailable =
    !capture ||
    capture.sourceHealth?.available === false ||
    !!capture.config?.connectionError ||
    capture.config?.enabled === false;
  const state: DayState["state"] = unavailable
    ? "unavailable"
    : issues.size
      ? "issues"
      : materials.size
        ? "collected"
        : savedWorkCount
          ? "saved"
          : "empty";
  return {
    state,
    materialCount: materials.size,
    savedWorkCount,
    noChangeTurns: noChange.size,
    issueCount: issues.size,
  };
}

/** Latest retained personal day, not the newest model job or a future plan. */
export function latestSavedDay(store: Store, today: string): string | null {
  if (!isValidDay(today)) return null;
  const dates = new Set(
    visibleRecords(store)
      .map((r) => r.date)
      .filter((date) => isValidDay(date, today)),
  );
  for (const [date, note] of Object.entries(store.notes)) {
    if (
      isValidDay(date, today) &&
      (note.lesson?.trim() || note.tomorrow?.trim())
    )
      dates.add(date);
  }
  return [...dates].sort().at(-1) || null;
}
