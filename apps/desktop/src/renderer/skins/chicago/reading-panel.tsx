/**
 * Chicago 阅读 window body.
 *
 * The add form offers vault-source candidates as the user types, hands an
 * http(s) URL to the agent to clip (the design's priority radio sits under the
 * field), and carries a 「今天就读」 box (checked by default) so a new item can be
 * scheduled for today. Below it, the whole queue (excluding done), sorted by due
 * date, with each row tagged 今天 / 逾期 N 天 / 11月5日 and 下次接着读 / 推迟 / 读完.
 *
 * 「下次接着读」 first asks where the reader got to (page or section, may be left
 * empty) and writes it as the item's `position`; without this the panel would
 * keep showing 未开始 forever.
 */

import { useEffect, useRef, useState } from "react";
import type { ReadingPanelProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { dueLabel, isDueNow } from "../../core/board/reading-due.js";
import { Caption, CheckBox, Field, InRow, RadioGroup, Tag } from "./widgets.js";
import { Failed, Loading, Note, priorityLabel, todayIso } from "./panel-shared.js";

export function ReadingPanel({ shelf, queue, sources, onAdd, onClip, onReview, onShelfCards, focus, onFocusHandled }: ReadingPanelProps) {
  const [value, setValue] = useState("");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const [dueToday, setDueToday] = useState(true);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  // The slug whose position is being recorded, with the draft the user is typing.
  const [recording, setRecording] = useState<{ slug: string; position: string } | null>(null);
  const addRef = useRef<HTMLInputElement | null>(null);

  // `/加入阅读` opens this window with `focus: "reading-add"`: put the cursor in
  // the add field, then tell core the request was handled.
  useEffect(() => {
    if (focus !== "reading-add") return;
    addRef.current?.focus();
    onFocusHandled?.();
  }, [focus, onFocusHandled]);

  const isUrl = /^https?:\/\//i.test(value.trim());
  const candidates =
    !isUrl && value.trim() && sources.status === "ready"
      ? sources.value
          .filter((source) => source.path.toLowerCase().includes(value.trim().toLowerCase()))
          .slice(0, 6)
      : [];

  const submit = (source?: string): void => {
    const text = (source ?? value).trim();
    if (!text) return;
    const due = dueToday ? "today" : "scheduled";
    if (/^https?:\/\//i.test(text)) {
      onClip(text, priority, due);
      setConfirmation(strings.reading.clipped);
    } else {
      setConfirmation(null);
      void onAdd(text, priority, due).then((added) => {
        if (added) setConfirmation(strings.reading.added(added.title, dueLabel(added.due, todayIso())));
      });
    }
    setValue("");
  };

  const today = todayIso();
  const queueItems = queue.status === "ready" ? queue.value : [];
  const dueTodayCount = queueItems.filter((item) => isDueNow(item.due, today)).length;

  return (
    <div className="chicago-pane-inner">
      {shelf.status === "loading" && <Loading />}
      {shelf.status === "error" && <Failed message={shelf.message} />}
      {shelf.status === "ready" && (
        <div>
          {[shelf.value.planned, shelf.value.free].map(
            (book) =>
              book !== null && (
                <div className="chicago-it" key={book.slug}>
                  <div className="chicago-it-meta">
                    <span>{book.title}</span>
                  </div>
                  <div className="chicago-small">
                    {strings.reading.shelfMeta(book.position, book.total, book.end)}
                  </div>
                  {book.next !== null && <div className="chicago-small">{book.next}</div>}
                  {book.extracts.length > 0 && (
                    <ul>
                      {book.extracts.map((extract, index) => (
                        <li key={index} className="chicago-small">
                          p.{extract.page} {extract.text} ·{" "}
                          {extract.carded === null
                            ? strings.reading.shelfPending
                            : strings.reading.shelfCarded(extract.carded)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {book.pending > 0 && (
                    <div className="chicago-row-btns">
                      <button type="button" className="chicago-btn" onClick={() => onShelfCards(book.slug)}>
                        {strings.reading.shelfCards(book.pending)}
                      </button>
                    </div>
                  )}
                </div>
              ),
          )}
          {shelf.value.queue.map((book) => (
            <div className="chicago-it" key={book.slug}>
              <div className="chicago-it-meta">
                <span>{book.title}</span>
              </div>
              <div className="chicago-small">
                {strings.reading.shelfQueued(book.total, book.after, book.end)}
              </div>
            </div>
          ))}
        </div>
      )}
      <Note>{strings.reading.scopeHint}</Note>
      <div className="chicago-inbox">
        <Caption title={strings.reading.addCaption} hint={strings.reading.addHint} />
        <InRow>
          <Field
            value={value}
            onChange={(next) => {
              setValue(next);
              setConfirmation(null);
            }}
            placeholder={strings.reading.addPlaceholder}
            ariaLabel={strings.reading.addPlaceholder}
            inputRef={addRef}
            grow
          />
          <span className="chicago-def">
            <button type="button" className="chicago-btn" onClick={() => submit()}>
              {strings.reading.add}
            </button>
          </span>
        </InRow>
        {candidates.length > 0 && (
          <ul className="chicago-candidates">
            {candidates.map((source) => (
              <li key={source.path}>
                <button type="button" className="chicago-candidate" onClick={() => submit(source.path)}>
                  {source.path}
                </button>
              </li>
            ))}
          </ul>
        )}
        <RadioGroup<"high" | "medium" | "low">
          name="reading-priority"
          value={priority}
          label={`${strings.reading.priorityLabel}：`}
          options={[
            { id: "high", label: strings.reading.priorityHigh },
            { id: "medium", label: strings.reading.priorityMedium },
            { id: "low", label: strings.reading.priorityLow },
          ]}
          onChange={setPriority}
        />
        <label className="chicago-read-today">
          <CheckBox checked={dueToday} onChange={setDueToday} ariaLabel={strings.reading.readTodayToday} />
          {strings.reading.readToday}
        </label>
        {confirmation && <Note>{confirmation}</Note>}
      </div>
      <Caption
        title={strings.reading.queueCaption(
          dueTodayCount,
          queue.status === "ready" ? queue.value.length : 0,
        )}
      />
      {queue.status === "loading" && <Loading />}
      {queue.status === "error" && <Failed message={queue.message} />}
      {queue.status === "ready" &&
        (queue.value.length === 0 ? (
          <Note>{strings.reading.empty}</Note>
        ) : (
          <div className="chicago-list">
            {queue.value.map((item) => (
              <div className="chicago-it" key={item.slug}>
                <div className="chicago-it-meta">
                  <span>{item.title}</span>
                  <Tag solid={isDueNow(item.due, today)}>{dueLabel(item.due, today)}</Tag>
                </div>
                <div className="chicago-small">
                  {strings.reading.priorityLabel} {priorityLabel(item.priority)}
                  {"　"}
                  {item.position || strings.reading.notStarted}
                </div>
                {recording?.slug === item.slug ? (
                  <div className="chicago-read-position">
                    <Field
                      value={recording.position}
                      onChange={(next) => setRecording({ slug: item.slug, position: next })}
                      placeholder={strings.reading.positionPlaceholder}
                      ariaLabel={strings.reading.positionLabel}
                      grow
                    />
                    <button
                      type="button"
                      className="chicago-btn"
                      onClick={() => {
                        onReview(item.slug, "next", recording.position.trim());
                        setRecording(null);
                      }}
                    >
                      {strings.reading.positionSave}
                    </button>
                    <button type="button" className="chicago-btn" onClick={() => setRecording(null)}>
                      {strings.dayEditor.cancel}
                    </button>
                  </div>
                ) : (
                  <div className="chicago-row-btns">
                    <button
                      type="button"
                      className="chicago-btn"
                      onClick={() => setRecording({ slug: item.slug, position: item.position })}
                    >
                      {strings.reading.next}
                    </button>
                    <button type="button" className="chicago-btn" onClick={() => onReview(item.slug, "postpone")}>
                      {strings.reading.postpone}
                    </button>
                    <span className="chicago-def">
                      <button type="button" className="chicago-btn" onClick={() => onReview(item.slug, "done")}>
                        {strings.reading.done}
                      </button>
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      <Note>{strings.reading.footnote}</Note>
    </div>
  );
}
