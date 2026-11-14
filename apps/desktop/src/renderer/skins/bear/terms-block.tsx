/**
 * Bear 总控 「术语」 block: one row per recent lesson — 「离散 D3 · 11-12」 then
 * its terms as buttons that open the concept page in the reader. The definition
 * shows on hover. Sits under 本周 and fills the space down to the end of 今天;
 * more terms than fit scroll inside the block, and with two or more courses a
 * course filter narrows the rows.
 */

import { useState } from "react";
import type { ControlPanelProps } from "../contract.js";
import { termsCourses } from "../../core/board/terms.js";
import { strings } from "../../core/strings.js";

export function TermsBlock({
  terms,
  onOpenTerm,
}: {
  terms: ControlPanelProps["terms"];
  onOpenTerm: ControlPanelProps["onOpenTerm"];
}) {
  const panel = strings.panel;
  const [course, setCourse] = useState<string | null>(null);
  const lessons = Array.isArray(terms) ? terms : [];
  const courses = termsCourses(lessons);
  const picked = courses.some((item) => item.course === course) ? course : null;
  const shown = picked === null ? lessons : lessons.filter((lesson) => lesson.course === picked);
  const total = courses.reduce((sum, item) => sum + item.count, 0);
  return (
    <section className="bear-cp-block bear-cp-terms">
      <header className="bear-cp-head">
        <h2>
          {panel.blockTerms}
          {total > 0 && <span className="bear-cp-termcount">{panel.termsCount(total)}</span>}
        </h2>
        <span className="bear-cp-meta">{panel.blockTermsCaption}</span>
      </header>
      {courses.length > 1 && (
        <div className="bear-cp-termfilter" role="group" aria-label={panel.blockTerms}>
          {[{ course: null, name: panel.termsAll, count: total }, ...courses].map((item) => (
            <button
              key={item.course ?? "all"}
              type="button"
              aria-pressed={picked === item.course}
              onClick={() => setCourse(item.course)}
            >
              {item.name} <small>{item.count}</small>
            </button>
          ))}
        </div>
      )}
      {terms === null && <p className="bear-cp-meta">{panel.blockLoading}</p>}
      {terms === "failed" && <p className="bear-cp-meta">{panel.termsFailed}</p>}
      {Array.isArray(terms) && terms.length === 0 && <p className="bear-cp-meta">{panel.termsEmpty}</p>}
      {shown.length > 0 && (
        <ul className="bear-cp-termrows">
          {shown.map((lesson) => (
            <li key={lesson.key}>
              <span className="bear-cp-termlesson">{lesson.label}</span>
              <span className="bear-cp-termlist">
                {lesson.terms.map((term) => (
                  <button
                    key={term.key}
                    type="button"
                    className={`bear-cp-term${term.missing ? " is-missing" : ""}`}
                    disabled={term.missing}
                    onClick={() => onOpenTerm(term.path, term.title)}
                    title={term.missing ? panel.termsMissing : (term.hint ?? term.title)}
                  >
                    {term.title}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
