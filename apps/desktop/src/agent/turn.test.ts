/**
 * Session-scoped request handling.
 *
 * The turn module talks to a structural session (`TurnSession`) rather than the
 * real Pi `AgentSession`, so a stale request can be shown to touch nothing.
 */

import { describe, expect, it, vi } from "vitest";
import type { AgentToHostMessage, ChatMessage } from "../shared/protocol.js";
import { STALE_REQUEST_ERROR, withSessionId } from "./session-request.js";
import { runSessionRequest, type TurnDeps, type TurnSession } from "./turn.js";

interface Harness {
  deps: TurnDeps;
  posted: AgentToHostMessage[];
  appended: ChatMessage[];
  session: TurnSession & {
    prompt: ReturnType<typeof vi.fn>;
    compact: ReturnType<typeof vi.fn>;
    abort: ReturnType<typeof vi.fn>;
  };
  emitted: () => number;
}

function harness(options: { sessionId?: string | null; isStreaming?: boolean } = {}): Harness {
  const sessionId = options.sessionId === undefined ? "S1" : options.sessionId;
  const session = {
    sessionId: sessionId ?? "",
    isStreaming: options.isStreaming ?? false,
    prompt: vi.fn(async () => undefined),
    compact: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
  };
  const posted: AgentToHostMessage[] = [];
  const appended: ChatMessage[] = [];
  let emissions = 0;
  const deps: TurnDeps = {
    session: sessionId === null ? null : session,
    // The host stamps every event with the session it belongs to; mirror that
    // here so the messages this test inspects are shaped like the real ones.
    post: (event) => posted.push(withSessionId(event, sessionId)),
    nextId: (prefix) => `${prefix}-1`,
    appendUserMessage: (message) => appended.push(message),
    emitState: () => {
      emissions += 1;
    },
  };
  return { deps, posted, appended, session, emitted: () => emissions };
}

describe("runSessionRequest: stale session ids", () => {
  it("drops a prompt naming another session, without touching the active one", async () => {
    const h = harness();
    await runSessionRequest(h.deps, { type: "prompt", text: "你好", sessionId: "S2" });
    expect(h.session.prompt).not.toHaveBeenCalled();
    expect(h.appended).toEqual([]);
    expect(h.posted).toEqual([{ type: "error", error: STALE_REQUEST_ERROR, sessionId: "S1" }]);
  });

  it("drops a compact naming another session", async () => {
    const h = harness();
    await runSessionRequest(h.deps, { type: "compact", sessionId: "S2" });
    expect(h.session.compact).not.toHaveBeenCalled();
    expect(h.posted).toHaveLength(1);
    expect(h.posted[0]).toMatchObject({ type: "error", error: STALE_REQUEST_ERROR });
  });

  it("drops an abort naming another session", async () => {
    const h = harness();
    await runSessionRequest(h.deps, { type: "abort", sessionId: "S2" });
    expect(h.session.abort).not.toHaveBeenCalled();
    expect(h.posted[0]).toMatchObject({ type: "error", error: STALE_REQUEST_ERROR });
  });

  it("drops a request carrying an id when no session is active at all", async () => {
    const h = harness({ sessionId: null });
    await runSessionRequest(h.deps, { type: "prompt", text: "你好", sessionId: "S1" });
    expect(h.posted).toEqual([{ type: "error", error: STALE_REQUEST_ERROR, sessionId: null }]);
    expect(h.session.prompt).not.toHaveBeenCalled();
  });
});

describe("runSessionRequest: current or unaddressed requests", () => {
  it("runs a prompt that names the active session", async () => {
    const h = harness();
    await runSessionRequest(h.deps, { type: "prompt", text: "你好", sessionId: "S1" });
    expect(h.session.prompt).toHaveBeenCalledWith("你好");
    expect(h.session.prompt).toHaveBeenCalledTimes(1);
    expect(h.posted.some((message) => message.type === "error")).toBe(false);
  });

  it("runs a prompt that carries no session id", async () => {
    const h = harness();
    await runSessionRequest(h.deps, { type: "prompt", text: "你好" });
    expect(h.session.prompt).toHaveBeenCalledWith("你好");
  });

  it("runs compact and abort that carry no session id", async () => {
    const h = harness();
    await runSessionRequest(h.deps, { type: "compact" });
    await runSessionRequest(h.deps, { type: "abort" });
    expect(h.session.compact).toHaveBeenCalledTimes(1);
    expect(h.session.abort).toHaveBeenCalledTimes(1);
  });

  it("sends a follow-up prompt while the session is busy", async () => {
    const h = harness({ isStreaming: true });
    await runSessionRequest(h.deps, { type: "prompt", text: "接着讲", sessionId: "S1" });
    expect(h.session.prompt).toHaveBeenCalledWith("接着讲", { streamingBehavior: "followUp" });
  });

  it("ignores blank text instead of starting an empty turn", async () => {
    const h = harness();
    await runSessionRequest(h.deps, { type: "prompt", text: "   " });
    expect(h.session.prompt).not.toHaveBeenCalled();
    expect(h.posted).toEqual([]);
  });
});

describe("runSessionRequest: what the transcript sees", () => {
  it("posts the user's message before prompting, and refreshes state after", async () => {
    const h = harness();
    await runSessionRequest(h.deps, { type: "prompt", text: "你好" });
    expect(h.posted.map((message) => message.type)).toEqual(["message-start", "message-end"]);
    expect(h.appended).toHaveLength(1);
    expect(h.appended[0]).toMatchObject({ id: "user-1", role: "user", markdown: "你好" });
    expect(h.emitted()).toBe(1);
  });

  it("stamps every posted message with the session id", async () => {
    const h = harness();
    await runSessionRequest(h.deps, { type: "prompt", text: "你好" });
    await runSessionRequest(h.deps, { type: "compact" });
    for (const message of h.posted) expect(message.sessionId).toBe("S1");
  });

  it("reports a failed prompt as an error naming what failed, and keeps the session alive", async () => {
    const h = harness();
    h.session.prompt.mockRejectedValueOnce(new Error("模型不可用"));
    await runSessionRequest(h.deps, { type: "prompt", text: "你好" });
    expect(h.posted.at(-1)).toMatchObject({
      type: "error",
      error: "发送失败：模型不可用",
    });
  });

  it("reports failed compaction and failed aborts with their own labels", async () => {
    const h = harness();
    h.session.compact.mockRejectedValueOnce(new Error("压缩炸了"));
    h.session.abort.mockRejectedValueOnce(new Error("停止炸了"));
    await runSessionRequest(h.deps, { type: "compact" });
    await runSessionRequest(h.deps, { type: "abort" });
    const errors = h.posted.flatMap((message) => (message.type === "error" ? [message.error] : []));
    expect(errors[0]).toContain("压缩失败：压缩炸了");
    expect(errors[1]).toContain("停止失败：停止炸了");
  });

  it("posts nothing for compact or abort when no session exists", async () => {
    const h = harness({ sessionId: null });
    await runSessionRequest(h.deps, { type: "compact" });
    await runSessionRequest(h.deps, { type: "abort" });
    expect(h.posted).toEqual([]);
  });

  it("reports a prompt sent with no session as an error rather than throwing", async () => {
    const h = harness({ sessionId: null });
    await runSessionRequest(h.deps, { type: "prompt", text: "你好" });
    expect(h.posted).toEqual([{ type: "error", error: "发送失败：会话尚未就绪", sessionId: null }]);
  });
});
