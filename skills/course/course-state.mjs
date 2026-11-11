#!/usr/bin/env node
// Xuegen 课程状态文件维护：只读锁、完整性校验、看板生成。
// 无第三方依赖。解析逻辑在共享的 course-parse.mjs，本脚本只管锁、校验与看板。
// 用法：
//   node course-state.mjs lock <file...>            设为只读 0444
//   node course-state.mjs unlock <file...>          临时放开为 0644（写入前）
//   node course-state.mjs verify <coursesDir> [看板文件]   校验锁、标记与必要段落；看板是否过期
//   node course-state.mjs dashboard <coursesDir> <outFile> 生成只读看板
//   node course-state.mjs list <coursesDir> [--json]       列出课程结构化状态
//   node course-state.mjs after-read <课程文件> <标签> [--date YYYY-MM-DD]   给「讲后读 <标签>」打勾（用户自报；行尾旧的 —— 备注去掉）
import { readFile, writeFile, stat, chmod, mkdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { listCourses, progressOf, toListEntry, STATE_MARKER } from "./course-parse.mjs";

const READONLY_MODE = 0o444;
const WRITABLE_MODE = 0o644;
const DASHBOARD_MARKER = "xuegen:courses-dashboard";

function fail(message) {
  process.stderr.write(`course-state: ${message}\n`);
  process.exit(1);
}

function localDate() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 任务完成数展示为 `已核实/总数`。 */
function progress(tasks) {
  const { done, total } = progressOf(tasks);
  return `${done}/${total}`;
}

/** 上次记录的展示文本：只用日期（保持看板与 dashboard 既有输出）。 */
function lastRecordLabel(record) {
  return record ? record.date : null;
}

function cell(text) {
  return (text ?? "—").replace(/\|/g, "\\|").replace(/\n/g, " ").trim() || "—";
}

function renderDashboard(courses, date) {
  const body = [];
  body.push(`共 ${courses.length} 门课程。状态源：\`wiki/courses/<slug>.md\`（只读锁）。`);
  body.push("");
  body.push("| 课程 | 当前周 | 本周 | 总目标 | 上次记录 | 下次起点 |");
  body.push("|---|---|---|---|---|---|");
  for (const course of courses) {
    body.push(
      `| [[courses/${course.slug}\\|${cell(course.title)}]] | ${cell(course.currentWeek)} | ${progress(course.week)} | ${progress(course.overall)} | ${cell(lastRecordLabel(course.lastRecord) ?? "未记录")} | ${cell(course.nextSession)} |`,
    );
  }
  body.push("");
  body.push("> 数字是「已核实的计划项」，不是掌握率。勾选只由收课流程按证据写入。");
  body.push("");
  for (const course of courses) {
    body.push(`## ${course.title}`, "");
    body.push(`- 状态源：[[courses/${course.slug}]]`);
    body.push(`- 当前周：${cell(course.currentWeek)}`);
    body.push(`- 本周安排：${cell(course.weekLabel)}`);
    body.push("");
    body.push(`### 本周活动（${progress(course.week)}）`, "");
    if (course.week.length === 0) body.push("- （本周未安排活动）");
    for (const task of course.week) body.push(`- [${task.done ? "x" : " "}] ${task.label}`);
    body.push("");
    body.push(`### 总目标（${progress(course.overall)}）`, "");
    if (course.overall.length === 0) body.push("- （总目标未设定）");
    for (const task of course.overall) body.push(`- [${task.done ? "x" : " "}] ${task.label}`);
    body.push("");
  }
  return [
    `<!-- ${DASHBOARD_MARKER} — 由 course-state.mjs 从 wiki/courses/*.md 生成（只读锁 0444）。勿手工编辑；请改状态源后重新生成。-->`,
    "",
    `# 课程看板`,
    ``,
    `Last updated: ${date}`,
    ...body,
  ].join("\n");
}

function stripDate(text) {
  return text
    .split("\n")
    .filter((line) => !line.startsWith("Last updated:"))
    .join("\n");
}

/**
 * 读取课程目录；没有状态文件时报错退出。
 * `requireMarker` 为 false 时连缺标记的页也读进来（verify 用：缺标记要报出来，而不是静默跳过）。
 */
async function loadCourses(dir, options = {}) {
  const courses = await listCourses(dir, options);
  if (courses.length === 0) fail(`no course state files in ${dir}`);
  return courses;
}

/**
 * 行尾旧的 AI 状态备注（「——…仍待读」之类）：从左往右扫，记全角/半角括号深度
 * （（( +1、）) −1），碰到第一个出现在深度 0 的「——」就切到行尾；没有就不删。
 * 括号内的「——」不动（旧备注自己带括号也不会失效）。
 * 打勾后这行已由「（用户自报，未检查，<date>）」说明状态，旧备注留着会让简报误报。
 */
function stripTailNote(line) {
  let depth = 0;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "（" || char === "(") depth += 1;
    else if (char === "）" || char === ")") depth = Math.max(0, depth - 1);
    else if (char === "—" && depth === 0 && line[i + 1] === "—") return line.slice(0, i).trimEnd();
  }
  return line.trimEnd();
}

