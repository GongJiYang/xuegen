/**
 * Reading queue view model.
 *
 * Exposes today's due items, the queue stats, and the candidate sources the
 * "加入阅读" field offers. A write (add / review / next / postpone / done)
 * refreshes all three so the panel and the 今天 window stay in step.
 *
 * The source field has a second path that is not a data write: an `http(s)://`
 * URL is handed to the agent to clip, because `reading-queue.mjs add` only
 * accepts原文 inside the vault. That decision is exposed as a pure helper so the
 * panel can branch without duplicating the rule.
 */

import type {
  ReadingDue,
  ReadingItem,
  ReadingPriority,
  ReadingSource,
  ReadingStats,
} from "@shared/data-protocol.js";
import type { DataResultFor } from "@shared/data-protocol.js";
import * as client from "../client.js";
import { useBoardResource, type BoardResource, type LoadResult } from "./use-resource.js";
import { useShelf, type ShelfResource } from "./use-shelf.js";

/** How many due items the panel asks for (the design shows a short list). */
export const READING_TODAY_LIMIT = 10;

export interface ReadingResource {
  items: BoardResource<ReadingItem[]>;
  /** The whole queue (excluding done), sorted by due date. */
  queue: BoardResource<ReadingItem[]>;
  stats: BoardResource<ReadingStats>;
  sources: BoardResource<ReadingSource[]>;
  /** The bookshelf (整本书通读): today's blocks and the whole shelf. */
  shelf: ShelfResource;
  add(source: string, priority: ReadingPriority, due: ReadingDue): Promise<DataResultFor<"reading.add">>;
  review(slug: string, outcome: "next" | "postpone" | "done", position?: string): Promise<LoadResult<unknown>>;
  /** Reload every reading resource (used after a write from another panel). */
  reload(): void;
}

/** True when the input is an http(s) URL rather than a vault path. */
export function isWebUrl(source: string): boolean {
  return /^https?:\/\//i.test(source.trim());
}

/** Build the prompt that asks the agent to clip a URL and queue it. */
export function clipPrompt(source: string, priority: ReadingPriority, due: ReadingDue): string {
  const when = due === "today" ? "今天就读" : "按默认间隔排期";
  return `/skill:reading 把这篇文章剪藏到 clippings/ 并加入阅读队列（优先级 ${priority}，${when}）：${source.trim()}`;
}

export function useReading(): ReadingResource {
  const items = useBoardResource(
    () => client.data({ kind: "reading.today", limit: READING_TODAY_LIMIT }),
    [],
  );
  const queue = useBoardResource(() => client.data({ kind: "reading.queue" }), []);
  const stats = useBoardResource(() => client.data({ kind: "reading.stats" }), []);
  const sources = useBoardResource(() => client.data({ kind: "reading.sources" }), []);
  const shelf = useShelf();

  const reload = (): void => {
    items.reload();
    queue.reload();
    stats.reload();
    sources.reload();
    shelf.reload();
  };

  return {
    items,
    queue,
    stats,
    sources,
    shelf,
    reload,
    add: (source, priority, due) =>
      items
        .mutate(() => client.data({ kind: "reading.add", source, priority, due }))
        .then((result) => {
          if (result.ok) {
            queue.reload();
            stats.reload();
            sources.reload();
          }
          return result;
        }),
    review: (slug, outcome, position) =>
      items
        .mutate(() =>
          client.data(
            position === undefined
              ? { kind: "reading.review", slug, outcome }
              : { kind: "reading.review", slug, outcome, position },
          ),
        )
        .then((result) => {
          if (result.ok) {
            queue.reload();
            stats.reload();
          }
          return result;
        }),
  };
}
