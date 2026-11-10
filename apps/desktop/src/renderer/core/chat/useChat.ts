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
import type { AgentToHostMessage, SessionRole, TeachingStyle } from "@shared/protocol.js";
import { chatReducer, initialChatState, isThinking } from "./chat-reducer.js";
import { withStylePrefix } from "./style-prefix.js";
import { splitActionMarker } from "./action-marker.js";
import { isComposerDisabled, noticesFor } from "./view-models.js";
import { resetScrollMemory } from "./use-scroll-memory.js";
import { threadNotes } from "./context-usage.js";
import * as client from "../client.js";
import type { ChatController } from "./chat-controller.js";
export type { ChatController } from "./chat-controller.js";

/**
 * @param style Teaching style prefixed onto outgoing messages. Defaults to
 *   `default`: no prefix, so 学根 follows the subject's 讲解偏好.
 * @param disabledSkills Skills the user turned off; the agent filters these from
 *   its command list, and the list is re-requested whenever they change.
 */
export function useChat(
  style: TeachingStyle = "default",
  disabledSkills: readonly string[] = [],
): ChatController {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  // Keep the latest style without re-creating `send`, so a style change never
  // forces child re-renders through a new callback identity. Updated in an
  // effect (not during render) so the ref write is a side effect.
  const styleRef = useRef(style);
  useEffect(() => {
    styleRef.current = style;
  }, [style]);

  const refreshNoteRef = useRef<string | null>(null);
  const setRefreshNote = useCallback((note: string | null) => {
    refreshNoteRef.current = note;
  }, []);

  // The prompt last sent by `send`, remembered so `stop` can give it back. Cleared
  // by `stop` itself and whenever a turn settles normally, so a stop never
  // resurrects an earlier prompt that already got its answer.
  const lastSentRef = useRef<string | null>(null);
  /** Whether the last status snapshot reported a running turn (see `lastSentRef`). */
  const streamingRef = useRef(false);

  // Pending `open-session` requests, resolved by the agent's `session-opened`.
  const openRequests = useRef(new Map<string, (sessionFile: string | null) => void>());

  const disabledSkillsRef = useRef(disabledSkills);
  useEffect(() => {
    disabledSkillsRef.current = disabledSkills;
  }, [disabledSkills]);

  // The session the next session-scoped request targets, kept in a ref (like
  // `styleRef`) so the send callbacks stay identity-stable. It is written from
  // the event listener, not from an effect over `state.session`: a send right
  // after `ready`/`state` must already carry the new id, and an effect could
  // still be holding a snapshot the agent has since replaced. A request whose
  // id no longer matches is dropped by the agent with an error.
  const sessionIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = client.subscribe((event: AgentToHostMessage) => {
      dispatch({ kind: "agent-event", event });
      // A turn that ended on its own is no longer "the prompt just sent": drop it,
      // so stopping during the next turn cannot put back an older message. A user
      // abort clears `lastSentRef` in `stop` instead, before the agent replies.
      if (event.type === "state" || event.type === "ready") {
        const streaming = event.state.streaming;
        if (streamingRef.current && !streaming) lastSentRef.current = null;
        streamingRef.current = streaming;
        // Synchronously, so a send in the same turn as this snapshot already
        // targets the session it names (the agent drops a stale id).
        sessionIdRef.current = event.state.sessionId ?? undefined;
      }
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
    // The user's own words, not the wire text: `stop` hands this back to the
    // composer, which must not show the style prefix or a refresh note.
    // Text the UI sends for the user (开课 and other marked actions) is not theirs to edit.
    lastSentRef.current = splitActionMarker(trimmed).action === null ? trimmed : null;
    const note = refreshNoteRef.current;
    const body = note ? `${note} ${trimmed}` : trimmed;
    // The style marker rides on the wire only; the transcript strips it back into
    // a tag on display (see `splitStyleTag`), so the raw prefix is never shown.
    client.send({
      type: "prompt",
      text: withStylePrefix(styleRef.current, body),
      sessionId: sessionIdRef.current,
    });
  }, []);

  // A command is not something the user typed into the field, so `stop` never
  // puts it back: `lastSentRef` is set by `send` only.
  const sendCommand = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const note = refreshNoteRef.current;
    client.send({
      type: "prompt",
      text: note ? `${note} ${trimmed}` : trimmed,
      sessionId: sessionIdRef.current,
    });
  }, []);

  const stop = useCallback((): string | null => {
    client.send({ type: "abort", sessionId: sessionIdRef.current });
    const lastSent = lastSentRef.current;
    lastSentRef.current = null;
    return lastSent;
  }, []);
  const compact = useCallback(() => client.send({ type: "compact", sessionId: sessionIdRef.current }), []);

  // Retry resends the last user message. `withStylePrefix` never double-prefixes,
  // so the stored (already-prefixed) markdown can be sent as-is. Defined inside
  // the memo below so it reads the current transcript without its own ref.
  const newSession = useCallback(() => {
    dispatch({ kind: "clear-messages" });
    // A fresh session starts at the top of an empty transcript.
    resetScrollMemory();
    client.send({ type: "new-session" });
  }, []);
  const openSession = useCallback((sessionFile: string | null, role: SessionRole) => {
    dispatch({ kind: "clear-messages" });
    resetScrollMemory();
    const requestId = `open-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise<string | null>((resolvePromise) => {
      openRequests.current.set(requestId, resolvePromise);
      client.send({ type: "open-session", requestId, sessionFile, role });
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
      if (lastUser)
        client.send({
          type: "prompt",
          text: withStylePrefix(styleRef.current, lastUser.markdown),
          sessionId: sessionIdRef.current,
        });
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
      contextUsage: state.contextUsage,
      compacting: state.compaction?.phase === "start",
      systemNotes: threadNotes(state.systemNotes),
      compact,
      send,
      sendCommand,
      setRefreshNote,
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
  }, [
    state,
    compact,
    send,
    sendCommand,
    setRefreshNote,
    stop,
    newSession,
    continueSession,
    openSession,
    setModel,
    setThinkingLevel,
    dismissNotice,
  ]);
}
