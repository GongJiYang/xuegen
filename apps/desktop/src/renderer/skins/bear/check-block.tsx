/**
 * 「库检查」一块（logic-ui-1116.html A ③）：上次检查时间、按钮、两组结果和
 * 「交给总控」。只报告，不改文件。
 */

import type { SkillsPanelProps } from "../contract.js";
import { checkStrings } from "../../core/check/strings.js";

export function CheckBlock({ check }: { check: NonNullable<SkillsPanelProps["check"]> }) {
  return (
    <div className="bear-skill-check" data-slot="skills-check">
      <div className="bear-skill-check-head">
        <b>{checkStrings.title}</b>
        <span className="bear-muted">{check.last}</span>
        <button type="button" className="bear-link" disabled={check.running} onClick={check.onRun}>
          {check.button}
        </button>
      </div>
      {check.status !== null && (
        <p className="bear-muted" role="status">
          {check.status}
        </p>
      )}
      {check.groups.map((group) =>
        group.count === 0 ? (
          <p key={group.title} className="bear-skill-check-row is-ok">
            <span className="bear-skill-check-mark" aria-hidden="true">
              ✓
            </span>
            {group.title}：{checkStrings.ok} <span className="bear-muted">{group.hint}</span>
          </p>
        ) : (
          <details key={group.title} className="bear-skill-check-group" open>
            <summary className="bear-skill-check-row is-bad">
              <span className="bear-skill-check-mark" aria-hidden="true">
                !
              </span>
              {group.title}：{checkStrings.count(group.count)}{" "}
              <span className="bear-muted">{group.hint}</span>
            </summary>
            <ul>
              {group.lines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </details>
        ),
      )}
      {check.hasProblems && <p className="bear-muted">{checkStrings.note}</p>}
      {check.hasProblems && check.onAsk !== undefined && (
        <button type="button" className="bear-link" onClick={check.onAsk}>
          {checkStrings.ask}
        </button>
      )}
    </div>
  );
}
