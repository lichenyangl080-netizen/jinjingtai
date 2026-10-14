import { visibleRecords, type Store } from "./model.ts";

export type RecordReadingContext = {
  recordId: string;
  library: string;
  sequence: string[];
  fromSearch: boolean;
  expanded: boolean;
};

/** Return navigation resolves the latest record, never a captured store. */
export function restoreRecordReading(
  store: Store,
  library: string,
  context: RecordReadingContext | null,
) {
  if (!context || context.library !== library) return null;
  const record = visibleRecords(store).find((r) => r.id === context.recordId);
  if (!record) return null;
  return {
    record,
    sequence: context.sequence.includes(record.id)
      ? context.sequence
      : [record.id],
    fromSearch: context.fromSearch,
    expanded: context.expanded,
  };
}
