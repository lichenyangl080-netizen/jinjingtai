import { dayState } from "../day-state";
import { workingDay, type Store } from "../model";
import type { Status } from "../ipc-contract";
export function BacklogPanel({
  store,
  capture,
  date,
  today,
  chooseDate,
}: {
  store: Store;
  capture: Status | null;
  date: string;
  today: string;
  chooseDate: (date: string) => void;
}) {
  if (!capture) return null;
  const dates = [
    ...new Set([
      ...capture.stages.map((s) => s.date),
      ...capture.turns
        .filter((t) => Number.isFinite(Date.parse(t.at)))
        .map((t) => workingDay(Date.parse(t.at))),
      ...capture.jobs.map((j) => j.date),
    ]),
  ]
    .filter((d) => d !== date && d <= today)
    .sort()
    .reverse();
  const pending = dates
    .map((d) => {
      const state = dayState(store, capture, d);
      const job = capture.jobs.filter((j) => j.date === d).at(-1);
      return {
        date: d,
        state,
        failed: job?.state === "failed" && !job.applied,
      };
    })
    .filter((d) => d.state.materialCount || d.state.issueCount || d.failed);
  if (!pending.length) return null;
  return (
    <details className="backlog-panel">
      <summary>其他日期待整理 · {pending.length} 天</summary>
      <div className="backlog-list">
        {pending.map((d) => (
          <button key={d.date} onClick={() => chooseDate(d.date)}>
            <strong>{d.date}</strong>
            <span>
              {d.state.materialCount
                ? `${d.state.materialCount} 份材料待整理`
                : ""}
              {d.state.issueCount ? ` · ${d.state.issueCount} 轮待检查` : ""}
              {d.failed ? " · 上次整理失败" : ""}
            </span>
          </button>
        ))}
      </div>
    </details>
  );
}
