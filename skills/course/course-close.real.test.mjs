#!/usr/bin/env node
// 真实库副本冒烟（全量测试 B3）：用 /tmp/xg-e2e/vault/GJY 的 wiki/ 副本跑收课与计划事务，
// 确认真实课程页原样能收、最小真实收课能提交、计划暂存能提交、undo 能回到收课前、
// 200 行上限会不会卡住真实页面。只从副本读；每个用例先把副本的 wiki/ 复制进 mkdtemp
//（raw/ 723MB、.git/.jj 都不参与，用例只用得到 wiki/），
// 绝不写 /tmp/xg-e2e/vault/GJY 本身（复制后按 prepare.sh 的做法把课程页设回只读）。
// 副本不存在（别的机器）时全部 skip 并说明。
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { addDays, completedIds, formatDays, formatRest, readSchedule, weekday } from "./course-schedule.mjs";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "course-close.mjs");

/** 只读库副本（在别的机器上不存在时全部 skip）。本文件只从这里读，绝不写。 */
const SRC = "/tmp/xg-e2e/vault/GJY";
const SRC_COURSES = join(SRC, "wiki", "courses");
const SKIP = existsSync(SRC_COURSES) ? false : `${SRC} 不存在（需要有库副本的机器）`;

/** 与 close/durable.mjs 的 localDate 同形（提交名里的日期）。 */
function localDate() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${`-${pad(now.getMonth() + 1)}`}-${pad(now.getDate())}`;
}

// ---- 副本夹具 ----

/** 按原样复制一棵子树（APFS 用 -c 克隆，省盘也快；不支持时退回普通 -R）。
 *  只复制 wiki/：收课用的是 wiki/courses、wiki/subjects、wiki/_generated 与 wiki/log.md。 */
function copyTree(src, dst) {
  try {
    execFileSync("cp", ["-Rc", src, dst], { stdio: "pipe" });
  } catch {
    execFileSync("cp", ["-R", src, dst], { stdio: "pipe" });
  }
}

/** 照 prepare.sh 的做法恢复只读状态：wiki/courses 与课程页按源库的权限位，子目录同样。 */
function restoreModes(srcDir, dstDir) {
  chmodSync(dstDir, statSync(srcDir).mode & 0o777);
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const from = join(srcDir, entry.name);
    const to = join(dstDir, entry.name);
    if (entry.isDirectory()) restoreModes(from, to);
    else if (entry.isFile()) chmodSync(to, statSync(from).mode & 0o777);
  }
}

/** 临时 jj 配置（照 course-close.test.mjs 的 initJj）。 */
function initJj(vault, root) {
  const config = join(root, "jj-config.toml");
  writeFileSync(config, 'user.name = "收课测试"\nuser.email = "test@example.com"\n');
  const env = { JJ_CONFIG: config };
  const call = (args) =>
    execFileSync("jj", args, { cwd: vault, encoding: "utf8", env: { ...process.env, ...env }, stdio: "pipe" });
  call(["git", "init"]);
  call(["commit", "-m", "基线"]);
  return env;
}

/** 库的 wiki/ 副本 + 临时工作区；jj 为真时在副本里 jj git init（不带源库的 .jj/.git）。*/
async function cloneVault({ jj = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "course-close-real-"));
  const vault = join(root, "vault");
  const ws = join(root, "ws");
  await mkdir(ws, { recursive: true });
  await mkdir(vault, { recursive: true });
  copyTree(join(SRC, "wiki"), join(vault, "wiki"));
  execFileSync("chmod", ["-R", "u+w", vault], { stdio: "pipe" });
  restoreModes(SRC_COURSES, join(vault, "wiki", "courses"));
  const env = jj ? initJj(vault, root) : {};
  return { root, vault, ws, env };
}

async function cleanup(fixture) {
  // 只读锁会挡住 rm -r 的部分实现，先尽量放开。
  try {
    execFileSync("chmod", ["-R", "u+rwX", fixture.root], { stdio: "pipe" });
  } catch {
    /* 已经没了 */
  }
  await rm(fixture.root, { recursive: true, force: true });
}

// ---- CLI / jj ----

async function cli(fixture, args) {
  const { stdout, stderr } = await run(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...fixture.env },
  });
  return { code: 0, stdout, stderr };
}

async function cliJson(fixture, args) {
  const { stdout } = await cli(fixture, [...args, "--json"]);
  return JSON.parse(stdout);
}

/** check 不通过时退出码 1，但 --json 的正文仍要读：失败也解析 stdout。 */
async function cliJsonAny(fixture, args) {
  try {
    return await cliJson(fixture, args);
  } catch (error) {
    const stdout = String(error.stdout ?? "");
    assert.notEqual(stdout.trim(), "", `命令失败且没有 JSON 输出：${args.join(" ")}\n${error.stderr ?? ""}`);
    return JSON.parse(stdout);
  }
}

function jj(fixture, args) {
  return execFileSync("jj", args, {
    cwd: fixture.vault,
    encoding: "utf8",
    env: { ...process.env, ...fixture.env },
  }).trim();
}

const mode = async (path) => (await stat(path)).mode & 0o777;

// ---- 课程页 ----

/** 源库里的课程页名（只读）。 */
function courseFiles() {
  return readdirSync(SRC_COURSES)
    .filter((name) => name.endsWith(".md"))
    .sort();
}

/** 带排期标记的课程页（这些才收得了课）。 */
function scheduledFiles() {
  return courseFiles().filter((name) => /xuegen:schedule:start/.test(readFileSync(join(SRC_COURSES, name), "utf8")));
}

const slugOf = (name) => name.replace(/\.md$/, "");
const pageRel = (slug) => `wiki/courses/${slug}.md`;

/** 排期表与「完成：」里的课次：给出第一个还没完成的 D 号。 */
function scheduleFacts(text) {
  const schedule = readSchedule(text);
  const done = completedIds(text);
  const firstUndone = schedule ? schedule.rows.find((row) => /^D\d+$/.test(row.id) && !done.has(row.id)) : undefined;
  return { schedule, done, firstUndone };
}

/** 当天第几条记录（标题序号不许复用）。 */
function nextSeq(text, date) {
  const used = [...text.matchAll(new RegExp(`^###\\s+${date}-(\\d+)`, "gm"))].map((match) => Number(match[1]));
  return String((used.length === 0 ? 0 : Math.max(...used)) + 1).padStart(2, "0");
}

