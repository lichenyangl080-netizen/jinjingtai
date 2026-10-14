import {
  DotsThree,
  PencilSimple,
  X,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react";
import { Action, IconButton } from "../components/Controls";
import type { WorkspaceContext } from "../useWorkspace";
import { api, connected, formatDate } from "../workspace-runtime";
import { projectLabel } from "../project-display";
import { ReferenceHistory } from "../components/ReferenceHistory";
import { recordRelationEdges } from "../model";
export function RecordDrawer({
  attach,
  changeField,
  drawer,
  drawerRef,
  modalOpen,
  editRecord,
  evidence,
  formError,
  more,
  notify,
  openAttachment,
  removeRecord,
  safely,
  saveDrawer,
  setDrawer,
  setEvidence,
  setMore,
  store,
  today,
  drawerExpanded,
  setDrawerExpanded,
  drawerSequence,
  adjacentRecord,
  openRelatedRecord,
  openProject,
  closeDrawer,
  openRecordUsage,
  cancelRecordEdit,
}: Pick<
  WorkspaceContext,
  | "attach"
  | "changeField"
  | "drawer"
  | "drawerRef"
  | "modalOpen"
  | "editRecord"
  | "evidence"
  | "formError"
  | "more"
  | "notify"
  | "openAttachment"
  | "removeRecord"
  | "safely"
  | "saveDrawer"
  | "setDrawer"
  | "setEvidence"
  | "setMore"
  | "store"
  | "today"
  | "drawerExpanded"
  | "setDrawerExpanded"
  | "drawerSequence"
  | "adjacentRecord"
  | "openRelatedRecord"
  | "openProject"
  | "closeDrawer"
  | "openRecordUsage"
  | "cancelRecordEdit"
>): React.ReactElement | null {
  if (!drawer) return null;
  const r = drawer.record;
  const p = store.projects.find((p) => p.id === r.project);
  const thread = Object.values(store.threads || {}).find((t) =>
    t.recordIds.includes(r.id),
  );
  const relationEdges = recordRelationEdges(store, r);
  const index = drawerSequence.indexOf(r.id);
  return (
    <aside
      ref={drawerRef}
      tabIndex={-1}
      inert={modalOpen}
      className={`detail-drawer ${drawerExpanded ? "reader-expanded" : ""} ${drawer.mode !== "view" ? "editing-drawer" : ""}`}
      aria-label={
        drawer.mode === "view"
          ? "进展详情"
          : drawer.mode === "add"
            ? "补记一件事"
            : "编辑记录"
      }
    >
      <header className="drawer-header">
        <h2>
          {drawer.mode === "view"
            ? "进展详情"
            : drawer.mode === "add"
              ? "补记一件事"
              : "编辑记录"}
        </h2>
        <div>
          {drawer.mode === "view" && !r.supersededDraftBy && (
            <IconButton
              label="编辑记录"
              onClick={() => {
                editRecord();
              }}
            >
              <PencilSimple />
            </IconButton>
          )}
          {drawer.mode === "view" && !r.supersededDraftBy && (
            <IconButton label="记录选项" onClick={() => setMore(!more)}>
              <DotsThree />
            </IconButton>
          )}
          <IconButton label="关闭详情" onClick={closeDrawer}>
            <X />
          </IconButton>
        </div>
      </header>
      <div className="drawer-content" key={r.id + ":" + drawer.mode}>
        {drawer.mode === "view" ? (
          <>
            <div className="reader-navigation">
              <IconButton
                label="上一条记录"
                disabled={index <= 0}
                onClick={() => adjacentRecord(-1)}
              >
                <CaretLeft />
              </IconButton>
              <span>
                {index < 0
                  ? "1 / 1"
                  : `${index + 1} / ${drawerSequence.length}`}
              </span>
              <IconButton
                label="下一条记录"
                disabled={index < 0 || index >= drawerSequence.length - 1}
                onClick={() => adjacentRecord(1)}
              >
                <CaretRight />
              </IconButton>
              <button
                className="text-button"
                onClick={() => setDrawerExpanded(!drawerExpanded)}
              >
                {drawerExpanded ? "收起阅读" : "展开阅读"}
              </button>
            </div>
            {p && !drawerExpanded && (
              <button
                className="text-button reader-project"
                onClick={() => openProject(p.id, thread?.id)}
              >
                {p.name}
                {thread ? ` · ${thread.title}` : ""}
              </button>
            )}
            {more && (
              <div className="record-menu">
                <button onClick={removeRecord}>移除记录</button>
              </div>
            )}
            <div className="detail-meta">
              {p && drawerExpanded && (
                <button
                  className="text-button"
                  onClick={() => openProject(p.id, thread?.id)}
                >
                  {p.name}
                  {thread ? ` · ${thread.title}` : ""}
                </button>
              )}
              <time dateTime={r.date}>{formatDate(r.date)}</time>
              <span className="kind">{r.kind}</span>
              {!drawerExpanded && (
                <span>{r.supersededDraftBy ? "原始记录" : "已保存"}</span>
              )}
            </div>
            <h2 className="record-title">{r.title}</h2>
            {!r.supersededDraftBy && (
              <button
                className="text-button record-use-trigger"
                onClick={() => openRecordUsage(r.id)}
              >
                用于起点、主线或回望…
              </button>
            )}
            <ReferenceHistory
              store={store}
              record={r}
              openRecord={openRelatedRecord}
            />
            {r.supersededDraftBy && (
              <p className="muted">
                此记录已归并到新的每日成果，原文保留供追溯。
              </p>
            )}
            <section className="detail-section">
              <h3>发生了什么变化</h3>
              <p>{r.change || "这条记录尚未补充变化。"}</p>
            </section>
            <section className="detail-section">
              <h3>下一步</h3>
              <p>{r.next || "暂未记录下一步。"}</p>
            </section>
            {!!relationEdges.length && (
              <section className="detail-section">
                <h3>结论关系</h3>
                {relationEdges.map((link, i) => (
                  <p key={i}>
                    <span>
                      {link.incoming ? "后续" : ""}
                      {
                        (
                          {
                            supplements: "补充",
                            negates: "否定",
                            supersedes: "替代",
                          } as const
                        )[link.type]
                      }{" "}
                      ·{" "}
                    </span>
                    {link.record &&
                    !link.record.removed &&
                    !link.record.progressHidden ? (
                      <button
                        className="text-button"
                        onClick={() => openRelatedRecord(link.record!)}
                      >
                        {link.record.title}
                      </button>
                    ) : (
                      <span className="muted">对应记录暂不可用</span>
                    )}
                  </p>
                ))}
              </section>
            )}
            {r.attachments?.length ? (
              <section className="detail-section">
                <h3>附件</h3>
                {r.attachments.map((a) => (
                  <p key={a.id}>
                    <button
                      className="text-button"
                      onClick={() => openAttachment(a.id)}
                    >
                      {a.name}
                    </button>
                  </p>
                ))}
              </section>
            ) : null}
            <section className="detail-section detail-source-section">
              <div className="section-head">
                <h3>依据</h3>
                {r.evidence && (
                  <button
                    className="text-button"
                    onClick={() => setEvidence(!evidence)}
                  >
                    {evidence ? "收起依据" : "查看依据"}
                  </button>
                )}
              </div>
              <p>
                {r.manual
                  ? "手动补记"
                  : (connected ? "阶段工作记录 · " : "样例工作记录 · ") +
                    formatDate(r.date)}
              </p>
              {evidence && (
                <>
                  <blockquote className="evidence">{r.evidence}</blockquote>
                  {r.sourceLinks?.map((link) => (
                    <p className="muted" key={link.id}>
                      {link.cwd}
                      <br />
                      会话：{link.session}
                      <br />
                      轮次：{link.turn}
                      {/^[a-f0-9]{64}$/.test(link.id) && (
                        <button
                          className="text-button"
                          onClick={() => {
                            try {
                              api("open-source", link.id);
                            } catch {
                              notify(
                                "来源文件暂不可用；已保存的记录和依据仍保留。",
                              );
                            }
                          }}
                        >
                          查看本地来源文件
                        </button>
                      )}
                    </p>
                  ))}
                </>
              )}
              {!r.manual && !r.evidence && (
                <p>原始记录暂不可用，已有记录仍可编辑。</p>
              )}
            </section>
          </>
        ) : (
          <form
            id="record-form"
            onSubmit={(e) => {
              e.preventDefault();
              saveDrawer();
            }}
          >
            <div className="field-pair">
              <label>
                日期
                <input
                  type="date"
                  max={today}
                  required
                  value={r.date}
                  onChange={(e) => changeField("date", e.target.value)}
                />
              </label>
              <label>
                项目
                <select
                  value={r.project}
                  onChange={(e) => changeField("project", e.target.value)}
                >
                  {store.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {projectLabel(p, store.projects)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              {drawer.mode === "add" ? "做了什么" : "记录标题"}
              <textarea
                className="title-input"
                aria-label="记录标题"
                autoFocus
                required
                value={r.title}
                onChange={(e) => changeField("title", e.target.value)}
                placeholder="写下一件推进的事"
              />
            </label>
            <label>
              变化或结果 <span>选填</span>
              <textarea
                value={r.change}
                onChange={(e) => changeField("change", e.target.value)}
                placeholder="与之前相比，发生了什么？"
              />
            </label>
            <label>
              下一步 <span>选填</span>
              <textarea
                value={r.next}
                onChange={(e) => changeField("next", e.target.value)}
                placeholder="下一次从哪里继续？"
              />
            </label>
            <label>
              类型
              <select
                value={r.kind}
                onChange={(e) => changeField("kind", e.target.value)}
              >
                {[
                  "已验证成果",
                  "未验证实现",
                  "尝试",
                  "发现",
                  "决策",
                  "阻塞",
                  "未采纳建议",
                  "进展",
                  "成果",
                  "所得",
                ].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            {connected && (
              <section className="detail-section">
                <h3>本地附件</h3>
                {r.attachments?.map((a, n) => (
                  <p key={a.id}>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => openAttachment(a.id)}
                    >
                      {a.name}
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        setDrawer({
                          ...drawer,
                          record: {
                            ...r,
                            attachments: r.attachments!.filter(
                              (_, i) => i !== n,
                            ),
                          },
                        })
                      }
                    >
                      移除
                    </button>
                  </p>
                ))}
                <button type="button" className="text-button" onClick={attach}>
                  添加图片或附件
                </button>
              </section>
            )}
            {r.evidence && (
              <p className="form-hint">修改记录不会改变原始依据摘录。</p>
            )}
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
          </form>
        )}
      </div>
      {drawer.mode !== "view" && (
        <footer className="drawer-footer">
          <button className="text-button" onClick={cancelRecordEdit}>
            取消
          </button>
          <Action ink type="submit" form="record-form">
            {drawer.mode === "add" ? "保存补记" : "保存修改"}
          </Action>
        </footer>
      )}
    </aside>
  );
}
