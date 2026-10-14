import type { Attachment } from "./ipc-contract";
import type { Drawer } from "./workspace-runtime";

export type AttachmentRequest = {
  recordId: string;
  editSession: string;
  libraryId: string;
};
export function beginAttachmentRequest(
  drawer: Drawer | null,
  libraryId: string,
): AttachmentRequest | null {
  if (!drawer || drawer.mode === "view") return null;
  return {
    recordId: drawer.record.id,
    editSession: drawer.editSession,
    libraryId,
  };
}
// Pure update: even a close/reopen batched into one render has a new session.
export function appendAttachments(
  request: AttachmentRequest,
  drawer: Drawer | null,
  libraryId: string,
  files: Attachment[],
): Drawer | null {
  if (
    !drawer ||
    drawer.mode === "view" ||
    drawer.record.id !== request.recordId ||
    drawer.editSession !== request.editSession ||
    libraryId !== request.libraryId
  )
    return drawer;
  return {
    ...drawer,
    record: {
      ...drawer.record,
      attachments: [...(drawer.record.attachments || []), ...files],
    },
  };
}
