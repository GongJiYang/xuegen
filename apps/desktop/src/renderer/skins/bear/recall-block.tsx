/**
 * Bear 「开课前回想一下」 (design `docs/desktop/mockups/recall.html`): beside
 * 今天, the concept pages each main course's previous lesson saved. A page
 * opens in the reader; the foot opens the course's 领域 page. Read-only — it
 * records nothing. Hidden on a narrow panel by CSS (container query).
 */

import type { RecallGroup } from "../../core/board/recall.js";
import { strings } from "../../core/strings.js";
import type { ControlPanelProps } from "../contract.js";

export function RecallBlock({
  groups,
  onOpenTerm,
  onOpenDomain,
}: {
  groups: RecallGroup[];
  onOpenTerm: ControlPanelProps["onOpenTerm"];
  onOpenDomain: ControlPanelProps["onOpenDomain"] | undefined;
}) {
  const panel = strings.panel;
  if (groups.length === 0) return null;
  return (
    <aside className="bear-cp-recall" aria-label={panel.recallTitle}>
      <div className="bear-cp-recall-gh">
        <b>{panel.recallTitle}</b>
        <span>{panel.recallCaption}</span>
      </div>
      {groups.map((group) => {
        const domain = group.domain;
        const openDomain =
          domain === null || onOpenDomain === undefined
            ? null
            : () => onOpenDomain(domain.id, domain.title);
        return (
          <section className="bear-cp-recall-group" key={group.key}>
            <p className="bear-cp-recall-lesson">{group.label}</p>
            {group.terms.length === 0 ? (
              <p className="bear-cp-recall-empty">{panel.recallEmpty}</p>
            ) : (
              <ul className="bear-cp-recall-list">
                {group.terms.map((term) => (
                  <li key={term.key}>
                    <button
                      type="button"
                      className="bear-cp-recall-term"
                      title={term.hint ?? term.title}
                      onClick={() => onOpenTerm(term.path, term.title)}
                    >
                      {term.title}
                    </button>
                  </li>
                ))}
                {group.more > 0 && (
                  <li className="bear-cp-recall-more">
                    {openDomain === null ? (
                      panel.recallMore(group.more)
                    ) : (
                      <button type="button" className="bear-cp-link" onClick={openDomain}>
                        {panel.recallMore(group.more)}
                      </button>
                    )}
                  </li>
                )}
              </ul>
            )}
            {openDomain !== null && (
              <p className="bear-cp-recall-foot">
                <button type="button" className="bear-cp-link" onClick={openDomain}>
                  {panel.recallDomain(group.name)}
                </button>
              </p>
            )}
          </section>
        );
      })}
    </aside>
  );
}
