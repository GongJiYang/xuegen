/**
 * Bare skin panels (part 2): the cards, calendar, and skills tool windows, the
 * day editor, and the `/` command menu — all as plain semantic HTML.
 *
 * See `panels.tsx` for part 1 (the dock, 今天, progress, reading). The reference
 * skin: no styles, no motion.
 */

import { useState, type KeyboardEvent } from "react";
import type {
  BoardPanelProps,
  CalendarPanelProps,
  CardsPanelProps,
  DayEditorProps,
  NotesPanelProps,
  SkillsPanelProps,
  SlashMenuProps,
} from "../contract.js";
import { strings } from "../../core/strings.js";
import { dayMarks } from "../../core/board/use-calendar.js";

export function CardsPanel({ cards, anki, onAdd, onRetryAnki, onDraft }: CardsPanelProps) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [deck, setDeck] = useState("");
  const decks = cards.status === "ready" ? cards.value.decks : [];

  function submit(): void {
    if (!front.trim() || !back.trim()) return;
    onAdd(deck || decks[0]?.deck || "Inbox", front.trim(), back.trim());
    setFront("");
    setBack("");
  }

  return (
    <section data-slot="cards" aria-label={strings.tools.cards}>
      <div data-slot="cards-add">
        <h3>{strings.cards.newCaption}</h3>
        <input
          aria-label={strings.cards.frontPlaceholder}
          placeholder={strings.cards.frontPlaceholder}
          value={front}
          onChange={(event) => setFront(event.target.value)}
        />
        <textarea
          aria-label={strings.cards.backPlaceholder}
          placeholder={strings.cards.backPlaceholder}
          value={back}
          onChange={(event) => setBack(event.target.value)}
        />
        <select
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
        <button type="button" onClick={submit}>
          {strings.cards.add}
        </button>
      </div>
      {cards.status === "loading" && <p>{strings.today.loading}</p>}
      {cards.status === "error" && <p role="alert">{cards.message}</p>}
      {cards.status === "ready" && (
        <>
          <p>
            {strings.cards.total} {cards.value.total} · {strings.cards.unsynced} {cards.value.unsynced}
          </p>
          <ul>
            {cards.value.decks.map((entry) => (
              <li key={entry.deck}>
                {entry.deck}: {entry.total - entry.unsynced}/{entry.total}
              </li>
            ))}
          </ul>
        </>
      )}
      <p>
        {anki.status === "ready" && anki.value.running ? strings.cards.ankiRunning : strings.cards.ankiNotRunning}
      </p>
      <button type="button" onClick={onRetryAnki}>
        {strings.cards.retry}
      </button>
      <button type="button" onClick={onDraft}>
        {strings.cards.draft}
      </button>
    </section>
  );
}

export function CalendarPanel({
  month,
  monthKey,
  onPrevMonth,
  onNextMonth,
  cells,
  selected,
  onSelectDay,
  onEditDay,
  courseTitles,
}: CalendarPanelProps) {
  if (month.status === "loading") return <p>{strings.today.loading}</p>;
  if (month.status === "error") return <p role="alert">{month.message}</p>;
  const days = month.value.days;
  const selectedDay = days[selected];
  return (
    <section data-slot="calendar" aria-label={strings.calendar.title}>
      <div data-slot="calendar-head">
        <button type="button" onClick={onPrevMonth} aria-label={strings.calendar.prevMonth}>
          ◀
        </button>
        <span>{monthKey}</span>
        <button type="button" onClick={onNextMonth} aria-label={strings.calendar.nextMonth}>
          ▶
        </button>
      </div>
      <ul data-slot="calendar-grid">
        {cells.map((cell) => {
          const day = days[cell.date];
          return (
            <li key={cell.date} data-date={cell.date} data-out={cell.out || undefined}>
              <button
                type="button"
                aria-current={cell.date === selected ? "date" : undefined}
                onClick={() => onSelectDay(cell.date)}
                onDoubleClick={() => onEditDay(cell.date)}
              >
                {cell.day}
                {day ? ` ${dayMarks(day)}` : ""}
              </button>
            </li>
          );
        })}
      </ul>
      <div data-slot="calendar-detail">
        <h4>{selected}</h4>
        {selectedDay ? (
          <ul>
            {selectedDay.records.map((record, index) => (
              <li key={`r${index}`}>
                {strings.calendar.kindRecord} · {courseTitles[record.course] ?? record.course}（{record.heading}）
              </li>
            ))}
            {selectedDay.plans.map((plan, index) => (
              <li key={`p${index}`}>
                {strings.calendar.kindPlan} · {courseTitles[plan.course] ?? plan.course}：{plan.label}
              </li>
            ))}
            {selectedDay.readingDue.map((reading, index) => (
              <li key={`d${index}`}>
                {strings.calendar.kindReading} · {reading.title}
              </li>
            ))}
            {selectedDay.log.map((log, index) => (
              <li key={`l${index}`}>
                {strings.calendar.kindLog} · {log}
              </li>
            ))}
          </ul>
        ) : (
          <p>{strings.calendar.dayEmpty}</p>
        )}
      </div>
      <button type="button" onClick={() => onEditDay(selected)}>
        {strings.calendar.writeNote}
      </button>
    </section>
  );
}

