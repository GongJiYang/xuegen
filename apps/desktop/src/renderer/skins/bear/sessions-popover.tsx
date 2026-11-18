/**
 * Bear 会话 list: the title-bar popover behind the 「<标题> ▾」 button.
 *
 * The trigger keeps the original title text (and the 总控 avatar when the
 * control session is open) plus a small ▾; the content is a day-grouped list —
 * today / yesterday / MM-DD 周X — of 「时间 · tag · 标题 · N 条」 rows, with
 * ＋新会话 at the top right. Picking a row opens that transcript. Sessions started
 * from other folders sit folded at the bottom (logic-ui-1116 C).
 */

import {
  Root as Popover,
  Content as PopoverContent,
  Portal as PopoverPortal,
  Trigger as PopoverTrigger,
} from "@animate-ui/react/primitives/radix-ui/popover";
import type { SessionsView, SessionTabsView } from "../contract.js";
import type { ControlView } from "../../core/board/bot-state.js";
import type { OpenCourseRow } from "../../core/board/open-courses.js";
import { useState } from "react";
import type { SessionRow } from "../../core/board/session-list.js";
import type { OtherSessionsView } from "../../core/other-sessions/view.js";
import { otherSessionsStrings } from "../../core/other-sessions/strings.js";
import { strings } from "../../core/strings.js";
import { ControlBot } from "./control-bot.js";

/** One 「时间 · tag · 标题 · N 条」 row, shared by the popover and the calendar's 这天的会话. */
export function SessionRowButton({
  row,
  place,
  onOpen,
}: {
  row: SessionRow;
  place?: string | undefined;
  onOpen(file: string): void;
}) {
  return (
    <button
      type="button"
      className={`bear-sessions-row${row.current ? " is-current" : ""}`}
      onClick={() => onOpen(row.file)}
    >
      <span className="bear-sessions-time">{row.time}</span>
      <span className="bear-sessions-tag" title={row.tag}>{row.tag}</span>
      <span className="bear-sessions-name">{row.title}</span>
      <span className="bear-sessions-count">
        {place === undefined
          ? strings.sessions.count(row.count)
          : otherSessionsStrings.place(strings.sessions.count(row.count), place)}
      </span>
    </button>
  );
}

/** One 「开一门课」 row: the course's label, with its lesson line when there is one. */
function CourseRow({ row, onOpen }: { row: OpenCourseRow; onOpen(slug: string): void }) {
  return (
    <button type="button" className="bear-sessions-row bear-sessions-course" onClick={() => onOpen(row.slug)}>
      <span className="bear-sessions-name">{row.label}</span>
      {row.sub !== null && <span className="bear-sessions-count">{row.sub}</span>}
    </button>
  );
}

/**
 * The courses the 「＋」 popover can open: today's cycle courses first (main, then
 * aux), the rest behind 「其他课程 N 门」 so the list stays short.
 */
function OpenCourses({ rows, onOpen }: { rows: OpenCourseRow[]; onOpen(slug: string): void }) {
  const [more, setMore] = useState(false);
  const cycle = rows.filter((row) => row.group === "cycle");
  const other = rows.filter((row) => row.group === "other");
  return (
    <section className="bear-sessions-courses">
      <h5 className="bear-sessions-day">{strings.sessions.openCourse}</h5>
      {cycle.map((row) => (
        <CourseRow key={row.slug} row={row} onOpen={onOpen} />
      ))}
      {other.length > 0 && (
        <button
          type="button"
          className="bear-sessions-more"
          aria-expanded={more}
          onClick={() => setMore(!more)}
        >
          {strings.sessions.otherCourses(other.length)} {more ? "▾" : "▸"}
        </button>
      )}
      {more &&
        other.map((row) => (
          <CourseRow key={row.slug} row={row} onOpen={onOpen} />
        ))}
    </section>
  );
}

/** 「其他位置的会话 · N 个」: folded by default; open, the same day groups with each row's folder. */
function OtherSessions({ view, onPick }: { view: OtherSessionsView; onPick(file: string): void }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="bear-sessions-others">
      <button type="button" className="bear-sessions-more" aria-expanded={open} onClick={() => setOpen(!open)}>
        {otherSessionsStrings.toggle(view.count)} {open ? "▾" : "▸"}
      </button>
      {open &&
        view.groups.map((group) => (
          <section key={group.date}>
            <h5 className="bear-sessions-day">{group.label}</h5>
            {group.rows.map((row) => (
              <SessionRowButton key={row.file} row={row} place={view.places[row.file]} onOpen={onPick} />
            ))}
          </section>
        ))}
    </section>
  );
}

export function SessionsButton({
  sessions,
  control,
  title,
  plus = false,
  overflow = null,
}: {
  sessions: SessionsView;
  control: ControlView | null;
  title: string | null;
  /** The tab strip's 「＋」 trigger instead of the 「<标题> ▾」 one. */
  plus?: boolean;
  /** Tabs that did not fit in the strip, listed above the session list. */
  overflow?: SessionTabsView | null;
}) {
  return (
    <Popover open={sessions.open} onOpenChange={sessions.onOpenChange}>
      {plus ? (
        <PopoverTrigger className="bear-stab bear-stab-more" title={strings.sessions.title}>
          ＋
        </PopoverTrigger>
      ) : (
        <PopoverTrigger className="bear-title bear-title-btn">
          {control && <ControlBot mood={control.mood} />}
          {title ?? strings.chat.freeSession}
          <span className="bear-title-caret" aria-hidden="true">
            ▾
          </span>
        </PopoverTrigger>
      )}
      <PopoverPortal>
        <PopoverContent className="bear-sessions" align="start" sideOffset={6}>
          <div className="bear-sessions-head">
            <span className="bear-sessions-title">{strings.sessions.title}</span>
            <button type="button" className="bear-sessions-new" onClick={sessions.onNew}>
              {strings.sessions.newSession}
            </button>
          </div>
          {sessions.courses !== undefined && sessions.courses.length > 0 && (
            <OpenCourses rows={sessions.courses} onOpen={(slug) => sessions.onOpenCourse?.(slug)} />
          )}
          {overflow !== null && (
            <section className="bear-sessions-tabs">
              <h5 className="bear-sessions-day">{strings.sessions.foldedTabs}</h5>
              {overflow.items.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className="bear-sessions-row"
                  onClick={() => {
                    sessions.onOpenChange(false);
                    overflow.onPick(tab.key);
                  }}
                >
                  <span className="bear-sessions-name">{tab.label}</span>
                  {tab.busy && <span className="bear-stab-dot" aria-label={strings.sessions.tabBusy} />}
                </button>
              ))}
            </section>
          )}
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
          {sessions.status === "ready" && sessions.others !== undefined && sessions.others.count > 0 && (
            <OtherSessions view={sessions.others} onPick={sessions.onPick} />
          )}
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}
