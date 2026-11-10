/**
 * Shared message protocol.
 *
 * One definition, used by the renderer, the main process, and the agent process.
 * Renderer -> main and main -> agent traffic carries `HostToAgentMessage`; the
 * reverse carries `AgentToHostMessage`. Both are enveloped so a single transport
 * (utilityProcess `postMessage` on one side, Electron IPC on the other) carries
 * every kind of traffic.
 *
 * Renderer settings use a separate, small channel pair (`DesktopSettings`) so
 * they never mix with the agent conversation stream; the main process owns the
 * file and is the only writer. Vault reads/writes use the data channel
 * (`data-protocol.ts`), which the main process owns end to end.
 */

import type { DataRequest, DataResultFor } from "./data-protocol.js";
import type { UpdateStatus } from "./update.js";

/** The Electron IPC channel name for agent traffic, shared by main and preload. */
export const IPC_CHANNEL = "xuegen";

/** The Electron IPC channel name for desktop settings, shared by main and preload. */
export const SETTINGS_CHANNEL = "xuegen:settings";

/** The Electron IPC channel name for vault data requests, shared by main and preload. */
export const DATA_CHANNEL = "xuegen:data";

/** A configured model that the session can switch to. */
export interface ModelInfo {
  provider: string;
  id: string;
  name: string;
}

/** Tool-call card state, keyed by the Pi tool call id. */
export interface ToolCallView {
  toolCallId: string;
  toolName: string;
  /** Compact one-line argument summary derived from the tool arguments. */
  argsSummary: string;
  status: "running" | "success" | "error";
  /** Result text or error message, once the call finished. */
  resultText?: string;
}

/** One message in the conversation, as the renderer needs it. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  /** Authoritative Markdown for the message. */
  markdown: string;
  /** True while text is still streaming into `markdown`. */
  streaming: boolean;
  /** Tool calls made by this assistant message, in emission order. */
  toolCalls: ToolCallView[];
  /** Stop reason when the assistant message ended abnormally. */
  errorMessage?: string;
  /**
   * Automatic retry state of a failed answer.
   *
   * `{ attempt, maxAttempts }` while Pi is retrying the connection, `"recovered"`
   * once a retry produced a normal answer. The `errorMessage` stays on the
   * message either way, so a transcript restored from the session file can be
   * re-judged; the renderer decides what to show from `retry`.
   */
  retry?: { attempt: number; maxAttempts: number } | "recovered" | undefined;
  /** ISO time the session file recorded it (restored history only; live messages leave it unset). */
  at?: string;
}

/**
 * Estimated context usage for the active session.
 *
 * `tokens` and `percent` are null right after a compaction, until a fresh model
 * response provides authoritative usage again (Pi's `getContextUsage` contract).
 */
export interface ContextUsagePayload {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}

/** Why Pi compacted the conversation. */
export type CompactionReason = "manual" | "threshold" | "overflow";

/**
 * One compaction lifecycle event.
 *
 * `start` has no outcome fields; `end` carries whether it aborted or failed.
 */
export interface CompactionPayload {
  phase: "start" | "end";
  reason: CompactionReason;
  aborted?: boolean;
  errorMessage?: string;
}

/**
 * A local-only transcript annotation (never written to the session file and
 * never sent to the model). The renderer maps `kind` to its own copy.
 */
export interface SystemNote {
  /** Insert before the message at this index; equal to the length means last. */
  beforeIndex: number;
  kind: "compaction";
}

/** A model list plus the reason it may be empty. */
export interface ModelListPayload {
  models: ModelInfo[];
  /** Set when no credentials are configured, so the UI can prompt for /login. */
  reason?: string;
}

/**
 * The session's permission role, chosen by the interface when it opens a
 * session and enforced by the agent's tool guard
 * (docs/platform/ROUTE-1109.md 阶段 2). `control` is the 总控 session, `course`
 * one course's session, `free` everything else.
 */
export type SessionRole = { kind: "control" } | { kind: "course"; slug: string } | { kind: "free" };

/** Runtime guard for a `SessionRole` crossing a process boundary. */
export function isSessionRole(value: unknown): value is SessionRole {
  if (!isRecord(value)) return false;
  if (value.kind === "control" || value.kind === "free") return true;
  return value.kind === "course" && typeof value.slug === "string" && /^[a-z0-9-]+$/.test(value.slug);
}

