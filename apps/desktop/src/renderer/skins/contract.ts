/**
 * Skin contract: the single source of truth for what a skin is.
 *
 * A skin is a set of slot components plus a stylesheet, a motion preset, and the
 * content renderers. core hands each slot a *view model* (props type here) and a
 * set of callbacks; a slot decides only how to present them. Props carry no
 * styling parameters — appearance belongs to the skin's own CSS.
 *
 * Adding a slot or a view-model field is a contract change: the `bare` reference
 * skin must implement it too, or the contract test fails.
 */

import type { ComponentType } from "react";
import type {
  AgentStatus,
  BodyFont,
  ChatMessage,
  ModelInfo,
  TeachingStyle,
  ToolCallView,
} from "@shared/protocol.js";
import type {
  AnkiStatus,
  CalendarMonth,
  CardsStats,
  CourseSummary,
  CycleDay,
  CycleMonth,
  CycleOverview,
  ReadingDue,
  ReadingItem,
  ReadingPriority,
  ReadingSource,
  ReadingStats,
  SkillInfo,
  SkillReview,
} from "@shared/data-protocol.js";
import type { MotionPreset } from "../core/motion/index.js";
import type { ContentNode } from "../core/content/nodes.js";
import type { AsyncState } from "../core/board/state.js";
import type { NewCourseRequest } from "../core/board/course-prompts.js";
import type { CourseIntro, CourseIntroState } from "../core/board/course-intro.js";
import type { CalendarCell } from "../core/board/use-calendar.js";
import type { ProgressGroups } from "../core/board/progress-groups.js";
import type { ControlView } from "../core/board/bot-state.js";
import type { Activity } from "../core/chat/activity.js";
import type { PinBoard } from "../core/chat/pin-board.js";
import type { ControlCardRow, ControlCardView } from "../core/board/control-card.js";
import type { ShelfPanelView } from "../core/board/shelf-view.js";
import type { SessionGroup, SessionRow } from "../core/board/session-list.js";
import type { SlashCommand, SlashGroup } from "../core/commands/commands.js";
import type { ResumePoint, TodayPlanItem } from "../core/today.js";
import type { UpdateBarState } from "../core/update/use-update.js";
import type { PlanView } from "../core/board/planbook-nav.js";
import type { PanelTile, ShelfRow, UnplannedMaterial } from "../core/board/panel.js";
import type { PlanDay, PlanWeek } from "../core/board/planbook.js";

/** How a skin draws a piece of classified content. */
export interface ContentRenderers {
  /** Render one classified node (table, code, mermaid, formula, callout, text). */
  Node: ComponentType<{ node: ContentNode; streaming?: boolean }>;
}

/** The appearance entry every Shell must provide: a menu listing all skins. */
export interface SkinChoice {
  id: string;
  name: string;
}

/** A callback the Shell calls to switch skins. */
export type SkinSelectHandler = (id: string) => void;

/**
 * Context usage as the Shell's title bar and its small panel need it.
 *
 * `label` is the finished title-bar string (skeleton, 即将压缩 suffix, or the
 * 正在压缩 line), so no skin invents its own wording. `detail` is the
 * 「已用 … / … token」 line for the panel opened by clicking it.
 */
export interface ContextUsageView {
  label: string;
  detail: string;
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
  compacting: boolean;
  /** Ask the agent to compact now (`/compact` through the host channel). */
  onCompact(): void;
}

/**
 * The session list the Shell's title/… menu and the calendar open.
 *
 * `groups` are already day-grouped rows (today / yesterday / MM-DD 周X); the
 * skin only decides how the list looks. `onPick` opens a transcript by file —
 * the row's course, when known, becomes the active course.
 */
export interface SessionsView {
  open: boolean;
  onOpenChange(open: boolean): void;
  status: "loading" | "ready" | "error";
  groups: SessionGroup[];
  onPick(file: string): void;
  onNew(): void;
}

