import {
  ArrowRight,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  FolderSimple,
  Plus,
} from "@phosphor-icons/react";
import { Action, IconButton } from "../components/Controls";
import { BacklogPanel } from "../components/BacklogPanel";
import { shiftDate, workGroups } from "../model";
import type { WorkspaceContext } from "../useWorkspace";
import {
  connected,
  dateCaption,
  describeError,
  applicationErrorMessage,
  storageMessage,
} from "../workspace-runtime";
export function TodayPage({
  activeEditDateRef,
  addRecord,
  capture,
  captureError,
  captureLabel,
  chooseDate,
  date,
  day,
  draftHistory,
  groups,
  inspectDay,
  jobApplyErrors,
  lastSaved,
  libraryFailure,
  needsLibraryInitialization,
  initializeLibrary,
  initializingLibrary,
  notesSection,
  notify,
  openRecord,
  prepareDay,
  records,
  refreshSettings,
  retryJobApply,
  restoreDay,
  cancelJob,
  setMaterialReview,
  status,
  store,
  today,
  workRow,
  lastOrganized,
}: Pick<
  WorkspaceContext,
  | "activeEditDateRef"
  | "addRecord"
  | "capture"
  | "captureError"
  | "captureLabel"
  | "chooseDate"
  | "date"
  | "day"
  | "draftHistory"
  | "groups"
  | "inspectDay"
  | "jobApplyErrors"
  | "lastSaved"
  | "libraryFailure"
  | "needsLibraryInitialization"
  | "initializeLibrary"
  | "initializingLibrary"
  | "notesSection"
  | "notify"
  | "openRecord"
  | "prepareDay"
  | "records"
  | "refreshSettings"
  | "retryJobApply"
  | "restoreDay"
  | "cancelJob"
  | "setMaterialReview"
  | "status"
  | "store"
  | "today"
  | "workRow"
  | "lastOrganized"
>): React.ReactElement | null {
  const job = capture?.jobs?.filter((j) => j.date === date).at(-1);
  const organizing =
    job?.state === "running" ||
    (job?.state === "complete" && !job.applied && !jobApplyErrors[job.id]);
  const hasConnection =
    !!capture?.config?.instructionFiles?.length && !capture.config.disconnected;
  return (
    <>
      <header className="page-header">
        <div className="date-controls">
          <IconButton
            label="上一日"
            onClick={() => chooseDate(shiftDate(date, -1))}
          >
            <CaretLeft />
          </IconButton>
          <span className="day-date">{dateCaption(date)}</span>
          <IconButton
            label="下一日"
            disabled={date >= today}
            onClick={() => chooseDate(shiftDate(date, 1))}
          >
            <CaretRight />
          </IconButton>
          {date !== today && (
            <>
              <span className="historical-date-label">历史日</span>
              <button className="text-button" onClick={() => chooseDate(today)}>
                回到今天
              </button>
            </>
          )}
        </div>
        <div className="headline">
          <div>
            <h1>{date === today ? "今日有所进" : "这一日的进展"}</h1>
            {status && <span className="badge">{status}</span>}
          </div>
          <div className="day-actions">
            {connected &&
              !needsLibraryInitialization &&
              (hasConnection || day.materialCount > 0) && (
                <Action
                  ink
                  disabled={!!libraryFailure || organizing}
                  onClick={prepareDay}
                >
                  {job?.saveBlocked
                    ? "结果等待修复"
                    : organizing
                      ? "正在整理…"
                      : "整理这一天"}
                </Action>
              )}
            {records.length > 0 && (
              <button
                className="text-button"
                disabled={!!libraryFailure}
                onClick={() => addRecord()}
              >
                <Plus />
                补记
              </button>
            )}
          </div>
        </div>
      </header>
      {!libraryFailure && (records.length > 0 || day.materialCount > 0) && (
        <div className="day-overview" aria-label="本日进展状态">
          {records.length > 0 && <strong>{day.savedWorkCount}件事项</strong>}
          {day.materialCount > 0 && (
            <span className="new-materials">
              {day.materialCount}份新材料待整理
            </span>
          )}
        </div>
      )}
      {needsLibraryInitialization && (
        <section className="library-error">
          <h2>建立你的第一份资料库</h2>
          <p>
            选择一个文件夹保存记录。可以直接手写使用；需要采集工作进展时，再到设置连接
            Codex。
          </p>
          <Action
            ink
            disabled={initializingLibrary}
            onClick={initializeLibrary}
          >
            {initializingLibrary ? "正在建立…" : "创建或选择资料库"}
          </Action>
        </section>
      )}
      {libraryFailure && !needsLibraryInitialization && (
        <section className="library-error" role="alert">
          <h2>{storageMessage(libraryFailure)}</h2>
          <p>
            当前无法核实本地资料，不能按“没有记录”理解。请检查保存位置；恢复读取前不会写入空白内容。
          </p>
          {capture?.config?.library && (
            <p className="library-error-path">{capture.config.library}</p>
          )}
          <div>
            <Action ink onClick={refreshSettings}>
              重新读取
            </Action>
            <button
              className="text-button"
              onClick={() =>
                window.jinjingtai
                  ?.maintenance("open-state")
                  .catch(() => notify("无法打开资料配置目录，请检查磁盘位置。"))
              }
            >
              打开资料配置目录
            </button>
          </div>
        </section>
      )}
      {connected && !needsLibraryInitialization && (
        <div className="capture-status">
          {(!capture ||
            captureError ||
            !capture.config.enabled ||
            capture.config.paused ||
            capture.config.connectionError ||
            capture.sourceHealth?.available === false) && (
            <span>
              {captureLabel}
              {records.length > 0 && "，已有内容仍可阅读"}
            </span>
          )}
          {day.issueCount > 0 && (
            <button
              className="text-button capture-warning"
              onClick={() => inspectDay()}
            >
              {day.issueCount}轮记录待检查
            </button>
          )}
          {capture?.jobs
            .filter(
              (j) => j.date === date && !j.applied && jobApplyErrors[j.id],
            )
            .map((j) => (
              <span
                key={`apply-${j.id}`}
                role="alert"
                data-job-apply-error={j.id}
              >
                整理结果未保存：{applicationErrorMessage(jobApplyErrors[j.id])}
                。原材料保留，自动重试已停止。{" "}
                <button
                  className="text-button"
                  onClick={() => retryJobApply(j.id)}
                >
                  重试保存
                </button>{" "}
                <button className="text-button" onClick={() => inspectDay()}>
                  查看保存问题
                </button>
              </span>
            ))}
          {capture?.jobs
            .filter((j) => j.date === date)
            .slice(-1)
            .map((j) => (
              <span key={j.id}>
                {jobApplyErrors[j.id] ? null : j.state === "running" ? (
                  <>
                    正在整理，可以继续浏览{" "}
                    <button
                      className="text-button"
                      onClick={() => cancelJob(j.id)}
                    >
                      取消整理
                    </button>
                  </>
                ) : j.state === "failed" ? (
                  <>
                    整理失败：{describeError(j.error || "CODEX_UNAVAILABLE")}{" "}
                    <button className="text-button" onClick={prepareDay}>
                      重新选择材料
                    </button>
                  </>
                ) : j.state === "cancelled" ? (
                  "整理已取消，原内容保留"
                ) : j.applied ? (
                  <>
                    <button
                      className="text-button"
                      onClick={() => {
                        const result = records.find(
                          (r) => r.organizeJob === j.id,
                        );
                        if (result) openRecord(result);
                        else
                          notify(
                            `本次整理已保存${j.added || 0}条新增记录，人工内容保留。`,
                          );
                      }}
                    >
                      本次整理已保存 · {j.added || 0}条新增
                    </button>
                    {!!(j.unprocessed?.length || j.skippedSources?.length) && (
                      <button
                        className="text-button"
                        onClick={() => {
                          setMaterialReview(j.id);
                        }}
                      >
                        {(j.unprocessed?.length || 0) +
                          (j.skippedSources?.length || 0)}
                        份材料待处理
                      </button>
                    )}
                  </>
                ) : j.saveBlocked ? (
                  <button className="text-button" onClick={() => inspectDay()}>
                    部分记录需修复，整理结果暂未保存
                  </button>
                ) : activeEditDateRef.current === j.date ? (
                  "整理完成，保存或关闭当前编辑后可查看"
                ) : (
                  "正在保存整理结果"
                )}
              </span>
            ))}
        </div>
      )}
      {!libraryFailure && (
        <BacklogPanel
          store={store}
          capture={capture}
          date={date}
          today={today}
          chooseDate={chooseDate}
        />
      )}
      {lastOrganized && lastOrganized.date === date && (
        <details className="organizing-result" open>
          <summary>本次新增／调整的事项</summary>
          <div className="record-list">
            {store.records
              .filter(
                (r) =>
                  lastOrganized.recordIds.includes(r.id) &&
                  !r.removed &&
                  !r.progressHidden,
              )
              .map((r) => (
                <button
                  className="record-row"
                  data-record-id={r.id}
                  key={r.id}
                  onClick={() => openRecord(r, lastOrganized.recordIds)}
                >
                  {r.title}
                </button>
              ))}
            {!lastOrganized.recordIds.length && (
              <p className="muted">本次结果已保存，可在下方阅读。</p>
            )}
          </div>
        </details>
      )}
      {records.length ? (
        <section className="progress-section">
          {groups.map((g) => {
            const ordered = workGroups(store, g.records),
              primary = ordered.slice(0, 2),
              rest = ordered.filter((w) => !primary.includes(w));
            return (
              <section className="project-group" key={g.id}>
                <div className="section-head work-project-head">
                  <FolderSimple size={18} aria-hidden="true" />
                  <h2>{g.name}</h2>
                </div>
                <div className="record-list">
                  {primary.map((w) =>
                    workRow(
                      w,
                      false,
                      primary.flatMap((item) => item.records.map((r) => r.id)),
                    ),
                  )}
                </div>
                {rest.length > 0 && (
                  <details className="remaining-progress" key={date + g.id}>
                    <summary>查看其他内容 · {rest.length}件</summary>
                    <div className="record-list">
                      {rest.map((w) =>
                        workRow(
                          w,
                          false,
                          rest.flatMap((item) => item.records.map((r) => r.id)),
                        ),
                      )}
                    </div>
                  </details>
                )}
              </section>
            );
          })}
        </section>
      ) : (
        !libraryFailure && (
          <div className="empty-day" data-day-state={day.state}>
            <CalendarBlank size={36} weight="light" />
            <h2>
              {day.materialCount
                ? "已收到本日工作材料"
                : day.issueCount
                  ? "本日记录需要检查"
                  : day.state === "unavailable" && connected && hasConnection
                    ? "本日进展暂未整理"
                    : "本日尚无新增进展记录"}
            </h2>
            <p>
              {day.materialCount
                ? `${day.materialCount}份新材料待整理，整理后可查看本日推进。`
                : day.issueCount
                  ? "存在漏记、中断或待核准来源，暂不能判断完整进展。"
                  : !hasConnection && connected
                    ? "尚未连接 Codex，可以直接补记；需要采集工作进展时再到设置连接。"
                    : day.state === "unavailable" && connected
                      ? "当前采集状态不可核实，可检查连接，也可以手动补记。"
                      : day.noChangeTurns
                        ? `${day.noChangeTurns}轮已明确记录无变化；查询和日常操作不计作进步。`
                        : "工作材料整理后会出现在这里，也可以直接补记。"}
            </p>
            <div className="empty-day-actions">
              {day.materialCount ? (
                <Action ink onClick={prepareDay}>
                  整理这一天
                </Action>
              ) : day.issueCount ? (
                <Action onClick={() => inspectDay()}>检查记录</Action>
              ) : (
                <Action onClick={() => addRecord()}>
                  <Plus />
                  补记一件事
                </Action>
              )}
              {lastSaved && lastSaved !== date && (
                <button
                  className="text-button last-saved-day"
                  onClick={() => chooseDate(lastSaved)}
                >
                  查看最近有记录的一天 · {Number(lastSaved.slice(5, 7))}月
                  {Number(lastSaved.slice(-2))}日<ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
        )
      )}
      {!libraryFailure && notesSection()}
      {draftHistory(date)}
      {store.records.some((r) => r.date === date && r.removed) && (
        <button
          className="text-button restore"
          onClick={() => restoreDay(date)}
        >
          恢复本日移除的记录
        </button>
      )}
    </>
  );
}