/** The role a message carries, or `free` when it is absent or malformed. */
export function sessionRoleOrFree(value: unknown): SessionRole {
  return isSessionRole(value) ? value : { kind: "free" };
}

/** Session status snapshot sent to the renderer. */
export interface SessionStatePayload {
  cwd: string;
  model: ModelInfo | null;
  sessionFile: string | null;
  /** Pi's id for the active session; null before the first session is ready. */
  sessionId: string | null;
  /** The session's permission role (see {@link SessionRole}). */
  role: SessionRole;
  streaming: boolean;
  /** Number of follow-up messages waiting behind the current run. */
  queuedFollowUps: number;
  /**
   * The session's current thinking level, so the 模型 menu can show a tick.
   *
   * Null when the active model does not support thinking, in which case the
   * 思考强度 items are disabled.
   */
  thinkingLevel: string | null;
  /** Levels the active model accepts (empty when it has no thinking). */
  thinkingLevels: string[];
}

/** Lifecycle of the agent process, as reported to the renderer. */
export type AgentStatus = "starting" | "ready" | "restarting" | "crashed" | "stopped";

/** Requests the renderer (via main) sends to the agent process. */
export type HostToAgentMessage =
  | { type: "init" }
  /** `sessionId`, when given, must name the active session; a stale one is dropped with an error (see agent/index.ts). */
  | { type: "prompt"; text: string; sessionId?: string | undefined }
  | { type: "abort"; sessionId?: string | undefined }
  /** `role` picks the guard's permission set; absent means `free`. */
  | { type: "new-session"; role?: SessionRole }
  | { type: "continue-session" }
  | { type: "set-model"; provider: string; id: string }
  /** Set the thinking level and remember it as the default (B4). */
  | { type: "set-thinking-level"; level: ThinkingLevel }
  | { type: "list-models" }
  | { type: "list-commands"; disabledSkills: string[] }
  /** Compact the conversation now (the 「立即压缩」 button). */
  /** `sessionId`, when given, must name the active session; a stale one is dropped with an error (see agent/index.ts). */
  | { type: "compact"; sessionId?: string | undefined }
  /**
   * Switch to a specific session: the file of an earlier session to resume, or
   * null for a brand-new one. Each course keeps its own session so contexts never
   * mix. The agent answers with `session-opened` carrying the same `requestId`.
   */
  | { type: "open-session"; requestId: string; sessionFile: string | null; role?: SessionRole };

/** Events the agent process sends back to the host. */
export type AgentToHostEvent =
  | { type: "ready"; state: SessionStatePayload; models: ModelListPayload }
  /** Reply to `open-session`: the session now active (its file, once known). */
  | { type: "session-opened"; requestId: string; sessionFile: string | null }
  | { type: "state"; state: SessionStatePayload }
  | {
      type: "message-start";
      message: ChatMessage;
    }
  | {
      type: "message-delta";
      messageId: string;
      text: string;
    }
  | {
      type: "message-end";
      message: ChatMessage;
    }
  | { type: "tool-call"; messageId: string; call: ToolCallView }
  | { type: "models"; models: ModelListPayload }
  | { type: "models-changed" }
  /** Full conversation snapshot, sent on start and after a session switch. */
  | { type: "history"; messages: ChatMessage[]; notes?: SystemNote[] }
  /** Estimated context usage; sent after each turn, session switch, compaction. */
  | ({ type: "context-usage" } & ContextUsagePayload)
  /** Pi began or finished compacting old messages. */
  | ({ type: "compaction" } & CompactionPayload)
  | { type: "agent-status"; status: AgentStatus }
  /** Commands the composer's `/` menu offers, sourced from the loaded skills. */
  | { type: "commands"; commands: CommandInfo[] }
  /** Sent by the main process (not the agent): the in-app update's state changed. */
  | { type: "update-status"; status: UpdateStatus }
  | { type: "fatal"; error: string }
  | { type: "error"; error: string };

/**
 * What actually crosses the agent → host boundary: an event plus the id of the
 * session it came from (null before a session exists, and for messages the main
 * process originates itself, such as `update-status` / `agent-status`).
 * Routing by it waits for the multi-process stage; today it is recorded only.
 */
export type AgentToHostMessage = AgentToHostEvent & { sessionId?: string | null };