export interface ShellProps {
  /** The whole application body (thread, composer, panels), to place in a layout. */
  children: React.ReactNode;
  /**
   * What the conversation is about: the active course's title while studying a
   * course (each course has its own session), otherwise null for a free chat.
   */
  sessionTitle: string | null;
  /** The 总控 avatar while the 总控 session is open; null in any other session. */
  control: ControlView | null;
  /** Every registered skin, for the mandatory "appearance" entry. */
  skins: SkinChoice[];
  /** Currently active skin id. */
  activeSkin: string;
  /** Switch to another skin. */
  onSelectSkin: SkinSelectHandler;
  /** Message body font. */
  bodyFont: BodyFont;
  /** Change the body font; core also snaps the scale to its ladder. */
  onBodyFont(font: BodyFont): void;
  /** Current body scale multiplier. */
  bodyScale: number;
  /** Change the body scale (one of the current font's rungs). */
  onBodyScale(value: number): void;
  /**
   * The active skin's own appearance options, keyed by option name.
   *
   * Only the *active* skin's options are exposed (a skin never sees another
   * skin's). A skin declares the keys it understands — Chicago uses `palette` —
   * and supplies its own defaults when a key is absent or holds an unknown
   * value. Skins without options (e.g. `bare`) ignore this field.
   */
  skinOptions: Record<string, string>;
  /** Set one of this skin's appearance options (persisted per skin id). */
  onSkinOption(key: string, value: string): void;
  /**
   * Report the window background colour the skin paints with (anti-flash).
   *
   * A skin that owns background colour (Chicago's palette) calls this whenever
   * that colour changes; core persists it so the main process can open the
   * window in the right colour and never flash a default white. Skins with a
   * neutral background pass an empty string (meaning "no preference").
   */
  onWindowBackground(color: string): void;
  /** Model list for the header's model picker. */
  models: ModelInfo[];
  /** Currently active model, if any. */
  currentModel: ModelInfo | null;
  /** Switch the session model. */
  onSelectModel(provider: string, id: string): void;
  /**
   * The session's current thinking level, or null when unsupported.
   *
   * The 模型 menu shows a tick on the matching level and disables the group when
   * this is null (B4).
   */
  thinkingLevel: string | null;
  /** Levels the active model supports; others are shown disabled. */
  thinkingLevels: string[];
  /** Change the thinking level; persists as the default. */
  onSelectThinking(level: string): void;
  /** Start a fresh session. */
  onNewSession(): void;
  /** Open the session list (⋯ menu 「会话列表」). */
  onOpenSessions(): void;
  /** The session list behind the title/menu entry. */
  sessions: SessionsView;
  /**
   * A session switch is held waiting on the learner: show the switch-guard
   * confirm ({@link strings.switchGuard}).
   */
  pendingSwitch: boolean;
  /** 「切换」: stop the answer, then run the held switch. */
  confirmSwitch(): void;
  /** 「等它说完」: drop the held switch. */
  cancelSwitch(): void;
  /** Agent process lifecycle, so the Shell can show a status line. */
  agentStatus: AgentStatus;
  /** Notices (errors, missing login, fallbacks) for the Shell to surface. */
  notices: NoticeItem[];
  /** Dismiss a notice by index. */
  onDismissNotice(index: number): void;
  /** Estimated context usage plus the manual compact action. */
  contextUsage: ContextUsageView;

  /** The identified tool windows, in the order the dock shows them. */
  tools: ToolDescriptor[];
  /** The tool window currently shown, or null when none is open. */
  activeTool: ToolId | null;
  /** Open a tool window (⌘1–⌘5 and the 学习 menu call this). */
  onOpenTool(tool: ToolId): void;
  /** The desktop focus mode (right column and icon dock hidden). */
  focusMode: boolean;
  /** Toggle focus mode (⌘. and the 显示 menu call this). */
  onToggleFocus(): void;

  /** The current teaching style of the session (single source for the UI). */
  style: TeachingStyle;
  /** Change the style; holds in memory for the running session, today only. */
  onSelectStyle(style: TeachingStyle): void;
  /** The course whose style is being edited, or null for a course-less session. */
  styleCourse: string | null;

  /** Send a prompt without going through the composer (menu / panel actions). */
  onPrompt(text: string): void;

  /** The view models the 今天 window and the five tool windows draw. */
  panels: ShellPanels;

  /**
   * The 总控 planbook (PLANBOOK-1111, batch 3b), or null on every other session.
   *
   * When set, the Shell puts it beside the conversation — Bear shows the book
   * on the left and the chat in a right column; the reference skins stack it
   * above `children`.
   */
  planbook: React.ReactNode | null;
  /** Whether the planbook's chat column is open (Bear's 「和总控聊」 toggle). */
  chatOpen: boolean;
  /** Toggle the planbook's chat column. */
  onToggleChat(): void;
}

