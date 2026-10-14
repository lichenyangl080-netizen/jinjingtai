import { useMemo, useState } from "react";
import { currentProjectRecords, newestRecord, type Project } from "../model";
import {
  continuationSourceSignature,
  continuationWarning,
} from "../personal-workspace";
import { Action } from "./Controls";
import { ReferenceHistory } from "./ReferenceHistory";
import { saveContinuation } from "../personal-commands";
import {
  usePersonalEditor,
  usePersonalStore,
  type PersonalPanelProps,
} from "./usePersonalEditor";

export function ContinuationPanel({
  store,
  project,
  commit,
  safely,
  registerEditor,
  openRecord,
}: PersonalPanelProps & { project: Project }) {
  const { current, update } = usePersonalStore(store, commit);
  const saved = store.continuations?.[project.id];
  const text = saved?.text ?? project.next;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [recordId, setRecordId] = useState(saved?.recordId);
  const [sourceNext, setSourceNext] = useState(saved?.sourceNext);
  const [sourceSignature, setSourceSignature] = useState(
    saved?.sourceSignature,
  );
  const [sourcePicked, setSourcePicked] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);
  const eligible = useMemo(() => {
    if (!editing) return [];
    const positions = new Map(store.records.map((r, index) => [r, index]));
    return currentProjectRecords(store, project.id)
      .filter((r) => r.next.trim())
      .sort((a, b) => newestRecord(store, a, b, positions));
  }, [store, project.id, editing]);
  const candidates = useMemo(() => {
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return eligible.filter((r) =>
      terms.every((term) =>
        `${r.title} ${r.next}`.toLocaleLowerCase().includes(term),
      ),
    );
  }, [eligible, query]);
  const source = saved?.recordId
    ? store.records.find(
        (r) =>
          r.id === saved.recordId &&
          !r.removed &&
          !r.progressHidden &&
          !r.supersededDraftBy,
      )
    : undefined;
  const warning = continuationWarning(store, project.id);
  const discard = () => {
    setEditing(false);
    setError("");
  };
  const save = () => {
    if (
      !update(
        (latest) =>
          saveContinuation(
            latest,
            project.id,
            recordId && sourcePicked
              ? {
                  mode: "extract",
                  text: draft,
                  recordId,
                  sourceSignature: sourceSignature!,
                }
              : recordId
                ? {
                    mode: "retain",
                    value: {
                      text: draft,
                      recordId,
                      sourceNext,
                      sourceSignature,
                    },
                  }
                : { mode: "manual", text: draft },
          ),
        setError,
      )
    )
      return false;
    discard();
    return true;
  };
  usePersonalEditor(
    editing,
    draft !== text ||
      recordId !== saved?.recordId ||
      sourceNext !== saved?.sourceNext ||
      sourceSignature !== saved?.sourceSignature,
    save,
    discard,
    registerEditor,
  );
  const begin = () =>
    safely(() => {
      const latest = current.current.continuations?.[project.id];
      const latestProject = current.current.projects.find(
        (p) => p.id === project.id,
      );
      setDraft(latest?.text ?? latestProject?.next ?? "");
      setRecordId(latest?.recordId);
      setSourceNext(latest?.sourceNext);
      setSourceSignature(latest?.sourceSignature);
      setSourcePicked(false);
      setError("");
      setQuery("");
      setLimit(50);
      setEditing(true);
    });
  return (
    <section
      className="personal-panel continuation-panel"
      aria-label="继续起点"
    >
      <div className="personal-panel-heading">
        <h3>继续起点</h3>
        {!editing && (
          <Action onClick={begin}>{text ? "编辑起点" : "设置起点"}</Action>
        )}
      </div>
      {editing ? (
        <div className="person-editor">
          <label>
            下次从哪里继续
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setRecordId(undefined);
                setSourceNext(undefined);
                setSourceSignature(undefined);
                setSourcePicked(false);
                setError("");
              }}
            />
          </label>
          <label>
            从有效记录摘取
            <input
              value={query}
              placeholder="按标题或下一步筛选"
              aria-label="筛选起点来源"
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(50);
              }}
            />
            <select
              aria-label="起点来源"
              value={recordId || ""}
              onChange={(e) => {
                const r = eligible.find((r) => r.id === e.target.value);
                setRecordId(r?.id);
                setSourcePicked(!!r);
                setSourceNext(r?.next);
                setSourceSignature(
                  r ? continuationSourceSignature(r) : undefined,
                );
                if (r) setDraft(r.next);
              }}
            >
              <option value="">手写起点</option>
              {recordId &&
                !candidates.slice(0, limit).some((r) => r.id === recordId) && (
                  <option value={recordId}>
                    {eligible.find((r) => r.id === recordId)?.title ||
                      "已保存来源（当前不可用于摘取）"}
                  </option>
                )}
              {candidates.slice(0, limit).map((r) => (
                <option value={r.id} key={r.id}>
                  {r.date} · {r.title}
                </option>
              ))}
            </select>
          </label>
          {candidates.length > 50 && (
            <small>
              已显示 {Math.min(limit, candidates.length)} / {candidates.length}{" "}
              条来源
            </small>
          )}
          {candidates.length > limit && (
            <Action onClick={() => setLimit(limit + 50)}>
              加载更多起点来源
            </Action>
          )}
          {!candidates.length && (
            <p className="muted">没有匹配的有效下一步，可以继续手写。</p>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="personal-panel-actions">
            <Action ink onClick={save}>
              保存起点
            </Action>
            <Action onClick={() => safely(discard)}>取消</Action>
          </div>
        </div>
      ) : (
        <>
          <p className="personal-panel-text">{text || "尚未设置继续起点"}</p>
          {saved && (
            <small>
              {saved.recordId ? "记录摘取" : "手写起点"} ·{" "}
              {saved.updatedAt.slice(0, 10)}
            </small>
          )}
          {warning && <p role="status">{warning}</p>}
          {source && (
            <Action onClick={() => openRecord(source, [source.id])}>
              依据：{source.title}
            </Action>
          )}
          {!saved && text && <small>原有手写起点</small>}
          {source && (
            <ReferenceHistory
              store={store}
              record={source}
              openRecord={openRecord}
            />
          )}
        </>
      )}
    </section>
  );
}
