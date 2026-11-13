/**
 * Bear Shell: a title bar, one centred column of reading, and a right drawer.
 *
 * The grid is three rows — title bar / conversation / composer — with the
 * column capped at 34em (bear.md §4). The title bar carries the session title
 * on the left and, on the right, the context-usage popover, the 学习 button
 * that opens the drawer, and the 「⋯」 menu; in focus mode only 「⋯」 remains.
 * Notices line up at the top of the column, one per line.
 *
 * The drawer (a Radix dialog that slides in from the right (180ms tween)) holds the tool tabs:
 * 今天 plus the five tools, switched through core's `onOpenTool`. When
 * `activeTool` is set the drawer opens on that tab; 「今天」 is a local view —
 * it is not a `ToolId`, so selecting it only flips the tab.
 */

import { useCallback, useEffect, useState } from "react";
import { Dialog as RadixDialog, Tabs as RadixTabs } from "radix-ui";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Root as Popover,
  Content as PopoverContent,
  Portal as PopoverPortal,
  Trigger as PopoverTrigger,
} from "@animate-ui/react/primitives/radix-ui/popover";
import type { ContextUsageView, ShellProps, ToolId } from "../contract.js";
import { strings } from "../../core/strings.js";
import { bearBodyScale } from "./body-scale.js";
import { MoreMenu } from "./menu.js";
import { Notice } from "./slots.js";
import { TodayPanel } from "./today-panel.js";
import { ProgressPanel } from "./progress-panel.js";
import { ReadingPanel } from "./reading-panel.js";
import { CardsPanel } from "./cards-panel.js";
import { CalendarPanel } from "./calendar-panel.js";
import { SkillsPanel } from "./skills-panel.js";
import { SessionsButton } from "./sessions-popover.js";
import { useDark } from "./use-dark.js";

/** The paper colour the window should open with (anti-flash). */
const BEAR_PAPER = "#fbfbfa";
const BEAR_PAPER_DARK = "#161615";

/** The drawer's 今天 tab value; tool tabs use their `ToolId`. */
const TODAY_TAB = "today";

