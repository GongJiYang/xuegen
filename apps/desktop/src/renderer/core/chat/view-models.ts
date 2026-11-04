/**
 * Derived chat view models.
 *
 * Pure functions that turn the raw `ChatState` into what a skin's slots need:
 * the notice list and the "no models / login needed" flags. Keeping these pure
 * means the same inputs always produce the same notices, testable without React.
 */

import type { AgentStatus } from "@shared/protocol.js";
import { strings } from "../strings.js";
import type { ChatState } from "./chat-reducer.js";
import { isAborted, translateModelError } from "./model-error.js";
import type { NoticeItem } from "../../skins/contract.js";

/** Notices for the current state: agent lifecycle problems and errors. */
export function noticesFor(state: ChatState): NoticeItem[] {
  const notices: NoticeItem[] = [];

  // Lifecycle notices appear only when the agent is not healthy.
  const lifecycle = lifecycleNotice(state.agentStatus);
  if (lifecycle) notices.push(lifecycle);

  // No models means the user is not logged in; the reason text is the hint.
  if (state.models.length === 0) {
    notices.push({ tone: "info", text: state.modelsReason ?? strings.chat.loginHint });
  }

  for (const error of state.errors) {
    // A user-initiated stop is not an error: the message itself carries the
    // "已停止" guidance and a 重试 button, so it must not raise an alert box.
    if (isAborted(error)) continue;
    const { summary, detail } = translateModelError(error);
    notices.push(detail === null ? { tone: "error", text: summary } : { tone: "error", text: summary, detail });
  }

  return notices;
}

/** A lifecycle notice, or null when the agent is running normally. */
function lifecycleNotice(status: AgentStatus): NoticeItem | null {
  switch (status) {
    case "starting":
      return { tone: "info", text: strings.notice.agentStarting };
    case "restarting":
      return { tone: "error", text: strings.notice.agentRestarting };
    case "crashed":
      return { tone: "error", text: strings.notice.agentCrashed };
    case "stopped":
      return { tone: "info", text: strings.notice.agentStopped };
    default:
      return null;
  }
}

/**
 * Whether the composer and model picker should be disabled.
 *
 * The interface is unusable without a model, so this is true exactly when the
 * model list is empty.
 */
export function isComposerDisabled(state: ChatState): boolean {
  return state.models.length === 0;
}