/** One entry in the composer's `/` command menu. */
export interface CommandInfo {
  name: string;
  description: string;
  source: "skill";
}

/** Envelope for messages crossing the renderer <-> main boundary. */
export interface IpcEnvelope<T> {
  channel: typeof IPC_CHANNEL;
  payload: T;
}

/**
 * The font used for message body text.
 *
 * The chrome (menus, titles, buttons) and code/diagram blocks always keep the
 * skin's pixel fonts; only the reading column can switch to a system font.
 */
export type BodyFont = "pixel" | "hei" | "kai" | "song";

/** The body-font ids, in menu order. */
export const BODY_FONTS: BodyFont[] = ["pixel", "hei", "kai", "song"];

/** Runtime guard for a persisted `bodyFont` value. */
export function isBodyFont(value: unknown): value is BodyFont {
  return value === "pixel" || value === "hei" || value === "kai" || value === "song";
}

/**
 * User-visible desktop settings, persisted by the main process to
 * `~/.xuegen/desktop.json`. The renderer reads and writes them through the
 * preload bridge; it never touches the file.
 */
export interface DesktopSettings {
  /** Active skin id; an unknown id falls back to `bare` at load time. */
  skin: string;
  /** Message body font; the chrome and code stay pixel regardless. */
  bodyFont: BodyFont;
  /** Body text scale multiplier, kept within [`BODY_SCALE_MIN`, `BODY_SCALE_MAX`]. */
  bodyScale: number;
  /**
   * Per-skin appearance options, keyed by skin id then option key.
   *
   * A skin declares the keys it understands (Chicago uses `palette`); values are
   * plain strings so the settings file stays schema-light. Skins validate their
   * own keys, and a skin that has no options (e.g. `bare`) simply ignores the
   * field — the contract test still requires it to round-trip.
   */
  skinOptions: Record<string, Record<string, string>>;
  /**
   * Window background colour, mirrored from the active skin's paper colour.
   *
   * The main process uses it as the `BrowserWindow.backgroundColor` so a window
   * opens in the right colour and never flashes a default white before the
   * renderer paints. The renderer updates it (via IPC) whenever the palette
   * changes. Empty string means "no preference, use the built-in default".
   */
  windowBackground: string;
  /** Skills the user turned off; the agent excludes them from its command list. */
  disabledSkills: string[];
  /** The session file each course studies in, keyed by course slug. */
  courseSessions: Record<string, string>;
  /**
   * The local day (`YYYY-MM-DD`) each course was last opened, keyed by slug.
   *
   * Course sessions persist across days, so this is what tells 「回到这门课」 apart
   * from 「开始学习」: a course opened today switches back without sending an
   * opening message; one not yet opened today starts the day's lesson.
   */
  courseStartedOn: Record<string, string>;
  /** The 总控 session file of each study cycle, keyed by cycle id (`C1`). */
  controlSessions: Record<string, string>;
  /** The local day (`YYYY-MM-DD`) the 总控 brief was last asked for, keyed by cycle id. */
  controlBriefOn: Record<string, string>;
}

/** Teaching style ids. `default` sends no prefix: 学根 then follows the subject's 讲解偏好. */
export type TeachingStyle = "default" | "plain" | "detailed" | "deep";

/**
 * A thinking-level id, matching Pi's `ThinkingLevel`.
 *
 * The UI only offers the three the bug report names (低/中/高); the agent clamps
 * whatever it receives to the current model's supported set.
 */
export type ThinkingLevel = "low" | "medium" | "high";

/** The thinking levels the 模型 menu offers, with their Chinese labels. */
export const THINKING_LEVEL_LABELS: { id: ThinkingLevel; label: string }[] = [
  { id: "low", label: "低" },
  { id: "medium", label: "中" },
  { id: "high", label: "高" },
];

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return value === "low" || value === "medium" || value === "high";
}

/** Teaching style labels, in the order the UI offers them. */
export const TEACHING_STYLE_LABELS: { id: TeachingStyle; label: string }[] = [
  { id: "default", label: "默认" },
  { id: "plain", label: "大白话" },
  { id: "detailed", label: "细讲" },
  { id: "deep", label: "深度" },
];

/** The style set, for runtime validation. */
export const TEACHING_STYLES: TeachingStyle[] = TEACHING_STYLE_LABELS.map((entry) => entry.id);

