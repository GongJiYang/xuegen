#!/usr/bin/env node
// course-state.mjs + render-board.mjs 的端到端补测（全量测试 B4）。
// 覆盖 lock/unlock、verify、dashboard、list --json、after-read 与 render-board 的一致性。
// 全部在 os.tmpdir() 下跑；需要真实库副本的用例先 cp -R 到临时目录，绝不写库副本本身。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat, chmod, utimes, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const STATE = join(HERE, "course-state.mjs");
const BOARD = join(HERE, "render-board.mjs");

/** 只读的库副本（在别的机器上不存在时，用到它的用例 skip）。 */
const VAULT_WIKI = "/tmp/xg-e2e/vault/GJY/wiki";
const VAULT_COURSES = join(VAULT_WIKI, "courses");
const NEED_VAULT = { skip: existsSync(VAULT_COURSES) ? false : `${VAULT_COURSES} 不存在（需要有库副本的机器）` };

const READONLY = 0o444;
const WRITABLE = 0o644;
const modeOf = async (target) => (await stat(target)).mode & 0o777;

/** 跑一个脚本；失败时拿到 stderr 与退出码，不抛。 */
async function cli(script, args) {
  try {
    const { stdout, stderr } = await run(process.execPath, [script, ...args]);
    return { ok: true, stdout, stderr, code: 0 };
  } catch (error) {
    return { ok: false, stdout: error.stdout ?? "", stderr: error.stderr ?? "", code: error.code };
  }
}

const state = (...args) => cli(STATE, args);

/** 一份最小但完整的课程状态页（七段齐、三处复选框、一条学习记录）。 */
const COURSE = `<!-- xuegen:course-state — 本文件由 AI 维护（只读锁 0444）。-->

# 测试课

## Overview

端到端测试用的样例课程。

## Key Facts

- 当前周：W1 · 测试周
- 课程 slug：demo

## Overall Goals

- [x] 里程碑一
- [ ] 里程碑二

## This Week

W1 · 测试周｜日期范围：未设定

- [ ] 本周活动（完成条件：能复述）

## Today

日期：2026-11-11

- [ ] 今日事（完成条件：能复述）

## Next Session

读测试教材 §1。

## 计划表（参考；勾选只出现在上方三个区域）

| 天 | 日期 | 内容 |
|---|---|---|
| D1 | 11-11 | 测试内容 |

## Learning Record

### 2026-11-10-01

- 记录。
`;

/** 建 <root>/wiki/courses 并写入课程页（默认 demo.md），返回各路径。 */
async function makeWiki(files = { "demo.md": COURSE }, prefix = "course-state-full-") {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const wikiDir = join(root, "wiki");
  const coursesDir = join(wikiDir, "courses");
  await mkdir(coursesDir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    await writeFile(join(coursesDir, name), text, "utf8");
  }
  return { root, wikiDir, coursesDir, dashDir: join(wikiDir, "_generated"), dash: join(wikiDir, "_generated", "courses.md") };
}

/** 复刻收课后的只读锁：目录 555、课程页与看板 444。 */
async function seal(coursesDir, ...files) {
  await chmod(coursesDir, 0o555);
  for (const name of await readdir(coursesDir)) {
    if (name.endsWith(".md")) await chmod(join(coursesDir, name), READONLY);
  }
  for (const file of files) if (existsSync(file)) await chmod(file, READONLY);
}

/** 临时目录里可能有 555/444，清理前先放开权限。 */
async function cleanup(root) {
  await run("chmod", ["-R", "u+w", root]).catch(() => {});
  await rm(root, { recursive: true, force: true });
}

// ---- 1. lock / unlock ----

