/**
 * Bear 阅读 panel.
 *
 * The 书房 section (design `?d=shelf2`) sits on top: 计划内 / 排队 / 计划外
 * books with progress, the next blocks, and pending extracts. Under it, the
 * 文章与摘录 half: one underlined field adds a vault path (with candidates) or
 * hands a URL to 学根 to clip; the queue splits into 今天该读 (due or overdue:
 * 推迟 / 接着读 / 读完) and 之后 (read-only). 接着读 asks where you stopped and
 * records it on Enter.
 */

import { useEffect, useRef, useState } from "react";
import { RadioGroup } from "radix-ui";
import type { ReadingPriority } from "@shared/data-protocol.js";
import type { ReadingPanelProps } from "../contract.js";
import type { ShelfBookView } from "../../core/board/shelf-view.js";
import { dueLabel, isDueNow } from "../../core/board/reading-due.js";
import { todayKey } from "../../core/today.js";
import { ReadingRow } from "./reading-row.js";
import { strings } from "../../core/strings.js";

const PRIORITIES: { id: ReadingPriority; label: string }[] = [
  { id: "high", label: strings.reading.priorityHigh },
  { id: "medium", label: strings.reading.priorityMedium },
  { id: "low", label: strings.reading.priorityLow },
];

function isUrl(text: string): boolean {
  return /^https?:\/\//i.test(text.trim());
}

