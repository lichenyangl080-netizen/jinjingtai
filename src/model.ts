export function workingDay(time: number = Date.now()): string {
  return new Date(time + 4 * 3600000).toISOString().slice(0, 10);
}
export const TODAY =
  typeof window !== "undefined" && window.jinjingtai?.integration
    ? workingDay()
    : "2026-10-04";
const SAMPLE_DAY = "2026-10-04";
export type RecordItem = {
  id: string;
  date: string;
  project: string;
  title: string;
  change: string;
  next: string;
  kind: string;
  confirmed: boolean;
  manual: boolean;
  evidence?: string;
  removed?: boolean;
  progressHidden?: boolean;
  summary?: string;
  dailySummary?: boolean;
  organizeJob?: string;
  supersededDraftBy?: string;
  work?: {
    title: string;
    summary: string;
    sources?: string[];
    label?: string;
    lead?: string;
  };
  sourceIds?: string[];
  sourceAt?: string;
  createdAt?: string;
  humanEdited?: boolean;
  sourceLinks?: {
    id: string;
    cwd?: string;
    session: string;
    turn: string;
    call?: string;
  }[];
  relations?: {
    type: "supplements" | "negates" | "supersedes";
    target: string;
  }[];
  attachments?: { id: string; name: string; size: number }[];
};
export type Project = {
  id: string;
  name: string;
  workspace?: string;
  workspaceAliases?: string[];
  subject: string;
  status: string;
  next: string;
  archived?: boolean;
  overviewEditedAt?: string;
  overviewRecordIds?: string[];
};
export type DayNote = {
  lesson: string;
  tomorrow: string;
  reviewed?: boolean;
  confirmed?: { lesson: string; tomorrow: string };
};
export type RecordReference = { recordId: string; title: string; date: string };
export type WorkThread = {
  id: string;
  project: string;
  title: string;
  description: string;
  archived?: boolean;
  recordIds: string[];
  createdAt: string;
  updatedAt: string;
};
export type Continuation = {
  text: string;
  recordId?: string;
  sourceNext?: string;
  sourceSignature?: string;
  updatedAt: string;
};
export type PeriodReview = {
  period: "周" | "月" | "年";
  start: string;
  end: string;
  text: string;
  references: RecordReference[];
  updatedAt: string;
};
export type Store = {
  version: 1;
  records: RecordItem[];
  projects: Project[];
  notes: Record<string, DayNote>;
  plans?: Record<string, string>;
  threads?: Record<string, WorkThread>;
  continuations?: Record<string, Continuation>;
  periodReviews?: Record<string, PeriodReview>;
  workAssignments?: Record<
    string,
    {
      title: string;
      summary: string;
      sources: string[];
      job: string;
      label?: string;
      lead?: string;
    }
  >;
};
export function planningLimit(today: string): string {
  const d = new Date(today + "T12:00:00"),
    day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  d.setDate(
    Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()),
  );
  return localDate(d);
}
export const sample: Store = {
  version: 1,
  projects: [
    {
      id: "tide",
      name: "潮痕手作",
      subject: "近景水面",
      status: "确定素材与代码结合的方式，正在验证泡沫遮挡。",
      next: "验证新的泡沫素材与近景遮挡。",
    },
    {
      id: "desk",
      name: "进境台",
      subject: "记录方式",
      status: "每日记录的整理方式已经明确，接下来设计阅读和校正流程。",
      next: "完善补记与编辑流程。",
    },
    {
      id: "reading",
      name: "阅读笔记",
      subject: "阅读与思考",
      status: "把读到的内容转化为可以实践的笔记。",
      next: "整理本周阅读中的一个问题。",
    },
  ],
  records: [
    {
      id: "r1",
      date: SAMPLE_DAY,
      project: "tide",
      kind: "决策",
      title: "确定近景水面的实现路线",
      summary: "转向素材与代码结合。",
      change: "此前尝试纯代码泡沫；今天确定采用素材与代码结合的方式。",
      next: "验证新的泡沫素材与近景遮挡。",
      confirmed: false,
      manual: false,
      evidence:
        "样例依据 · 16:35\n尝试纯代码泡沫后，决定采用泡沫素材配合代码控制层次与透明度。",
    },
    {
      id: "r2",
      date: SAMPLE_DAY,
      project: "tide",
      kind: "发现",
      title: "找到泡沫遮挡不自然的原因",
      change: "调整层级与透明边缘。",
      next: "对照不同视角检查遮挡。",
      confirmed: false,
      manual: false,
      evidence:
        "样例依据 · 17:10\n不自然的遮挡来自层级与透明边缘，下一步逐项对照检查。",
    },
    {
      id: "r3",
      date: SAMPLE_DAY,
      project: "desk",
      kind: "决策",
      title: "明确每日记录的整理方式",
      change: "区分成果、尝试与待继续。",
      next: "完善补记与编辑流程。",
      confirmed: false,
      manual: false,
      evidence: "样例依据 · 18:20\n每日记录分别保留成果、尝试与待继续的内容。",
    },
    {
      id: "r4",
      date: "2026-10-03",
      project: "tide",
      kind: "尝试",
      title: "尝试用代码表现泡沫",
      change: "完成初步效果，近景边缘仍需调整。",
      next: "比较代码与素材两条路线。",
      confirmed: true,
      manual: false,
      evidence: "样例依据 · 15:20\n初步效果可以运行，近景边缘仍需调整。",
    },
    {
      id: "r5",
      date: "2026-10-02",
      project: "reading",
      kind: "所得",
      title: "记下先观察再判断的阅读心得",
      change: "把判断拆成观察事实与解释事实两步。",
      next: "在下次复盘中试用。",
      confirmed: true,
      manual: true,
    },
    {
      id: "r6",
      date: "2026-09-29",
      project: "desk",
      kind: "成果",
      title: "明确工作台的用途",
      change: "每天记录推进的事情，并能回看依据。",
      next: "设计每日阅读流程。",
      confirmed: true,
      manual: true,
    },
  ],
  notes: {
    [SAMPLE_DAY]: {
      lesson: "先找清问题，再决定实现方式。",
      tomorrow: "验证新的泡沫素材与近景遮挡。",
    },
    "2026-10-03": {
      lesson: "把尝试的结果留下，下一次就能从这里继续。",
      tomorrow: "比较代码与素材两条路线。",
      reviewed: true,
    },
  },
};
export function visibleRecords(store: Store, date?: string) {
  return store.records.filter(
    (r) =>
      !r.removed &&
      !r.progressHidden &&
      !r.supersededDraftBy &&
      (!date || r.date === date),
  );
}
export type WorkContext = {
  positions: ReadonlyMap<RecordItem, number>;
  corrections: ReadonlyMap<RecordItem, RecordItem>;
  removedGroups: ReadonlySet<string>;
};

