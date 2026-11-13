// @vitest-environment node
/**
 * Guard: the planbook element resets must not out-specify the class rules.
 *
 * `[data-skin="bear"] .bear-pb button` is (0,2,1) — higher than
 * `[data-skin="bear"] .bear-pb-cell` (0,2,0) — so its `border: none; padding: 0`
 * silently wiped the week grid's cell lines and padding, and did the same to
 * `.bear-pb-btn`, `.bear-pb-mc` and friends. The `p` reset had the same problem:
 * `... .bear-pb p { margin: 0 }` beat `.bear-pb-cap` / `-mt` / `-goal` / `-foot`,
 * so the planbook's whitespace disappeared too (the design dodges this by writing
 * `!important` on those margins). Wrapping the element in `:where()` drops the
 * button reset to (0,2,0) — the later class rules win on order — and the `p`
 * reset to (0,1,0), so neither can ever out-rank a class rule again.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CSS = readFileSync(join(fileURLToPath(new URL(".", import.meta.url)), "skin.css"), "utf8");

const BUTTON_RESET = '[data-skin="bear"] .bear-pb :where(button) {';
const P_RESET = '[data-skin="bear"] :where(.bear-pb p) {';
const FIRST_CLASS_RULE = '[data-skin="bear"] .bear-pb-cell {';

describe("planbook element resets", () => {
  it("reaches buttons without out-specifying the class rules", () => {
    expect(CSS).toContain(BUTTON_RESET);
    expect(CSS).not.toContain('[data-skin="bear"] .bear-pb button {');
  });

  it("reaches paragraphs without out-specifying the margin rules", () => {
    expect(CSS).toContain(P_RESET);
    expect(CSS).not.toContain('[data-skin="bear"] .bear-pb p {');
    // The paragraph reset sits at (0,1,0): it only zeroes the margins of <p>s
    // that no class rule styles, exactly as before, but can never beat one.
    expect(CSS).not.toContain('[data-skin="bear"] .bear-pb :where(p) {');
  });

  it("is written before the class rules they must not override", () => {
    const buttonAt = CSS.indexOf(BUTTON_RESET);
    const pAt = CSS.indexOf(P_RESET);
    const classAt = CSS.indexOf(FIRST_CLASS_RULE);
    expect(buttonAt).toBeGreaterThan(-1);
    expect(pAt).toBeGreaterThan(-1);
    expect(classAt).toBeGreaterThan(-1);
    expect(buttonAt).toBeLessThan(classAt);
    expect(pAt).toBeLessThan(classAt);
  });

  it("keeps the planbook's own descendant-element rules to compound classes", () => {
    // A bare `.bear-pb… button` / `.bear-pb p` rule is (0,2,1) and would beat
    // the (0,2,0) class rules below it; the remaining ones are scoped to a
    // component class (`.bear-pb-seg button`) or only hide things in print.
    const offenders = [
      '[data-skin="bear"] .bear-pb button {',
      '[data-skin="bear"] .bear-pb p {',
      '[data-skin="bear"] .bear-pb-btn button {',
      '[data-skin="bear"] .bear-pb-cell button {',
      '[data-skin="bear"] .bear-pb-mc button {',
      '[data-skin="bear"] .bear-pb :where(p) {',
    ].filter((needle) => CSS.includes(needle));
    expect(offenders).toEqual([]);
  });
});
