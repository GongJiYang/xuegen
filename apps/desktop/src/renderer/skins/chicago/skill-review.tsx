/**
 * Chicago review dialog for a fetched (pending) skill.
 *
 * Shows what the user is about to trust before it can be enabled: source and
 * commit, every file with executable scripts called out, Xuegen's authoring
 * findings (hints only), and the full SKILL.md. Enabling happens only here.
 */

import type { SkillsPanelProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { Failed, Loading } from "./panel-shared.js";

type ReviewProps = Pick<SkillsPanelProps, "review" | "onCloseReview" | "onEnableReviewed" | "onDiscardReviewed">;

export function SkillReviewDialog({ review, onCloseReview, onEnableReviewed, onDiscardReviewed }: ReviewProps) {
  if (!review) return null;
  const title = review.status === "ready" ? strings.skills.reviewTitle(review.value.name) : strings.skills.review;
  return (
    <div className="chicago-scrim chicago-show chicago-dlg-scrim">
      <div className="chicago-dialog chicago-review-dlg" role="dialog" aria-label={title}>
        <div className="chicago-dialog-inner">
          <div className="chicago-dialog-head">{title}</div>
          {review.status === "loading" && <Loading />}
          {review.status === "error" && <Failed message={review.message} />}
          {review.status === "ready" && <ReviewBody value={review.value} />}
          <div className="chicago-btns">
            <button type="button" className="chicago-btn" onClick={onCloseReview}>
              {strings.skills.reviewClose}
            </button>
            {review.status === "ready" && (
              <>
                <button type="button" className="chicago-btn" onClick={() => onDiscardReviewed(review.value.name)}>
                  {strings.skills.reviewDiscard}
                </button>
                <span className="chicago-def">
                  <button type="button" className="chicago-btn" onClick={() => onEnableReviewed(review.value.name)}>
                    {strings.skills.reviewEnable}
                  </button>
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewBody({ value }: { value: NonNullable<Extract<ReviewProps["review"], { status: "ready" }>>["value"] }) {
  const scripts = value.files.filter((file) => file.executable);
  const findings = [...value.lint.errors, ...value.lint.warnings];
  return (
    <div className="chicago-review-body">
      <p className="chicago-small">{value.description}</p>
      <dl className="chicago-review-meta">
        <dt>{strings.skills.reviewSource}</dt>
        <dd>
          {value.url || "—"}
          {value.subdir && value.subdir !== "." ? ` · ${value.subdir}` : ""}
        </dd>
        <dt>{strings.skills.reviewCommit}</dt>
        <dd>{value.commit ? value.commit.slice(0, 12) : "—"}</dd>
      </dl>
      <p className="chicago-review-warning">{strings.skills.reviewWarning}</p>
      <div className="chicago-review-section">{strings.skills.reviewExecutable}</div>
      {scripts.length === 0 ? (
        <p className="chicago-small">{strings.skills.reviewNoScripts}</p>
      ) : (
        <ul className="chicago-review-files">
          {scripts.map((file) => (
            <li key={file.path}>
              <b>{file.path}</b> <span className="chicago-small">{file.size} B</span>
            </li>
          ))}
        </ul>
      )}
      <div className="chicago-review-section">
        {strings.skills.reviewFiles}（{value.files.length}）
      </div>
      <ul className="chicago-review-files">
        {value.files.map((file) => (
          <li key={file.path}>
            {file.path} <span className="chicago-small">{file.size} B</span>
          </li>
        ))}
      </ul>
      <div className="chicago-review-section">{strings.skills.reviewLint}</div>
      {findings.length === 0 ? (
        <p className="chicago-small">{strings.skills.reviewLintClean}</p>
      ) : (
        <ul className="chicago-review-files">
          {findings.map((finding, index) => (
            <li key={index} className="chicago-small">
              {finding}
            </li>
          ))}
        </ul>
      )}
      <div className="chicago-review-section">{strings.skills.reviewSkillMd}</div>
      <pre className="chicago-review-md">{value.skillMd}</pre>
    </div>
  );
}
