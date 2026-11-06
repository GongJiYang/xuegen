/**
 * Pure mapping from Pi session events to renderer protocol messages.
 *
 * No I/O, no clock, no globals: the caller supplies an id generator and folds
 * the returned state. This keeps the tricky tool-attribution logic testable.
 *
 * Pi emits one assistant message's `message_end` before its tool executions run:
 *
 *   message_start(assistant) -> message_update(text_delta)* -> message_end(assistant)
 *   -> tool_execution_start/tool_execution_end -> message_start(next) -> …
 *
 * So a tool event belongs to the *most recent* assistant message, not the message
 * currently streaming. `lastAssistantMessageId` carries that across the gap that
 * `message_end` otherwise leaves behind.
 */

import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { AgentToHostMessage, ChatMessage, ModelInfo, ToolCallView } from "../shared/protocol.js";

/** Mutable state the mapper reads and advances. Kept in the shell and passed in. */
export interface EventMapperState {
  /** Id of the assistant message that owns the currently streaming text, if any. */
  currentAssistantId: string | null;
  /** Markdown accumulated for the streaming assistant message. */
  assistantMarkdown: string;
  /** Tool calls of the streaming message, in emission order. */
  toolCalls: ToolCallView[];
  /** Id of the most recently started assistant message; tool events attach here. */
  lastAssistantMessageId: string | null;
  /** Number of queued follow-up/steering messages. */
  queuedFollowUps: number;
}

/** Fresh mapper state. */
export function createEventMapperState(): EventMapperState {
  return {
    currentAssistantId: null,
    assistantMarkdown: "",
    toolCalls: [],
    lastAssistantMessageId: null,
    queuedFollowUps: 0,
  };
}

/** Generates stable message ids; injected so the mapper stays pure. */
export type IdFactory = (prefix: string) => string;

/** Result of mapping one event: the next state and the messages to post. */
export interface MappedEvent {
  state: EventMapperState;
  messages: AgentToHostMessage[];
  /** True when the event changed the session state snapshot (e.g. the queue). */
  stateChanged: boolean;
}

/** Summarize tool arguments into a single truncated line for the card header. */
export function summarizeArgs(args: unknown): string {
  if (args === null || args === undefined) return "";
  try {
    const text = typeof args === "string" ? args : JSON.stringify(args);
    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  } catch {
    return String(args);
  }
}

/** Extract the concatenated text of a message content value, whatever its shape. */
export function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        typeof part === "object" && part !== null && (part as { type?: string }).type === "text",
    )
    .map((part) => part.text)
    .join("");
}

/** Convert a Pi model value into the protocol's `ModelInfo`, or null. */
export function toModelInfo(model: unknown): ModelInfo | null {
  const candidate = model as { provider?: string; id?: string; name?: string } | undefined;
  if (!candidate || typeof candidate.provider !== "string" || typeof candidate.id !== "string") return null;
  return { provider: candidate.provider, id: candidate.id, name: candidate.name ?? candidate.id };
}

function updateToolCall(toolCalls: ToolCallView[], call: ToolCallView): ToolCallView[] {
  const index = toolCalls.findIndex((entry) => entry.toolCallId === call.toolCallId);
  if (index === -1) return [...toolCalls, call];
  const next = [...toolCalls];
  next[index] = call;
  return next;
}

function resultTextOf(result: unknown): string {
  const content = (result as { content?: unknown } | undefined)?.content;
  const text = textFromContent(content);
  if (text) return text;
  try {
    return JSON.stringify(result ?? null).slice(0, 2000);
  } catch {
    return String(result);
  }
}

/**
 * Map one Pi session event into protocol messages, advancing the given state.
 *
 * The returned state must replace the input state; the returned messages are the
 * ones the process should post, in order.
 */
