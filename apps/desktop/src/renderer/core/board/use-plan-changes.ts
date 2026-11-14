/**
 * Tracks what each 总控 answer changed in the schedule, and undoes it.
 *
 * While the 总控 session is open it keeps the lessons' placements for this
 * month and the next (`cycle.month`). When an answer starts, the placements
 * then are the 「before」 and the start time is noted; when it ends they are
 * read again and compared. A turn that moved anything is remembered by its
 * user message id (for the feed cards) and becomes the banner's change set
 * until 「知道了」. The same turn's 计划 / 顺延 commits (`plan.undoable` since
 * the start time) make it undoable: 「撤销这次改动」 runs `plan.undo`.
 * Only this run's turns are compared: restored history has no 「before」.
 */

import { useEffect, useState } from "react";
import type { CycleMonth } from "@shared/data-protocol.js";
import * as client from "../client.js";
import { realNowIso } from "../today.js";
import type { UndoState } from "./activity-feed.js";
import { placements, planDiff, type Placements, type PlanChange } from "./plan-diff.js";

export interface PlanChanges {
  /** Turn id → its changes (turns that changed nothing are absent). */
  byTurn: Record<string, PlanChange[]>;
  /** Turn id → its undo state (turns with 计划 / 顺延 commits only). */
  undo: Record<string, UndoState>;
  /** The latest turn's changes until dismissed; null when none. */
  latest: { turnId: string; changes: PlanChange[] } | null;
  /** The roles of the courses seen (main / aux), for the grid's lane rows. */
  roles: CycleMonth["roles"];
  dismiss(): void;
  undoTurn(turnId: string): void;
}

function nextMonth(month: string): string {
  const [year, value] = month.split("-").map(Number) as [number, number];
  return value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, "0")}`;
}

async function loadMonths(today: string): Promise<CycleMonth[] | null> {
  const month = today.slice(0, 7);
  const results = await Promise.all([
    client.data({ kind: "cycle.month", month }),
    client.data({ kind: "cycle.month", month: nextMonth(month) }),
  ]);
  const months: CycleMonth[] = [];
  for (const result of results) {
    if (!result.ok) return null;
    months.push(result.data);
  }
  return months;
}

interface Compare {
  before: Placements;
  turnId: string;
  since: string;
}

export function usePlanChanges(input: {
  enabled: boolean;
  streaming: boolean;
  /** The id of the newest user message: the turn that just ran. */
  turnId: string | null;
  today: string;
  /** After an undo: reload the boards and tell the model on the next message. */
  onUndone(): void;
}): PlanChanges {
  const { enabled, streaming, turnId, today } = input;
  const [months, setMonths] = useState<CycleMonth[] | null>(null);
  const [before, setBefore] = useState<{ placements: Placements; since: string } | null>(null);
  const [compare, setCompare] = useState<Compare | null>(null);
  const [byTurn, setByTurn] = useState<Record<string, PlanChange[]>>({});
  const [since, setSince] = useState<Record<string, string>>({});
  const [undo, setUndo] = useState<Record<string, UndoState>>({});
  const [latest, setLatest] = useState<PlanChanges["latest"]>(null);
  const [wasStreaming, setWasStreaming] = useState(streaming);

  // Answer edges, adjusted during render: start keeps the 「before」, end asks for a compare.
  if (streaming !== wasStreaming) {
    setWasStreaming(streaming);
    if (enabled && streaming && months !== null)
      setBefore({ placements: placements(months), since: realNowIso() });
    if (enabled && !streaming && before !== null && turnId !== null) {
      setCompare({ before: before.placements, turnId, since: before.since });
      setBefore(null);
    }
  }

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void loadMonths(today).then((loaded) => {
      if (live && loaded !== null) setMonths(loaded);
    });
    return () => {
      live = false;
    };
  }, [enabled, today]);

  useEffect(() => {
    if (compare === null) return;
    let live = true;
    void Promise.all([loadMonths(today), client.data({ kind: "plan.undoable", since: compare.since })]).then(
      ([loaded, undoable]) => {
        if (!live) return;
        setCompare(null);
        if (undoable.ok && undoable.data.length > 0) {
          setSince((current) => ({ ...current, [compare.turnId]: compare.since }));
          setUndo((current) => ({ ...current, [compare.turnId]: { status: "available", error: null } }));
        }
        if (loaded === null) return;
        setMonths(loaded);
        const changes = planDiff(compare.before, placements(loaded));
        if (changes.length === 0) return;
        setByTurn((current) => ({ ...current, [compare.turnId]: changes }));
        setLatest({ turnId: compare.turnId, changes });
      },
    );
    return () => {
      live = false;
    };
  }, [compare, today]);

  const undoTurn = (id: string): void => {
    const from = since[id];
    if (from === undefined || undo[id]?.status !== "available") return;
    setUndo((current) => ({ ...current, [id]: { status: "undoing", error: null } }));
    void client.data({ kind: "plan.undo", since: from }).then((result) => {
      if (!result.ok) {
        setUndo((current) => ({ ...current, [id]: { status: "available", error: result.error } }));
        return;
      }
      setUndo((current) => ({ ...current, [id]: { status: "undone", error: null } }));
      setLatest((current) => (current?.turnId === id ? null : current));
      void loadMonths(today).then((loaded) => {
        if (loaded !== null) setMonths(loaded);
      });
      input.onUndone();
    });
  };

  const roles = Object.assign({}, ...(months ?? []).map((month) => month.roles)) as CycleMonth["roles"];
  return { byTurn, undo, latest, roles, dismiss: () => setLatest(null), undoTurn };
}
