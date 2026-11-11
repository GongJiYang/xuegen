#!/usr/bin/env node
// Xuegen 日历：把散在库里的日期信息聚合成一个月视图，并维护 `wiki/calendar/` 手写笔记。
// 无第三方依赖。<vault> 为 Wiki 库根目录（含 wiki/ 子目录）。
//   node calendar.mjs month <vault> <YYYY-MM> [--json]
//   node calendar.mjs get <vault> <YYYY-MM-DD> [--json]
//   node calendar.mjs write <vault> <YYYY-MM-DD> (--text <string> | --stdin)
// 只写 `wiki/calendar/`；课程、阅读、日志、计划表都只读。
import { readFile, writeFile, readdir, rename, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { parseCourse } from "../course/course-parse.mjs";

const DAY_PAD = (n) => String(n).padStart(2, "0");
const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(message) {
  process.stderr.write(`calendar: ${message}\n`);
  process.exit(1);
}

function isMonth(text) {
  if (!MONTH_RE.test(text)) return false;
  const month = Number(text.slice(5, 7));
  return month >= 1 && month <= 12;
}

function isDate(text) {
  if (!DATE_RE.test(text)) return false;
  const time = Date.parse(`${text}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === text;
}

// 解析 CLI 参数：位置参数入 positional，其余按 --key value 读入 options。
function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const body = token.slice(2);
    if (body.includes("=")) {
      const eq = body.indexOf("=");
      options[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      options[body] = true;
    } else {
      options[body] = next;
      i += 1;
    }
  }
  return { positional, options };
}

function wikiDir(vault) {
  return join(vault, "wiki");
}

function requireVault(vault) {
  const dir = wikiDir(vault);
  if (!existsSync(dir)) fail(`不是 Wiki 库根目录：${vault}（缺少 wiki/ 子目录）`);
  return dir;
}

// 原子写入：写临时文件再 rename，避免半截文件。
async function writeAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, file);
}

// ---- 各来源的解析（纯函数：输入文本/目录内容，输出该来源的日期条目）----

// 课程学习记录标题 `### YYYY-MM-DD-NN` → { date: { records: [{course, heading}] } }
function collectCourseRecords(course) {
  const found = [];
  for (const record of course.records) {
    if (!isDate(record.date)) continue;
    found.push({ date: record.date, course: course.slug, heading: record.heading });
  }
  return found;
}

// 课程计划表带日期的行 → { date: { plans: [{course, label}] } }
function collectCoursePlans(course) {
  return course.plan
    .filter((entry) => isDate(entry.date))
    .map((entry) => ({ date: entry.date, course: course.slug, label: entry.label }));
}

// 课程页 `## Today` 里没打勾的「讲后读 … · YYYY-MM-DD 读」→ 当天的 readingDue。
function collectAfterReads(course) {
  const lines = course.text.split("\n");
  const start = lines.findIndex((line) => /^##\s+Today\s*$/.test(line));
  if (start === -1) return [];
  const found = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const match = line.match(/^- \[ \] 讲后读 (.+?) · (\d{4}-\d{2}-\d{2}) 读/);
    if (!match || !isDate(match[2])) continue;
    found.push({ date: match[2], slug: `${course.slug}#讲后读-${found.length + 1}`, title: `讲后读 ${match[1].trim()}（${course.title}）` });
  }
  return found;
}

async function loadCourses(vault) {
  const dir = join(wikiDir(vault), "courses");
  if (!existsSync(dir)) return [];
  const names = await readdir(dir);
  const courses = [];
  for (const name of names.filter((n) => n.endsWith(".md") && !n.startsWith(".")).sort()) {
    const text = await readFile(join(dir, name), "utf8");
    courses.push({ ...parseCourse(text, basename(name, ".md")), text });
  }
  return courses;
}

// 阅读页 frontmatter 的 due → { date: { readingDue: [{slug, title}] } }
async function collectReadingDue(vault) {
  const dir = join(wikiDir(vault), "reading");
  if (!existsSync(dir)) return [];
  const names = await readdir(dir);
  const found = [];
  for (const name of names.filter((n) => n.endsWith(".md") && !n.startsWith(".")).sort()) {
    const text = await readFile(join(dir, name), "utf8");
    const due = frontmatterField(text, "due");
    if (!due || !isDate(due)) continue;
    found.push({ date: due, slug: basename(name, ".md"), title: pageTitle(text) });
  }
  return found;
}

// 单行 frontmatter 字段值（双引号包裹则去引号）。
function frontmatterField(text, key) {
  const lines = text.split("\n");
  if (lines[0] !== "---") return "";
  const end = lines.indexOf("---", 1);
  if (end === -1) return "";
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([A-Za-z_][\w-]*):\s?(.*)$/);
    if (match && match[1] === key) {
      let value = match[2].trim();
      if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1);
      return value;
    }
  }
  return "";
}

