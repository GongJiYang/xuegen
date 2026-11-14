// @vitest-environment node
// Exercises the data channel end to end by pointing XUEGEN_HOME at a temporary
// wiki.json and vault, then invoking the same handler the IPC layer calls.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleDataRequest, withToday } from "./handler.js";

const hasJj = (() => {
  try {
    execFileSync("jj", ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
})();

describe("withToday", () => {
  it("appends --today for a pinned day", () => {
    expect(withToday(["stats", "/v", "--json"], "2026-11-12")).toEqual([
      "stats",
      "/v",
      "--json",
      "--today",
      "2026-11-12",
    ]);
  });

  it("leaves the args untouched when no day is given", () => {
    const args = ["stats", "/v", "--json"];
    expect(withToday(args, null)).toBe(args);
  });
});

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

  it("terms.list returns the concept links stored in course records", async () => {
    touch(
      join(vault, "wiki", "courses", "demo.md"),
      [
        "<!-- xuegen:course-state -->",
        "",
        "# Demo",
        "",
        "## Learning Record",
        "",
        "### 2026-10-21-01（收课：D1 · 第一章）",
        "",
        "完成：D1",
        "",
        "- 存库：新建 1 个概念页 [[knowledge/concepts/demo/010-alpha|甲页]]",
        "",
      ].join("\n"),
    );
    touch(
      join(vault, "wiki", "knowledge", "concepts", "demo", "010-alpha.md"),
      ["# 甲概念", "", "## Definition", "", "甲的定义。", ""].join("\n"),
    );
    const result = await handleDataRequest({ kind: "terms.list", since: "2026-10-01" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([
        {
          course: "demo",
          courseTitle: "Demo",
          date: "2026-10-21",
          lesson: "D1",
          terms: [
            {
              title: "甲页",
              path: join(vault, "wiki", "knowledge", "concepts", "demo", "010-alpha.md"),
              definition: "甲的定义",
              exists: true,
            },
          ],
        },
      ]);
    }
    // A later --since proves the flag reaches the script: the group is filtered out.
    const later = await handleDataRequest({ kind: "terms.list", since: "2026-11-01" });
    expect(later).toEqual({ ok: true, data: [] });
  });

  it("terms.list returns vault-missing when wiki.json is absent", async () => {
    rmSync(join(home, "wiki.json"));
    const result = await handleDataRequest({ kind: "terms.list" });
    expect(result).toEqual({
      ok: false,
      code: "vault-missing",
      error: expect.stringContaining("未配置知识库"),
    });
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

  it("cycle.accept and cycle.preview serve the 开周期 wizard data", async () => {
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
    touch(
      join(vault, "wiki", "cycles", "route.md"),
      [
        "---",
        "route: 测试路线",
        "start: 2026-11-06",
        "end: 2027-04-08",
        "buffer_weeks: 12",
        "---",
        "",
        "## Cycles",
        "",
        "| 周期 | 开始 | 结束 | 主项 | 辅助（下周期主项） | 状态 |",
        "|---|---|---|---|---|---|",
        "| [[cycles/c1\\|C1]] | 2026-11-06 | 2026-12-24 | 演示科目 | — | 进行中 |",
        "| C2 | 2026-12-25 | 2027-02-11 | 演示科目 | — | 未开始 |",
        "",
      ].join("\n"),
    );
    touch(
      join(vault, "wiki", "subjects", "demo.md"),
      ["# 演示科目", "", "## Courses", "", "- [[courses/demo\\|Demo]]", ""].join("\n"),
    );
    touch(
      join(vault, "wiki", "courses", "demo.md"),
      [
        "# Demo",
        "",
        "## Overall Goals",
        "",
        "- [ ] 最低：不查书写出真值表",
        "- [x] 没有级别的行",
        "",
        "## 计划表",
        "",
        "<!-- xuegen:schedule:start rest=sun days=mon reviews=anki end=2026-12-24 -->",
        "| 天 | 日期 | 内容 | 材料 | 完成条件 |",
        "|---|---|---|---|---|",
        "| D1 | 2026-11-09（周一） | 第 1 课 | — | — |",
        "| D2 | 2026-11-16（周一） | 第 2 课 | — | — |",
        "<!-- xuegen:schedule:end -->",
        "",
        "## Learning Record",
        "",
        "### 2026-11-09-01",
        "",
        "完成：D1",
        "",
      ].join("\n"),
    );

    const accept = await handleDataRequest({ kind: "cycle.accept", cycle: "C1" });
    expect(accept.ok).toBe(true);
    if (accept.ok) {
      expect(accept.data).toEqual({
        cycle: "C1",
        start: "2026-11-06",
        end: "2026-12-24",
        courses: [
          {
            slug: "demo",
            title: "Demo",
            subject: "demo",
            goals: [
              { level: "最低", text: "不查书写出真值表", done: false },
              { level: "", text: "没有级别的行", done: true },
            ],
            lessons: { done: 1, total: 2, remaining: ["D2"] },
          },
        ],
        next: { cycle: "C2", start: "2026-12-25", end: "2027-02-11", mains: ["demo"], status: "未开始" },
      });
    }

    const preview = await handleDataRequest({
      kind: "cycle.preview",
      from: "C1",
      start: "2026-12-25",
      main: ["algo"],
    });
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      const data = preview.data as { days: { date: string; subject: string | null }[] };
      expect(data.days).toHaveLength(7);
      expect(data.days[0]).toMatchObject({ date: "2026-12-25", type: "整合", subject: null });
      expect(data.days[3]).toMatchObject({ date: "2026-12-28", weekday: "周一", type: "深度", subject: "algo" });
    }

    const missing = await handleDataRequest({ kind: "cycle.accept", cycle: "C9" });
    expect(missing).toEqual({
      ok: false,
      code: "script-failed",
      error: expect.stringContaining("没有这个周期"),
    });
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

  it("reading.add resolves 「今天就读」 against XUEGEN_TODAY when it is set", async () => {
    touch(join(vault, "raw", "paper.md"), "# 论文\n\n正文。\n");
    const previous = process.env.XUEGEN_TODAY;
    process.env.XUEGEN_TODAY = "2026-11-12";
    try {
      const add = await handleDataRequest({
        kind: "reading.add",
        source: "raw/paper.md",
        priority: "low",
        due: "today",
      });
      expect(add.ok).toBe(true);
      if (add.ok) {
        // With the override the script receives `--today 2026-11-12`, so
        // `--due today` lands on the pinned day, not the real one.
        expect((add.data as { due: string }).due).toBe("2026-11-12");
      }
    } finally {
      if (previous === undefined) delete process.env.XUEGEN_TODAY;
      else process.env.XUEGEN_TODAY = previous;
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

  it("wiki.read returns vault-missing when wiki.json is absent", async () => {
    rmSync(join(home, "wiki.json"));
    const result = await handleDataRequest({
      kind: "wiki.read",
      path: join(vault, "wiki", "knowledge", "a.md"),
    });
    expect(result).toEqual({
      ok: false,
      code: "vault-missing",
      error: expect.stringContaining("未配置知识库"),
    });
  });

  it("plan.undoable and plan.undo return vault-missing when wiki.json is absent", async () => {
    rmSync(join(home, "wiki.json"));
    const missing = {
      ok: false,
      code: "vault-missing",
      error: expect.stringContaining("未配置知识库"),
    };
    expect(await handleDataRequest({ kind: "plan.undoable", since: "2026-11-14T16:00:00+08:00" })).toEqual(
      missing,
    );
    expect(await handleDataRequest({ kind: "plan.undo", since: "2026-11-14T16:00:00+08:00" })).toEqual(
      missing,
    );
  });

  it("plan.undoable passes the vault and --since through to plan-undo.mjs list", async () => {
    // The vault here is not a jj repo, so a valid --since reaches the script's
    // jj check; a malformed one fails earlier inside the script itself — both
    // prove the arguments arrive.
    const badSince = await handleDataRequest({ kind: "plan.undoable", since: "不是时间" });
    expect(badSince.ok).toBe(false);
    if (!badSince.ok) {
      expect(badSince.code).toBe("script-failed");
      expect(badSince.error).toContain("--since 不是合法的 ISO 时间：不是时间");
    }
    const notJj = await handleDataRequest({ kind: "plan.undoable", since: "2026-11-14T16:00:00+08:00" });
    expect(notJj.ok).toBe(false);
    if (!notJj.ok) expect(notJj.error).toContain("撤销需要库在 jj 下");
  });

  it("plan.undo passes --since and resolveWorkspace() as --workspace to the script", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "xuegen-data-ws-"));
    const previous = process.env.XUEGEN_DESKTOP_CWD;
    process.env.XUEGEN_DESKTOP_CWD = workspace;
    try {
      // A corrupt journal proves the workspace reached recoverInternal (the
      // script would otherwise read the real ~/learning workspace).
      mkdirSync(join(workspace, ".close"), { recursive: true });
      writeFileSync(join(workspace, ".close", "journal.json"), "{broken", "utf8");
      const journal = await handleDataRequest({ kind: "plan.undo", since: "2026-11-14T16:00:00+08:00" });
      expect(journal.ok).toBe(false);
      if (!journal.ok) expect(journal.error).toContain("收课提交日志损坏");
      rmSync(join(workspace, ".close"), { recursive: true });
      const badSince = await handleDataRequest({ kind: "plan.undo", since: "不是时间" });
      expect(badSince.ok).toBe(false);
      if (!badSince.ok) expect(badSince.error).toContain("--since 不是合法的 ISO 时间：不是时间");
      const notJj = await handleDataRequest({ kind: "plan.undo", since: "2026-11-14T16:00:00+08:00" });
      expect(notJj.ok).toBe(false);
      if (!notJj.ok) expect(notJj.error).toContain("撤销需要库在 jj 下");
    } finally {
      if (previous === undefined) delete process.env.XUEGEN_DESKTOP_CWD;
      else process.env.XUEGEN_DESKTOP_CWD = previous;
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it.runIf(hasJj)("plan.undoable/plan.undo run end to end on a jj vault", async () => {
    execFileSync("jj", ["git", "init"], { cwd: vault, stdio: "pipe" });
    const undoable = await handleDataRequest({ kind: "plan.undoable", since: "2026-11-14T16:00:00+08:00" });
    expect(undoable).toEqual({ ok: true, data: [] });
    const workspace = mkdtempSync(join(tmpdir(), "xuegen-data-ws-"));
    const previous = process.env.XUEGEN_DESKTOP_CWD;
    process.env.XUEGEN_DESKTOP_CWD = workspace;
    try {
      const undo = await handleDataRequest({ kind: "plan.undo", since: "2026-11-14T16:00:00+08:00" });
      expect(undo.ok).toBe(false);
      if (!undo.ok) expect(undo.error).toContain("这一轮没有提交过计划改动");
    } finally {
      if (previous === undefined) delete process.env.XUEGEN_DESKTOP_CWD;
      else process.env.XUEGEN_DESKTOP_CWD = previous;
      rmSync(workspace, { recursive: true, force: true });
    }
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
