import {
  currentProjectRecords,
  displacedBy,
  newestRecord,
  visibleRecords,
} from "./model.ts";
import type {
  Project,
  RecordItem,
  RecordReference,
  Store,
  WorkThread,
} from "./model.ts";

/** Remember insertion identity separately from when the work happened. */
export function projectRecentRecords(
  store: Store,
  project: Project,
): RecordItem[] {
  const baseline = project.overviewRecordIds
    ? new Set(project.overviewRecordIds)
    : undefined;
  return currentProjectRecords(store, project.id)
    .filter((record) =>
      baseline
        ? !baseline.has(record.id)
        : !project.overviewEditedAt ||
          String(record.sourceAt || record.createdAt || record.date) >
            project.overviewEditedAt,
    )
    .sort((a, b) => newestRecord(store, a, b));
}

/** Compact change detector for the saved source; edit flags are not versions. */
export function continuationSourceSignature(record: RecordItem): string {
  const content = JSON.stringify([
    record.title,
    record.change,
    record.summary || "",
    record.next,
    record.kind,
    record.date,
    record.project,
    record.evidence || "",
    (record.relations || [])
      .map(({ type, target }) => JSON.stringify([type, target]))
      .sort(),
  ]);
  const hashes = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  for (let i = 0; i < content.length; i++)
    for (let lane = 0; lane < hashes.length; lane++)
      hashes[lane] = Math.imul(
        hashes[lane] ^ content.charCodeAt(i),
        0x01000193,
      );
  return (
    "v1:" +
    hashes.map((hash) => (hash >>> 0).toString(16).padStart(8, "0")).join("")
  );
}

export function recordReference(record: RecordItem): RecordReference {
  return { recordId: record.id, title: record.title, date: record.date };
}
export function referenceState(
  store: Store,
  ref: Pick<RecordReference, "recordId">,
): "available" | "missing" | "hidden" | "historical" {
  const record = store.records.find((r) => r.id === ref.recordId);
  if (!record || record.removed) return "missing";
  if (record.progressHidden || record.supersededDraftBy) return "hidden";
  return displacedBy(store, record) ? "historical" : "available";
}
export function continuationWarning(store: Store, project: string): string {
  const continuation = store.continuations?.[project];
  if (!continuation?.recordId) return "";
  const state = referenceState(store, { recordId: continuation.recordId });
  if (state === "missing")
    return "来源记录已移除或不可用，已保存的起点文字仍保留。";
  if (state === "hidden")
    return "来源记录已隐藏或属于旧归并稿，请检查继续起点。";
  if (state === "historical") return "来源记录已被否定或取代，请检查继续起点。";
  const record = store.records.find((r) => r.id === continuation.recordId)!;
  return record.project !== project ||
    (continuation.sourceSignature !== undefined
      ? continuationSourceSignature(record) !== continuation.sourceSignature
      : record.next !== continuation.sourceNext)
    ? "来源记录已修改，请检查继续起点；保存的文字没有自动改变。"
    : "";
}
export function continuationCandidates(
  store: Store,
  project: string,
): RecordItem[] {
  return currentProjectRecords(store, project)
    .filter((r) => r.next.trim())
    .sort((a, b) => newestRecord(store, a, b));
}
export function threadForRecord(
  store: Store,
  id: string,
): WorkThread | undefined {
  return Object.values(store.threads || {}).find((t) =>
    t.recordIds.includes(id),
  );
}
export function threadCandidates(
  store: Store,
  thread: WorkThread,
): RecordItem[] {
  const selected = new Set(thread.recordIds);
  return rankThreadRecords(
    store,
    thread.project,
    thread.recordIds,
  ).records.filter((r) => !selected.has(r.id));
}
export function rankThreadRecords(
  store: Store,
  project: string,
  recordIds: string[],
  includeHistorical = false,
) {
  const selected = new Set(recordIds);
  const identities = new Set<string>();
  const targets = new Set<string>();
  const positions = new Map(store.records.map((r, i) => [r, i]));
  for (const r of store.records)
    if (selected.has(r.id)) {
      identities.add(r.id);
      for (const id of r.sourceIds || []) identities.add(id);
      for (const link of r.relations || []) targets.add(link.target);
    }
  const records = includeHistorical
    ? visibleRecords(store).filter(
        (r) => r.project === project && r.kind !== "未采纳建议",
      )
    : currentProjectRecords(store, project);
  const relatedIds = new Set(
    records
      .filter(
        (r) =>
          targets.has(r.id) ||
          r.sourceIds?.some((id) => targets.has(id)) ||
          r.relations?.some((link) => identities.has(link.target)),
      )
      .map((r) => r.id),
  );
  records.sort(
    (a, b) =>
      Number(relatedIds.has(b.id)) - Number(relatedIds.has(a.id)) ||
      newestRecord(store, a, b, positions),
  );
  return { records, relatedIds };
}
export function assignThreadRecord(
  store: Store,
  threadId: string,
  recordId: string,
  allowHistorical = false,
): Store {
  const thread = store.threads?.[threadId];
  const record = store.records.find((r) => r.id === recordId);
  if (
    !thread ||
    !record ||
    record.project !== thread.project ||
    !(
      referenceState(store, { recordId }) === "available" ||
      (allowHistorical && referenceState(store, { recordId }) === "historical")
    )
  )
    throw new Error("只能关联同一项目的有效记录");
  const now = new Date().toISOString();
  return {
    ...store,
    threads: Object.fromEntries(
      Object.entries(store.threads || {}).map(([id, t]) => [
        id,
        id === threadId
          ? {
              ...t,
              recordIds: [
                ...t.recordIds.filter((rid) => rid !== recordId),
                recordId,
              ],
              updatedAt: now,
            }
          : t.recordIds.includes(recordId)
            ? {
                ...t,
                recordIds: t.recordIds.filter((rid) => rid !== recordId),
                updatedAt: now,
              }
            : t,
      ]),
    ),
  };
}
export function removeThreadRecord(
  store: Store,
  threadId: string,
  recordId: string,
): Store {
  const thread = store.threads?.[threadId];
  return thread
    ? {
        ...store,
        threads: {
          ...store.threads,
          [threadId]: {
            ...thread,
            recordIds: thread.recordIds.filter((id) => id !== recordId),
            updatedAt: new Date().toISOString(),
          },
        },
      }
    : store;
}
