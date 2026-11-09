/**
 * The session snapshot the renderer sees.
 *
 * Pure: the shell passes in the active Pi session (or null before one exists)
 * plus the state it tracks itself, so the shape can be tested without a Pi
 * session. `sessionId` is here so every later message can be routed to the
 * session it belongs to (stage 2 of docs/platform/ROUTE-1109.md).
 */

import type { SessionRole, SessionStatePayload } from "../shared/protocol.js";
import { toModelInfo } from "./event-mapper.js";

/** The parts of a Pi session a snapshot reads. */
export interface SnapshotSession {
  readonly sessionId: string;
  readonly sessionFile: string | undefined;
  readonly model: unknown;
  readonly isStreaming: boolean;
  supportsThinking(): boolean;
  readonly thinkingLevel: string;
  getAvailableThinkingLevels(): string[];
}

/** Everything a snapshot needs: the session, if any, plus the shell's own state. */
export interface SnapshotInput {
  session: SnapshotSession | null;
  cwd: string;
  role: SessionRole;
  queuedFollowUps: number;
}

/** Build the session state payload. */
export function sessionState(input: SnapshotInput): SessionStatePayload {
  const { session, cwd, role, queuedFollowUps } = input;
  // A model without thinking support has no level to show; the menu disables it.
  const thinking = session !== null && session.supportsThinking();
  return {
    cwd,
    model: session ? toModelInfo(session.model) : null,
    sessionFile: session?.sessionFile ?? null,
    sessionId: session?.sessionId ?? null,
    role,
    streaming: session?.isStreaming ?? false,
    queuedFollowUps,
    thinkingLevel: thinking && session ? session.thinkingLevel : null,
    thinkingLevels: thinking && session ? session.getAvailableThinkingLevels() : [],
  };
}
