#!/usr/bin/env node
// Xuegen 课程状态文件维护：只读锁、完整性校验、看板生成。
// 无第三方依赖。用法：
//   node course-state.mjs lock <file...>            设为只读 0444
//   node course-state.mjs unlock <file...>          临时放开为 0644（写入前）
//   node course-state.mjs verify <coursesDir> [看板文件]   校验锁、标记与必要段落；看板是否过期
//   node course-state.mjs dashboard <coursesDir> <outFile> 生成只读看板
import { readFile, writeFile, readdir, stat, chmod } from "node:fs/promises";
import { join, resolve, basename } from "node:path";

const READONLY_MODE = 0o444;
const WRITABLE_MODE = 0o644;
const STATE_MARKER = "xuegen:course-state";
const DASHBOARD_MARKER = "xuegen:courses-dashboard";
const REQUIRED_SECTIONS = ["Overall Goals", "This Week", "Today", "Next Session", "Learning Record"];

function fail(message) {
  process.stderr.write(`course-state: ${message}\n`);
  process.exit(1);
}

function localDate() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function sectionLines(lines, heading) {
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

function isTask(line) {
  return /^- \[[ xX]\]/.test(line.trim());
}

function tasksOf(lines, heading) {
  const body = sectionLines(lines, heading);
  if (!body) return null;
  return body
    .filter(isTask)
    .map((line) => ({ done: /^- \[[xX]\]/.test(line.trim()), label: taskLabel(line) }));
}

function taskLabel(line) {
  let label = line.trim().replace(/^- \[[ xX]\]\s*/, "");
  label = label.replace(/\*\*/g, "");
  const cut = label.search(/[（(](完成条件|已完成|条件)/);
  if (cut > 0) label = label.slice(0, cut);
  label = label.trim();
  return label.length > 80 ? `${label.slice(0, 77)}…` : label;
}

function firstLineAfter(lines, heading, { taskLines = false } = {}) {
  const body = sectionLines(lines, heading);
  if (!body) return null;
  for (const line of body) {
    const text = line.trim();
    if (!text) continue;
    if (!taskLines && isTask(line)) continue;
    if (/^[#>|]/.test(text)) continue;
    return text;
  }
  return null;
}

function keyFact(lines, name) {
  const match = lines.find((line) => line.trim().startsWith(`- ${name}：`));
  return match ? match.trim().slice(name.length + 3).trim() : null;
}

function lastRecordDate(lines) {
  const body = sectionLines(lines, "## Learning Record");
  if (!body) return null;
  const dates = body
    .map((line) => line.trim().match(/^###\s+(\d{4}-\d{2}-\d{2})-\d+/))
    .filter(Boolean)
    .map((match) => match[1]);
  return dates.length ? dates[dates.length - 1] : null;
}

function parseCourse(text, slug) {
  const lines = text.split("\n");
  const titleLine = lines.find((line) => line.startsWith("# "));
  const overall = tasksOf(lines, "## Overall Goals") ?? [];
  const week = tasksOf(lines, "## This Week") ?? [];
  return {
    slug,
    title: titleLine ? titleLine.slice(2).trim() : slug,
    currentWeek: keyFact(lines, "当前周"),
    weekLabel: firstLineAfter(lines, "## This Week"),
    overall,
    week,
    lastRecord: lastRecordDate(lines),
    next: firstLineAfter(lines, "## Next Session"),
    marked: text.includes(STATE_MARKER),
    sections: REQUIRED_SECTIONS.filter((name) => sectionLines(lines, `## ${name}`) === null),
  };
}

function progress(tasks) {
  return `${tasks.filter((task) => task.done).length}/${tasks.length}`;
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
      `| [[courses/${course.slug}\\|${cell(course.title)}]] | ${cell(course.currentWeek)} | ${progress(course.week)} | ${progress(course.overall)} | ${cell(course.lastRecord ?? "未记录")} | ${cell(course.next)} |`,
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

async function loadCourses(dir) {
  const entries = await readdir(dir);
  const slugs = entries
    .filter((name) => name.endsWith(".md") && !name.startsWith("."))
    .map((name) => basename(name, ".md"))
    .sort();
  if (slugs.length === 0) fail(`no course state files in ${dir}`);
  return Promise.all(
    slugs.map(async (slug) => parseCourse(await readFile(join(dir, `${slug}.md`), "utf8"), slug)),
  );
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
  const courses = await loadCourses(coursesDir);
  const dirMode = await mode(coursesDir);
  if (dirMode & 0o222) {
    problems.push(`${coursesDir} 目录可写（${dirMode.toString(8)}），状态文件可被删除；应为 555`);
  }
  for (const course of courses) {
    const file = join(coursesDir, `${course.slug}.md`);
    const fileMode = await mode(file);
    if (fileMode !== READONLY_MODE) problems.push(`${file} 权限为 ${fileMode.toString(8)}，应为 444（人为可写）`);
    if (!course.marked) problems.push(`${file} 缺少 ${STATE_MARKER} 标记`);
    if (course.sections.length) problems.push(`${file} 缺少段落：${course.sections.join(", ")}`);
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
      `${course.slug}: ${course.title}｜${course.currentWeek ?? "当前周？"}｜本周 ${progress(course.week)}｜总目标 ${progress(course.overall)}｜上次记录 ${course.lastRecord ?? "—"}\n`,
    );
  }
  if (problems.length) {
    for (const problem of problems) process.stderr.write(`course-state: ${problem}\n`);
    process.exit(1);
  }
  process.stdout.write("verify: OK（只读锁、标记、段落一致性均通过）\n");
}

const [command, ...args] = process.argv.slice(2);
if (!command) fail("用法：lock|unlock|verify|dashboard");

if (command === "lock" || command === "unlock") {
  if (args.length === 0) fail(`${command} 需要文件参数`);
  await setMode(args, command === "lock" ? READONLY_MODE : WRITABLE_MODE);
} else if (command === "verify") {
  if (args.length === 0) fail("verify 需要 courses 目录");
  await verify(resolve(args[0]), args[1] ? resolve(args[1]) : null);
} else if (command === "dashboard") {
  if (args.length < 2) fail("dashboard 需要 courses 目录与输出文件");
  const courses = await loadCourses(resolve(args[0]));
  const outFile = resolve(args[1]);
  const text = renderDashboard(courses, localDate());
  await chmod(outFile, WRITABLE_MODE).catch(() => {});
  await writeFile(outFile, text, "utf8");
  await chmod(outFile, READONLY_MODE);
  process.stdout.write(
    `${outFile}（${courses.length} 门课程：${courses.map((course) => `${course.slug} 本周 ${progress(course.week)}`).join("，")}）\n`,
  );
} else {
  fail(`未知命令：${command}`);
}
