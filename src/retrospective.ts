import {
  visibleRecords,
  workGroups,
  buildWorkContext,
  type Store,
  type RecordItem,
} from "./model.ts";
import { groupProjectRecords } from "./project-display.ts";

export function retrospectiveDays(
  store: Store,
  start: string,
  end: string,
  project: string,
  month: string,
  query: string,
) {
  const records = visibleRecords(store).filter(
    (r) =>
      r.date >= start && r.date <= end && (!month || r.date.startsWith(month)),
  );
  const context = buildWorkContext(store);
  const byDate = new Map<string, RecordItem[]>();
  for (const record of records) {
    const day = byDate.get(record.date) || [];
    day.push(record);
    byDate.set(record.date, day);
  }
  const days = [...byDate.keys()].sort().map((date) => {
    const projects = groupProjectRecords(store.projects, byDate.get(date)!)
      .map((p) => ({
        ...p,
        works: workGroups(store, p.records, context),
      }))
      .filter((p) => p.works.length);
    return { date, projects };
  });
  return filterRetrospectiveDays(days, project, month, query);
}

export function filterRetrospectiveDays(
  days: {
    date: string;
    projects: (ReturnType<typeof groupProjectRecords>[number] & {
      works: ReturnType<typeof workGroups>;
    })[];
  }[],
  project: string,
  month: string,
  query: string,
) {
  const search = query.trim().toLocaleLowerCase();
  return days
    .filter((day) => !month || day.date.startsWith(month))
    .flatMap((day) => {
      const projects = day.projects
        .filter((p) => !project || p.id === project)
        .map((p) => ({
          ...p,
          works: p.works.filter(
            (g) =>
              !search ||
              [g.label, g.title, ...g.records.map((r) => r.title)].some(
                (title) => title?.toLocaleLowerCase().includes(search),
              ),
          ),
        }))
        .filter((p) => p.works.length);
      return projects.length ? [{ date: day.date, projects }] : [];
    });
}

/** Slice presentation only. Callers keep the full filtered reading sequence. */
export function sliceRetrospectiveDays(
  days: ReturnType<typeof retrospectiveDays>,
  limit: number,
) {
  let remaining = limit;
  return days.flatMap((day) => {
    const projects = day.projects.flatMap((project) => {
      const works = project.works.slice(0, Math.max(0, remaining));
      remaining -= works.length;
      return works.length ? [{ ...project, works }] : [];
    });
    return projects.length ? [{ date: day.date, projects }] : [];
  });
}

export function lessonPreview(text: string): string {
  return text
    .trim()
    .split(/[\n。！？]/, 1)[0]
    .slice(0, 80);
}
