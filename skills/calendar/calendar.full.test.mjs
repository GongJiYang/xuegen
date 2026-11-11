#!/usr/bin/env node
// calendar.mjs 端到端测试（全量测试 B7）：node:test + node:assert，无第三方依赖。
// 每个用例在 mkdtemp 下造一个只有 wiki/ 的空库，不碰真实库。
// 覆盖：write 建目录/覆盖/--stdin/空正文删除/非法日期、get 不存在的日子、month 跨月。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "calendar.mjs");

async function makeVault() {
  const dir = await mkdtemp(join(tmpdir(), "calendar-full-"));
  await mkdir(join(dir, "wiki"), { recursive: true });
  return dir;
}

/** 跑脚本；expectFail 时返回 stderr，否则返回 stdout。 */
async function cal(args, { expectFail = false, input } = {}) {
  const child = run("node", [SCRIPT, ...args], { encoding: "utf8" });
  if (input !== undefined) child.child.stdin.end(input);
  try {
    const { stdout } = await child;
    if (expectFail) assert.fail(`期望失败但成功：${args.join(" ")}\n${stdout}`);
    return stdout;
  } catch (error) {
    if (!expectFail) throw error;
    return error.stderr ?? "";
  }
}

const calJson = async (args, options) => JSON.parse(await cal([...args, "--json"], options));
const notePath = (vault, date) => join(vault, "wiki", "calendar", `${date}.md`);

