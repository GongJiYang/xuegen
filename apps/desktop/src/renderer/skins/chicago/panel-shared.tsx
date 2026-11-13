/**
 * Small helpers shared by the Chicago F2 panels.
 *
 * Loading / error lines, a few label mappings, and the ISO "today" the calendar
 * and the reading due tags compare against. Kept separate so each panel file
 * stays focused on one tool window.
 */

import { todayKey } from "../../core/today.js";
import { strings } from "../../core/strings.js";

/** A small line shown while a panel is loading. */
export function Loading() {
  return <div className="chicago-small chicago-pad">{strings.today.loading}</div>;
}

/** A small error line shown when a panel's load failed. */
export function Failed({ message }: { message: string }) {
  return (
    <div className="chicago-small chicago-pad" role="alert">
      {message}
    </div>
  );
}

/** A small informational line, padded like the design's captions. */
export function Note({ children }: { children: React.ReactNode }) {
  return <div className="chicago-small chicago-pad">{children}</div>;
}

/** The source label for a skill. */
export function sourceLabel(source: "builtin" | "personal" | "pending"): string {
  switch (source) {
    case "builtin":
      return strings.skills.sourceBuiltin;
    case "personal":
      return strings.skills.sourcePersonal;
    default:
      return strings.skills.sourcePending;
  }
}

/** The label for a reading priority. */
export function priorityLabel(priority: string): string {
  if (priority === "high") return strings.reading.priorityHigh;
  if (priority === "low") return strings.reading.priorityLow;
  return strings.reading.priorityMedium;
}

/** Today's date as `YYYY-MM-DD`, for the "today" cell and due tags. */
export function todayIso(): string {
  return todayKey();
}
