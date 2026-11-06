/**
 * Turns: which assistant messages form one answer, and which of them open or
 * close that answer, so skins can fold a whole turn's tool rows into one line.
 */

import { describe, expect, it } from "vitest";
import type { ChatMessage, ToolCallView } from "@shared/protocol.js";
import { assistantTurns } from "./turns.js";

function msg(id: string, role: ChatMessage["role"], tools: number): ChatMessage {
  const toolCalls: ToolCallView[] = Array.from({ length: tools }, (_, i) => ({
    toolCallId: `${id}-${i}`,
    toolName: "bash",
    argsSummary: "",
    status: "success",
  }));
  return { id, role, markdown: "", streaming: false, toolCalls };
}

describe("assistantTurns", () => {
  it("groups consecutive assistant messages into one turn", () => {
    const messages = [
      msg("u1", "user", 0),
      msg("a1", "assistant", 2),
      msg("a2", "assistant", 0),
      msg("a3", "assistant", 1),
    ];
    const turns = assistantTurns(messages);

    expect(turns[0]).toBeNull();
    for (const index of [1, 2, 3]) {
      expect(turns[index]?.key).toBe("a1");
      expect(turns[index]?.toolCount).toBe(3);
    }
    expect(turns[1]?.first).toBe(true);
    expect(turns[2]?.first).toBe(false);
    expect(turns[3]?.first).toBe(false);
    expect(turns[1]?.last).toBe(false);
    expect(turns[2]?.last).toBe(false);
    expect(turns[3]?.last).toBe(true);
  });

  it("starts a new turn after each user message", () => {
    const messages = [
      msg("u1", "user", 0),
      msg("a1", "assistant", 1),
      msg("u2", "user", 0),
      msg("a2", "assistant", 0),
    ];
    const turns = assistantTurns(messages);

    expect(turns[1]?.key).toBe("a1");
    expect(turns[3]?.key).toBe("a2");
    expect(turns[1]?.first).toBe(true);
    expect(turns[1]?.last).toBe(true);
    expect(turns[1]?.toolCount).toBe(1);
    expect(turns[3]?.first).toBe(true);
    expect(turns[3]?.last).toBe(true);
    expect(turns[3]?.toolCount).toBe(0);
  });

  it("handles an empty transcript", () => {
    expect(assistantTurns([])).toEqual([]);
  });
});
