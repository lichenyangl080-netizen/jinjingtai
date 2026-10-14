import { recordCorrections, type Store, type RecordItem } from "../model";
import { Action } from "./Controls";

export function ReferenceHistory({
  store,
  record,
  openRecord,
}: {
  store: Store;
  record: RecordItem;
  openRecord: (record: RecordItem, sequence?: string[]) => void;
}) {
  const corrections = recordCorrections(store, record);
  if (!corrections.length) return null;
  const readable = corrections.filter(
    (r) => !r.removed && !r.progressHidden && !r.supersededDraftBy,
  );
  return (
    <div className="reference-history">
      <small>历史结论：已有后续否定或替代。</small>
      {readable.length ? (
        readable.map((correction) => (
          <Action
            key={correction.id}
            onClick={() => openRecord(correction, [record.id, correction.id])}
          >
            查看更正：{correction.title}
          </Action>
        ))
      ) : (
        <small>更正记录不可用；保留历史提醒。</small>
      )}
    </div>
  );
}
