/**
 * Bear 阅读 panel.
 *
 * One underlined field adds a vault path (with candidates) or hands a URL to
 * 学根 to clip; priority and 今天就读 sit on the line below. The queue splits
 * into 今天该读 (due or overdue: 推迟 / 接着读 / 读完) and 之后 (read-only).
 * 接着读 asks where you stopped and records it on Enter.
 */

import { useEffect, useRef, useState } from "react";
import { RadioGroup } from "radix-ui";
import type { ReadingItem, ReadingPriority } from "@shared/data-protocol.js";
import type { ReadingPanelProps } from "../contract.js";
import { dueLabel, isDueNow } from "../../core/board/reading-due.js";
import { dateKey } from "../../core/board/use-calendar.js";
import { strings } from "../../core/strings.js";

const PRIORITIES: { id: ReadingPriority; label: string }[] = [
  { id: "high", label: strings.reading.priorityHigh },
  { id: "medium", label: strings.reading.priorityMedium },
  { id: "low", label: strings.reading.priorityLow },
];

function isUrl(text: string): boolean {
  return /^https?:\/\//i.test(text.trim());
}

function ReadingRow({
  item,
  today,
  actionable,
  onReview,
}: {
  item: ReadingItem;
  today: string;
  actionable: boolean;
  onReview: ReadingPanelProps["onReview"];
}) {
  const [recording, setRecording] = useState<string | null>(null);

  function record(): void {
    if (recording === null) return;
    onReview(item.slug, "next", recording.trim());
    setRecording(null);
  }

  return (
    <li className="bear-read-item">
      <div className="bear-read-head">
        <span className="bear-read-title">{item.title}</span>
        <span className={isDueNow(item.due, today) ? "bear-read-due is-now" : "bear-read-due"}>
          {dueLabel(item.due, today)}
        </span>
      </div>
      <div className="bear-read-meta">
        {item.priority === "high" && <span className="bear-read-high">{strings.reading.priorityMark}</span>}
        <span>{item.position ? strings.reading.positionAt(item.position) : strings.reading.notStarted}</span>
      </div>
      {actionable &&
        (recording !== null ? (
          <div className="bear-inline-form">
            <input
              className="bear-input"
              autoFocus
              aria-label={strings.reading.positionLabel}
              placeholder={strings.reading.positionPlaceholder}
              value={recording}
              onChange={(event) => setRecording(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") record();
                if (event.key === "Escape") setRecording(null);
              }}
            />
            <button type="button" className="bear-link bear-link-accent" onClick={record}>
              {strings.reading.positionSave}
            </button>
          </div>
        ) : (
          <div className="bear-actions">
            <button type="button" className="bear-link" onClick={() => onReview(item.slug, "postpone")}>
              {strings.reading.postpone}
            </button>
            <button type="button" className="bear-link" onClick={() => setRecording(item.position)}>
              {strings.reading.readOn}
            </button>
            <button type="button" className="bear-link bear-link-accent" onClick={() => onReview(item.slug, "done")}>
              {strings.reading.done}
            </button>
          </div>
        ))}
    </li>
  );
}

export function ReadingPanel({ queue, sources, onAdd, onClip, onReview, focus, onFocusHandled }: ReadingPanelProps) {
  const [value, setValue] = useState("");
  const [priority, setPriority] = useState<ReadingPriority>("medium");
  const [dueToday, setDueToday] = useState(true);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const today = dateKey(new Date());

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
