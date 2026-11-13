/**
 * In-memory teaching-style choices (never persisted): the composer menu, the
 * /风格 commands and the course cards all read and write here.
 */

import { useCallback, useState } from "react";
import type { TeachingStyle } from "@shared/protocol.js";
import { todayKey } from "../today.js";
import { courseStylesOf, emptySessionStyles, resolveStyle, withStyleChoice, type SessionStyles } from "./style.js";

export interface SessionStyle {
  /** The style for the running session (course or free chat). */
  style: TeachingStyle;
  /** Today's per-course picks, for the course cards. */
  courseStyles: Record<string, TeachingStyle>;
  /** Pick a style for the running session. */
  select(next: TeachingStyle): void;
  /** Pick a style for a course from its card. */
  setCourse(slug: string, next: TeachingStyle): void;
}

export function useSessionStyle(activeCourse: string | null): SessionStyle {
  const [styles, setStyles] = useState<SessionStyles>(() => emptySessionStyles(todayKey()));
  const today = todayKey();
  const select = useCallback(
    (next: TeachingStyle) => setStyles((current) => withStyleChoice(current, todayKey(), activeCourse, next)),
    [activeCourse],
  );
  const setCourse = useCallback(
    (slug: string, next: TeachingStyle) => setStyles((current) => withStyleChoice(current, todayKey(), slug, next)),
    [],
  );
  return { style: resolveStyle(styles, today, activeCourse), courseStyles: courseStylesOf(styles, today), select, setCourse };
}
