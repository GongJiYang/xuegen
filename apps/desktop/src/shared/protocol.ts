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
}

/** A model list plus the reason it may be empty. */
export interface ModelListPayload {
  models: ModelInfo[];
  /** Set when no credentials are configured, so the UI can prompt for /login. */
  reason?: string;
}

/** Session status snapshot sent to the renderer. */
export interface SessionStatePayload {
  cwd: string;
  model: ModelInfo | null;
  sessionFile: string | null;
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
  | { type: "prompt"; text: string }
  | { type: "abort" }
  | { type: "new-session" }
  | { type: "continue-session" }
  | { type: "set-model"; provider: string; id: string }
  /** Set the thinking level and remember it as the default (B4). */
  | { type: "set-thinking-level"; level: ThinkingLevel }
  | { type: "list-models" }
  | { type: "list-commands"; disabledSkills: string[] }
  /**
   * Switch to a specific session: the file of an earlier session to resume, or
   * null for a brand-new one. Each course keeps its own session so contexts never
   * mix. The agent answers with `session-opened` carrying the same `requestId`.
   */
  | { type: "open-session"; requestId: string; sessionFile: string | null };

/** Events the agent process sends back to the host. */
export type AgentToHostMessage =
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
  | { type: "history"; messages: ChatMessage[] }
  | { type: "agent-status"; status: AgentStatus }
  /** Commands the composer's `/` menu offers, sourced from the loaded skills. */
  | { type: "commands"; commands: CommandInfo[] }
  | { type: "fatal"; error: string }
  | { type: "error"; error: string };

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
 * User-visible desktop settings, persisted by the main process to
 * `~/.xuegen/desktop.json`. The renderer reads and writes them through the
 * preload bridge; it never touches the file.
 */
export interface DesktopSettings {
  /** Active skin id; an unknown id falls back to `bare` at load time. */
  skin: string;
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
  /** Per-course teaching style, keyed by course slug. */
  courseStyles: Record<string, TeachingStyle>;
  /** Teaching style for sessions not tied to a course. */
  sessionStyle: TeachingStyle;
  /** The session file each course studies in, keyed by course slug. */
  courseSessions: Record<string, string>;
}

/** Teaching style ids sent to the agent as a `[风格：X]` message prefix. */
export type TeachingStyle = "plain" | "detailed" | "deep";

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
  { id: "plain", label: "大白话" },
  { id: "detailed", label: "细讲" },
  { id: "deep", label: "深度" },
];

/** The style set, for runtime validation. */
export const TEACHING_STYLES: TeachingStyle[] = TEACHING_STYLE_LABELS.map((entry) => entry.id);

export function isTeachingStyle(value: unknown): value is TeachingStyle {
  return value === "plain" || value === "detailed" || value === "deep";
}

/** The value range `bodyScale` is clamped to on write. */
export const BODY_SCALE_MIN = 0.75;
export const BODY_SCALE_MAX = 2;

/** The settings returned when the file is missing or invalid. */
export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  // A fresh install opens Chicago: it is the designed, everyday skin. `bare` is
  // a reference/no-style fallback, still selectable but not the default.
  skin: "chicago",
  bodyScale: 1,
  skinOptions: {},
  windowBackground: "",
  disabledSkills: [],
  courseStyles: {},
  courseSessions: {},
  // The user has only ever used 大白话, so that is the default (see FEATURES.md).
  sessionStyle: "plain",
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
    case "abort":
    case "new-session":
    case "continue-session":
    case "list-models":
      return true;
    case "list-commands":
      return Array.isArray(value.disabledSkills) && value.disabledSkills.every((name) => typeof name === "string");
    case "open-session":
      return typeof value.requestId === "string" && (value.sessionFile === null || typeof value.sessionFile === "string");
    case "prompt":
      return typeof value.text === "string";
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

/** Coerce a persisted `courseStyles` value into `{ slug: style }`, dropping unknowns. */
export function normalizeCourseStyles(value: unknown): Record<string, TeachingStyle> {
  if (!isRecord(value)) return {};
  const result: Record<string, TeachingStyle> = {};
  for (const [slug, style] of Object.entries(value)) {
    if (slug.trim() !== "" && isTeachingStyle(style)) result[slug] = style;
  }
  return result;
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

/** Coerce arbitrary parsed JSON into valid settings, falling back to defaults. */
export function normalizeDesktopSettings(value: unknown): DesktopSettings {
  if (!isDesktopSettings(value)) return { ...DEFAULT_DESKTOP_SETTINGS };
  const record = value as unknown as Record<string, unknown>;
  const skin = value.skin.trim() || DEFAULT_DESKTOP_SETTINGS.skin;
  const bodyScale = Math.min(BODY_SCALE_MAX, Math.max(BODY_SCALE_MIN, value.bodyScale));
  return {
    skin,
    bodyScale,
    skinOptions: normalizeSkinOptions(record.skinOptions),
    windowBackground: normalizeBackgroundColor(record.windowBackground),
    disabledSkills: normalizeDisabledSkills(record.disabledSkills),
    courseStyles: normalizeCourseStyles(record.courseStyles),
    sessionStyle: isTeachingStyle(record.sessionStyle)
      ? record.sessionStyle
      : DEFAULT_DESKTOP_SETTINGS.sessionStyle,
    courseSessions: normalizeCourseSessions(record.courseSessions),
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
