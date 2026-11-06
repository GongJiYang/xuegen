/**
 * Bear 技能 panel — BE-2 完善前的最小可用版.
 *
 * Semantic HTML over the props: the install box with its fetch notice, the
 * skill list (toggle checkboxes for installed skills, 审核 buttons for
 * pending), and the review dialog with enable/discard. Final styling is BE-2
 * work.
 */

import { useState } from "react";
import type { SkillsPanelProps } from "../contract.js";
import { strings } from "../../core/strings.js";

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
        <p>
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
        </p>
        {fetchNotice && <p role="status">{fetchNotice}</p>}
      </div>
      {skills.status === "loading" && <p className="bear-muted">{strings.today.loading}</p>}
      {skills.status === "error" && <p role="alert">{skills.message}</p>}
      {skills.status === "ready" &&
        (skills.value.length === 0 ? (
          <p className="bear-muted">{strings.skills.empty}</p>
        ) : (
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
                <p className="bear-muted">
                  /skill:{skill.name} · {skill.description} ·{" "}
                  {skill.source === "builtin"
                    ? strings.skills.sourceBuiltin
                    : skill.source === "personal"
                      ? strings.skills.sourcePersonal
                      : strings.skills.sourcePending}
                </p>
              </li>
            ))}
          </ul>
        ))}
      {review && (
        <div role="dialog" aria-label={strings.skills.review} data-slot="skill-review">
          {review.status === "loading" && <p className="bear-muted">{strings.today.loading}</p>}
          {review.status === "error" && <p role="alert">{review.message}</p>}
          {review.status === "ready" && (
            <>
              <h3>{strings.skills.reviewTitle(review.value.name)}</h3>
              <p>{strings.skills.reviewWarning}</p>
              <p className="bear-muted">
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
              {review.value.lint.errors.length + review.value.lint.warnings.length > 0 ? (
                <ul>
                  {[...review.value.lint.errors, ...review.value.lint.warnings].map((finding, index) => (
                    <li key={index}>{finding}</li>
                  ))}
                </ul>
              ) : (
                <p className="bear-muted">{strings.skills.reviewLintClean}</p>
              )}
              <details>
                <summary>{strings.skills.reviewSkillMd}</summary>
                <pre>{review.value.skillMd}</pre>
              </details>
              <p>
                <button type="button" onClick={() => onEnableReviewed(review.value.name)}>
                  {strings.skills.reviewEnable}
                </button>
                <button type="button" onClick={() => onDiscardReviewed(review.value.name)}>
                  {strings.skills.reviewDiscard}
                </button>
                <button type="button" onClick={onCloseReview}>
                  {strings.skills.reviewClose}
                </button>
              </p>
            </>
          )}
          {review.status !== "ready" && (
            <p>
              <button type="button" onClick={onCloseReview}>
                {strings.skills.reviewClose}
              </button>
            </p>
          )}
        </div>
      )}
      <p className="bear-muted">{strings.skills.footnote}</p>
    </section>
  );
}
