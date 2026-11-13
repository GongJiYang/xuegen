/**
 * Bookshelf view model.
 *
 * Exposes the books currently being read (`shelf.today`: one planned and one
 * free slot) plus the whole shelf (`shelf.list`). 「读完这段」 waits out its
 * undo window in `use-control-card` and only then calls `done`, which records
 * the block as read through `bookshelf.mjs done`; 「摘几句」 calls `extract`,
 * which appends one `#待做卡` line to the book page. Each write reloads the
 * resources that change.
 *
 * A write holds a synchronous lock on its key until the request settles, so a
 * second click while the first is still in flight sends nothing: the hook's
 * return value only updates after the await, which is exactly the window a
 * double click lands in.
 */

import { useRef } from "react";
import type { ShelfListItem, ShelfToday } from "@shared/data-protocol.js";
import * as client from "../client.js";
import { todayKey } from "../today.js";
import { useBoardResource, type BoardResource } from "./use-resource.js";

export interface ShelfResource {
  today: BoardResource<ShelfToday>;
  list: BoardResource<ShelfListItem[]>;
  /** Record today's block of `slug` as read; reloads `today` and `list`. */
  done(slug: string): Promise<boolean>;
  /** Save one extract line; reloads `list`. Resolves the failure message, or null on success. */
  extract(slug: string, page: number, text: string): Promise<string | null>;
  reload(): void;
}

export function useShelf(): ShelfResource {
  // Keys of the writes in flight (`done:<slug>`, `extract:<slug>:<page>:<text>`).
  const inFlight = useRef<Set<string>>(new Set());
  const today = useBoardResource(
    () => client.data({ kind: "shelf.today", today: todayKey() }),
    [],
  );
  const list = useBoardResource(() => client.data({ kind: "shelf.list" }), []);

  const reload = (): void => {
    today.reload();
    list.reload();
  };

  return {
    today,
    list,
    reload,
    done: async (slug) => {
      const key = `done:${slug}`;
      // A click while this book's write is still in flight records nothing.
      if (inFlight.current.has(key)) return false;
      inFlight.current.add(key);
      try {
        const result = await client.data({ kind: "shelf.done", slug, today: todayKey() });
        if (result.ok) reload();
        return result.ok;
      } finally {
        inFlight.current.delete(key);
      }
    },
    extract: async (slug, page, text) => {
      const key = `extract:${slug}:${page}:${text}`;
      // The same line saved twice is one line: drop the second save silently.
      if (inFlight.current.has(key)) return null;
      inFlight.current.add(key);
      try {
        const result = await client.data({ kind: "shelf.extract", slug, page, text, today: todayKey() });
        if (result.ok) {
          list.reload();
          return null;
        }
        return result.error;
      } finally {
        inFlight.current.delete(key);
      }
    },
  };
}
