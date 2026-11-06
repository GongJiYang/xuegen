/**
 * Application shell.
 *
 * Reads settings, resolves the active skin, sets `data-skin` on the root element
 * (so the skin's scoped CSS applies), and hands the core view models to the skin's
 * Shell slot. It owns everything that must survive a skin switch: the chat
 * controller, the settings store, the board resources, the open tool window, the
 * focus mode, the session style, and the day editor.
 *
 * Development-only: `?gallery&skin=<id>` renders the gallery, and ⌘⇧K cycles
 * through the registered skins.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReadingDue, ReadingPriority } from "@shared/data-protocol.js";
import type { TeachingStyle } from "@shared/protocol.js";
import { useChat } from "./core/chat/useChat.js";
import { MessageRenderer } from "./core/chat/message-renderer.js";
import { useSettings } from "./core/settings/use-settings.js";
import { useBodyScaleShortcuts } from "./core/settings/use-body-scale-shortcuts.js";
import { coerceBodyScaleForFont } from "./core/settings/body-font.js";
import { useCourses } from "./core/board/use-courses.js";
import { useActiveCourse, useCourseSessions } from "./core/board/use-course-sessions.js";
import { useReloadOnAnswer } from "./core/board/use-reload-on-answer.js";
import { useReading, clipPrompt } from "./core/board/use-reading.js";
import { useCards, useAnki } from "./core/board/use-cards.js";
import { useCalendar, dateKey } from "./core/board/use-calendar.js";
import { useCycle } from "./core/board/use-cycle.js";
import { useSubjects } from "./core/board/use-subjects.js";
import { useControlSession } from "./core/board/use-control-session.js";
import { controlView } from "./core/board/bot-state.js";
import { shellPanels } from "./core/board/shell-panels.js";
import { contextUsageView } from "./core/chat/context-usage.js";
import { turnActivity } from "./core/chat/activity.js";
import { pinBoard } from "./core/chat/pin-board.js";
import { useSkills } from "./core/board/use-skills.js";
import { useSkillsPanel } from "./core/board/use-skills-panel.js";
import { useSlash } from "./core/commands/use-slash.js";
import type { SlashCommand } from "./core/commands/commands.js";
import { commandEffect, type ToolFocus } from "./core/commands/run-command.js";
import { resolveStyle, styleWriteTarget } from "./core/chat/style.js";
import { dayTitle } from "./core/format.js";
import { resumePoint, todayPlanItems } from "./core/today.js";
import { useSkinAppearance, useSkinCycleShortcut } from "./skins/use-appearance.js";
import { useSkin } from "./skins/use-skin.js";
import { Gallery } from "./gallery/Gallery.js";
import type { ShellProps, ToolId } from "./skins/contract.js";
import { toolDescriptors } from "./skins/chicago/icons.js";
import { strings } from "./core/strings.js";

/** The current month as `YYYY-MM`, for the calendar's initial view. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Read `?gallery` and `?skin=` from the current URL. */
function readQuery(): { gallery: boolean; skin: string | null } {
  if (typeof window === "undefined") return { gallery: false, skin: null };
  const params = new URLSearchParams(window.location.search);
  return { gallery: params.has("gallery"), skin: params.get("skin") };
}

