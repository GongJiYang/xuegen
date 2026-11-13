/**
 * Chicago menu bar.
 *
 * The System 6 menu bar: 学 / 文件 / 编辑 / 学习 / 显示 / 模型 plus the date on
 * the right. Clicking a title opens its dropdown; moving the pointer across
 * titles while one is open switches menus; clicking an item flashes it three
 * times (one step animation) and runs its action. The design's behaviours are
 * the spec — this is a direct port, restructured as React.
 */

import { forwardRef, useEffect, useRef, useState } from "react";
import type { BodyFont, ModelInfo, TeachingStyle } from "@shared/protocol.js";
import { BODY_FONTS, TEACHING_STYLE_LABELS, THINKING_LEVEL_LABELS } from "@shared/protocol.js";
import { strings } from "../../core/strings.js";
import { now } from "../../core/today.js";
import { shortModelName } from "../../core/chat/model-short-name.js";
import type { ToolDescriptor, ToolId } from "../contract.js";
import { PALETTES, PALETTE_IDS, PALETTE_OPTION_KEY, resolvePaletteId } from "./palette.js";
import { bodyScalePixels, bodyScaleStepsForFont, coerceBodyScaleForFont } from "../../core/settings/body-font.js";

interface MenuBarProps {
  skins: { id: string; name: string }[];
  activeSkin: string;
  onSelectSkin(id: string): void;
  skinOptions: Record<string, string>;
  onSkinOption(key: string, value: string): void;
  bodyFont: BodyFont;
  onBodyFont(font: BodyFont): void;
  bodyScale: number;
  onBodyScale(value: number): void;
  models: ModelInfo[];
  currentModel: ModelInfo | null;
  onSelectModel(provider: string, id: string): void;
  onNewSession(): void;
  onOpenSessions(): void;
  focus: boolean;
  onToggleFocus(): void;
  tools: ToolDescriptor[];
  onOpenTool(tool: ToolId): void;
  /** Show (or switch to) the 今天 window from the 学习 menu. */
  onOpenToday(): void;
  /** Re-show every collapsed side window (显示 ▸ 显示全部侧窗). */
  onShowAllWindows(): void;
  /** True when no side window is collapsed, so 显示全部侧窗 is a no-op. */
  showAllWindowsDisabled: boolean;
  style: TeachingStyle;
  onSelectStyle(style: TeachingStyle): void;
  onEndToday(): void;
  onPrompt(text: string): void;
  /** 开课 → in the 学习 menu: the same resume as the 今天 window's button. */
  onResume(): void;
  /** The current thinking level, for the 思考强度 submenu's checkmark. */
  thinkingLevel: string | null;
  /** Levels the active model supports; unsupported ones stay visible but disabled. */
  thinkingLevels: string[];
  /** Change the thinking level; persists as the default. */
  onSelectThinking(level: string): void;
}

/** One dropdown row. `onSelect` runs after the design's flash. */
interface MenuItem {
  key: string;
  label: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

/** A menu: a title and its items (a `null` is a separator). */
interface Menu {
  key: string;
  title: string;
  logo?: boolean;
  items: (MenuItem | null)[];
}

/** Flash an item three times (once under reduced motion), then run its action. */
function useFlashingSelect(): (item: HTMLElement, action?: () => void) => void {
  return (item, action) => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cycles = reduced ? 1 : 3;
    let cycle = 0;
    const tick = (): void => {
      cycle += 1;
      item.style.background = cycle % 2 === 1 ? "var(--ink)" : "";
      item.style.color = cycle % 2 === 1 ? "var(--paper)" : "";
      if (cycle < cycles * 2) {
        window.setTimeout(tick, 40);
      } else {
        item.style.background = "";
        item.style.color = "";
        action?.();
      }
    };
    tick();
  };
}

