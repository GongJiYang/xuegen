/**
 * Chicago 卡片 window body.
 *
 * The new-card form (front / back / deck + 存为新卡), the total and unsynced
 * counts, per-deck sync bars, the Anki state line with 重试, and 让学根起草 for
 * pending extracts. Ported from the design's `cards` view; the Anki line always
 * states whether Anki is reachable instead of failing silently.
 */

import { useState } from "react";
import type { CardsPanelProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { Area, BarRow, Caption, Count, Field, InRow } from "./widgets.js";
import { Failed, Loading } from "./panel-shared.js";

export function CardsPanel({ cards, anki, onAdd, onRetryAnki, onDraft }: CardsPanelProps) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [deck, setDeck] = useState("");
  const decks = cards.status === "ready" ? cards.value.decks : [];
  const running = anki.status === "ready" && anki.value.running;

  const submit = (): void => {
    if (!front.trim() || !back.trim()) return;
    onAdd(deck || decks[0]?.deck || "Inbox", front.trim(), back.trim());
    setFront("");
    setBack("");
  };

  return (
    <div className="chicago-pane-inner">
      <div className="chicago-inbox">
        <Caption title={strings.cards.newCaption} hint={strings.cards.newHint} />
        <Field
          value={front}
          onChange={setFront}
          placeholder={strings.cards.frontPlaceholder}
          ariaLabel={strings.cards.frontPlaceholder}
          block
        />
        <Area
          value={back}
          onChange={setBack}
          placeholder={strings.cards.backPlaceholder}
          ariaLabel={strings.cards.backPlaceholder}
          rows={2}
        />
        <InRow spread>
          <select
            className="chicago-field chicago-select"
            aria-label={strings.cards.deckLabel}
            value={deck}
            onChange={(event) => setDeck(event.target.value)}
          >
            {decks.map((entry) => (
              <option key={entry.deck} value={entry.deck}>
                {entry.deck}
              </option>
            ))}
          </select>
          <span className="chicago-def">
            <button type="button" className="chicago-btn" onClick={submit}>
              {strings.cards.add}
            </button>
          </span>
        </InRow>
      </div>
      {cards.status === "loading" && <Loading />}
      {cards.status === "error" && <Failed message={cards.message} />}
      {cards.status === "ready" && (
        <>
          <Count label={strings.cards.total} value={cards.value.total} />
          <Count label={strings.cards.unsynced} value={cards.value.unsynced} />
          <div className="chicago-rule" />
          {cards.value.decks.map((entry) => (
            <BarRow
              key={entry.deck}
              name={entry.deck}
              percent={entry.total ? ((entry.total - entry.unsynced) / entry.total) * 100 : 0}
            />
          ))}
        </>
      )}
      <div className="chicago-rule" />
      <InRow spread>
        <span className="chicago-small">
          {running ? strings.cards.ankiRunning : strings.cards.ankiNotRunning}
        </span>
        <button type="button" className="chicago-btn" onClick={onRetryAnki}>
          {strings.cards.retry}
        </button>
      </InRow>
      {running && anki.status === "ready" && (
        <Count label={strings.cards.reviewedToday} value={anki.value.reviewedToday ?? 0} />
      )}
      <InRow spread>
        <span className="chicago-small">
          {cards.status === "ready" ? cards.value.pendingExtracts : 0} {strings.cards.pendingExtracts}
        </span>
        <button type="button" className="chicago-btn" onClick={onDraft}>
          {strings.cards.draft}
        </button>
      </InRow>
    </div>
  );
}