/** 在 `## Learning Record` 末尾追加一条照 references/record.md 写的记录。 */
function addRecord(text, { id, date, seq }) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^##\s+Learning Record\s*$/.test(line));
  assert.notEqual(start, -1, "真实课程页里没有 ## Learning Record");
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const head = lines.slice(0, end);
  while (head.length > 0 && head[head.length - 1].trim() === "") head.pop();
  const record = [
    "",
    `### ${date}-${seq}（收课：${id}）`,
    "",
    `完成：${id}`,
    "",
    `- 课次：${id}，真实课程页冒烟测试（不是真实学习记录）。`,
    "- 已通过的检验：无（测试不判题）。",
    "- 未验证：无。",
    "- 存库：无（测试不写概念页与卡片）。",
    "- 下一次：见 Next Session。",
    "",
  ];
  return [...head, ...record, ...lines.slice(end)].join("\n");
}

/** 从表里休息日/上课日算出第 count 个上课日（给 plan 的 --end）。 */
function nthStudyDay(start, count, days) {
  let date = start;
  let seen = 0;
  for (;;) {
    if (days.has(weekday(date))) {
      seen += 1;
      if (seen === count) return date;
    }
    date = addDays(date, 1);
  }
}

// ══ 1. 原样收课：每门有排期的课 stage → 不改 → check ══

