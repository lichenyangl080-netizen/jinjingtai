import { workingDay } from "../model";
import { Settings } from "../Settings";
import type { WorkspaceContext } from "../useWorkspace";
import { api, connected, formatDate, libraryId } from "../workspace-runtime";
export function SettingsPage({
  capture,
  connectionSession,
  connectSettings,
  inspectionDate,
  jobApplyErrors,
  notify,
  prefs,
  refreshSettings,
  retryJobApply,
  safely,
  savePrefs,
  openCandidate,
  setPage,
  setSettingsEditor,
  settingsTab,
  store,
  storageError,
  restoreRecord,
}: Pick<
  WorkspaceContext,
  | "capture"
  | "connectionSession"
  | "connectSettings"
  | "inspectionDate"
  | "jobApplyErrors"
  | "notify"
  | "prefs"
  | "refreshSettings"
  | "retryJobApply"
  | "safely"
  | "savePrefs"
  | "openCandidate"
  | "setPage"
  | "setSettingsEditor"
  | "settingsTab"
  | "store"
  | "storageError"
  | "restoreRecord"
>): React.ReactElement | null {
  return connected ? (
    <Settings
      viewProjects={() => safely(() => setPage("项目"))}
      initialTab={settingsTab}
      inspectionDate={inspectionDate}
      updateEditor={setSettingsEditor}
      leave={safely}
      prefs={prefs}
      save={savePrefs}
      capture={capture}
      connectionSession={connectionSession}
      libraryId={libraryId}
      libraryChanged={storageError === "LIBRARY_CHANGED"}
      jobApplyErrors={jobApplyErrors}
      retryJobApply={retryJobApply}
      api={api}
      notify={notify}
      refresh={refreshSettings}
      connect={connectSettings}
      removedRecords={store.records.filter(
        (r) => r.removed && !r.supersededDraftBy,
      )}
      restoreRecord={restoreRecord}
      diagnostics={
        <>
          <section className="settings-section">
            <p>
              只有真实收到收尾记录，才标记有变化或明确无变化。漏记和中断不会计作没有做事。
            </p>
            <details open={!!inspectionDate || undefined}>
              <summary>最近工作轮次</summary>
              {capture?.turns
                .filter(
                  (t) =>
                    !inspectionDate ||
                    workingDay(Date.parse(t.at)) === inspectionDate,
                )
                .slice(-20)
                .map((t) => (
                  <p key={t.session + ":" + t.turn}>
                    {new Date(t.at).toLocaleString("zh-CN")} ·{" "}
                    {
                      {
                        recorded: "已记录",
                        no_change: "明确无变化",
                        pending: "来源待检查",
                        missing: "已收尾但漏记",
                        interrupted: "工作已中断",
                        working: "工作中",
                        unfinished: "未完成收尾",
                      }[t.state]
                    }
                    <br />
                    <small>
                      {t.session} / {t.turn}
                    </small>
                  </p>
                ))}
            </details>
            {capture?.stages
              .filter((s) => s.binding === "bound" && s.outcome === "change")
              .slice(-8)
              .map((s) => (
                <p key={"captured-" + s.id}>
                  {formatDate(s.date)} ·{" "}
                  {s.routine ? "日常操作，未计入进展" : "阶段材料"}{" "}
                  <button
                    className="text-button"
                    onClick={() => openCandidate(s.id)}
                  >
                    查看采集明细
                  </button>
                </p>
              ))}
            {capture?.stages
              .filter(
                (s) =>
                  s.binding === "pending" &&
                  (!inspectionDate || s.date === inspectionDate),
              )
              .map((s) => (
                <p key={s.id}>
                  隔离候选 · {formatDate(s.date)}{" "}
                  <button
                    className="text-button"
                    onClick={() => openCandidate(s.id)}
                  >
                    检查内容与来源
                  </button>
                </p>
              ))}
            {!capture?.turns.length && (
              <p>还没有收到真实工作轮次。配置存在不代表客户端已经接通。</p>
            )}
          </section>
        </>
      }
    />
  ) : (
    <>
      <h1>设置</h1>
      <p>请使用桌面发行版管理本地资料。</p>
    </>
  );
}
