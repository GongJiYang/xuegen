/**
 * Bear 总控面板 (design `?d=dash`, PANEL-PLAN): one page for the 总控 session.
 *
 * Top: six status tiles. Then 今天 beside 本周 / 本月 (the planbook's day and
 * week / month views, reused). Below: 总进度, 书房, 卡片 in three columns. Every
 * block has its own loading state (checklist 1.3); copy comes from
 * `strings.panel` and `strings.planbook`, styles only use Bear tokens.
 */

import { useState, type ReactNode } from "react";
import type { ControlPanelProps } from "../contract.js";
import type { PlanView } from "../../core/board/planbook-nav.js";
import type { PanelTile, ShelfRow, UnplannedMaterial } from "../../core/board/panel.js";
import type { CardsStats, CycleOverview } from "@shared/data-protocol.js";
import { strings } from "../../core/strings.js";
import { PlanbookBody } from "./planbook.js";
import { TermsBlock } from "./terms-block.js";
import { ChangesBanner } from "./changes-banner.js";
import {
  addBookPrompt,
  changeModePrompt,
  pausePrompt,
  resumePrompt,
  setTargetPrompt,
} from "../../core/board/control-prompts.js";

function Tiles({ tiles }: { tiles: PanelTile[] }) {
  return (
    <div className="bear-cp-tiles">
      {tiles.map((tile) => (
        <div key={tile.key} className="bear-cp-tile">
          <span className="bear-cp-cap">{strings.panel.tileLabels[tile.key]}</span>
          <b className={tile.value === "" ? "is-loading" : undefined}>{tile.value}</b>
          {tile.sub !== "" && (
            <span className={`bear-cp-meta${tile.warn ? " is-warn" : ""}`}>{tile.sub}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function Block({
  title,
  caption,
  actions,
  children,
}: {
  title: string;
  caption?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bear-cp-block">
      <header className="bear-cp-head">
        <h2>{title}</h2>
        {caption !== undefined && <span className="bear-cp-meta">{caption}</span>}
        {actions !== undefined && <span className="bear-cp-head-acts">{actions}</span>}
      </header>
      {children}
    </section>
  );
}

function ShelfList({ rows, onAsk }: { rows: ShelfRow[] | null; onAsk: ControlPanelProps["onAsk"] }) {
  if (rows === null) return <p className="bear-cp-meta">{strings.panel.blockLoading}</p>;
  if (rows.length === 0) return <p className="bear-cp-meta">{strings.panel.shelfEmpty}</p>;
  return (
    <>
      {rows.map((row) => {
        const book = { slug: row.slug, short: row.short };
        return (
          <div key={`${row.kind}-${row.slug}`} className="bear-cp-row">
            <p className="bear-cp-name">
              {row.short}
              <span className="bear-cp-tag">{strings.panel.shelfModes[row.mode]}</span>
              <span className="bear-cp-num">
                {row.done} / {row.total} {row.unit}
              </span>
            </p>
            <p className={`bear-cp-meta${row.warn ? " is-warn" : ""}`}>{row.meta}</p>
            {row.kind === "book" && (
              <p className="bear-cp-acts">
                <button
                  type="button"
                  className="bear-cp-link"
                  onClick={() => onAsk(row.status === "paused" ? resumePrompt(book) : pausePrompt(book))}
                >
                  {row.status === "paused" ? strings.panel.bookResume : strings.panel.bookPause}
                </button>
                <button type="button" className="bear-cp-link" onClick={() => onAsk(changeModePrompt(book))}>
                  {strings.panel.bookMode}
                </button>
                <TargetEditor book={book} target={row.target} onAsk={onAsk} />
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}

function Unplanned({ items }: { items: UnplannedMaterial[] | null }) {
  if (items === null) return <p className="bear-cp-meta">{strings.panel.blockLoading}</p>;
  if (items.length === 0) return <p className="bear-cp-meta">{strings.panel.unplannedNone}</p>;
  return (
    <ul className="bear-cp-list">
      {items.map((item) => (
        <li key={`${item.subject}-${item.title}`}>
          <span>{item.title}</span>
          <span className="bear-cp-meta">{item.subjectTitle}</span>
        </li>
      ))}
    </ul>
  );
}

function Cards({ stats }: { stats: CardsStats | null }) {
  if (stats === null) return <p className="bear-cp-meta">{strings.panel.blockLoading}</p>;
  return (
    <ul className="bear-cp-list bear-cp-cards">
      <li className="bear-cp-list-head">
        <span>{strings.panel.cardsDeckHead}</span>
        <span className="bear-cp-num">{strings.panel.cardsCount}</span>
        <span className="bear-cp-num">{strings.panel.cardsSync}</span>
      </li>
      {stats.decks.map((deck) => (
        <li key={deck.deck}>
          <span>{deck.deck}</span>
          <span className="bear-cp-num">{deck.total}</span>
          <span className="bear-cp-num">{deck.unsynced || "—"}</span>
        </li>
      ))}
      {stats.broken > 0 && (
        <li className="bear-cp-meta is-warn">{strings.panel.cardsBroken(stats.broken)}</li>
      )}
    </ul>
  );
}

/** The grey line under a main course in 总进度: what comes next, or the last lesson's date. */
function progressLine(
  course: CycleOverview["courses"][number],
  today: string,
): { text: string; warn: boolean } {
  const panel = strings.panel;
  if (course.next === null) return { text: panel.progressFinished, warn: false };
  const end = course.end === null ? "" : ` · ${panel.progressEnd(course.end)}`;
  if (course.next.date < today)
    return { text: panel.progressLate(course.next.id, course.next.date) + end, warn: false };
  return {
    text: panel.progressNext(course.next.id, course.next.date, course.next.date === today) + end,
    warn: false,
  };
}

function Progress({ overview }: { overview: CycleOverview | null }) {
  if (overview === null) return <p className="bear-cp-meta">{strings.panel.blockLoading}</p>;
  return (
    <div className="bear-cp-prog">
      {overview.courses
        .filter((course) => course.role === "main")
        .map((course) => (
          <div key={course.slug} className="bear-cp-row">
            <p className="bear-cp-name">
              {course.name}
              <span className="bear-cp-num">
                {course.done} / {course.total}
              </span>
            </p>
            <div className="bear-cp-bar">
              <i style={{ width: `${course.total === 0 ? 0 : (course.done / course.total) * 100}%` }} />
            </div>
            {(() => {
              const line = progressLine(course, overview.date);
              return <p className={`bear-cp-meta${line.warn ? " is-warn" : ""}`}>{line.text}</p>;
            })()}
          </div>
        ))}
      {overview.cycle !== null && (
        <p className="bear-cp-meta bear-cp-route">
          {strings.panel.progressCycle(overview.cycle.cycle, overview.cycle.end, overview.cycle.plannedEnd)}
        </p>
      )}
      {(overview.cycle?.next ?? null) !== null || overview.route !== null ? (
        <p className="bear-cp-meta">
          {[
            overview.cycle?.next
              ? strings.panel.progressNext2(overview.cycle.next.cycle, overview.cycle.next.start)
              : null,
            overview.route ? strings.panel.progressRoute(overview.route.end) : null,
          ]
            .filter((part) => part !== null)
            .join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

/** 加一本书: title + 自读 / 带读 + optional target, handed to 总控 (which confirms before writing). */
function AddBook({ onAsk }: { onAsk: ControlPanelProps["onAsk"] }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"self" | "guide">("self");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const panel = strings.panel;
  if (!open) {
    return (
      <button type="button" className="bear-cp-link" onClick={() => setOpen(true)}>
        {panel.shelfAdd}
      </button>
    );
  }
  const submit = (): void => {
    const name = title.trim();
    if (name === "") return setError(panel.addTitleMissing);
    const date = target.trim();
    if (date !== "" && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))) {
      return setError(panel.targetInvalid);
    }
    // The slug is a suggestion; 总控 confirms the book (and its file name) before writing.
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "book";
    onAsk(
      addBookPrompt({ title: name, slug, subject: "", mode, days: [], target: date === "" ? null : date }),
    );
    setOpen(false);
    setTitle("");
    setTarget("");
    setError(null);
  };
  return (
    <div className="bear-cp-add">
      <input
        className="bear-cp-input"
        placeholder={panel.addTitle}
        aria-label={panel.addTitle}
        value={title}
        autoFocus
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
          if (event.key === "Escape") setOpen(false);
        }}
      />
      <span className="bear-pb-seg">
        {(["self", "guide"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={mode === value ? "is-on" : ""}
            onClick={() => setMode(value)}
          >
            {panel.addModes[value]}
          </button>
        ))}
      </span>
      <input
        className="bear-cp-input"
        placeholder={panel.addTargetOptional}
        aria-label={panel.addTargetOptional}
        value={target}
        onChange={(event) => setTarget(event.target.value)}
      />
      <button type="button" className="bear-cp-link" onClick={submit}>
        {panel.addSend}
      </button>
      <button type="button" className="bear-cp-link" onClick={() => setOpen(false)}>
        {panel.addCancel}
      </button>
      {error !== null && (
        <span role="alert" className="bear-cp-meta is-warn">
          {error}
        </span>
      )}
    </div>
  );
}

/** 周 / 月 switch, ‹ 今天 ›, and the range title for the 本周 / 本月 block. */
function WeekControls(props: ControlPanelProps) {
  const views: PlanView[] = ["week", "month"];
  return (
    <div className="bear-cp-controls">
      <span className="bear-pb-seg">
        {views.map((view) => (
          <button
            key={view}
            type="button"
            className={props.view === view ? "is-on" : ""}
            onClick={() => props.onView(view)}
          >
            {strings.planbook.views[view]}
          </button>
        ))}
      </span>
      <span className="bear-cp-meta">{props.label}</span>
      <span className="bear-cp-nav">
        <button type="button" className="bear-cp-link" onClick={props.onPrev}>
          {strings.planbook.paging[props.view].prev}
        </button>
        <button type="button" className="bear-cp-link" disabled={props.todayDisabled} onClick={props.onToday}>
          {strings.planbook.paging[props.view].now}
        </button>
        <button type="button" className="bear-cp-link" onClick={props.onNext}>
          {strings.planbook.paging[props.view].next}
        </button>
      </span>
    </div>
  );
}

export function ControlPanel(props: ControlPanelProps) {
  return (
    <div className="bear-cp">
      <Tiles tiles={props.tiles} />
      <div className="bear-cp-row2">
        <Block
          title={strings.panel.blockToday}
          actions={
            <>
              {!props.shownToday && (
                <button type="button" className="bear-cp-link" onClick={props.onBackToToday}>
                  {strings.panel.backToToday}
                </button>
              )}
              <button type="button" className="bear-cp-link" onClick={props.onOpenSkills}>
                {strings.panel.todaySettings}
              </button>
              <button type="button" className="bear-cp-link" onClick={props.onPrint}>
                {strings.panel.todayPrint}
              </button>
            </>
          }
        >
          {props.day === null ? (
            <p className="bear-cp-meta">{strings.panel.blockLoading}</p>
          ) : (
            <PlanbookBody
              view="day"
              day={props.day}
              week={null}
              month={null}
              todayCard={props.todayCard}
              tomorrow={props.tomorrow}
              onOpenDay={props.onOpenDay}
              onOpenAnki={props.onOpenAnki}
            />
          )}
        </Block>
        <div className="bear-cp-col">
          <Block title={props.view === "month" ? strings.panel.blockMonth : strings.panel.blockWeek}>
            <WeekControls {...props} />
            {props.changes !== null && <ChangesBanner changes={props.changes} />}
            <PlanbookBody
              view={props.view === "month" ? "month" : "week"}
              day={null}
              week={props.week}
              month={props.month}
              todayCard={null}
              tomorrow={null}
              onOpenDay={props.onOpenDay}
              onOpenAnki={props.onOpenAnki}
              marks={props.changes?.marks ?? null}
            />
          </Block>
          <div className="bear-cp-termslot">
            <TermsBlock terms={props.terms} onOpenTerm={props.onOpenTerm} />
          </div>
        </div>
      </div>
      <div className="bear-cp-row3">
        <Block title={strings.panel.blockProgress} caption={strings.panel.blockProgressCaption}>
          <Progress overview={props.overview} />
        </Block>
        <Block title={strings.panel.blockShelf} actions={<AddBook onAsk={props.onAsk} />}>
          <ShelfList rows={props.shelf} onAsk={props.onAsk} />
          <Unplanned items={props.unplanned} />
        </Block>
        <Block
          title={strings.panel.blockCards}
          actions={
            <button type="button" className="bear-cp-link" onClick={props.onOpenCards}>
              {strings.panel.cardsNew}
            </button>
          }
        >
          <Cards stats={props.cards} />
        </Block>
      </div>
    </div>
  );
}

/** 设目标日期: a small date field under the book row. Only sends to 总控 once the date is valid. */
function TargetEditor({
  book,
  target,
  onAsk,
}: {
  book: { slug: string; short: string };
  target: string | null;
  onAsk: ControlPanelProps["onAsk"];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(target ?? "");
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <button type="button" className="bear-cp-link" onClick={() => setOpen(true)}>
        {target === null ? strings.panel.bookTarget : strings.panel.bookTargetChange}
      </button>
    );
  }
  const submit = (): void => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft) || Number.isNaN(Date.parse(draft))) {
      setError(strings.panel.targetInvalid);
      return;
    }
    setError(null);
    setOpen(false);
    onAsk(setTargetPrompt(book, draft));
  };
  return (
    <span className="bear-cp-target">
      <input
        className="bear-cp-input"
        placeholder="2027-01-15"
        value={draft}
        aria-label={strings.panel.targetLabel(book.short)}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
          if (event.key === "Escape") setOpen(false);
        }}
      />
      <button type="button" className="bear-cp-link" onClick={submit}>
        {strings.panel.targetSave}
      </button>
      {target !== null && (
        <button
          type="button"
          className="bear-cp-link"
          onClick={() => {
            setOpen(false);
            onAsk(setTargetPrompt(book, null));
          }}
        >
          {strings.panel.targetClear}
        </button>
      )}
      {error !== null && (
        <span role="alert" className="bear-cp-meta is-warn">
          {error}
        </span>
      )}
    </span>
  );
}
