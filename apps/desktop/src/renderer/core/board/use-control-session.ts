/**
 * The 总控 session: one session per study cycle, not tied to any course.
 *
 * Opening it switches to the cycle's remembered session (or a fresh one) and,
 * the first time each day, asks `cycle-plan` for the daily brief. Whether the
 * open session *is* the 总控 session is derived from the session file, so it is
 * never out of sync with what the agent actually has open.
 */

import { useCallback } from "react";
import type { DesktopSettings } from "@shared/protocol.js";
import type { ChatController } from "../chat/useChat.js";
import { strings } from "../strings.js";
import { dateKey } from "./use-calendar.js";

export interface ControlSession {
  /** True while the open session is this cycle's 总控 session. */
  isControl: boolean;
  /** Open the 总控 session, or focus the composer when it is already open. Does nothing outside a cycle. */
  openControl(): void;
}

/** Whether `sessionFile` is the 总控 session of `cycleId`. */
export function isControlSession(
  settings: Pick<DesktopSettings, "controlSessions">,
  cycleId: string | null,
  sessionFile: string | null,
): boolean {
  return cycleId !== null && sessionFile !== null && settings.controlSessions[cycleId] === sessionFile;
}

export function useControlSession(
  controller: ChatController,
  settings: DesktopSettings,
  update: (patch: Partial<DesktopSettings>) => void,
  cycleId: string | null,
  setActiveCourse: (slug: string | null) => void,
  requestFocus: () => void,
): ControlSession {
  const isControl = isControlSession(settings, cycleId, controller.sessionFile);

  const openControl = useCallback(() => {
    if (cycleId === null) return;
    if (isControl) {
      requestFocus();
      return;
    }
    const known = settings.controlSessions[cycleId] ?? null;
    const today = dateKey(new Date());
    setActiveCourse(null);
    void controller.openSession(known).then((opened) => {
      const patch: Partial<DesktopSettings> = {};
      if (opened && opened !== known) patch.controlSessions = { ...settings.controlSessions, [cycleId]: opened };
      const briefDue = settings.controlBriefOn[cycleId] !== today;
      if (briefDue) patch.controlBriefOn = { ...settings.controlBriefOn, [cycleId]: today };
      if (Object.keys(patch).length > 0) update(patch);
      // A brief is an instruction, not a lesson: no style prefix.
      if (briefDue) controller.sendCommand(strings.control.briefPrompt);
    });
  }, [
    controller,
    cycleId,
    isControl,
    requestFocus,
    setActiveCourse,
    settings.controlBriefOn,
    settings.controlSessions,
    update,
  ]);

  return { isControl, openControl };
}
