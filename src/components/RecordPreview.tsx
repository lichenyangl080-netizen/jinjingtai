import { useMemo } from "react";
import {
  recordRelationEdges,
  historicalRecordIds,
  type RecordItem,
  type Store,
} from "../model";
import { projectLabel } from "../project-display";

/** Read saved prose in-place; this does not open a workspace editor or sources. */
export function RecordPreview({
  store,
  record,
  preview,
}: {
  store: Store;
  record: RecordItem;
  preview: (id: string) => void;
}) {
  const historical = useMemo(
    () => historicalRecordIds(store).has(record.id),
    [store, record.id],
  );
  const edges = useMemo(
    () => recordRelationEdges(store, record),
    [store, record],
  );
  const project = store.projects.find((p) => p.id === record.project);
  return (
    <article className="record-preview" aria-label="材料正文预览">
      <h4>{record.title}</h4>
      <small>
        {record.date} ·{" "}
        {project ? projectLabel(project, store.projects) : "其他"} ·{" "}
        {record.kind}
      </small>
      {historical && (
        <p role="status">历史判断：已有后续否定或替代，保留原来的验证状态。</p>
      )}
      {record.summary && record.summary !== record.change && (
        <p>{record.summary}</p>
      )}
      <h5>变化</h5>
      <p>{record.change || "暂未记录变化。"}</p>
      <h5>下一步</h5>
      <p>{record.next || "暂未记录下一步。"}</p>
      {!!edges.length && (
        <section aria-label="材料更正关系">
          <h5>关联判断</h5>
          {edges.map((edge, i) => (
            <p key={i}>
              {edge.incoming ? "后续" : ""}
              {edge.type === "negates"
                ? "否定"
                : edge.type === "supersedes"
                  ? "替代"
                  : "补充"}{" "}
              ·{" "}
              {edge.record &&
              !edge.record.removed &&
              !edge.record.progressHidden &&
              !edge.record.supersededDraftBy ? (
                <button
                  className="text-button"
                  onClick={() => preview(edge.record!.id)}
                >
                  {edge.record.title}
                </button>
              ) : (
                <span>关联记录不可用</span>
              )}
            </p>
          ))}
        </section>
      )}
      {record.evidence && (
        <details>
          <summary>已保存依据</summary>
          <p>{record.evidence}</p>
        </details>
      )}
    </article>
  );
}
