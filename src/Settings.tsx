import { useEffect, useState } from "react";
import { ConnectionSettings } from "./components/ConnectionSettings";
import { OrganizerSettings } from "./components/OrganizerSettings";
import { Action } from "./components/Controls";
import { connectionStatus } from "./connection-status";
import type { ConnectionSession } from "./useConnectionSession";
import type { Preferences } from "./preferences";
import type {
  ApiCall,
  MaintenanceAction,
  Status,
  WorkspaceListing,
} from "./ipc-contract";
import type { RecordItem } from "./model";
import type { ReactNode } from "react";
export { defaultPreferences, type Preferences } from "./preferences";
import { describeError, storageErrors } from "./workspace-runtime";

const tabs = ["Codex连接", "资料与备份", "阅读"];
function settingsTab(value: string) {
  if (["资料库", "资料与备份"].includes(value)) return tabs[1];
  if (["显示与阅读", "阅读"].includes(value)) return tabs[2];
  return tabs[0];
}
export function Settings({
  prefs,
  save,
  capture,
  connectionSession,
  libraryId,
  libraryChanged = false,
  jobApplyErrors = {},
  retryJobApply,
  api,
  notify,
  refresh,
  connect,
  diagnostics,
  initialTab,
  inspectionDate,
  updateEditor,
  leave,
  viewProjects,
  removedRecords = [],
  restoreRecord,
}: {
  prefs: Preferences;
  save: (value: Preferences) => boolean;
  capture: Status | null;
  connectionSession: ConnectionSession;
  libraryId: string;
  libraryChanged?: boolean;
  jobApplyErrors?: Readonly<Record<string, string>>;
  retryJobApply: (id: string) => void;
  api: ApiCall;
  notify: (text: string) => void;
  refresh: () => boolean;
  connect: () => Promise<void>;
  diagnostics: ReactNode;
  initialTab: string;
  inspectionDate: string | null;
  updateEditor: (
    editor: { dirty: boolean; save: () => boolean; discard: () => void } | null,
  ) => void;
  leave: (action: () => void) => void;
  viewProjects: () => void;
  removedRecords?: RecordItem[];
  restoreRecord: (id: string) => void;
}) {
  const [tab, setTab] = useState(settingsTab(initialTab));
  const [busy, setBusy] = useState("");
  const [mappingOpen, setMappingOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceListing[]>([]);
  const [mappingError, setMappingError] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({
    ...prefs.workspaceNames,
  });
  const c = capture?.config;
  const connection = connectionStatus(capture);
  const namesChanged = workspaces.some(
    (w) =>
      (names[w.workspace] ?? prefs.workspaceNames[w.workspace] ?? w.name) !==
      (prefs.workspaceNames[w.workspace] ?? w.name),
  );
  const needsInitialization = !!capture?.libraryHealth?.needsInitialization;
  useEffect(() => setTab(settingsTab(initialTab)), [initialTab]);
  useEffect(() => {
    setNames({ ...prefs.workspaceNames });
  }, [libraryId]);
  useEffect(() => {
    if (!mappingOpen || libraryChanged) return;
    try {
      setWorkspaces(api("workspace-list") || []);
      setMappingError(false);
    } catch {
      setWorkspaces([]);
      setMappingError(true);
    }
  }, [mappingOpen, libraryId, libraryChanged]);
  function saveNames() {
    if (libraryChanged) {
      notify(
        "资料库已切换，目录名称输入已保留。请先保留所需文字，再放弃当前修改并重新读取资料库。",
      );
      return false;
    }
    const value = {
      ...prefs,
      workspaceNames: {
        ...prefs.workspaceNames,
        ...Object.fromEntries(
          workspaces.map((w) => [
            w.workspace,
            names[w.workspace] ?? prefs.workspaceNames[w.workspace] ?? w.name,
          ]),
        ),
      },
    };
    if (!save(value)) return false;
    setNames(value.workspaceNames);
    return true;
  }
  useEffect(() => {
    updateEditor({
      dirty: namesChanged,
      save: saveNames,
      discard: () => setNames({ ...prefs.workspaceNames }),
    });
  }, [names, prefs, workspaces, libraryId, libraryChanged]);
  useEffect(() => () => updateEditor(null), []);
  function switchTab(value: string) {
    if (value === tab) return;
    if (namesChanged) leave(() => setTab(value));
    else setTab(value);
  }
  function moveTab(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    const target =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : event.key === "ArrowRight"
            ? (index + 1) % tabs.length
            : event.key === "ArrowLeft"
              ? (index + tabs.length - 1) % tabs.length
              : null;
    if (target === null) return;
    event.preventDefault();
    switchTab(tabs[target]);
  }
  useEffect(() => {
    if (document.activeElement?.getAttribute("role") === "tab")
      document.getElementById(`settings-tab-${tabs.indexOf(tab)}`)?.focus();
  }, [tab]);
  async function action(name: MaintenanceAction | "connect") {
    if (namesChanged && ["library", "connect", "disconnect"].includes(name)) {
      leave(() => {
        void performAction(name);
      });
      return;
    }
    return performAction(name);
  }
  async function performAction(name: MaintenanceAction | "connect") {
    if (busy) return;
    setBusy(name);
    try {
      if (name === "connect") {
        await connect();
        return;
      }
      const r = await window.jinjingtai!.maintenance(name);
      if (r?.cancelled) return;
      if (["library", "scope", "disconnect"].includes(name)) refresh();
      notify(
        r?.needsTrust
          ? "设置已保存；请在 Codex 中审阅并信任新增 Hook，再重启 Codex。"
          : name === "backup"
            ? "资料库备份已完成，已打开保存位置。"
            : name === "scope"
              ? "采集范围已更新。"
              : name === "library"
                ? "已打开另一资料库，原资料及采集范围保留。"
                : name === "disconnect"
                  ? "连接已撤销，已有资料仍可阅读和编辑。"
                  : "已打开。",
      );
    } catch (error) {
      const code = (error as Error).message;
      notify(
        code === "BACKUP_LIBRARY_READ_ONLY"
          ? "请先把备份中的资料库复制到普通文件夹，再打开副本。"
          : code === "CONNECTION_ROLLBACK_PENDING"
            ? "连接操作未完成，恢复尚未结束；请重新打开软件后检查连接。"
            : storageErrors[code] ||
              (code === "LOCAL_METADATA_INVALID"
                ? describeError(code)
                : "操作未完成，请检查文件权限或默认打开程序；原资料保留。"),
      );
    } finally {
      setBusy("");
    }
  }
  function toggleCapture() {
    try {
      if (!c) return;
      api("pause", !!c.enabled);
      refresh();
      notify(c.enabled ? "采集已暂停，已有资料仍可使用。" : "采集已恢复。");
    } catch {
      notify("采集状态未能更新，请检查连接。");
    }
  }
  return (
    <>
      <header className="page-header">
        <h1>设置</h1>
      </header>
      <div className="settings-tabs" role="tablist" aria-label="设置分类">
        {tabs.map((t, index) => (
          <button
            role="tab"
            id={`settings-tab-${index}`}
            aria-controls="settings-panel"
            tabIndex={t === tab ? 0 : -1}
            onKeyDown={(event) => moveTab(event, index)}
            aria-selected={t === tab}
            key={t}
            onClick={() => switchTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <section
        id="settings-panel"
        className="settings-body"
        role="tabpanel"
        aria-labelledby={`settings-tab-${tabs.indexOf(tab)}`}
      >
        {tab === tabs[0] && (
          <>
            <ConnectionSettings
              session={connectionSession}
              capture={capture}
              status={connection}
              busy={busy}
              action={action}
              toggleCapture={toggleCapture}
              refresh={() => {
                if (refresh()) notify("已更新采集状态。");
              }}
              diagnostics={diagnostics}
              inspectionDate={inspectionDate}
            />
            <section
              className="settings-group"
              aria-labelledby="organizer-heading"
            >
              <h2 id="organizer-heading">整理这一天</h2>
              <p className="settings-note">
                在“今日”页主动整理已采集材料。下面的设置只用于进境台整理，不改变
                Codex 聊天。
              </p>
              <OrganizerSettings
                prefs={prefs}
                save={save}
                busy={busy}
                api={api}
                capture={capture}
                libraryId={libraryId}
                jobApplyErrors={jobApplyErrors}
                retryJobApply={retryJobApply}
                inspectionDate={inspectionDate}
              />
              <details onToggle={(e) => setMappingOpen(e.currentTarget.open)}>
                <summary>整理时使用的目录名称</summary>
                <p>仅影响下次材料列表和新项目创建；已有项目请在项目页修改。</p>
                {libraryChanged && (
                  <p role="alert">
                    资料库已切换，当前目录名称输入仍保留，尚未保存。请先保留所需文字，再放弃当前修改并重新读取资料库。
                  </p>
                )}
                {mappingError ? (
                  <p>目录列表暂时不可读取，其他设置仍可使用。</p>
                ) : workspaces.length ? (
                  workspaces.map((w) => (
                    <div className="workspace-mapping" key={w.workspace}>
                      <label>
                        <span>{w.name}</span>
                        <input
                          aria-label={"项目名称 " + w.workspace}
                          maxLength={60}
                          value={
                            names[w.workspace] ??
                            prefs.workspaceNames[w.workspace] ??
                            w.name
                          }
                          onChange={(e) =>
                            setNames({
                              ...names,
                              [w.workspace]: e.target.value,
                            })
                          }
                        />
                      </label>
                      <details>
                        <summary>对应工作目录</summary>
                        {(w.dirs || [w.cwd]).map((dir: string) => (
                          <p key={dir}>{dir}</p>
                        ))}
                        <p>会话启动目录不代表每次实际操作的位置。</p>
                      </details>
                    </div>
                  ))
                ) : (
                  <p>收到真实工作记录后，目录会出现在这里。</p>
                )}
                <div className="form-actions">
                  {!!workspaces.length && (
                    <button
                      disabled={libraryChanged || !namesChanged}
                      onClick={saveNames}
                    >
                      保存名称
                    </button>
                  )}
                  <button onClick={viewProjects}>打开项目页</button>
                </div>
              </details>
            </section>
          </>
        )}
        {tab === tabs[1] && (
          <>
            <section
              className="settings-group"
              aria-labelledby="library-heading"
            >
              <h2 id="library-heading">当前资料库</h2>
              {needsInitialization && (
                <div className="setting-row">
                  <div>
                    <strong>建立第一份资料库</strong>
                    <p>选择保存记录的文件夹，无需先连接 Codex。</p>
                  </div>
                  <button disabled={!!busy} onClick={() => action("library")}>
                    创建或选择资料库
                  </button>
                </div>
              )}
              <div className="setting-row">
                <div>
                  <strong>资料保存位置</strong>
                  <p className="library-path">
                    {c?.library || "保存位置暂时不可读取"}
                  </p>
                </div>
                <button
                  disabled={!!busy}
                  onClick={() => action("open-library")}
                >
                  打开文件夹
                </button>
              </div>
              <details>
                <summary>打开另一资料库</summary>
                <p>
                  读取另一份资料，不搬移、不合并当前记录；采集范围与暂停状态保持原设置。正在进行的整理会取消。
                </p>
                <button disabled={!!busy} onClick={() => action("library")}>
                  {busy === "library" ? "正在打开…" : "选择资料库"}
                </button>
              </details>
            </section>
            <section
              className="settings-group"
              aria-labelledby="backup-heading"
            >
              <h2 id="backup-heading">备份与恢复</h2>
              <div className="setting-row">
                <div>
                  <strong>创建资料库备份</strong>
                  <p>保存记录、附件及阅读设置的副本，不包含 Codex 登录信息。</p>
                </div>
                <Action
                  ink
                  disabled={!!busy || needsInitialization}
                  onClick={() => action("backup")}
                >
                  {busy === "backup" ? "正在备份…" : "创建备份"}
                </Action>
              </div>
              <div className="library-restore">
                <h3>从备份恢复</h3>
                <ol>
                  <li>把备份中的“资料库”复制到新的普通文件夹。</li>
                  <li>选择复制后的资料库打开，保留原备份。</li>
                </ol>
                <p className="settings-note">
                  打开后使用这份资料，不合并当前记录，也不会自动恢复采集授权。
                </p>
                <button disabled={!!busy} onClick={() => action("library")}>
                  选择恢复的资料库
                </button>
              </div>
            </section>
            <details>
              <summary>已移除记录 · {removedRecords.length}</summary>
              <p>
                {removedRecords.length
                  ? "这些内容不会被再次整理自动恢复，可在这里手动恢复。"
                  : "没有已移除的记录。"}
              </p>
              {removedRecords.map((r) => (
                <div className="setting-row" key={r.id}>
                  <div>
                    <strong>{r.title}</strong>
                    <p>{r.date}</p>
                  </div>
                  <button onClick={() => restoreRecord(r.id)}>恢复记录</button>
                </div>
              ))}
            </details>
          </>
        )}
        {tab === tabs[2] && (
          <>
            <div className="setting-row">
              <div>
                <strong>正文大小</strong>
                <p>用于记录、回顾、项目概况和编辑正文，选择后自动保存。</p>
              </div>
              <select
                aria-label="正文大小"
                value={prefs.fontSize}
                onChange={(e) =>
                  save({ ...prefs, fontSize: Number(e.target.value) })
                }
              >
                {[15, 16, 17].map((n) => (
                  <option key={n} value={n}>
                    {n === 15 ? "偏小" : n === 16 ? "标准" : "偏大"}
                  </option>
                ))}
              </select>
            </div>
            <div className="reading-preview" aria-label="阅读效果预览">
              <span className="preview-caption">
                正文预览 ·{" "}
                {prefs.fontSize === 15
                  ? "偏小"
                  : prefs.fontSize === 16
                    ? "标准"
                    : "偏大"}
              </span>
              <div className="reading-preview-row">
                <strong>让每天的进展留下来</strong>
                <p>记录做了什么，也记下值得保留的发现。</p>
              </div>
            </div>
          </>
        )}
      </section>
      <footer className="settings-footer">
        <span>进境台 · {__APP_VERSION__}</span>
        <button disabled={!!busy} onClick={() => action("guide")}>
          使用说明
        </button>
        <button disabled={!!busy} onClick={() => action("licenses")}>
          开源许可
        </button>
      </footer>
    </>
  );
}