export const MenuBar = forwardRef<HTMLElement, MenuBarProps>(function MenuBar(props, ref) {
  const [open, setOpen] = useState<string | null>(null);
  const flash = useFlashingSelect();
  const rootRef = useRef<HTMLElement | null>(null);

  // Close on a click outside the bar.
  useEffect(() => {
    function onDown(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const paletteId = resolvePaletteId(props.skinOptions[PALETTE_OPTION_KEY]);
  const menus = buildMenus(props, paletteId, flash, setOpen);

  return (
    <nav className="chicago-menubar" ref={ref}>
      <span ref={rootRef} className="chicago-menubar-items">
        {menus.map((menu) => (
          <div key={menu.key} className={`chicago-m ${menu.logo ? "chicago-m-logo" : ""} ${open === menu.key ? "chicago-open" : ""}`}>
            <span
              className="chicago-t"
              role="button"
              tabIndex={0}
              onMouseDown={(event) => {
                event.stopPropagation();
                setOpen((current) => (current === menu.key ? null : menu.key));
              }}
              onMouseEnter={() => setOpen((current) => (current ? menu.key : current))}
            >
              {menu.title}
            </span>
            <div className="chicago-dropdown">
              {menu.items.map((item, index) =>
                item === null ? (
                  <div key={`sep-${index}`} className="chicago-sep" />
                ) : (
                  <MenuRow key={item.key} item={item} onSelect={flash} />
                ),
              )}
            </div>
          </div>
        ))}
      </span>
      <span className="chicago-spacer" />
      {props.currentModel && (
        <span className="chicago-clock chicago-model-short" title={props.currentModel.name}>
          {shortModelName(props.currentModel.name, props.currentModel.id)}
        </span>
      )}
      <span className="chicago-clock">{todayLabel()}</span>
    </nav>
  );
});

/** A single dropdown row that flashes before running its action. */
function MenuRow({ item, onSelect }: { item: MenuItem; onSelect: (el: HTMLElement, action?: () => void) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={ref}
      className={`chicago-i ${item.disabled ? "chicago-off" : ""} ${item.checked ? "chicago-checked" : ""}`}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={() => {
        if (item.disabled || !ref.current) return;
        onSelect(ref.current, item.onSelect);
      }}
    >
      <span>{item.label}</span>
      {item.shortcut && <span className="chicago-k">{item.shortcut}</span>}
    </div>
  );
}

/** Build the whole menu structure from the current props. */
function buildMenus(
  props: MenuBarProps,
  paletteId: string,
  flash: (item: HTMLElement, action?: () => void) => void,
  setOpen: (value: string | null) => void,
): Menu[] {
  const close = (): void => setOpen(null);
  const run = (action?: () => void) => (): void => {
    action?.();
    close();
  };

  return [
    {
      key: "about",
      title: strings.app.nameZh,
      logo: true,
      items: [{ key: "about", label: `${strings.app.name} ${strings.app.nameZh}`, disabled: true }],
    },
    {
      key: "file",
      title: strings.topBar.menuFile,
      items: [
        { key: "new", label: strings.topBar.newSession, shortcut: "⌘N", onSelect: run(props.onNewSession) },
        { key: "sessions", label: strings.topBar.sessionList, onSelect: run(props.onOpenSessions) },
      ],
    },
    {
      key: "edit",
      title: strings.topBar.menuEdit,
      items: [
        { key: "copy", label: strings.topBar.copyAnswer, shortcut: "⌘⇧C", disabled: true },
        { key: "all", label: strings.topBar.selectAll, shortcut: "⌘A", disabled: true },
      ],
    },
    {
      key: "learn",
      title: strings.topBar.menuLearn,
      items: [
        { key: "today", label: strings.topBar.todayDone, shortcut: "⌘E", onSelect: run(props.onEndToday) },
        { key: "resume", label: strings.today.resume, onSelect: run(props.onResume) },
        null,
        // 今天 is a window, not one of the five tools, so it gets its own entry
        // here and an icon in the dock: either reopens a collapsed 今天 (B3).
        { key: "today-window", label: strings.today.title, onSelect: run(props.onOpenToday) },
        ...props.tools.map((tool) => ({
          key: `tool-${tool.id}`,
          label: tool.name,
          shortcut: `⌘${tool.shortcut}`,
          onSelect: run(() => props.onOpenTool(tool.id)),
        })),
      ],
    },
    {
      key: "style",
      title: strings.topBar.menuStyle,
      items: [
        ...TEACHING_STYLE_LABELS.map((entry, index) => ({
          key: `style-${entry.id}`,
          label: entry.label,
          shortcut: `⌘⌥${index + 1}`,
          checked: props.style === entry.id,
          onSelect: run(() => props.onSelectStyle(entry.id)),
        })),
        null,
        { key: "style-note", label: strings.topBar.stylePerCourse, disabled: true },
      ],
    },
    {
      key: "view",
      title: strings.topBar.menuView,
      items: [
        { key: "appearance-head", label: `${strings.topBar.appearance} ▸`, disabled: true },
        ...props.skins.map((skin) => ({
          key: `skin-${skin.id}`,
          label: skin.name,
          checked: skin.id === props.activeSkin,
          onSelect: run(() => props.onSelectSkin(skin.id)),
        })),
        null,
        { key: "body-font-head", label: `${strings.topBar.bodyFont} ▸`, disabled: true },
        ...BODY_FONTS.map((font) => ({
          key: `font-${font}`,
          label: strings.topBar.fontNames[font],
          checked: font === props.bodyFont,
          onSelect: run(() => props.onBodyFont(font)),
        })),
        { key: "body-size-head", label: `${strings.topBar.bodyScale} ▸`, disabled: true },
        ...bodyScaleStepsForFont(props.bodyFont).map((scale) => ({
          key: `size-${scale}`,
          label: `${bodyScalePixels(scale)}px`,
          checked: scale === coerceBodyScaleForFont(props.bodyScale, props.bodyFont),
          onSelect: run(() => props.onBodyScale(scale)),
        })),
        {
          key: "focus",
          label: strings.topBar.focusMode,
          shortcut: "⌘.",
          checked: props.focus,
          onSelect: run(props.onToggleFocus),
        },
        {
          key: "show-all",
          label: strings.topBar.showAllWindows,
          // Nothing to restore when no side window is collapsed.
          disabled: props.showAllWindowsDisabled,
          onSelect: run(props.onShowAllWindows),
        },
        null,
        { key: "palette-head", label: strings.topBar.palette, disabled: true },
        ...PALETTE_IDS.map((id) => ({
          key: `pal-${id}`,
          label: PALETTES[id].name,
          checked: id === paletteId,
          onSelect: run(() => props.onSkinOption(PALETTE_OPTION_KEY, id)),
        })),
      ],
    },
    {
      key: "model",
      title: strings.topBar.modelLabel,
      items: [
        ...(props.models.length === 0
          ? [{ key: "empty", label: strings.topBar.modelEmpty, disabled: true } as MenuItem]
          : props.models.map((model) => ({
              key: `${model.provider}::${model.id}`,
              label: model.name,
              checked:
                props.currentModel?.provider === model.provider && props.currentModel?.id === model.id,
              onSelect: run(() => props.onSelectModel(model.provider, model.id)),
            }))),
        null,
        { key: "thinking-head", label: strings.topBar.thinkingLevel, disabled: true },
        // A model without thinking support reports a null level: the items stay
        // visible but disabled, so the menu shape does not shift.
        ...THINKING_LEVEL_LABELS.map((entry) => ({
          key: `think-${entry.id}`,
          label: entry.label,
          checked: props.thinkingLevel === entry.id,
          disabled: props.thinkingLevel === null || !props.thinkingLevels.includes(entry.id),
          onSelect: run(() => props.onSelectThinking(entry.id)),
        })),
      ],
    },
  ];
}

/** The date in the bar's right corner, e.g. "11月3日 周一". */
function todayLabel(): string {
  const day = now();
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][day.getDay()] ?? "";
  return `${day.getMonth() + 1}月${day.getDate()}日 ${weekday}`;
}
