import {
  currentProjectRecords,
  newestRecord,
  visibleRecords,
  workGroups,
  type Project,
  type RecordItem,
  type Store,
  type WorkGroup,
} from "./model.ts";
import { workProgress } from "./work-progress.ts";

type OverviewField =
  | { text: string; source: "manual" | "empty" }
  | { text: string; source: "record"; record: RecordItem; caption: string };

export function projectOverview(store: Store, project: Project) {
  const latest = currentProjectRecords(store, project.id).sort((a, b) =>
    newestRecord(store, a, b),
  )[0];
  const caption = latest
    ? workProgress(store, workGroups(store, [latest])[0]).caption
    : "";
  const field = (key: "status" | "next"): OverviewField => {
    if (project[key].trim()) return { text: project[key], source: "manual" };
    const text = key === "status" ? latest?.change : latest?.next;
    if (latest && text?.trim())
      return { text, source: "record", record: latest, caption };
    return {
      text: key === "status" ? "尚未填写当前状态" : "尚未填写下一步",
      source: "empty",
    };
  };
  return { status: field("status"), next: field("next") };
}

export function projectTimeline(store: Store, projectId: string) {
  const groups = workGroups(
    store,
    visibleRecords(store).filter((r) => r.project === projectId),
  ).sort((a, b) => b.records[0].date.localeCompare(a.records[0].date));
  const days = new Map<string, WorkGroup[]>();
  for (const group of groups) {
    const date = group.records[0].date;
    const day = days.get(date);
    if (day) day.push(group);
    else days.set(date, [group]);
  }
  return [...days].map(([date, groups]) => ({ date, groups }));
}
