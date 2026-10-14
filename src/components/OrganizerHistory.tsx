import { useEffect, useState } from "react";
import type {
  ApiCall,
  OrganizerHistory as History,
  Status,
} from "../ipc-contract";
import {
  describeError,
  formatUsage,
  applicationErrorMessage,
} from "../workspace-runtime";

export function OrganizerHistory({
  api,
  capture,
  libraryId,
  jobApplyErrors,
  retryJobApply,
  initialDate,
}: {
  api: ApiCall;
  capture: Status | null;
  libraryId: string;
  jobApplyErrors: Readonly<Record<string, string>>;
  retryJobApply: (id: string) => void;
  initialDate: string | null;
}) {
  const [date, setDate] = useState(initialDate || "");
  const [detail, setDetail] = useState<History | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setDetail(null);
    setError("");
    setDate(initialDate || "");
  }, [libraryId, initialDate]);
  const jobs = [...(capture?.jobs || [])].sort((a, b) =>
    (b.startedAt || b.date).localeCompare(a.startedAt || a.date),
  );
  const dates = [
    ...new Set([
      ...jobs.map((j) => j.date),
      ...(initialDate ? [initialDate] : []),
    ]),
  ]
    .sort()
    .reverse();
  const hasApplyError = Object.keys(jobApplyErrors).length > 0;
  const show = (id: string) => {
    try {
      setDetail(api("organizer-history", id, libraryId));
      setError("");
    } catch (e) {
      setDetail(null);
      setError(describeError((e as Error).message));
    }
  };
  return (
    <details
      className="settings-explanation organizer-history"
      open={
        hasApplyError ||
        !!initialDate ||
        jobs.some((j) => j.state === "failed" || j.saveBlocked) ||
        undefined
      }
    >
      <summary>整理历史与用量 · {jobs.length}次</summary>
      <p>
        记录保存在当前资料库。可查看实际输入、已整理事项目录、按需读取及返回结果；查看不会调用模型。
      </p>
      <label>
        日期{" "}
        <select
          aria-label="整理历史日期"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setDetail(null);
            setError("");
          }}
        >
          <option value="">全部日期</option>
          {dates.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>
      {!jobs.length && <p>还没有整理记录。</p>}
      {hasApplyError && (
        <p role="alert">
          有整理结果尚未保存。原材料保留，自动重试已停止；可在对应记录下重试保存。
        </p>
      )}
      <div className="organizer-history-list">
        {jobs
          .filter((j) => !date || j.date === date)
          .map((j) => (
            <div className="organizer-history-entry" key={j.id}>
              <p>
                {j.date} ·{" "}
                {j.startedAt
                  ? new Date(j.startedAt).toLocaleTimeString("zh-CN")
                  : "时间未留存"}{" "}
                ·
                {
                  {
                    running: "整理中",
                    complete: jobApplyErrors[j.id]
                      ? "结果未保存"
                      : j.applied
                        ? "已保存"
                        : j.saveBlocked
                          ? "等待修复记录后保存"
                          : "整理完成，等待保存",
                    failed: "失败",
                    cancelled: "已取消",
                  }[j.state]
                }{" "}
                <button className="text-button" onClick={() => show(j.id)}>
                  查看记录
                </button>
              </p>
              {j.error && <p role="alert">{describeError(j.error)}</p>}
              {jobApplyErrors[j.id] && (
                <p role="alert">
                  {applicationErrorMessage(jobApplyErrors[j.id])}{" "}
                  <button
                    className="text-button"
                    onClick={() => retryJobApply(j.id)}
                  >
                    重试保存
                  </button>
                </p>
              )}
              <details>
                <summary>模型与用量</summary>
                <p>
                  {j.model || "模型未留存"} /{" "}
                  {j.reasoningEffort || "强度未留存"} ·{" "}
                  {j.requestChars === undefined
                    ? "初始输入字数未留存"
                    : `初始输入 ${j.requestChars} 字符`}
                  {j.readStats
                    ? ` · 按需读取 ${j.readStats.calls} 次 / ${j.readStats.chars} 字符`
                    : ""}
                  {j.usage
                    ? ` · 实际用量 ${formatUsage(j.usage)}`
                    : " · 未取得实际 token 用量"}
                </p>
              </details>
            </div>
          ))}
        {!!jobs.length && !jobs.some((j) => !date || j.date === date) && (
          <p>这一天没有整理记录。</p>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {detail && (
        <section className="settings-section">
          <div className="section-head">
            <h3>{detail.date} 的整理记录</h3>
            <button className="text-button" onClick={() => setDetail(null)}>
              收起记录
            </button>
          </div>
          <p>
            {detail.model || "模型未留存"} /{" "}
            {detail.reasoningEffort || "强度未留存"}
            {detail.usage
              ? ` · ${formatUsage(detail.usage)}`
              : " · 未取得实际 token 用量"}
          </p>
          {detail.error && <p role="alert">{describeError(detail.error)}</p>}
          <details>
            <summary>实际发送的初始输入</summary>
            {detail.requestText !== null ? (
              <pre>{detail.requestText}</pre>
            ) : (
              <p>
                这次旧任务没有保存原始输入，无法展示准确原文；下面的本地材料不代表实际发送内容。
              </p>
            )}
          </details>
          <details>
            <summary>已整理事项目录（{detail.directory.length} 项）</summary>
            <pre>{JSON.stringify(detail.directory, null, 2)}</pre>
          </details>
          <details>
            <summary>
              授权的本地材料（{detail.materials.length} 份，全文不一定发送）
            </summary>
            {detail.materials.map((m) => (
              <details key={m.id}>
                <summary>
                  {m.groupOnly ? "旧事项依据 · " : "新增 · "}
                  {m.title}
                </summary>
                <p>{m.summary}</p>
                <small>{m.id}</small>
              </details>
            ))}
          </details>
          <details>
            <summary>短编号与实际来源对应</summary>
            <pre>{JSON.stringify(detail.sourceAliases, null, 2)}</pre>
          </details>
          <details>
            <summary>按需读取记录</summary>
            <pre>{JSON.stringify(detail.readStats, null, 2)}</pre>
            <p>旧任务可能只记录请求和字符数，没有保存返回原文。</p>
          </details>
          <details>
            <summary>模型返回结果</summary>
            <pre>
              {detail.result
                ? JSON.stringify(detail.result, null, 2)
                : "尚无可展示的返回结果"}
            </pre>
          </details>
          <details>
            <summary>未处理及未保存的来源</summary>
            <pre>
              {JSON.stringify(
                {
                  unprocessed: detail.unprocessed,
                  skippedSources: detail.skippedSources,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </section>
      )}
    </details>
  );
}
