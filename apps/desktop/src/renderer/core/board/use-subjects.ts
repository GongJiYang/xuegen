/** The subject skeleton for 总进度 (`subjects.mjs list`), for the given day. */

import type { SubjectsOverview } from "@shared/data-protocol.js";
import * as client from "../client.js";
import { useBoardResource, type BoardResource } from "./use-resource.js";

/** @param today `YYYY-MM-DD` of today (the caller reads the clock). */
export function useSubjects(today: string): BoardResource<SubjectsOverview> {
  return useBoardResource(() => client.data({ kind: "subjects.list", date: today }), [today]);
}