test("真实库副本：每门有排期的课原样 stage → check 都通过（列出每门的 problems）", { skip: SKIP }, async (t) => {
  const fixture = await cloneVault();
  try {
    const files = scheduledFiles();
    assert.ok(files.length >= 4, `库副本里应有至少 4 门已排期的课（实际 ${files.length}）`);
    const report = [];
    const failures = [];
    for (const name of files) {
      const slug = slugOf(name);
      const { staging } = await cliJson(fixture, ["stage", fixture.vault, slug, "--workspace", fixture.ws]);
      const checked = await cliJsonAny(fixture, ["check", staging]);
      report.push({ slug, ok: checked.ok, problems: checked.problems, changes: checked.changes.length });
      if (!checked.ok) failures.push(`${slug}: ${JSON.stringify(checked.problems)}`);
      await cli(fixture, ["abort", staging]);
      assert.ok(!existsSync(staging), `${slug}：abort 之后暂存目录应被删掉`);
    }
    t.diagnostic(`原样 check：${JSON.stringify(report)}`);
    assert.deepEqual(failures, [], `真实课程页原样收课被 check 卡住（用户下次就收不了课）：\n${failures.join("\n")}`);
  } finally {
    await cleanup(fixture);
  }
});

// ══ 2. 最小真实收课：加一条 Learning Record → check → commit ══

test(
  "真实库副本：每门课加一条 Learning Record → commit：课程页 0444、看板刷新、jj 记「收课 <slug> <日期>」",
  { skip: SKIP },
  async (t) => {
    const fixture = await cloneVault({ jj: true });
    try {
      const today = localDate();
      const files = scheduledFiles();
      assert.ok(files.length >= 4, `库副本里应有至少 4 门已排期的课（实际 ${files.length}）`);
      const report = [];
      const failures = [];
      for (const name of files) {
        const slug = slugOf(name);
        const pagePath = join(fixture.vault, pageRel(slug));
        const boardPath = join(fixture.vault, "wiki", "_generated", "courses.md");
        const original = await readFile(pagePath, "utf8");
        const boardBefore = await readFile(boardPath, "utf8");
        const boardMtime = (await stat(boardPath)).mtimeMs;
        const { firstUndone } = scheduleFacts(original);
        assert.ok(firstUndone, `${slug}：排期表里没有未完成的 D 号，无法照 record.md 写「完成：」`);

        const { staging } = await cliJson(fixture, ["stage", fixture.vault, slug, "--workspace", fixture.ws]);
        const stagedPage = join(staging, pageRel(slug));
        const staged = await readFile(stagedPage, "utf8");
        const closed = addRecord(staged, { id: firstUndone.id, date: today, seq: nextSeq(staged, today) });
        await writeFile(stagedPage, closed);

        const checked = await cliJsonAny(fixture, ["check", staging]);
        if (!checked.ok) {
          failures.push(`${slug}: ${JSON.stringify(checked.problems)}`);
          report.push({ slug, ok: false, problems: checked.problems });
          await cli(fixture, ["abort", staging]);
          continue;
        }
        const committed = await cliJson(fixture, ["commit", staging]);
        assert.equal(committed.committed, true, `${slug}：commit 应成功`);
        assert.equal(committed.jj, "ok", `${slug}：jj 提交应成功`);
        assert.equal(committed.board, "ok", `${slug}：看板应重画成功`);

        assert.equal(await readFile(pagePath, "utf8"), closed, `${slug}：库里的课程页应与暂存里逐字相同`);
        assert.equal(await mode(pagePath), 0o444, `${slug}：课程页应重新上锁 0444`);
        // 不是每门课都有 wiki/courses/<slug>/ 目录（只有写过 records 或截图的才有）。
        const slugDir = join(fixture.vault, "wiki", "courses", slug);
        if (existsSync(slugDir)) assert.equal(await mode(slugDir), 0o555, `${slug}：课程目录应上锁 0555`);

        const boardAfter = await readFile(boardPath, "utf8");
        // 看板确实被重画了（已经用过今天的记录时内容可能逐字相同，所以看 mtime）。
        assert.ok((await stat(boardPath)).mtimeMs > boardMtime, `${slug}：wiki/_generated/courses.md 应被重新写过`);
        const row = boardAfter.split("\n").find((line) => line.startsWith(`| [[courses/${slug}\\|`));
        assert.ok(row, `${slug}：看板里应有这门课的一行`);
        assert.ok(row.includes(`| ${today} |`), `${slug}：看板上次记录应是 ${today}：${row}`);

        assert.equal(
          jj(fixture, ["log", "-r", "@-", "--no-graph", "-T", "description.first_line()"]),
          `收课 ${slug} ${today}`,
          `${slug}：jj 最新提交的描述应为「收课 ${slug} ${today}」`,
        );
        report.push({
          slug,
          ok: true,
          id: firstUndone.id,
          lines: closed.split("\n").length,
          boardTextChanged: boardAfter !== boardBefore,
        });
      }
      t.diagnostic(`最小真实收课：${JSON.stringify(report)}`);
      assert.deepEqual(failures, [], `真实课程页收课被 check 卡住：\n${failures.join("\n")}`);
    } finally {
      await cleanup(fixture);
    }
  },
);

