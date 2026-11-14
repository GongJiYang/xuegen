/**
 * Bear Shell behaviour: the drawer and the 「⋯」 menu.
 *
 * `activeTool` opens the drawer on the matching tab, switching a tab reports
 * `onOpenTool`, focus mode leaves only 「⋯」 in the title bar, the context
 * popover shows the usage detail and runs `onCompact`, and each top-level menu
 * item calls its props callback.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Shell } from "./shell.js";
import type { ShellProps, ToolDescriptor } from "../contract.js";
import { contextUsageView } from "../../core/chat/context-usage.js";
import { strings } from "../../core/strings.js";
import { SAMPLE_PANELS } from "../../gallery/panel-samples.js";
import { SAMPLE_MODELS } from "../../gallery/samples.js";

afterEach(cleanup);

// jsdom has no Web Animations API; the Animate UI dropdown's staggered rows
// call `element.animate` when the menu opens, so give it a cancellable stub.
if (typeof Element.prototype.animate !== "function") {
  Element.prototype.animate = vi.fn(() => ({
    cancel: vi.fn(),
    finish: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    finished: Promise.resolve(),
  })) as unknown as Element["animate"];
  Element.prototype.getAnimations = vi.fn(() => []) as unknown as Element["getAnimations"];
}

const TOOLS: ToolDescriptor[] = [
  { id: "progress", name: strings.tools.progress, shortcut: "1" },
  { id: "reading", name: strings.tools.reading, shortcut: "2" },
  { id: "cards", name: strings.tools.cards, shortcut: "3" },
  { id: "calendar", name: strings.tools.calendar, shortcut: "4" },
  { id: "skills", name: strings.tools.skills, shortcut: "5" },
];

function baseProps(overrides: Partial<ShellProps> = {}): ShellProps {
  return {
    children: null,
    tabs: null,
    sessionTitle: null,
    control: null,
    contextUsage: contextUsageView({ tokens: 52_000, contextWindow: 128_000, percent: 40.6 }, false, vi.fn()),
    skins: [{ id: "bear", name: "Bear" }],
    activeSkin: "bear",
    onSelectSkin: vi.fn(),
    bodyFont: "hei",
    onBodyFont: vi.fn(),
    bodyScale: 1,
    onBodyScale: vi.fn(),
    skinOptions: {},
    onSkinOption: vi.fn(),
    onWindowBackground: vi.fn(),
    models: SAMPLE_MODELS,
    currentModel: SAMPLE_MODELS[0] ?? null,
    onSelectModel: vi.fn(),
    thinkingLevel: "medium",
    thinkingLevels: ["low", "medium", "high"],
    onSelectThinking: vi.fn(),
    onNewSession: vi.fn(),
    onOpenSessions: vi.fn(),
    sessions: {
      open: false,
      onOpenChange: vi.fn(),
      status: "ready",
      groups: [],
      onPick: vi.fn(),
      onNew: vi.fn(),
    },
    pendingSwitch: false,
    confirmSwitch: vi.fn(),
    cancelSwitch: vi.fn(),
    agentStatus: "ready",
    notices: [],
    onDismissNotice: vi.fn(),
    tools: TOOLS,
    activeTool: null,
    onOpenTool: vi.fn(),
    focusMode: false,
    onToggleFocus: vi.fn(),
    style: "plain",
    onSelectStyle: vi.fn(),
    styleCourse: null,
    onPrompt: vi.fn(),
    panels: SAMPLE_PANELS,
    planbook: null,
    chatOpen: false,
    onToggleChat: vi.fn(),
    ...overrides,
  };
}

describe("Bear Shell", () => {
  it("starts closed on the app's default tool, then opens on a requested tool's tab", () => {
    const { rerender } = render(<Shell {...baseProps({ activeTool: "progress" })} />);
    expect(screen.queryByRole("tab")).toBeNull();
    rerender(<Shell {...baseProps({ activeTool: "calendar" })} />);
    expect(screen.getByRole("tab", { name: strings.tools.calendar }).getAttribute("aria-selected")).toBe(
      "true",
    );
    rerender(<Shell {...baseProps({ activeTool: "progress" })} />);
    const tab = screen.getByRole("tab", { name: strings.tools.progress });
    expect(tab.getAttribute("aria-selected")).toBe("true");
    // The progress panel's content is inside the drawer.
    expect(screen.getByRole("button", { name: strings.progress.newCourse })).toBeTruthy();
  });

  it("reports onOpenTool when a tool tab is clicked", async () => {
    const onOpenTool = vi.fn();
    const { rerender } = render(<Shell {...baseProps({ activeTool: null, onOpenTool })} />);
    rerender(<Shell {...baseProps({ activeTool: "progress", onOpenTool })} />);
    await userEvent.click(screen.getByRole("tab", { name: strings.tools.reading }));
    expect(onOpenTool).toHaveBeenCalledWith("reading");
  });

  it("opens the drawer from the 学习 title-bar button", async () => {
    render(<Shell {...baseProps()} />);
    expect(screen.queryByRole("tab")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: strings.topBar.coursesAndPlans }));
    expect(screen.getByRole("tab", { name: strings.today.title })).toBeTruthy();
  });

  it("keeps only the ⋯ menu in the title bar in focus mode", () => {
    render(<Shell {...baseProps({ focusMode: true, sessionTitle: "CTM 7 周" })} />);
    expect(screen.getByRole("button", { name: "⋯" })).toBeTruthy();
    expect(screen.queryByText("CTM 7 周")).toBeNull();
    expect(screen.queryByRole("button", { name: strings.topBar.coursesAndPlans })).toBeNull();
    expect(screen.queryByRole("button", { name: /上下文/ })).toBeNull();
  });

  it("shows the context detail in a popover and runs onCompact", async () => {
    const onCompact = vi.fn();
    const contextUsage = contextUsageView(
      { tokens: 52_000, contextWindow: 128_000, percent: 40.6 },
      false,
      onCompact,
    );
    render(<Shell {...baseProps({ contextUsage })} />);
    await userEvent.click(screen.getByRole("button", { name: contextUsage.label }));
    expect(await screen.findByText(contextUsage.detail)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: strings.chat.compactNow }));
    expect(onCompact).toHaveBeenCalledTimes(1);
  });

  it("runs the top-level ⋯ menu callbacks", async () => {
    const onNewSession = vi.fn();
    const onOpenSessions = vi.fn();
    const onToggleFocus = vi.fn();
    render(<Shell {...baseProps({ onNewSession, onOpenSessions, onToggleFocus })} />);

    await userEvent.click(screen.getByRole("button", { name: "⋯" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: new RegExp(strings.topBar.newSession) }),
    );
    expect(onNewSession).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "⋯" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: new RegExp(strings.topBar.sessionList) }),
    );
    expect(onOpenSessions).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "⋯" }));
    await userEvent.click(
      await screen.findByRole("menuitemcheckbox", { name: new RegExp(strings.topBar.focusMode) }),
    );
    expect(onToggleFocus).toHaveBeenCalledTimes(1);
  });

  it("renders a session title and falls back to 自由提问", () => {
    render(<Shell {...baseProps({ sessionTitle: "CTM 7 周" })} />);
    expect(screen.getByText("CTM 7 周")).toBeTruthy();
    cleanup();
    render(<Shell {...baseProps({ sessionTitle: null })} />);
    expect(screen.getByText(strings.chat.freeSession)).toBeTruthy();
  });
});

describe("Bear Shell session tabs (tabs.html)", () => {
  const tabs = (onPick = vi.fn()): ShellProps["tabs"] => ({
    items: [
      { key: "control", label: "总控 · C1", active: false, busy: false },
      { key: "course:epp", label: "离散 D4", active: true, busy: true },
      { key: "course:ctm", label: "CTM D1", active: false, busy: false },
    ],
    onPick,
  });

  it("replaces the title with the tabs: the open one is current and carries the busy dot; ＋ stays", () => {
    render(<Shell {...baseProps({ tabs: tabs(), sessionTitle: "CTM 7 周" })} />);
    expect(screen.queryByText("CTM 7 周")).toBeNull();
    const current = screen.getByRole("button", { name: /离散 D4/ });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.querySelector(".bear-stab-dot")).not.toBeNull();
    expect(screen.getByRole("button", { name: "总控 · C1" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("button", { name: "＋" })).toBeTruthy();
  });

  it("picks a tab on click and steps with ⌃Tab / ⌃⇧Tab", async () => {
    const onPick = vi.fn();
    render(<Shell {...baseProps({ tabs: tabs(onPick) })} />);
    await userEvent.click(screen.getByRole("button", { name: "CTM D1" }));
    expect(onPick).toHaveBeenLastCalledWith("course:ctm");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", ctrlKey: true }));
    expect(onPick).toHaveBeenLastCalledWith("course:ctm");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", ctrlKey: true, shiftKey: true }));
    expect(onPick).toHaveBeenLastCalledWith("control");
  });

  it("⌘0 jumps to 总控 and is marked handled so the body-scale reset skips it", () => {
    const onPick = vi.fn();
    render(<Shell {...baseProps({ tabs: tabs(onPick) })} />);
    const event = new KeyboardEvent("keydown", { key: "0", metaKey: true, cancelable: true });
    window.dispatchEvent(event);
    expect(onPick).toHaveBeenLastCalledWith("control");
    expect(event.defaultPrevented).toBe(true);
  });

  it("hides the tabs in focus mode", () => {
    render(<Shell {...baseProps({ tabs: tabs(), focusMode: true })} />);
    expect(screen.queryByRole("button", { name: "总控 · C1" })).toBeNull();
  });
});
