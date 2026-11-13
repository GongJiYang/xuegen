/**
 * The session list: loads transcript summaries and owns the popover state.
 *
 * Summaries are fetched once per session file (so the calendar's 「这天的会话」
 * already has data) and again whenever the list opens, so a session started
 * while it was closed shows up. Grouping is the pure `sessionGroups`; this
 * hook only does IO and owns `open`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionMeta } from "@shared/data-protocol.js";
import type { DesktopSettings } from "@shared/protocol.js";
import type { SessionsView } from "../../skins/contract.js";
import type { ChatController } from "../chat/useChat.js";
import * as client from "../client.js";
import { sessionGroups, roleOfRow, type SessionListContext } from "./session-list.js";
import { todayKey } from "../today.js";
import type { CoursesResource } from "./use-courses.js";
import type { CycleResource } from "./use-cycle.js";

export interface SessionListController {
  /** The Shell's `sessions` view; `groups` also feeds the calendar's `daySessions`. */
  view: SessionsView;
  /** Open the list (the ⋯ menu's 「会话列表」 and the `/会话列表` command). */
  requestOpen(): void;
}

/** The summaries' load state, matching `SessionsView.status` (the error detail is not shown). */
type MetasState = { status: "loading" | "error" } | { status: "ready"; value: SessionMeta[] };

export function useSessionList(
  controller: ChatController,
  settings: DesktopSettings,
  setActiveCourse: (slug: string | null) => void,
  cycle: CycleResource,
  courses: CoursesResource,
  onNew: () => void,
): SessionListController {
  const [open, setOpen] = useState(false);
  const [metas, setMetas] = useState<MetasState>({ status: "loading" });
  const file = controller.sessionFile;

  // Fetch on the first run, whenever the session file changes, and whenever
  // the list opens. setState fires only from the promise/microtask, never
  // synchronously inside the effect (the project's lint rule).
  const fetched = useRef<{ file: string | null; open: boolean } | null>(null);
  useEffect(() => {
    const was = fetched.current;
    fetched.current = { file, open };
    if (was !== null && file === was.file && !(open && !was.open)) return;
    if (!file) {
      void Promise.resolve().then(() => setMetas({ status: "ready", value: [] }));
      return;
    }
    const run = { cancelled: false };
    void client.data({ kind: "sessions.list", current: file }).then((result) => {
      if (run.cancelled) return;
      setMetas(result.ok ? { status: "ready", value: result.data } : { status: "error" });
    });
    return () => {
      run.cancelled = true;
    };
  }, [file, open]);

  const groups = useMemo(() => {
    if (metas.status !== "ready") return [];
    const month = cycle.month.state.status === "ready" ? cycle.month.state.value : null;
    const titles =
      courses.state.status === "ready"
        ? Object.fromEntries(courses.state.value.map((course) => [course.slug, course.title]))
        : {};
    const ctx: SessionListContext = {
      current: file,
      today: todayKey(),
      tzOffsetMinutes: new Date().getTimezoneOffset(),
      controlFiles: Object.values(settings.controlSessions),
      courseSessions: settings.courseSessions,
      // The cycle's short names win; a course never in the cycle keeps its title.
      courseNames: { ...titles, ...(month?.names ?? {}) },
      lessons: month?.lessons ?? {},
    };
    return sessionGroups(metas.value, ctx);
  }, [metas, file, cycle.month.state, courses.state, settings.controlSessions, settings.courseSessions]);

  const onPick = useCallback(
    (picked: string) => {
      const row = groups.flatMap((group) => group.rows).find((item) => item.file === picked);
      controller.guardSwitch(() => {
        setActiveCourse(row?.slug ?? null);
        void controller.openSession(picked, roleOfRow(row));
      });
      setOpen(false);
    },
    [groups, controller, setActiveCourse],
  );

  const view = useMemo<SessionsView>(
    () => ({
      open,
      onOpenChange: setOpen,
      status: metas.status === "ready" ? "ready" : metas.status === "error" ? "error" : "loading",
      groups,
      onPick,
      onNew: () => {
        onNew();
        setOpen(false);
      },
    }),
    [open, metas.status, groups, onPick, onNew],
  );

  const requestOpen = useCallback(() => setOpen(true), []);
  return { view, requestOpen };
}
