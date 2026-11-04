/**
 * Renderer-side chat controller.
 *
 * Owns the conversation, the model list, and session status by subscribing to
 * the agent's events through the preload client. All state transitions live in
 * the pure `chat-reducer`; this hook is the imperative shell around it.
 *
 * The controller sits *above* the skins: switching a skin replaces only the
 * presentation and leaves this state untouched, so the conversation survives.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type {
  AgentStatus,
  AgentToHostMessage,
  ChatMessage,
  CommandInfo,
  ModelInfo,
  TeachingStyle,
} from "@shared/protocol.js";
import { chatReducer, initialChatState, isThinking } from "./chat-reducer.js";
import { withStylePrefix } from "./style-prefix.js";
import { isComposerDisabled, noticesFor } from "./view-models.js";
import { resetScrollMemory } from "./use-scroll-memory.js";
import type { NoticeItem } from "../../skins/contract.js";
import * as client from "../client.js";

export interface ChatController {
  messages: ChatMessage[];
  models: ModelInfo[];
  modelsReason: string | null;
  currentModel: ModelInfo | null;
  /** The session's thinking level, or null when the model does not support it. */
  thinkingLevel: string | null;
  /** Levels the active model supports; the 思考强度 menu only enables these. */
  thinkingLevels: string[];
  agentStatus: AgentStatus;
  streaming: boolean;
  thinking: boolean;
  /** True when the interface is unusable because no model is available. */
  disabled: boolean;
  notices: NoticeItem[];
  /** `/skill:<name>` commands the agent offers (enabled skills only). */
  commands: CommandInfo[];
  send(text: string): void;
  /**
   * Send a prompt on behalf of a `/` command.
   *
   * Same as {@link send} but without the `[风格：X]` prefix: a slash command is
   * the whole instruction, so the session style must not ride along (B9).
   */
  sendCommand(text: string): void;
  stop(): void;
  /** Resend the most recent user message, after a stop or a failed answer. */
  retry(): void;
  newSession(): void;
  continueSession(): void;
  /**
   * Switch to a course's own session (its earlier file, or null for a new one);
   * resolves with the session file now active once the agent has switched.
   */
  openSession(sessionFile: string | null): Promise<string | null>;
  /** The active session's transcript file, or null before one exists. */
  sessionFile: string | null;
  setModel(provider: string, id: string): void;
  /** Change the thinking level and persist it as the default (B4). */
  setThinkingLevel(level: string): void;
  dismissNotice(index: number): void;
}

/**
 * @param style Teaching style prefixed onto outgoing messages. Defaults to
 *   `plain` (大白话), the style the user has always used.
 * @param disabledSkills Skills the user turned off; the agent filters these from
 *   its command list, and the list is re-requested whenever they change.
 */
export function useChat(style: TeachingStyle = "plain", disabledSkills: readonly string[] = []): ChatController {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  // Keep the latest style without re-creating `send`, so a style change never
  // forces child re-renders through a new callback identity. Updated in an
  // effect (not during render) so the ref write is a side effect.
  const styleRef = useRef(style);
  useEffect(() => {
    styleRef.current = style;
  }, [style]);

  // Pending `open-session` requests, resolved by the agent's `session-opened`.
  const openRequests = useRef(new Map<string, (sessionFile: string | null) => void>());

  const disabledSkillsRef = useRef(disabledSkills);
  useEffect(() => {
    disabledSkillsRef.current = disabledSkills;
  }, [disabledSkills]);

  useEffect(() => {
    const unsubscribe = client.subscribe((event: AgentToHostMessage) => {
      dispatch({ kind: "agent-event", event });
      if (event.type === "session-opened") {
        openRequests.current.get(event.requestId)?.(event.sessionFile);
        openRequests.current.delete(event.requestId);
      }
      // Re-request the model and command lists whenever the agent reports ready
      // or switches sessions. The mount-time request can be dropped when the
      // agent process has not started yet, so `ready` is the reliable trigger.
      if (event.type === "ready" || event.type === "models-changed") {
        client.send({ type: "list-models" });
        client.send({ type: "list-commands", disabledSkills: [...disabledSkillsRef.current] });
      }
    });

    // Ask the agent for its full snapshot: ready/state/models/history. This is
    // required because the agent may have started before this window subscribed.
    client.send({ type: "init" });
    return unsubscribe;
  }, []);

  // Re-request the command list whenever the disabled-skill set changes, so
  // turning a skill off removes its `/skill:<name>` entry without a restart.
  const disabledKey = useMemo(() => [...disabledSkills].sort().join(","), [disabledSkills]);
  useEffect(() => {
    client.send({ type: "list-commands", disabledSkills: [...disabledSkillsRef.current] });
  }, [disabledKey]);

  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // The style marker rides on the wire only; the transcript strips it back into
    // a tag on display (see `splitStyleTag`), so the raw prefix is never shown.
    client.send({ type: "prompt", text: withStylePrefix(styleRef.current, trimmed) });
  }, []);

  const sendCommand = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    client.send({ type: "prompt", text: trimmed });
  }, []);

  const stop = useCallback(() => client.send({ type: "abort" }), []);

  // Retry resends the last user message. `withStylePrefix` never double-prefixes,
  // so the stored (already-prefixed) markdown can be sent as-is. Defined inside
  // the memo below so it reads the current transcript without its own ref.
  const newSession = useCallback(() => {
    dispatch({ kind: "clear-messages" });
    // A fresh session starts at the top of an empty transcript.
    resetScrollMemory();
    client.send({ type: "new-session" });
  }, []);
  const openSession = useCallback((sessionFile: string | null) => {
    dispatch({ kind: "clear-messages" });
    resetScrollMemory();
    const requestId = `open-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise<string | null>((resolvePromise) => {
      openRequests.current.set(requestId, resolvePromise);
      client.send({ type: "open-session", requestId, sessionFile });
    });
  }, []);
  const continueSession = useCallback(() => {
    dispatch({ kind: "clear-messages" });
    resetScrollMemory();
    client.send({ type: "continue-session" });
  }, []);
  const setModel = useCallback((provider: string, id: string) => {
    client.send({ type: "set-model", provider, id });
  }, []);
  const setThinkingLevel = useCallback((level: string) => {
    if (level === "low" || level === "medium" || level === "high") {
      client.send({ type: "set-thinking-level", level });
    }
  }, []);
  const dismissNotice = useCallback((index: number) => {
    dispatch({ kind: "dismiss-error", index });
  }, []);

  return useMemo(() => {
    const streaming = state.session?.streaming ?? state.messages.some((message) => message.streaming);
    const lastUser = [...state.messages].reverse().find((message) => message.role === "user");
    const retry = (): void => {
      if (lastUser) client.send({ type: "prompt", text: withStylePrefix(styleRef.current, lastUser.markdown) });
    };
    return {
      messages: state.messages,
      models: state.models,
      modelsReason: state.modelsReason,
      currentModel: state.session?.model ?? null,
      thinkingLevel: state.session?.thinkingLevel ?? null,
      thinkingLevels: state.session?.thinkingLevels ?? [],
      agentStatus: state.agentStatus,
      streaming,
      thinking: isThinking(state.messages),
      disabled: isComposerDisabled(state),
      notices: noticesFor(state),
      commands: state.commands,
      send,
      sendCommand,
      stop,
      retry,
      newSession,
      continueSession,
      openSession,
      sessionFile: state.session?.sessionFile ?? null,
      setModel,
      setThinkingLevel,
      dismissNotice,
    };
  }, [state, send, sendCommand, stop, newSession, continueSession, openSession, setModel, setThinkingLevel, dismissNotice]);
}
