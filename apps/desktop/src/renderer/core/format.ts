/**
 * Small formatting helpers shared by the app shell and the skins.
 *
 * Pure, no clock beyond reading the passed date parts: a date string in, a
 * display label out. Kept here so the calendar panel and the day editor agree on
 * how a date is written.
 */

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"] as const;

/** A `YYYY-MM-DD` date's weekday label, e.g. "11月5日 周四". */
export function dayTitle(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(year ?? 2000, (month ?? 1) - 1, day ?? 1).getDay()] ?? "";
  return `${month}月${day}日 周${weekday}`;
}

/** The `YYYY-MM-DD` for a `Date`, using local time. */
export function isoDate(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