test("lock：文件不存在时非零退出，同批前面的文件已被锁上（逐文件生效，不整体回滚）", async () => {
  const root = await mkdtemp(join(tmpdir(), "course-state-full-lock-"));
  try {
    const first = join(root, "a.md");
    const second = join(root, "b.md");
    await writeFile(first, "a\n", "utf8");
    await writeFile(second, "b\n", "utf8");
    const missing = join(root, "nope.md");

    const result = await state("lock", first, missing);
    assert.equal(result.ok, false, "文件不存在应以非零退出");
    assert.equal(result.code, 1);
    // 实际：直接抛 Node 的 ENOENT 栈（不是 course-state: 前缀的友好报错）。
    assert.match(result.stderr, /ENOENT/);
    assert.equal(await modeOf(first), READONLY, "排在前面、已存在的文件仍被锁上");
    assert.equal(await modeOf(second), WRITABLE, "这一批里没点名的文件不动");
  } finally {
    await cleanup(root);
  }
});

test("lock / unlock：目录参数用 555 / 755（目录可写时只读文件仍能被删）", async () => {
  const root = await mkdtemp(join(tmpdir(), "course-state-full-dir-"));
  try {
    const dir = join(root, "courses");
    await mkdir(dir);
    const locked = await state("lock", dir);
    assert.equal(locked.ok, true, locked.stderr);
    assert.equal(await modeOf(dir), 0o555);
    const unlocked = await state("unlock", dir);
    assert.equal(unlocked.ok, true, unlocked.stderr);
    assert.equal(await modeOf(dir), 0o755);
  } finally {
    await cleanup(root);
  }
});

test("lock：已锁再锁是幂等的（仍 0 退出、权限仍 444、不再报错）", async () => {
  const root = await mkdtemp(join(tmpdir(), "course-state-full-twice-"));
  try {
    const file = join(root, "a.md");
    await writeFile(file, "a\n", "utf8");
    assert.equal((await state("lock", file)).ok, true);
    assert.equal(await modeOf(file), READONLY);
    const again = await state("lock", file);
    assert.equal(again.ok, true, again.stderr);
    assert.equal(await modeOf(file), READONLY);
  } finally {
    await cleanup(root);
  }
});

test("lock ↔ unlock：权限位在 0444 与 0644 之间往返，内容不动", async () => {
  const root = await mkdtemp(join(tmpdir(), "course-state-full-mode-"));
  try {
    const file = join(root, "a.md");
    await writeFile(file, "原文\n", "utf8");
    assert.equal(await modeOf(file), WRITABLE, "初始应为 644");
    await state("lock", file);
    assert.equal(await modeOf(file), READONLY);
    // 只读状态下确实写不进去（不是仅少了 w 位以外的花样）。
    if (process.getuid?.() !== 0) {
      await assert.rejects(writeFile(file, "改\n", "utf8"), "0444 的课程页应写不进");
    }
    await state("unlock", file);
    assert.equal(await modeOf(file), WRITABLE);
    await writeFile(file, "改后\n", "utf8");
    assert.equal(await readFile(file, "utf8"), "改后\n");
  } finally {
    await cleanup(root);
  }
});

test("lock：多个文件一次处理，逐个输出权限、互不影响", async () => {
  const root = await mkdtemp(join(tmpdir(), "course-state-full-many-"));
  try {
    const files = ["a.md", "b.md", "c.md"].map((name) => join(root, name));
    for (const file of files) await writeFile(file, "x\n", "utf8");
    const locked = await state("lock", ...files);
    assert.equal(locked.ok, true, locked.stderr);
    assert.equal(locked.stdout.trim().split("\n").length, 3, "每个文件一行");
    for (const file of files) assert.equal(await modeOf(file), READONLY);
    const unlocked = await state("unlock", ...files);
    assert.equal(unlocked.ok, true, unlocked.stderr);
    for (const file of files) assert.equal(await modeOf(file), WRITABLE);
  } finally {
    await cleanup(root);
  }
});

// ---- 2. verify ----

