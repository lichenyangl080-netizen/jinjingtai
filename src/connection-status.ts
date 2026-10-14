import type { Status } from "./ipc-contract";

export function connectionStatus(capture: Status | null) {
  const config = capture?.config;
  const installed = !!(
    config?.instructionFiles?.length &&
    !config.connectionError &&
    !config.disconnected &&
    (config.enabled || config.paused)
  );
  const lastStage = capture?.stages.filter((s) => s.binding === "bound").at(-1);
  const issues =
    capture?.turns.filter((t) =>
      ["missing", "pending", "interrupted"].includes(t.state),
    ) || [];
  const errors = [
    ...new Set([
      ...(!capture?.libraryHealth.needsInitialization
        ? (capture?.errors || [])
            .filter((e) => e.folder !== "jobs")
            .map((e) => e.code)
        : []),
      ...(config?.connectionError &&
      config.connectionError !== "CONNECTION_CONFIG_MISSING"
        ? [config.connectionError]
        : []),
      ...(installed && capture?.sourceHealth?.error
        ? [capture.sourceHealth.error]
        : []),
    ]),
  ];
  const hasError =
    errors.length > 0 ||
    (installed && capture?.sourceHealth?.available === false) ||
    !!capture?.metadataHealth?.errors.some((e) => e.folder !== "jobs");
  const title = hasError
    ? "连接需要处理"
    : !installed
      ? "尚未连接"
      : config?.paused
        ? "采集已暂停"
        : lastStage
          ? "已收到工作记录"
          : "连接已保存，等待工作记录";
  return { installed, lastStage, issues, errors, hasError, title };
}
