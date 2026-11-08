/**
 * Bear 会话 list: the title-bar popover behind the 「<标题> ▾」 button.
 *
 * The trigger keeps the original title text (and the 总控 avatar when the
 * control session is open) plus a small ▾; the content is a day-grouped list —
 * today / yesterday / MM-DD 周X — of 「时间 · tag · 标题 · N 条」 rows, with
 * ＋新会话 at the top right. Picking a row opens that transcript.
 */

import {
  Root as Popover,
  Content as PopoverContent,
  Portal as PopoverPortal,
  Trigger as PopoverTrigger,
} from "@animate-ui/react/primitives/radix-ui/popover";
import type { SessionsView } from "../contract.js";
import type { ControlView } from "../../core/board/bot-state.js";
import type { SessionRow } from "../../core/board/session-list.js";
import { strings } from "../../core/strings.js";
import { ControlBot } from "./control-bot.js";

/** One 「时间 · tag · 标题 · N 条」 row, shared by the popover and the calendar's 这天的会话. */
export function SessionRowButton({ row, onOpen }: { row: SessionRow; onOpen(file: string): void }) {
  return (
    <button
      type="button"
      className={`bear-sessions-row${row.current ? " is-current" : ""}`}
      onClick={() => onOpen(row.file)}
    >
      <span className="bear-sessions-time">{row.time}</span>
      <span className="bear-sessions-tag" title={row.tag}>{row.tag}</span>
      <span className="bear-sessions-name">{row.title}</span>
      <span className="bear-sessions-count">{strings.sessions.count(row.count)}</span>
    </button>
  );
}

export function SessionsButton({
  sessions,
  control,
  title,
}: {
  sessions: SessionsView;
  control: ControlView | null;
  title: string | null;
}) {
  return (
    <Popover open={sessions.open} onOpenChange={sessions.onOpenChange}>
      <PopoverTrigger className="bear-title bear-title-btn">
        {control && <ControlBot mood={control.mood} />}
        {title ?? strings.chat.freeSession}
        <span className="bear-title-caret" aria-hidden="true">
          ▾
        </span>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent className="bear-sessions" align="start" sideOffset={6}>
          <div className="bear-sessions-head">
            <span className="bear-sessions-title">{strings.sessions.title}</span>
            <button type="button" className="bear-sessions-new" onClick={sessions.onNew}>
              {strings.sessions.newSession}
            </button>
          </div>
          {sessions.status === "loading" && <p className="bear-sessions-note">{strings.sessions.loading}</p>}
          {sessions.status === "error" && <p className="bear-sessions-note">{strings.sessions.failed}</p>}
          {sessions.status === "ready" && sessions.groups.length === 0 && (
            <p className="bear-sessions-note">{strings.sessions.none}</p>
          )}
          {sessions.groups.map((group) => (
            <section key={group.date}>
              <h5 className="bear-sessions-day">{group.label}</h5>
              {group.rows.map((row) => (
                <SessionRowButton key={row.file} row={row} onOpen={sessions.onPick} />
              ))}
            </section>
          ))}
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}
