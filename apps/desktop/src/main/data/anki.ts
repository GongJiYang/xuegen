/**
 * Read-only AnkiConnect client.
 *
 * The app only ever reads Anki state so the cards panel can show sync status.
 * Writing actions (`addNote`, `deleteNotes`, `sync`, …) are refused by design
 * in this client: pushing cards to Anki is `cards.sync`, which runs the
 * standalone `skills/wiki-save/anki-sync.mjs` script instead — a stray write
 * here would corrupt the user's collection.
 */

import type { AnkiStatus } from "../../shared/data-protocol.js";

/** AnkiConnect's default local endpoint, used when `XUEGEN_ANKI_URL` is unset. */
export const ANKI_ENDPOINT = "http://127.0.0.1:8765";

/** AnkiConnect must answer within this window or the app reports "not running". */
export const ANKI_TIMEOUT_MS = 1500;

/**
 * `XUEGEN_ANKI_URL` may only point at a loopback AnkiConnect. The override
 * exists so a test window can talk to a fake Anki; a non-local URL would mean
 * sending the user's review data somewhere unexpected, so it is refused.
 */
const LOCAL_ANKI_URL = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/;

/**
 * The validated `XUEGEN_ANKI_URL` override, or null when unset, empty, or not
 * a loopback `http://host:port`. An invalid value warns rather than silently
 * redirecting Anki traffic.
 */
export function ankiUrlOverride(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.XUEGEN_ANKI_URL;
  if (raw === undefined || raw === "") return null;
  if (LOCAL_ANKI_URL.test(raw)) return raw;
  console.warn(
    `[main] XUEGEN_ANKI_URL 非法（须为 http://127.0.0.1:<端口> 或 http://localhost:<端口>），已忽略：${raw}`,
  );
  return null;
}

/** The AnkiConnect endpoint to call: the override when valid, else the default. */
export function ankiEndpoint(env: NodeJS.ProcessEnv = process.env): string {
  return ankiUrlOverride(env) ?? ANKI_ENDPOINT;
}

/**
 * The only AnkiConnect actions Xuegen may call. Any action outside this set is a
 * programming error: the client asserts against it before sending.
 */
export const ALLOWED_ANKI_ACTIONS: readonly string[] = [
  "version",
  "deckNames",
  "getNumCardsReviewedToday",
  "findCards",
];

/** True when the action is on the read-only whitelist. */
export function isAllowedAnkiAction(action: string): boolean {
  return ALLOWED_ANKI_ACTIONS.includes(action);
}

/** Request body AnkiConnect expects. Exported for the whitelist test. */
export function buildAnkiRequest(action: string, params: Record<string, unknown> = {}): string {
  if (!isAllowedAnkiAction(action)) {
    throw new Error(`AnkiConnect 只读：不允许调用 ${action}`);
  }
  return JSON.stringify({ action, params, version: 6 });
}

/**
 * The search for one deck's own due cards.
 *
 * Anki's `deck:"Link"` also matches every `Link::…` subdeck, so a parent and its
 * children would count the same card twice; excluding the children keeps each
 * card in exactly one row. Quotes inside a deck name are escaped.
 */
export function dueQuery(deck: string): string {
  const quoted = deck.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `deck:"${quoted}" -deck:"${quoted}::*" is:due`;
}

/** A single AnkiConnect call: parse the JSON envelope or throw. */
async function invoke(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANKI_TIMEOUT_MS);
  try {
    const response = await fetch(ankiEndpoint(), {
      method: "POST",
      body: buildAnkiRequest(action, params),
      signal: controller.signal,
    });
    const body = (await response.json()) as { result?: unknown; error?: unknown };
    if (body.error) throw new Error(String(body.error));
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe Anki and summarize the cards due per deck.
 *
 * Returns `{running:false}` when Anki is closed or AnkiConnect is not installed
 * — that is a normal state, not an error. Any write action is impossible here:
 * every call goes through the whitelisted `invoke`.
 */
export async function fetchAnkiStatus(): Promise<AnkiStatus> {
  try {
    const version = (await invoke("version")) as number;
    if (typeof version !== "number") return { running: false };

    const deckNames = (await invoke("deckNames")) as string[];
    const reviewedToday = (await invoke("getNumCardsReviewedToday")) as number;
    const due: { deck: string; count: number }[] = [];
    for (const deck of Array.isArray(deckNames) ? deckNames : []) {
      const cards = (await invoke("findCards", { query: dueQuery(deck) })) as unknown[];
      if (Array.isArray(cards) && cards.length > 0) due.push({ deck, count: cards.length });
    }
    return { running: true, version, deckNames, reviewedToday, due };
  } catch {
    // Connection refused, timeout, or a malformed reply all mean "Anki is not
    // running as far as the app is concerned"; the panel shows a clear hint.
    return { running: false };
  }
}
