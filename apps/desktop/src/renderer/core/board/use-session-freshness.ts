/**
 * Keeps a course session from running on stale context.
 *
 * - The open session is a course's session from an earlier day → a notice with
 *   「开今天的课 →」 (which starts today's lesson in a fresh session).
 * - The course page changed since this session's last answer, or nothing was
 *   seen yet in this app run (relaunch / update) → the next prompt carries
 *   `strings.chat.refreshNote` so 学根 re-reads the page and skills.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CourseSummary } from "@shared/data-protocol.js";
import type { DesktopSettings } from "@shared/protocol.js";
import type { ChatController } from "../chat/useChat.js";
import type { NoticeItem } from "../../skins/contract.js";
import * as client from "../client.js";
import { strings } from "../strings.js";
import { needsRefresh, staleCourseSession } from "./session-freshness.js";
import { dateKey } from "./use-calendar.js";
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
): SessionFreshness {
  const today = dateKey(new Date());
  const tz = new Date().getTimezoneOffset();
  const list = courses.state.status === "ready" ? courses.state.value : [];
  const course = activeCourse ? (list.find((item) => item.slug === activeCourse) ?? null) : null;

  // Last seen course-page time per session file, recorded when each answer
  // ends from a list fetched right then (not the board's shared reload, whose
  // timing could record a later change as already seen).
  const seen = useRef<Record<string, number>>({});
  const [seenVersion, setSeenVersion] = useState(0);
  const wasStreaming = useRef(controller.streaming);
  useEffect(() => {
    const ended = wasStreaming.current && !controller.streaming;
    wasStreaming.current = controller.streaming;
    if (!ended || !openSessionFile || !activeCourse) return;
    const file = openSessionFile;
    void client.data({ kind: "courses.list" }).then((result) => {
      if (!result.ok) return;
      seen.current[file] = result.data.find((item) => item.slug === activeCourse)?.changedAt ?? 0;
      setSeenVersion((value) => value + 1);
    });
  }, [controller.streaming, openSessionFile, activeCourse]);

  // The refresh note is decided in an effect: `seen.current` may not be read
  // during render, and it reruns when an answer's record lands (`seenVersion`) or the list reloads.
  useEffect(() => {
    const note = needsRefresh(
      openSessionFile,
      activeCourse,
      controller.messages.length,
      course?.changedAt,
      seen.current,
    )
      ? strings.chat.refreshNote
      : null;
    controller.setRefreshNote(note);
  }, [controller, seenVersion, openSessionFile, activeCourse, course, controller.messages.length, controller.streaming]);

  const [dismissed, setDismissed] = useState<string | null>(null);
  const stale = staleCourseSession(activeCourse, openSessionFile, settings.courseSessions, today, tz);
  const dismiss = useCallback(() => setDismissed(openSessionFile), [openSessionFile]);
  const notice: NoticeItem | null =
    stale && course && dismissed !== openSessionFile
      ? {
          tone: "info",
          text: strings.notice.staleSession(stale.day.slice(5), course.title),
          action: { label: strings.notice.staleSessionAction, run: () => onStudy(course) },
        }
      : null;
  return { notice, dismiss };
}
