/**
 * The 「默认」 style radio's label.
 *
 * A subject page may name a default style in its 「## 讲解偏好」 section
 * (`subjects.mjs` → `SubjectInfo.defaultStyle`); when the active course sits in
 * such a subject the radio reads 「默认 · 细讲」 so the learner sees what 默认
 * resolves to. Pure: the subjects overview and the active course are arguments.
 */

import type { SubjectsOverview } from "@shared/data-protocol.js";
import { strings } from "../strings.js";
import type { AsyncState } from "./state.js";

/** 「默认 · 细讲」 for a course whose subject page names a default style, else 「默认」. */
export function defaultStyleLabel(
  subjects: AsyncState<SubjectsOverview>,
  activeCourse: string | null,
): string {
  if (!activeCourse || subjects.status !== "ready") return strings.data.styles.default;
  const subject = subjects.value.subjects.find((item) => item.courses.includes(activeCourse));
  const style = subject?.defaultStyle ?? null;
  return style ? strings.input.defaultStyle(strings.data.styles[style]) : strings.data.styles.default;
}
