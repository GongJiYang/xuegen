import type { StudiedEntry } from "../../core/board/studied.js";
import { strings } from "../../core/strings.js";

/** 总控「今天」卡底下的「今天学过」一行（批 6，设计稿 batch6-shelf ①）；没有就不画。 */
export function StudiedRow({ entries }: { entries: StudiedEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <p className="bear-cp-studied">
      <span className="bear-cp-studied-k">{strings.control.card.studied}</span>
      {entries.map((entry) => (
        <span key={entry.slug}>
          <b>{entry.label}</b> {entry.time}
        </span>
      ))}
    </p>
  );
}
