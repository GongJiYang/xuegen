// @vitest-environment node
// `course.afterRead` writing into a shelf book page: temporary XUEGEN_HOME + vault,
// then the real handler, which runs the real skill scripts.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleDataRequest } from "./handler.js";

/** Write `text` to `file`, creating parent directories. */
function touch(file: string, text: string): void {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, text, "utf8");
}

describe("course.afterRead into a shelf book", () => {
  let home: string;
  let vault: string;
  const originalHome = process.env.XUEGEN_HOME;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "xuegen-after-read-home-"));
    vault = mkdtempSync(join(tmpdir(), "xuegen-after-read-vault-"));
    process.env.XUEGEN_HOME = home;
    mkdirSync(join(vault, "wiki"), { recursive: true });
    writeFileSync(join(home, "wiki.json"), JSON.stringify({ root: vault }), "utf8");
  });

  afterEach(() => {
    process.env.XUEGEN_HOME = originalHome;
    rmSync(home, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  });

  it("course.afterRead writes into the shelf book page when the course links 书房/<book>", async () => {
    // The course points at a shelf book (`[[书房/t]]`) and keeps no reading link:
    // the lesson's read must land in the book page, never in wiki/reading/.
    const courseFile = join(vault, "wiki", "courses", "demo.md");
    const text = [
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
      "- [ ] 讲后读 §1.1–1.4 核心页 · 2026-11-10 读（核心页已定：pp.1–5、7–12，跳过 6）",
      "",
      "## Next Session",
      "",
      "读 [[书房/t|Epp]] §2.1。",
      "",
      "## Learning Record",
      "",
      "### 2026-11-09-01",
      "",
      "- 记录。",
      "",
    ].join("\n");
    touch(courseFile, text);
    touch(
      join(vault, "wiki", "书房", "t.md"),
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
        "## 读书记录",
        "",
      ].join("\n"),
    );

    const result = await handleDataRequest({
      kind: "course.afterRead",
      slug: "demo",
      label: "§1.1–1.4 核心页",
      date: "2026-11-10",
    });
    expect(result).toEqual({
      ok: true,
      data: { label: "§1.1–1.4 核心页", reading: null, book: "t" },
    });

    const book = readFileSync(join(vault, "wiki", "书房", "t.md"), "utf8");
    expect(book).toContain("- 2026-11-10: 讲后读 §1.1–1.4 核心页 已读（demo，用户自报）");
    expect(book).toContain("- pp.1–5、7–12 · demo · §1.1–1.4 核心页 · 2026-11-10");
    expect(book).toContain("position: 0");
    // 讲后读不推进整本书的进度，也不记进旧的阅读页
    expect(existsSync(join(vault, "wiki", "reading"))).toBe(false);
    expect(readFileSync(courseFile, "utf8")).toContain(
      "- [x] 讲后读 §1.1–1.4 核心页 · 2026-11-10 读（核心页已定：pp.1–5、7–12，跳过 6）（用户自报，未检查，2026-11-10）",
    );
    expect(statSync(join(vault, "wiki", "courses.md")).isFile()).toBe(true);
  });
});
