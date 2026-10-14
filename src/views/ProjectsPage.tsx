import { Plus } from "@phosphor-icons/react";
import { Action } from "../components/Controls";
import { ProjectActions } from "../components/ProjectActions";
import { ProjectIndex } from "../components/ProjectIndex";
import { LibraryNotice } from "../components/LibraryNotice";
import { projectTimeline } from "../project-progress";
import { projectRecentRecords } from "../personal-workspace";
import { ContinuationPanel } from "../components/ContinuationPanel";
import { ThreadPanel } from "../components/ThreadPanel";
import type { WorkspaceContext } from "../useWorkspace";
import { connected, formatDate } from "../workspace-runtime";
export function ProjectsPage({
  addRecord,
  draftHistory,
  openRecord,
  project,
  projectId,
  projectText,
  query,
  safely,
  saveProjectText,
  setProjectForm,
  setProjectId,
  setProjectText,
  setQuery,
  store,
  today,
  toggleProjectArchive,
  workRow,
  libraryFailure,
  refreshSettings,
  capture,
  commitPersonal,
  safelyPersonal,
  registerEditor,
  currentLibraryId,
  projectView: historyView,
  setProjectView: setHistoryView,
  targetThreadId,
  targetThreadRequest,
  projectReading,
  updateProjectReading,
  updateThreadReading,
  consumeThreadTarget,
}: Pick<
  WorkspaceContext,
  | "addRecord"
  | "draftHistory"
  | "openRecord"
  | "project"
  | "projectId"
  | "projectText"
  | "query"
  | "safely"
  | "saveProjectText"
  | "setProjectForm"
  | "setProjectId"
  | "setProjectText"
  | "setQuery"
  | "store"
  | "today"
  | "toggleProjectArchive"
  | "workRow"
  | "libraryFailure"
  | "refreshSettings"
  | "capture"
  | "commitPersonal"
  | "safelyPersonal"
  | "registerEditor"
  | "currentLibraryId"
  | "projectView"
  | "setProjectView"
  | "targetThreadId"
  | "targetThreadRequest"
  | "projectReading"
  | "updateProjectReading"
  | "updateThreadReading"
  | "consumeThreadTarget"
>): React.ReactElement | null {
  const { historyMonth, monthLimit, recentLimit } = projectReading;
  const setHistoryMonth = (historyMonth: string) =>
    updateProjectReading({ historyMonth });
  const setMonthLimit = (monthLimit: number) =>
    updateProjectReading({ monthLimit });
  const setRecentLimit = (recentLimit: number) =>
    updateProjectReading({ recentLimit });
  if (libraryFailure)
    return (
      <>
        <header className="page-header">
          <h1>项目</h1>
        </header>
        <LibraryNotice
          failure={libraryFailure}
          reload={refreshSettings}
          path={capture?.config.library}
        />
      </>
    );
  const index = (
    <ProjectIndex
      projects={store.projects}
      selectedId={projectId}
      query={query}
      search={setQuery}
      select={(id) => safely(() => setProjectId(id))}
      create={() => safely(() => setProjectForm({ name: "" }))}
    />
  );
  if (!project)
    return (
      <div className="projects-layout">
        {index}
        <section className="project-body">
          <h2>选择或新建一个项目</h2>
          <p>为记录确定归属，再留下项目概况。</p>
        </section>
      </div>
    );
  const timeline = projectTimeline(store, project.id);
  const months = [...new Set(timeline.map((d) => d.date.slice(0, 7)))];
  const shownTimeline = timeline.filter((d) =>
    historyMonth
      ? d.date.startsWith(historyMonth)
      : months.slice(0, monthLimit).includes(d.date.slice(0, 7)),
  );
  const recent = projectRecentRecords(store, project);
  const timelineSequence = shownTimeline.flatMap((day) =>
    day.groups.flatMap((g) => g.records.map((r) => r.id)),
  );
  const panelProps = {
    store,
    commit: commitPersonal,
    safely: safelyPersonal,
    registerEditor,
    openRecord,
  };
  return (
    <div className="projects-layout">
      {index}
      <section className="project-body">
        <div className="project-title">
          <div>
            <h2>{project.name}</h2>
            {(project.subject || project.archived) && (
              <p>
                {project.subject}
                {project.archived ? " · 已归档" : ""}
              </p>
            )}
            {project.workspace && (
              <p className="project-workspace" title={project.workspace}>
                {project.workspace}
              </p>
            )}
          </div>
          <Action ink onClick={() => addRecord(today, project.id)}>
            <Plus />
            补记进展
          </Action>
          <ProjectActions
            project={project}
            rename={() =>
              safely(() =>
                setProjectForm({ id: project.id, name: project.name }),
              )
            }
            archive={() => toggleProjectArchive(project.id)}
          />
        </div>
        {!projectText && (
          <div
            className={`section-head project-overview-head ${!project.status.trim() ? "project-overview-empty" : ""}`}
          >
            <h3>项目概况</h3>
            <button
              className="text-button"
              onClick={() =>
                safely(() => {
                  const current =
                    store.projects.find((p) => p.id === project.id) || project;
                  setProjectText({
                    status: current.status,
                    next: current.next,
                    original: JSON.stringify([current.status, current.next]),
                  });
                })
              }
            >
              {project.status.trim() ? "编辑概况" : "写下当前状态"}
            </button>
          </div>
        )}
        {projectText ? (
          <section className="project-overview-editor">
            <h3>编辑项目概况</h3>
            <label>
              当前状态
              <textarea
                autoFocus
                aria-label="当前状态"
                value={projectText.status}
                onChange={(e) =>
                  setProjectText({ ...projectText, status: e.target.value })
                }
              />
            </label>
            <div className="form-actions">
              <button className="text-button" onClick={() => safely(() => {})}>
                取消
              </button>
              <Action onClick={saveProjectText}>保存概况</Action>
            </div>
          </section>
        ) : project.status.trim() ? (
          <div className="project-overview">
            <section className="project-description">
              <p>{project.status}</p>
            </section>
          </div>
        ) : null}
        {project.overviewEditedAt && (
          <p className="muted overview-updated">
            概况更新于{" "}
            {new Date(project.overviewEditedAt).toLocaleString("zh-CN")}
          </p>
        )}
        <ContinuationPanel
          key={currentLibraryId + project.id + "continuation"}
          {...panelProps}
          project={project}
        />
        <details className="recent-project-changes">
          <summary>
            最近变化 · {recent.length} 条
            {project.overviewEditedAt ? "（概况更新后）" : ""}
          </summary>
          <div className="record-list">
            {recent.slice(0, recentLimit).map((r) => (
              <button
                key={r.id}
                data-record-id={r.id}
                className="record-row"
                onClick={() =>
                  openRecord(
                    r,
                    recent.slice(0, recentLimit).map((x) => x.id),
                  )
                }
              >
                <span className="row-copy">
                  <strong>{r.title}</strong>
                  <span>
                    {formatDate(r.date)} · {r.kind}
                  </span>
                </span>
              </button>
            ))}
            {recent.length > recentLimit && (
              <Action onClick={() => setRecentLimit(recentLimit + 20)}>
                加载更多变化
              </Action>
            )}
            {!recent.length && (
              <p className="muted">概况更新后暂无新的有效记录。</p>
            )}
          </div>
        </details>
        <div
          className="segmented project-view-switch"
          aria-label="项目阅读方式"
        >
          {["事项主线", "全部历程"].map((v) => (
            <button
              key={v}
              aria-pressed={historyView === v}
              onClick={() => safely(() => setHistoryView(v))}
            >
              {v}
            </button>
          ))}
        </div>
        {historyView === "事项主线" ? (
          <ThreadPanel
            key={currentLibraryId + project.id + "threads"}
            {...panelProps}
            project={project}
            targetThreadId={targetThreadId}
            targetThreadRequest={targetThreadRequest}
            onTargetLocated={consumeThreadTarget}
            reading={projectReading.threads}
            onReadingChange={updateThreadReading}
          />
        ) : (
          <>
            {connected &&
              (project.status || project.next) &&
              recent.some(
                (r) =>
                  r.project === project.id &&
                  r.relations?.some((link) => link.type !== "supplements"),
              ) && (
                <p className="muted">
                  存在后续结论更正，请核对手写项目概况；原文已保留。
                </p>
              )}
            <section className="timeline">
              <div className="section-head">
                <h3>进展历程</h3>
                <details className="project-history-help">
                  <summary>如何阅读</summary>
                  <p>
                    按记录日期查看工作；被否定或取代的结论仍保留在历程中，手写项目概况由你维护。
                  </p>
                </details>
              </div>
              <div className="history-locator">
                <label>
                  定位年月
                  <select
                    aria-label="定位项目月份"
                    value={historyMonth}
                    onChange={(e) =>
                      safely(() => setHistoryMonth(e.target.value))
                    }
                  >
                    <option value="">最近月份</option>
                    {months.map((m) => (
                      <option value={m} key={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {shownTimeline.map((day) => (
                <section className="project-history-day" key={day.date}>
                  <h4>{formatDate(day.date)}</h4>
                  <div className="record-list">
                    {day.groups.map((work) =>
                      workRow(work, false, timelineSequence),
                    )}
                  </div>
                </section>
              ))}
              {!timeline.length && <p>还没有进展记录。补记一次，留下起点。</p>}
              {!historyMonth && months.length > monthLimit && (
                <button
                  className="text-button"
                  onClick={() => setMonthLimit(monthLimit + 3)}
                >
                  加载更早
                </button>
              )}
            </section>
            {draftHistory(undefined, project.id)}
          </>
        )}
      </section>
    </div>
  );
}