/**
 * 「读完了」的确定性写入：把 `## Today` 里第一条未打勾、标签完全相等的
 * 「- [ ] 讲后读 <标签>」打勾，行尾旧的 —— 备注去掉，再在行尾记
 * 「（用户自报，未检查，<date>）」。
 * 解锁 → 写 → 上锁；写失败时恢复原权限。成功输出一行 JSON：
 * {"file": <绝对路径>, "label": <标签>, "reading": <阅读页 slug 或 null>,
 *  "book": <书房书页 slug 或 null>, "course": <课程 slug>,
 *  "pages": <「核心页已定：pp.…」的页码列表原文或 null>}。
 */
async function afterRead(file, label, date) {
  const target = resolve(file);
  const text = await readFile(target, "utf8");
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === "## Today");
  const end = start === -1 ? -1 : lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  const sectionEnd = start === -1 ? -1 : end === -1 ? lines.length : end;
  const prefix = "- [ ] 讲后读 ";
  let hit = -1;
  for (let index = start === -1 ? lines.length : start + 1; index < sectionEnd; index += 1) {
    const line = lines[index];
    if (!line.startsWith(prefix)) continue;
    const rest = line.slice(prefix.length);
    const cut = rest.indexOf(" · ");
    const lineLabel = (cut === -1 ? rest : rest.slice(0, cut)).trim();
    if (lineLabel === label) {
      hit = index;
      break;
    }
  }
  if (hit === -1) fail(`没有找到未打勾的讲后读：${label}`);
  // 打勾前的那一行里的「核心页已定：pp.…」页码列表；没有为 null。
  const pagesMatch = /核心页已定：\s*pp\.\s*([0-9–\-、,，\s]+)/.exec(lines[hit]);
  const pages =
    pagesMatch === null ? null : pagesMatch[1].trim().replace(/[、,，]+$/, "") || null;
  const originalMode = (await stat(target)).mode & 0o777;
  await chmod(target, WRITABLE_MODE);
  const next = lines.slice();
  next[hit] = `${stripTailNote(lines[hit].replace(/^- \[ \]/, "- [x]"))}（用户自报，未检查，${date}）`;
  try {
    await writeFile(target, next.join("\n"), "utf8");
  } catch (error) {
    await chmod(target, originalMode).catch(() => {});
    fail(error instanceof Error ? error.message : String(error));
  }
  await chmod(target, originalMode);
  const reading = /\[\[reading\/([^\]|]+)/.exec(text)?.[1] ?? null;
  const book = /\[\[shelf\/([^\]|]+)/.exec(text)?.[1] ?? null;
  const course = basename(target, ".md");
  process.stdout.write(`${JSON.stringify({ file: target, label, reading, book, course, pages })}\n`);
}

async function mode(file) {
  return (await stat(file)).mode & 0o777;
}

async function setMode(files, wanted) {
  for (const file of files) {
    const target = resolve(file);
    const directory = (await stat(target)).isDirectory();
    // 目录用 555/755：目录可写时，只读文件仍能被删除。
    const mode = directory ? (wanted === READONLY_MODE ? 0o555 : 0o755) : wanted;
    await chmod(target, mode);
    process.stdout.write(`${file} → ${mode.toString(8)}\n`);
  }
}

async function verify(coursesDir, dashboardFile) {
  const problems = [];
  // 缺标记的页也要读进来：否则删掉标记的课会被 listCourses 静默过滤，verify 报不出「缺少标记」。
  const courses = await loadCourses(coursesDir, { requireMarker: false });
  const dirMode = await mode(coursesDir);
  if (dirMode & 0o222) {
    problems.push(`${coursesDir} 目录可写（${dirMode.toString(8)}），状态文件可被删除；应为 555`);
  }
  for (const course of courses) {
    const file = join(coursesDir, `${course.slug}.md`);
    const fileMode = await mode(file);
    if (fileMode !== READONLY_MODE) problems.push(`${file} 权限为 ${fileMode.toString(8)}，应为 444（人为可写）`);
    if (!course.marked) problems.push(`${file} 缺少 ${STATE_MARKER} 标记`);
    if (course.missingSections.length) problems.push(`${file} 缺少段落：${course.missingSections.join(", ")}`);
    if (!course.currentWeek) problems.push(`${file} Key Facts 缺少「- 当前周：」`);
  }
  if (dashboardFile) {
    const expected = renderDashboard(courses, localDate());
    const actual = await readFile(dashboardFile, "utf8").catch(() => null);
    if (actual === null) problems.push(`${dashboardFile} 不存在`);
    else {
      if (stripDate(actual) !== stripDate(expected)) problems.push(`${dashboardFile} 与状态源不一致（看板过期）`);
      const dashMode = await mode(dashboardFile);
      if (dashMode !== READONLY_MODE) problems.push(`${dashboardFile} 权限为 ${dashMode.toString(8)}，应为 444`);
    }
  }
  for (const course of courses) {
    process.stdout.write(
      `${course.slug}: ${course.title}｜${course.currentWeek ?? "当前周？"}｜本周 ${progress(course.week)}｜总目标 ${progress(course.overall)}｜上次记录 ${lastRecordLabel(course.lastRecord) ?? "—"}\n`,
    );
  }
  if (problems.length) {
    for (const problem of problems) process.stderr.write(`course-state: ${problem}\n`);
    process.exit(1);
  }
  process.stdout.write("verify: OK（只读锁、标记、段落一致性均通过）\n");
}

/** 列出课程：`--json` 输出数组，否则一行一门。 */
async function listCommand(coursesDir, json) {
  const courses = await listCourses(coursesDir);
  const entries = [];
  for (const course of courses) {
    const file = join(coursesDir, `${course.slug}.md`);
    const changedAt = (await stat(file)).mtimeMs;
    entries.push({ ...toListEntry(course), changedAt: Math.floor(changedAt), file });
  }
  if (json) {
    process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
    return;
  }
  if (entries.length === 0) {
    process.stdout.write("（无课程状态文件）\n");
    return;
  }
  for (const entry of entries) {
    process.stdout.write(
      `${entry.slug}｜${entry.title}｜${entry.weekLabel ?? "本周未设定"}｜本周 ${entry.week.done}/${entry.week.total}｜总目标 ${entry.overall.done}/${entry.overall.total}｜上次记录 ${entry.lastRecord ? `${entry.lastRecord.date}-${entry.lastRecord.seq}` : "—"}\n`,
    );
  }
}

const [command, ...args] = process.argv.slice(2);
if (!command) fail("用法：lock|unlock|verify|dashboard|list|after-read");

if (command === "lock" || command === "unlock") {
  if (args.length === 0) fail(`${command} 需要文件参数`);
  await setMode(args, command === "lock" ? READONLY_MODE : WRITABLE_MODE);
} else if (command === "list") {
  if (args.length === 0) fail("list 需要 courses 目录");
  await listCommand(resolve(args[0]), args.includes("--json"));
} else if (command === "after-read") {
  if (args.length < 2) fail("after-read 需要课程文件与标签");
  const file = args[0];
  const label = args[1];
  const dateIndex = args.indexOf("--date");
  const date = dateIndex === -1 ? localDate() : args[dateIndex + 1];
  if (dateIndex !== -1 && (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))) fail(`--date 日期非法：${date ?? "缺值"}`);
  await afterRead(file, label, date ?? localDate());
} else if (command === "verify") {
  if (args.length === 0) fail("verify 需要 courses 目录");
  await verify(resolve(args[0]), args[1] ? resolve(args[1]) : null);
} else if (command === "dashboard") {
  if (args.length < 2) fail("dashboard 需要 courses 目录与输出文件");
  const courses = await loadCourses(resolve(args[0]));
  const outFile = resolve(args[1]);
  const text = renderDashboard(courses, localDate());
  await mkdir(dirname(outFile), { recursive: true });
  await chmod(outFile, WRITABLE_MODE).catch(() => {});
  await writeFile(outFile, text, "utf8");
  await chmod(outFile, READONLY_MODE);
  process.stdout.write(
    `${outFile}（${courses.length} 门课程：${courses.map((course) => `${course.slug} 本周 ${progress(course.week)}`).join("，")}）\n`,
  );
} else {
  fail(`未知命令：${command}`);
}