test(
  "verify：库副本 courses 原样复制后逐门输出一行；锁齐与否决定通过还是只报权限问题",
  NEED_VAULT,
  async () => {
    const root = await mkdtemp(join(tmpdir(), "course-state-full-vault-verify-"));
    try {
      const coursesDir = join(root, "wiki", "courses");
      await mkdir(join(root, "wiki"), { recursive: true });
      // 只读复制：cp -R 保留 0444/0555；库副本本身只被读。
      await run("cp", ["-R", VAULT_COURSES, coursesDir]);
      const pages = (await readdir(coursesDir)).filter((name) => name.endsWith(".md"));
      const result = await state("verify", coursesDir);

      // 库副本可能被真机会话取到「刚解锁、还没上锁」的一瞬：不写死通过，只断言不变量。
      const sealed =
        (await modeOf(coursesDir)) === 0o555 &&
        (await Promise.all(pages.map((name) => modeOf(join(coursesDir, name))))).every((mode) => mode === READONLY);
      if (sealed) assert.equal(result.ok, true, `锁齐的副本应通过：${result.stderr}`);
      // 无论锁是否齐，标记、段落、当前周这些内容问题都不该出现。
      assert.doesNotMatch(result.stderr, /缺少 xuegen:course-state 标记|缺少段落|Key Facts 缺少/);
      const rows = result.stdout
        .trim()
        .split("\n")
        .filter((line) => /^[a-z0-9-]+: .*｜本周 \d+\/\d+｜总目标 \d+\/\d+｜/.test(line));
      assert.equal(rows.length, pages.length, "每门课输出一行摘要");
    } finally {
      await cleanup(root);
    }
  },
);

test(
  "verify：删掉某页的 xuegen:course-state 标记后应报缺标记（实际：该课被静默跳过）",
  async () => {
    const { root, coursesDir, dash } = await makeWiki({ "demo.md": COURSE, "other.md": COURSE.replace("测试课", "另一门课") });
    try {
      assert.equal((await state("dashboard", coursesDir, dash)).ok, true);
      // 手工把标记改写成旧写法（内容还在，只是标记名变了）。
      const target = join(coursesDir, "other.md");
      await chmod(target, WRITABLE);
      await writeFile(target, COURSE.replace("xuegen:course-state", "xuegen:course-state-OLD"), "utf8");
      await seal(coursesDir, dash);

      const result = await state("verify", coursesDir, dash);
      assert.equal(result.ok, false, "标记没了应该报出来");
      assert.match(result.stderr, /other\.md 缺少 xuegen:course-state 标记/);
    } finally {
      await cleanup(root);
    }
  },
);

test("verify：把某页改成可写（644）时报「人为可写」", async () => {
  const { root, coursesDir, dash } = await makeWiki({ "demo.md": COURSE, "other.md": COURSE });
  try {
    assert.equal((await state("dashboard", coursesDir, dash)).ok, true);
    await seal(coursesDir, dash);
    const target = join(coursesDir, "other.md");
    await chmod(target, WRITABLE);
    const result = await state("verify", coursesDir, dash);
    assert.equal(result.ok, false);
    assert.match(result.stderr, new RegExp(`${target} 权限为 644，应为 444（人为可写）`));
    assert.doesNotMatch(result.stderr, /看板/, "只动了权限，内容没变，不该报看板过期");
  } finally {
    await cleanup(root);
  }
});

test("verify：目录可写（755）时报「状态文件可被删除」", async () => {
  const { root, coursesDir, dash } = await makeWiki();
  try {
    assert.equal((await state("dashboard", coursesDir, dash)).ok, true);
    await seal(coursesDir, dash);
    await chmod(coursesDir, 0o755);
    const result = await state("verify", coursesDir, dash);
    assert.equal(result.ok, false);
    assert.match(result.stderr, /目录可写（755），状态文件可被删除；应为 555/);
  } finally {
    await cleanup(root);
  }
});