function pageTitle(text) {
  for (const line of text.split("\n")) {
    const match = line.match(/^#\s+(.+)$/);
    if (match) return match[1].trim();
  }
  return "";
}

// wiki/log.md 的 `## [YYYY-MM-DD] …` → { date: { log: [string] } }
async function collectLog(vault) {
  const file = join(wikiDir(vault), "log.md");
  if (!existsSync(file)) return [];
  const text = await readFile(file, "utf8");
  const found = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^##\s+\[(\d{4}-\d{2}-\d{2})\]\s*(.*)$/);
    if (match && isDate(match[1])) {
      found.push({ date: match[1], text: match[2].trim() });
    }
  }
  return found;
}

// wiki/calendar/YYYY-MM-DD.md 的正文 → { date: { note } }
async function collectNotes(vault) {
  const dir = join(wikiDir(vault), "calendar");
  if (!existsSync(dir)) return [];
  const names = await readdir(dir);
  const found = [];
  for (const name of names.filter((n) => DATE_RE.test(basename(n, ".md"))).sort()) {
    const date = basename(name, ".md");
    found.push({ date, note: noteBody(await readFile(join(dir, name), "utf8")) });
  }
  return found;
}

// 笔记正文：去掉 frontmatter 与首尾空行。
function noteBody(text) {
  const lines = text.split("\n");
  let body = lines;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end !== -1) body = lines.slice(end + 1);
  }
  return body.join("\n").replace(/^\s+/, "").replace(/\s+$/, "");
}

// ---- 聚合 ----

async function collectMonth(vault, month) {
  const days = {};
  const bucket = (date) => {
    if (!days[date]) days[date] = { records: [], plans: [], readingDue: [], log: [], note: null };
    return days[date];
  };
  const inMonth = (date) => date.startsWith(month);

  const courses = await loadCourses(vault);
  for (const course of courses) {
    for (const record of collectCourseRecords(course)) {
      if (inMonth(record.date)) bucket(record.date).records.push({ course: record.course, heading: record.heading });
    }
    for (const plan of collectCoursePlans(course)) {
      if (inMonth(plan.date)) bucket(plan.date).plans.push({ course: plan.course, label: plan.label });
    }
  }
  for (const item of await collectReadingDue(vault)) {
    if (inMonth(item.date)) bucket(item.date).readingDue.push({ slug: item.slug, title: item.title });
  }
  for (const course of courses) {
    for (const item of collectAfterReads(course)) {
      if (inMonth(item.date)) bucket(item.date).readingDue.push({ slug: item.slug, title: item.title });
    }
  }
  for (const item of await collectLog(vault)) {
    if (inMonth(item.date)) bucket(item.date).log.push(item.text);
  }
  for (const item of await collectNotes(vault)) {
    if (inMonth(item.date)) bucket(item.date).note = item.note;
  }
  return days;
}

/** 把 `days` 中没有任何内容的日期去掉，只留有内容的日期。 */
function nonEmptyDays(days) {
  const out = {};
  for (const [date, entry] of Object.entries(days)) {
    const hasContent =
      entry.records.length || entry.plans.length || entry.readingDue.length || entry.log.length || entry.note;
    if (hasContent) out[date] = entry;
  }
  return out;
}

// ---- 输出 ----

