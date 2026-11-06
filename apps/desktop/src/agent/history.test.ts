import { describe, expect, it } from "vitest";
import { historyFromEntries, historyFromMessages } from "./history.js";

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
});
