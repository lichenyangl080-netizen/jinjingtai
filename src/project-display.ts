import {
  newestRecord,
  visibleRecords,
  type Project,
  type RecordItem,
  type Store,
} from "./model.ts";

export function preferredProject(store: Store, previous?: string): string {
  if (previous && store.projects.some((p) => p.id === previous))
    return previous;
  const ordinary = store.projects.filter(
    (p) => p.id !== "unassigned" && !p.archived,
  );
  const ids = new Set(ordinary.map((p) => p.id));
  const recent = visibleRecords(store)
    .filter((r) => ids.has(r.project))
    .sort((a, b) => newestRecord(store, a, b))[0];
  return (
    recent?.project ||
    ordinary[0]?.id ||
    projectDisplayOrder(store.projects)[0]?.id ||
    "unassigned"
  );
}

type NamedProject = {
  id: string;
  name: string;
  workspace?: string;
  subject?: string;
  archived?: boolean;
};

export function projectDisplayOrder<T extends NamedProject>(
  projects: readonly T[],
): T[] {
  return [
    ...projects.filter((p) => p.id !== "unassigned" && !p.archived),
    ...projects.filter((p) => p.id !== "unassigned" && p.archived),
    ...projects.filter((p) => p.id === "unassigned"),
  ];
}

export function groupProjectRecords(
  projects: readonly Project[],
  records: readonly RecordItem[],
) {
  const ordered = projectDisplayOrder(projects);
  const known = new Set(projects.map((p) => p.id));
  const byProject = new Map<string, RecordItem[]>();
  for (const record of records) {
    // 未归属和孤立项目仅在展示时兜底，保留记录的原始项目身份。
    const id = known.has(record.project) ? record.project : "unassigned";
    const group = byProject.get(id);
    if (group) group.push(record);
    else byProject.set(id, [record]);
  }
  if (!known.has("unassigned") && byProject.has("unassigned")) {
    ordered.push({
      id: "unassigned",
      name: "其他",
      subject: "",
      status: "",
      next: "",
    });
  }
  return ordered.flatMap((p) => {
    const items = byProject.get(p.id);
    return items
      ? [
          {
            ...p,
            name: p.id === "unassigned" ? "其他" : p.name,
            records: items,
          },
        ]
      : [];
  });
}

export function projectDisambiguator(
  project: NamedProject,
  projects: NamedProject[],
) {
  if (projects.filter((p) => p.name === project.name).length < 2) return "";
  return project.workspace || project.subject || project.id;
}

export function projectLabel(project: NamedProject, projects: NamedProject[]) {
  const detail = projectDisambiguator(project, projects);
  return detail ? `${project.name} · ${detail}` : project.name;
}