test("verify：看板按内容判过期——只把看板 mtime 改旧不报，课程页内容变了才报", async () => {
  const { root, coursesDir, dash } = await makeWiki();
  try {
    assert.equal((await state("dashboard", coursesDir, dash)).ok, true);
    await seal(coursesDir, dash);

    // (a) 看板文件比课程页旧（mtime 改成 2020）：内容一致，仍通过。
    const old = new Date("2020-01-01T00:00:00Z");
    await utimes(dash, old, old);
    const stale = await state("verify", coursesDir, dash);
    assert.equal(stale.ok, true, `只改 mtime 不该报过期：${stale.stderr}`);

    // (b) 课程页内容变了（收课打了勾但没重画看板）→ 报过期。
    const course = join(coursesDir, "demo.md");
    await chmod(coursesDir, 0o755);
    await chmod(course, WRITABLE);
    await writeFile(course, COURSE.replace("- [ ] 本周活动", "- [x] 本周活动"), "utf8");
    await seal(coursesDir, dash);
    const outdated = await state("verify", coursesDir, dash);
    assert.equal(outdated.ok, false);
    assert.match(outdated.stderr, /courses\.md 与状态源不一致（看板过期）/);
  } finally {
    await cleanup(root);
  }
});

test("verify：看板文件不存在时报「不存在」，缺段落与「当前周」也报", async () => {
  const broken = COURSE.replace("## Next Session", "## Next SessionGone").replace("- 当前周：", "- 当前周X：");
  const { root, coursesDir, dash } = await makeWiki({ "demo.md": broken });
  try {
    await seal(coursesDir);
    const result = await state("verify", coursesDir, dash);
    assert.equal(result.ok, false);
    assert.match(result.stderr, new RegExp(`${dash} 不存在`));
    assert.match(result.stderr, /缺少段落：Next Session/);
    assert.match(result.stderr, /Key Facts 缺少「- 当前周：」/);
    // 摘要里当前周显示为「当前周？」而不是崩掉。
    assert.match(result.stdout, /当前周？/);
  } finally {
    await cleanup(root);
  }
});

// ---- 3. dashboard ----

test("dashboard：输出到不存在的 wiki/_generated 时自动建目录，写出 444 看板", async () => {
  const { root, coursesDir, dashDir, dash } = await makeWiki({ "demo.md": COURSE, "other.md": COURSE });
  try {
    await seal(coursesDir);
    assert.equal(existsSync(dashDir), false, "起点：_generated 不存在");
    const result = await state("dashboard", coursesDir, dash);
    assert.equal(result.ok, true, result.stderr);
    assert.equal(existsSync(dashDir), true, "自动建了 _generated");
    assert.equal(await modeOf(dash), READONLY, "看板自己上锁 444");
    const text = await readFile(dash, "utf8");
    assert.match(text, /^<!-- xuegen:courses-dashboard/);
    assert.match(text, /共 2 门课程/);
    assert.match(text, /Last updated: \d{4}-\d{2}-\d{2}/);
  } finally {
    await cleanup(root);
  }
});

test("dashboard：连跑两次输出完全相同（幂等；第二次要先解开已存在的 444 看板）", async () => {
  const { root, coursesDir, dash } = await makeWiki({ "demo.md": COURSE, "other.md": COURSE });
  try {
    await seal(coursesDir);
    const first = await state("dashboard", coursesDir, dash);
    assert.equal(first.ok, true, first.stderr);
    const firstText = await readFile(dash, "utf8");
    const second = await state("dashboard", coursesDir, dash);
    assert.equal(second.ok, true, `重复写已锁定的看板不该失败：${second.stderr}`);
    assert.equal(await readFile(dash, "utf8"), firstText);
    assert.equal(first.stdout, second.stdout);
  } finally {
    await cleanup(root);
  }
});

// ---- 4. list --json ----

