// @vitest-environment node
// `shelf.afterDone` writing a book page's `## 课后读` row: temporary XUEGEN_HOME +
// vault, then the real handler, which runs the real skill scripts.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleDataRequest } from "./handler.js";

/** Write `text` to `file`, creating parent directories. */
function touch(file: string, text: string): void {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, text, "utf8");
}

describe("shelf.afterDone", () => {
  let home: string;
  let vault: string;
  const originalHome = process.env.XUEGEN_HOME;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "xuegen-after-done-home-"));
    vault = mkdtempSync(join(tmpdir(), "xuegen-after-done-vault-"));
    process.env.XUEGEN_HOME = home;
    mkdirSync(join(vault, "wiki"), { recursive: true });
    writeFileSync(join(home, "wiki.json"), JSON.stringify({ root: vault }), "utf8");
  });

  afterEach(() => {
    process.env.XUEGEN_HOME = originalHome;
    rmSync(home, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  });

  it("shelf.afterDone checks the `## 课后读` row, logs it, rebuilds the boards", async () => {
    // A course page is needed only because the rebuild runs `dashboard` over
    // wiki/courses; the write itself touches nothing but the book page.
    touch(
      join(vault, "wiki", "courses", "demo.md"),
      [
        "<!-- xuegen:course-state -->",
        "",
        "# Demo",
        "",
        "## Key Facts",
        "",
        "- 当前周：W1 · 起步",
        "",
        "## This Week",
        "",
        "W1 · 起步",
        "",
        "- [ ] 任务一",
        "",
        "## Today",
        "",
        "- [ ] 随便一条",
        "",
        "## Next Session",
        "",
        "读 [[shelf/t|Epp]] §2.1。",
        "",
        "## Learning Record",
        "",
        "### 2026-11-09-01",
        "",
        "- 记录。",
        "",
      ].join("\n"),
    );
    touch(
      join(vault, "wiki", "shelf", "t.md"),
      [
        "---",
        "kind: book",
        "slot: planned",
        "order: 1",
        "status: reading",
        'title: "Epp"',
        'short: "Epp"',
        "started: 2026-11-09",
        "position: 0",
        "---",
        "",
        "# Epp",
        "",
        "## 分段",
        "1. Ch1 pp.1–36",
        "",
        "## 课后读",
        "",
        "- [ ] §1.1–1.4 · pp.1–5、7–12 · demo · 2026-11-10",
        "",
        "## 读书记录",
        "",
      ].join("\n"),
    );

    const result = await handleDataRequest({
      kind: "shelf.afterDone",
      book: "t",
      index: 1,
      today: "2026-11-10",
    });
    expect(result).toEqual({
      ok: true,
      data: {
        slug: "t",
        index: 1,
        label: "§1.1–1.4",
        pages: "1–5、7–12",
        course: "demo",
        readOn: "2026-11-10",
        committed: "skipped",
      },
    });

    const book = readFileSync(join(vault, "wiki", "shelf", "t.md"), "utf8");
    expect(book).toContain("- [x] §1.1–1.4 · pp.1–5、7–12 · demo · 2026-11-10 · 读于 2026-11-10");
    expect(book).toContain("- 2026-11-10: 课后读 §1.1–1.4 已读（demo）");
    // 课后读不推进整本书的进度，也不碰课程页。
    expect(book).toContain("position: 0");
    expect(readFileSync(join(vault, "wiki", "courses", "demo.md"), "utf8")).toContain(
      "- [ ] 随便一条",
    );
    expect(statSync(join(vault, "wiki", "_generated", "courses.md")).isFile()).toBe(true);
    expect(statSync(join(vault, "wiki", "_generated", "courses.html")).isFile()).toBe(true);
  });
});
