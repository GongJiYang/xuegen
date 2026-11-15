/**
 * 总控「今天学过」一行（批 6，设计稿 batch6-shelf ①）：没有条目就不画；
 * 有条目时是一个 `p.bear-cp-studied`，先是「今天学过」，然后每门课一个 span
 * （粗体课名 + 空格 + 时间）。
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { StudiedEntry } from "../../core/board/studied.js";
import { strings } from "../../core/strings.js";
import { StudiedRow } from "./studied-row.js";

afterEach(cleanup);

const entries: StudiedEntry[] = [
  { slug: "ctm", label: "CTM D3", time: "08:10–09:40" },
  { slug: "discrete-math-epp", label: "离散 周核实", time: "14:00–14:35" },
];

describe("Bear 总控「今天学过」一行", () => {
  it("renders nothing at all when nothing was studied", () => {
    const { container } = render(<StudiedRow entries={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the label then one bold course name plus its time per entry", () => {
    const { container } = render(<StudiedRow entries={entries} />);
    const rows = container.querySelectorAll("p.bear-cp-studied");
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (!(row instanceof HTMLParagraphElement)) throw new Error("studied row is not a paragraph");
    const [key, ...rest] = [...row.children];
    expect(key?.className).toBe("bear-cp-studied-k");
    expect(key?.textContent).toBe(strings.control.card.studied);
    expect(key?.textContent).toBe("今天学过");
    expect(rest).toHaveLength(2);
    for (const entry of rest) expect(entry.tagName).toBe("SPAN");
    expect(rest.map((entry) => entry.querySelector("b")?.textContent)).toEqual(["CTM D3", "离散 周核实"]);
    expect(rest.map((entry) => entry.textContent)).toEqual(["CTM D3 08:10–09:40", "离散 周核实 14:00–14:35"]);
  });
});