/** The panel view models the Shell places in its side windows. */
export interface ShellPanels {
  today: TodayPanelProps;
  progress: Omit<ProgressPanelProps, "tool">;
  reading: Omit<ReadingPanelProps, "tool">;
  cards: Omit<CardsPanelProps, "tool">;
  calendar: Omit<CalendarPanelProps, "tool">;
  skills: Omit<SkillsPanelProps, "tool">;
}

/** A local-only line shown in the transcript (e.g. where a compaction happened). */
export interface ThreadNote {
  /** Render before the message at this index; equal to the length means last. */
  beforeIndex: number;
  /** Ready-to-show text from `core/strings.ts`. */
  text: string;
}

export interface ThreadProps {
  /** Rendered above the messages (the 总控 今日卡), or null. */
  header: React.ReactNode | null;
  /**
   * The 「更早的对话」 fold row at the top of the message list, or null.
   *
   * On the 总控 session the card moved into the planbook's day view, so the
   * fold row renders as a plain button where the transcript starts.
   */
  older: { label: string; onToggle(): void } | null;
  messages: ChatMessage[];
  /**
   * True while the last assistant block is still empty (thinking).
   *
   * A session-level flag: the skin must gate it per message with core's
   * `thinkingFor(messages, index, thinking)` so only the last assistant block
   * shows 正在思考 — not every answer in the transcript.
   */
  thinking: boolean;
  /** Hint shown when there are no messages because no model is available. */
  noModels: boolean;
  /** Reason the model list may be empty (credentials missing, etc.). */
  modelsReason: string | null;
  /** Render one assistant/user message (core-provided slot). */
  renderMessage(message: ChatMessage, thinking: boolean): React.ReactNode;
  /**
   * The local opening card, or null when no course was just started.
   *
   * Render it before message `beforeIndex`; when `beforeIndex` is at or past the
   * end, render it last (the opening user message has not arrived yet).
   */
  intro: CourseIntroState | null;
  /**
   * Local-only annotations to render between messages. They are never written
   * to the session file and never sent to the model.
   */
  systemNotes: ThreadNote[];
  /**
   * The answer-in-progress line for the whole turn (core's `turnActivity`), or
   * null when idle. A skin that draws it once after the transcript (Bear) never
   * remounts it between assistant blocks; skins may ignore it.
   */
  activity: Activity | null;
  /** The lesson's pinned 今日要点 box and latest questions (core's `pinBoard`), or null. Skins may ignore it. */
  pin: PinBoard | null;
}

export interface CourseIntroCardProps {
  card: CourseIntro;
}

export interface UserMessageProps {
  message: ChatMessage;
  /**
   * The message body with any leading `[风格：X]` marker removed.
   *
   * core strips the marker that {@link styleTag} carries, so a skin never shows
   * the raw prefix twice.
   */
  body: string;
  /**
   * The teaching-style label shown before the text, or null.
   *
   * core splits a leading `[风格：X]` marker off the echoed message and passes the
   * label here, so the transcript shows a tag instead of the raw prefix.
   */
  styleTag: string | null;
  /**
   * Set when the interface sent this message for the user (开课, 收课 …): a
   * one-line label such as 「开今天的课 · 离散数学（Epp, 5th ed）」. The skin
   * shows the label folded and reveals {@link body} only on demand.
   */
  actionLabel: string | null;
}

export interface AssistantMessageProps {
  message: ChatMessage;
  /** True when this block should show the thinking indicator. */
  thinking: boolean;
  /** What 学根 is doing in this block right now (思考 / 查资料 / 动手 / 写), or null. */
  activity: Activity | null;
  /** Copy the raw Markdown to the clipboard. */
  onCopy(): void;
  /** True for a moment after a successful copy. */
  copied: boolean;
  /** Resend the last user message (shown when the answer was stopped/failed). */
  onRetry(): void;
  /** Classified content nodes of the message body. */
  nodes: ContentNode[];
  /** True while text is still streaming into this message. */
  streaming: boolean;
  /** Render one classified content node (the skin's ContentRenderers.Node). */
  renderContent(node: ContentNode, streaming: boolean): React.ReactNode;
  /** Render one tool-call card. */
  renderToolCall(call: ToolCallView): React.ReactNode;
}

export interface ToolActivityProps {
  call: ToolCallView;
}

export interface ThinkingProps {
  /** Presentational only; the Shell/Thread decides when to mount it. */
  label: string;
}

/** The update bar above the transcript (design `?d=update`). Renders nothing when idle or dismissed. */
export type UpdateBarProps = UpdateBarState;

