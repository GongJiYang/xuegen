/**
 * Format one `wiki/log.md` entry for the calendar's day detail.
 *
 * The raw lines read like `reading | 某文章` or, from older runs, `log course |
 * …`. Showing them verbatim is noisy (B13), so the panel renders 「类型 · 内容」
 * instead: drop a leading `log` marker, then turn the ` | ` separator into ` · `.
 * Pure, so the transformation has a unit test.
 */

/** The ` | ` separator the log writers use between the kind and the subject. */
const SEPARATOR = /\s*\|\s*/;

/**
 * Turn a raw log line into `类型 · 内容`.
 *
 * A leading `log` word (with optional trailing space) is removed first, so both
 * `log course | X` and `course | X` become `course · X`. A line without a
 * separator is returned as-is (minus the leading `log`).
 */
export function formatLogLine(line: string): string {
  const withoutLog = line.trim().replace(/^log\s+/i, "");
  return withoutLog.replace(SEPARATOR, " · ");
}
