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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CourseSummary, ReadingDue, ReadingPriority, SkillReview } from "@shared/data-protocol.js";
import type { AsyncState } from "./core/board/state.js";
import type { TeachingStyle } from "@shared/protocol.js";
import { useChat } from "./core/chat/useChat.js";
import { MessageRenderer } from "./core/chat/message-renderer.js";
import { useSettings } from "./core/settings/use-settings.js";
import {
  DEFAULT_BODY_SCALE_STEPS,
  bodyScaleDirection,
  stepBodyScale,
} from "./core/settings/step-body-scale.js";
import { useCourses } from "./core/board/use-courses.js";
import { useReading, clipPrompt } from "./core/board/use-reading.js";
import { useCards, useAnki } from "./core/board/use-cards.js";
import { useCalendar, monthGrid, shiftMonth, dateKey } from "./core/board/use-calendar.js";
import { useSkills } from "./core/board/use-skills.js";
import { useSlash } from "./core/commands/use-slash.js";
import type { SlashCommand } from "./core/commands/commands.js";
import { commandEffect, type ToolFocus } from "./core/commands/run-command.js";
import { resolveStyle, styleWriteTarget } from "./core/chat/style.js";
import { dayTitle } from "./core/format.js";
import { findNewCourseSlug } from "./core/board/course-claim.js";
import { editPlanPrompt, newCoursePrompt, type NewCourseRequest } from "./core/board/course-prompts.js";
import { resumePoint, resumePrompt, studyPrompt, todayPlanItems } from "./core/today.js";
import { SKINS, skinIds } from "./skins/registry.js";
import { useSkin } from "./skins/use-skin.js";
import { Gallery } from "./gallery/Gallery.js";
import type { ShellPanels, ShellProps, ToolId } from "./skins/contract.js";
import { toolDescriptors } from "./skins/chicago/icons.js";
import { strings } from "./core/strings.js";

/** Shared empty options, so a skin without options keeps a stable reference. */
const EMPTY_SKIN_OPTIONS: Record<string, string> = {};

