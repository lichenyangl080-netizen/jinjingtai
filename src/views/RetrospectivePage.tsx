import { ArrowRight, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { IconButton, Action } from "../components/Controls";
import { WorkRow } from "../components/Progress";
import { LibraryNotice } from "../components/LibraryNotice";
import { useMemo, useState } from "react";
import { PeriodReviewPanel } from "../components/PeriodReviewPanel";
import {
  lessonPreview,
  retrospectiveDays,
  filterRetrospectiveDays,
  sliceRetrospectiveDays,
} from "../retrospective";
import { projectDisplayOrder, projectLabel } from "../project-display";
import { historicalNext, periodRange, visibleRecords } from "../model";
import type { WorkspaceContext } from "../useWorkspace";
import { formatDate } from "../workspace-runtime";
export function RetrospectivePage({
  chooseDate,
  offset,
  period,
  safely,
  setOffset,
  setPage,
  setPeriod,
  setProjectId,
  store,
  today,
  openRecord,
  libraryFailure,
  refreshSettings,
  capture,
  commitPersonal,
  safelyPersonal,
  registerEditor,
  currentLibraryId,
  reviewLimit,
  setReviewLimit,
}: Pick<
  WorkspaceContext,
  | "chooseDate"
  | "offset"
  | "period"
  | "safely"
  | "setOffset"
  | "setPage"
  | "setPeriod"
  | "setProjectId"
  | "store"
  | "today"
  | "openRecord"
  | "libraryFailure"
  | "refreshSettings"
  | "capture"
  | "commitPersonal"
  | "safelyPersonal"
  | "registerEditor"
  | "currentLibraryId"
  | "reviewLimit"
  | "setReviewLimit"
>): React.ReactElement | null {
  const [filterProject, setFilterProject] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [search, setSearch] = useState("");
  const [start, end] = periodRange(period, offset, today);
  const list = useMemo(
    () =>
      visibleRecords(store)
        .filter((r) => r.date >= start && r.date <= end)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [store, start, end],
  );
  const months = useMemo(
    () => [...new Set(list.map((r) => r.date.slice(0, 7)))].sort(),
    [list],
  );
  const selectedMonth = months.includes(filterMonth) ? filterMonth : "";
  const allDays = useMemo(
    () => retrospectiveDays(store, start, end, "", "", ""),
    [store, start, end],
  );
  const days = useMemo(
    () =>
      filterRetrospectiveDays(allDays, filterProject, selectedMonth, search),
    [allDays, filterProject, selectedMonth, search],
  );
  const shownDays = useMemo(
    () => sliceRetrospectiveDays(days, reviewLimit),
    [days, reviewLimit],
  );
  const workCount = useMemo(
    () =>
      days.reduce(
        (count, day) =>
          count + day.projects.reduce((sum, p) => sum + p.works.length, 0),
        0,
      ),
    [days],
  );
  const sequence = useMemo(
    () =>
      days.flatMap((day) =>
        day.projects.flatMap((project) =>
          project.works.flatMap((work) => work.records.map((r) => r.id)),
        ),
      ),
    [days],
  );
  const filtered = !!(filterProject || selectedMonth || search.trim());
  function clearFilters() {
    setReviewLimit(200);
    setFilterProject("");
    setFilterMonth("");
    setSearch("");
  }
  if (libraryFailure)
    return (
      <>
        <header className="page-header">
          <h1>回望</h1>
        </header>
        <LibraryNotice
          failure={libraryFailure}
          reload={refreshSettings}
          path={capture?.config.library}
        />
      </>
    );
  return (
    <>
      <header className="page-header review-header">
        <div className="headline">
          <h1>回望</h1>
        </div>
        <div className="review-toolbar">
          <div className="segmented">
            {["周", "月", "年"].map((p) => (
              <button
                key={p}
                aria-pressed={p === period}
                onClick={() => {
                  safely(() => {
                    setPeriod(p);
                    setOffset(0);
                    setFilterMonth("");
                  });
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="range-controls">
            <IconButton
              label="上一周期"
              onClick={() => {
                safely(() => {
                  setOffset(offset - 1);
                  setFilterMonth("");
                });
              }}
            >
              <CaretLeft />
            </IconButton>
            <h2>
              {formatDate(start)} — {formatDate(end)}
            </h2>
            <IconButton
              label="下一周期"
              disabled={offset >= 0}
              onClick={() => {
                safely(() => {
                  setOffset(offset + 1);
                  setFilterMonth("");
                });
              }}
            >
              <CaretRight />
            </IconButton>
            {offset !== 0 && (
              <button
                className="text-button"
                onClick={() => {
                  safely(() => {
                    setOffset(0);
                    setFilterMonth("");
                  });
                }}
              >
                回到本{period}
              </button>
            )}
          </div>
        </div>
        <div className="review-filters" aria-label="筛选进展">
          <label>
            项目
            <select
              aria-label="筛选项目"
              value={filterProject}
              onChange={(e) => {
                setFilterProject(e.target.value);
                setReviewLimit(200);
              }}
            >
              <option value="">全部项目</option>
              {projectDisplayOrder(store.projects).map((p) => (
                <option value={p.id} key={p.id}>
                  {projectLabel(p, store.projects)}
                  {p.archived ? "（已归档）" : ""}
                </option>
              ))}
            </select>
          </label>
          {period === "年" && (
            <label>
              月份
              <select
                aria-label="定位月份"
                value={selectedMonth}
                onChange={(e) => {
                  setFilterMonth(e.target.value);
                  setReviewLimit(200);
                }}
              >
                <option value="">全年</option>
                {months.map((m) => (
                  <option value={m} key={m}>
                    {Number(m.slice(5))}月
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="review-search">
            查找事项
            <input
              type="search"
              aria-label="查找事项"
              placeholder="输入事项标题"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setReviewLimit(200);
              }}
            />
          </label>
          {filtered && (
            <button className="text-button" onClick={clearFilters}>
              清除筛选
            </button>
          )}
        </div>
      </header>
      <PeriodReviewPanel
        key={currentLibraryId + period + start}
        store={store}
        period={period}
        start={start}
        end={end}
        commit={commitPersonal}
        safely={safelyPersonal}
        registerEditor={registerEditor}
        openRecord={openRecord}
      />
      <div className="review-layout">
        <section className="review-section">
          <h2>走过的进展</h2>
          {!days.length && (
            <p className="muted" role="status">
              {filtered ? "没有符合筛选条件的进展。" : "这段时间还没有记录。"}
            </p>
          )}
          {shownDays.map(({ date, projects }) => (
            <section className="review-day" key={date}>
              <h3>{formatDate(date)}</h3>
              {projects.map((p) => (
                <section className="review-group" key={p.id}>
                  <h4>{projectLabel(p, store.projects)}</h4>
                  <div className="record-list">
                    {p.works.map((w) => (
                      <WorkRow
                        key={w.id}
                        store={store}
                        group={w}
                        onOpen={(record) => openRecord(record, sequence)}
                        summaryInDetails
                      />
                    ))}
                  </div>
                </section>
              ))}
            </section>
          ))}
          {workCount > 200 && (
            <small>
              已显示 {Math.min(reviewLimit, workCount)} / {workCount} 件事项
            </small>
          )}
          {workCount > reviewLimit && (
            <Action onClick={() => setReviewLimit(reviewLimit + 200)}>
              加载更多事项
            </Action>
          )}
        </section>
        <aside className="review-aside">
          <section className="review-section">
            <h2>值得留下</h2>
            {Object.entries(store.notes)
              .map(([d, n]) => [d, n] as const)
              .filter(([d, n]) => d >= start && d <= end && n?.lesson)
              .map(([d, n]) => (
                <div className="review-note" key={d}>
                  <details>
                    <summary>
                      <span className="review-lesson-heading">
                        <span>{formatDate(d)}</span>
                        <span className="review-lesson-preview">
                          {lessonPreview(n!.lesson!)}
                        </span>
                      </span>
                      <CaretRight size={15} />
                    </summary>
                    <p>{n!.lesson}</p>
                    <button
                      className="text-button"
                      onClick={() => chooseDate(d)}
                    >
                      查看这一天
                      <ArrowRight />
                    </button>
                  </details>
                </div>
              ))}
          </section>
          <section className="review-section">
            <h2>期末留下的下一步</h2>
            {store.projects
              .filter((p) => list.some((r) => r.project === p.id))
              .map((p) => (
                <div className="review-note" key={p.id}>
                  <details>
                    <summary>
                      <h3>{p.name}</h3>
                      <CaretRight size={15} />
                    </summary>
                    <p>{historicalNext(store, p.id, end)}</p>
                    <button
                      className="text-button"
                      onClick={() =>
                        safely(() => {
                          setProjectId(p.id);
                          setPage("项目");
                        })
                      }
                    >
                      进入项目
                      <ArrowRight />
                    </button>
                  </details>
                </div>
              ))}
          </section>
        </aside>
      </div>
    </>
  );
}
