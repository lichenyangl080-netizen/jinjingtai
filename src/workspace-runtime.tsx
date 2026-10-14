import { isValidDay } from "./day-state";
import { sample, type RecordItem, type Store } from "./model";
import type { ApiCall, DesktopBridge, Usage } from "./ipc-contract";
export type Page = "今日" | "日历" | "项目" | "回望" | "设置";
export type Drawer = {
  record: RecordItem;
  original: string;
} & ({ mode: "view" } | { mode: "edit" | "add"; editSession: string });
export const KEY = "jinjingtai-prototype-v1";
declare global {
  interface Window {
    jinjingtai?: DesktopBridge;
  }
}
export const connected = !!window.jinjingtai?.integration;
export let revision = 0;
export let libraryId = "";
export let persisted = "";
export const api: ApiCall = (method, ...args) =>
  window.jinjingtai!.call(method, ...args);
export function adopt(response: {
  revision: number;
  libraryId: string;
  store: Store;
}): Store {
  revision = response.revision;
  libraryId = response.libraryId;
  persisted = JSON.stringify(response.store);
  return response.store;
}
export const formatDate = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
export const dateCaption = (date: string) =>
  `${formatDate(date)} · 星期${"日一二三四五六"[new Date(date + "T12:00:00").getDay()]}`;
export const errors: Record<string, string> = {
  JOB_POLICY_UNSUPPORTED: "这次整理任务使用未知策略，结果未导入，原材料保留",
  PERSONAL_RECORDS_ISOLATED:
    "部分记录已隔离，完好正文仍可编辑；请先修复原记录再整理",
  LOCAL_METADATA_INVALID:
    "本次任务或来源材料未通过检查，请到设置的连接检查查看；原文件与正文保留",
  INVALID_ORGANIZER_SETTINGS: "整理模型或推理强度无效，请在设置重新选择",
  SOURCE_SCAN_TRUNCATED:
    "历史来源尚未检查完，不能判断全部漏记；已收到的阶段记录仍保留",
  BACKUP_LIBRARY_READ_ONLY: "请选择备份的副本，避免继续写入原备份",
  INVALID_READ_AUDIT: "按需读取审计未通过，结果未导入，原材料仍保留",
  CODEX_UNAVAILABLE: "整理进程异常退出，请在设置的连接检查查看原因",
  CODEX_CONFIGURATION_ERROR: "整理启动配置无效，请在设置的连接检查查看原因",
  CODEX_START_FAILED: "整理程序未能启动，请检查 Codex 程序位置与权限",
  CODEX_AUTH_REQUIRED: "整理需要 Codex 登录，请检查登录状态",
  CODEX_MODEL_UNAVAILABLE:
    "所选模型或推理强度当前不可用，请在设置更换；不会自动换模型或重试",
  CODEX_NETWORK_ERROR: "整理连接失败，请检查网络后重试",
  TIMEOUT: "整理超时，可以稍后重试",
  WATCHDOG_PROCESS_UNVERIFIED:
    "无法核验超时整理进程的归属，未终止该进程；请检查进境台运行环境",
  WATCHDOG_PROCESS_MISMATCH:
    "超时整理任务的进程身份已改变，为避免误杀，未终止该进程",
  WATCHDOG_TERMINATION_FAILED:
    "未能确认超时整理进程已退出，请检查进境台运行环境",
  INTERRUPTED: "整理被中断，材料仍保留",
  UNEXPECTED_TOOL_ACTIVITY: "整理尝试了未允许的操作，结果未导入",
  INVALID_RESULT: "整理结果未通过检查",
  TOO_MANY_DAILY_ENTRIES: "整理条目过多，结果未导入",
  INCOMPLETE_COVERAGE: "部分材料未处理",
  MIXED_EVIDENCE_STATUS: "不同验证状态被混合，结果未导入",
  SCOPE_TOO_LARGE: "所选内容超过旧版整理上限，请分批整理",
  SCOPE_ITEM_LIMIT: "所选材料展开后超过160项，请分批整理",
  SCOPE_TEXT_LIMIT: "所选阶段小结超过9万字符，请分批整理",
  SOURCE_ADAPTER_UNAVAILABLE: "当前来源接口不可用",
  OUTSIDE_SCOPE: "工作目录未获采集授权",
  GATE_EXPIRED_OR_CHANGED: "记录连接版本或授权校验失败",
  GATE_REQUIRED: "记录缺少可信来源授权",
};
export const describeError = (code: string) =>
  errors[code] || "未完成，请检查接入状态";
export const sourceHealthMessage = (code?: string) =>
  code === "SOURCE_SCAN_TRUNCATED"
    ? "历史来源尚未检查完"
    : "当前工作来源暂不可读取";
export const formatUsage = (u: Usage | null | undefined) =>
  u
    ? "输入 " +
      u.input_tokens +
      " token，输出 " +
      u.output_tokens +
      " token" +
      (u.cached_input_tokens
        ? "（输入缓存 " + u.cached_input_tokens + "）"
        : "")
    : "未取得实际 token 用量";
