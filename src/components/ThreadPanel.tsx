import { useEffect, useMemo, useRef, useState } from "react";
import {
  visibleRecords,
  newestRecord,
  historicalRecordIds,
  type Project,
} from "../model";
import { rankThreadRecords } from "../personal-workspace";
import { Action } from "./Controls";
import { ReferenceHistory } from "./ReferenceHistory";
import {
  usePersonalEditor,
  usePersonalStore,
  type PersonalPanelProps,
} from "./usePersonalEditor";

export function ThreadPanel({
  store,
  project,
  commit,
  safely,
  registerEditor,
  openRecord,
  targetThreadId,
  targetThreadRequest,
  reading,
  onReadingChange,
  onTargetLocated,
}: PersonalPanelProps & {
  project: Project;
  targetThreadId?: string;
  targetThreadRequest?: number;
  onTargetLocated?: (request: number) => void;
  reading?: Record<string, { open: boolean; limit: number }>;
  onReadingChange?: (
    id: string,
    patch: Partial<{ open: boolean; limit: number }>,
  ) => void;
}) {
  const { current, update } = usePersonalStore(store, commit);
  const threadElements = useRef(new Map<string, HTMLDetailsElement>());
  const threads = Object.values(store.threads || {}).filter(
    (t) => t.project === project.id,
  );
  const [editing, setEditing] = useState(false);
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recordIds, setRecordIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [includeHistorical, setIncludeHistorical] = useState(false);
  const [limit, setLimit] = useState(50);
  const [selectedLimit, setSelectedLimit] = useState(50);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [opened, setOpened] = useState<Set<string>>(
    () => new Set(targetThreadId ? [targetThreadId] : []),
  );
  const [memberLimits, setMemberLimits] = useState<Record<string, number>>({});
  useEffect(() => {
    if (editing || !targetThreadId) return;
    const element = threadElements.current.get(targetThreadId);
    if (!element) return;
    element.open = true;
    onReadingChange?.(targetThreadId, { open: true });
    setOpened((current) => new Set([...current, targetThreadId]));
    const frame = requestAnimationFrame(() => {
      element.scrollIntoView({ block: "nearest" });
      element.querySelector("summary")?.focus({ preventScroll: true });
      onTargetLocated?.(targetThreadRequest || 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [targetThreadId, targetThreadRequest, editing, project.id]);
  const saved = store.threads?.[id];
  const ranked = useMemo(
    () =>
      editing
        ? rankThreadRecords(store, project.id, recordIds, includeHistorical)
        : { records: [], relatedIds: new Set<string>() },
    [store, project.id, recordIds, editing, includeHistorical],
  );
  const eligibleIds = useMemo(
    () => new Set(ranked.records.map((r) => r.id)),
    [ranked],
  );
  const readableById = useMemo(
    () =>
      new Map(
        visibleRecords(store)
          .filter((r) => r.project === project.id)
          .map((r) => [r.id, r]),
      ),
    [store, project.id],
  );
  const historicalIds = useMemo(() => historicalRecordIds(store), [store]);
  const positions = useMemo(
    () => new Map(store.records.map((r, index) => [r, index])),
    [store],
  );
  const selectedIds = useMemo(() => new Set(recordIds), [recordIds]);
  const previousByRecord = useMemo(() => {
    const map = new Map<string, (typeof threads)[number]>();
    for (const thread of threads)
      if (thread.id !== id)
        for (const recordId of thread.recordIds) map.set(recordId, thread);
    return map;
  }, [store.threads, project.id, id]);
  const candidates = useMemo(() => {
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return ranked.records.filter((r) =>
      terms.every((term) =>
        [r.title, r.summary || "", r.change, r.next || ""]
          .join(" ")
          .toLocaleLowerCase()
          .includes(term),
      ),
    );
  }, [ranked, query]);
  const discard = () => {
    setEditing(false);
    setError("");
  };
  const save = () => {
    if (!title.trim()) {
      setError("请填写主线标题。");
      return false;
    }
    const now = new Date().toISOString();
    if (
      !update((latest) => {
        const nextThreads = { ...latest.threads };
        // Explicitly selected moves remove the member from its previous thread atomically.
        for (const t of Object.values(nextThreads)) {
          if (
            t.id !== id &&
            t.recordIds.some((recordId) => selectedIds.has(recordId))
          )
            nextThreads[t.id] = {
              ...t,
              recordIds: t.recordIds.filter(
                (recordId) => !recordIds.includes(recordId),
              ),
              updatedAt: now,
            };
        }
        const existing = latest.threads?.[id];
        nextThreads[id] = {
          id,
          project: project.id,
          title: title.trim(),
          description,
          recordIds,
          ...(existing?.archived ? { archived: true } : {}),
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        };
        return { ...latest, threads: nextThreads };
      }, setError)
    )
      return false;
    discard();
    return true;
  };
  usePersonalEditor(
    editing,
    title !== (saved?.title || "") ||
      description !== (saved?.description || "") ||
      JSON.stringify(recordIds) !== JSON.stringify(saved?.recordIds || []),
    save,
    discard,
    registerEditor,
  );
  const begin = (threadId?: string) =>
    safely(() => {
      const t = threadId ? current.current.threads?.[threadId] : undefined;
      setId(t?.id || crypto.randomUUID());
      setTitle(t?.title || "");
      setDescription(t?.description || "");
      setRecordIds(t?.recordIds || []);
      setQuery("");
      setIncludeHistorical(false);
      setLimit(50);
      setSelectedLimit(50);
      setError("");
      setPendingDelete(null);
      setEditing(true);
    });
  const archive = (threadId: string) =>
    safely(() => {
      update((latest) => {
        const t = latest.threads?.[threadId];
        if (!t) return latest;
        return {
          ...latest,
          threads: {
            ...latest.threads,
            [threadId]: {
              ...t,
              archived: !t.archived,
              updatedAt: new Date().toISOString(),
            },
          },
        };
      }, setError);
    });
  const remove = (threadId: string) =>
    safely(() => {
      if (
        update((latest) => {
          const nextThreads = { ...latest.threads };
          delete nextThreads[threadId];
          return { ...latest, threads: nextThreads };
        }, setError)
      )
        setPendingDelete(null);
    });
  return (
    <section className="personal-panel thread-panel" aria-label="事项主线">
      <div className="personal-panel-heading">
        <h3>事项主线</h3>
        {!editing && <Action onClick={() => begin()}>新建主线</Action>}
      </div>
      {editing ? (
        <div className="person-editor">
          <label>
            主线标题
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError("");
              }}
            />
          </label>
          <label>
            主线说明
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <fieldset className="reference-picker">
            <legend>关联同项目记录</legend>
            <button
              type="button"
              className="text-button history-choice"
              aria-pressed={includeHistorical}
              onClick={() => {
                setIncludeHistorical(!includeHistorical);
                setLimit(50);
              }}
            >
              {includeHistorical ? "隐藏历史判断" : "包含可读历史判断"}
            </button>
            {includeHistorical && (
              <small>历史成员保留否定／替代状态，不会成为当前行动。</small>
            )}
            {!!recordIds.length && (
              <div className="personal-references" aria-label="已关联记录">
                {recordIds.slice(0, selectedLimit).map((recordId) => {
                  const r = readableById.get(recordId);
                  const historical = r && historicalIds.has(recordId);
                  return (
                    <div key={recordId}>
                      <span>
                        {r
                          ? `${r.date} · ${r.title}`
                          : "原有关联记录不可用，保留引用"}
                        {historical ? "（历史结论）" : ""}
                        {!historical && r && !eligibleIds.has(recordId)
                          ? `（${r.kind}）`
                          : ""}
                      </span>
                      <Action
                        onClick={() =>
                          setRecordIds(
                            recordIds.filter((item) => item !== recordId),
                          )
                        }
                      >
                        解除关联
                      </Action>
                    </div>
                  );
                })}
                {recordIds.length > 50 && (
                  <small>
                    已显示 {Math.min(selectedLimit, recordIds.length)} /{" "}
                    {recordIds.length} 条已关联记录
                  </small>
                )}
                {recordIds.length > selectedLimit && (
                  <Action onClick={() => setSelectedLimit(selectedLimit + 50)}>
                    加载更多已关联记录
                  </Action>
                )}
              </div>
            )}
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
            {candidates.slice(0, limit).map((r) => {
              const previous = previousByRecord.get(r.id);
              const selected = selectedIds.has(r.id);
              return (
                <div className="thread-candidate" key={r.id}>
                  {previous && !selected ? (
                    <>
                      <span>
                        {r.date} · {r.title}（已在「{previous.title}」）
                      </span>
                      <Action
                        onClick={() => setRecordIds([...recordIds, r.id])}
                      >
                        移动到本主线
                      </Action>
                    </>
                  ) : (
                    <label>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) =>
                          setRecordIds(
                            e.target.checked
                              ? [...recordIds, r.id]
                              : recordIds.filter(
                                  (recordId) => recordId !== r.id,
                                ),
                          )
                        }
                      />
                      {r.date} · {r.title}
                      {historicalIds.has(r.id)
                        ? "（历史结论：已被否定或替代）"
                        : ""}
                      {previous && selected
                        ? "（保存后移动到本主线）"
                        : ranked.relatedIds.has(r.id)
                          ? "（有关联依据）"
                          : ""}
                    </label>
                  )}
                </div>
              );
            })}
            {candidates.length > 50 && (
              <small>
                已显示 {Math.min(limit, candidates.length)} /{" "}
                {candidates.length} 条候选
              </small>
            )}
            {candidates.length > limit && (
              <Action onClick={() => setLimit(limit + 50)}>加载更多记录</Action>
            )}
            {!candidates.length && <p>没有匹配的有效记录。</p>}
          </fieldset>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="personal-panel-actions">
            <Action ink onClick={save}>
              保存主线
            </Action>
            <Action onClick={() => safely(discard)}>取消</Action>
          </div>
        </div>
      ) : (
        <>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {!threads.length && (
            <p>还没有主线。把同一项工作的跨日记录手动关联起来。</p>
          )}
          {threads
            .sort(
              (a, b) =>
                Number(!!a.archived) - Number(!!b.archived) ||
                b.updatedAt.localeCompare(a.updatedAt),
            )
            .map((thread) => {
              const isOpen = reading
                ? !!reading[thread.id]?.open
                : opened.has(thread.id);
              const memberLimit =
                reading?.[thread.id]?.limit || memberLimits[thread.id] || 50;
              const linked = thread.recordIds.map((id) => readableById.get(id));
              const dates = linked.flatMap((r) => (r ? [r.date] : [])).sort();
              const unavailable = linked.filter((r) => !r).length;
              const members = (isOpen ? thread.recordIds : [])
                .map((recordId) => ({
                  id: recordId,
                  record: readableById.get(recordId),
                }))
                .sort((a, b) =>
                  a.record && b.record
                    ? -newestRecord(store, a.record, b.record, positions)
                    : Number(!!b.record) - Number(!!a.record),
                );
              const sequence = members
                .filter((item) => item.record)
                .map((item) => item.id);
              return (
                <details
                  className="thread-item"
                  key={thread.id}
                  data-thread-id={thread.id}
                  open={isOpen}
                  onToggle={(event) => {
                    const open = event.currentTarget.open;
                    onReadingChange?.(thread.id, { open });
                    setOpened((current) => {
                      if (current.has(thread.id) === open) return current;
                      const next = new Set(current);
                      if (open) next.add(thread.id);
                      else next.delete(thread.id);
                      return next;
                    });
                  }}
                  ref={(element) => {
                    if (element) threadElements.current.set(thread.id, element);
                    else threadElements.current.delete(thread.id);
                  }}
                >
                  <summary>
                    {thread.title}
                    {thread.archived ? " · 已归档" : ""}
                    <small>
                      {thread.recordIds.length} 条记录
                      {dates.length
                        ? ` · ${dates[0]} — ${dates[dates.length - 1]}`
                        : ""}
                      {unavailable ? ` · ${unavailable} 条引用不可用` : ""}
                    </small>
                  </summary>
                  {isOpen && (
                    <>
                      {thread.description && (
                        <p className="personal-panel-text">
                          {thread.description}
                        </p>
                      )}
                      {thread.archived && (
                        <small>
                          已停止主动组织；归档不表示完成或验证通过。
                        </small>
                      )}
                      <div className="thread-records">
                        {members.slice(0, memberLimit).map((item) => (
                          <div key={item.id}>
                            {item.record ? (
                              <button
                                className="thread-record-link"
                                data-record-id={item.id}
                                onClick={() =>
                                  openRecord(item.record!, sequence)
                                }
                              >
                                <span
                                  className="thread-record-arrow"
                                  aria-hidden="true"
                                >
                                  ↗
                                </span>
                                {item.record.date} · {item.record.title}
                                <small>{item.record.kind}</small>
                                <span className="personal-panel-text">
                                  {item.record.change}
                                </span>
                              </button>
                            ) : (
                              <span>关联记录不可用</span>
                            )}
                            {item.record && (
                              <ReferenceHistory
                                store={store}
                                record={item.record}
                                openRecord={openRecord}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                      {members.length > 50 && (
                        <small>
                          已显示 {Math.min(memberLimit, members.length)} /{" "}
                          {members.length} 条主线记录
                        </small>
                      )}
                      {members.length > memberLimit && (
                        <Action
                          onClick={() => {
                            onReadingChange?.(thread.id, {
                              limit: memberLimit + 50,
                            });
                            setMemberLimits((current) => ({
                              ...current,
                              [thread.id]: memberLimit + 50,
                            }));
                          }}
                        >
                          加载更多主线记录
                        </Action>
                      )}
                      <div className="personal-panel-actions">
                        <Action onClick={() => begin(thread.id)}>
                          编辑主线
                        </Action>
                        <Action
                          onClick={() => archive(thread.id)}
                          title="归档只停止主动组织，不改变记录的完成或验证状态。"
                        >
                          {thread.archived ? "取消归档" : "归档主线"}
                        </Action>
                        <Action
                          onClick={() =>
                            safely(() => setPendingDelete(thread.id))
                          }
                        >
                          删除主线
                        </Action>
                      </div>
                      {pendingDelete === thread.id && (
                        <div className="thread-delete-confirm">
                          <p>删除主线只解除组织关系，原记录仍保留。</p>
                          <Action onClick={() => remove(thread.id)}>
                            确认删除主线
                          </Action>
                          <Action onClick={() => setPendingDelete(null)}>
                            保留主线
                          </Action>
                        </div>
                      )}
                    </>
                  )}
                </details>
              );
            })}
        </>
      )}
    </section>
  );
}
