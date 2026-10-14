import { useMemo, useState } from "react";
import { visibleRecords, newestRecord, historicalRecordIds } from "../model";
import { Action } from "./Controls";
import { ReferenceHistory } from "./ReferenceHistory";
import { projectLabel } from "../project-display";
import { RecordPreview } from "./RecordPreview";
import { savePeriodReview } from "../personal-commands";
import {
  usePersonalEditor,
  usePersonalStore,
  type PersonalPanelProps,
} from "./usePersonalEditor";

export function PeriodReviewPanel({
  store,
  period,
  start,
  end,
  commit,
  safely,
  registerEditor,
  openRecord,
}: PersonalPanelProps & { period: string; start: string; end: string }) {
  const { current, update } = usePersonalStore(store, commit);
  const mode = period as "周" | "月" | "年";
  const saved = store.periodReviews?.[`${mode}:${start}`];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(saved?.text || "");
  const [references, setReferences] = useState(saved?.references || []);
  const [project, setProject] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);
  const [referenceLimit, setReferenceLimit] = useState(50);
  const [error, setError] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [workspaceTab, setWorkspaceTab] = useState<"writing" | "materials">(
    "writing",
  );
  const readableById = useMemo(
    () => new Map(visibleRecords(store).map((r) => [r.id, r])),
    [store],
  );
  const historicalIds = useMemo(() => historicalRecordIds(store), [store]);
  const previewRecord = readableById.get(previewId);
  const toggleReference = (
    record: (typeof store.records)[number],
    checked: boolean,
  ) => {
    setReferences((current) =>
      checked
        ? current.some((ref) => ref.recordId === record.id)
          ? current
          : [
              ...current,
              { recordId: record.id, title: record.title, date: record.date },
            ]
        : current.filter((ref) => ref.recordId !== record.id),
    );
  };
  const projectLabels = useMemo(
    () =>
      new Map(
        store.projects.map((p) => [p.id, projectLabel(p, store.projects)]),
      ),
    [store.projects],
  );
  const referenceProject = (id: string) => {
    const record = readableById.get(id);
    return record ? ` · ${projectLabels.get(record.project) || "其他"}` : "";
  };
  const records = useMemo(() => {
    if (!editing) return [];
    const positions = new Map(store.records.map((r, index) => [r, index]));
    return [...readableById.values()]
      .filter((r) => r.date >= start && r.date <= end)
      .sort((a, b) => newestRecord(store, a, b, positions));
  }, [store, readableById, start, end, editing]);
  const citationSequence = useMemo(
    () =>
      (saved?.references || [])
        .map((ref) => ref.recordId)
        .filter((id) => readableById.has(id)),
    [saved?.references, readableById],
  );
  const selectedIds = useMemo(
    () => new Set(references.map((ref) => ref.recordId)),
    [references],
  );
  const referencesChanged = useMemo(
    () =>
      JSON.stringify(references) !== JSON.stringify(saved?.references || []),
    [references, saved?.references],
  );
  const candidates = useMemo(() => {
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return records.filter(
      (r) =>
        (!project || r.project === project) &&
        terms.every((term) =>
          `${r.title} ${r.summary || ""} ${r.change} ${r.next || ""}`
            .toLocaleLowerCase()
            .includes(term),
        ),
    );
  }, [records, project, query]);
  const discard = () => {
    setEditing(false);
    setError("");
  };
  const save = () => {
    if (
      !update(
        (latest) =>
          savePeriodReview(latest, {
            period: mode,
            start,
            end,
            text: draft,
            references,
          }),
        setError,
      )
    )
      return false;
    discard();
    return true;
  };
  usePersonalEditor(
    editing,
    draft !== (saved?.text || "") || referencesChanged,
    save,
    discard,
    registerEditor,
  );
  const begin = () =>
    safely(() => {
      const latest = current.current.periodReviews?.[`${mode}:${start}`];
      setDraft(latest?.text || "");
      setReferences(latest?.references || []);
      setProject("");
      setQuery("");
      setLimit(50);
      setReferenceLimit(50);
      setError("");
      setPreviewId("");
      setWorkspaceTab("writing");
      setEditing(true);
    });
  return (
    <section
      className="personal-panel period-review-panel"
      aria-label="本期回望"
    >
      <div className="personal-panel-heading">
        <h3>本期回望</h3>
        {!editing && (
          <Action onClick={begin}>{saved ? "编辑回望" : "写本期回望"}</Action>
        )}
      </div>
      {editing ? (
        <div
          className="person-editor period-editor period-workspace"
          data-workspace-tab={workspaceTab}
        >
          <div
            className="period-workspace-tabs segmented"
            aria-label="回望编辑区"
          >
            <button
              aria-pressed={workspaceTab === "writing"}
              onClick={() => setWorkspaceTab("writing")}
            >
              写正文
            </button>
            <button
              aria-pressed={workspaceTab === "materials"}
              onClick={() => setWorkspaceTab("materials")}
            >
              读材料 · 已选 {references.length}
            </button>
          </div>
          <div className="period-writing">
            <label>
              回望正文
              <textarea
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setError("");
                }}
              />
            </label>
            <small>
              可以写重要变化、改变的判断、有效方法或未解决的阻碍；也可以自由写。
            </small>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="personal-panel-actions period-editor-actions">
              <Action ink onClick={save}>
                保存回望
              </Action>
              <Action onClick={() => safely(discard)}>取消</Action>
            </div>
          </div>
          <details className="period-reference-chooser period-materials" open>
            <summary>选择引用记录 · 已选 {references.length} 条</summary>
            <fieldset className="reference-picker period-reference-picker">
              <legend>引用本期记录</legend>
              <div className="reference-filters">
                <label>
                  筛选项目
                  <select
                    value={project}
                    onChange={(e) => {
                      setProject(e.target.value);
                      setLimit(50);
                    }}
                  >
                    <option value="">全部项目</option>
                    {store.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.workspace ? ` · ${p.workspace}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  筛选记录
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setLimit(50);
                    }}
                    placeholder="标题或正文关键词"
                  />
                </label>
              </div>
              <div className="reference-options" aria-label="本期引用候选">
                {candidates.slice(0, limit).map((r) => (
                  <div className="reference-candidate" key={r.id}>
                    <label className="reference-option">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={(e) => toggleReference(r, e.target.checked)}
                      />
                      <span>
                        {r.date} · {r.title}
                        {referenceProject(r.id)}
                        {historicalIds.has(r.id) && (
                          <small>历史结论：已有后续否定或替代</small>
                        )}
                      </span>
                    </label>
                    <button
                      className="text-button preview-record"
                      aria-label={`预览 ${r.title}`}
                      onClick={() => setPreviewId(r.id)}
                    >
                      预览
                    </button>
                  </div>
                ))}
                {candidates.length > 50 && (
                  <small>
                    已显示 {Math.min(limit, candidates.length)} /{" "}
                    {candidates.length} 条候选
                  </small>
                )}
                {candidates.length > limit && (
                  <Action onClick={() => setLimit(limit + 50)}>
                    加载更多记录
                  </Action>
                )}
                {!candidates.length && <p>没有匹配的本期记录。</p>}
              </div>
            </fieldset>
            <section
              className="period-material-preview"
              aria-label="核对回望材料"
            >
              {previewRecord ? (
                <>
                  <RecordPreview
                    store={store}
                    record={previewRecord}
                    preview={setPreviewId}
                  />
                  <Action
                    disabled={
                      !selectedIds.has(previewRecord.id) &&
                      (previewRecord.date < start || previewRecord.date > end)
                    }
                    onClick={() =>
                      toggleReference(
                        previewRecord,
                        !selectedIds.has(previewRecord.id),
                      )
                    }
                  >
                    {selectedIds.has(previewRecord.id)
                      ? "移除当前引用"
                      : "引用当前记录"}
                  </Action>
                  {(previewRecord.date < start || previewRecord.date > end) && (
                    <small>
                      记录位于本期之外，可阅读；新增引用仍限定本期。
                    </small>
                  )}
                </>
              ) : (
                <p className="muted">
                  选择“预览”，核对变化、下一步及更正关系，写作草稿会保留。
                </p>
              )}
            </section>
            {!!references.length && (
              <div
                className="personal-references reference-selection"
                aria-label="已选引用"
              >
                {references.slice(0, referenceLimit).map((ref) => (
                  <div key={ref.recordId}>
                    <span>
                      {ref.date} · {ref.title}
                      {referenceProject(ref.recordId)}
                      {!readableById.has(ref.recordId)
                        ? "（引用记录不可用，保留摘取时的标题和日期）"
                        : ""}
                      {historicalIds.has(ref.recordId) ? "（历史结论）" : ""}
                    </span>
                    <Action
                      onClick={() =>
                        setReferences(
                          references.filter((x) => x.recordId !== ref.recordId),
                        )
                      }
                    >
                      移除引用
                    </Action>
                    {readableById.has(ref.recordId) && (
                      <button
                        className="text-button"
                        onClick={() => setPreviewId(ref.recordId)}
                      >
                        核对引用
                      </button>
                    )}
                  </div>
                ))}
                {references.length > 50 && (
                  <small>
                    已显示 {Math.min(referenceLimit, references.length)} /{" "}
                    {references.length} 条已选引用
                  </small>
                )}
                {references.length > referenceLimit && (
                  <Action
                    onClick={() => setReferenceLimit(referenceLimit + 50)}
                  >
                    加载更多已选引用
                  </Action>
                )}
              </div>
            )}
          </details>
        </div>
      ) : (
        <>
          {saved?.text && <p className="personal-panel-text">{saved.text}</p>}
          {(saved?.references || []).slice(0, referenceLimit).map((ref) => {
            const r = readableById.get(ref.recordId);
            return (
              <div className="personal-reference" key={ref.recordId}>
                {r ? (
                  <Action onClick={() => openRecord(r, citationSequence)}>
                    {ref.date} · {ref.title}
                    {referenceProject(ref.recordId)}
                  </Action>
                ) : (
                  <span>
                    {ref.date} · {ref.title}（引用记录不可用）
                  </span>
                )}
                {r && r.date !== ref.date && (
                  <small>记录日期已改为 {r.date}；引用保留摘取时的日期。</small>
                )}
                {r && (
                  <ReferenceHistory
                    store={store}
                    record={r}
                    openRecord={openRecord}
                  />
                )}
              </div>
            );
          })}
          {(saved?.references.length || 0) > 50 && (
            <small>
              已显示 {Math.min(referenceLimit, saved!.references.length)} /{" "}
              {saved!.references.length} 条引用
            </small>
          )}
          {(saved?.references.length || 0) > referenceLimit && (
            <Action onClick={() => setReferenceLimit(referenceLimit + 50)}>
              加载更多引用
            </Action>
          )}
          {saved && <small>手写回望 · {saved.updatedAt.slice(0, 10)}</small>}
        </>
      )}
    </section>
  );
}