export function mapPiEvent(
  state: EventMapperState,
  event: AgentSessionEvent,
  nextId: IdFactory,
): MappedEvent {
  const messages: AgentToHostMessage[] = [];
  let next = state;
  let stateChanged = false;

  switch (event.type) {
    case "message_start": {
      if (event.message.role !== "assistant") break;
      const id = nextId("assistant");
      next = {
        ...next,
        currentAssistantId: id,
        assistantMarkdown: "",
        toolCalls: [],
        lastAssistantMessageId: id,
      };
      messages.push({
        type: "message-start",
        message: { id, role: "assistant", markdown: "", streaming: true, toolCalls: [] },
      });
      break;
    }
    case "message_update": {
      const update = event.assistantMessageEvent;
      const assistantId = next.currentAssistantId;
      if (update.type !== "text_delta" || !update.delta || !assistantId) break;
      next = { ...next, assistantMarkdown: next.assistantMarkdown + update.delta };
      messages.push({ type: "message-delta", messageId: assistantId, text: update.delta });
      break;
    }
    case "message_end": {
      // Only the authoritative end of the streaming message finalizes it; user
      // and system message ends, and a second end for an already-cleared id,
      // are ignored.
      if (event.message.role !== "assistant" || !next.currentAssistantId) break;
      const message = event.message;
      const id = next.currentAssistantId;
      const authoritative = textFromContent(message.content) || next.assistantMarkdown;
      const errorMessage =
        message.stopReason === "error" || message.stopReason === "aborted"
          ? (message.errorMessage ?? (message.stopReason === "aborted" ? "已中止" : "模型返回错误"))
          : undefined;
      const finalMessage: ChatMessage = {
        id,
        role: "assistant",
        markdown: authoritative,
        streaming: false,
        toolCalls: next.toolCalls,
      };
      if (errorMessage) finalMessage.errorMessage = errorMessage;
      messages.push({ type: "message-end", message: finalMessage });
      // A stop is not an error: the message keeps its `errorMessage` ("已中止"),
      // which the renderer shows as guidance, but it must not raise a session-level
      // error notice (that would flash an alert for a deliberate user action).
      if (errorMessage && message.stopReason !== "aborted") {
        messages.push({ type: "error", error: errorMessage });
      }
      next = { ...next, currentAssistantId: null, assistantMarkdown: "", toolCalls: [] };
      break;
    }
    case "tool_execution_start": {
      // Attribute to the most recent assistant message: Pi runs tools after that
      // message's `message_end`, once `currentAssistantId` is already cleared.
      const targetId = next.lastAssistantMessageId;
      if (!targetId) break;
      const call: ToolCallView = {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        argsSummary: summarizeArgs(event.args),
        status: "running",
      };
      next = { ...next, toolCalls: updateToolCall(next.toolCalls, call) };
      messages.push({ type: "tool-call", messageId: targetId, call });
      break;
    }
    case "tool_execution_end": {
      const targetId = next.lastAssistantMessageId;
      if (!targetId) break;
      const existing = next.toolCalls.find((entry) => entry.toolCallId === event.toolCallId);
      const call: ToolCallView = {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        argsSummary: existing?.argsSummary ?? "",
        status: event.isError ? "error" : "success",
        resultText: resultTextOf(event.result),
      };
      next = { ...next, toolCalls: updateToolCall(next.toolCalls, call) };
      messages.push({ type: "tool-call", messageId: targetId, call });
      break;
    }
    case "queue_update": {
      next = { ...next, queuedFollowUps: event.steering.length + event.followUp.length };
      stateChanged = true;
      break;
    }
    case "compaction_start": {
      messages.push({ type: "compaction", phase: "start", reason: event.reason });
      stateChanged = true;
      break;
    }
    case "compaction_end": {
      const payload: AgentToHostMessage = event.errorMessage
        ? {
            type: "compaction",
            phase: "end",
            reason: event.reason,
            aborted: event.aborted,
            errorMessage: event.errorMessage,
          }
        : { type: "compaction", phase: "end", reason: event.reason, aborted: event.aborted };
      messages.push(payload);
      stateChanged = true;
      break;
    }
    case "session_info_changed":
    case "entry_appended":
    case "agent_start":
    case "agent_end":
    case "agent_settled":
      stateChanged = true;
      break;
    default:
      break;
  }

  return { state: next, messages, stateChanged };
}