// ══ 3. 计划暂存：stage --kind plan → schedule --elastic → check → commit ══

test(
  "真实库副本：主项课计划暂存 stage --kind plan → schedule --elastic → commit 记「计划 …」",
  { skip: SKIP },
  async (t) => {
    const fixture = await cloneVault({ jj: true });
    try {
      const today = localDate();
      // 主项课：ctm 的科目页 route 是「C1 主项」（离散与编程范式两门主项里取这门）。
      const subjectPage = join(fixture.vault, "wiki", "subjects", "programming-paradigms.md");
      assert.match(await readFile(subjectPage, "utf8"), /C1 主项/, "ctm 的科目页应是 C1 主项");
      const slug = "ctm";
      const pagePath = join(fixture.vault, pageRel(slug));
      const original = await readFile(pagePath, "utf8");
      const { schedule } = scheduleFacts(original);
      assert.ok(schedule, `${slug}：应有排期表`);

      // lessons 用排期表里现有课次的内容组成（按学习顺序）。
      const lessons = schedule.rows
        .filter((row) => row.kind === "new")
        .map((row) => ({ id: row.id, content: row.content, material: row.material, done_when: row.doneWhen }));
      assert.ok(lessons.length > 0, `${slug}：排期表里没有新课次`);
      const lessonsFile = join(fixture.root, "lessons.json");
      await writeFile(lessonsFile, JSON.stringify(lessons, null, 2));

      // 真改一次计划：起点后移到表里第二个上课日（内容不变，日期整体顺延）。
      const start = schedule.rows.filter((row) => row.kind === "new")[1].date;
      const end = nthStudyDay(start, lessons.length, schedule.days);
      assert.ok(end <= "2027-06-30", `算出的 --end 不合理：${end}`);

      const { staging } = await cliJson(fixture, [
        "stage",
        fixture.vault,
        slug,
        "--workspace",
        fixture.ws,
        "--kind",
        "plan",
      ]);
      const manifest = JSON.parse(await readFile(join(staging, "manifest.json"), "utf8"));
      assert.equal(manifest.kind, "plan", "暂存种类应为 plan");
      assert.ok(
        Object.keys(manifest.base).includes("wiki/subjects/programming-paradigms.md"),
        "计划暂存应带上科目页",
      );

      const scheduled = await cliJson(fixture, [
        "schedule",
        staging,
        "--lessons",
        lessonsFile,
        "--start",
        start,
        "--end",
        end,
        "--rest",
        formatRest(schedule.rest),
        "--days",
        formatDays(schedule.days),
        "--reviews",
        schedule.reviews,
        "--elastic",
      ]);
      assert.equal(scheduled.scheduled, pageRel(slug));

      const stagedText = await readFile(join(staging, pageRel(slug)), "utf8");
      const marker = stagedText.match(/<!-- xuegen:schedule:start[^\n]*-->/)[0];
      assert.doesNotMatch(marker, /end=/, "--elastic 不应把结束日写进排期标记");
      assert.match(stagedText, new RegExp(`\\| D1 \\| ${start}（`), `暂存里 D1 应排在 ${start}`);

      const checked = await cliJsonAny(fixture, ["check", staging]);
      assert.equal(checked.ok, true, `计划暂存 check 没通过：${JSON.stringify(checked.problems)}`);
      assert.deepEqual(
        checked.changes.map((change) => change.path),
        [pageRel(slug)],
        "这次的改动只有课程页的排期表",
      );
      // 计划暂存不接受 --label（一律记「计划」）。
      const rejected = await run(process.execPath, [SCRIPT, "commit", staging, "--label", "存档点", "--json"], {
        encoding: "utf8",
        env: { ...process.env, ...fixture.env },
      }).then(
        () => null,
        (error) => error,
      );
      assert.ok(rejected, "计划暂存带 --label 应被拒绝");
      assert.match(String(rejected.stderr), /不接受 --label/);

      const committed = await cliJson(fixture, ["commit", staging]);
      assert.equal(committed.committed, true);
      assert.equal(committed.jj, "ok", "jj 提交应成功");
      const after = await readFile(pagePath, "utf8");
      assert.match(after, new RegExp(`\\| D1 \\| ${start}（`), "库里 D1 应排到新的起点");
      assert.equal(
        jj(fixture, ["log", "-r", "@-", "--no-graph", "-T", "description.first_line()"]),
        `计划 ${slug} ${today}`,
        "jj 最新提交的描述应为「计划 <slug> <日期>」",
      );
      assert.equal(await mode(pagePath), 0o444, "课程页重新上锁 0444");
      t.diagnostic(`计划暂存：${slug} ${lessons.length} 个课次，${start} ~ ${end}，elastic 标记：${marker}`);
    } finally {
      await cleanup(fixture);
    }
  },
);

