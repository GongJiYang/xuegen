/**
 * Keeps a course session from running on stale context.
 *
 * - The open session is a course's session from an earlier day → a notice with
 *   「开今天的课 →」 (which starts today's lesson in a fresh session).
 * - The course page changed since this session's last answer, or nothing was
 *   seen yet in this app run (relaunch / update) → the next prompt carries
 *   `strings.chat.refreshNote` so 学根 re-reads the page and skills. The 总控
 *   session has no course page, so it carries `strings.chat.controlRefreshNote`
 *   until this app run has looked at it once.
 * - 上下文到 60%：提示先存档，存档答完后提示开新会话接着上
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CourseSummary } from "@shared/data-protocol.js";
import type { DesktopSettings } from "@shared/protocol.js";
import type { ChatController } from "../chat/useChat.js";
import type { NoticeItem } from "../../skins/contract.js";
import * as client from "../client.js";
import { strings } from "../strings.js";
import { withActionMarker } from "../chat/action-marker.js";
import { checkpointPhase, needsRefresh, staleCourseSession } from "./session-freshness.js";
import { todayKey } from "../today.js";
import type { CoursesResource } from "./use-courses.js";

export interface SessionFreshness {
  /** The 「这是 11-06 的…会话」 notice, or null. */
  notice: NoticeItem | null;
  /** Hide the notice for the open session. */
  dismiss(): void;
}

export function useSessionFreshness(
  controller: ChatController,
  courses: CoursesResource,
  activeCourse: string | null,
  openSessionFile: string | null,
  settings: DesktopSettings,
  onStudy: (course: CourseSummary) => void,
  onContinueFresh: (slug: string, text: string) => void,
  /** The open session is the cycle's 总控 session (no course page). */
  isControl: boolean,
): SessionFreshness {
  const today = todayKey();
  const tz = new Date().getTimezoneOffset();
  const list = courses.state.status === "ready" ? courses.state.value : [];
  const course = activeCourse ? (list.find((item) => item.slug === activeCourse) ?? null) : null;

  // Last seen course-page time per session file (0 for the 总控 session, which
  // has no page), recorded when each answer ends from a list fetched right then
  // (not the board's shared reload, whose timing could record a later change as
  // already seen).
  const seen = useRef<Record<string, number>>({});
  const [seenVersion, setSeenVersion] = useState(0);
  // The session file the 存档 prompt went to, and the one whose 存档 answer ended.
  const [sentFor, setSentFor] = useState<string | null>(null);
  const [doneFor, setDoneFor] = useState<string | null>(null);
  const wasStreaming = useRef(controller.streaming);
  useEffect(() => {
    const ended = wasStreaming.current && !controller.streaming;
    wasStreaming.current = controller.streaming;
    if (!ended || !openSessionFile || (!activeCourse && !isControl)) return;
    const file = openSessionFile;
    if (sentFor === file) {
      void Promise.resolve().then(() => setDoneFor(file));
    }
    if (isControl) {
      // No course page to compare: recording the file as seen is the whole job.
      seen.current[file] = 0;
      void Promise.resolve().then(() => setSeenVersion((value) => value + 1));
      return;
    }
    void client.data({ kind: "courses.list" }).then((result) => {
      if (!result.ok) return;
      seen.current[file] = result.data.find((item) => item.slug === activeCourse)?.changedAt ?? 0;
      setSeenVersion((value) => value + 1);
    });
  }, [controller.streaming, openSessionFile, activeCourse, isControl, sentFor]);

  // The refresh note is decided in an effect: `seen.current` may not be read
  // during render, and it reruns when an answer's record lands (`seenVersion`) or the list reloads.
  useEffect(() => {
    const note = needsRefresh(
      openSessionFile,
      activeCourse,
      isControl,
      controller.messages.length,
      course?.changedAt,
      seen.current,
    )
      ? isControl
        ? strings.chat.controlRefreshNote
        : strings.chat.refreshNote
      : null;
    controller.setRefreshNote(note);
  }, [controller, seenVersion, openSessionFile, activeCourse, isControl, course, controller.messages.length, controller.streaming]);

  const [dismissed, setDismissed] = useState<string | null>(null);
  const stale = staleCourseSession(activeCourse, openSessionFile, settings.courseSessions, today, tz);
  const percent = controller.contextUsage?.percent ?? null;
  const phase = checkpointPhase(activeCourse, openSessionFile, percent, sentFor, doneFor);
  const key = stale ? `stale:${openSessionFile}` : phase === "offer" || phase === "saved" ? `${phase}:${openSessionFile}` : null;
  const dismiss = useCallback(() => setDismissed(key), [key]);
  const notice: NoticeItem | null =
    stale && course && dismissed !== key
      ? {
          tone: "info",
          text: strings.notice.staleSession(stale.day.slice(5), course.title),
          action: { label: strings.notice.staleSessionAction, run: () => onStudy(course) },
        }
      : phase === "offer" && course && dismissed !== key
        ? {
            tone: "info",
            text: strings.notice.checkpoint(Math.round(percent ?? 0)),
            action: {
              label: strings.notice.checkpointAction,
              run: () => {
                controller.sendCommand(withActionMarker(strings.chat.checkpointPrompt, "checkpoint"));
                setSentFor(openSessionFile);
              },
            },
          }
        : phase === "saved" && course && dismissed !== key
          ? {
              tone: "info",
              text: strings.notice.checkpointSaved,
              action: {
                label: strings.notice.checkpointSavedAction,
                run: () =>
                  onContinueFresh(
                    course.slug,
                    withActionMarker(strings.chat.checkpointResume, "continue", { slug: course.slug, title: course.title }),
                  ),
              },
            }
          : null;
  return { notice, dismiss };
}
