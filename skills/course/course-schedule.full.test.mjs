// course-schedule.mjs 的端到端补测（全量测试 B2）：连续多天没学、休息日顺延、跳着完成、
// 复习挪到今天、plan 边界、elastic、next、真实库副本冒烟。全部在 mkdtemp 临时目录里跑。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, readdir, copyFile, chmod, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { completedIds, parseDays, parseRest, weekday } from "./course-schedule.mjs";

const run = promisify(execFile);
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "course-schedule.mjs");
const SUN = parseRest("sun");
const MW = parseDays("mon,wed", SUN);
/** 只读的库副本（在别的机器上不存在时，冒烟用例 skip）。 */
const VAULT_COURSES = "/tmp/xg-e2e/vault/GJY/wiki/courses";

const lessons = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `D${i + 1}`,
    content: `Ch${i + 1} 主题${i + 1}`,
    material: `书 2nd · Ch${i + 1}`,
    done_when: `能说出 Ch${i + 1} 的要点`,
  }));

/** 与真实课程页同形的样本：计划表段里先有「### 留到下个周期」占位行。 */
const page = (table) =>
  [
    "<!-- xuegen:course-state -->",
    "# 测试课",
    "",
    "## 计划表（参考）",
    "",
    "> 逐日课次见下方脚本生成的表格。",
    "",
    "### 留到下个周期",
    "",
    "- 无：本周期排得下。",
    "",
    table,
    "",
    "## Learning Record",
    "### 2026-11-09-01（课程创建，非收课）",
    "",
    "完成：无",
    "",
  ].join("\n");

const deferredSection = (text) => {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^###\s+留到下个周期\s*$/.test(line));
  assert.notEqual(start, -1, "找不到「留到下个周期」一节");
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##+\s/.test(line) || /xuegen:schedule:start/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
};

const isLessonDay = (date) => MW.has(weekday(date));

/** 用 CLI 跑一次 plan，返回 { ok, lastLesson }。 */
async function planCli(dir, args) {
  const file = join(dir, "c.md");
  const lessonsFile = join(dir, "lessons.json");
  await writeFile(file, page(""));
  await writeFile(lessonsFile, JSON.stringify(lessons(Number(args.lessons))));
  const out = await run("node", [
    SCRIPT,
    "plan",
    file,
    "--start",
    args.start,
    "--end",
    args.end,
    "--rest",
    args.rest ?? "sun",
    ...(args.days ? ["--days", args.days] : []),
    ...(args.extra ? ["--extra", args.extra] : []),
    ...(args.reviews ? ["--reviews", args.reviews] : []),
    ...(args.elastic ? ["--elastic"] : []),
    "--lessons",
    lessonsFile,
    "--write",
    "--json",
  ]);
  return { file, ...JSON.parse(out.stdout) };
}

async function shiftCli(file, today, extra = []) {
  return JSON.parse((await run("node", [SCRIPT, "shift", file, "--today", today, "--write", "--json", ...extra])).stdout);
}

// ---- 1. 连续多天没学 ----

