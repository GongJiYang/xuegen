/** One jj change in 「改动记录」, from `history.mjs list --json` (newest first). */
export interface HistoryEntry {
  id: string;
  /** ISO time with timezone. */
  at: string;
  /** The description's first word (「收课」「计划」「卡片」…), null for a hand-made commit. */
  verb: string | null;
  /** The course / book / subject slug after the verb, or null. */
  slug: string | null;
  /** The description's first line, verbatim. */
  text: string;
  manual: boolean;
  /** Pages this change created. */
  added: { concepts: number; cards: number };
  undoable: boolean;
  /** Why not: a hand-made / undo record, nothing but the board, or touched again later. */
  blocked: "kind" | "empty" | "later" | null;
}

/** What `history.mjs undo` did (the `jj` field stays out of the protocol). */
export interface HistoryUndoResult {
  undone: string[];
  restoreFiles: string[];
  keptNew: string[];
  board: string;
}