export interface ExerciseProps {
  /** The callout title, or empty to use the default label. */
  title: string;
  /** Body Markdown of the exercise. */
  body: string;
  /** Render the exercise body through the content renderers. */
  renderContent(node: ContentNode): React.ReactNode;
  /** Classified nodes of the exercise body. */
  nodes: ContentNode[];
  /**
   * The 1-based question number within the message.
   *
   * Shown in the 「正在回答：第 N 题」 banner and in the hint/skip prompts, so the
   * learner and 学根 refer to the same question. Assigned by core when it routes
   * `> [!question]` callouts to this slot.
   */
  index: number;
  /** Focus the composer and mark question {@link index} as being answered. */
  onAnswer(): void;
  /** Ask 学根 for a hint on question {@link index}. */
  onHint(): void;
  /** Skip question {@link index}. */
  onSkip(): void;
}

export interface ComposerProps {
  streaming: boolean;
  disabled: boolean;
  onSend(text: string): void;
  /**
   * Stop the running answer.
   *
   * Returns the queued messages the stop withdrew from the conversation (the
   * user's own words, several joined by a blank line), or — when nothing was
   * queued — the prompt that was just sent; null when there is none to give
   * back. The skin puts it back into the field (in front of any draft), so an
   * accidental send or stop can be undone and a withdrawn message is not lost.
   */
  onStop(): string | null;
  /**
   * Words a confirmed session switch withdrew from the old session's queue; the
   * skin puts them into the field once, then calls onCarriedDraftTaken.
   */
  carriedDraft: string | null;
  /** The skin has put {@link carriedDraft} into the field: core forgets it. */
  onCarriedDraftTaken(): void;
  /** The session's teaching style, shown as the radio row above the field. */
  style: TeachingStyle;
  /** Change the style from the composer's radio row. */
  onStyle(style: TeachingStyle): void;
  /** True while the `/` command menu is open. */
  commandsOpen: boolean;
  /** The grouped commands the `/` menu shows (already filtered). */
  commandGroups: SlashGroup[];
  /** The flat, filtered command list the keyboard selection indexes into. */
  commands: SlashCommand[];
  /** Index of the highlighted command in {@link commands}. */
  selectedCommand: number;
  /** Highlight a command (pointer hover). */
  onSelectCommand(index: number): void;
  /** Run a command (click or Enter). */
  onRunCommand(command: SlashCommand): void;
  /** Close the `/` menu (Escape, or the text no longer starting with `/`). */
  onCloseCommands(): void;
  /** Report the field's text so core can open/filter the `/` menu. */
  onInput(text: string): void;
  /**
   * The exercise question being answered, or null.
   *
   * When set (「我来回答」 on an 「检查理解」 box), the composer shows a
   * 「正在回答：第 N 题」 banner above the field.
   */
  answering: number | null;
  /** Leave 「检查理解」 answering mode without sending (optional). */
  onCancelAnswer?(): void;
  /**
   * A counter that increments whenever core wants the field focused.
   *
   * A monotonically increasing number (not a boolean) so a second request for
   * the same question still triggers the skin's focus effect.
   */
  focusRequest: number;
  /**
   * 总结 · 制卡 · 收课 in a course session; empty elsewhere. Disabled while streaming.
   *
   * `hint` says what the click changes (hover text); `options` is the 「收课 ▾」
   * menu — an action with options opens the menu instead of running directly.
   */
  lessonActions: { label: string; hint: string; run(): void; options: { label: string; run(): void }[] }[];
  /** The label for the 「默认」 style: 「默认 · 细讲」 when the subject has a default, else 「默认」. */
  defaultStyleLabel: string;
}

export interface ModelPickerProps {
  models: ModelInfo[];
  current: ModelInfo | null;
  onSelect(provider: string, id: string): void;
  disabled: boolean;
}

/** One user-visible notice (error, login hint, skin fallback). */
export interface NoticeItem {
  /** Severity drives the skin's own styling; the text is core's. */
  tone: "error" | "info";
  text: string;
  /**
   * Raw source text for an error (upstream HTTP body, socket error), shown in an
   * expandable "详情" so the translated `text` stays readable but the original is
   * still available for troubleshooting.
   */
  detail?: string;
  /** An optional button on the notice (e.g. 「开今天的课 →」). */
  action?: { label: string; run(): void };
}