export function isTeachingStyle(value: unknown): value is TeachingStyle {
  return value === "default" || value === "plain" || value === "detailed" || value === "deep";
}

/** The value range `bodyScale` is clamped to on write. */
export const BODY_SCALE_MIN = 0.75;
export const BODY_SCALE_MAX = 2;

/** The settings returned when the file is missing or invalid. */
export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  // A fresh install opens Chicago: it is the designed, everyday skin. `bare` is
  // a reference/no-style fallback, still selectable but not the default.
  skin: "chicago",
  bodyFont: "pixel",
  // 24px is the default for a new install: 12px pixel body text was judged too
  // small for sustained reading (see docs/desktop/batch-reading-typography.md).
  bodyScale: 2,
  skinOptions: {},
  windowBackground: "",
  disabledSkills: [],
  courseSessions: {},
  courseStartedOn: {},
  controlSessions: {},
  controlBriefOn: {},
};

/**
 * Exhaustiveness guard for discriminated unions: TypeScript rejects the call when
 * a new variant is added but not handled.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Runtime guard for a message's automatic-retry marker. */
export function isRetryState(value: unknown): value is NonNullable<ChatMessage["retry"]> {
  if (value === "recovered") return true;
  return isRecord(value) && isFiniteNumber(value.attempt) && isFiniteNumber(value.maxAttempts);
}

/**
 * Drop a `retry` marker that does not have a valid shape.
 *
 * The marker crosses the agent -> main -> renderer boundary, where it is
 * validated. A malformed value must not reach the UI, but losing the whole
 * message would lose the answer too: only the hint is dropped.
 */
export function withValidRetry(message: ChatMessage): ChatMessage {
  if (message.retry === undefined || isRetryState(message.retry)) return message;
  const plain = { ...message };
  delete plain.retry;
  return plain;
}

/** Runtime guard for a `context-usage` payload (nulls are valid, NaN is not). */
export function isContextUsagePayload(value: unknown): value is ContextUsagePayload {
  if (!isRecord(value)) return false;
  const tokensOk = value.tokens === null || isFiniteNumber(value.tokens);
  const percentOk = value.percent === null || isFiniteNumber(value.percent);
  return tokensOk && percentOk && isFiniteNumber(value.contextWindow);
}

/** Runtime guard for a `compaction` payload. */
export function isCompactionPayload(value: unknown): value is CompactionPayload {
  if (!isRecord(value)) return false;
  if (value.phase !== "start" && value.phase !== "end") return false;
  if (value.reason !== "manual" && value.reason !== "threshold" && value.reason !== "overflow") {
    return false;
  }
  if (value.aborted !== undefined && typeof value.aborted !== "boolean") return false;
  return value.errorMessage === undefined || typeof value.errorMessage === "string";
}

/**
 * Runtime guard for renderer -> main requests.
 *
 * The renderer runs untrusted-ish code (model output reaches it), so the main
 * process validates the shape before forwarding to the agent process.
 */
export function isHostToAgentMessage(value: unknown): value is HostToAgentMessage {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case "init":
    case "continue-session":
    case "list-models":
      return true;
    case "abort":
    case "compact":
      return value.sessionId === undefined || typeof value.sessionId === "string";
    case "new-session":
      return value.role === undefined || isSessionRole(value.role);
    case "list-commands":
      return Array.isArray(value.disabledSkills) && value.disabledSkills.every((name) => typeof name === "string");
    case "open-session":
      return (
        typeof value.requestId === "string" &&
        (value.sessionFile === null || typeof value.sessionFile === "string") &&
        (value.role === undefined || isSessionRole(value.role))
      );
    case "prompt":
      return (
        typeof value.text === "string" &&
        (value.sessionId === undefined || typeof value.sessionId === "string")
      );
    case "set-model":
      return typeof value.provider === "string" && typeof value.id === "string";
    case "set-thinking-level":
      return isThinkingLevel(value.level);
    default:
      return false;
  }
}

/**
 * Runtime guard for a persisted settings object.
 *
 * The file can be hand-edited or left over from an older version, so the main
 * process validates it before use and the renderer validates what it receives.
 * Unknown keys are dropped; an out-of-range `bodyScale` is clamped, and the
 * nested `skinOptions` map is normalized key by key.
 */
export function isDesktopSettings(value: unknown): value is DesktopSettings {
  if (!isRecord(value)) return false;
  return typeof value.skin === "string" && typeof value.bodyScale === "number";
}

