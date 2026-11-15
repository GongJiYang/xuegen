/**
 * Bear 总控底部的「领域」一行 (control-v3 ①): one chip per subject, the rest folded
 * behind 「另外 N 个 ▾」.
 *
 * The row is optional — the panel hides it while the subject list loads and when
 * there is none — and it never reorders on its own: by pages, then title, with the
 * subjects that have no pages last.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strings } from "../../core/strings.js";
import { DomainStrip } from "./domain-strip.js";

afterEach(cleanup);

const d = strings.domain;

interface Subject {
  id: string;
  title: string;
  pages: number;
  terms: number;
}

function subject(id: string, title: string, pages: number, terms = pages * 2): Subject {
  return { id, title, pages, terms };
}

/** Six subjects, already in the order the row should show them. */
const SIX: Subject[] = [
  subject("pp", "编程范式", 12, 41),
  subject("dm", "离散数学", 9, 30),
  subject("la", "线性代数", 7, 12),
  subject("os", "操作系统", 5, 8),
  subject("db", "数据库", 3, 4),
  subject("se", "软件工程", 1, 1),
];

describe("DomainStrip", () => {
  it("renders nothing while the subjects load", () => {
    const { container } = render(<DomainStrip domains={null} onOpen={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when there is no subject", () => {
    const { container } = render(<DomainStrip domains={[]} onOpen={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows four chips and folds the rest behind 另外 N 个", () => {
    render(<DomainStrip domains={SIX} onOpen={vi.fn()} />);
    expect(screen.getByRole("heading", { name: d.stripTitle })).toBeDefined();
    expect(screen.getByText(d.stripNote)).toBeDefined();
    for (const shown of SIX.slice(0, 4)) {
      expect(screen.getByRole("button", { name: new RegExp(shown.title) })).toBeDefined();
    }
    for (const hidden of SIX.slice(4)) {
      expect(screen.queryByRole("button", { name: new RegExp(hidden.title) })).toBeNull();
    }
    const more = screen.getByRole("button", { name: new RegExp(d.moreSubjects(2)) });
    expect(more.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows every chip once 另外 N 个 is open", async () => {
    render(<DomainStrip domains={SIX} onOpen={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: new RegExp(d.moreSubjects(2)) }));
    for (const item of SIX) {
      expect(screen.getByRole("button", { name: new RegExp(item.title) })).toBeDefined();
    }
    expect(screen.queryByRole("button", { name: new RegExp(d.moreSubjects(2)) })).toBeNull();
  });

  it("opens the subject that was clicked", async () => {
    const onOpen = vi.fn();
    render(<DomainStrip domains={SIX} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: new RegExp("编程范式") }));
    expect(onOpen).toHaveBeenCalledWith("pp", "编程范式");
  });

  it("orders by pages, then title, and puts the subjects without pages last", () => {
    render(
      <DomainStrip
        domains={[
          subject("empty-b", "还没词表的乙", 0, 0),
          subject("small", "少页的", 2, 3),
          subject("big", "多页的", 30, 90),
          subject("empty-a", "还没词表的甲", 0, 0),
        ]}
        onOpen={vi.fn()}
      />,
    );
    const names = screen.getAllByRole("button").map((button) => button.textContent ?? "");
    expect(names[0]).toContain("多页的");
    expect(names[1]).toContain("少页的");
    // pages === 0 的排在最后，同页数按标题。
    expect(names[2]).toContain("还没词表的甲");
    expect(names[3]).toContain("还没词表的乙");
  });

  it("marks a subject without pages as empty and shows the page · term count", () => {
    render(<DomainStrip domains={[subject("pp", "编程范式", 12, 41), subject("none", "空科目", 0, 0)]} onOpen={vi.fn()} />);
    const full = screen.getByRole("button", { name: new RegExp("编程范式") });
    const empty = screen.getByRole("button", { name: new RegExp("空科目") });
    expect(empty.className).toContain("is-empty");
    expect(full.className).not.toContain("is-empty");
    expect(full.textContent).toContain(d.chip(12, 41));
    expect(empty.textContent).toContain(d.chip(0, 0));
  });
});