export interface NoticeProps {
  notice: NoticeItem;
  /** Dismiss this notice; omitted for non-dismissible status lines. */
  onDismiss?: () => void;
}

export interface BoardPanelProps {
  /** Batch 2 fills this; before then a skin renders an empty state. */
  empty: true;
}

export interface NotesPanelProps {
  /** Batch 3 fills this; before then a skin renders an empty state. */
  empty: true;
}

/** The five tool windows the dock can open. */
export type ToolId = "progress" | "reading" | "cards" | "calendar" | "skills";

/**
 * A field inside a tool window a command can focus once it is open.
 *
 * Used by `/加入阅读`, which opens the reading window and puts the cursor in the
 * add box.
 */
export type ToolFocus = "reading-add";

/** A dock entry: the tool's id and its icon/name come from core strings. */
export interface ToolDescriptor {
  id: ToolId;
  /** Display name, from `core/strings.ts`. */
  name: string;
  /** The ⌘ number that opens it (1–5). */
  shortcut: string;
}

/** Shared shape for every tool-window body: which tool it is. */
export interface ToolPanelProps {
  /** The tool this panel belongs to, so the window title can be set. */
  tool: ToolId;
}

/** The 今天 window: rolling counts plus the 接着上次 card. */
export interface TodayPanelProps {
  /** Today's concrete plans and records, listed under 「今天计划」. */
  todayPlan: TodayPlanItem[];
  /** Tomorrow's plans (course schedule rows, reading due), listed under 「明天」. */
  tomorrowPlan: TodayPlanItem[];
  /** Reading due from stats. */
  readingDue: AsyncState<ReadingStats>;
  cards: AsyncState<CardsStats>;
  /** The course to resume, or null when there is no record yet. */
  resume: ResumePoint | null;
  /** Courses already opened today, so 继续学习 can read 「回到这门课」 instead. */
  startedToday: Record<string, boolean>;
  /** Today's and tomorrow's place in the study cycle; `cycle` is null outside every cycle. */
  cycleToday: AsyncState<CycleDay>;
  cycleTomorrow: AsyncState<CycleDay>;
  /** The course list, for the 整合 day's 本周 counts. */
  courses: AsyncState<CourseSummary[]>;
  /** Anki status, for the 「Anki」 row's due count. */
  anki: AsyncState<AnkiStatus>;
  /** Start a cycle lesson in its course's session (same as 总进度's 开始学习). */
  onStudyCourse(slug: string): void;
  /** Open a course's session and ask for this week's 周核实. */
  onVerifyCourse(slug: string): void;
  /** Open the 总控 session, or null outside a study cycle. */
  onOpenControl: (() => void) | null;
  /** Resume the chosen course, or switch back to it when it was opened today. */
  onResume(): void;
  /**
   * Whether the agent can accept a prompt yet.
   *
   * False while the agent/model list is still starting: 继续学习 then shows
   * 「准备中…」 and is disabled, so the click is never silently dropped.
   */
  agentReady: boolean;
}

export interface ProgressPanelProps extends ToolPanelProps {
  courses: AsyncState<CourseSummary[]>;
  /** The style picked per course slug today, so each row's radio reflects it. */
  courseStyles: Record<string, TeachingStyle>;
  /** Change one course's style pick (today only, not persisted). */
  onCourseStyle(slug: string, style: TeachingStyle): void;
  /** Courses already opened today, so a row's button can read 「回到这门课」. */
  startedToday: Record<string, boolean>;
  /** Start today's lesson, or switch back to a course opened today. */
  onStudy(course: CourseSummary): void;
  /** Create a course through the `course` skill. */
  onNewCourse(request: NewCourseRequest): void;
  /** Ask the `course` skill to change one course's plan. */
  onEditPlan(course: CourseSummary, change: string): void;
  /** Candidate material paths for the new-course form. */
  sources: AsyncState<ReadingSource[]>;
  /** Courses grouped by subject for the current cycle, or null to show the plain list. */
  groups: ProgressGroups | null;
  /** The two-year route, the current cycle and its courses' lesson counts (cycle.mjs overview). */
  overview: AsyncState<CycleOverview>;
}

/** What adding a reading source produced, for the panel's confirmation line. */
export interface AddedReading {
  title: string;
  /** The scheduled due date (`YYYY-MM-DD`). */
  due: string;
}