test(
  "list --json：库副本里每门课都有 slug、名字与进度数字；没排期的课也不崩",
  NEED_VAULT,
  async () => {
    const root = await mkdtemp(join(tmpdir(), "course-state-full-vault-list-"));
    try {
      const coursesDir = join(root, "wiki", "courses");
      await mkdir(join(root, "wiki"), { recursive: true });
      await run("cp", ["-R", VAULT_COURSES, coursesDir]);
      const result = await state("list", coursesDir, "--json");
      assert.equal(result.ok, true, result.stderr);
      const entries = JSON.parse(result.stdout);
      const pages = (await readdir(coursesDir)).filter((name) => name.endsWith(".md"));
      assert.equal(entries.length, pages.length, "每门课一条");
      for (const entry of entries) {
        assert.ok(entry.slug && typeof entry.slug === "string", `${entry.slug} 有 slug`);
        assert.ok(entry.title && entry.title.length > 0, `${entry.slug} 有名字`);
        assert.equal(typeof entry.week.done, "number");
        assert.equal(typeof entry.week.total, "number");
        assert.equal(typeof entry.overall.done, "number");
        assert.equal(typeof entry.overall.total, "number");
        assert.ok(entry.overall.done <= entry.overall.total, `${entry.slug} 已核实不超过总数`);
        assert.ok(entry.week.done <= entry.week.total, `${entry.slug} 本周已核实不超过总数`);
        assert.ok(entry.file.endsWith(`${entry.slug}.md`), `${entry.slug} 指向自己的文件`);
      }
      // 库副本里既有已排期的课，也有没排期（无 xuegen:schedule:start）的课：两种都被列出。
      const raw = await Promise.all(pages.map((name) => readFile(join(coursesDir, name), "utf8")));
      assert.ok(raw.some((text) => text.includes("xuegen:schedule:start")), "库副本里有已排期的课");
      assert.ok(raw.some((text) => !text.includes("xuegen:schedule:start")), "库副本里有未排期的课");
    } finally {
      await cleanup(root);
    }
  },
);

test("list --json：没有排期的课照常输出（weekLabel/日期为未设定，不崩）", async () => {
  const noPlan = COURSE.replace("W1 · 测试周｜日期范围：未设定", "W1 · 测试周");
  const { root, coursesDir } = await makeWiki({ "demo.md": noPlan, "sub-lesson.md": COURSE });
  try {
    const result = await state("list", coursesDir, "--json");
    assert.equal(result.ok, true, result.stderr);
    const entries = JSON.parse(result.stdout);
    assert.deepEqual(entries.map((entry) => entry.slug), ["demo", "sub-lesson"], "按文件名排序");
    const demo = entries[0];
    assert.equal(demo.weekLabel, "W1 · 测试周", "没有日期范围时取本周第一行正文");
    assert.deepEqual(demo.overall, { done: 1, total: 2 });
    assert.deepEqual(demo.week, {
      done: 0,
      total: 1,
      tasks: [{ label: "本周活动", done: false }],
    });
    assert.deepEqual(demo.lastRecord, { date: "2026-11-10", seq: "01" });
    assert.equal(typeof demo.changedAt, "number");

    // 非 --json 时一行一门；空目录输出「（无课程状态文件）」。
    const plain = await state("list", coursesDir);
    assert.equal(plain.ok, true);
    assert.equal(plain.stdout.trim().split("\n").length, 2);
    const empty = join(root, "empty");
    await mkdir(empty);
    assert.match((await state("list", empty)).stdout, /（无课程状态文件）/);
  } finally {
    await cleanup(root);
  }
});

// ---- 5. after-read ----