export function SkillsPanel({
  skills,
  onToggle,
  onFetch,
  fetchNotice,
  review,
  onReview,
  onCloseReview,
  onEnableReviewed,
  onDiscardReviewed,
}: SkillsPanelProps) {
  const [url, setUrl] = useState("");
  return (
    <section data-slot="skills" aria-label={strings.tools.skills}>
      <div data-slot="skills-install">
        <h3>{strings.skills.installCaption}</h3>
        <input
          aria-label={strings.skills.installCaption}
          placeholder={strings.skills.installPlaceholder}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            if (url.trim()) onFetch(url.trim());
            setUrl("");
          }}
        >
          {strings.skills.fetch}
        </button>
        {fetchNotice && <p role="status">{fetchNotice}</p>}
      </div>
      {skills.status === "loading" && <p>{strings.today.loading}</p>}
      {skills.status === "error" && <p role="alert">{skills.message}</p>}
      {skills.status === "ready" && (
        <ul>
          {skills.value.map((skill) => (
            <li key={skill.name}>
              {skill.source === "pending" ? (
                <button type="button" onClick={() => onReview(skill.name)}>
                  {strings.skills.review} {skill.name}
                </button>
              ) : (
                <label>
                  <input
                    type="checkbox"
                    checked={skill.enabled}
                    onChange={(event) => onToggle(skill.name, event.target.checked)}
                  />
                  {skill.name}
                </label>
              )}
              <p>
                /skill:{skill.name} · {skill.description}
              </p>
            </li>
          ))}
        </ul>
      )}
      {review && (
        <div role="dialog" aria-label={strings.skills.review}>
          {review.status === "loading" && <p>{strings.today.loading}</p>}
          {review.status === "error" && <p role="alert">{review.message}</p>}
          {review.status === "ready" && (
            <>
              <h3>{strings.skills.reviewTitle(review.value.name)}</h3>
              <p>{strings.skills.reviewWarning}</p>
              <p>
                {strings.skills.reviewSource}: {review.value.url} @ {review.value.commit.slice(0, 12)}
              </p>
              <ul>
                {review.value.files.map((file) => (
                  <li key={file.path}>
                    {file.path}
                    {file.executable ? ` (${strings.skills.reviewExecutable})` : ""}
                  </li>
                ))}
              </ul>
              <pre>{review.value.skillMd}</pre>
              <button type="button" onClick={() => onDiscardReviewed(review.value.name)}>
                {strings.skills.reviewDiscard}
              </button>
              <button type="button" onClick={() => onEnableReviewed(review.value.name)}>
                {strings.skills.reviewEnable}
              </button>
            </>
          )}
          <button type="button" onClick={onCloseReview}>
            {strings.skills.reviewClose}
          </button>
        </div>
      )}
    </section>
  );
}

export function DayEditor({ title, initialText, savePath, onSave, onCancel }: DayEditorProps) {
  const [text, setText] = useState(initialText);
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Escape") onCancel();
  }
  return (
    <div role="dialog" aria-label={title} data-slot="day-editor">
      <h3>{title}</h3>
      <textarea
        aria-label={title}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <p>{strings.calendar.saveTo(savePath)}</p>
      <button type="button" onClick={onCancel}>
        {strings.dayEditor.cancel}
      </button>
      <button type="button" onClick={() => onSave(text)}>
        {strings.dayEditor.save}
      </button>
    </div>
  );
}

export function SlashMenu({ groups, commands, selected, onSelect, onRun }: SlashMenuProps) {
  if (commands.length === 0) {
    return <p data-slot="slash-menu">{strings.input.slashEmpty}</p>;
  }
  return (
    <ul data-slot="slash-menu" role="listbox" aria-label={strings.input.slashHint}>
      {groups.map((group) => (
        <li key={group.group}>
          <strong>{group.group}</strong>
          <ul>
            {group.commands.map((command) => {
              const index = commands.indexOf(command);
              return (
                <li key={command.command}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === selected}
                    onMouseEnter={() => onSelect(index)}
                    onClick={() => onRun(command)}
                  >
                    {command.command} — {command.description}
                  </button>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function BoardPanel(_props: BoardPanelProps) {
  return (
    <section data-slot="board" aria-label={strings.panels.boardTitle}>
      <h2>{strings.panels.boardTitle}</h2>
      <p>{strings.panels.boardEmpty}</p>
    </section>
  );
}

export function NotesPanel(_props: NotesPanelProps) {
  return (
    <section data-slot="notes" aria-label={strings.panels.notesTitle}>
      <h2>{strings.panels.notesTitle}</h2>
      <p>{strings.panels.notesEmpty}</p>
    </section>
  );
}
