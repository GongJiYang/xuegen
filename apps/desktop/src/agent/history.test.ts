import { describe, expect, it } from "vitest";
import { historyFromEntries, historyFromMessages, withQueued } from "./history.js";
import type { ChatMessage } from "../shared/protocol.js";

describe("historyFromMessages", () => {
  it("keeps user and assistant text and drops everything else", () => {
    const messages = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "question" },
      { role: "assistant", content: [{ type: "text", text: "answer" }] },
      { role: "toolResult", toolCallId: "x", content: [{ type: "text", text: "result" }] },
    ];
    const history = historyFromMessages(messages, "session");
    expect(history.map((entry) => entry.role)).toEqual(["user", "assistant"]);
    expect(history[1]?.markdown).toBe("answer");
    expect(history.every((entry) => entry.streaming === false)).toBe(true);
    expect(history.every((entry) => entry.toolCalls.length === 0)).toBe(true);
  });

  it("assigns distinct ids that include the prefix and index", () => {
    const history = historyFromMessages(
      [
        { role: "user", content: "a" },
        { role: "user", content: "b" },
      ],
      "pre",
    );
    expect(history[0]?.id).toBe("pre-history-0");
    expect(history[1]?.id).toBe("pre-history-1");
  });

  it("skips messages with no extractable text", () => {
    const history = historyFromMessages(
      [
        { role: "assistant", content: [] },
        { role: "user", content: "" },
      ],
      "pre",
    );
    expect(history).toHaveLength(0);
  });

  it("handles malformed entries without throwing", () => {
    expect(historyFromMessages([null, undefined, 42, { role: "user" }], "pre")).toHaveLength(0);
  });
});

describe("historyFromEntries", () => {
  const entries = [
    { type: "session" },
    { type: "message", message: { role: "user", content: "q1" } },
    { type: "message", message: { role: "assistant", content: [{ type: "text", text: "a1" }] } },
    { type: "compaction", summary: "…", firstKeptEntryId: "x" },
    { type: "message", message: { role: "user", content: "q2" } },
    { type: "message", message: { role: "toolResult", content: "tool" } },
    null,
  ];

  it("keeps the original messages visible after a compaction", () => {
    const { messages } = historyFromEntries(entries, "s");
    expect(messages.map((message) => message.markdown)).toEqual(["q1", "a1", "q2"]);
  });

  it("puts a compaction note where the compaction entry was recorded", () => {
    const { notes } = historyFromEntries(entries, "s");
    expect(notes).toEqual([{ beforeIndex: 2, kind: "compaction" }]);
  });

  it("carries the entry's timestamp into the restored message's `at`", () => {
    const { messages } = historyFromEntries(
      [
        { type: "message", timestamp: "2026-11-05T09:12:00.000Z", message: { role: "user", content: "q" } },
        { type: "message", message: { role: "assistant", content: [{ type: "text", text: "a" }] } },
      ],
      "s",
    );
    expect(messages[0]?.at).toBe("2026-11-05T09:12:00.000Z");
    expect(messages[1]?.at).toBeUndefined();
  });
});

