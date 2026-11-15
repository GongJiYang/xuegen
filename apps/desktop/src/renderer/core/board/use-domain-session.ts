/**
 * The 领域 tab's session wiring (user 11-15, `domain.html` ①): which subject the
 * open transcript belongs to, the subject list 「换科目」 offers, and opening (or
 * reopening today's) 领域 session for a subject.
 *
 * The glossary itself lives in `use-domain.ts`; this hook only knows sessions.
 */

import { useCallback, useMemo } from "react";
import type { DomainSubject } from "@shared/data-protocol.js";
import type { SessionRole } from "@shared/protocol.js";
import type { ChatController } from "../chat/useChat.js";
import * as client from "../client.js";
import { todayKey } from "../today.js";
import { domainOf, domainOpenMessage } from "./domain.js";
import type { SessionGroup } from "./session-list.js";
import { useBoardResource, type LoadResult } from "./use-resource.js";

/** A subject-list request that a disabled hook never sends. */
const NEVER = new Promise<LoadResult<DomainSubject[]>>(() => {});

export interface DomainSession {
  /** The open session's subject when it is a 领域 session, else null. */
  current: { subject: string; title: string } | null;
  /** All subjects (`domain.subjects`), null while loading or when `enabled` is false; [] on error. */
  subjects: DomainSubject[] | null;
  /** Open (or reopen today's) 领域 session for a subject. */
  open(subject: string, title: string): void;
}

export interface DomainSessionInput {
  /** Supplies `messages`, `guardSwitch`, `openSession`, `sendCommand`. */
  controller: ChatController;
  /** `sessionList.view.groups` — today's row is the first group when it is today. */
  sessionGroups: SessionGroup[];
  setActiveCourse(slug: string | null): void;
  /** Load `domain.subjects` only when something shows them (总控 panel or a 领域 page). */
  enabled: boolean;
}

/**
 * Today's 领域 row for `subject`, or null.
 *
 * Only the first group counts, and only when its date is today: a subject asked
 * yesterday keeps its own 领域 session in yesterday's list, and jumping back
 * into it would resume a stale conversation instead of asking again.
 */
function todayRow(groups: SessionGroup[], subject: string): string | null {
  const first = groups[0];
  if (first === undefined || first.date !== todayKey()) return null;
  const found = first.rows.find((row) => row.kind === "domain" && row.slug === subject);
  return found?.file ?? null;
}

export function useDomainSession(input: DomainSessionInput): DomainSession {
  const { controller, sessionGroups, setActiveCourse, enabled } = input;
  const current = useMemo(() => domainOf(controller.messages), [controller.messages]);
  const resource = useBoardResource(
    () => (enabled ? client.data({ kind: "domain.subjects" }) : NEVER),
    [enabled],
  );
  const subjects: DomainSubject[] | null =
    resource.state.status === "error" ? [] : resource.state.status === "ready" ? resource.state.value : null;

  const open = useCallback(
    (subject: string, title: string) => {
      const role: SessionRole = { kind: "domain", subject };
      const file = todayRow(sessionGroups, subject);
      controller.guardSwitch(() => {
        // A 领域 session is not a course: no course page owns the left column.
        setActiveCourse(null);
        if (file !== null) {
          void controller.openSession(file, role);
          return;
        }
        // Nothing from today: a fresh session, then the instruction that opens
        // the 领域 (the marker on it is what `domainOf` reads back).
        void controller.openSession(null, role).then((opened) => {
          if (opened !== null) controller.sendCommand(domainOpenMessage(subject, title));
        });
      });
    },
    [controller, sessionGroups, setActiveCourse],
  );

  return { current, subjects, open };
}
