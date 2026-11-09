/**
 * The 总控 今日卡's props: the pure `controlCard` view plus its callbacks.
 *
 * Row buttons route to the same actions the 今天 window uses (开课 / 核实 /
 * open a tool). 「读完了」（讲后读）与「读完这段」（书房行）share one 10-second
 * undo window before writing: the row turns into ✓ with a 「撤销 · N」 button
 * (`withPendingRead` / `withPendingShelf`), and only the deadline actually
 * writes — `course.afterRead` for a 讲后读 row, `shelf.done` for a bookshelf
 * row. The 摘几句 button on an already-done shelf row opens the inline form;
 * its save goes through `shelf.extract` (no model call). The effect-free state
 * changes live in `onAction`, a click handler — never a model call.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CycleDay, ReadingQueueItem } from "@shared/data-protocol.js";
import { assertNever } from "@shared/protocol.js";
import type { ControlCardExtract, ControlCardProps, ToolId } from "../../skins/contract.js";
import * as client from "../client.js";
import { strings } from "../strings.js";
import {
  controlCard,
  parsePageInput,
  withExtractCount,
  withPendingRead,
  withPendingShelf,
  type ControlCardRow,
} from "./control-card.js";
import { useBoardResource, type BoardResource } from "./use-resource.js";
import { dateKey } from "./use-calendar.js";
import type { ShelfResource } from "./use-shelf.js";

/** How long 「读完了」/「读完这段」 can be undone before the write runs. */
const UNDO_WINDOW_MS = 10_000;

/** A row parked in its undo window; the `kind` decides which write the deadline runs. */
type Pending =
  | { kind: "afterRead"; slug: string; label: string; deadline: number }
  | { kind: "shelf"; slug: string; deadline: number };

export interface ControlCardInput {
  /** `cycle.today` and `cycle.tomorrow`. */
  today: BoardResource<CycleDay>;
  tomorrow: BoardResource<CycleDay>;
  /** `reading.queue`. */
  queue: BoardResource<ReadingQueueItem[]>;
  /** `shelf.today` / `shelf.list` plus the 书房 writes. */
  shelf: ShelfResource;
  /** `controller.streaming`: an answer disables every button. */
  streaming: boolean;
  /** The 今天 window's own handlers. */
  onStudy(slug: string): void;
  onVerify(slug: string): void;
  onOpenTool(tool: ToolId): void;
  /** 「让总控说说」. */
  onAskBrief(): void;
  /** Reload the course list and the calendar month after a successful write. */
  refresh(): void;
}

export function useControlCard(input: ControlCardInput): Omit<ControlCardProps, "older"> | null {
  const today = dateKey(new Date());
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A 「读完了」/「读完这段」 click parks here until its deadline; null means nothing pending.
  const [pending, setPending] = useState<Pending | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // The 摘几句 form: which row's button opened it, its save state and error, and
  // how many lines this run of the app has already saved per book.
  const [extracting, setExtracting] = useState<{ slug: string; pages: string } | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  // The card's own month — the calendar window's month follows its ‹ › paging.
  const thisMonth = today.slice(0, 7);
  const month = useBoardResource(
    () => client.data({ kind: "calendar.month", month: thisMonth }),
    [thisMonth],
  );
  const reloadMonth = month.reload;

  const view = useMemo(
    () =>
      controlCard({
        today,
        day: input.today.state.status === "ready" ? input.today.state.value : null,
        tomorrow: input.tomorrow.state.status === "ready" ? input.tomorrow.state.value : null,
        calendar: month.state.status === "ready" ? month.state.value : null,
        queue: input.queue.state.status === "ready" ? input.queue.state.value : [],
        shelf: input.shelf.today.state.status === "ready" ? input.shelf.today.state.value : null,
      }),
    [today, input.today.state, input.tomorrow.state, month.state, input.queue.state, input.shelf.today.state],
  );

  const write = (entry: Pending): void => {
    setWriting(true);
    setError(null);
    if (entry.kind === "shelf") {
      void input.shelf
        .done(entry.slug)
        .then((ok) => {
          if (!ok) setError(strings.control.card.shelfDoneFailed);
        })
        .finally(() => setWriting(false));
      return;
    }
    void client
      .data({ kind: "course.afterRead", slug: entry.slug, label: entry.label, date: today })
      .then((result) => {
        if (result.ok) {
          input.refresh();
          reloadMonth();
          // The 讲后读 may land in a 书房 page (核心页已读): refresh the book rows too.
          input.shelf.reload();
        } else setError(strings.control.card.afterReadFailed);
      })
      .finally(() => setWriting(false));
  };
  // The timer below fires the latest `write` without listing it (and its
  // unstable inputs) as an effect dependency.
  const writeRef = useRef(write);
  useEffect(() => {
    writeRef.current = write;
  });

  // The undo window: tick the countdown, and write once the deadline passes.
  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    const timer = setTimeout(() => {
      setPending(null);
      writeRef.current(pending);
    }, pending.deadline - Date.now());
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [pending]);

  const onAction = (row: ControlCardRow): void => {
    const action = row.action;
    if (action === null) return;
    switch (action.kind) {
      case "study":
        return input.onStudy(action.slug);
      case "verify":
        return input.onVerify(action.slug);
      case "read":
        return input.onOpenTool("reading");
      case "anki":
        return input.onOpenTool("cards");
      case "afterRead":
      case "shelfDone": {
        // A second click inside the window commits the parked one now instead of dropping it.
        if (pending) writeRef.current(pending);
        const deadline = Date.now() + UNDO_WINDOW_MS;
        setPending(
          action.kind === "afterRead"
            ? { kind: "afterRead", slug: action.slug, label: action.label, deadline }
            : { kind: "shelf", slug: action.slug, deadline },
        );
        setNow(Date.now());
        return;
      }
      case "undoRead":
      case "undoShelf":
        setPending(null);
        return;
      case "extract":
        setExtracting({ slug: action.slug, pages: action.pages });
        setExtractError(null);
        return;
      default:
        return assertNever(action);
    }
  };

  if (view === null) return null;
  const left = pending ? Math.max(1, Math.ceil((pending.deadline - now) / 1000)) : 0;
  const shown = withExtractCount(
    withPendingShelf(
      withPendingRead(
        view,
        pending?.kind === "afterRead" ? { slug: pending.slug, label: pending.label, left } : null,
      ),
      pending?.kind === "shelf" ? { slug: pending.slug, left } : null,
    ),
    counts,
  );

  const extract: ControlCardExtract | null =
    extracting === null
      ? null
      : {
          slug: extracting.slug,
          pages: extracting.pages,
          saving,
          error: extractError,
          onCancel: () => setExtracting(null),
          onSave: (pageText, text) => {
            const card = strings.control.card;
            const page = parsePageInput(pageText);
            if (page === null) {
              setExtractError(card.extractPageInvalid);
              return;
            }
            if (text.trim() === "") {
              setExtractError(card.extractTextEmpty);
              return;
            }
            setSaving(true);
            setExtractError(null);
            void input.shelf
              .extract(extracting.slug, page, text)
              .then((failure) => {
                if (failure === null) {
                  setExtracting(null);
                  setCounts((current) => ({
                    ...current,
                    [extracting.slug]: (current[extracting.slug] ?? 0) + 1,
                  }));
                } else {
                  setExtractError(card.extractFailed);
                }
              })
              .finally(() => setSaving(false));
          },
        };

  return { view: shown, onAction, onAskBrief: input.onAskBrief, busy: input.streaming || writing || saving, error, extract };
}
