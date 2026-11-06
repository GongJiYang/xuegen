/**
 * Bear 卡片 panel.
 *
 * Anki's connection on one line (with today's reviews, or 重试 when Anki is
 * closed), the total and unsynced counts as two large numbers, a highlighted
 * line when extracts wait to become cards (让学根起草), then the decks: name,
 * total, a 2px synced-ratio meter, and unsynced / due-today counts. 「＋ 新卡片」
 * folds the new-card form above the deck list.
 */

import { useState } from "react";
import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number";
import type { CardsPanelProps } from "../contract.js";
import { strings } from "../../core/strings.js";

function NewCardForm({
  decks,
  onAdd,
  onDone,
}: {
  decks: string[];
  onAdd: CardsPanelProps["onAdd"];
  onDone(saved: string | null): void;
}) {
  const [deck, setDeck] = useState(decks[0] ?? "");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const ready = deck.trim() !== "" && front.trim() !== "" && back.trim() !== "";

  function save(): void {
    if (!ready) return;
    onAdd(deck.trim(), front.trim(), back.trim());
    onDone(deck.trim());
  }

  return (
    <div className="bear-newcard">
      <label className="bear-card-field">
        <span className="bear-card-label">{strings.cards.deckLabel}</span>
        {decks.length > 0 ? (
          <select
            className="bear-card-input"
            aria-label={strings.cards.deckLabel}
            value={deck}
            onChange={(event) => setDeck(event.target.value)}
          >
            {decks.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="bear-card-input"
            aria-label={strings.cards.deckLabel}
            value={deck}
            onChange={(event) => setDeck(event.target.value)}
          />
        )}
      </label>
      <label className="bear-card-field">
        <span className="bear-card-label">{strings.cards.frontLabel}</span>
        <input
          className="bear-card-input"
          aria-label={strings.cards.frontLabel}
          placeholder={strings.cards.frontPlaceholder}
          value={front}
          onChange={(event) => setFront(event.target.value)}
        />
      </label>
      <label className="bear-card-field is-top">
        <span className="bear-card-label">{strings.cards.backLabel}</span>
        <textarea
          className="bear-card-input"
          rows={3}
          aria-label={strings.cards.backLabel}
          placeholder={strings.cards.backPlaceholder}
          value={back}
          onChange={(event) => setBack(event.target.value)}
        />
      </label>
      <div className="bear-actions">
        <button type="button" className="bear-link" onClick={() => onDone(null)}>
          {strings.cards.cancel}
        </button>
        <button type="button" className="bear-link bear-link-accent" disabled={!ready} onClick={save}>
          {strings.cards.add}
        </button>
      </div>
    </div>
  );
}

export function CardsPanel({ cards, anki, onAdd, onRetryAnki, onDraft }: CardsPanelProps) {
  const [creating, setCreating] = useState(false);
  const [savedDeck, setSavedDeck] = useState<string | null>(null);
  const stats = cards.status === "ready" ? cards.value : null;
  const ankiStatus = anki.status === "ready" ? anki.value : null;
  const running = ankiStatus?.running === true;
  const decks = stats?.decks ?? [];
  const dueOf = (deck: string): number => ankiStatus?.due?.find((entry) => entry.deck === deck)?.count ?? 0;

  return (
    <section className="bear-cards" aria-label={strings.tools.cards}>
      <div className="bear-anki">
        <span className={running ? "bear-anki-dot is-on" : "bear-anki-dot"} aria-hidden="true" />
        {running ? (
          <>
            <span>{strings.cards.ankiRunning}</span>
            <span className="bear-anki-today">{strings.cards.reviewedTodayCount(ankiStatus?.reviewedToday ?? 0)}</span>
          </>
        ) : (
          <>
            <span>{strings.cards.ankiNotRunning}</span>
            <button type="button" className="bear-link" onClick={onRetryAnki}>
              {strings.cards.retry}
            </button>
          </>
        )}
      </div>

      {cards.status === "loading" && <p className="bear-muted">{strings.today.loading}</p>}
      {cards.status === "error" && <p role="alert">{cards.message}</p>}
      {stats && (
        <>
          <dl className="bear-card-counts">
            <div>
              <dt>{strings.cards.total}</dt>
              <dd>
                <SlidingNumber number={stats.total} initiallyStable />
              </dd>
            </div>
            <div>
              <dt>{strings.cards.unsynced}</dt>
              <dd>
                <SlidingNumber number={stats.unsynced} initiallyStable />
              </dd>
            </div>
          </dl>
          <p className="bear-muted bear-card-note">{strings.cards.syncNote}</p>

          {stats.pendingExtracts > 0 && (
            <div className="bear-extracts">
              <span>{strings.cards.extractsCount(stats.pendingExtracts)}</span>
              <button type="button" className="bear-link bear-link-accent" onClick={onDraft}>
                {strings.cards.draft}
              </button>
            </div>
          )}

          <h3 className="bear-section">
            <span>{strings.cards.decksCaption}</span>
            <button
              type="button"
              className="bear-link"
              aria-expanded={creating}
              onClick={() => {
                setSavedDeck(null);
                setCreating((value) => !value);
              }}
            >
              {strings.cards.newCard}
            </button>
          </h3>
          {creating && (
            <NewCardForm
              decks={decks.map((entry) => entry.deck)}
              onAdd={onAdd}
              onDone={(saved) => {
                setSavedDeck(saved);
                setCreating(false);
              }}
            />
          )}
          {savedDeck && <p className="bear-muted bear-card-note">{strings.cards.saved(savedDeck)}</p>}

          {decks.length === 0 ? (
            <p className="bear-muted">{strings.cards.empty}</p>
          ) : (
            <ul className="bear-decks">
              {decks.map((entry) => {
                const synced = entry.total > 0 ? Math.round(((entry.total - entry.unsynced) / entry.total) * 100) : 0;
                const due = running ? dueOf(entry.deck) : 0;
                return (
                  <li key={entry.deck} className="bear-deck">
                    <div className="bear-deck-head">
                      <span className="bear-deck-name" title={entry.deck}>
                        {entry.deck}
                      </span>
                      <span className="bear-deck-num">{entry.total}</span>
                    </div>
                    <div className="bear-meter" aria-hidden="true">
                      <div className="bear-meter-fill" style={{ width: `${synced}%` }} />
                    </div>
                    <div className="bear-deck-meta">
                      <span>
                        {entry.unsynced > 0 ? strings.cards.unsyncedCount(entry.unsynced) : strings.cards.allSynced}
                      </span>
                      {due > 0 && <span className="bear-deck-due">{strings.cards.dueTodayCount(due)}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
