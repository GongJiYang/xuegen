/**
 * Bookshelf view model.
 *
 * Exposes the books currently being read (`shelf.today`: one planned and one
 * free slot) plus the whole shelf (`shelf.list`). 「读完这段」 waits out its
 * undo window in `use-control-card` and only then calls `done`, which records
 * the block as read through `bookshelf.mjs done`; 「摘几句」 calls `extract`,
 * which appends one `#待做卡` line to the book page. Each write reloads the
 * resources that change.
 */

import type { ShelfListItem, ShelfToday } from "@shared/data-protocol.js";
import * as client from "../client.js";
import { dateKey } from "./use-calendar.js";
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
  const today = useBoardResource(
    () => client.data({ kind: "shelf.today", today: dateKey(new Date()) }),
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
      const result = await client.data({ kind: "shelf.done", slug, today: dateKey(new Date()) });
      if (result.ok) reload();
      return result.ok;
    },
    extract: async (slug, page, text) => {
      const result = await client.data({ kind: "shelf.extract", slug, page, text, today: dateKey(new Date()) });
      if (result.ok) {
        list.reload();
        return null;
      }
      return result.error;
    },
  };
}
