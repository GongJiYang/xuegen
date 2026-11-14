/**
 * Bear 总控 right column (design `docs/desktop/mockups/control-activity.html`):
 * one card per turn — the ask, then 「改了 N 处」 with the moves or the answer's
 * first sentence — and the wide reader that slides in from the right for a
 * full answer or a 术语 page. The message list itself is not drawn here.
 */

import { useEffect, useRef, type ReactNode } from "react";
import type { ChatMessage } from "@shared/protocol.js";
import type { ControlFeedView } from "../contract.js";
import { CARD_CHANGES, type ActivityCard } from "../../core/board/activity-feed.js";
import { strings } from "../../core/strings.js";
import { Reader } from "./reader.js";

function Card({ card, last, feed }: { card: ActivityCard; last: boolean; feed: ControlFeedView }) {
  const text = strings.feed;
  const changes = card.changes ?? [];
  return (
    <article className={`bear-feed-card${last ? "" : " is-old"}${card.busy ? " is-busy" : ""}`}>
      {card.ask !== "" && <p className="bear-feed-ask">{card.ask}</p>}
      {card.busy ? (
        <>
          <p className="bear-feed-busy">
            <span className="bear-feed-dot" aria-hidden="true" />
            {text.busy(card.steps)}
          </p>
          {card.doing !== null && <p className="bear-feed-doing">{card.doing}</p>}
        </>
      ) : changes.length > 0 ? (
        <>
          <p className="bear-feed-res">
            <b>{text.changed(changes.length)}</b>
            {text.changedSuffix}
            {card.undo?.status === "undone" && (
              <span className="bear-feed-undone">{strings.planChanges.undone}</span>
            )}
          </p>
          <ul className="bear-feed-changes">
            {changes.slice(0, CARD_CHANGES).map((line) => (
              <li key={line}>{line}</li>
            ))}
            {changes.length > CARD_CHANGES && (
              <li className="is-more">{text.more(changes.length - CARD_CHANGES)}</li>
            )}
          </ul>
        </>
      ) : (
        <p className={`bear-feed-res${card.failed ? " is-failed" : ""}`}>
          {card.failed ? text.failed : card.summary}
        </p>
      )}
      {!card.busy && (
        <p className="bear-feed-acts">
          {changes.length > 0 && (
            <button type="button" className="bear-cp-link" onClick={() => feed.onShowInWeek(card.id)}>
              {text.showInWeek}
            </button>
          )}
          {card.messages.length > 1 && (
            <button type="button" className="bear-cp-link" onClick={() => feed.onShowAnswer(card.id)}>
              {text.showAnswer}
            </button>
          )}
          {card.undo !== null && card.undo.status !== "undone" && (
            <button
              type="button"
              className="bear-cp-link"
              disabled={card.undo.status === "undoing"}
              onClick={() => feed.onUndo(card.id)}
            >
              {card.undo.status === "undoing" ? strings.planChanges.undoing : strings.planChanges.undo}
            </button>
          )}
        </p>
      )}
      {card.undo?.error != null && (
        <p className="bear-feed-res is-failed" role="alert">
          {strings.planChanges.undoFailed(card.undo.error)}
        </p>
      )}
    </article>
  );
}

export function ControlFeed({
  feed,
  older,
  renderMessage,
}: {
  feed: ControlFeedView;
  older: { label: string; onToggle(): void } | null;
  renderMessage(message: ChatMessage, thinking: boolean): ReactNode;
}) {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const last = feed.cards[feed.cards.length - 1];
  // A new card, and the running card's progress, keep the newest card in view.
  const follow = `${feed.cards.length}|${last?.busy ? `${last.steps}` : "idle"}`;
  useEffect(() => {
    const pane = paneRef.current;
    if (pane !== null) pane.scrollTop = pane.scrollHeight;
  }, [follow]);
  return (
    <div className="bear-thread-wrap">
      <div className="bear-pane bear-body bear-feed" role="log" ref={paneRef}>
        <header className="bear-feed-head">
          <b>{strings.feed.title}</b>
          <span>{feed.caption}</span>
        </header>
        {older && (
          <button type="button" className="bear-cc-older" onClick={older.onToggle}>
            {older.label}
          </button>
        )}
        {feed.cards.length === 0 ? (
          <p className="bear-empty">{strings.feed.empty}</p>
        ) : (
          feed.cards.map((card, index) => (
            <Card key={card.id} card={card} last={index === feed.cards.length - 1} feed={feed} />
          ))
        )}
        <Reader feed={feed} renderMessage={renderMessage} />
      </div>
    </div>
  );
}