// ══ 4. undo：收课提交后撤销，课程页逐字回到收课前 ══

test("真实库副本：收课 commit 后 undo → 课程页与副本原文件逐字相同并重新上锁", { skip: SKIP }, async (t) => {
  // 一门带 records 目录的（discrete-math-epp）与一门记录最长的（ctm）。
  const slugs = ["discrete-math-epp", "ctm"];
  const fixture = await cloneVault({ jj: true });
  try {
    const today = localDate();
    for (const slug of [...slugs]) {
      assert.ok(scheduledFiles().includes(`${slug}.md`), `${slug}：应有排期标记`);
    }
    for (const slug of slugs) {
      const pagePath = join(fixture.vault, pageRel(slug));
      const original = await readFile(pagePath, "utf8");
      const { firstUndone } = scheduleFacts(original);
      const staging = (
        await cliJson(fixture, ["stage", fixture.vault, slug, "--workspace", fixture.ws])
      ).staging;
      const stagedPage = join(staging, pageRel(slug));
      const staged = await readFile(stagedPage, "utf8");
      await writeFile(stagedPage, addRecord(staged, { id: firstUndone.id, date: today, seq: nextSeq(staged, today) }));
      const checked = await cliJsonAny(fixture, ["check", staging]);
      assert.equal(checked.ok, true, `${slug}：check 没通过 ${JSON.stringify(checked.problems)}`);
      const boardPath = join(fixture.vault, "wiki", "_generated", "courses.md");
      const boardBefore = await readFile(boardPath, "utf8");
      const committed = await cliJson(fixture, ["commit", staging]);
      assert.equal(committed.committed, true, `${slug}：commit 应成功`);
      assert.notEqual(await readFile(pagePath, "utf8"), original, `${slug}：提交后课程页应已改动`);

      const undone = await cliJson(fixture, ["undo", fixture.vault, slug, "--workspace", fixture.ws]);
      assert.equal(undone.jj, "ok", `${slug}：撤销的 jj 提交应成功`);
      assert.deepEqual(undone.restoreFiles, [pageRel(slug)], `${slug}：撤销应只恢复课程页`);
      assert.equal(await readFile(pagePath, "utf8"), original, `${slug}：课程页应逐字回到收课前`);
      assert.equal(await mode(pagePath), 0o444, `${slug}：撤销后课程页应重新上锁 0444`);
      const slugDir = join(fixture.vault, "wiki", "courses", slug);
      if (existsSync(slugDir)) assert.equal(await mode(slugDir), 0o555, `${slug}：课程目录应上锁 0555`);

      // 看板是收课提交的一部分，撤销后应与收课前逐字相同（上次记录日期也回去）。
      assert.equal(await readFile(boardPath, "utf8"), boardBefore, `${slug}：撤销后看板应回到收课前的样子`);
      t.diagnostic(`undo ${slug}：${undone.undone} 恢复 ${undone.restoreFiles.join("、")}`);
    }
    assert.equal(
      jj(fixture, ["log", "-r", "@-", "--no-graph", "-T", "description.first_line()"]),
      `撤销收课 ${slugs.at(-1)} ${today}`,
      "jj 最新提交的描述应为「撤销收课 <slug> <日期>」",
    );
  } finally {
    await cleanup(fixture);
  }
});

