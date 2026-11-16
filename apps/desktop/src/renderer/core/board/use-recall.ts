/**
 * 总控「开课前回想一下」's data: the 术语 rows of a wider window (a course's
 * previous lesson may be days back), shaped by `recallView`.
 */

import type { CycleDay, SubjectInfo } from "@shared/data-protocol.js";
import { recallView, type RecallGroup } from "./recall.js";
import { useTerms } from "./use-terms.js";

/** How far back 「开课前回想一下」 looks for a previous lesson's record. */
export const RECALL_DAYS = 120;

export function useRecall(input: {
  enabled: boolean;
  today: string;
  day: CycleDay | null;
  names: Readonly<Record<string, string>>;
  subjects: readonly SubjectInfo[] | null;
  domains: readonly { id: string; title: string }[] | null;
}): RecallGroup[] {
  const terms = useTerms(input.enabled, input.today, input.names, RECALL_DAYS);
  return recallView({ day: input.day, terms, subjects: input.subjects, domains: input.domains });
}
