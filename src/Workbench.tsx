import { GearSix, MagnifyingGlass, X } from "@phosphor-icons/react";
import { Action, IconButton } from "./components/Controls";
import { workingDay } from "./model";
import "./workspace.css";

import { useWorkspace } from "./useWorkspace";
import { CalendarPage } from "./views/CalendarPage";
import { ProjectsPage } from "./views/ProjectsPage";
import { RecordDrawer } from "./views/RecordDrawer";
import { RetrospectivePage } from "./views/RetrospectivePage";
import { SettingsPage } from "./views/SettingsPage";
import { TodayPage } from "./views/TodayPage";
import { MaterialReview } from "./components/MaterialReview";
import { GlobalSearch } from "./components/GlobalSearch";
import { RecordUsageDialog } from "./components/RecordUsageDialog";
import { formatDate } from "./workspace-runtime";
export function App() {
  const context = useWorkspace();
  const {
    store,
    page,
    prefs,
    date,
    drawer,
    guard,
    setGuard,
    notice,
    setNotice,
    projectForm,
    setProjectForm,
    projectFormError,
    setProjectFormError,
    modalOpen,
    capture,
    scope,
    scopeProjects,
    setScope,
    candidate,
    setCandidate,
    reviewCandidate,
    toggleStageVisibility,
    materialReview,
    setMaterialReview,
    mainRef,
    positions,
    project,
    scrollKey,
    notify,
    launchDay,
    inspectDay,
    clearEditors,
    go,
    chooseDate,
    saveAndLeave,
    saveProjectForm,
    safely,
    status,
    icons,
  } = context;
  return (
    <div
      className={`workbench ${drawer ? "has-drawer" : ""} ${context.drawerExpanded ? "expanded-reader" : ""} density-compact`}
      style={{ "--reading-font": `${prefs.fontSize}px` } as React.CSSProperties}
    >
      <aside className="sidebar" inert={modalOpen}>
        <div className="brand">
          <img src="./assets/ink-circle.png" alt="" />
          <h2>进境台</h2>
          <p>
            见日有所行，
            <br />
            知身有所至
          </p>
        </div>
        <nav aria-label="主要导航">
          <button
            aria-label="搜索本地资料"
            className="nav-item search-launch"
            onClick={context.launchSearch}
          >
            <MagnifyingGlass size={20} />
            搜索
          </button>
          {(["工作台", "项目", "回望"] as const).map((p) => {
            const target = p === "工作台" ? context.workbenchView : p;
            const Icon = icons[p === "工作台" ? "今日" : p];
            return (
              <button
                key={p}
                className={`nav-item ${context.mainPage === p ? "selected ink-selected" : ""}`}
                aria-current={context.mainPage === p ? "page" : undefined}
                onClick={() => go(target)}
              >
                <Icon size={24} />
                {p}
              </button>
            );
          })}
        </nav>
        <img
          className="sidebar-landscape"
          src="./assets/sidebar-landscape.png"
          alt=""
        />
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${page === "设置" ? "selected ink-selected" : ""}`}
            onClick={() => go("设置")}
          >
            <GearSix size={24} />
            设置
          </button>
        </div>
      </aside>
      <div
        className="main-area"
        inert={modalOpen || (!!drawer && context.drawerExpanded)}
      >
        {notice && (
          <div className="toast" role="status">
            <span>{notice.text}</span>
            {notice.action && (
              <button onClick={notice.action}>{notice.label}</button>
            )}
            {notice.undo && (
              <button
                onClick={() => {
                  notice.undo?.();
                  setNotice(null);
                }}
              >
                撤销
              </button>
            )}
            <IconButton label="关闭提示" onClick={() => setNotice(null)}>
              <X />
            </IconButton>
          </div>
        )}
        {page === "今日" &&
          !context.records.length &&
          !drawer &&
          !context.noteEdit &&
          !store.notes[date]?.lesson?.trim() &&
          !store.notes[date]?.tomorrow?.trim() && (
            <img
              className="main-ink-landscape"
              src="./assets/corner-pine-rocks.png"
              alt=""
              aria-hidden="true"
            />
          )}
        <div
          className={`reading-pane ${page === "日历" ? "calendar-pane" : ""}`}
          ref={mainRef}
          onScroll={(e) => {
            positions.current[scrollKey] = e.currentTarget.scrollTop;
            context.persistLocation();
          }}
        >
          {context.mainPage === "工作台" && (
            <div className="workbench-switch segmented" aria-label="工作台视图">
              {(["今日", "日历"] as const).map((v) => (
                <button key={v} aria-pressed={page === v} onClick={() => go(v)}>
                  {v}
                </button>
              ))}
            </div>
          )}
          {page === "今日" ? (
            <TodayPage {...context} />
          ) : page === "日历" ? (
            <CalendarPage {...context} />
          ) : page === "项目" ? (
            <ProjectsPage {...context} />
          ) : page === "回望" ? (
            <RetrospectivePage {...context} />
          ) : (
            <SettingsPage {...context} />
          )}
        </div>
      </div>
      {drawer && <RecordDrawer {...context} />}
      {context.recordUse && (
        <div hidden={!!guard}>
          <RecordUsageDialog
            key={context.recordUse.library + context.recordUse.recordId}
            store={store}
            recordId={context.recordUse.recordId}
            commit={context.commitPersonal}
            safely={context.safelyPersonal}
            registerEditor={context.registerEditor}
            openRecord={context.openRecord}
            close={context.closeRecordUsage}
            discard={context.dismissRecordUsage}
            saved={context.recordUsageSaved}
          />
        </div>
      )}
      <GlobalSearch
        store={store}
        libraryId={context.currentLibraryId}
        open={context.searchOpen && !guard}
        close={() => context.setSearchOpen(false)}
        onOpen={context.openSearchResult}
        focusTarget={context.searchFocus}
      />
      {guard && (
        <div className="modal-backdrop">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guard-title"
          >
            <h2 id="guard-title">还有未保存的内容</h2>
            <p>离开前，可以保存这次修改。</p>
            <div className="dialog-actions">
              <button className="text-button" onClick={() => setGuard(null)}>
                继续编辑
              </button>
              <Action
                onClick={() => {
                  const action = guard;
                  setGuard(null);
                  clearEditors();
                  action();
                }}
              >
                放弃修改
              </Action>
              <Action ink onClick={saveAndLeave}>
                保存并离开
              </Action>
            </div>
          </section>
        </div>
      )}
      {projectForm && !guard && (
        <div className="modal-backdrop">
          <form
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-form-title"
            onSubmit={(e) => {
              e.preventDefault();
              saveProjectForm();
            }}
          >
            <h2 id="project-form-title">
              {projectForm.id ? "重命名项目" : "新建项目"}
            </h2>
            <label>
              项目名称
              <input
                autoFocus
                required
                aria-invalid={!!projectFormError}
                aria-describedby={
                  projectFormError ? "project-form-error" : undefined
                }
                value={projectForm.name}
                onChange={(e) => {
                  setProjectForm({ ...projectForm, name: e.target.value });
                  setProjectFormError("");
                }}
              />
            </label>
            {projectFormError && (
              <p className="form-error" id="project-form-error" role="alert">
                {projectFormError}
              </p>
            )}
            <div className="dialog-actions">
              <Action type="button" onClick={() => safely(() => {})}>
                取消
              </Action>
              <Action ink type="submit">
                保存项目
              </Action>
            </div>
          </form>
        </div>
      )}
      {scope && !guard && (
        <div className="modal-backdrop">
          <section
            className="dialog scope-dialog daily-scope-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scope-title"
          >
            <header>
              <div className="scope-heading">
                <h2 id="scope-title">整理 {formatDate(scope.date)}</h2>
                <span className="scope-directory-hint">旧事项仅发送短目录</span>
              </div>
              <p>归纳本日进展并保存，之后可以随时修改。</p>
            </header>
            <div className="scope-body">
              <p className="scope-policy">
                整理新增内容，并用已有事项的短目录合并进展。原记录和人工修改保留。
              </p>
              <p className="scope-count">
                已选 {scope.ids.length} 份材料 ·{" "}
                {
                  scopeProjects.filter((group) =>
                    group.materials.some((s) => scope.ids.includes(s.id)),
                  ).length
                }{" "}
                个项目
              </p>
              {capture?.turns.some(
                (t) =>
                  workingDay(Date.parse(t.at)) === scope.date &&
                  ["missing", "interrupted", "pending"].includes(t.state),
              ) && (
                <p className="scope-warning" role="status">
                  本日有漏记或待检查，当前材料尚非完整清单。
                  <button
                    className="text-button"
                    onClick={() => {
                      const d = scope.date;
                      setScope(null);
                      inspectDay(d);
                    }}
                  >
                    查看问题
                  </button>
                </p>
              )}
              {scopeProjects.map(
                ({ key, name, materials, directories, sameName }) => {
                  const selected = materials.filter((s) =>
                      scope.ids.includes(s.id),
                    ).length,
                    all = selected === materials.length;
                  return (
                    <section className="scope-project" key={key}>
                      <label className="scope-project-title">
                        <input
                          type="checkbox"
                          checked={all}
                          ref={(node) => {
                            if (node) node.indeterminate = !all && selected > 0;
                          }}
                          onChange={(e) =>
                            setScope({
                              ...scope,
                              ids: e.target.checked
                                ? [
                                    ...new Set([
                                      ...scope.ids,
                                      ...materials.map((s) => s.id),
                                    ]),
                                  ]
                                : scope.ids.filter(
                                    (id) => !materials.some((s) => s.id === id),
                                  ),
                            })
                          }
                        />
                        <div className="scope-project-name">
                          <strong>{name}</strong>
                          {sameName && (
                            <small className="scope-project-directory">
                              来源目录：{directories.join("、") || "未提供"}
                            </small>
                          )}
                        </div>
                        <span>
                          {selected}/{materials.length} 份
                        </span>
                      </label>
                      <details className="scope-project-details">
                        <summary>
                          <span className="scope-expand">查看材料</span>
                          <span className="scope-collapse">收起材料</span>
                        </summary>
                        <div className="scope-material-list">
                          {materials.map((s) => (
                            <div className="scope-material" key={s.id}>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={scope.ids.includes(s.id)}
                                  onChange={(e) =>
                                    setScope({
                                      ...scope,
                                      ids: e.target.checked
                                        ? [...new Set([...scope.ids, s.id])]
                                        : scope.ids.filter((id) => id !== s.id),
                                    })
                                  }
                                />
                                <span className="scope-material-titles">
                                  {s.items.map((i) => (
                                    <span
                                      className="scope-material-title"
                                      key={i.id}
                                    >
                                      <span>{i.title}</span>
                                      <span
                                        className={`scope-material-tag${!i.used && !s.recovery ? " is-new" : ""}`}
                                      >
                                        {s.recovery
                                          ? "补记候选"
                                          : i.groupOnly
                                            ? "短目录"
                                            : i.used
                                              ? "已整理"
                                              : "新材料"}
                                      </span>
                                    </span>
                                  ))}
                                </span>
                              </label>
                              <details>
                                <summary>
                                  来源详情{s.recovery ? " · 漏记补整理" : ""}
                                </summary>
                                <p>会话目录：{s.cwd}</p>
                                <p>用于核对来源，不代表实际操作的文件位置。</p>
                                <p>
                                  {s.at
                                    ? new Date(s.at).toLocaleString("zh-CN")
                                    : ""}
                                </p>
                              </details>
                            </div>
                          ))}
                        </div>
                      </details>
                    </section>
                  );
                },
              )}
              <details className="scope-help">
                <summary>整理范围说明</summary>
                <p>
                  新材料发送阶段小结的短摘录；已有事项仅发送短目录，用于合并进展，不逐条重发旧小结。必要时才按限定次数和字数读取勾选范围内的依据。人工正文、回顾和附件不会发给模型，人工修改内容不参与。原记录保留在来源历程中。没有新增材料不重复调用模型。漏记补整理默认不勾选；勾选后只读取该轮必要的测试输出和产物信息，无法保证完整覆盖。
                </p>
              </details>
            </div>
            <footer className="dialog-actions">
              <Action onClick={() => setScope(null)}>取消</Action>
              <Action ink disabled={!scope.ids.length} onClick={launchDay}>
                开始整理
              </Action>
            </footer>
          </section>
        </div>
      )}
      {materialReview && !guard && (
        <MaterialReview
          key={materialReview}
          id={materialReview}
          close={() => setMaterialReview(null)}
          viewDate={(d) => {
            setMaterialReview(null);
            chooseDate(d);
          }}
        />
      )}
      {candidate && !guard && (
        <div className="modal-backdrop">
          <section
            className="dialog scope-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="candidate-title"
          >
            <h2 id="candidate-title">
              {capture?.stages.find((s) => s.id === candidate.id)?.binding ===
              "bound"
                ? "采集明细"
                : "检查隔离候选"}
            </h2>
            <p>日常操作保留来源，不计入进展。来源未绑定的候选需检查后接纳。</p>
            <p>
              {candidate.source.cwd}
              <br />
              {candidate.source.session} / {candidate.source.turn} /{" "}
              {candidate.source.call}
            </p>
            {candidate.items.map((i, n) => (
              <p key={n}>
                {i.title}：{i.summary}
              </p>
            ))}
            <div className="dialog-actions">
              <Action onClick={() => setCandidate(null)}>返回</Action>
              {capture?.stages.find((s) => s.id === candidate.id)?.binding ===
              "bound" ? (
                <Action onClick={() => toggleStageVisibility(candidate.id)}>
                  {capture?.stages.find((s) => s.id === candidate.id)?.routine
                    ? "计入进展"
                    : "不计入进展"}
                </Action>
              ) : (
                <Action
                  onClick={() => reviewCandidate(candidate.id, "discard")}
                >
                  排除候选
                </Action>
              )}
              {capture?.stages.find((s) => s.id === candidate.id)?.binding !==
                "bound" && (
                <Action
                  ink
                  onClick={() => reviewCandidate(candidate.id, "accept")}
                >
                  检查后接纳
                </Action>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