/** 课程页：Today 里一条带「核心页已定」与行尾 —— 备注的未打勾讲后读。 */
const READ_COURSE = `<!-- xuegen:course-state -->

# 离散数学学习计划

## Key Facts

- 当前周：W1

## Overall Goals

- [ ] 目标一

## This Week

W1

- [ ] 讲后读 §9.9 别处同名行 · 2026-11-20 读

## Today

日期：2026-11-11

- [ ] 讲后读 §1.1–1.4 核心页 · 2026-11-10 读（核心页已定：pp.22–23）——问过，用户没读，仍待读
- [ ] 继续 D2

## Next Session

读 [[reading/epp|Epp]] §2.1。

## Learning Record

### 2026-11-10-01

- 记录。
`;

test("after-read：标签不存在时中文报错、文件一字不改、权限仍 444", async () => {
  const { root, coursesDir } = await makeWiki({ "epp.md": READ_COURSE });
  const file = join(coursesDir, "epp.md");
  try {
    await seal(coursesDir);
    const result = await state("after-read", file, "§9.9 不存在", "--date", "2026-11-11");
    assert.equal(result.ok, false);
    assert.match(result.stderr, /^course-state: 没有找到未打勾的讲后读：§9\.9 不存在/);
    assert.equal(await readFile(file, "utf8"), READ_COURSE, "文件不变");
    assert.equal(await modeOf(file), READONLY, "权限恢复原样");
  } finally {
    await cleanup(root);
  }
});

test("after-read：同一标签打勾后再跑报错，不重复加尾注", async () => {
  const { root, coursesDir } = await makeWiki({ "epp.md": READ_COURSE });
  const file = join(coursesDir, "epp.md");
  try {
    await seal(coursesDir);
    const first = await state("after-read", file, "§1.1–1.4 核心页", "--date", "2026-11-11");
    assert.equal(first.ok, true, first.stderr);
    const out = JSON.parse(first.stdout.trim());
    assert.equal(out.pages, "22–23");
    assert.equal(out.reading, "epp");
    assert.equal(out.course, "epp");
    assert.equal(await modeOf(file), READONLY);

    const afterFirst = await readFile(file, "utf8");
    assert.equal((afterFirst.match(/（用户自报，未检查，2026-11-11）/g) ?? []).length, 1);
    assert.doesNotMatch(afterFirst, /仍待读/, "打勾时去掉旧的 —— 备注");

    const second = await state("after-read", file, "§1.1–1.4 核心页", "--date", "2026-11-11");
    assert.equal(second.ok, false);
    assert.match(second.stderr, /没有找到未打勾的讲后读：§1\.1–1\.4 核心页/);
    assert.equal(await readFile(file, "utf8"), afterFirst, "第二次失败不改文件");
    assert.equal((await readFile(file, "utf8")).match(/用户自报/g).length, 1, "尾注没被加第二次");
    assert.equal(await modeOf(file), READONLY);
  } finally {
    await cleanup(root);
  }
});

test("after-read：课程页只读（444）时跑完仍只读；可写（644）时保持 644（不主动上锁）", async () => {
  const { root, coursesDir } = await makeWiki({ "locked.md": READ_COURSE, "open.md": READ_COURSE });
  try {
    const locked = join(coursesDir, "locked.md");
    const open = join(coursesDir, "open.md");
    await chmod(locked, READONLY);
    await chmod(open, WRITABLE);

    assert.equal((await state("after-read", locked, "继续 D2")).ok, false, "不是讲后读行，不匹配");
    const okLocked = await state("after-read", locked, "§1.1–1.4 核心页", "--date", "2026-11-11");
    assert.equal(okLocked.ok, true, okLocked.stderr);
    assert.equal(await modeOf(locked), READONLY, "只读的跑完仍只读");

    const okOpen = await state("after-read", open, "§1.1–1.4 核心页", "--date", "2026-11-11");
    assert.equal(okOpen.ok, true, okOpen.stderr);
    assert.equal(await modeOf(open), WRITABLE, "原本可写的保持 644，after-read 不强制上锁");
  } finally {
    await cleanup(root);
  }
});

