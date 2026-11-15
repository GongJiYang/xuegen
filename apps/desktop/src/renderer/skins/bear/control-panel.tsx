/**
 * Bear 总控面板 (design `?d=dash`, PANEL-PLAN): one page for the 总控 session.
 *
 * Top: one status line. Then 今天, 本周 / 本月, 术语, 领域 in one column (control-v3 ①); below:
 * 总进度, 书房, 卡片 in three columns. Every
 * block has its own loading state (checklist 1.3); copy comes from
 * `strings.panel` and `strings.planbook`, styles only use Bear tokens.
 */

import { Fragment, useEffect, useRef, type ReactNode } from "react";
import type { ControlPanelProps } from "../contract.js";
import type { PanelTile } from "../../core/board/panel.js";
import { strings } from "../../core/strings.js";
import { PlanbookBody } from "./planbook.js";
import { TermsBlock } from "./terms-block.js";
import { ChangesBanner } from "./changes-banner.js";
import { AddBook, ShelfList, Unplanned } from "./control-shelf.js";
import { NextCycleBanner, NextCycleWizard } from "./next-cycle.js";
import { DomainStrip } from "./domain-strip.js";
import { Cards, Progress, WeekControls } from "./control-panel-blocks.js";
import { StudiedRow } from "./studied-row.js";

/**
 * 总控 v3 ①: the six tiles are one status line, each a button that jumps to its
 * block, separated by 「·」 and closed by the two right-hand links. 周期 reads as
 * value + sub; the rest read as label + value (plus a suffix such as 到期) and
 * keep the sub as the hover title, so the line stays short.
 */
export function StatusStrip({
  tiles,
  onJump,
  onOpenSkills,
  onAskBrief,
  busy,
}: {
  tiles: PanelTile[];
  onJump(key: PanelTile["key"]): void;
  onOpenSkills(): void;
  onAskBrief(): void;
  busy: boolean;
}) {
  return (
    <nav className="bear-cp-strip">
      {tiles.map((tile, index) => (
        <Fragment key={tile.key}>
          {index > 0 && (
            <span className="bear-cp-sep" aria-hidden="true">
              ·
            </span>
          )}
          <button
            type="button"
            className={`bear-cp-chip${tile.value === "" ? " is-loading" : ""}${tile.warn ? " is-warn" : ""}`}
            title={tile.sub !== "" ? tile.sub : undefined}
            onClick={() => onJump(tile.key)}
          >
            {tile.key === "cycle" ? (
              <>
                <b>{tile.value}</b>
                {tile.sub !== "" && ` ${tile.sub}`}
              </>
            ) : (
              <>
                {strings.panel.tileLabels[tile.key]} <b>{tile.value}</b>
                {strings.panel.tileSuffix[tile.key]}
              </>
            )}
          </button>
        </Fragment>
      ))}
      <span className="bear-cp-strip-acts">
        <button type="button" className="bear-cp-link" onClick={onOpenSkills}>
          {strings.panel.todaySettings}
        </button>
        <button type="button" className="bear-cp-link" disabled={busy} onClick={onAskBrief}>
          {strings.panel.askToday}
        </button>
      </span>
    </nav>
  );
}

function Block({
  id,
  title,
  caption,
  actions,
  children,
}: {
  id?: string;
  title: string;
  // `string | undefined` (not just optional): the 今天 block passes the day's
  // caption straight through, which is undefined while the day is loading.
  caption?: string | undefined;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bear-cp-block" id={id}>
      <header className="bear-cp-head">
        <h2>{title}</h2>
        {caption !== undefined && <span className="bear-cp-meta">{caption}</span>}
        {actions !== undefined && <span className="bear-cp-head-acts">{actions}</span>}
      </header>
      {children}
    </section>
  );
}

const BLOCK_IDS: Record<PanelTile["key"], string> = {
  cycle: "bear-cp-progress",
  today: "bear-cp-today",
  week: "bear-cp-week",
  shelf: "bear-cp-shelf",
  anki: "bear-cp-today",
  cards: "bear-cp-cards",
};

export function ControlPanel(props: ControlPanelProps) {
  const weekRef = useRef<HTMLDivElement | null>(null);
  const weekFocus = props.weekFocus ?? 0;
  useEffect(() => {
    if (weekFocus === 0) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    weekRef.current?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  }, [weekFocus]);
  // Anki lives in the session, not in a block of this page, so it opens the
  // Anki session instead of scrolling.
  const jump = (key: PanelTile["key"]): void => {
    if (key === "anki") {
      props.onOpenAnki();
      return;
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(BLOCK_IDS[key])
      ?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  };
  return (
    <div className="bear-cp">
      <StatusStrip
        tiles={props.tiles}
        onJump={jump}
        onOpenSkills={props.onOpenSkills}
        onAskBrief={props.onAskBrief}
        busy={props.busy}
      />
      <Block
        id="bear-cp-today"
        title={strings.panel.blockToday}
        caption={
          props.day === null
            ? undefined
            : strings.planbook.dayCaption(props.day.date, props.day.weekday, props.day.type)
        }
        actions={
          <>
            {!props.shownToday && (
              <button type="button" className="bear-cp-link" onClick={props.onBackToToday}>
                {strings.panel.backToToday}
              </button>
            )}
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
            todayCard={
              props.todayCard === null ? null : (
                <>
                  {props.todayCard}
                  <StudiedRow entries={props.studied} />
                </>
              )
            }
            tomorrow={props.tomorrow}
            onOpenDay={props.onOpenDay}
            onOpenAnki={props.onOpenAnki}
          />
        )}
      </Block>
      <div ref={weekRef}>
        <Block
          id="bear-cp-week"
          title={props.view === "month" ? strings.panel.blockMonth : strings.panel.blockWeek}
        >
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
      </div>
      <TermsBlock terms={props.terms} onOpenTerm={props.onOpenTerm} />
      {props.domains !== undefined && props.onOpenDomain && (
        <DomainStrip domains={props.domains} onOpen={props.onOpenDomain} />
      )}
      <div className="bear-cp-row3">
        <Block
          id="bear-cp-progress"
          title={strings.panel.blockProgress}
          caption={strings.panel.blockProgressCaption}
        >
          <Progress overview={props.overview} />
        </Block>
        <Block
          id="bear-cp-shelf"
          title={strings.panel.blockShelf}
          actions={
            <>
              <AddBook onAsk={props.onAsk} />
              <button type="button" className="bear-cp-link" onClick={props.onOpenShelf}>
                {strings.panel.shelfOpen}
              </button>
            </>
          }
        >
          <ShelfList rows={props.shelf} onAsk={props.onAsk} />
          <Unplanned items={props.unplanned} />
        </Block>
        <Block
          id="bear-cp-cards"
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
