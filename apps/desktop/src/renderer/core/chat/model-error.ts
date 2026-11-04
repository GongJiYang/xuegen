/**
 * Model / agent error translation.
 *
 * The agent surfaces raw upstream errors (an HTTP status with a JSON body, a
 * socket error, a fetch failure). Those are unreadable in the UI, so this maps
 * the common cases to a short Chinese summary and keeps the original text as a
 * separate `detail` for an expandable "详情". The mapping is pure and depends
 * only on the error string.
 */

/** A translated error: the summary to show, and the raw text for the detail. */
export interface TranslatedError {
  summary: string;
  /** The original text, shown only when it differs from the summary. */
  detail: string | null;
}

/** The Chinese summaries, keyed by the pattern that recognises the error. */
export const MODEL_ERROR_SUMMARIES = {
  auth: "模型认证失败：请在终端运行 xuegen login 重新登录。",
  rate: "请求太频繁，稍等再试。",
  /** Out-of-credit failures (HTTP 402 / `insufficient_balance`). */
  balance: "DeepSeek 余额不足：请充值，或在「模型」菜单换一个模型。",
  network: "连不上模型服务，检查网络。",
  /** A user-initiated stop; not a failure, so it reads as guidance. */
  aborted: "已停止。可以继续提问，或点「重试」。",
  generic: "模型出错了。",
} as const;

/** True when the text is our own user-initiated stop marker, not a real error. */
export function isAborted(text: string): boolean {
  return /已中止|aborted|request was aborted/i.test(text.trim());
}

/** True when the text looks like an auth failure (401/403, invalid key). */
function isAuth(text: string): boolean {
  return /\b401\b|\b403\b|invalid[\s_-]*x-api-key|invalid[\s_-]*api[\s_-]*key|unauthorized|authentication|api key/i.test(
    text,
  );
}

/** True when the text looks like a rate limit (429 / too many requests). */
function isRateLimit(text: string): boolean {
  return /\b429\b|rate[\s_-]*limit|too many requests|overloaded|限流/i.test(text);
}

/**
 * True when the text looks like an out-of-credit failure.
 *
 * DeepSeek returns HTTP 402 with `{"message":"Insufficient Balance"}`, which the
 * generic branch would otherwise flatten into 「模型出错了」.
 */
function isBalance(text: string): boolean {
  return /\b402\b|insufficient[\s_-]*balance|insufficient[\s_-]*quota|余额不足/i.test(text);
}

/** True when the text looks like a transport failure (fetch socket / timeout). */
function isNetwork(text: string): boolean {
  return /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|network|socket hang up|timed? out/i.test(
    text,
  );
}

/**
 * Translate a raw error into a summary plus its raw detail.
 *
 * A message that already carries a Chinese summary (our own copy) keeps it as
 * the summary and reuses it as the detail so the "详情" still shows the source.
 */
export function translateModelError(raw: string): TranslatedError {
  const text = raw.trim();
  // A user stop is not a failure: no raw detail, so the UI shows guidance only.
  if (isAborted(text)) return { summary: MODEL_ERROR_SUMMARIES.aborted, detail: null };
  if (isBalance(text)) return { summary: MODEL_ERROR_SUMMARIES.balance, detail: text };
  if (isAuth(text)) return { summary: MODEL_ERROR_SUMMARIES.auth, detail: text };
  if (isRateLimit(text)) return { summary: MODEL_ERROR_SUMMARIES.rate, detail: text };
  if (isNetwork(text)) return { summary: MODEL_ERROR_SUMMARIES.network, detail: text };
  return { summary: MODEL_ERROR_SUMMARIES.generic, detail: text || null };
}
