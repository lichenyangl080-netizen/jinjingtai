import { periodRange } from "./model.ts";

export type ReviewPeriod = "周" | "月" | "年";

/** Calendar offsets have the same meaning at every review entry point. */
export function reviewOffset(
  period: ReviewPeriod,
  targetDate: string,
  today: string,
) {
  const [target] = periodRange(period, 0, targetDate);
  const [base] = periodRange(period, 0, today);
  if (period === "周")
    return Math.round(
      (Date.parse(target + "T12:00:00Z") - Date.parse(base + "T12:00:00Z")) /
        604800000,
    );
  if (period === "月")
    return (
      (Number(target.slice(0, 4)) - Number(base.slice(0, 4))) * 12 +
      Number(target.slice(5, 7)) -
      Number(base.slice(5, 7))
    );
  return Number(target.slice(0, 4)) - Number(base.slice(0, 4));
}