test("after-read：--date 非法时报错且不碰文件", async () => {
  const { root, coursesDir } = await makeWiki({ "epp.md": READ_COURSE });
  const file = join(coursesDir, "epp.md");
  try {
    await seal(coursesDir);
    const bad = await state("after-read", file, "§1.1–1.4 核心页", "--date", "2026-13");
    assert.equal(bad.ok, false);
    assert.match(bad.stderr, /--date 日期非法：2026-13/);
    assert.equal(await readFile(file, "utf8"), READ_COURSE);
    assert.equal(await modeOf(file), READONLY);
  } finally {
    await cleanup(root);
  }
});

// ---- 6. render-board.mjs 与 dashboard 的一致性 ----

test("render-board：读临时课程目录生成只读 HTML，导出 JSON 与 dashboard/list 的数字一致", async () => {
  const { root, coursesDir, dash } = await makeWiki({ "demo.md": COURSE, "demo2.md": COURSE });
  const html = join(root, "board.html");
  try {
    assert.equal((await state("dashboard", coursesDir, dash)).ok, true);
    await seal(coursesDir, dash);

    const result = await cli(BOARD, [coursesDir, html]);
    assert.equal(result.ok, true, result.stderr);
    const meta = JSON.parse(result.stdout);
    assert.equal(meta.verify, true, "锁齐、看板新鲜时应校验通过");
    assert.equal(await modeOf(html), READONLY, "看板 HTML 自己上锁 444");
    assert.equal(meta.path, html);
    assert.equal(meta.courses.length, 2);

    const listed = JSON.parse((await state("list", coursesDir, "--json")).stdout);
    const bySlug = new Map(listed.map((entry) => [entry.slug, entry]));
    for (const course of meta.courses) {
      const entry = bySlug.get(course.slug);
      assert.ok(entry, `${course.slug} 在 list 里也有`);
      assert.deepEqual(course.weekCount, { done: entry.week.done, total: entry.week.total }, `${course.slug} 本周计数一致`);
      assert.deepEqual(course.overall, { done: entry.overall.done, total: entry.overall.total }, `${course.slug} 总目标一致`);
      assert.equal(course.week, "W1 · 测试周", "看板的当前周取自 Key Facts「- 当前周：」");
    }

    const page = await readFile(html, "utf8");
    assert.match(page, /学根 · 课程看板/);
    assert.match(page, /校验通过/);
    assert.match(page, /<b>2<\/b><span>门课程<\/span>/);
    assert.ok(!/<form|<button|<input|<textarea|contenteditable/i.test(page), "不得含编辑入口");
    // 重新生成命令指向 wiki/_generated/courses.html。
    assert.ok(page.includes(join(dirname(coursesDir), "_generated", "courses.html")));
  } finally {
    await cleanup(root);
  }
});

test("render-board：校验不通过时 verify 为 false，HTML 里写「校验异常」并带上第一条原因", async () => {
  const { root, coursesDir, dash } = await makeWiki();
  const html = join(root, "board.html");
  try {
    assert.equal((await state("dashboard", coursesDir, dash)).ok, true);
    // 只把看板锁好，课程页留在 644 / 目录 755 —— 校验必失败。
    await chmod(dash, READONLY);
    const result = await cli(BOARD, [coursesDir, html]);
    assert.equal(result.ok, true, result.stderr);
    const meta = JSON.parse(result.stdout);
    assert.equal(meta.verify, false);
    const page = await readFile(html, "utf8");
    assert.match(page, /校验异常/);
    assert.match(page, /目录可写/);
  } finally {
    await cleanup(root);
  }
});

