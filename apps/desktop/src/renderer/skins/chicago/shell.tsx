/**
 * Chicago Shell: menu bar + dithered desktop holding the chat window, the 今天
 * window, one tool window, and the icon dock.
 *
 * Ported from the design's `features.html` layout (`.desk.f`): the chat spans
 * both rows in the left column, 今天 sits above the tool window in the middle
 * column, and the icon dock is the fixed 64px right column. Focus mode hides the
 * middle and right columns and centres the chat. ⌘1–⌘5 open tools, ⌘E ends the
 * session, ⌘. toggles focus.
 *
 * Core supplies every view model; this component only lays them out. Palette,
 * anti-flash, error alert, and the modeless notice keep the behaviour from F1.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ShellPanels, ShellProps, ToolId } from "../contract.js";
import { strings } from "../../core/strings.js";
import { useMotion } from "../../core/motion/index.js";
import { chicagoMotion } from "./motion.js";
import { applyPalette, PALETTE_OPTION_KEY, resolvePaletteId } from "./palette.js";
import { isBigScale } from "./body-scale.js";
import { MenuBar } from "./menubar.js";
import { ToolDockWithPalette } from "./tool-dock.js";
import { TodayPanel } from "./today-panel.js";
import { ProgressPanel } from "./progress-panel.js";
import { ReadingPanel } from "./reading-panel.js";
import { CardsPanel } from "./cards-panel.js";
import { CalendarPanel } from "./calendar-panel.js";
import { SkillsPanel } from "./skills-panel.js";
import { StopIcon } from "./stop-icon.js";
import { ErrorDetail } from "./slots.js";

export function Shell(props: ShellProps) {
  const {
    children,
    skins,
    activeSkin,
    onSelectSkin,
    bodyScale,
    onBodyScale,
    skinOptions,
    onSkinOption,
    onWindowBackground,
    models,
    currentModel,
    onSelectModel,
    thinkingLevel,
    thinkingLevels,
    onSelectThinking,
    onNewSession,
    onContinueSession,
    agentStatus,
    notices,
    onDismissNotice,
    tools,
    activeTool,
    onOpenTool,
    focusMode,
    onToggleFocus,
    style,
    onSelectStyle,
    onPrompt,
    panels,
  } = props;

  const ref = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dismissedAlert, setDismissedAlert] = useState<string | null>(null);

  // Reopening a window must clear its collapsed flag, or a tool the user closed
  // stays hidden no matter which dock icon or menu they click (B3).
  const openTool = useCallback(
    (tool: ToolId): void => {
      setCollapsed((state) => ({ ...state, tool: false }));
      onOpenTool(tool);
    },
    [onOpenTool],
  );
  const showToday = useCallback((): void => {
    setCollapsed((state) => ({ ...state, today: false }));
  }, []);
  const showAllWindows = useCallback((): void => {
    setCollapsed((state) => ({ ...state, today: false, tool: false }));
  }, []);
  const menuBarRef = useRef<HTMLElement | null>(null);
  const alertRef = useRef<HTMLDivElement | null>(null);

  // Apply the palette to `<html>` and mirror its paper colour for anti-flash.
  const queryPalette = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("palette") : null;
  const paletteId = resolvePaletteId(queryPalette ?? skinOptions[PALETTE_OPTION_KEY]);
  useEffect(() => {
    const paper = applyPalette(paletteId);
    onWindowBackground(paper);
  }, [paletteId, onWindowBackground]);

  // Keep the body hidden until the pixel fonts are ready (capped at 800ms).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("chicago-loading");
    const done = (): void => root.classList.remove("chicago-loading");
    const timer = window.setTimeout(done, 800);
    void document.fonts?.ready.then(done);
    return () => {
      window.clearTimeout(timer);
      done();
    };
  }, []);

  // Keyboard shortcuts the design defines: ⌘1–⌘5 tools, ⌘E end session, ⌘. focus.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!event.metaKey) return;
      if (/^[1-5]$/.test(event.key)) {
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
  }, [tools, openTool, onPrompt, onToggleFocus]);

  const firstError = notices.find((notice) => notice.tone === "error") ?? null;
  const alertNotice = firstError && firstError.text !== dismissedAlert ? firstError : null;
  const modeless = notices.find((notice) => notice.tone === "info") ?? null;

  useMotion(chicagoMotion, "alert", menuBarRef, [alertNotice]);
  useMotion(chicagoMotion, "appear", alertRef, [alertNotice]);

  const windowTitle = activeTool ? toolTitle(activeTool) : null;
  // Coerce at read time only: a legacy fractional value renders at the nearest
  // whole multiple without writing back, so other skins keep the original.
  const big = isBigScale(bodyScale);

  return (
    <div ref={ref} className={`chicago-root ${big ? "chicago-big" : ""}`} data-agent-status={agentStatus}>
      <MenuBar
        ref={menuBarRef}
        skins={skins}
        activeSkin={activeSkin}
        onSelectSkin={onSelectSkin}
        skinOptions={skinOptions}
        onSkinOption={onSkinOption}
        bodyScale={bodyScale}
        onBodyScale={onBodyScale}
        models={models}
        currentModel={currentModel}
        onSelectModel={onSelectModel}
        thinkingLevel={thinkingLevel}
        thinkingLevels={thinkingLevels}
        onSelectThinking={onSelectThinking}
        onNewSession={onNewSession}
        onContinueSession={onContinueSession}
        focus={focusMode}
        onToggleFocus={onToggleFocus}
        tools={tools}
        onOpenTool={openTool}
        onOpenToday={showToday}
        onShowAllWindows={showAllWindows}
        showAllWindowsDisabled={!collapsed.today && !collapsed.tool}
        style={style}
        onSelectStyle={onSelectStyle}
        onEndToday={() => onPrompt(strings.topBar.todayDone)}
        onPrompt={onPrompt}
      />

      <main className={`chicago-desk chicago-desk-f ${focusMode ? "chicago-focus" : ""}`}>
        <section className="chicago-win chicago-chat">
          <div className="chicago-tb">
            <button
              type="button"
              className="chicago-box chicago-box-close"
              aria-label={strings.chat.dismiss}
              onClick={() => setCollapsed((state) => ({ ...state, chat: !state.chat }))}
            />
            <span className="chicago-title">{props.sessionTitle ?? strings.chat.freeSession}</span>
            <button
              type="button"
              className="chicago-box chicago-box-zoom"
              aria-label={strings.topBar.focusModeTitle}
              onClick={onToggleFocus}
            />
          </div>
          {!collapsed.chat && children}
        </section>

        {!focusMode && (
          <>
            <section className={`chicago-win chicago-side chicago-today${collapsed.today ? " chicago-hidden" : ""}`} aria-label={strings.today.title}>
              <div className="chicago-tb">
                <button type="button" className="chicago-box chicago-box-close" aria-label={strings.chat.dismiss} onClick={() => setCollapsed((s) => ({ ...s, today: true }))} />
                <span className="chicago-title">{strings.today.title}</span>
              </div>
              <div className="chicago-pane">
                <TodayPanel {...panels.today} />
              </div>
            </section>

            {activeTool && (
              <section className={`chicago-win chicago-side chicago-tool${collapsed.tool ? " chicago-hidden" : ""}`} aria-label={windowTitle ?? ""}>
                <div className="chicago-tb">
                  <button type="button" className="chicago-box chicago-box-close" aria-label={strings.chat.dismiss} onClick={() => setCollapsed((s) => ({ ...s, tool: true }))} />
                  <span className="chicago-title">{windowTitle}</span>
                </div>
                <div className="chicago-pane">
                  <ToolWindow tool={activeTool} panels={panels} />
                </div>
              </section>
            )}

            <ToolDockWithPalette
              tools={tools}
              active={activeTool}
              onOpen={openTool}
              todayActive={!collapsed.today}
              onOpenToday={showToday}
              paletteId={paletteId}
            />
          </>
        )}
      </main>

      {alertNotice && (
        <div className="chicago-scrim chicago-show">
          <div ref={alertRef} className="chicago-dialog chicago-alert" role="alert">
            <div className="chicago-dialog-inner">
              <div className="chicago-alert-row">
                <StopIcon />
                <div>
                  <div>{alertNotice.text}</div>
                  {alertNotice.detail && <ErrorDetail raw={alertNotice.detail} />}
                </div>
              </div>
              <div className="chicago-btns">
                <span className="chicago-def">
                  <button type="button" className="chicago-btn" onClick={() => setDismissedAlert(alertNotice.text)}>
                    {strings.chat.dismiss}
                  </button>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {modeless && !alertNotice && (
        <div className="chicago-win chicago-modeless chicago-show" aria-label={strings.notice.agentCrashed}>
          <div className="chicago-tb">
            <button
              type="button"
              className="chicago-box chicago-box-close"
              aria-label={strings.chat.dismiss}
              onClick={() => onDismissNotice(notices.indexOf(modeless))}
            />
            <span className="chicago-title">{strings.chat.loginHint}</span>
          </div>
          <div className="chicago-pane chicago-note">
            <p>{modeless.text}</p>
            <pre className="chicago-code">xuegen login</pre>
          </div>
        </div>
      )}
    </div>
  );
}

/** Render the body of whichever tool window is open. */
function ToolWindow({ tool, panels }: { tool: ShellProps["activeTool"]; panels: ShellPanels }) {
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

/** The window title for a tool id. */
function toolTitle(tool: NonNullable<ShellProps["activeTool"]>): string {
  switch (tool) {
    case "progress":
      return strings.tools.progress;
    case "reading":
      return strings.tools.reading;
    case "cards":
      return strings.tools.cards;
    case "calendar":
      return strings.tools.calendar;
    case "skills":
      return strings.tools.skills;
    default:
      return "";
  }
}
