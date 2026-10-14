import type { Dispatch, SetStateAction } from "react";
import {
  beginAttachmentRequest,
  appendAttachments,
} from "./attachment-session";
import { libraryId, type Drawer } from "./workspace-runtime";

export function createRecordAttachmentActions(
  drawer: Drawer | null,
  setDrawer: Dispatch<SetStateAction<Drawer | null>>,
  notify: (text: string) => void,
) {
  async function attach() {
    const request = beginAttachmentRequest(drawer, libraryId);
    if (!request) return;
    try {
      const files = await window.jinjingtai!.attachment(request.libraryId);
      if (!files.length) return;
      setDrawer((current) =>
        appendAttachments(request, current, libraryId, files),
      );
    } catch (error) {
      notify(
        (error as Error).message.includes("LIBRARY_CHANGED")
          ? "资料库已切换，附件未添加；请重新读取资料库后再选择文件。"
          : "添加附件失败；原有内容已保留。",
      );
    }
  }
  async function openAttachment(id: string) {
    try {
      await window.jinjingtai!.openAttachment(id);
    } catch {
      notify("附件暂时无法打开，请检查文件或本机打开方式；记录仍保留。");
    }
  }
  return { attach, openAttachment };
}
