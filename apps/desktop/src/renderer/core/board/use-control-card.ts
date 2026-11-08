/**
 * The 总控 今日卡's props: the pure `controlCard` view plus its callbacks.
 *
 * Row buttons route to the same actions the 今天 window uses (开课 / 核实 /
 * open a tool). 「读完了」 waits out a 10-second undo window before writing
 * through `course.afterRead`: the row turns into ✓ with a 「撤销 · N」 button
 * (`withPendingRead`), and only the deadline actually writes. The effect-free
 * state changes live in `onAction`, a click handler — never a model call.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CycleDay, ReadingQueueItem } from "@shared/data-protocol.js";
import { assertNever } from "@shared/protocol.js";
import type { ControlCardProps, ToolId } from "../../skins/contract.js";
import * as client from "../client.js";
import { strings } from "../strings.js";
import { controlCard, withPendingRead, type ControlCardRow } from "./control-card.js";
import { useBoardResource, type BoardResource } from "./use-resource.js";
import { dateKey } from "./use-calendar.js";

/** How long 「读完了」 can be undone before the write runs. */
const UNDO_WINDOW_MS = 10_000;

export interface ControlCardInput {
  /** `cycle.today` and `cycle.tomorrow`. */
  today: BoardResource<CycleDay>;
  tomorrow: BoardResource<CycleDay>;
  /** `reading.queue`. */
  queue: BoardResource<ReadingQueueItem[]>;
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
  // A 「读完了」 click parks here until its deadline; null means nothing pending.
  const [pending, setPending] = useState<{ slug: string; label: string; deadline: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
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
      }),
    [today, input.today.state, input.tomorrow.state, month.state, input.queue.state],
  );

  const write = (entry: { slug: string; label: string }): void => {
    setWriting(true);
    setError(null);
    void client
      .data({ kind: "course.afterRead", slug: entry.slug, label: entry.label, date: today })
      .then((result) => {
        if (result.ok) {
          input.refresh();
          reloadMonth();
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
        // A second 「读完了」 inside the window commits the first one now instead of dropping it.
        if (pending) writeRef.current(pending);
        setPending({ slug: action.slug, label: action.label, deadline: Date.now() + UNDO_WINDOW_MS });
        setNow(Date.now());
        return;
      case "undoRead":
        setPending(null);
        return;
      default:
        return assertNever(action);
    }
  };

  if (view === null) return null;
  const shown = withPendingRead(
    view,
    pending ? { slug: pending.slug, label: pending.label, left: Math.max(1, Math.ceil((pending.deadline - now) / 1000)) } : null,
  );
  return { view: shown, onAction, onAskBrief: input.onAskBrief, busy: input.streaming || writing, error };
}
