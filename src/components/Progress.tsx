import { ArrowRight, CaretRight } from "@phosphor-icons/react";
import {
  dailyRecordTitle,
  displacedBy,
  type RecordItem,
  type Store,
  type WorkGroup,
} from "../model";
import { workProgress } from "../work-progress";

type RecordProps = {
  store: Store;
  record: RecordItem;
  withDate?: boolean;
  selectedId?: string;
  onOpen: (record: RecordItem) => void;
};
const formatDate = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
export function RecordRow({
  store,
  record: r,
  withDate = false,
  selectedId,
  onOpen,
}: RecordProps) {
  const historical = !!displacedBy(store, r);
  return (
    <button
      data-record-id={r.id}
      className={`record-row ${withDate ? "timed" : ""} ${selectedId === r.id ? "selected ink-selected" : ""}`}
      onClick={() => onOpen(r)}
      aria-pressed={selectedId === r.id}
      onKeyDown={(e) => {
        if (!["ArrowDown", "ArrowUp"].includes(e.key)) return;
        e.preventDefault();
        const list = [
          ...e.currentTarget
            .closest(".record-list")!
            .querySelectorAll<HTMLButtonElement>(".record-row"),
        ];
        list[
          (list.indexOf(e.currentTarget) +
            (e.key === "ArrowDown" ? 1 : -1) +
            list.length) %
            list.length
        ]?.focus();
      }}
    >
      {withDate && (
        <span className="timeline-date" title={formatDate(r.date)}>
          {Number(r.date.slice(5, 7))}月{Number(r.date.slice(-2))}日
        </span>
      )}
      <span className="kind">{historical ? "历史结论" : r.kind}</span>
      <span className="row-copy">
        <strong>
          {dailyRecordTitle(
            r.title,
            store.projects.find((p) => p.id === r.project)?.name || "",
          )}
        </strong>
        {(withDate || r.dailySummary || r.manual || r.humanEdited) && (
          <span className={!withDate ? "outcome-summary" : ""}>
            {r.summary || r.change || "手动补记"}
            {historical ? " · 已有后续更正" : ""}
          </span>
        )}
      </span>
      <CaretRight size={20} />
    </button>
  );
}
export function WorkRow({
  store,
  group: g,
  withDate = false,
  summaryInDetails = false,
  selectedId,
  onOpen,
}: Omit<RecordProps, "record"> & {
  group: WorkGroup;
  summaryInDetails?: boolean;
}) {
  const title =
    g.label ||
    dailyRecordTitle(
      g.title,
      store.projects.find((p) => p.id === g.records[0].project)?.name || "",
    );
  // Compact single-record headings do not display status or summaries.
  // Avoid scanning the full store for text that will never be rendered.
  const progress =
    summaryInDetails && g.records.length === 1 ? null : workProgress(store, g);
  const caption = progress?.caption;
  if (g.records.length === 1) {
    const r = g.records[0];
    return (
      <button
        data-record-id={r.id}
        className={`record-row work-heading ${selectedId === r.id ? "selected ink-selected" : ""}`}
        onClick={() => onOpen(r)}
        aria-pressed={selectedId === r.id}
      >
        <span className="row-copy">
          <strong>{title}</strong>
          {!summaryInDetails && (
            <span className="work-result">
              {caption && (
                <span className="work-result-caption">{caption}</span>
              )}
              <span className="outcome-summary">
                {progress?.summary || r.change}
              </span>
            </span>
          )}
        </span>
        <CaretRight size={17} />
      </button>
    );
  }
  return (
    <details
      className={`work-group ${progress!.historical ? "historical-work" : ""}`}
    >
      <summary className="record-row work-heading">
        {withDate && (
          <span className="timeline-date">
            {Number(g.records[0].date.slice(5, 7))}月
            {Number(g.records[0].date.slice(-2))}日
          </span>
        )}
        <span className="row-copy">
          <span className="work-title-line">
            <strong>{title}</strong>
          </span>
          {!summaryInDetails && (
            <span className="work-result">
              {caption && (
                <span className="work-result-caption">{caption}</span>
              )}
              <span className="outcome-summary">
                {progress!.summary || "展开查看本次记录"}
              </span>
            </span>
          )}
        </span>
        <span className="work-disclosure">
          <CaretRight size={17} />
        </span>
      </summary>
      <div className="work-details">
        {summaryInDetails && (
          <p className="outcome-summary">
            {progress!.summary || "本次记录的内容见下方依据。"}
          </p>
        )}
        {!!progress!.corrections.length && (
          <section className="work-corrections">
            <h3>后续更正</h3>
            {progress!.corrections.map((r) => (
              <button
                className="text-button"
                key={r.id}
                onClick={() => onOpen(r)}
              >
                {formatDate(r.date)} · {r.title}
                <ArrowRight size={13} />
              </button>
            ))}
          </section>
        )}
        {!!progress!.next.length && (
          <section className="work-next">
            <h3>待继续</h3>
            {progress!.next.slice(0, 2).map((next) => (
              <p key={next}>{next}</p>
            ))}
          </section>
        )}
        <div className="work-records-head">
          记录与依据<span>点开查看或修改</span>
        </div>
        <div className="record-list">
          {g.records.map((r) => (
            <RecordRow
              key={r.id}
              store={store}
              record={r}
              selectedId={selectedId}
              onOpen={onOpen}
            />
          ))}
        </div>
      </div>
    </details>
  );
}
