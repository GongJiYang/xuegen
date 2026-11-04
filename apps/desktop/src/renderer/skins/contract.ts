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
import type { AgentStatus, ChatMessage, ModelInfo, TeachingStyle, ToolCallView } from "@shared/protocol.js";
import type {
  AnkiStatus,
  CalendarMonth,
  CardsStats,
  CourseSummary,
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
import type { CalendarCell } from "../core/board/use-calendar.js";
import type { SlashCommand, SlashGroup } from "../core/commands/commands.js";
import type { ResumePoint, TodayPlanItem } from "../core/today.js";

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

export interface ShellProps {
  /** The whole application body (thread, composer, panels), to place in a layout. */
  children: React.ReactNode;
  /**
   * What the conversation is about: the active course's title while studying a
   * course (each course has its own session), otherwise null for a free chat.
   */
  sessionTitle: string | null;
  /** Every registered skin, for the mandatory "appearance" entry. */
  skins: SkinChoice[];
  /** Currently active skin id. */
  activeSkin: string;
  /** Switch to another skin. */
  onSelectSkin: SkinSelectHandler;
  /** Current body scale multiplier. */
  bodyScale: number;
  /** Change the body scale. */
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
  /** Continue the most recent session for the working directory. */
  onContinueSession(): void;
  /** Agent process lifecycle, so the Shell can show a status line. */
  agentStatus: AgentStatus;
  /** Notices (errors, missing login, fallbacks) for the Shell to surface. */
  notices: NoticeItem[];
  /** Dismiss a notice by index. */
  onDismissNotice(index: number): void;

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
  /** Change the style; persists to the course or session default. */
  onSelectStyle(style: TeachingStyle): void;
  /** The course whose style is being edited, or null for a course-less session. */
  styleCourse: string | null;

  /** Send a prompt without going through the composer (menu / panel actions). */
  onPrompt(text: string): void;

  /** The view models the 今天 window and the five tool windows draw. */
  panels: ShellPanels;
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

export interface ThreadProps {
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
}

export interface AssistantMessageProps {
  message: ChatMessage;
  /** True when this block should show the thinking indicator. */
  thinking: boolean;
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
  onStop(): void;
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
  /**
   * A counter that increments whenever core wants the field focused.
   *
   * A monotonically increasing number (not a boolean) so a second request for
   * the same question still triggers the skin's focus effect.
   */
  focusRequest: number;
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
  /** Reading due from stats. */
  readingDue: AsyncState<ReadingStats>;
  cards: AsyncState<CardsStats>;
  /** The course to resume, or null when there is no record yet. */
  resume: ResumePoint | null;
  /** Ask the agent to resume the chosen course. */
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
  /** The current style per course slug, so each row's radio reflects it. */
  courseStyles: Record<string, TeachingStyle>;
  /** Change one course's remembered style. */
  onCourseStyle(slug: string, style: TeachingStyle): void;
  /** Open a course's session ("开始学习"). */
  onStudy(course: CourseSummary): void;
  /** Create a course through the `course` skill. */
  onNewCourse(request: NewCourseRequest): void;
  /** Ask the `course` skill to change one course's plan. */
  onEditPlan(course: CourseSummary, change: string): void;
  /** Candidate material paths for the new-course form. */
  sources: AsyncState<ReadingSource[]>;
}

/** What adding a reading source produced, for the panel's confirmation line. */
export interface AddedReading {
  title: string;
  /** The scheduled due date (`YYYY-MM-DD`). */
  due: string;
}

export interface ReadingPanelProps extends ToolPanelProps {
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
  /**
   * A field the panel should focus as soon as it is mounted/shown.
   *
   * `/加入阅读` opens the reading window with `reading-add`, so the cursor lands
   * in the add box; the panel reports back via {@link onFocusHandled}.
   */
  focus?: ToolFocus;
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
  /** Course slug → title, so the day's detail shows a name, not a slug. */
  courseTitles: Record<string, string>;
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

/** Every component a skin must provide. */
export interface SkinSlots {
  Shell: ComponentType<ShellProps>;
  Thread: ComponentType<ThreadProps>;
  UserMessage: ComponentType<UserMessageProps>;
  AssistantMessage: ComponentType<AssistantMessageProps>;
  ToolActivity: ComponentType<ToolActivityProps>;
  Thinking: ComponentType<ThinkingProps>;
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
}

/** The lazily-loaded module a skin id resolves to. */
export interface SkinModule {
  /** Lazily import the skin's stylesheet (scoped under `[data-skin="<id>"]`). */
  stylesheet?: () => Promise<unknown>;
  /**
   * The body scales the skin can render crisply, ascending.
   *
   * `⌘+` / `⌘-` step through this ladder instead of zooming the page. Omit it to
   * use `core/settings`' default 0.75–2 ladder (bare's range).
   */
  bodyScaleSteps?: readonly number[];
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