export interface ReadingPanelProps extends ToolPanelProps {
  /** The 书房 section above the queue (`shelf.list` through `shelfPanel`). */
  shelf: AsyncState<ShelfPanelView>;
  /** The whole queue (excluding done), sorted by due date. */
  queue: AsyncState<ReadingItem[]>;
  sources: AsyncState<ReadingSource[]>;
  /**
   * Add a vault source path to the queue; resolves with the new item, or null
   * on failure. `due` is "today" when the user ticked 「今天就读」, "scheduled"
   * otherwise.
   */
  onAdd(source: string, priority: ReadingPriority, due: ReadingDue): Promise<AddedReading | null>;
  /** Hand an http(s) URL to the agent to clip and queue. */
  onClip(url: string, priority: ReadingPriority, due: ReadingDue): void;
  /** Advance an item: next (record position), postpone, or done. */
  onReview(slug: string, outcome: "next" | "postpone" | "done", position?: string): void;
  /** 「把 N 句做成卡 →」: ask 学根 to draft cards from one book's pending extracts. */
  onShelfCards(slug: string): void;
  /**
   * A field the panel should focus as soon as it is mounted/shown.
   *
   * `/加入阅读` opens the reading window with `reading-add`, so the cursor lands
   * in the add box; the panel reports back via {@link onFocusHandled}.
   */
  focus?: ToolFocus | undefined;
  /** Called once the requested focus has been applied, so core clears it. */
  onFocusHandled?(): void;
}

export interface CardsPanelProps extends ToolPanelProps {
  cards: AsyncState<CardsStats>;
  anki: AsyncState<AnkiStatus>;
  /** Store a new card in the vault. */
  onAdd(deck: string, front: string, back: string): void;
  /** Re-poll AnkiConnect after the user opens Anki. */
  onRetryAnki(): void;
  /** Ask the agent to draft cards from pending extracts. */
  onDraft(): void;
}

export interface CalendarPanelProps extends ToolPanelProps {
  month: AsyncState<CalendarMonth>;
  /** The month key (`YYYY-MM`) being shown, for the header and ◀ ▶. */
  monthKey: string;
  /** Go to the previous / next month. */
  onPrevMonth(): void;
  onNextMonth(): void;
  /** The laid-out grid (Monday-first), so every skin renders the same calendar. */
  cells: CalendarCell[];
  /** The selected day's date (`YYYY-MM-DD`). */
  selected: string;
  /** Select a day (single click shows its detail). */
  onSelectDay(date: string): void;
  /** Open the day editor (double click, or the 写笔记 button). */
  onEditDay(date: string): void;
  /** Jump to today's month and select today (optional; a skin may omit the button). */
  onToday?(): void;
  /** Course slug → title, so the day's detail shows a name, not a slug. */
  courseTitles: Record<string, string>;
  /** The displayed month's study-cycle day types; days outside every cycle are absent. */
  cycleMonth: AsyncState<CycleMonth>;
  /** That day's sessions; empty when none or not loaded. */
  daySessions(date: string): SessionRow[];
  /** Open a transcript from the day's session list. */
  onOpenSession(file: string): void;
}

export interface SkillsPanelProps extends ToolPanelProps {
  skills: AsyncState<SkillInfo[]>;
  /** Toggle an installed (builtin / personal) skill. Pending skills go through review. */
  onToggle(name: string, enabled: boolean): void;
  /** Fetch a skill repo into the pending area. */
  onFetch(url: string): void;
  /** Result line of the last fetch (success or the reason it failed), or null. */
  fetchNotice: string | null;
  /** The pending skill under review, or null when the review dialog is closed. */
  review: AsyncState<SkillReview> | null;
  /** Open the review dialog for a pending skill. */
  onReview(name: string): void;
  /** Close the review dialog without deciding. */
  onCloseReview(): void;
  /** Enable the reviewed skill (moves it out of the pending area). */
  onEnableReviewed(name: string): void;
  /** Delete the reviewed skill from the pending area. */
  onDiscardReviewed(name: string): void;
}

/** The day editor dialog: title, body, save path, save/cancel. */
export interface DayEditorProps {
  /** The date being edited (`YYYY-MM-DD`). */
  date: string;
  /** The human title (e.g. "11月5日 周四"). */
  title: string;
  /** The initial body; empty for a new note. */
  initialText: string;
  /** The vault-relative path the note will be saved to, for the hint line. */
  savePath: string;
  /** Persist the note and close. */
  onSave(text: string): void;
  /** Close without saving. */
  onCancel(): void;
}