/** A 「新课程」 request waiting for the course file to appear in the list. */
interface PendingNewCourse {
  request: NewCourseRequest;
  /** The fresh session the request was sent in, to remember for the new slug. */
  sessionFile: string;
  /** Course slugs before the request, so the new one can be told apart. */
  before: string[];
}

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
  const skills = useSkills();
  const [skillNotice, setSkillNotice] = useState<string | null>(null);
  const [skillReview, setSkillReview] = useState<AsyncState<SkillReview> | null>(null);

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
  const todayPlan = useMemo(() => {
    const day =
      calendar.resource.state.status === "ready"
        ? calendar.resource.state.value.days[dateKey(new Date())]
        : undefined;
    return todayPlanItems(day, courseTitles);
  }, [calendar.resource.state, courseTitles]);
  // The course whose session is *running*, if any. The style is remembered per
  // course only once a session has actually started (继续学习 / 开始学习); before
  // that a style change belongs to the session default, not to whatever course
  // 接着上次 happens to point at.
  const [chosenCourse, setActiveCourse] = useState<string | null>(null);
  // The session file currently open, reported by the agent; lets a relaunch that
  // resumes a course's session know which course it is (style, window title).
  const [openSessionFile, setOpenSessionFile] = useState<string | null>(null);
  const activeCourse =
    chosenCourse ??
    Object.entries(settings.courseSessions).find(([, file]) => file === openSessionFile)?.[0] ??
    null;
  const style = resolveStyle(settings, activeCourse);
  const controller = useChat(style, settings.disabledSkills);
  if (controller.sessionFile !== openSessionFile) setOpenSessionFile(controller.sessionFile);
  const slash = useSlash(controller.commands, settings.disabledSkills);

  // A 「新课程」 request still waiting for its course file, and the previous
  // streaming flag so the board only reloads when an answer *ends*.
  const pendingNewCourse = useRef<PendingNewCourse | null>(null);
  const wasStreaming = useRef(controller.streaming);

  const [activeTool, setActiveTool] = useState<ToolId | null>("progress");
  const [focusMode, setFocusMode] = useState(false);
  const [editingDay, setEditingDay] = useState<{ date: string; text: string } | null>(null);
  // A field inside a tool window to focus once that window is open (e.g. the
  // reading add box after /加入阅读). Cleared after the panel consumes it.
  const [pendingFocus, setPendingFocus] = useState<ToolFocus | null>(null);
  // The 「检查理解」 question being answered, plus a counter that asks the composer
  // to focus its field. Both are owned here so they survive a skin switch (B10).
  const [answering, setAnswering] = useState<number | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);

  const requestedSkin = querySkin ?? settings.skin;
  const { module: skin, loadedId, notice } = useSkin(requestedSkin);

  useEffect(() => {
    if (settings.windowBackground) {
      document.documentElement.style.backgroundColor = settings.windowBackground;
    }
  }, [settings.windowBackground]);

  useEffect(() => {
    if (!skin) return;
    document.documentElement.dataset.skin = loadedId;
    document.documentElement.dataset.bodyScale = String(settings.bodyScale);
    return () => {
      delete document.documentElement.dataset.skin;
      delete document.documentElement.dataset.bodyScale;
    };
  }, [skin, loadedId, settings.bodyScale]);

  // Reload the board when an answer ends: 学根 may have written course progress,
  // reading, cards, or calendar notes during the turn. The ref holds the previous
  // flag, so the reload runs only on the true → false edge. The reloads only
  // start an async load; nothing is set synchronously in this effect.
  useEffect(() => {
    const ended = wasStreaming.current && !controller.streaming;
    wasStreaming.current = controller.streaming;
    if (!ended) return;
    courses.reload();
    reading.reload();
    cards.reload();
    calendar.resource.reload();
  }, [controller.streaming, courses, reading, cards, calendar.resource]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const ids = skinIds();
    function onKeyDown(event: KeyboardEvent): void {
      if (event.metaKey && event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const index = ids.indexOf(loadedId);
        const next = ids[(index + 1) % ids.length];
        if (next) update({ skin: next });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loadedId, update]);

  // ⌘+ / ⌘= / ⌘- / ⌘0 (Ctrl on Windows/Linux) step the body text along the
  // active skin's ladder. Not DEV-gated: this replaces the page zoom the app
  // menu used to offer, and a fractional page zoom blurs the pixel fonts. A
  // window-level listener also fires while a field is focused, and the ⌘/Ctrl
  // combination does not type a character there.
  useEffect(() => {
    if (!skin) return;
    const steps = skin.bodyScaleSteps ?? DEFAULT_BODY_SCALE_STEPS;
    function onKeyDown(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const direction = bodyScaleDirection(event.key);
      if (!direction) return;
      event.preventDefault();
      const next = stepBodyScale(settings.bodyScale, direction, steps);
      if (next !== settings.bodyScale) update({ bodyScale: next });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [skin, settings.bodyScale, update]);

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

  /**
   * Study a course in its own session, so courses never share one context.
   * Already in that course's session: just send. Otherwise switch to the
   * course's remembered session (or a fresh one), remember the file, then send.
   */
  const handleStartSession = useCallback(
    (slug: string, text: string) => {
      if (activeCourse === slug) {
        controller.send(text);
        return;
      }
      const known = settings.courseSessions[slug] ?? null;
      setActiveCourse(slug);
      void controller.openSession(known).then((opened) => {
        if (opened && opened !== known) {
          update({ courseSessions: { ...settings.courseSessions, [slug]: opened } });
        }
        controller.send(text);
      });
    },
    [activeCourse, controller, settings.courseSessions, update],
  );

  /**
   * Create a course in a fresh session. The course file only exists after 学根
   * runs the `course` skill, so remember the current slugs and claim the first
   * new one when the refreshed list arrives (see the effect below).
   */
  const handleNewCourse = useCallback(
    (request: NewCourseRequest) => {
      // Without a loaded list there is no "before" to compare with; claiming
      // would mistake an existing course for the new one, so skip the claim.
      const before =
        courses.state.status === "ready" ? courses.state.value.map((course) => course.slug) : null;
      setActiveCourse(null);
      void controller.openSession(null).then((opened) => {
        if (!opened) return;
        if (before) pendingNewCourse.current = { request, sessionFile: opened, before };
        controller.send(newCoursePrompt(request));
      });
    },
    [courses.state, controller],
  );

  const handleEditPlan = useCallback(
    (course: CourseSummary, change: string) => {
      // A plan change belongs to the course's own session, like 开始学习.
      handleStartSession(course.slug, editPlanPrompt(course.title, change));
    },
    [handleStartSession],
  );

  // Claim the course a 「新课程」 request created: the first slug that was not in
  // the list before the request. The settings write goes through a microtask so
  // this effect never sets state synchronously (the project lint rule).
  useEffect(() => {
    const pending = pendingNewCourse.current;
    if (!pending || courses.state.status !== "ready") return;
    const slug = findNewCourseSlug(pending.before, courses.state.value);
    if (!slug) return;
    pendingNewCourse.current = null;
    void Promise.resolve().then(() => {
      setActiveCourse(slug);
      update({
        courseSessions: { ...settings.courseSessions, [slug]: pending.sessionFile },
        courseStyles: { ...settings.courseStyles, [slug]: pending.request.style },
      });
    });
  }, [courses.state, settings.courseSessions, settings.courseStyles, update]);

  const handleStudy = useCallback(
    (course: CourseSummary) => handleStartSession(course.slug, studyPrompt(course)),
    [handleStartSession],
  );
  const handleResume = useCallback(() => {
    if (resume) handleStartSession(resume.course.slug, resumePrompt(resume));
  }, [handleStartSession, resume]);

  const handleNewSession = useCallback(() => {
    setActiveCourse(null);
    controller.newSession();
  }, [controller]);
  const handleContinueSession = useCallback(() => {
    setActiveCourse(null);
    controller.continueSession();
  }, [controller]);

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

  const skinChoices = SKINS.map((entry) => ({ id: entry.id, name: entry.name }));

  const activeSkinOptions = useMemo(
    () => settings.skinOptions[loadedId] ?? EMPTY_SKIN_OPTIONS,
    [settings.skinOptions, loadedId],
  );

  const handleSkinOption = useCallback(
    (key: string, value: string) => {
      update({ skinOptions: { ...settings.skinOptions, [loadedId]: { ...activeSkinOptions, [key]: value } } });
    },
    [update, settings.skinOptions, loadedId, activeSkinOptions],
  );

  const handleWindowBackground = useCallback(
    (color: string) => {
      if (color === settings.windowBackground) return;
      update({ windowBackground: color });
    },
    [update, settings.windowBackground],
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
    [slash, handleSelectStyle, handleResume, handleNewSession, handleContinueSession, controller],
  );

  if (!skin) {
    return null;
  }

  if (import.meta.env.DEV && gallery) {
    return (
      <Gallery
        slots={skin.slots}
        content={skin.content}
        skinChoices={skinChoices}
        activeSkin={loadedId}
        onSelectSkin={(id) => update({ skin: id })}
        bodyScale={settings.bodyScale}
        onBodyScale={(value) => update({ bodyScale: value })}
        skinOptions={activeSkinOptions}
        onSkinOption={handleSkinOption}
        onWindowBackground={handleWindowBackground}
      />
    );
  }

  const { Shell, Thread, Composer, DayEditor } = skin.slots;

  const notices = notice ? [notice, ...controller.notices] : controller.notices;

  const panels: ShellPanels = {
    today: {
      todayPlan,
      readingDue: reading.stats.state,
      cards: cards.stats.state,
      resume,
      onResume: handleResume,
      agentReady: controller.agentStatus === "ready" && !controller.disabled,
    },
    progress: {
      courses: courses.state,
      courseStyles: settings.courseStyles,
      onCourseStyle: setCourseStyle,
      onStudy: handleStudy,
      onNewCourse: handleNewCourse,
      onEditPlan: handleEditPlan,
      sources: reading.sources.state,
    },
    reading: {
      queue: reading.queue.state,
      sources: reading.sources.state,
      onAdd: handleReadingAdd,
      onClip: handleReadingClip,
      onReview: (slug, outcome, position) => {
        void reading.review(slug, outcome, position);
      },
      focus: pendingFocus ?? undefined,
      onFocusHandled: () => setPendingFocus(null),
    },
    cards: {
      cards: cards.stats.state,
      anki: anki.state,
      onAdd: (deck, front, back) => {
        void cards.add(deck, front, back).then((result) => {
          if (result.ok) anki.reload();
        });
      },
      onRetryAnki: anki.reload,
      onDraft: () => controller.send(strings.cards.draft),
    },
    calendar: {
      month: calendar.resource.state,
      monthKey: calendar.month,
      onPrevMonth: () => calendar.setMonth(shiftMonth(calendar.month, -1)),
      onNextMonth: () => calendar.setMonth(shiftMonth(calendar.month, 1)),
      cells: monthGrid(calendar.month),
      selected: calendar.selected,
      onSelectDay: calendar.select,
      courseTitles,
      onEditDay: (date) => {
        const day =
          calendar.resource.state.status === "ready" ? calendar.resource.state.value.days[date] : undefined;
        setEditingDay({ date, text: day?.note ?? "" });
      },
    },
    skills: {
      skills: skills.resource.state,
      onToggle: (name, enabled) => {
        // The write returns the authoritative settings; apply them so the
        // session's `disabledSkills` (and the `/` menu) update in step.
        void skills.setEnabled(name, enabled).then((result) => {
          if (result.ok) apply(result.data);
        });
      },
      onFetch: (url) => {
        setSkillNotice(null);
        void skills.fetch(url).then((result) => {
          setSkillNotice(
            result.ok
              ? strings.skills.fetched(result.data.skills.map((skill) => skill.name))
              : strings.skills.fetchFailed(result.error),
          );
        });
      },
      fetchNotice: skillNotice,
      review: skillReview,
      onReview: (name) => {
        setSkillReview({ status: "loading" });
        void skills.review(name).then((result) =>
          setSkillReview(
            result.ok
              ? { status: "ready", value: result.data }
              : { status: "error", code: result.code, message: result.error },
          ),
        );
      },
      onCloseReview: () => setSkillReview(null),
      onEnableReviewed: (name) => {
        setSkillReview(null);
        void skills.setEnabled(name, true).then((result) => {
          if (result.ok) apply(result.data);
          else setSkillNotice(strings.skills.fetchFailed(result.error));
        });
      },
      onDiscardReviewed: (name) => {
        setSkillReview(null);
        void skills.discard(name);
      },
    },
  };

  const shellProps: ShellProps = {
    sessionTitle: activeCourse ? (courseTitles[activeCourse] ?? activeCourse) : null,
    children: (
      <>
        <Thread
          messages={controller.messages}
          thinking={controller.thinking}
          noModels={controller.disabled}
          modelsReason={controller.modelsReason}
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
          focusRequest={focusRequest}
        />
      </>
    ),
    skins: skinChoices,
    activeSkin: loadedId,
    onSelectSkin: (id) => update({ skin: id }),
    bodyScale: settings.bodyScale,
    onBodyScale: (value) => update({ bodyScale: value }),
    skinOptions: activeSkinOptions,
    onSkinOption: handleSkinOption,
    onWindowBackground: handleWindowBackground,
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
