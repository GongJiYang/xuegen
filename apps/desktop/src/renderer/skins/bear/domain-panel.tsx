/**
 * Bear 领域页 (domain.html ①②): the subject's glossary on the left, the 领域小结
 * or the opened concept page in the middle. The 「问」 column on the right is the
 * ordinary chat panel, placed by App — not part of this slot.
 */

import { useEffect } from "react";
import type { DomainPanelProps } from "../contract.js";
import { countEntries } from "../../core/board/domain.js";
import { strings } from "../../core/strings.js";

/** True when the event comes from a field, where ← → belong to the caret. */
function inField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

export function DomainPanel(props: DomainPanelProps) {
  const d = strings.domain;
  const domain = props.domain;
  const open = domain.page !== null;

  // ← → walk the filtered list, the same keys the 总控 wide reader uses.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || inField(event.target)) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      domain.step(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, domain]);

  const summary = domain.glossary !== null && domain.glossary !== "failed" ? domain.glossary.summary : null;

  return (
    <div className="bear-dp">
      <aside className="bear-dp-list" aria-label={props.title}>
        <div className="bear-dp-head">
          <b className="bear-dp-subj">{props.title}</b>
          {props.subjects.length > 1 && (
            // The small 「▾ 换科目」 is the visible control; the select lies on
            // top of it, fully transparent, so a click opens the native menu.
            <label className="bear-dp-switch">
              {`▾ ${d.switchSubject}`}
              <select
                className="bear-dp-switch-sel"
                aria-label={d.switchSubject}
                value={props.current}
                onChange={(event) => props.onSwitchSubject(event.target.value)}
              >
                {props.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <input
          className="bear-dp-find"
          type="search"
          placeholder={d.find}
          value={domain.query}
          onChange={(event) => domain.setQuery(event.target.value)}
        />
        <p className="bear-dp-count">
          {domain.query.trim() === "" ? d.all(domain.total) : d.found(countEntries(domain.sections))}
        </p>
        {domain.glossary === null && <p className="bear-dp-note">{d.loading}</p>}
        {domain.glossary === "failed" && <p className="bear-dp-note">{d.failed}</p>}
        {domain.glossary !== null && domain.glossary !== "failed" && domain.total === 0 && (
          <p className="bear-dp-note">{d.noTerms}</p>
        )}
        {domain.sections.map((section) => (
          <section key={section.label} className="bear-dp-sec">
            <h5 className="bear-dp-group">{section.label}</h5>
            <ul>
              {section.entries.map((entry, index) => (
                <li key={`${entry.path}|${entry.kind}|${entry.term}|${index}`}>
                  <button
                    type="button"
                    className={`bear-dp-item${
                      entry.kind === "page" && domain.page?.path === entry.path ? " is-on" : ""
                    }`}
                    onClick={() => domain.openPage(entry, section.label)}
                  >
                    <span>{entry.term}</span>
                    {entry.en !== null && <small>{entry.en}</small>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </aside>
      <article className="bear-dp-main">
        {domain.page === null ? (
          <>
            <p className="bear-dp-crumb">{d.summaryCrumb(props.title)}</p>
            <h2 className="bear-dp-title">{d.summaryTitle}</h2>
            {summary !== null ? (
              <div className="bear-dp-sum">{props.renderMarkdown(summary)}</div>
            ) : (
              <p className="bear-dp-note">{d.noSummary}</p>
            )}
          </>
        ) : (
          <>
            <p className="bear-dp-crumb">{domain.page.crumb}</p>
            <h2 className="bear-dp-title">{domain.page.title}</h2>
            {domain.page.error !== null ? (
              <p className="bear-dp-note" role="alert">
                {domain.page.error}
              </p>
            ) : domain.page.markdown === null ? (
              <p className="bear-dp-note">{d.pageLoading}</p>
            ) : (
              <div className="bear-dp-body">{props.renderMarkdown(domain.page.markdown)}</div>
            )}
            <nav className="bear-dp-nav">
              <button type="button" className="bear-cp-link" onClick={domain.closePage}>
                {d.back}
              </button>
              <button type="button" className="bear-cp-link" onClick={() => domain.step(-1)}>
                {strings.feed.readerPrev}
              </button>
              <button type="button" className="bear-cp-link" onClick={() => domain.step(1)}>
                {strings.feed.readerNext}
              </button>
              <a className="bear-cp-link" href={domain.page.external}>
                {strings.feed.openInObsidian}
              </a>
            </nav>
          </>
        )}
      </article>
    </div>
  );
}
