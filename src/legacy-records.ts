import type { Store } from "./model";
// Compatibility for old snapshots and historical regression fixtures only.
export function confirmDay(store: Store, date: string): Store {
  const n = store.notes[date] ?? { lesson: "", tomorrow: "" };
  return {
    ...store,
    records: store.records.map((r) =>
      r.date === date &&
      !r.removed &&
      !r.progressHidden &&
      !r.supersededDraftBy &&
      !r.confirmed
        ? { ...r, confirmed: true }
        : r,
    ),
    notes: {
      ...store.notes,
      [date]: {
        ...n,
        reviewed: true,
        confirmed: { lesson: n.lesson, tomorrow: n.tomorrow },
      },
    },
  };
}
