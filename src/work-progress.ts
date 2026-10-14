import {
  displacedBy,
  newestRecord,
  type RecordItem,
  type Store,
  type WorkGroup,
} from "./model.ts";

/** A display of recorded evidence status, never an inferred task completion. */
export function workProgress(store: Store, group: WorkGroup) {
  const corrections = [
    ...new Map(
      group.records
        .map((r) => displacedBy(store, r))
        .filter((r): r is RecordItem => !!r)
        .map((r) => [r.id, r]),
    ).values(),
  ];
  const active = group.records.filter((r) => !displacedBy(store, r));
  const historical = active.length === 0;
  const labels: Record<string, string> = {
    阻塞: "仍有阻塞",
    未验证实现: "实现待核对",
    已验证成果: "有验证结果",
    决策: "已作决定",
    尝试: "尝试",
    发现: "有新发现",
    未采纳建议: "建议待采纳",
  };
  const priority = [
    "阻塞",
    "未验证实现",
    "已验证成果",
    "决策",
    "尝试",
    "发现",
    "未采纳建议",
  ];
  const kinds = new Set(active.map((r) => r.kind));
  const badges = historical
    ? ["已有后续更正"]
    : priority.filter((k) => kinds.has(k)).map((k) => labels[k]);
  if (!badges.length)
    badges.push(active.every((r) => r.manual) ? "手动补记" : "已记录进展");
  if (!historical && corrections.length) badges.push("含后续更正");
  const next = [
    ...new Set(
      [...active]
        .sort((a, b) => newestRecord(store, a, b))
        .map((r) => r.next.trim())
        .filter(Boolean),
    ),
  ];
  const caption = historical
    ? "已有后续更正"
    : kinds.has("阻塞")
      ? "仍有阻塞"
      : kinds.has("未验证实现")
        ? "实现尚未验证"
        : kinds.has("未采纳建议")
          ? "建议尚未采纳"
          : kinds.has("已验证成果")
            ? "已有验证结果"
            : kinds.has("决策")
              ? "已作决定"
              : kinds.has("尝试")
                ? "尝试结果"
                : "";
  return {
    summary: group.summary,
    badges,
    next,
    corrections,
    historical,
    caption,
  };
}
