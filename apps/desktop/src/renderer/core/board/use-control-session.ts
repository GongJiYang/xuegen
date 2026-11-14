/**
 * The 总控 session: one session per study cycle, not tied to any course.
 *
 * Opening it switches to the cycle's remembered session (or a fresh one). On
 * the first `ready` of a run the app lands there on its own — without sending
 * anything; the daily brief only goes out when the learner clicks 「让总控说说」
 * (askBrief), folded as 「今日简报」 in the transcript. Whether the open session
 * *is* the 总控 session is derived from the session file, so it is never out of
 * sync with what the agent actually has open.
 */

import { useCallback, useEffect, useRef } from "react";
import type { DesktopSettings } from "@shared/protocol.js";
import type { ChatController } from "../chat/useChat.js";
import { strings } from "../strings.js";
import { withActionMarker } from "../chat/action-marker.js";

export interface ControlSession {
  /** True while the open session is this cycle's 总控 session. */
  isControl: boolean;
  /** Open the 总控 session, or focus the composer when it is already open. Does nothing outside a cycle. */
  openControl(): void;
  /** 「让总控说说」: send the daily-brief prompt, folded as 「今日简报」. */
  askBrief(): void;
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
  /** The agent can open a session (ready, not disabled). */
  ready: boolean,
): ControlSession {
  const isControl = isControlSession(settings, cycleId, controller.sessionFile);

  const openControl = useCallback(() => {
    if (cycleId === null) return;
    if (isControl) {
      requestFocus();
      return;
    }
    const known = settings.controlSessions[cycleId] ?? null;
    controller.guardSwitch(() => {
      setActiveCourse(null);
      void controller.openSession(known, { kind: "control" }).then((opened) => {
        if (opened && opened !== known)
          update({ controlSessions: { ...settings.controlSessions, [cycleId]: opened } });
      });
    });
  }, [controller, cycleId, isControl, requestFocus, setActiveCourse, settings.controlSessions, update]);

  const askBrief = useCallback(() => {
    if (cycleId === null) return;
    // A brief is an instruction, not a lesson: sendCommand, folded as 「今日简报」.
    const send = (): void => controller.sendCommand(withActionMarker(strings.control.briefPrompt, "brief"));
    if (isControl) {
      send();
      return;
    }
    // Not in the 总控 session: switch over first, then send — the same
    // openSession().then(...) shape as openControl, behind the same guard.
    const known = settings.controlSessions[cycleId] ?? null;
    controller.guardSwitch(() => {
      setActiveCourse(null);
      void controller.openSession(known, { kind: "control" }).then((opened) => {
        if (!opened) return;
        if (opened !== known) update({ controlSessions: { ...settings.controlSessions, [cycleId]: opened } });
        send();
      });
    });
  }, [controller, cycleId, isControl, setActiveCourse, settings.controlSessions, update]);

  // Land on this cycle's 总控 session the first time the agent is ready — once
  // per run. What is on screen at that moment never counts as a choice: startup
  // restores the most recent session file, course session or not, and the agent
  // is ready before the learner can click anything.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || !ready || cycleId === null || controller.streaming) return;
    autoOpened.current = true;
    // A microtask so the effect itself performs no synchronous setState.
    void Promise.resolve().then(openControl);
  }, [ready, cycleId, controller.streaming, openControl]);

  return { isControl, openControl, askBrief };
}