describe("historyFromMessages automatic retry", () => {
  const failed = { role: "assistant", stopReason: "error", errorMessage: "terminated", content: [] };
  const answered = { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "answer" }] };

  it("marks a failure that a later answer recovered from", () => {
    const history = historyFromMessages(
      [{ role: "user", content: "q" }, failed, answered],
      "pre",
    );

    expect(history[1]?.retry).toBe("recovered");
    expect(history[1]?.errorMessage).toBe("terminated");
    expect(history[2]?.retry).toBeUndefined();
  });

  it("does not mark a failure followed directly by a new user question", () => {
    const history = historyFromMessages(
      [{ role: "user", content: "q" }, failed, { role: "user", content: "q again" }, answered],
      "pre",
    );

    expect(history[1]?.retry).toBeUndefined();
  });

  it("does not mark a failure answered by another failure", () => {
    const history = historyFromMessages([{ role: "user", content: "q" }, failed, failed], "pre");

    expect(history[1]?.retry).toBeUndefined();
  });

  it("does not mark a user stop (aborted is not a failure)", () => {
    const history = historyFromMessages(
      [
        { role: "user", content: "q" },
        { role: "assistant", stopReason: "aborted", errorMessage: "Operation aborted", content: [{ type: "text", text: "部分" }] },
        answered,
      ],
      "pre",
    );

    expect(history[1]?.retry).toBeUndefined();
  });

  it("still shows nothing for a failure that no retry recovered from", () => {
    const history = historyFromMessages([{ role: "user", content: "q" }, failed], "pre");

    // Same as before the retry fix: an unanswered failure leaves no block behind,
    // and `hasAnswer()` keeps treating the course's opening as unanswered.
    expect(history.map((entry) => entry.role)).toEqual(["user"]);
  });

  it("keeps a failed attempt that carried text, without an error marker", () => {
    const history = historyFromMessages(
      [
        { role: "user", content: "q" },
        { role: "assistant", stopReason: "error", errorMessage: "terminated", content: [{ type: "text", text: "部分" }] },
      ],
      "pre",
    );

    expect(history[1]?.markdown).toBe("部分");
    expect(history[1]?.errorMessage).toBeUndefined();
    expect(history[1]?.retry).toBeUndefined();
  });
});

describe("historyFromEntries automatic retry", () => {
  const failed = { role: "assistant", stopReason: "error", errorMessage: "terminated", content: [] };
  const answered = { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "answer" }] };

  it("marks a failed entry that the next answer recovered from", () => {
    const { messages } = historyFromEntries(
      [
        { type: "message", message: { role: "user", content: "q" } },
        { type: "message", message: failed },
        { type: "message", message: answered },
      ],
      "s",
    );

    expect(messages.map((message) => message.retry)).toEqual([undefined, "recovered", undefined]);
  });

  it("does not mark a failed entry followed by a new user question", () => {
    const { messages } = historyFromEntries(
      [
        { type: "message", message: { role: "user", content: "q" } },
        { type: "message", message: failed },
        { type: "message", message: { role: "user", content: "q again" } },
        { type: "message", message: answered },
      ],
      "s",
    );

    // The unanswered failure itself is not shown (no text), the answer after the
    // new question is: three messages, no retry marker anywhere.
    expect(messages.map((message) => message.markdown)).toEqual(["q", "q again", "answer"]);
    expect(messages.map((message) => message.retry)).toEqual([undefined, undefined, undefined]);
  });
});

describe("withQueued", () => {
  /** Deterministic id factory, so the assertions never depend on time. */
  function idFactory(): (prefix: string) => string {
    let counter = 0;
    return (prefix) => {
      counter += 1;
      return `${prefix}-q${counter}`;
    };
  }

  const answered: ChatMessage = {
    id: "session-history-2",
    role: "assistant",
    markdown: "答甲",
    streaming: false,
    toolCalls: [],
  };
  const history = {
    messages: [
      { id: "session-history-0", role: "user", markdown: "甲", streaming: false, toolCalls: [] } as ChatMessage,
      answered,
    ],
    notes: [{ beforeIndex: 0, kind: "compaction" as const }],
  };

  it("appends a message for a prompt that is still queued in Pi", () => {
    const rebuilt = withQueued(history, ["乙"], idFactory());

    expect(rebuilt.messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(rebuilt.messages.at(-1)).toEqual({
      id: "user-q1",
      role: "user",
      markdown: "乙",
      streaming: false,
      toolCalls: [],
    });
    // The restored messages and the notes are untouched.
    expect(rebuilt.messages.slice(0, 2)).toEqual(history.messages);
    expect(rebuilt.notes).toEqual(history.notes);
  });

  it("returns the transcript unchanged when nothing is queued", () => {
    const rebuilt = withQueued(history, [], idFactory());

    expect(rebuilt.messages).toEqual(history.messages);
    expect(rebuilt.notes).toEqual(history.notes);
  });

  it("appends two queued prompts in order", () => {
    const rebuilt = withQueued(history, ["乙", "丙"], idFactory());

    expect(rebuilt.messages.map((message) => message.markdown)).toEqual(["甲", "答甲", "乙", "丙"]);
    expect(rebuilt.messages.slice(2).map((message) => message.id)).toEqual(["user-q1", "user-q2"]);
  });
});
