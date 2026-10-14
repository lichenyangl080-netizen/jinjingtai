import { useRef, useState } from "react";
import { currentProjectRecords, periodRange } from "../model";
import {
  continuationSourceSignature,
  referenceState,
  threadForRecord,
} from "../personal-workspace";
import { applyRecordUsage, type RecordUsage } from "../record-usage";
import type { ReviewPeriod } from "../review-navigation";
import { Action } from "./Controls";
import {
  usePersonalEditor,
  usePersonalStore,
  type PersonalPanelProps,
} from "./usePersonalEditor";

export function RecordUsageDialog({
  store,
  recordId,
  commit,
  safely,
  registerEditor,
  close,
  discard,
  saved,
}: PersonalPanelProps & {
  recordId: string;
  close: () => void;
  discard: () => void;
  saved: (
    kind: RecordUsage["kind"],
    period: ReviewPeriod,
    threadId: string,
  ) => void;
}) {
  const original = useRef(store.records.find((r) => r.id === recordId)!);
  const record =
    store.records.find((r) => r.id === recordId) || original.current;
  const { update } = usePersonalStore(store, commit);
  const canContinue =
    currentProjectRecords(store, record.project).some(
      (r) => r.id === recordId,
    ) && !!record.next.trim();
  const baseline = useRef({
    kind: canContinue ? "continuation" : "review",
    text: original.current.next,
  });
  const [kind, setKind] = useState<RecordUsage["kind"]>(
    canContinue ? "continuation" : "review",
  );
  const [text, setText] = useState(record.next);
  const [threadId, setThreadId] = useState("");
  const [allowMove, setAllowMove] = useState(false);
  const [allowHistorical, setAllowHistorical] = useState(false);
  const [period, setPeriod] = useState<ReviewPeriod>("月");
  const [signature] = useState(() => continuationSourceSignature(record));
  const [error, setError] = useState("");
  const previous = threadForRecord(store, recordId);
  const historical = referenceState(store, { recordId }) === "historical";
  const [start, end] = periodRange(period, 0, record.date);
  const threads = Object.values(store.threads || {}).filter(
    (thread) => thread.project === record.project && !thread.archived,
  );
  const save = () => {
    const input: RecordUsage =
      kind === "continuation"
        ? { kind, text, sourceSignature: signature }
        : kind === "thread"
          ? { kind, threadId, allowMove, allowHistorical }
          : { kind, period };
    if (
      !update((latest) => applyRecordUsage(latest, recordId, input), setError)
    )
      return false;
    close();
    saved(kind, period, threadId);
    return true;
  };
  usePersonalEditor(
    true,
    kind !== baseline.current.kind ||
      (kind === "continuation" && text !== baseline.current.text) ||
      (kind === "thread" && (!!threadId || allowMove || allowHistorical)) ||
      (kind === "review" && period !== "月"),
    save,
    discard,
    registerEditor,
  );
  return (
    <div className="modal-backdrop">
      <section
        className="dialog record-usage-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-usage-title"
      >
        <h2 id="record-usage-title">使用这条记录</h2>
        <p>
          {record.date} · {record.title}
        </p>
        <label>
          用途
          <select
            aria-label="记录用途"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as RecordUsage["kind"]);
              setError("");
            }}
          >
            <option value="continuation" disabled={!canContinue}>
              设为继续起点
            </option>
            <option value="thread" disabled={record.kind === "未采纳建议"}>
              关联到事项主线
            </option>
            <option value="review">引用到回望</option>
          </select>
        </label>
        {kind === "continuation" && (
          <>
            <label>
              继续起点正文
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <small>
              保留下一步副本；修改摘取文字后作为手写起点保存，不自动跟随来源更新。
            </small>
          </>
        )}
        {kind === "thread" && (
          <>
            <label>
              选择同项目主线
              <select
                aria-label="使用记录的目标主线"
                value={threadId}
                onChange={(e) => {
                  setThreadId(e.target.value);
                  setAllowMove(false);
                }}
              >
                <option value="">请选择主线</option>
                {threads.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            {!threads.length && (
              <p>此项目尚无可用主线，请先在项目页建立主线。</p>
            )}
            {historical && (
              <label>
                <input
                  type="checkbox"
                  checked={allowHistorical}
                  onChange={(e) => setAllowHistorical(e.target.checked)}
                />
                纳入可读历史判断，保留否定／替代状态
              </label>
            )}
            {previous && previous.id !== threadId && (
              <label>
                <input
                  type="checkbox"
                  checked={allowMove}
                  onChange={(e) => setAllowMove(e.target.checked)}
                />
                从「{previous.title}」移到所选主线
              </label>
            )}
          </>
        )}
        {kind === "review" && (
          <>
            <label>
              引用周期
              <select
                aria-label="使用记录的回望周期"
                value={period}
                onChange={(e) => setPeriod(e.target.value as ReviewPeriod)}
              >
                {["周", "月", "年"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <p>
              记录所在周期：{start} — {end}
            </p>
            <small>只追加引用，保留已有回望正文和所有引用。</small>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Action onClick={() => safely(close)}>取消</Action>
          <Action ink onClick={save}>
            保存用途
          </Action>
        </div>
      </section>
    </div>
  );
}
