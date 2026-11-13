// @vitest-environment node
// Shelf requests end to end: a temporary XUEGEN_HOME + vault, then the real
// handler, which runs skills/reading/bookshelf.mjs against that vault.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ShelfListItem } from "../../shared/data-protocol.js";
import { handleDataRequest } from "./handler.js";

/** Write `text` to `file`, creating parent directories. */
function touch(file: string, text: string): void {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, text, "utf8");
}

/** Book frontmatter lines; `order`/`started` are omitted when empty. */
function bookPage(
  fields: {
    order?: string;
    status: string;
    title: string;
    short: string;
    started: string;
    position: number;
  },
  body: string,
): string {
  const lines = ["---", "kind: book", "slot: planned"];
  if (fields.order !== undefined) lines.push(`order: ${fields.order}`);
  lines.push(
    `status: ${fields.status}`,
    `title: ${JSON.stringify(fields.title)}`,
    `short: ${JSON.stringify(fields.short)}`,
    `started: ${fields.started === "" ? '""' : fields.started}`,
    `position: ${fields.position}`,
    "---",
    "",
  );
  return `${lines.join("\n")}${body}`;
}

describe("shelf data requests", () => {
  let home: string;
  let vault: string;
  const originalHome = process.env.XUEGEN_HOME;
  const shelfDir = (): string => join(vault, "wiki", "shelf");

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "xuegen-shelf-home-"));
    vault = mkdtempSync(join(tmpdir(), "xuegen-shelf-vault-"));
    process.env.XUEGEN_HOME = home;
    mkdirSync(join(vault, "wiki"), { recursive: true });
    writeFileSync(join(home, "wiki.json"), JSON.stringify({ root: vault }), "utf8");
  });

  afterEach(() => {
    process.env.XUEGEN_HOME = originalHome;
    rmSync(home, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  });

  it("shelf.today returns the planned book with its next chunk", async () => {
    touch(
      join(shelfDir(), "epp.md"),
      bookPage(
        {
          order: "1",
          status: "reading",
          title: "Discrete Mathematics with Applications",
          short: "Epp",
          started: "2026-11-09",
          position: 0,
        },
        [
          "# Discrete Mathematics with Applications",
          "",
          "## 分段",
          "1. Ch1 pp.1–36",
          "",
          "## 读书记录",
          "",
        ].join("\n"),
      ),
    );
    const result = await handleDataRequest({ kind: "shelf.today", today: "2026-11-10" });
    expect(result).toEqual({
      ok: true,
      data: {
        planned: {
          slug: "epp",
          title: "Discrete Mathematics with Applications",
          short: "Epp",
          slot: "planned",
          total: 4,
          position: 0,
          chunk: { index: 1, title: "Ch1", from: 1, to: 9 },
          coreOverlap: null,
          doneToday: false,
          doneChunk: null,
          resumedToday: false,
          plannedEnd: "2026-11-12",
          end: "2026-11-13",
          late: 1,
          target: null,
          targetLate: null,
        },
        free: null,
      },
    });
  });

  it("shelf.today reports both slots empty for an empty shelf", async () => {
    const result = await handleDataRequest({ kind: "shelf.today", today: "2026-11-10" });
    expect(result).toEqual({ ok: true, data: { planned: null, free: null } });
  });

  it("shelf.list returns every book with its status", async () => {
    touch(
      join(shelfDir(), "epp.md"),
      bookPage(
        { order: "1", status: "reading", title: "Epp", short: "Epp", started: "2026-11-09", position: 0 },
        ["# Epp", "", "## 分段", "1. Ch1 pp.1–10", ""].join("\n"),
      ),
    );
    const result = await handleDataRequest({ kind: "shelf.list" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject([
        {
          slug: "epp",
          title: "Epp",
          short: "Epp",
          slot: "planned",
          order: 1,
          status: "reading",
          total: 1,
          position: 0,
          started: "2026-11-09",
        },
      ]);
    }
  });

  it("shelf.list with from/to adds per-day schedule rows; without them there is no schedule key", async () => {
    touch(
      join(shelfDir(), "epp.md"),
      bookPage(
        { order: "1", status: "reading", title: "Epp", short: "Epp", started: "2026-11-09", position: 1 },
        [
          "# Epp",
          "",
          "## 分段",
          "1. Ch1 pp.1–36",
          "",
          "## 读书记录",
          "- 2026-11-09: 第 1 段 pp.1–9 读完（用户自报）",
          "",
        ].join("\n"),
      ),
    );
    const originalToday = process.env.XUEGEN_TODAY;
    process.env.XUEGEN_TODAY = "2026-11-12";
    try {
      // 11-12 是今天：11-10、11-11 是过去没读的原定日子（`missed`），
      // 第 2 段顺延到今天 11-12 再出现一行，所以同一段有两天。
      const ranged = await handleDataRequest({ kind: "shelf.list", from: "2026-11-09", to: "2026-11-12" });
      expect(ranged.ok).toBe(true);
      if (ranged.ok) {
        const items = ranged.data as ShelfListItem[];
        expect(items[0]?.schedule).toEqual([
          { index: 1, date: "2026-11-09", title: "Ch1", from: 1, to: 9, done: true },
          { index: 2, date: "2026-11-10", title: "Ch1", from: 10, to: 18, done: false, missed: true },
          { index: 3, date: "2026-11-11", title: "Ch1", from: 19, to: 27, done: false, missed: true },
          { index: 2, date: "2026-11-12", title: "Ch1", from: 10, to: 18, done: false },
        ]);
      }
      const plain = await handleDataRequest({ kind: "shelf.list" });
      expect(plain.ok).toBe(true);
      if (plain.ok) {
        const items = plain.data as ShelfListItem[];
        expect(items[0] !== undefined && "schedule" in items[0]).toBe(false);
      }
    } finally {
      // `process.env.X = undefined` stores the literal string "undefined"; delete instead.
      if (originalToday === undefined) delete process.env.XUEGEN_TODAY;
      else process.env.XUEGEN_TODAY = originalToday;
    }
  });

  it("shelf.done advances the position and starts the next queued book", async () => {
    touch(
      join(shelfDir(), "epp.md"),
      bookPage(
        { order: "1", status: "reading", title: "Epp", short: "Epp", started: "2026-11-09", position: 0 },
        ["# Epp", "", "## 分段", "1. Ch1 pp.1–10", "", "## 读书记录", ""].join("\n"),
      ),
    );
    touch(
      join(shelfDir(), "next-book.md"),
      bookPage(
        { order: "2", status: "queued", title: "Next", short: "Next", started: "", position: 0 },
        ["# Next", "", "## 分段", "1. Ch1 pp.1–10", ""].join("\n"),
      ),
    );

    const result = await handleDataRequest({ kind: "shelf.done", slug: "epp", today: "2026-11-10" });
    expect(result).toEqual({
      ok: true,
      data: { slug: "epp", position: 1, total: 1, finished: true, next: "next-book" },
    });
    expect(readFileSync(join(shelfDir(), "epp.md"), "utf8")).toContain(
      "- 2026-11-10: 第 1 段 pp.1–10 读完（用户自报）",
    );
    const next = readFileSync(join(shelfDir(), "next-book.md"), "utf8");
    expect(next).toContain("status: reading");
    expect(next).toContain("started: 2026-11-11");
    expect(next).toContain("| 1 | 2026-11-11 | Ch1 pp.1–10 |");
    expect(statSync(join(shelfDir(), "index.md")).isFile()).toBe(true);
  });

  it("shelf.extract appends a #待做卡 line and reports its index", async () => {
    touch(
      join(shelfDir(), "epp.md"),
      bookPage(
        { order: "1", status: "reading", title: "Epp", short: "Epp", started: "2026-11-09", position: 0 },
        ["# Epp", "", "## 分段", "1. Ch1 pp.1–10", "", "## 读书记录", ""].join("\n"),
      ),
    );
    const first = await handleDataRequest({
      kind: "shelf.extract",
      slug: "epp",
      page: 5,
      text: "逆否命题与原命题等价。",
      today: "2026-11-10",
    });
    expect(first).toEqual({
      ok: true,
      data: { slug: "epp", index: 1, page: 5, text: "逆否命题与原命题等价。" },
    });
    const second = await handleDataRequest({
      kind: "shelf.extract",
      slug: "epp",
      page: 11,
      text: "条件命题\n只在 p 真 q 假时为假。",
      today: "2026-11-10",
    });
    expect(second).toEqual({
      ok: true,
      data: { slug: "epp", index: 2, page: 11, text: "条件命题 只在 p 真 q 假时为假。" },
    });
    const page = readFileSync(join(shelfDir(), "epp.md"), "utf8");
    expect(page).toContain("- p.5: 逆否命题与原命题等价。 #待做卡");
    expect(page).toContain("- p.11: 条件命题 只在 p 真 q 假时为假。 #待做卡");
    // 新节插在 `## 读书记录` 之前
    expect(page.indexOf("## 摘录")).toBeLessThan(page.indexOf("## 读书记录"));
  });

  it("shelf.card marks an extract as a card and skips the second run", async () => {
    touch(
      join(shelfDir(), "epp.md"),
      bookPage(
        { order: "1", status: "reading", title: "Epp", short: "Epp", started: "2026-11-09", position: 0 },
        ["# Epp", "", "## 分段", "1. Ch1 pp.1–10", "", "## 读书记录", ""].join("\n"),
      ),
    );
    await handleDataRequest({
      kind: "shelf.extract",
      slug: "epp",
      page: 5,
      text: "甲",
      today: "2026-11-10",
    });
    await handleDataRequest({
      kind: "shelf.extract",
      slug: "epp",
      page: 7,
      text: "乙",
      today: "2026-11-10",
    });

    const marked = await handleDataRequest({ kind: "shelf.card", slug: "epp", indexes: [1], today: "2026-11-10" });
    expect(marked).toEqual({ ok: true, data: { slug: "epp", marked: [1], skipped: [] } });
    const again = await handleDataRequest({ kind: "shelf.card", slug: "epp", indexes: [1], today: "2026-11-11" });
    expect(again).toEqual({ ok: true, data: { slug: "epp", marked: [], skipped: [1] } });

    const page = readFileSync(join(shelfDir(), "epp.md"), "utf8");
    expect(page).toContain("- p.5: 甲 #卡/2026-11-10");
    expect(page).toContain("- p.7: 乙 #待做卡");
  });

  it("shelf.extract and shelf.card report a script failure on bad input", async () => {
    touch(
      join(shelfDir(), "epp.md"),
      bookPage(
        { order: "1", status: "reading", title: "Epp", short: "Epp", started: "2026-11-09", position: 0 },
        ["# Epp", "", "## 分段", "1. Ch1 pp.1–10", ""].join("\n"),
      ),
    );
    const extract = await handleDataRequest({
      kind: "shelf.extract",
      slug: "epp",
      page: 0,
      text: "句子",
      today: "2026-11-10",
    });
    expect(extract.ok).toBe(false);
    if (!extract.ok) expect(extract.error).toContain("--page 非法");
    // No `## 摘录` yet, so any index is out of range.
    const card = await handleDataRequest({ kind: "shelf.card", slug: "epp", indexes: [1], today: "2026-11-10" });
    expect(card.ok).toBe(false);
    if (!card.ok) expect(card.error).toContain("--index 非法");
  });

  it("shelf.done reports a script failure for a book that is not being read", async () => {
    touch(
      join(shelfDir(), "queued-book.md"),
      bookPage(
        { order: "1", status: "queued", title: "Queued", short: "Queued", started: "", position: 0 },
        ["# Queued", "", "## 分段", "1. Ch1 pp.1–10", ""].join("\n"),
      ),
    );
    const result = await handleDataRequest({ kind: "shelf.done", slug: "queued-book", today: "2026-11-10" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("script-failed");
      expect(result.error).toContain("只有在读的书可以记读完");
    }
  });

  it("shelf.done rejects an unknown book", async () => {
    const result = await handleDataRequest({ kind: "shelf.done", slug: "missing", today: "2026-11-10" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("script-failed");
      expect(result.error).toContain("书页不存在");
    }
  });
});
