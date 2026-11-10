// @vitest-environment node
// Exercises the data channel end to end by pointing XUEGEN_HOME at a temporary
// wiki.json and vault, then invoking the same handler the IPC layer calls.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleDataRequest } from "./handler.js";

function touch(file: string, text: string): void {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, text, "utf8");
}

/** Today as `YYYY-MM-DD` in the local zone, matching the script's own default. */
function localDate(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

describe("handleDataRequest", () => {
  let home: string;
  let vault: string;
  const originalHome = process.env.XUEGEN_HOME;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "xuegen-data-home-"));
    vault = mkdtempSync(join(tmpdir(), "xuegen-data-vault-"));
    process.env.XUEGEN_HOME = home;
    mkdirSync(join(vault, "wiki"), { recursive: true });
    writeFileSync(join(home, "wiki.json"), JSON.stringify({ root: vault }), "utf8");

    // One course with a state marker, so courses.list has something to return.
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
        "## Learning Record",
        "",
        "### 2026-10-21-01",
        "",
        "- 记录。",
      ].join("\n"),
    );
  });

  afterEach(() => {
    process.env.XUEGEN_HOME = originalHome;
    rmSync(home, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  });

  it("courses.list returns the parsed course", async () => {
    const result = await handleDataRequest({ kind: "courses.list" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { slug: string; title: string }[];
      expect(data).toHaveLength(1);
      expect(data[0]?.slug).toBe("demo");
      expect(data[0]?.title).toBe("Demo");
    }
  });

  it("calendar.month aggregates the course record", async () => {
    const result = await handleDataRequest({ kind: "calendar.month", month: "2026-10" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { days: Record<string, { records: unknown[] }> };
      expect(data.days["2026-10-21"]?.records).toHaveLength(1);
    }
  });

  it("calendar.write then calendar.month round-trips the note", async () => {
    const write = await handleDataRequest({ kind: "calendar.write", date: "2026-10-22", text: "记一笔" });
    expect(write.ok).toBe(true);
    const month = await handleDataRequest({ kind: "calendar.month", month: "2026-10" });
    if (month.ok) {
      const data = month.data as { days: Record<string, { note: string | null }> };
      expect(data.days["2026-10-22"]?.note).toBe("记一笔");
    }
  });

  it("cycle.day and cycle.month read the cycle page", async () => {
    touch(
      join(vault, "wiki", "cycles", "c1.md"),
      [
        "---",
        "cycle: C1",
        "start: 2026-11-06",
        "end: 2026-12-24",
        "---",
        "",
        "## Weekly Template",
        "",
        "| 星期 | 类型 | 课程 |",
        "|---|---|---|",
        "| 周一 | 深度 | [[subjects/demo\\|Demo]] |",
        "| 周二 | 深度 | [[subjects/demo\\|Demo]] |",
        "| 周三 | 深度 | [[subjects/demo\\|Demo]] |",
        "| 周四 | 深度 | [[subjects/demo\\|Demo]] |",
        "| 周五 | 整合 | — |",
        "| 周六 | 低强度 | — |",
        "| 周日 | 休息 | — |",
        "",
      ].join("\n"),
    );
    touch(join(vault, "wiki", "subjects", "demo.md"), ["# Demo 科目", "", "## Courses", "- [[courses/demo]] - Demo", ""].join("\n"));
    const day = await handleDataRequest({ kind: "cycle.day", date: "2026-11-09" });
    expect(day.ok).toBe(true);
    if (day.ok) {
      expect(day.data).toMatchObject({ cycle: "C1", week: 1, type: "深度", subject: "demo", course: null, lessons: [], overdue: [] });
    }
    const month = await handleDataRequest({ kind: "cycle.month", month: "2026-11" });
    expect(month.ok).toBe(true);
    if (month.ok) {
      const data = month.data as { days: Record<string, { type: string }> };
      expect(data.days["2026-11-06"]?.type).toBe("整合");
      expect(data.days["2026-11-05"]).toBeUndefined();
    }
    const overview = await handleDataRequest({ kind: "cycle.overview", date: "2026-11-09" });
    expect(overview.ok).toBe(true);
    if (overview.ok) expect(overview.data).toMatchObject({ route: null, cycle: { cycle: "C1" } });
  });

  it("subjects.list reads the subject pages", async () => {
    touch(
      join(vault, "wiki", "subjects", "demo-subject.md"),
      [
        "---",
        "layer: A 数学与理论基础",
        "route: 路线外",
        "---",
        "",
        "# 演示科目",
        "",
        "## Materials",
        "",
        "### 书籍",
        "- ◌ 未制定计划 · 拓展 · [[2026-11-05-demo|演示书]]",
        "",
        "## Courses",
        "- [[courses/demo]] - Demo",
        "",
      ].join("\n"),
    );
    const result = await handleDataRequest({ kind: "subjects.list", date: "2026-11-09" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        date: "2026-11-09",
        cycle: null,
        subjects: [{ slug: "demo-subject", title: "演示科目", main: false, courses: ["demo"], materials: [{ title: "演示书", mark: "none" }] }],
      });
    }
  });

  it("cards.add then cards.stats reports the new unsynced card", async () => {
    const add = await handleDataRequest({ kind: "cards.add", deck: "Demo", front: "问题？", back: "答案" });
    expect(add.ok).toBe(true);
    const stats = await handleDataRequest({ kind: "cards.stats" });
    if (stats.ok) {
      const data = stats.data as { total: number; unsynced: number };
      expect(data.total).toBe(1);
      expect(data.unsynced).toBe(1);
    }
  });

  it("course.afterRead rejects when the label matches no unchecked line", async () => {
    const result = await handleDataRequest({
      kind: "course.afterRead",
      slug: "demo",
      label: "§9.9 不存在",
      date: "2026-10-22",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("script-failed");
      expect(result.error).toContain("没有找到未打勾的讲后读");
    }
  });

  it("course.afterRead checks the line, notes the reading page, rebuilds the boards", async () => {
    // The demo course gains a 讲后读 row and a reading link; the reading page
    // needs the full frontmatter FIELD_ORDER for `note` to rewrite it.
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
      "- [ ] 讲后读 §1.1–1.4 核心页 · 2026-10-22 读",
      "",
      "## Next Session",
      "",
      "读 [[reading/epp|离散数学（Epp, 5th ed）]] §2.1。",
      "",
      "## Learning Record",
      "",
      "### 2026-10-21-01",
      "",
      "- 记录。",
      "",
    ].join("\n");
    writeFileSync(courseFile, text, "utf8");
    touch(
      join(vault, "wiki", "reading", "epp.md"),
      [
        "---",
        'source: "[[raw/epp]]"',
        "priority: medium",
        "status: active",
        "due: 2026-10-22",
        "interval_days: 2",
        'last_read: ""',
        'position: ""',
        "---",
        "",
        "# 离散数学（Epp, 5th ed）",
        "",
        "## Reading Log",
        "",
      ].join("\n"),
    );

    const result = await handleDataRequest({
      kind: "course.afterRead",
      slug: "demo",
      label: "§1.1–1.4 核心页",
      date: "2026-10-22",
    });
    expect(result).toEqual({ ok: true, data: { label: "§1.1–1.4 核心页", reading: "epp", book: null } });
    const course = readFileSync(courseFile, "utf8");
    expect(course).toContain("- [x] 讲后读 §1.1–1.4 核心页 · 2026-10-22 读（用户自报，未检查，2026-10-22）");
    const page = readFileSync(join(vault, "wiki", "reading", "epp.md"), "utf8");
    expect(page).toContain("- 2026-10-22: 讲后读 §1.1–1.4 核心页 已读（用户自报）");
    expect(statSync(join(vault, "wiki", "_generated", "courses.md")).isFile()).toBe(true);
    expect(statSync(join(vault, "wiki", "_generated", "courses.html")).isFile()).toBe(true);
  });

  it("reading.add passes the chosen priority and due through to the queue", async () => {
    touch(join(vault, "raw", "paper.md"), "# 论文\n\n正文。\n");
    const add = await handleDataRequest({
      kind: "reading.add",
      source: "raw/paper.md",
      priority: "low",
      due: "today",
    });
    expect(add.ok).toBe(true);
    if (add.ok) {
      expect((add.data as { priority: string }).priority).toBe("low");
      const due = (add.data as { due: string }).due;
      // 「今天就读」 forces today's date even for a low-priority item.
      expect(due).toBe(localDate());
    }
    const queue = await handleDataRequest({ kind: "reading.queue" });
    if (queue.ok) {
      const data = queue.data as { slug: string; priority: string }[];
      expect(data).toHaveLength(1);
      expect(data[0]?.priority).toBe("low");
    }
  });

  it("returns vault-missing when wiki.json is absent", async () => {
    rmSync(join(home, "wiki.json"));
    const result = await handleDataRequest({ kind: "courses.list" });
    expect(result).toEqual({
      ok: false,
      code: "vault-missing",
      error: expect.stringContaining("未配置知识库"),
    });
  });

  it("anki.status reports not running when Anki is unreachable", async () => {
    // Stub fetch to simulate a closed Anki: the real probe would otherwise hit a
    // developer's running AnkiConnect on 127.0.0.1:8765 and report running:true,
    // making this test depend on the host (it is meant to check the "unreachable"
    // path). Restored in the finally block.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error("ECONNREFUSED"));
    try {
      const result = await handleDataRequest({ kind: "anki.status" });
      expect(result).toEqual({ ok: true, data: { running: false } });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