function output(options, data, render) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(data)}\n`);
    return;
  }
  process.stdout.write(`${typeof render === "function" ? render() : render}\n`);
}

function summarizeDay(date, entry) {
  const marks = [];
  if (entry.records.length) marks.push(`● 学习记录 ${entry.records.length}`);
  if (entry.plans.length) marks.push(`◆ 计划 ${entry.plans.length}`);
  if (entry.readingDue.length) marks.push(`▲ 阅读到期 ${entry.readingDue.length}`);
  if (entry.log.length) marks.push(`log ${entry.log.length}`);
  if (entry.note) marks.push("✎ 笔记");
  return `${date}｜${marks.join("｜")}`;
}

async function commandMonth(vault, positional, options) {
  const month = positional[0];
  if (!month) fail("month 需要 <YYYY-MM>");
  if (!isMonth(month)) fail(`月份格式非法：${month}（应为 YYYY-MM）`);
  const days = nonEmptyDays(await collectMonth(vault, month));
  const result = { month, days };
  output(options, result, () => {
    const dates = Object.keys(days).sort();
    if (dates.length === 0) return `${month}：无内容`;
    return [`${month}：${dates.length} 个有内容的日期`, ...dates.map((date) => summarizeDay(date, days[date]))].join("\n");
  });
}

async function commandGet(vault, positional, options) {
  const date = positional[0];
  if (!date) fail("get 需要 <YYYY-MM-DD>");
  if (!isDate(date)) fail(`日期格式非法：${date}（应为 YYYY-MM-DD）`);
  const month = date.slice(0, 7);
  const days = await collectMonth(vault, month);
  const entry = days[date] ?? { records: [], plans: [], readingDue: [], log: [], note: null };
  const result = { date, ...entry };
  output(options, result, () => {
    const lines = [`${date}`];
    if (entry.records.length) {
      lines.push("学习记录：");
      for (const record of entry.records) lines.push(`- ${record.course}｜${record.heading}`);
    }
    if (entry.plans.length) {
      lines.push("计划：");
      for (const plan of entry.plans) lines.push(`- ${plan.course}｜${plan.label}`);
    }
    if (entry.readingDue.length) {
      lines.push("阅读到期：");
      for (const item of entry.readingDue) lines.push(`- ${item.slug}｜${item.title}`);
    }
    if (entry.log.length) {
      lines.push("日志：");
      for (const text of entry.log) lines.push(`- ${text}`);
    }
    lines.push(`笔记：${entry.note ? entry.note : "（无）"}`);
    return lines.join("\n");
  });
}

async function commandWrite(vault, positional, options) {
  const date = positional[0];
  if (!date) fail("write 需要 <YYYY-MM-DD>");
  if (!isDate(date)) fail(`日期格式非法：${date}（应为 YYYY-MM-DD）`);
  const text = await readText(options);
  const dir = join(wikiDir(vault), "calendar");
  const file = join(dir, `${date}.md`);
  if (!text || !text.trim()) {
    if (existsSync(file)) await unlink(file);
    output(options, { date, file: null, wrote: false }, `write: ${date} 正文为空，已删除笔记文件`);
    return;
  }
  await mkdir(dir, { recursive: true });
  const body = `${text.replace(/\s+$/, "")}\n`;
  await writeAtomic(file, `---\ndate: ${date}\n---\n\n${body}`);
  output(options, { date, file, wrote: true }, `write: ${date} → ${file}`);
}

// 读取正文：优先 --text，其次 --stdin（从标准输入读）。
async function readText(options) {
  if (typeof options.text === "string") return options.text;
  if (options.stdin) return readStdin();
  fail("write 需要 --text <string> 或 --stdin");
  return "";
}

function readStdin() {
  return new Promise((resolveStdin, rejectStdin) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolveStdin(data));
    process.stdin.on("error", rejectStdin);
  });
}

function usage() {
  return [
    "Xuegen 日历（calendar）",
    "",
    "用法：",
    "  node calendar.mjs month <vault> <YYYY-MM> [--json]",
    "  node calendar.mjs get <vault> <YYYY-MM-DD> [--json]",
    "  node calendar.mjs write <vault> <YYYY-MM-DD> (--text <string> | --stdin)",
    "",
    "<vault> 为 Wiki 库根目录（须含 wiki/ 子目录）。",
    "month/get 聚合：课程学习记录、课程计划表日期行、阅读页 due、课程页 Today 里的讲后读、wiki/log.md、wiki/calendar/ 笔记。",
    "write 只写 wiki/calendar/；正文为空则删除该文件。",
  ].join("\n");
}

async function main() {
  const raw = process.argv.slice(2);
  if (raw.length === 0 || raw[0] === "--help" || raw[0] === "-h") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const command = raw[0];
  const { positional, options } = parseArgs(raw.slice(1));
  if (command === "month") {
    const vault = resolve(positional[0] ?? fail("month 需要 vault 路径"));
    requireVault(vault);
    await commandMonth(vault, positional.slice(1), options);
  } else if (command === "get") {
    const vault = resolve(positional[0] ?? fail("get 需要 vault 路径"));
    requireVault(vault);
    await commandGet(vault, positional.slice(1), options);
  } else if (command === "write") {
    const vault = resolve(positional[0] ?? fail("write 需要 vault 路径"));
    requireVault(vault);
    await commandWrite(vault, positional.slice(1), options);
  } else {
    fail(`未知命令：${command}`);
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
