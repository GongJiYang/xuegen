/**
 * The 总控 「术语」 block's data: `terms.list` for the last two weeks, loaded
 * only while the 总控 session is open, shaped by `termsView`.
 */

import type { TermGroup } from "@shared/data-protocol.js";
import * as client from "../client.js";
import { termsSince, termsView, type TermLessonView } from "./terms.js";
import { useBoardResource, type LoadResult } from "./use-resource.js";

const NEVER = new Promise<LoadResult<TermGroup[]>>(() => {});

/** null while loading or disabled; [] when no recent lesson saved a page; "failed" on an error. */
export function useTerms(
  enabled: boolean,
  today: string,
  names: Readonly<Record<string, string>>,
): TermLessonView[] | null | "failed" {
  const since = termsSince(today);
  const resource = useBoardResource(
    () => (enabled ? client.data({ kind: "terms.list", since }) : NEVER),
    [enabled, since],
  );
  if (resource.state.status === "error") return "failed";
  if (resource.state.status !== "ready") return null;
  return termsView(resource.state.value, names);
}
