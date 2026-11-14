// Bear 总控 「书房」 block pieces: the reading list, 已登记没排, 加一本书 and 设目标日期.

import { useState } from "react";
import type { ControlPanelProps } from "../contract.js";
import type { ShelfRow, UnplannedMaterial } from "../../core/board/panel.js";
import { strings } from "../../core/strings.js";
import {
  addBookPrompt,
  changeModePrompt,
  pausePrompt,
  resumePrompt,
  setTargetPrompt,
} from "../../core/board/control-prompts.js";

export function ShelfList({ rows, onAsk }: { rows: ShelfRow[] | null; onAsk: ControlPanelProps["onAsk"] }) {
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

export function Unplanned({ items }: { items: UnplannedMaterial[] | null }) {
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

/** 加一本书: title + 自读 / 带读 + optional target, handed to 总控 (which confirms before writing). */
export function AddBook({ onAsk }: { onAsk: ControlPanelProps["onAsk"] }) {
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
