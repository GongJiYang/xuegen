/**
 * The `XUEGEN_TODAY` date override.
 *
 * The scenario walkthrough pins the app's "today" to a fixed day by launching
 * the desktop with `XUEGEN_TODAY=YYYY-MM-DD`; unset means the real clock, so a
 * normal run behaves exactly as before. The override reaches the renderer
 * through the settings channel (`readSettingsForRenderer`) and date-free skill
 * script calls as `--today` (see `data/handler.ts`). It is never written to
 * `desktop.json`.
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day: strict shape plus a `new Date(y, m - 1, d)` round-trip. */
function isRealDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * The configured `XUEGEN_TODAY`, or null when it is unset or not a real day.
 * An invalid value warns rather than silently pinning the app to a wrong day:
 * a typo must never shift "today".
 */
export function todayOverride(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.XUEGEN_TODAY;
  if (raw === undefined || raw === "") return null;
  if (isRealDay(raw)) return raw;
  console.warn(`[main] XUEGEN_TODAY 非法（须为真实日期 YYYY-MM-DD），已忽略：${raw}`);
  return null;
}
