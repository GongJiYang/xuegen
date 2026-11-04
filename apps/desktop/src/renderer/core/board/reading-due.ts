/**
 * Reading due labels.
 *
 * The reading panel shows the whole queue, not only what is due, so each row
 * needs a relative due tag: 今天, 逾期 N 天, or a date like 11月5日. The rule is
 * pure and takes "today" as an argument so it never reads the clock, and every
 * skin can derive the same tag from the same data.
 */

/** Properties the tag needs from a reading item. */
export interface DueLike {
  due: string;
}

/** Number of whole days from `today` to `date` (`YYYY-MM-DD`); negative is past. */
function daysBetween(today: string, date: string): number {
  const from = Date.parse(`${today}T00:00:00Z`);
  const to = Date.parse(`${date}T00:00:00Z`);
  return Math.round((to - from) / 86400000);
}

/**
 * The relative due tag for an item.
 *
 * - due on `today` → 今天
 * - due before `today` → 逾期 N 天
 * - due later → `M月D日`
 * - no due → 未排期
 */
export function dueLabel(due: string, today: string): string {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return "未排期";
  const delta = daysBetween(today, due);
  if (delta === 0) return "今天";
  if (delta < 0) return `逾期 ${-delta} 天`;
  const [, month, day] = due.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

/** True when an item is due today or already overdue. */
export function isDueNow(due: string, today: string): boolean {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
  return daysBetween(today, due) <= 0;
}
