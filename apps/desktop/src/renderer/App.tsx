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

import { useCallback, useMemo, useState } from "react";
import type { ReadingDue, ReadingPriority } from "@shared/data-protocol.js";
import { useChat } from "./core/chat/useChat.js";
import { MessageRenderer } from "./core/chat/message-renderer.js";
import { useSettings } from "./core/settings/use-settings.js";
import { useBodyScaleShortcuts } from "./core/settings/use-body-scale-shortcuts.js";
import { useDocumentAppearance } from "./core/settings/use-document-appearance.js";
import { useCourses } from "./core/board/use-courses.js";
import { useActiveCourse, useCourseSessions } from "./core/board/use-course-sessions.js";
import { useBoardReload } from "./core/board/use-board-reload.js";
import { useSessionFreshness } from "./core/board/use-session-freshness.js";
import { useReading, clipPrompt } from "./core/board/use-reading.js";
import { useCards, useAnki } from "./core/board/use-cards.js";
import { useCalendar } from "./core/board/use-calendar.js";
import { useCycle } from "./core/board/use-cycle.js";
import { useSubjects } from "./core/board/use-subjects.js";
import { isControlSession, useControlSession } from "./core/board/use-control-session.js";
import { useControlPlanbook } from "./core/board/use-control-planbook.js";
import { useChatColumn } from "./core/board/use-chat-column.js";
import { useSessionList } from "./core/board/use-session-list.js";
import { controlView } from "./core/board/bot-state.js";
import { useShellPanels } from "./core/board/use-shell-panels.js";
import { contextUsageView } from "./core/chat/context-usage.js";
import { useTurnActivity } from "./core/chat/use-turn-activity.js";
import { useLessonActions } from "./core/chat/use-lesson-actions.js";
import { useControlFold } from "./core/board/use-control-fold.js";
import { pinBoard } from "./core/chat/pin-board.js";
import { routeDismiss } from "./core/chat/view-models.js";
import { useSkills } from "./core/board/use-skills.js";
import { useSkillsPanel } from "./core/board/use-skills-panel.js";
import { useSlash } from "./core/commands/use-slash.js";
import { type ToolFocus } from "./core/commands/run-command.js";
import { useRunCommand } from "./core/commands/use-run-command.js";
import { useSessionStyle } from "./core/chat/use-session-style.js";
import { defaultStyleLabel } from "./core/board/default-style.js";
import { dayTitle } from "./core/format.js";
import { resumePoint, todayKey, todayPlanItems, now } from "./core/today.js";
import { addDays } from "./core/board/planbook.js";
import { useUpdate } from "./core/update/use-update.js";
import { useSkinAppearance, useSkinCycleShortcut } from "./skins/use-appearance.js";
import { useSkin } from "./skins/use-skin.js";
import { Gallery } from "./gallery/Gallery.js";
import type { ShellProps, ToolId } from "./skins/contract.js";
import { toolDescriptors } from "./skins/chicago/icons.js";
import { strings } from "./core/strings.js";