/** The drawer slides in from the right: one short tween, no flip, no spring. */
const DRAWER_SLIDE = { type: "tween", duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;

/** The context-usage button and its popover (detail, progress bar, compact). */
function ContextButton({ contextUsage }: { contextUsage: ContextUsageView }) {
  const percent = contextUsage.percent === null ? null : Math.min(100, Math.max(0, contextUsage.percent));
  return (
    <Popover>
      <PopoverTrigger className="bear-btn">{contextUsage.label}</PopoverTrigger>
      <PopoverPortal>
        <PopoverContent className="bear-pop" align="end" sideOffset={6}>
          <p>{contextUsage.detail}</p>
          <div className="bear-progress">
            <div className="bear-progress-fill" style={{ width: `${percent ?? 0}%` }} />
          </div>
          <button type="button" disabled={contextUsage.compacting} onClick={contextUsage.onCompact}>
            {strings.chat.compactNow}
          </button>
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}

export function Shell(props: ShellProps) {
  const {
    children,
    notices,
    onDismissNotice,
    contextUsage,
    tools,
    activeTool,
    onOpenTool,
    focusMode,
    panels,
    onWindowBackground,
    onPrompt,
    onToggleFocus,
  } = props;

  // Drawer state is derived, never synced in an effect: `requested` is the
  // 学习 button, `dismissedFor` remembers the tool the user closed the drawer
  // on, and `picked` is a 今天 selection valid only while `activeTool` stands
  // (a new activeTool always wins the tab, per the contract).
  const [requested, setRequested] = useState(false);
  // The tool open at mount counts as dismissed: the app's default tool suits a
  // side-window skin, but Bear starts with the drawer closed.
  const [dismissedFor, setDismissedFor] = useState<ToolId | null>(activeTool);
  // A change of `activeTool` is a fresh request (⌘1–5, a / command): it clears
  // any earlier dismissal, including the startup one. Adjusted during render,
  // not in an effect (the project's lint rule).
  const [seenTool, setSeenTool] = useState<ToolId | null>(activeTool);
  if (activeTool !== seenTool) {
    setSeenTool(activeTool);
    setDismissedFor(null);
  }
  const [picked, setPicked] = useState<{ tool: ToolId | null } | null>(null);
  const [lastTool, setLastTool] = useState<ToolId>(tools[0]?.id ?? "progress");
  const reduceMotion = useReducedMotion();
  const dark = useDark();

  // The control session is one page (the panel holds what the drawer would):
  // no 课程与计划 button, no drawer, no ⌘1–5 (user 11-12).
  const hasDrawer = props.planbook === null;
  const open = hasDrawer && (requested || (activeTool !== null && activeTool !== dismissedFor));
  // In the control session the panel's 技能与设置 / 新卡片 open their tool in a
  // dialog instead (the startup tool counts as dismissed, as for the drawer).
  const dialogTool =
    !hasDrawer && (activeTool === "skills" || activeTool === "cards") && activeTool !== dismissedFor
      ? activeTool
      : null;
  const tab = picked !== null && picked.tool === activeTool ? TODAY_TAB : (activeTool ?? lastTool);

  // Mirror the window background so it opens in the paper colour (anti-flash).
  useEffect(() => {
    onWindowBackground(dark ? BEAR_PAPER_DARK : BEAR_PAPER);
  }, [onWindowBackground, dark]);

  const openTool = useCallback(
    (tool: ToolId): void => {
      setPicked(null);
      setLastTool(tool);
      setDismissedFor(null);
      setRequested(true);
      onOpenTool(tool);
    },
    [onOpenTool],
  );

  const onTab = useCallback(
    (value: string): void => {
      // 「今天」 is not a ToolId: selecting it only flips the tab, kept valid
      // while `activeTool` is unchanged.
      if (value === TODAY_TAB) {
        setPicked({ tool: activeTool });
        return;
      }
      openTool(value as ToolId);
    },
    [activeTool, openTool],
  );

  const onDrawerOpenChange = useCallback(
    (next: boolean): void => {
      setRequested(next);
      // Closing keeps `activeTool` (and everything else) untouched; it only
      // remembers not to auto-reopen for that same tool.
      if (!next) setDismissedFor(activeTool);
    },
    [activeTool],
  );

  // Shortcuts, as in Chicago: ⌘1–5 tools, ⌘E 今天学到这里, ⌘. focus mode.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!event.metaKey) return;
      if (/^[1-5]$/.test(event.key)) {
        if (!hasDrawer) return;
        const tool = tools[Number(event.key) - 1];
        if (tool) {
          event.preventDefault();
          openTool(tool.id);
        }
      } else if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        onPrompt(strings.topBar.todayDone);
      } else if (event.key === ".") {
        event.preventDefault();
        onToggleFocus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tools, openTool, onPrompt, onToggleFocus, hasDrawer]);

  return (
    <div
      className="bear-root"
      data-drawer={open ? "open" : undefined}
      data-bear-scale={String(bearBodyScale(props.bodyScale))}
      data-agent-status={props.agentStatus}
      data-focus={focusMode ? "true" : undefined}
    >
      <header className="bear-bar">
        {!focusMode && (
          <SessionsButton sessions={props.sessions} control={props.control} title={props.sessionTitle} />
        )}
        <span className="bear-bar-gap" />
        {!focusMode && (
          <>
            <ContextButton contextUsage={contextUsage} />
            {props.planbook !== null && (
              <button type="button" className="bear-btn" onClick={props.onToggleChat}>
                {props.chatOpen ? strings.planbook.chatHide : strings.planbook.chatShow}
              </button>
            )}
            {hasDrawer && (
              <button type="button" className="bear-btn" onClick={() => onDrawerOpenChange(!open)}>
                {strings.topBar.coursesAndPlans}
              </button>
            )}
          </>
        )}
        <MoreMenu
          skins={props.skins}
          activeSkin={props.activeSkin}
          onSelectSkin={props.onSelectSkin}
          bodyFont={props.bodyFont}
          onBodyFont={props.onBodyFont}
          bodyScale={props.bodyScale}
          onBodyScale={props.onBodyScale}
          models={props.models}
          currentModel={props.currentModel}
          onSelectModel={props.onSelectModel}
          thinkingLevel={props.thinkingLevel}
          thinkingLevels={props.thinkingLevels}
          onSelectThinking={props.onSelectThinking}
          onNewSession={props.onNewSession}
          onOpenSessions={props.onOpenSessions}
          focusMode={focusMode}
          onToggleFocus={props.onToggleFocus}
        />
      </header>

      <main className={props.planbook !== null ? "bear-col bear-col--plan" : "bear-col"}>
        {props.pendingSwitch && <SwitchGuard onConfirm={props.confirmSwitch} onCancel={props.cancelSwitch} />}
        {props.planbook !== null ? (
          <>
            {/* The planbook owns the left; the conversation (notices + thread +
                composer) moves into the right chat column the 收起聊天 button hides. */}
            <section className="bear-pb-area">{props.planbook}</section>
            <aside className="bear-pb-chat" hidden={!props.chatOpen}>
              <div className="bear-column">
                {notices.length > 0 && (
                  <div className="bear-notices">
                    {notices.map((notice, index) => (
                      <Notice
                        key={`${index}-${notice.text}`}
                        notice={notice}
                        onDismiss={() => onDismissNotice(index)}
                      />
                    ))}
                  </div>
                )}
                {children}
              </div>
            </aside>
          </>
        ) : (
          <div className="bear-column">
            {notices.length > 0 && (
              <div className="bear-notices">
                {notices.map((notice, index) => (
                  <Notice
                    key={`${index}-${notice.text}`}
                    notice={notice}
                    onDismiss={() => onDismissNotice(index)}
                  />
                ))}
              </div>
            )}
            {children}
          </div>
        )}
      </main>

      <RadixDialog.Root
        open={dialogTool !== null}
        onOpenChange={(next) => !next && setDismissedFor(activeTool)}
      >
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="bear-dlg-overlay" />
          <RadixDialog.Content className="bear-dlg" aria-describedby={undefined}>
            <div className="bear-dlg-top">
              <RadixDialog.Title className="bear-dlg-title">
                {tools.find((tool) => tool.id === dialogTool)?.name ?? ""}
              </RadixDialog.Title>
              <RadixDialog.Close className="bear-drawer-close">{strings.panel.dialogClose}</RadixDialog.Close>
            </div>
            <div className="bear-tabpanels">
              {dialogTool !== null && <ToolPanel tool={dialogTool} panels={panels} />}
            </div>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>

      {/* Non-modal: the reader keeps typing and scrolling while the drawer is
          open, and nothing outside is hidden from assistive tech. */}
      <RadixDialog.Root open={open} onOpenChange={onDrawerOpenChange} modal={false}>
        <AnimatePresence>
          {open && (
            <RadixDialog.Portal forceMount>
              <RadixDialog.Content forceMount asChild aria-describedby={undefined}>
                <motion.div
                  className="bear-drawer"
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={reduceMotion ? { duration: 0 } : DRAWER_SLIDE}
                >
                  <RadixDialog.Title className="bear-vh">{strings.tools.dockLabel}</RadixDialog.Title>
                  <RadixTabs.Root className="bear-drawer-body" value={tab} onValueChange={onTab}>
                    <div className="bear-drawer-top">
                      <RadixTabs.List className="bear-tabs">
                        <RadixTabs.Trigger className="bear-tab" value={TODAY_TAB}>
                          {strings.today.title}
                        </RadixTabs.Trigger>
                        {tools.map((tool) => (
                          <RadixTabs.Trigger key={tool.id} className="bear-tab" value={tool.id}>
                            {tool.name}
                          </RadixTabs.Trigger>
                        ))}
                      </RadixTabs.List>
                      <RadixDialog.Close className="bear-drawer-close">
                        {strings.chat.dismiss}
                      </RadixDialog.Close>
                    </div>
                    <div className="bear-tabpanels">
                      <RadixTabs.Content value={TODAY_TAB}>
                        <TodayPanel {...panels.today} />
                      </RadixTabs.Content>
                      {tools.map((tool) => (
                        <RadixTabs.Content key={tool.id} value={tool.id}>
                          <ToolPanel tool={tool.id} panels={panels} />
                        </RadixTabs.Content>
                      ))}
                    </div>
                  </RadixTabs.Root>
                </motion.div>
              </RadixDialog.Content>
            </RadixDialog.Portal>
          )}
        </AnimatePresence>
      </RadixDialog.Root>
    </div>
  );
}