/** One book of the 书房 section: progress, next blocks, core pages, extracts. */
function BookBlock({ book, onShelfCards }: { book: ShelfBookView; onShelfCards: ReadingPanelProps["onShelfCards"] }) {
  return (
    <div className="bear-shelf-book">
      <p className="bear-shelf-title">{book.title}</p>
      <div className="bear-shelf-bar" role="progressbar" aria-valuenow={book.position} aria-valuemax={book.total}>
        <i style={{ width: `${book.progress * 100}%` }} />
      </div>
      <p className="bear-shelf-meta">{strings.reading.shelfMeta(book.position, book.total, book.end)}</p>
      {book.next !== null && <p className="bear-shelf-today">{book.next}</p>}
      {book.later.length > 0 && (
        <details className="bear-shelf-more">
          <summary>{strings.reading.shelfLater}</summary>
          {book.later.map((line) => (
            <p key={line} className="bear-shelf-meta">
              {line}
            </p>
          ))}
        </details>
      )}
      {book.coreRead.length > 0 && (
        <details className="bear-shelf-more">
          <summary>{strings.reading.shelfCore}</summary>
          {book.coreRead.map((row) => (
            <p key={`${row.date}-${row.pages}`} className="bear-shelf-meta">
              {strings.reading.shelfCoreLine(row.pages, row.label, row.date)}
            </p>
          ))}
          <p className="bear-shelf-meta">{strings.reading.shelfCoreNote}</p>
        </details>
      )}
      {book.extracts.length > 0 && (
        <>
          <details className="bear-shelf-more" open>
            <summary>{strings.reading.shelfExtracts(book.extracts.length, book.pending)}</summary>
            {book.extracts.map((extract, index) => (
              <p key={index} className="bear-shelf-ex">
                <b>p.{extract.page}</b> {extract.text}
                <span className={extract.carded === null ? "bear-shelf-pend" : undefined}>
                  {" "}
                  · {extract.carded === null ? strings.reading.shelfPending : strings.reading.shelfCarded(extract.carded)}
                </span>
              </p>
            ))}
          </details>
          <div className="bear-shelf-row">
            <span className="bear-shelf-meta">
              {book.pending > 0 ? strings.reading.shelfCardsHint : strings.reading.shelfCardsDone}
            </span>
            {book.pending > 0 && (
              <button
                type="button"
                className="bear-link bear-link-accent bear-shelf-cards"
                onClick={() => onShelfCards(book.slug)}
              >
                {strings.reading.shelfCards(book.pending)}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function ReadingPanel({ shelf, queue, sources, onAdd, onClip, onReview, onShelfCards, focus, onFocusHandled }: ReadingPanelProps) {
  const [value, setValue] = useState("");
  const [priority, setPriority] = useState<ReadingPriority>("medium");
  const [dueToday, setDueToday] = useState(true);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const today = todayKey();

  // `/加入阅读` opens this tab with `focus: "reading-add"`: put the cursor in
  // the add field, then tell core the request was handled.
  useEffect(() => {
    if (focus !== "reading-add") return;
    inputRef.current?.focus();
    onFocusHandled?.();
  }, [focus, onFocusHandled]);

  const text = value.trim();
  const url = isUrl(text);
  const candidates =
    !url && text && sources.status === "ready"
      ? sources.value.filter((source) => source.path.toLowerCase().includes(text.toLowerCase())).slice(0, 5)
      : [];

  function submit(source?: string): void {
    const chosen = (source ?? value).trim();
    if (!chosen) return;
    const due = dueToday ? "today" : "scheduled";
    if (isUrl(chosen)) {
      onClip(chosen, priority, due);
      setConfirmation(strings.reading.clipped);
    } else {
      setConfirmation(null);
      void onAdd(chosen, priority, due).then((added) => {
        if (added) setConfirmation(strings.reading.added(added.title, dueLabel(added.due, today)));
      });
    }
    setValue("");
  }

  const items = queue.status === "ready" ? queue.value : [];
  const now = items.filter((item) => isDueNow(item.due, today));
  const later = items.filter((item) => !isDueNow(item.due, today));

  return (
    <section className="bear-read" aria-label={strings.tools.reading}>
      {shelf.status === "loading" && <p className="bear-muted">{strings.today.loading}</p>}
      {shelf.status === "error" && <p role="alert">{shelf.message}</p>}
      {shelf.status === "ready" &&
        (shelf.value.planned !== null || shelf.value.free !== null || shelf.value.queue.length > 0) && (
          <>
            {shelf.value.planned !== null && (
              <>
                <h3 className="bear-section">
                  <span>{strings.reading.shelfPlanned}</span>
                </h3>
                <BookBlock book={shelf.value.planned} onShelfCards={onShelfCards} />
              </>
            )}
            {shelf.value.queue.length > 0 && (
              <>
                <h3 className="bear-section">
                  <span>{strings.reading.shelfQueue}</span>
                  <span className="bear-section-count">{shelf.value.queue.length}</span>
                </h3>
                {shelf.value.queue.map((book) => (
                  <div key={book.slug} className="bear-shelf-q">
                    <p className="bear-shelf-title">{book.title}</p>
                    <p className="bear-shelf-meta">
                      {strings.reading.shelfQueued(book.total, book.after, book.end)}
                    </p>
                  </div>
                ))}
              </>
            )}
            <h3 className="bear-section">
              <span>{strings.reading.shelfFree}</span>
            </h3>
            {shelf.value.free !== null ? (
              <BookBlock book={shelf.value.free} onShelfCards={onShelfCards} />
            ) : (
              <p className="bear-shelf-meta">{strings.reading.shelfFreeEmpty}</p>
            )}
          </>
        )}
      <h3 className="bear-section">
        <span>{strings.reading.shelfArticles}</span>
      </h3>
      <p className="bear-muted bear-read-scope">{strings.reading.scopeHint}</p>
      <div className="bear-read-add">
        <input
          ref={inputRef}
          className="bear-input bear-read-field"
          aria-label={strings.reading.addCaption}
          placeholder={strings.reading.addPlaceholder}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
        {candidates.length > 0 && (
          <ul className="bear-read-cands">
            {candidates.map((source) => (
              <li key={source.path}>
                <button type="button" onClick={() => submit(source.path)}>
                  {source.path}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="bear-read-row">
          <RadioGroup.Root
            className="bear-seg"
            value={priority}
            orientation="horizontal"
            aria-label={strings.reading.priorityLabel}
            onValueChange={(next) => setPriority(next as ReadingPriority)}
          >
            {PRIORITIES.map((entry) => (
              <RadioGroup.Item key={entry.id} value={entry.id} className="bear-seg-item">
                {entry.label}
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
          <button
            type="button"
            role="checkbox"
            aria-checked={dueToday}
            className={dueToday ? "bear-read-toggle is-on" : "bear-read-toggle"}
            onClick={() => setDueToday((current) => !current)}
          >
            <span className="bear-box" aria-hidden="true">
              {dueToday && (
                <svg viewBox="0 0 16 16" width="10" height="10">
                  <path
                    d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            {strings.reading.readToday}
          </button>
          <button
            type="button"
            className="bear-btn-primary bear-read-submit"
            disabled={!text}
            onClick={() => submit()}
          >
            {url ? strings.reading.clip : strings.reading.add}
          </button>
        </div>
        {confirmation && <p className="bear-muted bear-read-note">{confirmation}</p>}
      </div>

      {queue.status === "loading" && <p className="bear-muted">{strings.today.loading}</p>}
      {queue.status === "error" && <p role="alert">{queue.message}</p>}
      {queue.status === "ready" && (
        <>
          <h3 className="bear-section">
            <span>{strings.reading.todayCaption}</span>
            <span className="bear-section-count">{now.length}</span>
          </h3>
          {now.length === 0 ? (
            <p className="bear-muted">{strings.reading.nowEmpty}</p>
          ) : (
            <ul className="bear-read-list">
              {now.map((item) => (
                <ReadingRow key={item.slug} item={item} today={today} actionable onReview={onReview} />
              ))}
            </ul>
          )}
          <h3 className="bear-section">
            <span>{strings.reading.later}</span>
            <span className="bear-section-count">{later.length}</span>
          </h3>
          {later.length === 0 ? (
            <p className="bear-muted">{strings.reading.laterEmpty}</p>
          ) : (
            <ul className="bear-read-list">
              {later.map((item) => (
                <ReadingRow key={item.slug} item={item} today={today} actionable={false} onReview={onReview} />
              ))}
            </ul>
          )}
        </>
      )}
      <p className="bear-muted bear-read-foot">{strings.reading.footnote}</p>
    </section>
  );
}