/** The current month as `YYYY-MM`, for the calendar's initial view. */
function currentMonth(): string {
  const current = now();
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
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
  const cycle = useCycle(todayKey(), addDays(todayKey(), 1), calendar.month);
  const subjects = useSubjects(todayKey());
  const skills = useSkills();
  const skillsPanel = useSkillsPanel(skills, apply);

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
    const today = todayKey();
    return [todayPlanItems(days[today], courseTitles), todayPlanItems(days[addDays(today, 1)], courseTitles)];
  }, [calendar.resource.state, courseTitles]);
  // The course whose session is *running*, if any. The style is remembered per
  // course only once a session has actually started (继续学习 / 开始学习); before
  // that a style change belongs to the session default, not to whatever course
  // 接着上次 happens to point at. The open file is reported by the agent and lets
  // a relaunch that resumes a course's session know which course it is.
  const [focusRequest, setFocusRequest] = useState(0);
  const { activeCourse, openSessionFile, setActiveCourse, setOpenSessionFile } =
    useActiveCourse(settings);
  const sessionStyle = useSessionStyle(activeCourse);
  // Destructured so runCommand can name it in its dependency array.
  const selectStyle = sessionStyle.select;
  const controller = useChat(sessionStyle.style, settings.disabledSkills);
  if (controller.sessionFile !== openSessionFile) setOpenSessionFile(controller.sessionFile);
  const slash = useSlash(controller.commands, settings.disabledSkills, activeCourse !== null);
  const {
    startedToday,
    intro,
    handleStudy,
    handleResume,
    handleStartSession,
    handleContinueFresh,
    handleNewCourse,
    handleEditPlan,
    handleNewSession,
  } = useCourseSessions(controller, settings, update, courses, resume, activeCourse, setActiveCourse, () => setFocusRequest((value) => value + 1));
  const cycleId = cycle.today.state.status === "ready" ? cycle.today.state.value.cycle : null;
  // The 总控 session has no course page: it is refreshed on release/skill edits instead.
  const openIsControl = isControlSession(settings, cycleId, openSessionFile);
  const freshness = useSessionFreshness(
    controller,
    courses,
    activeCourse,
    openSessionFile,
    settings,
    handleStudy,
    handleContinueFresh,
    openIsControl,
  );
  const agentReady = controller.agentStatus === "ready" && !controller.disabled;
  const control = useControlSession(controller, settings, update, cycleId, setActiveCourse,
    () => setFocusRequest((value) => value + 1), agentReady);
  const studyCourse = (slug: string): void => {
    const course = courses.state.status === "ready" ? courses.state.value.find((item) => item.slug === slug) : undefined;
    if (course) handleStudy(course);
  };
  const openTool = (tool: ToolId): void => {
    setFocusMode(false);
    setActiveTool(tool);
  };
  const sessionList = useSessionList(controller, settings, setActiveCourse, cycle, courses, handleNewSession);
  const requestOpenSessions = sessionList.requestOpen;
  const fold = useControlFold(control.isControl, controller.messages, controller.systemNotes);
  const planbook = useControlPlanbook({
    cycle,
    reading,
    anki,
    controller,
    control,
    fold,
    courses,
    calendar,
    cards,
    subjects,
    studyCourse,
    startSession: handleStartSession,
    openTool,
  });
  const chat = useChatColumn();
  const activity = useTurnActivity(controller.messages, controller.streaming, controller.thinking);
  const lessonButtons = useLessonActions(activeCourse, controller);

  const [activeTool, setActiveTool] = useState<ToolId | null>("progress");
  const [focusMode, setFocusMode] = useState(false);
  const [editingDay, setEditingDay] = useState<{ date: string; text: string } | null>(null);
  // A field inside a tool window to focus once that window is open (e.g. the
  // reading add box after /加入阅读). Cleared after the panel consumes it.
  const [pendingFocus, setPendingFocus] = useState<ToolFocus | null>(null);
  // The 「检查理解」 question being answered, plus a counter that asks the composer
  // to focus its field. Both are owned here so they survive a skin switch (B10).
  const [answering, setAnswering] = useState<number | null>(null);
  const updateBar = useUpdate();

  const requestedSkin = querySkin ?? settings.skin;
  const { module: skin, loadedId, notice } = useSkin(requestedSkin);
  const appearance = useSkinAppearance(settings, update, loadedId);

  useDocumentAppearance({
    windowBackground: settings.windowBackground,
    skinLoaded: Boolean(skin),
    skinId: loadedId,
    bodyFont: settings.bodyFont,
    bodyScale: settings.bodyScale,
  });

  useBoardReload(controller.streaming, [courses, reading, cards, calendar.resource, cycle, subjects]);

  useSkinCycleShortcut(loadedId, update);

  useBodyScaleShortcuts(skin, settings.bodyFont, settings.bodyScale, update);

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
  const runCommand = useRunCommand({
    slash,
    selectStyle,
    setActiveTool,
    setPendingFocus,
    resume: handleResume,
    newSession: handleNewSession,
    openSessions: requestOpenSessions,
    controller,
    control,
  });

  const panels = useShellPanels({
    courses,
    reading,
    cards,
    anki,
    calendar,
    cycle,
    subjects,
    skillsPanel,
    todayPlan,
    tomorrowPlan,
    courseTitles,
    sessionStyle,
    startedToday,
    resume,
    agentReady,
    pendingFocus,
    onFocusHandled: () => setPendingFocus(null),
    controller,
    control,
    cycleId,
    sessionList,
    handleResume,
    handleStudy,
    handleNewCourse,
    handleEditPlan,
    handleStartSession,
    studyCourse,
    setEditingDay,
    handleReadingAdd,
    handleReadingClip,
  });

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

  const { Shell, Thread, Composer, DayEditor, UpdateBar, ControlCard, ControlPanel } = skin.slots;

  const notices = [...(notice ? [notice] : []), ...controller.notices, ...(freshness.notice ? [freshness.notice] : [])];

  const shellProps: ShellProps = {
    sessionTitle:
      control.isControl && cycleId
        ? // The planbook owns this session's left side, so the title says so:
          // 「总控 · C1 · 计划本」 (design `plan2.jsx`).
          strings.control.title(cycleId) + strings.planbook.titleSuffix
        : activeCourse
          ? (courseTitles[activeCourse] ?? activeCourse)
          : null,
    control: controlView(control.isControl, controller.streaming, controller.messages, cycle.today.state),
    contextUsage: contextUsageView(controller.contextUsage, controller.compacting, controller.compact),
    children: (
      <>
        <UpdateBar {...updateBar} />
        <Thread
          header={null}
          older={planbook.older}
          messages={fold.messages}
          thinking={controller.thinking}
          noModels={controller.disabled}
          modelsReason={controller.modelsReason}
          intro={intro}
          systemNotes={fold.systemNotes}
          activity={activity}
          pin={pinBoard(controller.messages)}
          renderMessage={(message, thinking) => (
            <MessageRenderer slots={skin.slots} content={skin.content} message={message} thinking={thinking} onRetry={controller.retry}
              onExerciseAnswer={handleExerciseAnswer} onExerciseHint={handleExerciseHint} onExerciseSkip={handleExerciseSkip} />
          )}
        />
        <Composer
          streaming={controller.streaming}
          disabled={controller.disabled}
          onSend={(text) => controller.send(answering === null ? text : strings.content.exerciseAnswerPrefix(answering, text))}
          onStop={controller.stop}
          carriedDraft={controller.carriedDraft}
          onCarriedDraftTaken={controller.takeCarriedDraft}
          style={sessionStyle.style}
          onStyle={sessionStyle.select}
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
          lessonActions={lessonButtons}
          defaultStyleLabel={defaultStyleLabel(subjects.state, activeCourse)}
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
    onOpenSessions: requestOpenSessions,
    sessions: sessionList.view,
    pendingSwitch: controller.pendingSwitch,
    confirmSwitch: controller.confirmSwitch,
    cancelSwitch: controller.cancelSwitch,
    agentStatus: controller.agentStatus,
    notices,
    onDismissNotice: (index) => {
      const target = routeDismiss(index, notice ? 1 : 0, controller.notices.length, freshness.notice !== null);
      if (target.kind === "chat") controller.dismissNotice(target.index);
      else if (target.kind === "freshness") freshness.dismiss();
    },
    tools: toolDescriptors(),
    activeTool,
    onOpenTool: openTool,
    focusMode,
    onToggleFocus: () => setFocusMode((value) => !value),
    style: sessionStyle.style,
    onSelectStyle: sessionStyle.select,
    styleCourse: activeCourse,
    onPrompt: controller.send,
    panels,
    planbook: control.isControl ? (
      <ControlPanel
        {...planbook.panelProps}
        todayCard={
          planbook.panelShowCard && planbook.card ? <ControlCard {...planbook.card} older={null} /> : null
 }
      />
    ) : null,
    chatOpen: chat.open,
    onToggleChat: chat.toggle,
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