/** A hex colour (`#rgb` / `#rrggbb`) from a persisted value, or empty to drop it. */
function normalizeBackgroundColor(value: unknown): string {
  if (typeof value !== "string") return "";
  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value.trim()) ? value.trim() : "";
}

/**
 * Coerce a persisted `skinOptions` value into `{ skinId: { key: value } }`.
 *
 * Only string leaves survive: a hand-edited file with a number or a nested
 * object under an option key is dropped rather than crashing a skin that reads
 * it. This is the one place non-string option values are filtered out.
 */
export function normalizeSkinOptions(value: unknown): Record<string, Record<string, string>> {
  if (!isRecord(value)) return {};
  const result: Record<string, Record<string, string>> = {};
  for (const [skinId, options] of Object.entries(value)) {
    if (!isRecord(options)) continue;
    const clean: Record<string, string> = {};
    for (const [key, optionValue] of Object.entries(options)) {
      if (typeof optionValue === "string") clean[key] = optionValue;
    }
    if (Object.keys(clean).length > 0) result[skinId] = clean;
  }
  return result;
}

/** Coerce a persisted `disabledSkills` value into a list of unique skill names. */
export function normalizeDisabledSkills(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim() !== "") seen.add(entry.trim());
  }
  return [...seen];
}

/** Coerce a persisted `courseSessions` value into `{ slug: sessionFile }`. */
export function normalizeCourseSessions(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};
  for (const [slug, file] of Object.entries(value)) {
    if (slug.trim() !== "" && typeof file === "string" && file.endsWith(".jsonl")) result[slug] = file;
  }
  return result;
}

/** True for a real `YYYY-MM-DD` calendar date (rejects `2026-13-40`). */
function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearText = "", monthText = "", dayText = ""] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * Coerce a persisted `courseStartedOn` value into `{ slug: YYYY-MM-DD }`.
 *
 * Only real calendar dates survive, so a hand-edited file cannot make a course
 * look "started today" with a malformed string. Keys must be non-empty slugs.
 */
export function normalizeCourseStartedOn(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};
  for (const [slug, day] of Object.entries(value)) {
    if (slug.trim() !== "" && typeof day === "string" && isIsoDate(day)) result[slug] = day;
  }
  return result;
}

/** Coerce arbitrary parsed JSON into valid settings, falling back to defaults. */
export function normalizeDesktopSettings(value: unknown): DesktopSettings {
  if (!isDesktopSettings(value)) return { ...DEFAULT_DESKTOP_SETTINGS };
  const record = value as unknown as Record<string, unknown>;
  const skin = value.skin.trim() || DEFAULT_DESKTOP_SETTINGS.skin;
  const bodyFont = isBodyFont(record.bodyFont) ? record.bodyFont : DEFAULT_DESKTOP_SETTINGS.bodyFont;
  const bodyScale = Math.min(BODY_SCALE_MAX, Math.max(BODY_SCALE_MIN, value.bodyScale));
  return {
    skin,
    bodyFont,
    bodyScale,
    skinOptions: normalizeSkinOptions(record.skinOptions),
    windowBackground: normalizeBackgroundColor(record.windowBackground),
    disabledSkills: normalizeDisabledSkills(record.disabledSkills),
    courseSessions: normalizeCourseSessions(record.courseSessions),
    courseStartedOn: normalizeCourseStartedOn(record.courseStartedOn),
    controlSessions: normalizeCourseSessions(record.controlSessions),
    controlBriefOn: normalizeCourseStartedOn(record.controlBriefOn),
  };
}

/** The typed API the preload exposes on `window.xuegen`. */
export interface XuegenBridge {
  /** Send a request to the agent process. */
  send(request: HostToAgentMessage): void;
  /** Subscribe to agent events. Returns an unsubscribe function. */
  subscribe(listener: (event: AgentToHostMessage) => void): () => void;
  /** Read the persisted desktop settings (defaults when the file is absent). */
  getSettings(): Promise<DesktopSettings>;
  /** Persist a partial settings update; resolves with the stored settings. */
  setSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings>;
  /** Send a vault data request; always resolves, with `{ok:false}` on failure. */
  data<K extends DataRequest["kind"]>(
    request: Extract<DataRequest, { kind: K }>,
  ): Promise<DataResultFor<K>>;
}
