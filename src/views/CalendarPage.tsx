import {
  ArrowRight,
  CaretLeft,
  CaretRight,
  FolderSimple,
  Plus,
} from "@phosphor-icons/react";
import { Action, IconButton } from "../components/Controls";
import { dayState } from "../day-state";
import {
  dailyRecordTitle,
  localDate,
  planningLimit,
  shiftDate,
  visibleRecords,
  workGroups,
  type WorkGroup,
} from "../model";
import type { WorkspaceContext } from "../useWorkspace";
import { workProgress } from "../work-progress";
import { RecordRow } from "../components/Progress";
import { connected, formatDate } from "../workspace-runtime";
import { useEffect, useRef } from "react";
export function CalendarPage({
  addRecord,
  calendarDate,
  capture,
  captureError,
  chooseDate,
  date,
  editPlan,
  inspectDay,
  libraryFailure,
  month,
  planEdit,
  prepareDayFor,
  refreshSettings,
  safely,
  savePlan,
  setCalendarDate,
  setMonth,
  setPlanEdit,
  store,
  today,
  openRecord,
  drawer,
  positions,
  persistLocation,
  currentLibraryId,
}: Pick<
  WorkspaceContext,
  | "addRecord"
  | "calendarDate"
  | "capture"
  | "captureError"
  | "chooseDate"
  | "date"
  | "editPlan"
  | "inspectDay"
  | "libraryFailure"
  | "month"
  | "planEdit"
  | "prepareDayFor"
  | "refreshSettings"
  | "safely"
  | "savePlan"
  | "setCalendarDate"
  | "setMonth"
  | "setPlanEdit"
  | "store"
  | "today"
  | "openRecord"
  | "drawer"
  | "positions"
  | "persistLocation"
  | "currentLibraryId"
>): React.ReactElement | null {
  const dayBody = useRef<HTMLDivElement>(null);
  const dayScrollKey = `${currentLibraryId}:calendar:${calendarDate}`;
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (dayBody.current)
        dayBody.current.scrollTop = positions.current[dayScrollKey] || 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [dayScrollKey, positions]);
  const limit = planningLimit(today),
    future = calendarDate > today;
  const first = new Date(month + "-01T12:00:00");
  const pad = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const gridStart = shiftDate(localDate(first), -pad);
  const selectedRecords = visibleRecords(store, calendarDate);
  const selectedState = dayState(
    store,
    captureError ? null : capture,
    calendarDate,
  );
  const selectedWorks = workGroups(store, selectedRecords);
  const selectedNote = store.notes[calendarDate];
  const hasReview = !!(
    selectedNote?.lesson?.trim() || selectedNote?.tomorrow?.trim()
  );
  function selectDay(next: string, focus = false) {
    safely(() => {
      setCalendarDate(next);
      setMonth(next.slice(0, 7));
      if (focus)
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLButtonElement>(`[data-calendar-date="${next}"]`)
            ?.focus(),
        );
    });
  }
  function changeMonth(n: number) {
    const d = new Date(first);
    d.setMonth(d.getMonth() + n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const target = localDate(
      new Date(
        d.getFullYear(),
        d.getMonth(),
        Math.min(Number(calendarDate.slice(-2)), last),
      ),
    );
    selectDay(target > limit ? limit : target);
  }
  return (
    <>
      <header className="page-header">
        <div className="headline">
          <h1>日历</h1>
        </div>
      </header>
      <div className="calendar-layout">
        <section className="calendar-month" aria-label="选择日期">
          <div className="month-controls">
            <IconButton label="上一月" onClick={() => changeMonth(-1)}>
              <CaretLeft />
            </IconButton>
            <h2>
              {first.getFullYear()}年{first.getMonth() + 1}月
            </h2>
            <IconButton
              label="下一月"
              disabled={month >= limit.slice(0, 7)}
              onClick={() => changeMonth(1)}
            >
              <CaretRight />
            </IconButton>
            <button className="text-button" onClick={() => selectDay(today)}>
              回到今天
            </button>
          </div>
          <div
            className="calendar-grid"
            role="group"
            aria-label={`${month}月历`}
          >
            {"一二三四五六日".split("").map((w) => (
              <span className="weekday" key={w}>
                {w}
              </span>
            ))}
            {Array.from({ length: Math.ceil((pad + days) / 7) * 7 }, (_, i) => {
              const day = shiftDate(gridStart, i);
              const hasRecords = visibleRecords(store, day).length > 0;
              const collected =
                day <= today &&
                dayState(store, captureError ? null : capture, day)
                  .materialCount > 0;
              const planned = !!store.plans?.[day];
              const noted = !!(
                store.notes[day]?.lesson?.trim() ||
                store.notes[day]?.tomorrow?.trim()
              );
              return (
                <button
                  key={day}
                  data-calendar-date={day}
                  aria-label={`${formatDate(day)}${hasRecords ? "，有进展记录" : ""}${noted ? "，有手写回顾" : ""}${collected ? "，有材料待整理" : ""}${planned ? "，有规划" : ""}${day === today ? "，今天" : ""}`}
                  aria-pressed={calendarDate === day}
                  tabIndex={calendarDate === day ? 0 : -1}
                  disabled={day > limit}
                  className={`calendar-day ${day > today ? "future" : ""} ${day.slice(0, 7) !== month ? "outside" : ""} ${calendarDate === day ? "chosen" : ""} ${day === today ? "is-today" : ""}`}
                  onKeyDown={(e) => {
                    const step: Record<string, number> = {
                      ArrowLeft: -1,
                      ArrowRight: 1,
                      ArrowUp: -7,
                      ArrowDown: 7,
                    };
                    if (step[e.key]) {
                      e.preventDefault();
                      const next = shiftDate(day, step[e.key]);
                      if (next <= limit) selectDay(next, true);
                    }
                  }}
                  onClick={() => selectDay(day)}
                >
                  <span>{Number(day.slice(-2))}</span>
                  <span className="calendar-day-marks" aria-hidden="true">
                    {(hasRecords || noted) && <span className="record-dot" />}
                    {collected && <span className="material-dot" />}
                    {planned && <span className="plan-dot" />}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="calendar-legend" aria-label="日历标记说明">
            <span>
              <i className="legend-record" />
              有记录或回顾
            </span>
            <span>
              <i className="legend-material" />
              待整理
            </span>
            <span>
              <i className="legend-plan" />
              有规划
            </span>
          </div>
        </section>
        <section
          className="date-preview calendar-summary"
          aria-label="所选日期内容"
        >
          <header className="calendar-summary-header">
            <div>
              <h2>
                {Number(calendarDate.slice(5, 7))}月
                {Number(calendarDate.slice(-2))}日
              </h2>
              <span>
                星期
                {
                  "日一二三四五六"[
                    new Date(calendarDate + "T12:00:00").getDay()
                  ]
                }
                {calendarDate === today
                  ? " · 今天"
                  : future
                    ? " · 未来规划"
                    : ""}
              </span>
            </div>
            {!future && (selectedRecords.length > 0 || hasReview) && (
              <Action onClick={() => chooseDate(calendarDate)}>
                查看全天
                <ArrowRight size={15} />
              </Action>
            )}
          </header>
          <div
            className="calendar-summary-body"
            key={calendarDate}
            tabIndex={0}
            aria-label="当天事项，可独立滚动"
            ref={dayBody}
            onScroll={(e) => {
              positions.current[dayScrollKey] = e.currentTarget.scrollTop;
              persistLocation();
            }}
          >
            {libraryFailure ? (
              <section className="calendar-empty">
                <h3>资料暂不可读取</h3>
                <p>请先检查资料库，当前不能判断这一天的内容。</p>
                <Action onClick={refreshSettings}>重新读取</Action>
              </section>
            ) : future || planEdit?.date === calendarDate ? (
              <section className="future-plan">
                <h3>这一天的安排</h3>
                {planEdit && planEdit.date === calendarDate ? (
                  <>
                    {!future && (
                      <p role="status">
                        工作日已切换，草稿仍保留。保存后会留在
                        {formatDate(planEdit.date)}的当日规划中。
                      </p>
                    )}
                    <textarea
                      aria-label="未来规划"
                      autoFocus
                      maxLength={10000}
                      value={planEdit.text}
                      onChange={(e) =>
                        setPlanEdit({ ...planEdit, text: e.target.value })
                      }
                    />
                    <div className="form-actions">
                      <Action onClick={() => safely(() => {})}>取消</Action>
                      <Action ink onClick={savePlan}>
                        保存规划
                      </Action>
                    </div>
                  </>
                ) : (
                  <>
                    {store.plans?.[calendarDate] ? (
                      <p className="calendar-plan-text">
                        {store.plans[calendarDate]}
                      </p>
                    ) : (
                      <p className="calendar-empty-copy">
                        还没有安排，写下想推进的一件事。
                      </p>
                    )}
                    <Action ink onClick={() => editPlan(calendarDate)}>
                      {store.plans?.[calendarDate] ? "编辑规划" : "写下规划"}
                    </Action>
                  </>
                )}
              </section>
            ) : (
              <>
                {(selectedWorks.length > 0 ||
                  selectedState.materialCount > 0) && (
                  <div className="calendar-summary-state">
                    {selectedWorks.length > 0 && (
                      <strong>{selectedWorks.length}件事项</strong>
                    )}
                    {selectedState.materialCount > 0 && (
                      <button
                        className="text-button"
                        disabled={!connected}
                        onClick={() => prepareDayFor(calendarDate)}
                      >
                        {selectedState.materialCount}份材料待整理
                        <ArrowRight size={13} />
                      </button>
                    )}
                  </div>
                )}
                {selectedState.issueCount > 0 && (
                  <button
                    className="text-button calendar-issue"
                    onClick={() => inspectDay(calendarDate)}
                  >
                    {selectedState.issueCount}轮记录待检查
                  </button>
                )}
                {!selectedWorks.length && !hasReview && (
                  <section className="calendar-empty">
                    <h3>
                      {selectedState.materialCount
                        ? "收到材料，尚未整理"
                        : selectedState.issueCount
                          ? "记录尚不完整"
                          : selectedState.state === "unavailable" && connected
                            ? "采集状态暂不可核实"
                            : "这一天尚无进展记录"}
                    </h3>
                    <p>
                      {selectedState.materialCount
                        ? "整理后，这一天推进的事情会显示在这里。"
                        : selectedState.issueCount
                          ? "先检查漏记、中断或待核准来源，再回看本日进展。"
                          : selectedState.state === "unavailable" && connected
                            ? "已有资料保留，可以检查连接或手动补记。"
                            : selectedState.noChangeTurns
                              ? "已核准的查询没有新增变化，不计作进步。"
                              : "可以补记一件推进的事，也可以选择另一天。"}
                    </p>
                    {selectedState.materialCount && connected ? (
                      <Action ink onClick={() => prepareDayFor(calendarDate)}>
                        整理这一天
                      </Action>
                    ) : (
                      <Action onClick={() => addRecord(calendarDate)}>
                        <Plus size={15} />
                        补记一件事
                      </Action>
                    )}
                  </section>
                )}
                {[
                  ...new Set(selectedWorks.map((g) => g.records[0].project)),
                ].map((id) => {
                  const works = selectedWorks.filter(
                    (g) => g.records[0].project === id,
                  );
                  const row = (g: WorkGroup) => {
                    const progress = workProgress(store, g);
                    const content = (
                      <>
                        <div>
                          <strong>
                            {g.label ||
                              dailyRecordTitle(
                                g.title,
                                store.projects.find((p) => p.id === id)?.name ||
                                  "",
                              )}
                          </strong>
                          {progress.caption && <span>{progress.caption}</span>}
                        </div>
                        <p>{progress.summary}</p>
                        <CaretRight
                          size={15}
                          className="calendar-work-arrow"
                          aria-hidden="true"
                        />
                      </>
                    );
                    return g.records.length === 1 ? (
                      <button
                        type="button"
                        className="calendar-work"
                        data-record-id={g.records[0].id}
                        key={g.id}
                        onClick={() =>
                          openRecord(
                            g.records[0],
                            works.flatMap((w) => w.records.map((r) => r.id)),
                          )
                        }
                        aria-pressed={drawer?.record.id === g.records[0].id}
                      >
                        {content}
                      </button>
                    ) : (
                      <details className="calendar-work-group" key={g.id}>
                        <summary className="calendar-work">{content}</summary>
                        <div className="record-list">
                          {g.records.map((r) => (
                            <RecordRow
                              key={r.id}
                              store={store}
                              record={r}
                              selectedId={drawer?.record.id}
                              onOpen={(record) =>
                                openRecord(
                                  record,
                                  works.flatMap((w) =>
                                    w.records.map((r) => r.id),
                                  ),
                                )
                              }
                            />
                          ))}
                        </div>
                      </details>
                    );
                  };
                  return (
                    <section className="calendar-project" key={id}>
                      {id !== "unassigned" && (
                        <h3>
                          <FolderSimple size={16} />
                          {store.projects.find((p) => p.id === id)?.name ||
                            "未归项目"}
                        </h3>
                      )}
                      {works.slice(0, 2).map(row)}
                      {works.length > 2 && (
                        <details
                          className="calendar-other"
                          key={calendarDate + id}
                        >
                          <summary>其他 {works.length - 2} 件事项</summary>
                          {works.slice(2).map(row)}
                        </details>
                      )}
                    </section>
                  );
                })}
                {hasReview && (
                  <section className="calendar-reflection">
                    <h3>{selectedNote.lesson ? "当日回顾" : "留给明天"}</h3>
                    <p>{selectedNote.lesson || selectedNote.tomorrow}</p>
                  </section>
                )}
                {store.plans?.[calendarDate] && (
                  <section className="calendar-past-plan">
                    <h3>当日规划</h3>
                    <p>{store.plans[calendarDate]}</p>
                  </section>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