export function App() {
  const { gallery, skin: querySkin } = readQuery();
  const { settings, update, apply } = useSettings();

  const courses = useCourses();
  const reading = useReading();
  const cards = useCards();
  const anki = useAnki();
  const calendar = useCalendar(currentMonth());
  const cycle = useCycle(dateKey(new Date()), dateKey(new Date(new Date().setHours(24, 0, 0, 0))), calendar.month);
  const subjects = useSubjects(dateKey(new Date()));
  const skills = useSkills();
  const skillsPanel = useSkillsPanel(skills, apply);

  // The style for the whole session: the remembered per-course style when the
  // most-recent course is known, else the session default.
  const resume = useMemo(
    () => (courses.state.status === "ready" ? resumePoint(courses.state.value) : null),
    [courses.state],
  );

  // Today's concrete plan/record list, for the 今天窗口 (B14). Derived from the
  // calendar resource (already loaded) and the course titles.
  const courseTitles = useMemo<Record<string, string>>(
    () =>
      courses.state.status === "ready"
        ? Object.fromEntries(courses.state.value.map((course) => [course.slug, course.title]))
        : {},
    [courses.state],
  );
  // 今天 / 明天 from the calendar month already loaded. On a month's last day the
  // next day is outside it, so 明天 reads empty until the calendar moves on.
  const [todayPlan, tomorrowPlan] = useMemo(() => {
    const days = calendar.resource.state.status === "ready" ? calendar.resource.state.value.days : {};
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    return [todayPlanItems(days[dateKey(today)], courseTitles), todayPlanItems(days[dateKey(tomorrow)], courseTitles)];
  }, [calendar.resource.state, courseTitles]);
  // The course whose session is *running*, if any. The style is remembered per
  // course only once a session has actually started (继续学习 / 开始学习); before
  // that a style change belongs to the session default, not to whatever course
  // 接着上次 happens to point at. The open file is reported by the agent and lets
  // a relaunch that resumes a course's session know which course it is.
  const [focusRequest, setFocusRequest] = useState(0);
  const { activeCourse, openSessionFile, setActiveCourse, setOpenSessionFile } =
    useActiveCourse(settings);
  const style = resolveStyle(settings, activeCourse);
  const controller = useChat(style, settings.disabledSkills);
  if (controller.sessionFile !== openSessionFile) setOpenSessionFile(controller.sessionFile);
  const slash = useSlash(controller.commands, settings.disabledSkills);
  const {
    startedToday,
    intro,
    handleStudy,
    handleResume,
    handleStartSession,
    handleNewCourse,
    handleEditPlan,
    handleNewSession,
    handleContinueSession,
  } = useCourseSessions(controller, settings, update, courses, resume, activeCourse, setActiveCourse, () => setFocusRequest((value) => value + 1));
  const cycleId = cycle.today.state.status === "ready" ? cycle.today.state.value.cycle : null;
  const control = useControlSession(controller, settings, update, cycleId, setActiveCourse, () =>
    setFocusRequest((value) => value + 1),
  );

  const [activeTool, setActiveTool] = useState<ToolId | null>("progress");
  const [focusMode, setFocusMode] = useState(false);
  const [editingDay, setEditingDay] = useState<{ date: string; text: string } | null>(null);
  // A field inside a tool window to focus once that window is open (e.g. the
  // reading add box after /加入阅读). Cleared after the panel consumes it.
  const [pendingFocus, setPendingFocus] = useState<ToolFocus | null>(null);
  // The 「检查理解」 question being answered, plus a counter that asks the composer
  // to focus its field. Both are owned here so they survive a skin switch (B10).
  const [answering, setAnswering] = useState<number | null>(null);

  const requestedSkin = querySkin ?? settings.skin;
  const { module: skin, loadedId, notice } = useSkin(requestedSkin);
  const appearance = useSkinAppearance(settings, update, loadedId);

  useEffect(() => {
    if (settings.windowBackground) {
      document.documentElement.style.backgroundColor = settings.windowBackground;
    }
  }, [settings.windowBackground]);

  useEffect(() => {
    if (!skin) return;
    document.documentElement.dataset.skin = loadedId;
    document.documentElement.dataset.bodyFont = settings.bodyFont;
    document.documentElement.dataset.bodyScale = String(
      coerceBodyScaleForFont(settings.bodyScale, settings.bodyFont),
    );
    return () => {
      delete document.documentElement.dataset.skin;
      delete document.documentElement.dataset.bodyFont;
      delete document.documentElement.dataset.bodyScale;
    };
  }, [skin, loadedId, settings.bodyFont, settings.bodyScale]);

  // Reload the board when an answer ends: 学根 may have written course progress,
  // reading, cards, or calendar notes during the turn.
  const reloadBoard = useCallback(() => {
    courses.reload();
    reading.reload();
    cards.reload();
    calendar.resource.reload();
    cycle.reload();
    subjects.reload();
  }, [courses, reading, cards, calendar.resource, cycle, subjects]);
  useReloadOnAnswer(controller.streaming, reloadBoard);

  useSkinCycleShortcut(loadedId, update);

  useBodyScaleShortcuts(skin, settings.bodyFont, settings.bodyScale, update);

  const setCourseStyle = useCallback(
    (slug: string, next: TeachingStyle) => {
      update({ courseStyles: { ...settings.courseStyles, [slug]: next } });
    },
    [update, settings.courseStyles],
  );

  const handleSelectStyle = useCallback(
    (next: TeachingStyle) => {
      // Only a course whose session is running owns the style; otherwise it is
      // the session default. `/细讲` on a fresh window must not write into the
      // 接着上次 course's `courseStyles`.
      const target = styleWriteTarget(activeCourse);
      if (target.kind === "course") {
        update({ courseStyles: { ...settings.courseStyles, [target.slug]: next } });
      } else {
        update({ sessionStyle: next });
      }
    },
    [update, settings.courseStyles, activeCourse],
  );

  const handleReadingAdd = useCallback(
    async (source: string, priority: ReadingPriority, due: ReadingDue) => {
      const result = await reading.add(source, priority, due);
      return result.ok ? { title: result.data.title, due: result.data.due } : null;
    },
    [reading],
  );
  const handleReadingClip = useCallback(
    (url: string, priority: ReadingPriority, due: ReadingDue) => controller.send(clipPrompt(url, priority, due)),
    [controller],
  );

  // 「检查理解」 actions (B10): answering focuses the composer and names the
  // question; hint and skip send a prompt referencing the same question number.
  const handleExerciseAnswer = useCallback((index: number) => {
    setAnswering(index);
    setFocusRequest((value) => value + 1);
  }, []);
  const handleExerciseHint = useCallback(
    (index: number) => controller.sendCommand(strings.content.exerciseHintPrompt(index)),
    [controller],
  );
  const handleExerciseSkip = useCallback(
    (index: number) => {
      controller.sendCommand(strings.content.exerciseSkipPrompt(index));
      setAnswering((current) => (current === index ? null : current));
    },
    [controller],
  );

  // Execute a `/` command by routing its pure effect to the right action.
  const runCommand = useCallback(
    (command: SlashCommand) => {
      slash.update("");
      slash.close();
      const effect = commandEffect(command.command);
      switch (effect.kind) {
        case "style":
          return handleSelectStyle(effect.style);
        case "tool": {
          setActiveTool(effect.tool);
          // A command that names a field (e.g. /加入阅读) focuses it once the
          // window is open, so the user can type immediately.
          if (effect.focus) setPendingFocus(effect.focus);
          return;
        }
        case "resume":
          return handleResume();
        case "new-session":
          return handleNewSession();
        case "continue-session":
          return handleContinueSession();
        case "control":
          return control.openControl();
        case "prompt":
          // A `/` command's own text is the whole instruction: send it without the
          // session style prefix (B9).
          return controller.sendCommand(effect.text);
        case "insert":
          // The composer inserts a `/skill:` command into its own field.
          return;
        default:
          return;
      }
    },
    [slash, handleSelectStyle, handleResume, handleNewSession, handleContinueSession, controller, control],
  );

  if (!skin) {
    return null;
  }

  if (import.meta.env.DEV && gallery) {
    return (
      <Gallery
        slots={skin.slots}
        content={skin.content}
        skinChoices={appearance.skinChoices}
        activeSkin={loadedId}
        onSelectSkin={appearance.onSelectSkin}
        bodyFont={settings.bodyFont}
        onBodyFont={appearance.onBodyFont}
        bodyScale={settings.bodyScale}
        onBodyScale={appearance.onBodyScale}
        skinOptions={appearance.skinOptions}
        onSkinOption={appearance.onSkinOption}
        onWindowBackground={appearance.onWindowBackground}
      />
    );
  }

  const { Shell, Thread, Composer, DayEditor } = skin.slots;

  const notices = notice ? [notice, ...controller.notices] : controller.notices;

  const panels = shellPanels({
    courses,
    reading,
    cards,
    anki,
    calendar,
    cycle,
    subjects,
    today: dateKey(new Date()),
    skillsPanel,
    todayPlan,
    tomorrowPlan,
    courseTitles,
    courseStyles: settings.courseStyles,
    startedToday,
    resume,
    agentReady: controller.agentStatus === "ready" && !controller.disabled,
    focus: pendingFocus,
    onFocusHandled: () => setPendingFocus(null),
    onResume: handleResume,
    onCourseStyle: setCourseStyle,
    onStudy: handleStudy,
    onNewCourse: handleNewCourse,
    onEditPlan: handleEditPlan,
    onReadingAdd: handleReadingAdd,
    onReadingClip: handleReadingClip,
    onDraftCards: () => controller.send(strings.cards.draft),
    onEditDay: (date) => {
      const day =
        calendar.resource.state.status === "ready" ? calendar.resource.state.value.days[date] : undefined;
      setEditingDay({ date, text: day?.note ?? "" });
    },
    onStudyCourse: (slug) => {
      const course = courses.state.status === "ready" ? courses.state.value.find((item) => item.slug === slug) : undefined;
      if (course) handleStudy(course);
    },
    onVerifyCourse: (slug) => handleStartSession(slug, strings.cycle.verifyPrompt(slug)),
    onOpenControl: cycleId ? control.openControl : null,
  });

  const shellProps: ShellProps = {
    sessionTitle:
      control.isControl && cycleId
        ? strings.control.title(cycleId)
        : activeCourse
          ? (courseTitles[activeCourse] ?? activeCourse)
          : null,
    control: controlView(control.isControl, controller.streaming, controller.messages, cycle.today.state),
    contextUsage: contextUsageView(controller.contextUsage, controller.compacting, controller.compact),
    children: (
      <>
        <Thread
          messages={controller.messages}
          thinking={controller.thinking}
          noModels={controller.disabled}
          modelsReason={controller.modelsReason}
          intro={intro}
          systemNotes={controller.systemNotes}
          activity={turnActivity(controller.messages, controller.streaming, controller.thinking)}
          pin={pinBoard(controller.messages)}
          renderMessage={(message, thinking) => (
            <MessageRenderer
              slots={skin.slots}
              content={skin.content}
              message={message}
              thinking={thinking}
              onRetry={controller.retry}
              onExerciseAnswer={handleExerciseAnswer}
              onExerciseHint={handleExerciseHint}
              onExerciseSkip={handleExerciseSkip}
            />
          )}
        />
        <Composer
          streaming={controller.streaming}
          disabled={controller.disabled}
          onSend={controller.send}
          onStop={controller.stop}
          style={style}
          onStyle={handleSelectStyle}
          commandsOpen={slash.open}
          commandGroups={slash.groups}
          commands={slash.commands}
          selectedCommand={slash.selected}
          onSelectCommand={slash.select}
          onRunCommand={runCommand}
          onCloseCommands={slash.close}
          onInput={slash.update}
          answering={answering}
          onCancelAnswer={() => setAnswering(null)}
          focusRequest={focusRequest}
        />
      </>
    ),
    skins: appearance.skinChoices,
    activeSkin: loadedId,
    onSelectSkin: appearance.onSelectSkin,
    bodyFont: settings.bodyFont,
    onBodyFont: appearance.onBodyFont,
    bodyScale: settings.bodyScale,
    onBodyScale: appearance.onBodyScale,
    skinOptions: appearance.skinOptions,
    onSkinOption: appearance.onSkinOption,
    onWindowBackground: appearance.onWindowBackground,
    models: controller.models,
    currentModel: controller.currentModel,
    onSelectModel: controller.setModel,
    thinkingLevel: controller.thinkingLevel,
    thinkingLevels: controller.thinkingLevels,
    onSelectThinking: controller.setThinkingLevel,
    onNewSession: handleNewSession,
    onContinueSession: handleContinueSession,
    agentStatus: controller.agentStatus,
    notices,
    onDismissNotice: controller.dismissNotice,
    tools: toolDescriptors(),
    activeTool,
    onOpenTool: (tool) => {
      setFocusMode(false);
      setActiveTool(tool);
    },
    focusMode,
    onToggleFocus: () => setFocusMode((value) => !value),
    style,
    onSelectStyle: handleSelectStyle,
    styleCourse: activeCourse,
    onPrompt: controller.send,
    panels,
  };

  return (
    <>
      <Shell {...shellProps} />
      {editingDay && (
        <DayEditor
          date={editingDay.date}
          title={dayTitle(editingDay.date)}
          initialText={editingDay.text}
          savePath={editingDay.date}
          onSave={(text) => {
            void calendar.writeNote(editingDay.date, text);
            // After saving, the detail box should show the day just written.
            calendar.select(editingDay.date);
            setEditingDay(null);
          }}
          onCancel={() => setEditingDay(null)}
        />
      )}
    </>
  );
}
