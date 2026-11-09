/**
 * The three requests that act on the *active* session: prompt, compact, abort.
 *
 * Split from `index.ts` so the host file stays within its size limit, and so the
 * request path can be tested against a small structural session instead of Pi.
 * A failure is reported as a protocol `error` rather than thrown: the window
 * must show why nothing happened, and the agent must keep running.
 *
 * The stale-session check lives here rather than in the host switch: it guards
 * exactly these three requests, and keeping it on the same path as the calls it
 * protects is what makes "a stale request never reaches the session" testable.
 */

import type { AgentToHostEvent, ChatMessage } from "../shared/protocol.js";
import { STALE_REQUEST_ERROR, isStaleRequest } from "./session-request.js";

/** The parts of a Pi session these requests use. */
export interface TurnSession {
  readonly sessionId: string;
  readonly isStreaming: boolean;
  prompt(text: string, options?: { streamingBehavior?: "followUp" }): Promise<void>;
  compact(): Promise<unknown>;
  abort(): Promise<void>;
}

/** What the host lends to a turn: its session, transport, and transcript cache. */
export interface TurnDeps {
  session: TurnSession | null;
  post(event: AgentToHostEvent): void;
  nextId(prefix: string): string;
  /** Keep the renderer's replayed transcript in step with what was sent. */
  appendUserMessage(message: ChatMessage): void;
  emitState(): void;
}

/** The three requests that act on the active session. */
export type SessionRequest =
  | { type: "prompt"; text: string; sessionId?: string }
  | { type: "compact"; sessionId?: string }
  | { type: "abort"; sessionId?: string };

/**
 * Send a user prompt, streaming or as a follow-up when the session is busy.
 *
 * The user's words are posted before Pi echoes anything back, so the transcript
 * shows them while the answer is still being produced.
 */
async function runPromptTurn(deps: TurnDeps, text: string): Promise<void> {
  const session = deps.session;
  if (!session) throw new Error("会话尚未就绪");
  const message: ChatMessage = {
    id: deps.nextId("user"),
    role: "user",
    markdown: text,
    streaming: false,
    toolCalls: [],
  };
  deps.post({ type: "message-start", message });
  deps.post({ type: "message-end", message });
  deps.appendUserMessage(message);

  if (session.isStreaming) {
    await session.prompt(text, { streamingBehavior: "followUp" });
  } else {
    await session.prompt(text);
  }
  deps.emitState();
}

/**
 * Run one session-scoped request.
 *
 * A request aimed at another session is dropped with an error before anything
 * touches the active one; any failure is reported instead of thrown.
 */
export async function runSessionRequest(deps: TurnDeps, request: SessionRequest): Promise<void> {
  if (isStaleRequest(request, deps.session?.sessionId ?? null)) {
    deps.post({ type: "error", error: STALE_REQUEST_ERROR });
    return;
  }
  try {
    switch (request.type) {
      case "prompt":
        if (request.text.trim()) await runPromptTurn(deps, request.text);
        return;
      case "compact":
        await deps.session?.compact();
        return;
      case "abort":
        await deps.session?.abort();
        return;
    }
  } catch (error) {
    const label =
      request.type === "prompt" ? "发送失败" : request.type === "compact" ? "压缩失败" : "停止失败";
    deps.post({
      type: "error",
      error: `${label}：${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
