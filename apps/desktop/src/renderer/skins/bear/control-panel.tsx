/**
 * Bear 总控面板 (design `?d=dash`, PANEL-PLAN): one page for the 总控 session.
 *
 * Top: six status tiles. Then 今天 beside 本周 / 本月 (the planbook's day and
 * week / month views, reused). Below: 总进度, 书房, 卡片 in three columns. Every
 * block has its own loading state (checklist 1.3); copy comes from
 * `strings.panel` and `strings.planbook`, styles only use Bear tokens.
 */

import { useEffect, useRef, type ReactNode } from "react";
import type { ControlPanelProps } from "../contract.js";
import type { PlanView } from "../../core/board/planbook-nav.js";
import type { PanelTile } from "../../core/board/panel.js";
import type { CardsStats, CycleOverview } from "@shared/data-protocol.js";
import { strings } from "../../core/strings.js";
import { PlanbookBody } from "./planbook.js";
import { TermsBlock } from "./terms-block.js";
import { ChangesBanner } from "./changes-banner.js";
import { AddBook, ShelfList, Unplanned } from "./control-shelf.js";
import { NextCycleBanner, NextCycleWizard } from "./next-cycle.js";

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
  const weekRef = useRef<HTMLDivElement | null>(null);
  const weekFocus = props.weekFocus ?? 0;
  useEffect(() => {
    if (weekFocus === 0) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    weekRef.current?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  }, [weekFocus]);
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
        <div className="bear-cp-col" ref={weekRef}>
          <Block title={props.view === "month" ? strings.panel.blockMonth : strings.panel.blockWeek}>
            <WeekControls {...props} />
            {props.nextCycle !== undefined && <NextCycleBanner view={props.nextCycle} />}
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
      {props.nextCycle !== undefined && <NextCycleWizard view={props.nextCycle} />}
    </div>
  );
}
