/**
 * The one way to sort text. A bare `localeCompare` follows the machine's
 * language: a Mac set to Chinese sorts 甲 before 乙 by pinyin, the en-US CI
 * runner by code point, so tests pass locally and fail in CI. Every sort pins
 * the Chinese collation here instead (eslint bans `localeCompare`).
 */

const collator = new Intl.Collator("zh-Hans-CN");

/** Compare two strings in Chinese (pinyin) order, the same on every machine. */
export function compareText(a: string, b: string): number {
  return collator.compare(a, b);
}
