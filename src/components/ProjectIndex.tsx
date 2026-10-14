import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { Action } from "./Controls";
import type { Project } from "../model";
import { projectDisambiguator, projectDisplayOrder } from "../project-display";

export function ProjectIndex({
  projects,
  selectedId,
  query,
  search,
  select,
  create,
}: {
  projects: Project[];
  selectedId: string;
  query: string;
  search: (value: string) => void;
  select: (id: string) => void;
  create: () => void;
}) {
  const term = query.trim().toLowerCase();
  const listed = projectDisplayOrder(projects).filter((p) =>
    [p.name, p.subject, p.workspace || ""].some((value) =>
      value.toLowerCase().includes(term),
    ),
  );
  const active = listed.filter((p) => p.id !== "unassigned" && !p.archived);
  const archived = listed.filter((p) => p.id !== "unassigned" && p.archived);
  const unassigned = listed.filter((p) => p.id === "unassigned");
  const option = (project: Project) => {
    const detail = projectDisambiguator(project, projects);
    return (
      <button
        key={project.id}
        className={`project-option ${project.id === selectedId ? "selected ink-selected" : ""}`}
        onClick={() => select(project.id)}
        aria-pressed={project.id === selectedId}
        title={[project.name, project.subject, detail]
          .filter(Boolean)
          .join("\n")}
      >
        <strong>{project.name}</strong>
        {project.subject && <span>{project.subject}</span>}
        {detail && (
          <span className="project-option-path" title={detail}>
            {detail}
          </span>
        )}
      </button>
    );
  };
  return (
    <aside className="project-index">
      <h2>项目</h2>
      <Action onClick={create}>
        <Plus />
        新建项目
      </Action>
      <label className="search">
        <MagnifyingGlass />
        <input
          placeholder="查找名称或目录"
          aria-label="查找项目"
          value={query}
          onChange={(e) => search(e.target.value)}
        />
      </label>
      <div className="project-options">
        {active.map(option)}
        {!!archived.length && (
          <details
            className="archived-projects"
            open={
              !!query ||
              projects.some((p) => p.id === selectedId && p.archived) ||
              undefined
            }
          >
            <summary>已归档 · {archived.length}</summary>
            {archived.map(option)}
          </details>
        )}
        {!!unassigned.length && (
          <section className="unassigned-projects" aria-label="未归类记录">
            <h3>未归类</h3>
            {unassigned.map(option)}
          </section>
        )}
        {!listed.length && (
          <p className="project-index-empty">没有匹配的项目。</p>
        )}
      </div>
    </aside>
  );
}
