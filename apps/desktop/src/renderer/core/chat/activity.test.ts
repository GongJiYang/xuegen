import { describe, expect, it } from "vitest";
import type { ChatMessage, ToolCallView } from "@shared/protocol.js";
import { activityOf, turnActivity } from "./activity.js";
import { strings } from "../strings.js";

function call(toolName: string, argsSummary: string, status: ToolCallView["status"]): ToolCallView {
  return { toolCallId: `${toolName}-${status}`, toolName, argsSummary, status };
}

function assistant(overrides: Partial<ChatMessage>): ChatMessage {
  return { id: "a1", role: "assistant", markdown: "", streaming: true, toolCalls: [], ...overrides };
}

describe("activityOf", () => {
  it("looks things up while a read-only tool runs", () => {
    const message = assistant({ toolCalls: [call("read", "wiki/courses/ctm.md", "running")] });
    expect(activityOf(message, true)).toEqual({ mood: "searching", label: strings.chat.activitySearching("wiki/courses/ctm.md") });
  });

  it("works while any other tool runs, clipping a long detail", () => {
    const long = "node skills/course/course-schedule.mjs plan wiki/courses/ctm.md --days tue,thu";
    const activity = activityOf(assistant({ toolCalls: [call("bash", long, "running")] }), false);
    expect(activity?.mood).toBe("working");
    expect(activity?.label.endsWith("…")).toBe(true);
    expect(activity?.label.startsWith(strings.chat.activityWorking("bash node"))).toBe(true);
  });

  it("shows the command or path from JSON arguments", () => {
    const message = assistant({ toolCalls: [call("bash", '{"command":"mkdir wiki/tmp"}', "running")] });
    expect(activityOf(message, false)?.label).toBe(strings.chat.activityWorking("bash mkdir wiki/tmp"));
    const read = assistant({ toolCalls: [call("read", '{"path":"wiki/subjects.md"}', "running")] });
    expect(activityOf(read, false)?.label).toBe(strings.chat.activitySearching("wiki/subjects.md"));
  });

  it("counts read-only shell commands as looking things up", () => {
    const message = assistant({ toolCalls: [call("bash", '{"command":"wc -l wiki/log.md"}', "running")] });
    expect(activityOf(message, false)?.mood).toBe("searching");
    const sed = assistant({ toolCalls: [call("bash", '{"command":"sed -i s/a/b/ x.md"}', "running")] });
    expect(activityOf(sed, false)?.mood).toBe("working");
  });

  it("thinks on an empty block, writes while text streams, and is idle when done", () => {
    expect(activityOf(assistant({}), true)).toEqual({ mood: "thinking", label: strings.chat.thinking });
    expect(activityOf(assistant({ markdown: "第一句" }), false)).toEqual({ mood: "writing", label: strings.chat.activityWriting });
    expect(activityOf(assistant({ markdown: "完了", streaming: false, toolCalls: [call("read", "x", "success")] }), false)).toBeNull();
  });

  it("is null for user messages", () => {
    expect(activityOf({ id: "u1", role: "user", markdown: "问题", streaming: false, toolCalls: [] }, true)).toBeNull();
  });
});

const USER_MESSAGE: ChatMessage = { id: "u1", role: "user", markdown: "问题", streaming: false, toolCalls: [] };
const RUNNING_TOOL_BLOCK = assistant({ toolCalls: [call("read", '{"path":"wiki/a.md"}', "running")] });
const STREAMING_TEXT_BLOCK = assistant({ markdown: "正在写的内容" });
const FINISHED_TOOL_BLOCK = assistant({
  markdown: "先查一下",
  streaming: false,
  toolCalls: [call("read", '{"path":"wiki/a.md"}', "success")],
});

describe("turnActivity", () => {
  it("is null when no answer is running", () => {
    expect(turnActivity([], false, false)).toBeNull();
  });
  it("shows 正在思考 right after sending, before any assistant block", () => {
    expect(turnActivity([USER_MESSAGE], true, false)?.mood).toBe("thinking");
  });
  it("follows the last block: a running tool, then writing", () => {
    expect(turnActivity([USER_MESSAGE, RUNNING_TOOL_BLOCK], true, false)?.mood).toBe("searching");
    expect(turnActivity([USER_MESSAGE, STREAMING_TEXT_BLOCK], true, false)?.mood).toBe("writing");
  });
  it("keeps 正在思考 in the gap after a tool finished, instead of disappearing", () => {
    expect(turnActivity([USER_MESSAGE, FINISHED_TOOL_BLOCK], true, false)).toEqual({ mood: "thinking", label: strings.chat.thinking });
  });
});
