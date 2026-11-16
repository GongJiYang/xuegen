/**
 * Bear 总控底部的「领域」一行 (control-v3 ①): every subject as a chip
 * 「编程范式 12 页 · 41 个词」 that opens its 领域 page. Subjects past the first
 * four fold behind 「另外 N 个 ▾」 so the row stays one line on real screens.
 */

import { useState } from "react";
import { strings } from "../../core/strings.js";
import { compareText } from "../../../shared/text-order.js";

export interface DomainStripSubject {
  id: string;
  title: string;
  pages: number;
  terms: number;
}

/** How many chips show before the rest fold away. */
const SHOWN = 4;

/**
 * By pages, then title. Subjects with no pages go last whatever their title:
 * a subject with an empty glossary cannot answer anything yet.
 */
function byPages(a: DomainStripSubject, b: DomainStripSubject): number {
  if ((a.pages === 0) !== (b.pages === 0)) return a.pages === 0 ? 1 : -1;
  if (a.pages !== b.pages) return b.pages - a.pages;
  return compareText(a.title, b.title);
}

export function DomainStrip({
  domains,
  onOpen,
}: {
  domains: DomainStripSubject[] | null;
  onOpen(id: string, title: string): void;
}) {
  const [open, setOpen] = useState(false);
  // The panel hides the row until the subject list arrives, and when there is none.
  if (domains === null || domains.length === 0) return null;
  const d = strings.domain;
  const ordered = [...domains].sort(byPages);
  const shown = ordered.slice(0, SHOWN);
  const rest = ordered.slice(SHOWN);
  const chip = (subject: DomainStripSubject) => (
    <button
      key={subject.id}
      type="button"
      className={`bear-ds-chip${subject.pages === 0 ? " is-empty" : ""}`}
      onClick={() => onOpen(subject.id, subject.title)}
    >
      {subject.title}
      <span>{d.chip(subject.pages, subject.terms)}</span>
    </button>
  );
  return (
    <section className="bear-cp-block bear-ds" id="bear-cp-domain">
      <header className="bear-cp-head">
        <h2>{d.stripTitle}</h2>
        <span className="bear-cp-meta">{d.stripNote}</span>
      </header>
      <div className="bear-ds-chips">
        {shown.map(chip)}
        {open ? (
          rest.map(chip)
        ) : (
          rest.length > 0 && (
            <button
              type="button"
              className="bear-ds-chip is-more"
              aria-expanded={false}
              onClick={() => setOpen(true)}
            >
              {d.moreSubjects(rest.length)} ▾
            </button>
          )
        )}
      </div>
    </section>
  );
}
