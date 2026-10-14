import type { Store } from "./model.ts";
import { workingDay } from "./model.ts";
export type SearchKind =
  "record" | "note" | "project" | "continuation" | "review" | "thread";
export type SearchQuery = {
  text: string;
  project?: string;
  start?: string;
  end?: string;
  type?: SearchKind | "all" | "";
  evidence?: boolean;
  historical?: boolean;
};
export type SearchResult = {
  kind: SearchKind;
  id: string;
  project: string;
  date: string;
  title: string;
  snippet: string;
  historical?: boolean;
  matchedFields?: string[];
  recordId?: string;
  period?: "周" | "月" | "年";
  start?: string;
};
export type SearchDocument = SearchResult & {
  fields?: { label: string; text: string }[];
  text: string;
  evidence: string;
  historical: boolean;
};
function savedDay(time?: string): string {
  const timestamp = time ? Date.parse(time) : NaN;
  return Number.isFinite(timestamp) ? workingDay(timestamp) : "";
}
export function buildSearchIndex(store: Store): SearchDocument[] {
  const documents: SearchDocument[] = [];
  const displaced = new Map<string, Set<string>>();
  for (const correction of store.records) {
    if (correction.supersededDraftBy) continue;
    for (const link of correction.relations || []) {
      if (link.type === "supplements") continue;
      const authors = displaced.get(link.target) || new Set<string>();
      authors.add(correction.id);
      displaced.set(link.target, authors);
    }
  }
  const add = (
    result: Omit<SearchResult, "snippet">,
    text: string,
    evidence = "",
    historical = false,
    fields?: { label: string; text: string }[],
  ) =>
    documents.push({
      ...result,
      snippet: "",
      text,
      evidence,
      historical,
      fields,
    });
  for (const r of store.records) {
    if (r.removed || r.progressHidden || r.supersededDraftBy) continue;
    add(
      {
        kind: "record",
        id: r.id,
        recordId: r.id,
        project: r.project,
        date: r.date,
        title: r.title,
      },
      [r.title, r.summary, r.change, r.next].filter(Boolean).join("\n"),
      r.evidence || "",
      [r.id, ...(r.sourceIds || [])].some((id) =>
        [...(displaced.get(id) || [])].some((author) => author !== r.id),
      ),
      [
        { label: "标题", text: r.title },
        { label: "摘要", text: r.summary || "" },
        { label: "变化", text: r.change },
        { label: "下一步", text: r.next || "" },
      ],
    );
  }
  for (const [date, n] of Object.entries(store.notes))
    add(
      {
        kind: "note",
        id: date,
        project: "",
        date,
        title: date + " 心得与下一步",
      },
      [n.lesson, n.tomorrow].join("\n"),
    );
  for (const p of store.projects) {
    add(
      {
        kind: "project",
        id: p.id,
        project: p.id,
        date: savedDay(p.overviewEditedAt),
        title: p.name,
      },
      [p.name, p.subject, p.status].filter(Boolean).join("\n"),
    );
    const continuation = store.continuations?.[p.id];
    const text = continuation?.text ?? p.next;
    if (text)
      add(
        {
          kind: "continuation",
          id: p.id,
          project: p.id,
          date: savedDay(
            continuation ? continuation.updatedAt : p.overviewEditedAt,
          ),
          title: p.name + " · 继续起点",
        },
        text,
      );
  }
  for (const [id, r] of Object.entries(store.periodReviews || {}))
    add(
      {
        kind: "review",
        id,
        project: "",
        date: r.start,
        title: r.start + " " + r.period + "回望",
        period: r.period,
        start: r.start,
      },
      r.text,
    );
  for (const t of Object.values(store.threads || {}))
    add(
      {
        kind: "thread",
        id: t.id,
        project: t.project,
        date: savedDay(t.updatedAt),
        title: t.title,
      },
      [t.title, t.description].join("\n"),
    );
  return documents;
}
export function searchDocuments(
  documents: SearchDocument[],
  query: SearchQuery,
): SearchResult[] {
  const tokens = query.text
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return [];
  const results: SearchResult[] = [];
  for (const doc of documents) {
    if (
      (!query.historical && doc.historical) ||
      (query.project && doc.project !== query.project) ||
      (query.type && query.type !== "all" && doc.kind !== query.type) ||
      (query.start && doc.date < query.start) ||
      (query.end && doc.date > query.end)
    )
      continue;
    const text =
      query.evidence && doc.evidence
        ? doc.text + "\n" + doc.evidence
        : doc.text;
    const lower = text.toLocaleLowerCase();
    if (!tokens.every((token) => lower.includes(token))) continue;
    const fields = doc.fields || [
      {
        label: (
          {
            record: "正文",
            note: "心得与下一步",
            project: "项目概况",
            continuation: "继续起点",
            review: "周期回望",
            thread: "主线",
          } as const
        )[doc.kind],
        text: doc.text,
      },
    ];
    const searchedFields =
      query.evidence && doc.evidence
        ? [...fields, { label: "已保存依据", text: doc.evidence }]
        : fields;
    const contexts: string[] = [];
    const matchedFields: string[] = [];
    for (const field of searchedFields) {
      const folded = field.text.toLocaleLowerCase();
      const hits = tokens
        .flatMap((token) => {
          const at = folded.indexOf(token);
          return at < 0
            ? []
            : [
                {
                  start: Math.max(0, at - 25),
                  end: Math.min(field.text.length, at + token.length + 45),
                },
              ];
        })
        .sort((a, b) => a.start - b.start);
      if (!hits.length) continue;
      matchedFields.push(field.label);
      const windows: typeof hits = [];
      for (const hit of hits) {
        const last = windows[windows.length - 1];
        if (last && hit.start <= last.end)
          last.end = Math.max(last.end, hit.end);
        else windows.push({ ...hit });
      }
      contexts.push(
        field.label +
          "：" +
          windows
            .map(
              (window) =>
                (window.start ? "…" : "") +
                field.text
                  .slice(window.start, window.end)
                  .replace(/\n/g, " · ") +
                (window.end < field.text.length ? "…" : ""),
            )
            .join(" … "),
      );
    }
    const {
      text: ignoredText,
      evidence: ignoredEvidence,
      fields: ignoredFields,
      ...result
    } = doc;
    results.push({
      ...result,
      historical: doc.historical,
      matchedFields,
      snippet: contexts.join(" ｜ "),
    });
  }
  return results.sort(
    (a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title),
  );
}