test(
  "render-board：库副本课程目录（锁定后）生成看板，verify 通过且每门课计数与 list 一致",
  NEED_VAULT,
  async () => {
    const root = await mkdtemp(join(tmpdir(), "course-state-full-vault-board-"));
    try {
      const coursesDir = join(root, "wiki", "courses");
      const dash = join(root, "wiki", "_generated", "courses.md");
      const html = join(root, "wiki", "_generated", "courses.html");
      await mkdir(join(root, "wiki"), { recursive: true });
      await run("cp", ["-R", VAULT_COURSES, coursesDir]);

      // 看板先由 dashboard 生成（自动建 _generated），再把课与看板一起锁上。
      const made = await state("dashboard", coursesDir, dash);
      assert.equal(made.ok, true, made.stderr);
      await seal(coursesDir, dash);

      const result = await cli(BOARD, [coursesDir, html]);
      assert.equal(result.ok, true, result.stderr);
      const meta = JSON.parse(result.stdout);
      assert.equal(meta.verify, true, "收课后的只读状态应与 dashboard 一致");

      const listed = JSON.parse((await state("list", coursesDir, "--json")).stdout);
      assert.equal(meta.courses.length, listed.length);
      for (const course of meta.courses) {
        const entry = listed.find((item) => item.slug === course.slug);
        assert.ok(entry, `${course.slug} 在 list 里也有`);
        assert.equal(course.weekCount.done, entry.week.done, `${course.slug} 本周 done 一致`);
        assert.equal(course.weekCount.total, entry.week.total, `${course.slug} 本周 total 一致`);
        assert.equal(course.overall.done, entry.overall.done, `${course.slug} 总目标 done 一致`);
        assert.equal(course.overall.total, entry.overall.total, `${course.slug} 总目标 total 一致`);
      }
      // 库副本本身没被这次测试改动。
      assert.deepEqual(
        (await readdir(VAULT_COURSES)).filter((name) => name.endsWith(".md")).sort(),
        (await readdir(coursesDir)).filter((name) => name.endsWith(".md")).sort(),
      );
    } finally {
      await cleanup(root);
    }
  },
);

test(
  "render-board 与 dashboard 计数一致（`* [ ]` 任务只被看板计入；缩进子任务两边一致）",
  async () => {
    const nested = COURSE.replace(
      "- [ ] 本周活动（完成条件：能复述）\n",
      "- [ ] 本周活动（完成条件：能复述）\n  - [ ] 缩进子任务\n* [ ] 星号任务\n",
    );
    const { root, coursesDir, dash } = await makeWiki({ "demo.md": nested });
    const html = join(root, "board.html");
    try {
      assert.equal((await state("dashboard", coursesDir, dash)).ok, true);
      await seal(coursesDir, dash);
      const meta = JSON.parse((await cli(BOARD, [coursesDir, html])).stdout);
      const listed = JSON.parse((await state("list", coursesDir, "--json")).stdout)[0];
      assert.deepEqual(
        meta.courses[0].weekCount,
        { done: listed.week.done, total: listed.week.total },
        `看板数 ${JSON.stringify(meta.courses[0].weekCount)}，dashboard 数 ${JSON.stringify(listed.week)}`,
      );
    } finally {
      await cleanup(root);
    }
  },
);

test(
  "render-board 与 dashboard 计数一致（段标题带括号说明时 dashboard 数不出任务）",
  async () => {
    const annotated = COURSE.replace("## This Week\n", "## This Week（W1 · 测试周）\n").replace("## Today\n", "## Today（2026-11-11）\n");
    const { root, coursesDir, dash } = await makeWiki({ "demo.md": annotated });
    const html = join(root, "board.html");
    try {
      assert.equal((await state("dashboard", coursesDir, dash)).ok, true);
      await seal(coursesDir, dash);
      const meta = JSON.parse((await cli(BOARD, [coursesDir, html])).stdout);
      const listed = JSON.parse((await state("list", coursesDir, "--json")).stdout)[0];
      assert.deepEqual(
        meta.courses[0].weekCount,
        { done: listed.week.done, total: listed.week.total },
        `看板数 ${JSON.stringify(meta.courses[0].weekCount)}，dashboard 数 ${JSON.stringify(listed.week)}`,
      );
    } finally {
      await cleanup(root);
    }
  },
);