// ══ 5. 200 行上限：真实课程页的行数，以及超限会不会被拒 ══

test("真实库副本：课程页行数表；超过 200 行的页面 stage → check 会被拒", { skip: SKIP }, async (t) => {
  const LIMIT = 200; // 与 close/rules.mjs 的 COURSE_PAGE_MAX_LINES 一致
  const rows = courseFiles().map((name) => {
    const text = readFileSync(join(SRC_COURSES, name), "utf8");
    // 与 checkCoursePage 同一个量法：split("\n").length。
    return { slug: slugOf(name), lines: text.split("\n").length };
  });
  const table = rows.map((row) => `${row.slug}=${row.lines}`).join(" ");
  const over = rows.filter((row) => row.lines > LIMIT);
  t.diagnostic(`课程页行数：${table}（上限 ${LIMIT}）`);
  t.diagnostic(`超过上限的：${over.length === 0 ? "无" : over.map((row) => row.slug).join("、")}`);
  for (const row of rows) {
    t.diagnostic(`${row.slug}：${row.lines} 行，离上限还有 ${LIMIT - row.lines} 行`);
  }

  const fixture = await cloneVault();
  try {
    // 真有超过上限的页面：原样 stage → check，看它会不会被拒。
    const rejected = [];
    for (const row of over) {
      const { staging } = await cliJson(fixture, ["stage", fixture.vault, row.slug, "--workspace", fixture.ws]);
      const result = await cliJsonAny(fixture, ["check", staging]);
      const hit = (result.problems ?? []).some((problem) => /超过 200 行上限/.test(problem.detail));
      rejected.push({ slug: row.slug, lines: row.lines, ok: result.ok === true, hit });
      await cli(fixture, ["abort", staging]);
    }
    assert.deepEqual(
      rejected.filter((entry) => entry.ok || !entry.hit),
      [],
      `超过 200 行的真实课程页没有被 200 行规则挡住（说明规则或量法不一致）：${JSON.stringify(rejected)}`,
    );

    // 眼下没有超限的页面：把最长的一页在暂存里加行顶到 201 行，确认规则确实拦收课。
    if (over.length === 0) {
      const longest = [...rows].sort((a, b) => b.lines - a.lines)[0];
      const { staging } = await cliJson(fixture, ["stage", fixture.vault, longest.slug, "--workspace", fixture.ws]);
      const stagedPage = join(staging, pageRel(longest.slug));
      const text = await readFile(stagedPage, "utf8");
      const filler = Array.from({ length: LIMIT + 1 - text.split("\n").length }, (_, i) => `<!-- 填充 ${i + 1} -->`);
      await writeFile(stagedPage, `${text}${filler.join("\n")}\n`);
      const grown = (await readFile(stagedPage, "utf8")).split("\n").length;
      assert.ok(grown > LIMIT, `加行后应超过 ${LIMIT} 行（实际 ${grown}）`);
      const checked = await cliJsonAny(fixture, ["check", staging]);
      assert.equal(checked.ok, false, "超过 200 行的暂存课程页应被 check 拒绝");
      assert.ok(
        checked.problems.some((problem) => /超过 200 行上限/.test(problem.detail)),
        `应报「超过 200 行上限」：${JSON.stringify(checked.problems)}`,
      );
      t.diagnostic(
        `${longest.slug} 从 ${longest.lines} 行加到 ${grown} 行即被拒：再写 ${LIMIT - longest.lines + 1} 行记录就收不了课`,
      );
      await cli(fixture, ["abort", staging]);
    }
  } finally {
    await cleanup(fixture);
  }
});
