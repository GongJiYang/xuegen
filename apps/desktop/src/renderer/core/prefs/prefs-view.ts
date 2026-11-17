/**
 * 「讲解偏好」的视图模型（logic-ui-1116.html A ⑥）：按科目分组，每行带一个
 * `key = subject + "\n" + text`，删一行时只禁用那一行。纯函数，不碰 DOM。
 */

import type { SubjectPrefs } from "@shared/data-protocol.js";
import { prefsStrings } from "./strings.js";

export interface PrefLine {
  key: string;
  text: string;
  shown: string;
  style: boolean;
  removing: boolean;
}

export interface PrefGroup {
  subject: string;
  title: string;
  lines: PrefLine[];
  error: string | null;
}

export interface PrefsView {
  status: string | null;
  groups: PrefGroup[];
  empty: boolean;
  emptyText: string;
}

const STYLE_PREFIX = /^默认风格[：:]/;

function shownText(text: string, style: boolean): string {
  return style ? text.replace(STYLE_PREFIX, "").trim() : text;
}

function group(prefs: SubjectPrefs, pendingKey: string | null, error: string | undefined): PrefGroup {
  return {
    subject: prefs.subject,
    title: prefs.title,
    lines: prefs.lines.map((line) => {
      const key = `${prefs.subject}\n${line.text}`;
      return {
        key,
        text: line.text,
        shown: shownText(line.text, line.style),
        style: line.style,
        removing: key === pendingKey,
      };
    }),
    error: error === undefined ? null : prefsStrings.failed(error),
  };
}

/** What the block shows: loading line, groups with their lines, empty state, errors. */
export function prefsView(
  list: SubjectPrefs[] | null,
  pendingKey: string | null,
  errors: Record<string, string>,
  loadError?: string | null,
): PrefsView {
  if (list === null) {
    return {
      status: loadError ? prefsStrings.loadFailed(loadError) : prefsStrings.loading,
      groups: [],
      empty: false,
      emptyText: prefsStrings.empty,
    };
  }
  const groups = list
    .filter((prefs) => prefs.lines.length > 0)
    .map((prefs) => group(prefs, pendingKey, errors[prefs.subject]));
  return {
    status: null,
    groups,
    empty: groups.length === 0,
    emptyText: prefsStrings.empty,
  };
}