/**
 * The ask before leaving a session mid-answer: a small card under the title
 * bar. 「等它说完」 loses nothing, so it is the solid button and takes focus;
 * Esc means the same.
 */
function SwitchGuard({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);
  return (
    <div className="bear-guard" role="alertdialog" aria-labelledby="bear-guard-text">
      <p id="bear-guard-text">{strings.switchGuard.text}</p>
      <div className="bear-guard-actions">
        <button type="button" className="bear-btn" onClick={onConfirm}>
          {strings.switchGuard.confirm}
        </button>
        <button type="button" className="bear-btn-primary" onClick={onCancel} autoFocus>
          {strings.switchGuard.cancel}
        </button>
      </div>
    </div>
  );
}

/** Render the body of whichever tool tab is selected. */
function ToolPanel({ tool, panels }: { tool: ToolId; panels: ShellProps["panels"] }) {
  switch (tool) {
    case "progress":
      return <ProgressPanel {...panels.progress} tool="progress" />;
    case "reading":
      return <ReadingPanel {...panels.reading} tool="reading" />;
    case "cards":
      return <CardsPanel {...panels.cards} tool="cards" />;
    case "calendar":
      return <CalendarPanel {...panels.calendar} tool="calendar" />;
    case "skills":
      return <SkillsPanel {...panels.skills} tool="skills" />;
    default:
      return null;
  }
}
