import type {
  ApiCall,
  Candidate,
  PersonalResponse,
  Status,
} from "./ipc-contract";

type CaptureActions = {
  api: ApiCall;
  getLibraryId: () => string;
  acceptStatus: (status: Status) => boolean;
  publishStatus: (status: Status) => void;
  publishPersonal: (response: PersonalResponse) => void;
  publishCandidate: (candidate: Candidate | null) => void;
  notify: (text: string) => void;
};
// Views request actions; identity checks, IPC writes, and state publication
// have one owner. A failed write never dismisses the candidate dialog.
export function createCaptureActions(options: CaptureActions) {
  const { api, notify } = options;
  function status() {
    const current = api("status");
    if (!options.acceptStatus(current)) throw Error("LIBRARY_CHANGED");
    return current;
  }
  function perform(action: () => void) {
    try {
      action();
      return true;
    } catch (error) {
      notify(
        (error as Error).message === "LIBRARY_CHANGED"
          ? "资料库已切换，操作已停止；请保留输入并重新读取资料库。"
          : "操作未完成，原材料保留；请检查连接和目录授权。",
      );
      return false;
    }
  }
  return {
    openCandidate(id: string) {
      return perform(() => {
        status();
        const candidate = api("candidate", id);
        if (!candidate) throw Error("NOT_FOUND");
        options.publishCandidate(candidate);
      });
    },
    reviewCandidate(id: string, decision: "accept" | "discard") {
      return perform(() => {
        status();
        api("candidate-review", id, decision, options.getLibraryId());
        options.publishCandidate(null);
        options.publishStatus(status());
      });
    },
    toggleStageVisibility(id: string) {
      return perform(() => {
        const stage = status().stages.find((stage) => stage.id === id);
        if (!stage || stage.binding !== "bound")
          throw Error("SOURCE_NOT_BOUND");
        const hidden = !stage.routine;
        const response = api("visibility", id, hidden, options.getLibraryId());
        if (response.libraryId !== options.getLibraryId())
          throw Error("LIBRARY_CHANGED");
        options.publishPersonal(response);
        options.publishCandidate(null);
        options.publishStatus(status());
        notify(hidden ? "已从进展中隐藏，来源保留。" : "已计入整理范围。");
      });
    },
    cancelJob(id: string) {
      return perform(() => {
        status();
        api("cancel", id, options.getLibraryId());
        options.publishStatus(status());
        notify("整理已取消，材料仍保留。");
      });
    },
  };
}
