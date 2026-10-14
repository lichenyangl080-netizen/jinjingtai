import { useEffect, useId, useRef, useState } from "react";
import { DotsThree } from "@phosphor-icons/react";
import { IconButton } from "./Controls";
import type { Project } from "../model";

export function ProjectActions({
  project,
  rename,
  archive,
}: {
  project: Project;
  rename: () => void;
  archive: () => void;
}) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    menu.current?.hidePopover();
  }, [project.id]);
  const perform = (action: () => void) => {
    menu.current?.hidePopover();
    action();
  };
  return (
    <div className="project-actions">
      <IconButton
        className="icon-button project-actions-trigger"
        label="项目选项"
        popoverTarget={id}
        aria-expanded={open}
        aria-controls={id}
      >
        <DotsThree />
      </IconButton>
      <div
        id={id}
        ref={menu}
        className="project-menu"
        popover="auto"
        onToggle={(event) => setOpen(event.newState === "open")}
      >
        <button onClick={() => perform(rename)}>重命名项目</button>
        <button
          className="project-archive-action"
          onClick={() => perform(archive)}
        >
          {project.archived ? "取消归档" : "归档项目"}
        </button>
      </div>
    </div>
  );
}