test("连续多天没学（周一周三课，跨两周跨月底）：整体后移、落点仍是上课日，越出 end 的进「留到下个周期」", async () => {
  const dir = await mkdtemp(join(tmpdir(), "course-schedule-full-missed-"));
  try {
    const planned = await planCli(dir, { lessons: 14, start: "2026-11-09", end: "2026-12-24", days: "mon,wed", reviews: "anki" });
    assert.equal(planned.lastLesson, "2026-12-23");

    // D1 原定 11-09（周一），10 天后是 11-19（周四）；D1~D3 都没完成。
    const shifted = await shiftCli(planned.file, "2026-11-19");
    assert.equal(shifted.shiftedDays, 4, "11-09 → 11-19 之间跨过 11-09/11-11/11-16/11-18 四个上课日");

    const text = await readFile(planned.file, "utf8");
    const news = [...text.matchAll(/^\| (D\d+) \| (\d{4}-\d{2}-\d{2})（/gm)].map((m) => [m[1], m[2]]);
    // 表里只剩排得下的 10 节；D1 落在 today（11-19）之后的第一个上课日。
    assert.deepEqual(news, [
      ["D1", "2026-11-23"],
      ["D2", "2026-11-25"],
      ["D3", "2026-11-30"],
      ["D4", "2026-12-02"],
      ["D5", "2026-12-07"],
      ["D6", "2026-12-09"],
      ["D7", "2026-12-14"],
      ["D8", "2026-12-16"],
      ["D9", "2026-12-21"],
      ["D10", "2026-12-23"],
    ]);
    assert.ok(news.every(([, date]) => date > "2026-11-19"), "D1 落在 today 之后（today 11-19 是周四，不是上课日）");
    assert.ok(news.every(([, date]) => isLessonDay(date)), "新课都落在周一/周三");
    const order = news.map(([id]) => Number(id.slice(1)));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), "课次顺序保持");
    assert.ok(news.every(([, date], i) => i === 0 || date > news[i - 1][1]), "日期严格递增");

    assert.deepEqual(shifted.dropped.map((row) => row.id), ["D11", "D12", "D13", "D14"], "越过 12-24 的课次不进表里");
    const deferred = deferredSection(text);
    assert.doesNotMatch(deferred, /- 无：/, "占位行被替换");
    for (const id of ["D11", "D12", "D13", "D14"]) assert.match(deferred, new RegExp(`^- ${id}：`, "m"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---- 2. today 是休息日 ----

test("today 是休息日（周日）：第一节落在下一个上课日，不落在周日", async () => {
  const dir = await mkdtemp(join(tmpdir(), "course-schedule-full-sunday-"));
  try {
    const planned = await planCli(dir, { lessons: 4, start: "2026-11-09", end: "2026-11-18", days: "mon,wed", reviews: "anki" });
    const shifted = await shiftCli(planned.file, "2026-11-15"); // 周日
    assert.equal(weekday("2026-11-15"), 0);
    assert.equal(shifted.shiftedDays, 2);

    const text = await readFile(planned.file, "utf8");
    const news = [...text.matchAll(/^\| (D\d+) \| (\d{4}-\d{2}-\d{2})（/gm)].map((m) => [m[1], m[2]]);
    // end=11-18：后移两节后 D3（11-23）、D4（11-25）越过结束日，进「留到下个周期」。
    assert.deepEqual(news, [
      ["D1", "2026-11-16"],
      ["D2", "2026-11-18"],
    ]);
    assert.equal(news[0][1], "2026-11-16", "落在周日之后的第一个上课日（周一）");
    assert.ok(news.every(([, date]) => weekday(date) !== 0), "没有任何一行落在周日");
    assert.deepEqual(shifted.dropped.map((row) => row.id), ["D3", "D4"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---- 3. 跳着完成（D1 没做、D2 已做） ----

test("跳着完成：已完成的 D2 不动也不占日子，D1 落在今天，未完成的新课仍严格递增不同天", async () => {
  const dir = await mkdtemp(join(tmpdir(), "course-schedule-full-skip-"));
  try {
    const planned = await planCli(dir, { lessons: 4, start: "2026-11-09", end: "2026-11-18", days: "mon,wed", reviews: "anki" });
    // D1（11-09 周一）没上，D2（11-11 周三）已完成；今天就是 11-11。
    const text = (await readFile(planned.file, "utf8")).replace("完成：无", "完成：D2");
    await writeFile(planned.file, text);

    const shifted = await shiftCli(planned.file, "2026-11-11");
    const rows = [...(await readFile(planned.file, "utf8")).matchAll(/^\| (D\d+) \| (\d{4}-\d{2}-\d{2})（/gm)].map((m) => [m[1], m[2]]);
    const byId = Object.fromEntries(rows);

    assert.equal(byId.D2, "2026-11-11", "已完成的 D2 不被挪");
    assert.equal(byId.D1, "2026-11-11", "已完成的课不占日子：D1 就落在今天");
    assert.equal(shifted.shiftedDays, 1);
    // D3 跟着同一段顺延：原 11-16 + 1 个上课日 = 11-18（仍在上课日）。
    assert.equal(byId.D3, "2026-11-18");
    // D4 原 11-18 顺延到 11-23，越过 end（11-18）→ 进「留到下个周期」。
    assert.equal(byId.D4, undefined, "越过结束日的 D4 不进表里");
    assert.deepEqual(shifted.dropped.map((row) => row.id), ["D4"]);

    // 已完成的课不占日子，所以只要求未完成的新课互不同天、日期严格递增。
    const unfinished = rows.filter(([id]) => id !== "D2");
    const dates = unfinished.map(([, date]) => date);
    assert.equal(new Set(dates).size, dates.length, "同一天没有两节未完成的新课");
    assert.ok(unfinished.every(([, date], i) => i === 0 || date > unfinished[i - 1][1]), "未完成的新课日期严格递增");
    assert.ok(rows.every(([, date]) => isLessonDay(date)), "新课都落在周一/周三");
    assert.match(deferredSection(await readFile(planned.file, "utf8")), /^- D4：/m);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---- 4. 复习挪到今天（过期 5 天 + today 是休息日） ----

test("复习挪到今天：D1 已完成、R1-D1/R2-D1 过期 5 天，today 为周日 → 复习挪到之后第一个非休息日，新课不动", async () => {
  const dir = await mkdtemp(join(tmpdir(), "course-schedule-full-review-"));
  try {
    // 只有周一上新课，D1 11-02、D2 11-09；复习 R1-D1 11-03、R2-D1 11-05。
    const planned = await planCli(dir, { lessons: 3, start: "2026-11-02", end: "2026-11-30", days: "mon" });
    assert.equal(planned.lastLesson, "2026-11-16");
    const text = (await readFile(planned.file, "utf8")).replace("完成：无", "完成：D1");
    await writeFile(planned.file, text);

    const shifted = await shiftCli(planned.file, "2026-11-08"); // 周日，R1/R2-D1 已过期 5/3 天
    assert.equal(shifted.shiftedDays, 0, "没有过期的新课");
    assert.equal(shifted.movedReviews, 2);

    const rows = [...(await readFile(planned.file, "utf8")).matchAll(/^\| (R\d-D\d+) \| (\d{4}-\d{2}-\d{2})（/gm)].map((m) => [m[1], m[2]]);
    const byId = Object.fromEntries(rows);
    assert.equal(byId["R1-D1"], "2026-11-09", "挪到 today（周日）之后的第一个非休息日");
    assert.equal(byId["R2-D1"], "2026-11-09");
    assert.equal(byId["R3-D1"], "2026-11-09", "本来就在 11-09 的复习不动");

    const news = [...(await readFile(planned.file, "utf8")).matchAll(/^\| (D\d+) \| (\d{4}-\d{2}-\d{2})（/gm)].map((m) => [m[1], m[2]]);
    assert.deepEqual(news, [
      ["D1", "2026-11-02"],
      ["D2", "2026-11-09"],
      ["D3", "2026-11-16"],
    ]);
    assert.ok(rows.every(([, date]) => weekday(date) !== 0), "复习不落在周日");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---- 5. plan 边界 ----

test("plan 边界：start 是休息日、extra 是休息日、end 早于 start、正好填满、多一节给 suggestedEnd", async () => {
  const dir = await mkdtemp(join(tmpdir(), "course-schedule-full-plan-"));
  try {
    const file = join(dir, "c.md");
    const lessonsFile = join(dir, "lessons.json");
    await writeFile(file, page(""));
    await writeFile(lessonsFile, JSON.stringify(lessons(4)));
    const plan = (...args) =>
      run("node", [SCRIPT, "plan", file, ...args, "--lessons", lessonsFile]).then(
        (result) => ({ code: 0, ...result }),
        (error) => ({ code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" }),
      );

    // --start 是休息日（周日 11-08）：从之后第一个上课日开始，不报错。
    const sundayStart = await plan("--start", "2026-11-08", "--end", "2026-11-12", "--rest", "sun", "--json");
    assert.equal(sundayStart.stderr, "");
    const rows = JSON.parse(sundayStart.stdout).schedule;
    assert.deepEqual(
      rows.filter((row) => row.kind === "new").map((row) => [row.id, row.date]),
      [
        ["D1", "2026-11-09"],
        ["D2", "2026-11-10"],
        ["D3", "2026-11-11"],
        ["D4", "2026-11-12"],
      ],
    );
    assert.ok(rows.every((row) => weekday(row.date) !== 0), "没有行落在休息日");

    // --extra 给休息日：报错（不静默忽略）。
    const extraRest = await plan("--start", "2026-11-09", "--end", "2026-11-18", "--extra", "2026-11-15");
    assert.notEqual(extraRest.code, 0);
    assert.match(extraRest.stderr, /额外上课日 2026-11-15 是休息日/);

    // --end 早于 --start：报错。
    const reversed = await plan("--start", "2026-11-10", "--end", "2026-11-09");
    assert.notEqual(reversed.code, 0);
    assert.match(reversed.stderr, /截止日期早于开始日期/);

    // 4 节正好填满 11-09 ~ 11-12：没有机动行。
    const exact = await plan("--start", "2026-11-09", "--end", "2026-11-12", "--rest", "sun", "--json");
    const exactRows = JSON.parse(exact.stdout).schedule.filter((row) => row.kind === "flex");
    assert.deepEqual(exactRows, [], "正好填满时没有「机动」行");

    // 多一节 → 报错并含 suggestedEnd；用 suggestedEnd 再 plan 成功。
    await writeFile(lessonsFile, JSON.stringify(lessons(5)));
    const overflow = await plan("--start", "2026-11-09", "--end", "2026-11-12", "--rest", "sun", "--json");
    assert.notEqual(overflow.code, 0);
    const failure = JSON.parse(overflow.stdout);
    assert.equal(failure.ok, false);
    assert.equal(failure.suggestedEnd, "2026-11-13");
    assert.match(failure.error, /5 个课次只有 4 个上课日/);

    const retry = await plan("--start", "2026-11-09", "--end", failure.suggestedEnd, "--rest", "sun", "--json");
    assert.equal(retry.stderr, "");
    const retryRows = JSON.parse(retry.stdout);
    assert.equal(retryRows.ok, true);
    assert.equal(retryRows.lastLesson, "2026-11-13");
    assert.deepEqual(retryRows.schedule.filter((row) => row.kind === "flex"), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---- 6. elastic ----

test("elastic：顺延很多天后不进「留到下个周期」，最后一节可以落在原 end 之后", async () => {
  const dir = await mkdtemp(join(tmpdir(), "course-schedule-full-elastic-"));
  try {
    const planned = await planCli(dir, { lessons: 10, start: "2026-11-23", end: "2026-12-31", days: "mon,wed", reviews: "anki", elastic: true });
    assert.equal(planned.elastic, true);
    assert.equal(planned.lastLesson, "2026-12-23");
    const before = await readFile(planned.file, "utf8");
    assert.doesNotMatch(before, /end=/, "elastic 不把 end 记进排期标记");

    // 从 D1（11-23）之后很久才回来：today 2027-01-20。
    const shifted = await shiftCli(planned.file, "2027-01-20");
    assert.ok(shifted.shiftedDays > 8, `顺延 ${shifted.shiftedDays} 个上课日`);
    assert.deepEqual(shifted.dropped, [], "弹性课不被挤进「留到下个周期」");

    const after = await readFile(planned.file, "utf8");
    assert.ok(shifted.lastLesson > "2026-12-31", `最后一节 ${shifted.lastLesson} 在原 end 之后`);
    assert.match(deferredSection(after), /- 无：本周期排得下。/, "「留到下个周期」仍是占位行");
    const news = [...after.matchAll(/^\| (D\d+) \| (\d{4}-\d{2}-\d{2})（/gm)].map((m) => [m[1], m[2]]);
    assert.equal(news.length, 10, "10 节新课都还在表里");
    assert.ok(news.every(([, date]) => isLessonDay(date)), "仍落在周一/周三");
    assert.ok(news.every(([, date], i) => i === 0 || date > news[i - 1][1]), "日期严格递增");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---- 7. next ----

test("next：休息日 / 最后一节之后 / 全部完成时都不报错，返回空 rows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "course-schedule-full-next-"));
  try {
    const planned = await planCli(dir, { lessons: 4, start: "2026-11-09", end: "2026-11-18", days: "mon,wed", reviews: "anki" });
    const next = async (date) => {
      const out = await run("node", [SCRIPT, "next", planned.file, "--date", date, "--json"]);
      return JSON.parse(out.stdout);
    };

    const lessonDay = await next("2026-11-11");
    assert.equal(lessonDay.date, "2026-11-11");
    assert.deepEqual(lessonDay.rows.map((row) => row.id), ["D2"]);

    const restDay = await next("2026-11-15"); // 周日
    assert.deepEqual(restDay, { date: "2026-11-15", rows: [] });

    const afterLast = await next("2026-11-30");
    assert.deepEqual(afterLast, { date: "2026-11-30", rows: [] });

    const text = (await readFile(planned.file, "utf8")).replace("完成：无", "完成：D1、D2、D3、D4");
    await writeFile(planned.file, text);
    const allDone = await next("2026-11-11");
    assert.deepEqual(allDone.date, "2026-11-11");
    assert.deepEqual(
      allDone.rows.map((row) => row.id),
      ["D2"],
      "next 不看完成状态，只按日期取排期行",
    );

    const plain = await run("node", [SCRIPT, "next", planned.file, "--date", "2026-11-15"]);
    assert.equal(plain.stdout.trim(), "2026-11-15 没有安排");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---- 8. 库副本冒烟 ----

const TODAY_LIST = ["2026-11-11", "2026-11-20", "2026-12-10"];

/** 表里由 shift 写出的行（新刻 + 复习 + 机动），按出现顺序。 */
function tableRows(text) {
  return [...text.matchAll(/^\| (D\d+|R\d-D\d+|机动) \| (\d{4}-\d{2}-\d{2})（/gm)].map((m) => ({ id: m[1], date: m[2] }));
}

test(
  "库副本冒烟：每门课在三个 today 上 shift 都不抛错、日期递增、不落休息日、不越 end、不重号",
  { skip: existsSync(VAULT_COURSES) ? false : `${VAULT_COURSES} 不存在（需要有库副本的机器）` },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "course-schedule-full-vault-"));
    try {
      const pages = (await readdir(VAULT_COURSES)).filter((name) => name.endsWith(".md"));
      assert.ok(pages.length > 0, "库副本里没有课程页");
      let checked = 0;
      const withoutMarker = [];

      for (const name of pages) {
        const original = await readFile(join(VAULT_COURSES, name), "utf8");
        if (!/xuegen:schedule:start/.test(original)) {
          // 没有排期标记的课程页（还没排课）：拒绝执行并给出可读原因，不是崩溃。
          const file = join(dir, `nomark-${name}`);
          await copyFile(join(VAULT_COURSES, name), file);
          await chmod(file, 0o644);
          const failed = await run("node", [SCRIPT, "shift", file, "--today", TODAY_LIST[0], "--json"]).catch((error) => error);
          assert.equal(failed.code, 1, `${name}：没有排期标记时应以 1 退出`);
          assert.match(failed.stderr, /没有排期标记/);
          withoutMarker.push(name);
          continue;
        }

        const restMatch = original.match(/rest=([a-z,]+)/);
        const rest = parseRest(restMatch ? restMatch[1] : "none");
        const endMatch = original.match(/end=(\d{4}-\d{2}-\d{2})/);
        const end = endMatch ? endMatch[1] : null;

        for (const today of TODAY_LIST) {
          // 每次都从只读库副本重新复制一份，避免上一次 shift 影响下一次。
          const file = join(dir, `${today}-${name}`);
          await copyFile(join(VAULT_COURSES, name), file);
          await chmod(file, 0o644); // 库副本里的课程页是 0444

          const preview = await run("node", [SCRIPT, "shift", file, "--today", today, "--json"]).catch((error) => {
            throw new Error(`${name} shift --today ${today} 抛错：${error.stderr || error.message}`);
          });
          assert.equal(JSON.parse(preview.stdout).written, false, "不带 --write 不写文件");
          assert.equal(await readFile(file, "utf8"), original, "不带 --write 时文件不变");

          const applied = JSON.parse(
            (await run("node", [SCRIPT, "shift", file, "--today", today, "--write", "--json"]).catch((error) => {
              throw new Error(`${name} shift --write --today ${today} 抛错：${error.stderr || error.message}`);
            })).stdout,
          );
          const changed = applied.shiftedDays > 0 || applied.movedReviews > 0 || applied.dropped.length > 0;
          assert.equal(applied.written, changed, "有改动才写文件（没改动时 written=false）");

          const rows = tableRows(await readFile(file, "utf8"));
          // 已完成的课不占日子，所以同一天可能有两行新课（一行已完成）；只要求未完成的新课不撞车。
          const done = completedIds(original);
          const news = rows.filter((row) => /^D\d+$/.test(row.id));
          assert.ok(news.length > 0, `${name} ${today}：表里还有新课`);
          const dates = news.map((row) => row.date);
          assert.ok(dates.every((date, i) => i === 0 || date > dates[i - 1]), `${name} ${today}：新课日期严格递增`);
          assert.ok(rows.every((row) => !rest.has(weekday(row.date))), `${name} ${today}：没有行落在休息日`);
          if (end) assert.ok(dates.every((date) => date <= end), `${name} ${today}：新课次都 ≤ ${end}`);
          const unfinished = news.filter((row) => !done.has(row.id)).map((row) => row.date);
          assert.equal(new Set(unfinished).size, unfinished.length, `${name} ${today}：同一天没有两节未完成的新课`);
          const ids = rows.map((row) => row.id);
          assert.equal(new Set(ids).size, ids.length, `${name} ${today}：编号不重复`);
          assert.ok(applied.lastLesson === dates.at(-1), `${name} ${today}：报告的最后一节与实际一致`);
          if (end) for (const row of applied.dropped) assert.ok(row.date > end, `${name} ${today}：被挤出表外的课次应晚于 end`);
          checked += 1;
        }
      }

      assert.ok(checked >= 4 * TODAY_LIST.length, `至少检查了 4 门已排课的课程 × 3 天（实际 ${checked} 次）`);
      assert.ok(withoutMarker.length > 0, `库副本里还有 ${withoutMarker.length} 门未排课的课程页，已确认它们被拒绝而不是崩溃`);
      // 库副本本身没被这次冒烟改动。
      assert.deepEqual((await readdir(VAULT_COURSES)).filter((name) => name.endsWith(".md")).sort(), pages.sort());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
