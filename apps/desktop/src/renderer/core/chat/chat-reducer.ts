/**
 * Pure chat state reducer.
 *
 * Owns every transition of the renderer's chat state so it can be unit-tested
 * without React or the preload bridge. `useChat` wires it to `useReducer`. The
 * reducer knows nothing about skins, motion, or the DOM.
 */

import type {
  AgentStatus,
  AgentToHostMessage,
  ChatMessage,
  CommandInfo,
  ModelInfo,
  ModelListPayload,
  SessionStatePayload,
  ToolCallView,
} from "@shared/protocol.js";
import { assertNever } from "@shared/protocol.js";

export interface ChatState {
  messages: ChatMessage[];
  models: ModelInfo[];
  modelsReason: string | null;
  session: SessionStatePayload | null;
  /** Lifecycle of the agent process, shown when it is not `ready`. */
  agentStatus: AgentStatus;
  /** Errors the user should see: model errors, agent crashes, missing login. */
  errors: string[];
  ready: boolean;
  /** Skills the agent offers as `/skill:<name>` commands (already enabled-only). */
  commands: CommandInfo[];
}

export const initialChatState: ChatState = {
  messages: [],
  models: [],
  modelsReason: null,
  session: null,
  agentStatus: "starting",
  errors: [],
  ready: false,
  commands: [],
};

/** Events the reducer accepts: agent messages plus local-only actions. */
export type ChatAction =
  | { kind: "agent-event"; event: AgentToHostMessage }
  | { kind: "dismiss-error"; index: number }
  | { kind: "clear-messages" };

function applyModels(state: ChatState, payload: ModelListPayload): ChatState {
  return { ...state, models: payload.models, modelsReason: payload.reason ?? null };
}

function appendError(state: ChatState, error: string): ChatState {
  return { ...state, errors: [...state.errors, error] };
}

function upsertMessage(state: ChatState, message: ChatMessage): ChatState {
  const index = state.messages.findIndex((entry) => entry.id === message.id);
  if (index === -1) return { ...state, messages: [...state.messages, message] };
  const messages = [...state.messages];
  messages[index] = message;
  return { ...state, messages };
}

function applyDelta(state: ChatState, messageId: string, text: string): ChatState {
  const index = state.messages.findIndex((entry) => entry.id === messageId);
  const current = index === -1 ? undefined : state.messages[index];
  if (index === -1 || !current) return state;
  const messages = [...state.messages];
  messages[index] = { ...current, markdown: current.markdown + text, streaming: true };
  return { ...state, messages };
}

function applyToolCall(state: ChatState, messageId: string, call: ToolCallView): ChatState {
  const index = state.messages.findIndex((entry) => entry.id === messageId);
  const current = index === -1 ? undefined : state.messages[index];
  if (index === -1 || !current) return state;
  const toolCalls: ToolCallView[] = current.toolCalls.some(
    (entry) => entry.toolCallId === call.toolCallId,
  )
    ? current.toolCalls.map((entry) => (entry.toolCallId === call.toolCallId ? call : entry))
    : [...current.toolCalls, call];
  const messages = [...state.messages];
  messages[index] = { ...current, toolCalls };
  return { ...state, messages };
}

/** Fold one agent event into the chat state. */
export function reduceAgentEvent(state: ChatState, event: AgentToHostMessage): ChatState {
  switch (event.type) {
    case "ready":
      return applyModels(
        { ...state, session: event.state, ready: true, agentStatus: "ready" },
        event.models,
      );
    case "state":
      return { ...state, session: event.state };
    case "models":
      return applyModels(state, event.models);
    case "history":
      return { ...state, messages: event.messages };
    case "message-start":
      return upsertMessage(state, event.message);
    case "message-delta":
      return applyDelta(state, event.messageId, event.text);
    case "message-end":
      return upsertMessage(state, { ...event.message, streaming: false });
    case "tool-call":
      return applyToolCall(state, event.messageId, event.call);
    case "agent-status":
      return { ...state, agentStatus: event.status };
    case "error":
    case "fatal":
      return appendError(state, event.error);
    case "models-changed":
    case "session-opened":
      // The new session's transcript arrives as its own `history` event;
      // `useChat.openSession` resolves its promise from this reply.
      return state;
    case "commands":
      // The agent lists `/skill:<name>` entries, filtered to enabled skills at
      // query time; the composer's `/` menu appends them to its built-ins.
      return { ...state, commands: event.commands };
    default:
      return assertNever(event);
  }
}

/** The reducer wired into `useReducer`. */
export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.kind) {
    case "agent-event":
      return reduceAgentEvent(state, action.event);
    case "dismiss-error":
      return { ...state, errors: state.errors.filter((_, position) => position !== action.index) };
    case "clear-messages":
      return { ...state, messages: [] };
    default:
      return assertNever(action);
  }
}

/**
 * Whether the assistant is "thinking": the last block is a streaming assistant
 * message with no text yet.
 *
 * This window is between `message-start` and the first `message-delta`, and it
 * is exactly when the thinking indicator should be visible. The check rests on
 * the message's own `streaming` flag rather than the session-wide one, so it is
 * correct even if the session snapshot still reports `streaming: false`.
 */
export function isThinking(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1];
  return last?.role === "assistant" && last.streaming && last.markdown.length === 0;
}
