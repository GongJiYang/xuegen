/**
 * Chicago 技能 window body.
 *
 * One row per skill: an enable checkbox, the name and its `/skill:name`, the
 * description, and a source tag (内置 / 个人 / 待审核). On top, the install form
 * that fetches a repo into the pending area (审核后再启用).
 */

import { useState } from "react";
import type { SkillsPanelProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { skillLabel } from "../../core/board/skills-description.js";
import { Caption, CheckBox, Field, InRow, Tag } from "./widgets.js";
import { Failed, Loading, Note, sourceLabel } from "./panel-shared.js";
import { SkillReviewDialog } from "./skill-review.js";

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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div className="chicago-pane-inner">
      <div className="chicago-inbox">
        <Caption title={strings.skills.installCaption} hint={strings.skills.installHint} />
        <InRow>
          <Field
            value={url}
            onChange={setUrl}
            placeholder={strings.skills.installPlaceholder}
            ariaLabel={strings.skills.installCaption}
            grow
          />
          <button
            type="button"
            className="chicago-btn"
            onClick={() => {
              if (url.trim()) onFetch(url.trim());
              setUrl("");
            }}
          >
            {strings.skills.fetch}
          </button>
        </InRow>
        {fetchNotice && <Note>{fetchNotice}</Note>}
      </div>
      {skills.status === "loading" && <Loading />}
      {skills.status === "error" && <Failed message={skills.message} />}
      {skills.status === "ready" &&
        (skills.value.length === 0 ? (
          <Note>{strings.skills.empty}</Note>
        ) : (
          skills.value.map((skill) => {
            const label = skillLabel(skill.name, skill.description);
            const raw = `/skill:${skill.name} · ${skill.description}`;
            const more = raw !== label.line;
            const isExpanded = expanded[skill.name] ?? false;
            const shown = isExpanded ? raw : label.line;
            return (
              <div className="chicago-skill" key={skill.name}>
                {skill.source === "pending" ? (
                  <span aria-hidden="true" />
                ) : (
                  <CheckBox
                    checked={skill.enabled}
                    ariaLabel={label.title}
                    onChange={(enabled) => onToggle(skill.name, enabled)}
                  />
                )}
                <div>
                  <button
                    type="button"
                    className="chicago-skill-name chicago-skill-toggle"
                    aria-expanded={more ? isExpanded : undefined}
                    onClick={() => more && setExpanded((state) => ({ ...state, [skill.name]: !isExpanded }))}
                  >
                    {label.title}
                    {"　"}
                    <span className="chicago-small">/skill:{skill.name}</span>
                  </button>
                  <div className="chicago-small">
                    {shown}
                    {more && (
                      <span className="chicago-skill-more">
                        {" "}
                        {isExpanded ? strings.skills.collapse : strings.skills.expand}
                      </span>
                    )}
                  </div>
                </div>
                {skill.source === "pending" ? (
                  <button type="button" className="chicago-btn" onClick={() => onReview(skill.name)}>
                    {strings.skills.review}
                  </button>
                ) : (
                  <Tag>{sourceLabel(skill.source)}</Tag>
                )}
              </div>
            );
          })
        ))}
      <Note>{strings.skills.footnote}</Note>
      <SkillReviewDialog
        review={review}
        onCloseReview={onCloseReview}
        onEnableReviewed={onEnableReviewed}
        onDiscardReviewed={onDiscardReviewed}
      />
    </div>
  );
}