/** The `/` command menu, rendered above the composer. */
export interface SlashMenuProps {
  groups: SlashGroup[];
  /** The flat filtered list the selection indexes into. */
  commands: SlashCommand[];
  selected: number;
  onSelect(index: number): void;
  onRun(command: SlashCommand): void;
}

/** The tool icon dock (the right-hand icon column). */
export interface ToolDockProps {
  tools: ToolDescriptor[];
  active: ToolId | null;
  onOpen(tool: ToolId): void;
  /**
   * Whether the 今天 window is currently shown.
   *
   * The dock carries a 今天 entry beside the five tools, so a collapsed 今天 can
   * always be reopened from the icon column.
   */
  todayActive: boolean;
  /** Show (or switch to) the 今天 window. */
  onOpenToday(): void;
}

/** The inline 「摘几句」 form under a 书房 row of the 今日卡. */
export interface ControlCardExtract {
  /** The book the form saves into (matches the row's `extract` action). */
  slug: string;
  /** The block just read, e.g. 「pp.1–9」, shown as the page field's placeholder. */
  pages: string;
  saving: boolean;
  /** A one-line error (bad page, empty text, failed write), else null. */
  error: string | null;
  onSave(page: string, text: string): void;
  onCancel(): void;
}

/**
 * The 总控 周计划本 (PLANBOOK-1111, batch 3b): the day / week / month views.
 *
 * `week` / `day` / `month` hold the loaded view model for the view `view`
 * names (null until it loads); `todayCard` is the whole 今日卡 element for the
 * day view on today, and `tomorrow` is its 「明天 …」 line.
 */
export interface PlanbookProps {
  /** Which view is shown. */
  view: PlanView;
  /** Switch the view (日 / 周 / 月 segmented buttons). */
  onView(view: PlanView): void;
  /** The range title beside ‹ ›: 「11-11 周三」 / 「C1 W1 · 11-06 – 11-12」 / 「2026 年 11 月」. */
  label: string;
  onPrev(): void;
  onNext(): void;
  onToday(): void;
  /** 「今天」 is disabled while the shown range already contains it. */
  todayDisabled: boolean;
  /** Print the planbook (window.print). */
  onPrint(): void;
  state: "loading" | "error" | "ready";
  error: string | null;
  /** `view === "week"`: the shown week. */
  week: PlanWeek | null;
  /** `view === "day"`: the shown day. */
  day: PlanDay | null;
  /** `view === "month"`: every day of the shown month. */
  month: PlanDay[] | null;
  /**
   * The 今日卡 element for the day view on today (all buttons and the undo
   * rows work), or null — e.g. when looking at another day or outside a cycle.
   */
  todayCard: React.ReactNode | null;
  /** The 「明天 …」 line under today's list, or null outside every cycle. */
  tomorrow: string | null;
  /** A week/month cell click opens that day in the day view. */
  onOpenDay(date: string): void;
  /** The week grid's today Anki cell 「打开 →」: the 今日卡 Anki row's action. */
  onOpenAnki(): void;
}

/**
 * The 总控 面板 (design `?d=dash`, PANEL-PLAN): one page with the status row,
 * 今天, 本周 / 月, 总进度, 书房, 卡片. Replaces the 周计划本 in the 总控 session;
 * the chat column stays beside it. Every block gets its own loading / error
 * state (checklist 1.3), so the props carry the per-block view models as-is.
 */
export interface ControlPanelProps {
  tiles: PanelTile[];
  /** 今天: the planbook's day view for today (null until loaded). */
  day: PlanDay | null;
  /** 本周 / 月: the shown week or month, plus its view switch and range. */
  week: PlanWeek | null;
  month: PlanDay[] | null;
  view: PlanView;
  onView(view: PlanView): void;
  label: string;
  onPrev(): void;
  onNext(): void;
  onToday(): void;
  todayDisabled: boolean;
  onPrint(): void;
  /** 书房 rows (在读 → 带读 → 暂停 → 排队); null while loading. */
  shelf: ShelfRow[] | null;
  /** 已登记、没排的资料; null while loading. */
  unplanned: UnplannedMaterial[] | null;
  /** 总进度: the overview (null while loading). */
  overview: CycleOverview | null;
  /** 卡片: the cards stats (null while loading). */
  cards: CardsStats | null;
  /** The 今日卡 element for the day view on today, or null. */
  todayCard: React.ReactNode | null;
  /** The 「明天 …」 line under today's list, or null. */
  tomorrow: string | null;
  /** 书房 / 今天 / 周月格子的动作：开课、带读、读完这段、打开 Anki。 */
  onOpenDay(date: string): void;
  onOpenAnki(): void;
  /** Ask the 总控 for a book change (the message is already marked, see control-prompts). */
  onAsk(message: string): void;
  /** Open the 技能与设置 dialog. */
  onOpenSkills(): void;
  /** Open the 新卡片 dialog (the cards tool: deck table and the new-card form). */
  onOpenCards(): void;
}