export const cloneSample = (): Store => structuredClone(sample);
export let initialStorageError = "";
export function readStore(): Store {
  let s: Store | null = null;
  try {
    s = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {}
  if (connected) {
    try {
      const loaded = adopt(api("load", s, sample));
      initialStorageError = "";
      return loaded;
    } catch (e) {
      initialStorageError = (e as Error).message;
      return {
        version: 1,
        records: [],
        projects: [
          {
            id: "unassigned",
            name: "未归项目",
            subject: "",
            status: "",
            next: "",
          },
        ],
        notes: {},
      };
    }
  }
  return s?.version === 1 &&
    Array.isArray(s.records) &&
    Array.isArray(s.projects) &&
    s.notes
    ? s
    : cloneSample();
}
export function readViewDate(today: string) {
  try {
    const date = connected
      ? api("view-state").date
      : localStorage.getItem(KEY + "-view-date");
    return isValidDay(date, today) ? date : today;
  } catch {
    return today;
  }
}
export const storageErrors: Record<string, string> = {
  PERSONAL_DATA_MISSING: "资料库中的记录文件缺失",
  PERSONAL_DATA_UNREADABLE: "资料库中的记录文件暂不可读取",
  PERSONAL_DATA_INVALID: "记录文件校验失败",
  LIBRARY_DIRECTORY_MISSING: "找不到已选择的资料库",
  LIBRARY_DIRECTORY_UNREADABLE: "资料库目录暂不可读取",
  LIBRARY_NOT_INITIALIZED: "所选目录尚未建立资料库",
  CONNECTION_CONFIG_INVALID: "连接配置校验失败",
  LIBRARY_LOCATION_UNREADABLE: "资料库位置暂不可读取",
  LIBRARY_LOCATION_INVALID: "资料库位置校验失败",
  LIBRARY_LOCATION_MISSING: "尚未确定资料库位置",
  LIBRARY_CHANGED: "资料库已被另一个窗口切换，请保留输入并重新读取后再保存",
  LIBRARY_DIRECTORY_INVALID: "资料库位置不是有效文件夹",
};
export const storageMessage = (code: string) =>
  storageErrors[code] || "本地资料未能读取";
export const applicationErrorMessage = (code: string) =>
  errors[code] ||
  storageErrors[code] ||
  `本地写入未完成（${code}），请检查资料库和磁盘权限`;
const connectionGuidance: Record<string, string> = {
  SOURCE_VERSION_UNSUPPORTED:
    "旧来源检查曾拒绝该客户端；请重新检查当前连接，现按数据结构与来源身份核验。已有资料保留。",
  SOURCE_SCHEMA_UNSUPPORTED:
    "Codex 历史来源结构暂无法识别，历史扫描与来源补整理暂停；已有资料和可信 Hook 采集保留。",
  SOURCE_HOME_UNKNOWN: "尚未找到 Codex 配置目录，请重新设置连接。",
  SOURCE_SCAN_TRUNCATED:
    "历史来源检查达到本次安全上限，尚未检查完整；已采集记录仍保留。",
  SOURCE_RECORD_UNSUPPORTED:
    "部分历史来源的数据格式无法识别，历史扫描不完整；已有记录保留。",
  SOURCE_DATABASE_AMBIGUOUS:
    "存在多份无法确定当前来源的 Codex 数据库，历史扫描暂停；已有记录保留。",
  SOURCE_DATABASE_MISSING:
    "尚未找到 Codex 历史数据库；已有记录和可信 Hook 采集不受影响。",
  SOURCE_THREAD_UNKNOWN:
    "找不到该工作的来源，请检查是否使用了原 Codex 配置目录。",
  SOURCE_ADAPTER_UNAVAILABLE:
    "Codex 来源暂不可读取，请检查客户端版本、来源文件和目录权限；已有资料保留。",
  SOURCE_BUSY: "来源尚在更新，请等待当前 Codex 工作结束后重新检查。",
  LIVE_SOURCE_NOT_FOUND:
    "未找到当前工作的实时来源，请在 Codex 中重新开始工作后检查连接。",
  SOURCE_AMBIGUOUS:
    "同时存在多个无法区分的工作来源，暂未接收记录；请结束重复工作后重试。",
  CONNECTION_UPDATE_BUSY:
    "另一进程正在更新连接，请稍后重新打开；刚退出异常进程时等待片刻再试。",
  CONNECTION_ROLLBACK_PENDING:
    "连接更新尚未恢复，请重新打开软件完成恢复；已有配置和资料保留。",
  RUNTIME_NODE_MISSING: "运行组件缺失，请重新安装完整桌面包后设置连接。",
  RUNTIME_NODE_INVALID:
    "运行组件校验失败，请使用完整发行包重新设置连接；原资料保留。",
  BACKUP_LIBRARY_READ_ONLY:
    "备份不能直接写入，请将资料库复制到普通文件夹，再选择副本。",
  CONNECTION_CONFIG_UNREADABLE: "连接配置无法读取，请检查权限后重新设置连接。",
  CONNECTION_CONFIG_MISSING: "尚未设置连接，可在此设置 Codex 连接。",
  CODEX_NOT_FOUND: "未找到 Codex，请安装 Codex 后重新设置连接。",
};
export function connectionErrorMessage(message: string) {
  const code = message.match(/\b[A-Z][A-Z_]{3,}\b/)?.[0] || message;
  if (code === "LIBRARY_CHANGED") return storageErrors[code];
  if (storageErrors[code])
    return (
      storageErrors[code] +
      "。请检查资料保存位置，或从备份副本恢复；原资料保留。"
    );
  return connectionGuidance[code] || describeError(code);
}
