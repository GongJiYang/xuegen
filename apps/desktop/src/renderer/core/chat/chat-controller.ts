/** The controller `useChat` returns; split out of useChat.ts to keep it under 300 lines. */

import type {
  AgentStatus,
  ChatMessage,
  CommandInfo,
  ContextUsagePayload,
  ModelInfo,
  SessionRole,
} from "@shared/protocol.js";
import type { NoticeItem, ThreadNote } from "../../skins/contract.js";

export interface ChatController {
  messages: ChatMessage[];
  /**
   * The transcript the last `history` event carried — read synchronously right
   * after `openSession` resolves (React state lags behind).
   */
  openedHistory(): ChatMessage[];
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
  /** Estimated context usage, or null before the agent reports one. */
  contextUsage: ContextUsagePayload | null;
  /** True while Pi is summarizing older messages. */
  compacting: boolean;
  /** Local-only transcript lines (compaction markers), ready to render. */
  systemNotes: ThreadNote[];
  /** Ask Pi to compact the conversation now. */
  compact(): void;
  send(text: string): void;
  /**
   * Send a prompt on behalf of a `/` command.
   *
   * Same as {@link send} but without the `[风格：X]` prefix: a slash command is
   * the whole instruction, so the session style must not ride along (B9).
   */
  sendCommand(text: string): void;
  /** A note put in front of the next prompts (send and sendCommand) until set back to null. */
  setRefreshNote(note: string | null): void;
  /**
   * Stop the running answer.
   *
   * Returns the text of the prompt just sent (the user's own words, without the
   * style prefix or a refresh note), or null when there is no such prompt left —
   * a skin puts it back into an empty composer so an accidental stop, or send,
   * can be undone.
   */
  stop(): string | null;
  /** Resend the most recent user message, after a stop or a failed answer. */
  retry(): void;
  newSession(): void;
  continueSession(): void;
  /**
   * Switch to a course's own session (its earlier file, or null for a new one);
   * resolves with the session file now active once the agent has switched.
   * `role` names the guard's permission set for the session being opened.
   */
  openSession(sessionFile: string | null, role: SessionRole): Promise<string | null>;
  /**
   * Run a session switch (open/new/continue) behind the mid-answer guard.
   *
   * Runs `run` immediately when idle; while 学根 is answering, holds `run` and
   * raises {@link pendingSwitch} so the shell can ask first.
   */
  guardSwitch(run: () => void): void;
  /** True while a held switch waits on the learner's answer to the confirm. */
  pendingSwitch: boolean;
  /** 「切换」: stop the answer like the stop button, then run the held switch. */
  confirmSwitch(): void;
  /** 「等它说完」: drop the held switch without running it. */
  cancelSwitch(): void;
  /**
   * Words a confirmed switch withdrew from the old session's queue, waiting for
   * the new session's composer; null when nothing was carried.
   */
  carriedDraft: string | null;
  /** The composer took {@link carriedDraft} into its field: forget it. */
  takeCarriedDraft(): void;
  /** The active session's transcript file, or null before one exists. */
  sessionFile: string | null;
  setModel(provider: string, id: string): void;
  /** Change the thinking level and persist it as the default (B4). */
  setThinkingLevel(level: string): void;
  dismissNotice(index: number): void;
}
