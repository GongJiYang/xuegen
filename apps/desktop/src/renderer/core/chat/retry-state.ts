/**
 * How a failed answer reads while Pi retries the connection on its own.
 *
 * A dropped connection is not something the user can fix with 重试: Pi retries
 * by itself and either recovers (one soft line) or gives up (the normal error
 * block). Skins render this same decision, so it lives in one pure function.
 */

import type { ChatMessage } from "@shared/protocol.js";
import { strings } from "../strings.js";

/** One line for an automatic retry, or `"error"` when the message failed for real. */
export type RetryDisplay =
  | { kind: "retrying"; text: string }
  | { kind: "recovered"; text: string }
  | { kind: "error" };

/** What to show in place of the error block for this assistant message. */
export function retryDisplayOf(message: ChatMessage): RetryDisplay {
  const retry = message.retry;
  if (retry === "recovered") return { kind: "recovered", text: strings.chat.retried };
  if (retry) return { kind: "retrying", text: strings.chat.retrying(retry.attempt, retry.maxAttempts) };
  return { kind: "error" };
}