/** The 总控 今日卡 above the 总控 session's transcript. */
export interface ControlCardProps {
  view: ControlCardView;
  /** Run a row's button. */
  onAction(row: ControlCardRow): void;
  /** 「让总控说说」: ask the model for the brief (folded as 今日简报). */
  onAskBrief(): void;
  /** True while an answer streams or a 「读完了」 write runs: buttons disabled. */
  busy: boolean;
  /** A one-line error after a failed 「读完了」, else null. */
  error: string | null;
  /** The open 「摘几句」 form, or null. */
  extract: ControlCardExtract | null;
  /** The 「更早的对话」 row under the card, or null. */
  older: { label: string; onToggle(): void } | null;
}

/** Every component a skin must provide. */
export interface SkinSlots {
  Shell: ComponentType<ShellProps>;
  Thread: ComponentType<ThreadProps>;
  UserMessage: ComponentType<UserMessageProps>;
  AssistantMessage: ComponentType<AssistantMessageProps>;
  ToolActivity: ComponentType<ToolActivityProps>;
  Thinking: ComponentType<ThinkingProps>;
  UpdateBar: ComponentType<UpdateBarProps>;
  Exercise: ComponentType<ExerciseProps>;
  Composer: ComponentType<ComposerProps>;
  ModelPicker: ComponentType<ModelPickerProps>;
  Notice: ComponentType<NoticeProps>;
  BoardPanel: ComponentType<BoardPanelProps>;
  NotesPanel: ComponentType<NotesPanelProps>;

  /** The right-hand tool icon dock. */
  ToolDock: ComponentType<ToolDockProps>;
  /** The 今天 window body. */
  TodayPanel: ComponentType<TodayPanelProps>;
  /** The five tool-window bodies. */
  ProgressPanel: ComponentType<ProgressPanelProps>;
  ReadingPanel: ComponentType<ReadingPanelProps>;
  CardsPanel: ComponentType<CardsPanelProps>;
  CalendarPanel: ComponentType<CalendarPanelProps>;
  SkillsPanel: ComponentType<SkillsPanelProps>;
  /** The calendar write dialog. */
  DayEditor: ComponentType<DayEditorProps>;
  /** The `/` command menu. */
  SlashMenu: ComponentType<SlashMenuProps>;
  /** The local card shown the instant a course is opened. */
  CourseIntroCard: ComponentType<CourseIntroCardProps>;
  /** The 总控 今日卡 (local data, no model call). */
  ControlCard: ComponentType<ControlCardProps>;
  /** The 总控 周计划本: day / week / month views beside the chat. */
  Planbook: ComponentType<PlanbookProps>;
  /** The 总控 面板 (design `?d=dash`): replaces the 周计划本 on the 总控 session. */
  ControlPanel: ComponentType<ControlPanelProps>;
}

/** The lazily-loaded module a skin id resolves to. */
export interface SkinModule {
  /** Lazily import the skin's stylesheet (scoped under `[data-skin="<id>"]`). */
  stylesheet?: () => Promise<unknown>;
  /**
   * The body scales the skin can render crisply, ascending — or a function of
   * the active body font when the ladder depends on it.
   *
   * `⌘+` / `⌘-` step through this ladder instead of zooming the page. Omit it to
   * use `core/settings`' default 0.75–2 ladder (bare's range).
   */
  bodyScaleSteps?: readonly number[] | ((font: BodyFont) => readonly number[]);
  slots: SkinSlots;
  motion: MotionPreset;
  content: ContentRenderers;
}

/** A registered skin: metadata plus the lazy loader for its module. */
export interface SkinDefinition {
  /** kebab-case, never reused, e.g. "chicago". */
  id: string;
  /** Display name, e.g. "Chicago". */
  name: string;
  /** The skin's own version; bump it on any visual change. */
  version: string;
  /** One-line style description. */
  description: string;
  /** Lazy load: styles and components load only when the skin is selected. */
  load(): Promise<SkinModule>;
}