/** Build once for a loaded snapshot; never cache mutable authority globally. */
export function buildWorkContext(store: Store): WorkContext {
  const positions = new Map(store.records.map((r, i) => [r, i]));
  const authors = new Map<string, RecordItem[]>();
  const removedGroups = new Set<string>();
  for (const r of store.records) {
    const work = assignedWork(store, r);
    if (r.removed && work)
      removedGroups.add(
        JSON.stringify([r.project, r.date, canonicalWorkTitle(work.title)]),
      );
    if (r.supersededDraftBy) continue;
    for (const link of r.relations || []) {
      if (link.type === "supplements") continue;
      const list = authors.get(link.target) || [];
      list.push(r);
      authors.set(link.target, list);
    }
  }
  const corrections = new Map<RecordItem, RecordItem>();
  for (const r of store.records) {
    let first: RecordItem | undefined;
    for (const id of [r.id, ...(r.sourceIds || [])]) {
      const candidate = authors.get(id)?.find((author) => author.id !== r.id);
      if (
        candidate &&
        (!first || positions.get(candidate)! < positions.get(first)!)
      )
        first = candidate;
    }
    if (first) corrections.set(r, first);
  }
  return { positions, corrections, removedGroups };
}

export function dailyRecordPreview(
  store: Store,
  records: RecordItem[],
  context?: WorkContext,
) {
  const priority: Record<string, number> = {
    已验证成果: 85,
    阻塞: 80,
    决策: 75,
    发现: 60,
    尝试: 50,
    未验证实现: 40,
    未采纳建议: 10,
  };
  return records
    .map((r, n) => ({
      r,
      n,
      score: (context ? context.corrections.get(r) : displacedBy(store, r))
        ? -100
        : r.manual || r.humanEdited
          ? 100
          : (priority[r.kind] ?? 45),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        newestRecord(store, a.r, b.r, context?.positions) ||
        b.n - a.n,
    )
    .map((x) => x.r);
}
export function dailyRecordTitle(title: string, projectName: string) {
  return title.startsWith(projectName + "：")
    ? title.slice(projectName.length + 1).trim()
    : title.startsWith(projectName + ":")
      ? title.slice(projectName.length + 1).trim()
      : title;
}
export type WorkGroup = {
  id: string;
  title: string;
  label?: string;
  lead?: string;
  summary: string;
  records: RecordItem[];
};
// Legacy grouping is a read-only projection. Only an explicit, unambiguous episode
// in the record or its saved evidence qualifies; proximity alone proves nothing.
function legacyWork(r: RecordItem): string | undefined {
  if (!/视频/.test(r.title)) return;
  // Shared production rules may cite an episode as an example; that does not
  // make the rules an episode deliverable.
  if (
    /规范|工作流|通用|模板/.test(r.title) &&
    !/第[一二三四五六七八九十百零〇两\d]+期/.test(r.title)
  )
    return;
  const episodes = [
    ...new Set(
      [
        ...(r.title + "\n" + r.change + "\n" + (r.evidence || "")).matchAll(
          /第([一二三四五六七八九十百零〇两\d]+)期/g,
        ),
      ].map((m) => {
        const digits: Record<string, number> = {
          一: 1,
          二: 2,
          两: 2,
          三: 3,
          四: 4,
          五: 5,
          六: 6,
          七: 7,
          八: 8,
          九: 9,
          零: 0,
          〇: 0,
        };
        let n = 0,
          v = 0;
        if (/^\d+$/.test(m[1])) return Number(m[1]);
        for (const c of m[1]) {
          if (c === "十" || c === "百") {
            n += (v || 1) * (c === "十" ? 10 : 100);
            v = 0;
          } else v = digits[c] ?? 0;
        }
        return n + v;
      }),
    ),
  ];
  return episodes.length === 1 ? `第${episodes[0]}期视频制作` : undefined;
}
function canonicalWorkTitle(title: string): string {
  // Normalize only an explicit episode container, never arbitrary project titles.
  return /^第[一二三四五六七八九十百零〇两\d]+期视频制作$/.test(title)
    ? legacyWork({ title, change: "", evidence: "" } as RecordItem) || title
    : title;
}
function assignedWork(store: Store, r: RecordItem) {
  return !r.manual ? store.workAssignments?.[r.id] || r.work : r.work;
}
export function workGroups(
  store: Store,
  records: RecordItem[],
  context?: WorkContext,
): WorkGroup[] {
  const out = new Map<string, WorkGroup>();
  for (const r of dailyRecordPreview(store, records, context)) {
    const work = assignedWork(store, r),
      title = work ? canonicalWorkTitle(work.title) : legacyWork(r),
      id = JSON.stringify([r.project, r.date, title || r.id]);
    const g = out.get(id) || {
      id,
      title: title || r.title,
      label: work?.label,
      summary: "",
      records: [],
    };
    g.records.push(r);
    out.set(id, g);
  }
  for (const g of out.values()) {
    // An old group summary becomes stale after edits, removals or later correction.
    const intact =
      g.records.every((r) => {
        const work = assignedWork(store, r),
          correction = context
            ? context.corrections.get(r)
            : displacedBy(store, r);
        return (
          work?.summary &&
          !r.humanEdited &&
          (!correction ||
            (!!correction.sourceIds?.length &&
              correction.sourceIds.every((id) => work.sources?.includes(id))))
        );
      }) &&
      !(context
        ? context.removedGroups.has(
            JSON.stringify([g.records[0].project, g.records[0].date, g.title]),
          )
        : store.records.some(
            (r) =>
              r.removed &&
              r.date === g.records[0].date &&
              r.project === g.records[0].project &&
              assignedWork(store, r) &&
              canonicalWorkTitle(assignedWork(store, r)!.title) === g.title,
          ));
    const summaries = new Set(
      g.records
        .map(
          (r) =>
            assignedWork(store, r)?.lead || assignedWork(store, r)?.summary,
        )
        .filter(Boolean),
    );
    const sourceSet = new Set(g.records.flatMap((r) => r.sourceIds || [])),
      fullyCovered = g.records.every(
        (r) =>
          !assignedWork(store, r)?.sources ||
          assignedWork(store, r)!.sources!.every((id) => sourceSet.has(id)),
      );
    g.summary =
      intact && fullyCovered && summaries.size === 1
        ? [...summaries][0]!
        : g.records.length === 1
          ? g.records[0].humanEdited
            ? g.records[0].change
            : g.records[0].summary || g.records[0].change
          : g.records
              .map((r) =>
                dailyRecordTitle(
                  r.title,
                  store.projects.find((p) => p.id === r.project)?.name || "",
                ).replace(/^第[一二三四五六七八九十百零〇两\d]+期/, ""),
              )
              .join("；");
  }
  return [...out.values()];
}
export function displacedBy(
  store: Store,
  record: RecordItem,
  end?: string,
): RecordItem | undefined {
  // Removal hides text; it does not erase a saved historical correction.
  return store.records.find(
    (r) =>
      r.id !== record.id &&
      (!end || r.date <= end) &&
      !r.supersededDraftBy &&
      r.relations?.some(
        (link) =>
          link.type !== "supplements" &&
          (link.target === record.id ||
            record.sourceIds?.includes(link.target)),
      ),
  );
}
export function recordCorrections(
  store: Store,
  record: RecordItem,
): RecordItem[] {
  return store.records.filter(
    (r) =>
      r.id !== record.id &&
      !r.supersededDraftBy &&
      r.relations?.some(
        (link) =>
          link.type !== "supplements" &&
          (link.target === record.id ||
            record.sourceIds?.includes(link.target)),
      ),
  );
}
export function historicalRecordIds(store: Store): Set<string> {
  const displaced = new Map<string, Set<string>>();
  for (const r of store.records) {
    if (r.supersededDraftBy) continue;
    for (const link of r.relations || []) {
      if (link.type === "supplements") continue;
      const authors = displaced.get(link.target) || new Set<string>();
      authors.add(r.id);
      displaced.set(link.target, authors);
    }
  }
  return new Set(
    store.records
      .filter((r) =>
        [r.id, ...(r.sourceIds || [])].some((id) =>
          [...(displaced.get(id) || [])].some((author) => author !== r.id),
        ),
      )
      .map((r) => r.id),
  );
}
export function recordRelationEdges(store: Store, record: RecordItem) {
  const incoming = store.records
    .filter((r) => r.id !== record.id)
    .flatMap((r) =>
      (r.relations || [])
        .filter(
          (link) =>
            link.target === record.id ||
            record.sourceIds?.includes(link.target),
        )
        .map((link) => ({
          record: r as RecordItem | undefined,
          type: link.type,
          incoming: true,
        })),
    );
  const outgoing = (record.relations || [])
    .filter(
      (link) =>
        link.target !== record.id && !record.sourceIds?.includes(link.target),
    )
    .map((link) => ({
      record: store.records.find(
        (r) =>
          r.id !== record.id &&
          (r.id === link.target || r.sourceIds?.includes(link.target)),
      ),
      type: link.type,
      incoming: false,
    }));
  return [...outgoing, ...incoming];
}
export function currentProjectRecords(
  store: Store,
  project: string,
  end?: string,
): RecordItem[] {
  const displaced = new Map<string, Set<string>>();
  for (const correction of store.records) {
    if ((end && correction.date > end) || correction.supersededDraftBy)
      continue;
    for (const link of correction.relations || []) {
      if (link.type === "supplements") continue;
      const authors = displaced.get(link.target) || new Set<string>();
      authors.add(correction.id);
      displaced.set(link.target, authors);
    }
  }
  return visibleRecords(store).filter(
    (r) =>
      r.project === project &&
      (!end || r.date <= end) &&
      r.kind !== "未采纳建议" &&
      ![r.id, ...(r.sourceIds || [])].some((id) =>
        [...(displaced.get(id) || [])].some((author) => author !== r.id),
      ),
  );
}
export { confirmDay } from "./legacy-records.ts";
export function historicalNext(
  store: Store,
  project: string,
  end: string,
): string {
  const eligible = currentProjectRecords(store, project, end);
  return (
    eligible
      .sort((a, b) => newestRecord(store, a, b))
      .find((r) => r.next.trim())?.next || "截至这一期，尚未留下继续的起点。"
  );
}
/** Occurrence order, never edit time. Legacy ties follow append order. */
export function newestRecord(
  store: Store,
  a: RecordItem,
  b: RecordItem,
  positions?: ReadonlyMap<RecordItem, number>,
): number {
  return (
    b.date.localeCompare(a.date) ||
    String(b.sourceAt || b.createdAt || "").localeCompare(
      String(a.sourceAt || a.createdAt || ""),
    ) ||
    (positions?.get(b) ?? store.records.indexOf(b)) -
      (positions?.get(a) ?? store.records.indexOf(a))
  );
}
export function saveRecord(store: Store, record: RecordItem): Store {
  const exists = store.records.some((r) => r.id === record.id);
  return {
    ...store,
    ...(store.threads
      ? {
          threads: Object.fromEntries(
            Object.entries(store.threads).map(([id, thread]) => [
              id,
              thread.project !== record.project &&
              thread.recordIds.includes(record.id)
                ? {
                    ...thread,
                    recordIds: thread.recordIds.filter(
                      (id) => id !== record.id,
                    ),
                    updatedAt: new Date().toISOString(),
                  }
                : thread,
            ]),
          ),
        }
      : {}),
    records: exists
      ? store.records.map((r) =>
          r.id === record.id
            ? {
                ...record,
                confirmed: r.confirmed,
                manual: r.manual,
                humanEdited: true,
                createdAt: r.createdAt,
                sourceAt: r.sourceAt,
              }
            : r,
        )
      : [
          ...store.records,
          {
            ...record,
            createdAt: record.createdAt || new Date().toISOString(),
            confirmed: true,
            manual: true,
          },
        ],
  };
}
export function shiftDate(date: string, amount: number): string {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + amount);
  return localDate(d);
}
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function periodRange(
  mode: string,
  offset: number,
  anchor: string = TODAY,
): [string, string] {
  const d = new Date(anchor + "T12:00:00");
  if (mode === "周") {
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
    return [localDate(d), shiftDate(localDate(d), 6)];
  }
  if (mode === "月") {
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    return [
      localDate(d),
      localDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
    ];
  }
  d.setFullYear(d.getFullYear() + offset);
  return [`${d.getFullYear()}-01-01`, `${d.getFullYear()}-12-31`];
}
