/**
 * Bare skin: every slot as plain semantic HTML.
 *
 * The reference skin. It exists so the contract test has a concrete, always
 * available implementation and so an unknown or failed skin has somewhere to
 * fall back to. It carries no stylesheet and no motion; the appearance menu is a
 * `<select>` so the mandatory "switch skins" entry is present without design.
 * The slots are split across `messages.tsx` (thread + composer + notices) and
 * `panels.tsx` / `panels-more.tsx` (the F2 tool windows); this file holds the
 * `Shell` and the module export.
 */

import type { ShellProps, SkinModule, SkinSlots } from "../contract.js";
import { strings } from "../../core/strings.js";
import { BODY_FONTS, isBodyFont } from "@shared/protocol.js";
import {
  bodyScalePixels,
  bodyScaleStepsForFont,
  coerceBodyScaleForFont,
} from "../../core/settings/body-font.js";
import { BareContentNode } from "./content.js";
import { ReadingPanel, TodayPanel, ToolDock } from "./panels.js";
import { UpdateBar } from "./update-bar.js";
import { ProgressPanel } from "./progress-panel.js";
import { BoardPanel, CalendarPanel, CardsPanel, DayEditor, NotesPanel, SkillsPanel, SlashMenu } from "./panels-more.js";
import { ControlCard } from "./control-card.js";
import {
  AssistantMessage,
  Composer,
  CourseIntroCard,
  Exercise,
  ModelPicker,
  Notice,
  Thread,
  Thinking,
  ToolActivity,
  UserMessage,
} from "./messages.js";

function Shell({
  children,
  skins,
  activeSkin,
  onSelectSkin,
  bodyFont,
  onBodyFont,
  bodyScale,
  onBodyScale,
  agentStatus,
  notices,
  onDismissNotice,
  contextUsage,
  sessions,
}: ShellProps) {
  return (
    <div data-slot="shell">
      <header data-slot="menu">
        <h1>
          {strings.app.name} {strings.app.nameZh}
        </h1>
        <button type="button" onClick={() => sessions.onOpenChange(!sessions.open)}>
          {strings.sessions.title} ▾
        </button>
        {sessions.open && (
          <div data-slot="sessions">
            <button type="button" onClick={sessions.onNew}>
              {strings.sessions.newSession}
            </button>
            {sessions.status === "loading" && <p>{strings.sessions.loading}</p>}
            {sessions.status === "error" && <p role="alert">{strings.sessions.failed}</p>}
            {sessions.status === "ready" && sessions.groups.length === 0 && <p>{strings.sessions.none}</p>}
            {sessions.groups.map((group) => (
              <section key={group.date}>
                <h3>{group.label}</h3>
                <ul>
                  {group.rows.map((row) => (
                    <li key={row.file}>
                      <button
                        type="button"
                        aria-current={row.current ? "true" : undefined}
                        onClick={() => sessions.onPick(row.file)}
                      >
                        {row.time} · {row.tag} · {row.title} · {strings.sessions.count(row.count)}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        <label>
          <span>{strings.topBar.appearance}</span>
          <select
            aria-label={strings.topBar.appearanceTitle}
            value={activeSkin}
            onChange={(event) => onSelectSkin(event.target.value)}
          >
            {skins.map((skin) => (
              <option key={skin.id} value={skin.id}>
                {skin.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{strings.topBar.bodyFont}</span>
          <select
            aria-label={strings.topBar.bodyFontTitle}
            value={bodyFont}
            onChange={(event) => {
              if (isBodyFont(event.target.value)) onBodyFont(event.target.value);
            }}
          >
            {BODY_FONTS.map((font) => (
              <option key={font} value={font}>
                {strings.topBar.fontNames[font]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{strings.topBar.bodyScale}</span>
          <select
            aria-label={strings.topBar.bodyScaleTitle}
            value={String(coerceBodyScaleForFont(bodyScale, bodyFont))}
            onChange={(event) => onBodyScale(Number(event.target.value))}
          >
            {bodyScaleStepsForFont(bodyFont).map((step) => (
              <option key={step} value={String(step)}>
                {bodyScalePixels(step)}px
              </option>
            ))}
          </select>
        </label>
        <details data-slot="context-usage">
          <summary>{contextUsage.label}</summary>
          <p>{contextUsage.detail}</p>
          <button type="button" disabled={contextUsage.compacting} onClick={contextUsage.onCompact}>
            {strings.chat.compactNow}
          </button>
        </details>
        <span data-slot="agent-status" role="status">
          {agentStatus}
        </span>
      </header>

      {notices.length > 0 && (
        <ul data-slot="notices">
          {notices.map((notice, index) => (
            <li key={`${index}-${notice.text}`}>
              <Notice notice={notice} onDismiss={() => onDismissNotice(index)} />
            </li>
          ))}
        </ul>
      )}

      {children}
    </div>
  );
}

const bareSlots: SkinSlots = {
  Shell,
  Thread,
  UserMessage,
  AssistantMessage,
  ToolActivity,
  Thinking,
  UpdateBar,
  Exercise,
  Composer,
  ModelPicker,
  Notice,
  BoardPanel,
  NotesPanel,
  ToolDock,
  TodayPanel,
  ProgressPanel,
  ReadingPanel,
  CardsPanel,
  CalendarPanel,
  SkillsPanel,
  DayEditor,
  SlashMenu,
  CourseIntroCard,
  ControlCard,
};

/** The bare skin module, consumed by the registry's named-export loader. */
export const bareSkin: SkinModule = {
  bodyScaleSteps: bodyScaleStepsForFont,
  slots: bareSlots,
  motion: { run: () => null },
  content: { Node: BareContentNode },
};
