/**
 * Session id rules for the agent process: stamping outgoing events and judging
 * whether an incoming request targets the active session.
 *
 * Kept out of `index.ts` (which starts a Pi session on import) so the two rules
 * are testable on their own, and next to each other because they are the two
 * sides of one contract: every posted event names its session, and a request
 * that names another session is dropped instead of being applied to this one.
 */

import type { AgentToHostEvent, AgentToHostMessage, HostToAgentMessage } from "../shared/protocol.js";

/** The text shown when a request names a session that is no longer active. */
export const STALE_REQUEST_ERROR = "这条请求属于另一个会话（可能刚切换过），已忽略；请在当前会话里重新操作。";

/** A request that acts on whichever session is active. */
type SessionScopedRequest = Extract<HostToAgentMessage, { type: "prompt" | "compact" | "abort" }>;

/**
 * Stamp an event with the session it came from (`null` when there is none yet).
 *
 * Every event the agent posts carries this, so the multi-process stage can route
 * by it; today the renderer only records it.
 */
export function withSessionId(event: AgentToHostEvent, sessionId: string | null): AgentToHostMessage {
  return { ...event, sessionId };
}

/** True for the three requests that must match the active session. */
export function isSessionScoped(message: HostToAgentMessage): message is SessionScopedRequest {
  return message.type === "prompt" || message.type === "compact" || message.type === "abort";
}

/**
 * True when a request names a session other than the active one.
 *
 * A request without a `sessionId` targets whatever is active and is never stale.
 */
export function isStaleRequest(message: HostToAgentMessage, activeId: string | null): boolean {
  if (!isSessionScoped(message)) return false;
  if (message.sessionId === undefined) return false;
  return message.sessionId !== activeId;
}