/** 跑脚本并原样返回 { ok, stdout, stderr }，不抛错（给要观察现状的 todo 用例）。 */
async function calRaw(args) {
  try {
    const { stdout } = await run("node", [SCRIPT, ...args], { encoding: "utf8" });
    return { ok: true, stdout, stderr: "" };
  } catch (error) {
    return { ok: false, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

// ---------------------------------------------------------------- write 新日子

test("write：wiki/calendar/ 不存在时自动建目录并写入带 frontmatter 的笔记", async () => {
  const vault = await makeVault();
  try {
    assert.equal(existsSync(join(vault, "wiki", "calendar")), false, "前置：起始没有 wiki/calendar/");
    const out = await cal(["write", vault, "2027-01-05", "--text", "寒假第一天"]);
    assert.match(out, /write: 2027-01-05/);
    assert.equal((await stat(join(vault, "wiki", "calendar"))).isDirectory(), true, "应自动建出 wiki/calendar/");
    const text = await readFile(notePath(vault, "2027-01-05"), "utf8");
    assert.equal(text, "---\ndate: 2027-01-05\n---\n\n寒假第一天\n");
    // 落盘后 get 能读到。
    const day = await calJson(["get", vault, "2027-01-05"]);
    assert.equal(day.note, "寒假第一天");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("write --json：返回 { date, file, wrote: true }", async () => {
  const vault = await makeVault();
  try {
    const result = await calJson(["write", vault, "2027-01-06", "--text", "x"]);
    assert.equal(result.date, "2027-01-06");
    assert.equal(result.file, notePath(vault, "2027-01-06"));
    assert.equal(result.wrote, true);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- 覆盖已有日子

test("write：同一天再写是整篇覆盖（不是追加），旧正文与多余 frontmatter 字段都不保留", async () => {
  const vault = await makeVault();
  try {
    await mkdir(join(vault, "wiki", "calendar"), { recursive: true });
    // 手写的旧笔记：带额外 frontmatter 字段（tags）与正文。
    await writeFile(notePath(vault, "2027-02-01"), "---\ndate: 2027-02-01\ntags: [复习]\n---\n\n旧的第一句\n旧的第一句的第二行\n", "utf8");

    await cal(["write", vault, "2027-02-01", "--text", "新的正文"]);
    const text = await readFile(notePath(vault, "2027-02-01"), "utf8");
    assert.equal(text, "---\ndate: 2027-02-01\n---\n\n新的正文\n", "应为整篇覆盖");
    assert.ok(!text.includes("旧的第一句"), `旧正文应被覆盖：${text}`);
    assert.ok(!text.includes("tags:"), `旧 frontmatter 字段应被覆盖：${text}`);
    assert.ok(!/旧的第一句\n新/.test(text), "不应把新正文追加在旧正文后");
    // 目录里仍只有这一天一个文件，没留临时文件。
    assert.deepEqual(await readdir(join(vault, "wiki", "calendar")), ["2027-02-01.md"]);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- --stdin

test("write --stdin：从标准输入读正文（多行、末尾空行被去掉）", async () => {
  const vault = await makeVault();
  try {
    await cal(["write", vault, "2027-03-02", "--stdin"], { input: "第一行\n第二行\n\n\n" });
    const text = await readFile(notePath(vault, "2027-03-02"), "utf8");
    assert.equal(text, "---\ndate: 2027-03-02\n---\n\n第一行\n第二行\n");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("write --stdin 空输入：不建文件、也不报错（按空正文处理）", async () => {
  const vault = await makeVault();
  try {
    const out = await cal(["write", vault, "2027-03-03", "--stdin"], { input: "" });
    assert.match(out, /正文为空/);
    assert.equal(existsSync(notePath(vault, "2027-03-03")), false);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("write 空正文：删除已有笔记文件并返回 wrote: false", async () => {
  const vault = await makeVault();
  try {
    await cal(["write", vault, "2027-03-04", "--text", "先写点东西"]);
    assert.ok(existsSync(notePath(vault, "2027-03-04")));
    const result = await calJson(["write", vault, "2027-03-04", "--text", "  \n\t "]);
    assert.deepEqual(result, { date: "2027-03-04", file: null, wrote: false });
    assert.equal(existsSync(notePath(vault, "2027-03-04")), false);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("write：既没 --text 也没 --stdin 时报错并说明用法", async () => {
  const vault = await makeVault();
  try {
    const err = await cal(["write", vault, "2027-03-05"], { expectFail: true });
    assert.match(err, /需要 --text <string> 或 --stdin/);
    assert.equal(existsSync(notePath(vault, "2027-03-05")), false);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- 非法日期

test("write/get：非法日期报错（格式不对与日历上不存在都算），且不落任何文件", async () => {
  const vault = await makeVault();
  try {
    const bad = ["2027-2-3", "2027-02-30", "2027-00-10", "2027-13-01", "27-02-03", "2027-02-03T00:00", "2027-02-03 "];
    for (const date of bad) {
      const err = await cal(["write", vault, date, "--text", "y"], { expectFail: true });
      assert.match(err, /日期格式非法/, `${date} 应报日期格式非法：${err}`);
    }
    assert.equal(existsSync(join(vault, "wiki", "calendar")), false, "非法日期不应建目录或写文件");

    const getErr = await cal(["get", vault, "2027-02-30"], { expectFail: true });
    assert.match(getErr, /日期格式非法/);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("month：月份格式非法报错（不是 YYYY-MM 的写法）", async () => {
  const vault = await makeVault();
  try {
    for (const month of ["2027-2", "202702", "2027-02-01", "2027-2x"]) {
      const err = await cal(["month", vault, month], { expectFail: true });
      assert.match(err, /月份格式非法/, `${month} 应报月份格式非法：${err}`);
    }
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("month：日历上不存在的月份（2027-13 / 2027-00）应报错", async (t) => {
  const vault = await makeVault();
  try {
    for (const month of ["2027-13", "2027-00", "2027-99"]) {
      const result = await calRaw(["month", vault, month, "--json"]);
      t.diagnostic(`${month} 实际：exit=${result.ok ? 0 : 1} stdout=${result.stdout.trim()} stderr=${result.stderr.trim()}`);
      assert.equal(result.ok, false, `${month} 应报错，实际成功并输出 ${result.stdout.trim()}`);
      assert.match(result.stderr, /月份格式非法/, `${month} 应报月份格式非法，实际：${result.stderr}`);
    }
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("非库根目录（没有 wiki/）一律拒绝：write 不建任何东西", async () => {
  const dir = await mkdtemp(join(tmpdir(), "calendar-full-notvault-"));
  try {
    const err = await cal(["write", dir, "2027-04-01", "--text", "x"], { expectFail: true });
    assert.match(err, /不是 Wiki 库根目录/);
    assert.equal(existsSync(join(dir, "wiki")), false);

    const monthErr = await cal(["month", dir, "2027-04"], { expectFail: true });
    assert.match(monthErr, /不是 Wiki 库根目录/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- get 不存在的日子

test("get：不存在的日子返回空结构（note 为 null），exit 0，人类可读输出写「（无）」", async () => {
  const vault = await makeVault();
  try {
    const day = await calJson(["get", vault, "2027-05-20"]);
    assert.deepEqual(day, { date: "2027-05-20", records: [], plans: [], readingDue: [], log: [], note: null });

    const text = await cal(["get", vault, "2027-05-20"]);
    assert.match(text, /^2027-05-20$/m);
    assert.match(text, /笔记：（无）/);
    assert.equal(existsSync(join(vault, "wiki", "calendar")), false, "get 不应写任何东西");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("get：写了笔记之后同一天能读回；相邻没写过的日子仍为空", async () => {
  const vault = await makeVault();
  try {
    await cal(["write", vault, "2027-05-21", "--text", "当天笔记"]);
    assert.equal((await calJson(["get", vault, "2027-05-21"])).note, "当天笔记");
    assert.equal((await calJson(["get", vault, "2027-05-22"])).note, null);
    // get 跨到别的月份也只看那一天（2027-06-01 没内容）。
    assert.equal((await calJson(["get", vault, "2027-06-01"])).note, null);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- month 跨月

test("month：跨月边界（12-31 与次年 01-01 各归各月），空月份返回空 days", async () => {
  const vault = await makeVault();
  try {
    await cal(["write", vault, "2026-12-31", "--text", "年末"]);
    await cal(["write", vault, "2027-01-01", "--text", "年初"]);
    await cal(["write", vault, "2027-01-31", "--text", "一月底"]);

    const dec = await calJson(["month", vault, "2026-12"]);
    assert.deepEqual(Object.keys(dec.days), ["2026-12-31"]);
    assert.equal(dec.days["2026-12-31"].note, "年末");

    const jan = await calJson(["month", vault, "2027-01"]);
    assert.deepEqual(Object.keys(jan.days).sort(), ["2027-01-01", "2027-01-31"]);
    assert.equal(jan.days["2027-01-01"].note, "年初");

    const feb = await calJson(["month", vault, "2027-02"]);
    assert.deepEqual(feb, { month: "2027-02", days: {} });
    const febText = await cal(["month", vault, "2027-02"]);
    assert.match(febText, /2027-02：无内容/);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("month：人类可读输出按日期排序并给出一行摘要", async () => {
  const vault = await makeVault();
  try {
    await cal(["write", vault, "2027-07-20", "--text", "后写的"]);
    await cal(["write", vault, "2027-07-03", "--text", "先写的"]);
    await writeFile(
      join(vault, "wiki", "log.md"),
      "## [2027-07-03] ingest | 某文章\n\n## [2027-08-01] create | 下月\n",
      "utf8",
    );

    const lines = (await cal(["month", vault, "2027-07"])).trim().split("\n");
    assert.equal(lines[0], "2027-07：2 个有内容的日期");
    assert.match(lines[1], /^2027-07-03｜/);
    assert.match(lines[1], /log 1/);
    assert.match(lines[1], /✎ 笔记/);
    assert.match(lines[2], /^2027-07-20｜/);

    const days = await calJson(["month", vault, "2027-07"]);
    assert.deepEqual(Object.keys(days.days), ["2027-07-03", "2027-07-20"].sort());
    assert.ok(!days.days["2027-08-01"], "8 月的条目不应出现在 7 月");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("month 与 write 来回：写入的日子立刻出现在当月视图里", async () => {
  const vault = await makeVault();
  try {
    const month = "2027-09";
    assert.deepEqual((await calJson(["month", vault, month])).days, {});
    await cal(["write", vault, "2027-09-10", "--text", "记住交报告"]);
    const after = await calJson(["month", vault, month]);
    assert.deepEqual(Object.keys(after.days), ["2027-09-10"]);
    assert.equal(after.days["2027-09-10"].note, "记住交报告");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});
