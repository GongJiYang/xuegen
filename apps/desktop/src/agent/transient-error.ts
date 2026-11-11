/**
 * Transient-provider-error rule for Pi's automatic retry.
 *
 * Pi decides whether to retry an assistant error in `AgentSession._isRetryableError`,
 * which delegates to pi-ai's `isRetryableAssistantError`. That function first
 * consults a "never retry" list containing `billing` (meaning an exhausted
 * account balance). OpenDesign's relay answers a temporary outage with
 * `503 ... resolve Billing Scope: ... database_unavailable`, so the word
 * `Billing` puts a server hiccup on the never-retry list: the window shows
 * 「模型出错了」 instead of 「正在自动重试」 and the turn is lost (11-11, and the
 * `workspace_billing_scope_unavailable` reports of 11-09/11-10).
 *
 * So Xuegen adds its own narrow exception on top of Pi's rule instead of
 * patching `node_modules`: a message that says 503 *and* names a billing scope
 * or a database outage is treated as retryable, unless it also talks about
 * quota/balance/hard limit — those are the real "top up the account" errors and
 * must still fail fast.
 */

/** The parts of an assistant message this rule reads. */
export interface RetryableMessage {
  readonly stopReason?: string | undefined;
  readonly errorMessage?: string | undefined;
}

/** Pi's own retry predicate, as seen from the session instance. */
export type RetryableCheck = (message: RetryableMessage) => boolean;

/** A standalone `503`, so a request id such as `15031` does not count. */
const STATUS_503 = /(?<!\d)503(?!\d)/;
/** The outage wordings OpenDesign uses behind the misleading `Billing` label. */
const TRANSIENT_MARKER = /billing[\s_-]*scope|database_unavailable/i;
/** Genuine "the account is out" wordings: never retried. */
const ACCOUNT_EXHAUSTED = /insufficient|quota|balance|limit reached/i;

/**
 * True for a temporary provider outage that merely *mentions* billing.
 *
 * Kept as a pure string rule so it is testable without a session, and so the
 * exact wordings above can be added without touching Pi.
 */
export function isTransientProviderError(text: string): boolean {
  return STATUS_503.test(text) && TRANSIENT_MARKER.test(text) && !ACCOUNT_EXHAUSTED.test(text);
}

/**
 * Wrap a session so Pi's retry decision also accepts transient provider errors.
 *
 * Called once, right after `createAgentSession`: Pi reads `_isRetryableError` from
 * the instance at retry time, so shadowing it here is enough, and everything the
 * original rule accepted keeps working. A session without that method (a future
 * Pi rename) is returned untouched rather than crashing — the test pins the
 * method's existence so the rename is noticed.
 */
export function withTransientRetry<T extends object>(session: T): T {
  const target = session as unknown as T & { _isRetryableError?: RetryableCheck };
  const original = target._isRetryableError;
  if (typeof original !== "function") return session;

  target._isRetryableError = (message) =>
    original.call(target, message) ||
    (message?.stopReason === "error" && isTransientProviderError(message.errorMessage ?? ""));

  return session;
}
