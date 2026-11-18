/**
 * 「讲解偏好」一块（logic-ui-1116.html A ⑥）：按科目列出记下的偏好，删一行不弹
 * 确认；`默认风格` 的行带小标签。
 */

import type { SkillsPanelProps } from "../contract.js";
import { prefsStrings } from "../../core/prefs/strings.js";

export function PrefsBlock({ prefs }: { prefs: NonNullable<SkillsPanelProps["prefs"]> }) {
  return (
    <div className="bear-skill-prefs" data-slot="skills-prefs">
      <div className="bear-skill-check-head">
        <b>{prefsStrings.title}</b>
        <span className="bear-muted">{prefsStrings.hint}</span>
      </div>
      {prefs.status !== null && (
        <p className="bear-muted" role="status">
          {prefs.status}
        </p>
      )}
      {prefs.empty && <p className="bear-muted">{prefs.emptyText}</p>}
      {prefs.groups.map((group) => (
        <section key={group.subject} className="bear-skill-prefs-group" aria-label={group.title}>
          <h4>{group.title}</h4>
          <ul>
            {group.lines.map((line) => (
              <li key={line.key}>
                {line.style && <span className="bear-skill-prefs-tag">{prefsStrings.style}</span>}
                <span>{line.shown}</span>
                <button
                  type="button"
                  className="bear-link"
                  disabled={line.removing}
                  onClick={() => prefs.onRemove(group.subject, line.text)}
                >
                  {line.removing ? prefsStrings.removing : prefsStrings.remove}
                </button>
              </li>
            ))}
          </ul>
          {group.error !== null && (
            <p className="bear-muted" role="status">
              {group.error}
            </p>
          )}
        </section>
      ))}
      {!prefs.empty && prefs.groups.length > 0 && <p className="bear-muted">{prefsStrings.note}</p>}
    </div>
  );
}
