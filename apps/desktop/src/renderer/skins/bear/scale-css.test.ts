// @vitest-environment node
/**
 * Guard: no readable text under 12px (BEAR-VISUAL-PLAN `--fs-1`), no 8-level grey
 * on text one has to read (≥ 4.5:1 means `--gray-11`), and font-size / line-height
 * always paired through the scale variables.
 *
 * `#62625f` (`--gray-8`) on the card (`#1c1c1b`) is about 2.7:1: fine for a
 * disabled chip or a decoration, unreadable for a count or a strikethrough row.
 * A bare 12px font-size with an inherited 20px / 24px line-height also makes the
 * small labels look like paragraphs; the variables keep the pair together.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CSS = readFileSync(join(fileURLToPath(new URL(".", import.meta.url)), "skin.css"), "utf8");
const PREFIX = '[data-skin="bear"] ';

/** The body of the first rule written as `${selector} {`, up to its closing brace. */
function rule(selector: string): string {
  const head = `${selector} {`;
  const start = CSS.indexOf(head);
  expect(start, `no rule found for ${head}`).toBeGreaterThan(-1);
  const bodyStart = start + head.length;
  const end = CSS.indexOf("}", bodyStart);
  expect(end, `rule ${head} has no closing brace`).toBeGreaterThan(-1);
  return CSS.slice(bodyStart, end);
}

describe("bear scale in CSS", () => {
  it("never sets a font-size below 12px, except the 勾选框's ✓ glyph", () => {
    const small: string[] = [];
    const RULE = /([^{}]+)\{([^{}]*)\}/g;
    for (const match of CSS.matchAll(RULE)) {
      const selector = match[1] ?? "";
      const body = match[2] ?? "";
      const size = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(body);
      if (size === null) continue;
      const pixels = Number(size[1]);
      if (pixels >= 12) continue;
      small.push(selector.trim());
    }
    expect(small.length).toBeGreaterThan(0);
    for (const selector of small) {
      expect(selector, `font-size below 12px outside .bear-cc-box: ${selector}`).toContain(".bear-cc-box");
    }
  });

  it("uses --gray-11, not --gray-8, for text one has to read", () => {
    const readable = [
      `${PREFIX}.bear-cp-termfilter button small`,
      `${PREFIX}.bear-pb-it.is-ghost`,
      `${PREFIX}.bear-pb-it.is-ghost small`,
      `${PREFIX}.bear-ds-chip.is-empty,\n${PREFIX}.bear-ds-chip.is-more`,
    ];
    for (const selector of readable) {
      expect(rule(selector), `${selector} still uses --gray-8`).not.toContain("var(--gray-8)");
    }
  });

  it("hides the day view's own caption inside 今天 — the block head already wrote it", () => {
    const body = rule(`${PREFIX}.bear-cp #bear-cp-today .bear-pb-daylist > .bear-pb-cap`);
    expect(body).toContain("display: none");
  });

  it("keeps 今天 narrower than the panel so a row's text and its 开课 → stay close", () => {
    const body = rule(`${PREFIX}.bear-cp #bear-cp-today`);
    expect(body).toContain("max-width: 76em");
  });

  it("keeps a block's caption next to its title, not pushed to the far right", () => {
    const body = rule(`${PREFIX}.bear-cp .bear-cp-head`);
    expect(body).toContain("justify-content: flex-start");
  });

  it("keeps 术语's caption on the far right of its head", () => {
    const body = rule(`${PREFIX}.bear-cp-terms .bear-cp-head > .bear-cp-meta`);
    expect(body).toContain("margin-left: auto");
  });

  it("pairs every scale font-size with its line-height", () => {
    const pairs = [
      [`${PREFIX}.bear-cp-termcount`, "1"],
      [`${PREFIX}.bear-cp-termfilter button`, "1"],
      [`${PREFIX}.bear-cp-termlesson`, "1"],
      [`${PREFIX}.bear-ds-chip span`, "1"],
      [`${PREFIX}.bear-pb-it small`, "1"],
      [`${PREFIX}.bear-ds-chip`, "2"],
    ] as const;
    for (const [selector, step] of pairs) {
      const body = rule(selector);
      expect(body, `${selector} should set --fs-${step}`).toContain(`font-size: var(--fs-${step})`);
      expect(body, `${selector} should set --lh-${step}`).toContain(`line-height: var(--lh-${step})`);
    }
  });
});
