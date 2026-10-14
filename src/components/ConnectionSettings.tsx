import type { ReactNode } from "react";
import type { ConnectionSession } from "../useConnectionSession";
import { Action } from "./Controls";
import type { Status, MaintenanceAction } from "../ipc-contract";
import type { connectionStatus } from "../connection-status";
import {
  connectionErrorMessage,
  sourceHealthMessage,
} from "../workspace-runtime";

export function ConnectionSettings({
  capture,
  status,
  busy,
  action,
  toggleCapture,
  refresh,
  diagnostics,
  inspectionDate,
  session,
}: {
  capture: Status | null;
  status: ReturnType<typeof connectionStatus>;
  busy: string;
  action: (name: MaintenanceAction | "connect") => void;
  toggleCapture: () => void;
  refresh: () => void;
  diagnostics: ReactNode;
  inspectionDate: string | null;
  session: ConnectionSession;
}) {
  const config = capture?.config;
  const { installed, lastStage, issues, errors, hasError, title } = status;
  const metadataErrors = capture?.metadataHealth?.errors || [];
  const {
    checking,
    environment,
    checkError,
    waiting,
    trustDone,
    copied,
    received,
    checkEnvironment,
    toggleTrust,
    waitForReceipt,
    copyPrompt,
  } = session;
  return (
    <section
      className="settings-group connection-settings"
      aria-labelledby="connection-heading"
    >
      <div className="setting-row connection-overview">
        <div>
          <h2 id="connection-heading">{title}</h2>
          <p>
            {installed
              ? config?.paused
                ? "恢复采集后，新的工作收尾记录才会进入进境台。"
                : "工作收尾时采集记录；需要整理时，在“今日”页主动发起。"
              : "连接 Codex 后，把工作收尾记录带回进境台。"}
          </p>
          {installed && lastStage && (
            <p className="settings-note">
              最近收到：{new Date(lastStage.at).toLocaleString("zh-CN")}
            </p>
          )}
        </div>
        <Action
          ink={!installed}
          disabled={!!busy}
          onClick={installed ? toggleCapture : () => action("connect")}
        >
          {busy === "connect"
            ? "正在设置…"
            : installed
              ? config?.enabled
                ? "暂停采集"
                : "恢复采集"
              : "设置连接"}
        </Action>
      </div>
      <ol className="connection-steps" aria-label="Codex接入步骤">
        <li data-complete={installed}>
          <strong>保存连接</strong>
          <span>{installed ? "已保存" : "点击“设置连接”"}</span>
        </li>
        <li>
          <strong>信任 Hook 并重启</strong>
          <span>在 Codex 中审阅并信任新增 Hook，再重启 Codex</span>
        </li>
        <li data-complete={installed && !!lastStage}>
          <strong>收到工作记录</strong>
          <span>
            {installed && lastStage
              ? "已收到真实收尾记录"
              : "完成一次正常工作，等待收尾记录"}
          </span>
        </li>
      </ol>
      <details
        className="connection-wizard"
        aria-label="首次接入向导"
        open={!lastStage || waiting || undefined}
      >
        <summary>
          {received ? "已收到新的工作收尾记录" : "完成首次接入"}
        </summary>
        <p>
          按顺序检查环境、保存连接、完成信任，再验证真实回执。已有记录不能代替本次检查。
        </p>
        <div className="form-actions">
          <button
            disabled={
              checking || !!busy || !!capture?.libraryHealth.needsInitialization
            }
            onClick={checkEnvironment}
          >
            {checking ? "正在检查…" : "检查 Codex 环境"}
          </button>
          {!installed && (
            <button disabled={!!busy} onClick={() => action("library")}>
              选择资料库
            </button>
          )}
          {installed && (
            <button disabled={!!busy} onClick={() => action("scope")}>
              核对采集范围
            </button>
          )}
        </div>
        {capture?.libraryHealth.needsInitialization && (
          <p>先选择资料库，再检查环境和保存连接。</p>
        )}
        {environment && (
          <p role="status">
            {new Date(environment.checkedAt).toLocaleTimeString("zh-CN")} 检查：{" "}
            {environment.available
              ? `程序可运行${environment.version ? ` · 版本 ${environment.version}` : ""}`
              : "未能运行 Codex，请检查程序安装位置"}{" "}
            ·{" "}
            {environment.login === "signed_in"
              ? "登录状态已确认"
              : environment.login === "signed_out"
                ? "尚未登录，请先在 Codex 登录"
                : "登录状态尚未核实"}
          </p>
        )}
        {checkError && <p role="alert">{checkError}</p>}
        {installed && (
          <>
            <p>
              在 Codex 中审阅并信任进境台
              Hook，重启后打开新的工作聊天。信任需要你在 Codex
              完成，本页面不会替你授权。
            </p>
            <button aria-pressed={trustDone} onClick={toggleTrust}>
              {trustDone ? "已确认信任和重启步骤" : "我已完成信任并重启"}
            </button>
            {trustDone && (
              <div className="connection-receipt">
                <p>
                  选择“等待新回执”，再在授权目录完成一次正常工作并收尾。没有新增工作也可以回报无变化；不要为测试编造进展。
                </p>
                <div className="form-actions">
                  <button onClick={waitForReceipt}>
                    {" "}
                    {waiting ? "重新等待新回执" : "等待新回执"}{" "}
                  </button>
                  <button onClick={copyPrompt}>
                    {copied ? "已复制收尾提示" : "复制收尾提示"}
                  </button>
                  {waiting && <button onClick={refresh}>检查回执</button>}
                </div>
                {waiting && (
                  <p role="status">
                    {received
                      ? `已收到新回执 · ${received.outcome === "no_change" ? "本轮无新增变化" : "工作收尾材料"} · ${new Date(received.at).toLocaleString("zh-CN")}`
                      : config?.paused
                        ? "采集已暂停，请先恢复采集再完成收尾。"
                        : "等待新的真实回执；如果尚未收到，请核对信任、是否新开聊天、工作目录范围及是否已经收尾。"}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </details>
      {errors.map((code) => (
        <p className="setting-feedback" role="alert" key={code}>
          {connectionErrorMessage(code)}
        </p>
      ))}
      {installed &&
        capture?.sourceHealth?.available === false &&
        !capture.sourceHealth.error && (
          <p role="alert">{sourceHealthMessage()}；已有资料仍可阅读和编辑。</p>
        )}
      {!!issues.length && (
        <p className="setting-feedback" role="alert">
          有 {issues.length}{" "}
          个漏记、中断或来源待检查的工作轮次，请打开“采集检查”；这些不会计作没有进展。
        </p>
      )}
      {!!metadataErrors.length && (
        <p className="setting-feedback" role="alert">
          {metadataErrors.every((e) => e.folder === "jobs")
            ? "异常历史任务已隔离，原文件保留，新的整理仍可使用。"
            : "部分来源文件需要处理，详情见“采集检查”；原始资料保留。"}
        </p>
      )}
      <div className="setting-row">
        <div>
          <strong>采集范围</strong>
          <p>
            {!installed
              ? "保存连接后可调整"
              : config?.scopeMode === "all-workspaces"
                ? "所有正常工作目录"
                : `所选工作目录 · ${config?.roots.length || 0}处`}
          </p>
        </div>
        <button disabled={!!busy || !installed} onClick={() => action("scope")}>
          {busy === "scope" ? "正在设置…" : "调整范围"}
        </button>
      </div>
      <details className="settings-explanation">
        <summary>采集范围与隐私</summary>
        {installed &&
          config?.scopeMode !== "all-workspaces" &&
          config?.roots.map((root) => (
            <p className="library-path" key={root}>
              {root}
            </p>
          ))}
        <p>
          只接收授权目录的工作记录。资料库、运行目录和内部整理任务不采集；人工正文、回顾和附件不自动发给模型，不补读完整历史聊天。
        </p>
      </details>
      <details
        className="connection-diagnostics"
        open={
          hasError ||
          !!issues.length ||
          !!metadataErrors.length ||
          !!inspectionDate ||
          undefined
        }
      >
        <summary>
          采集检查{inspectionDate ? ` · ${inspectionDate}` : ""}
        </summary>
        <div className="setting-row">
          <p>
            {hasError
              ? "连接存在异常，请按上方提示处理。"
              : issues.length
                ? `有 ${issues.length} 个工作轮次需要检查。`
                : !installed
                  ? "尚未连接，暂无采集结果。"
                  : !lastStage
                    ? "尚未收到真实工作记录。"
                    : "已收到真实工作记录，轮次详情见下方。"}
          </p>
          <button disabled={!!busy} onClick={refresh}>
            重新检查
          </button>
        </div>
        {metadataErrors.length > 0 && (
          <details>
            <summary>需要处理的文件 · {metadataErrors.length}</summary>
            <ul>
              {metadataErrors.map((e) => (
                <li className="library-path" key={`${e.folder}/${e.file}`}>
                  {e.folder}/{e.file}
                </li>
              ))}
            </ul>
          </details>
        )}
        {diagnostics}
      </details>
      <details className="settings-explanation">
        <summary>连接维护</summary>
        <p>
          重新设置保留资料库、采集范围和暂停状态；撤销只移除进境台接入，已有资料保留。
        </p>
        <div className="form-actions">
          <button
            disabled={!!busy || !installed}
            onClick={() => action("connect")}
          >
            {busy === "connect" ? "正在设置…" : "重新设置连接"}
          </button>
          <button
            disabled={!!busy || !installed}
            onClick={() => action("disconnect")}
          >
            撤销连接
          </button>
        </div>
      </details>
    </section>
  );
}
