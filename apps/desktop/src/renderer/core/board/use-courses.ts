/**
 * Course progress view model.
 *
 * Wraps `courses.list` as an {@link AsyncState} for the progress panel. There is
 * no write path: course state files are read-only in the interface.
 */

import type { CourseSummary } from "@shared/data-protocol.js";
import * as client from "../client.js";
import { useBoardResource, type BoardResource } from "./use-resource.js";

export type CoursesResource = BoardResource<CourseSummary[]>;

/** Load the course list; reloads only on mount. */
export function useCourses(): CoursesResource {
  return useBoardResource(() => client.data({ kind: "courses.list" }), []);
}
