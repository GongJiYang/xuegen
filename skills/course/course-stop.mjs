#!/usr/bin/env node
// 停用 / 恢复一门课（设计稿 logic-ui-1116.html B 节，用户 11-16）。走计划暂存同一台事务机：
//   node course-stop.mjs stop   <vault> <slug> --workspace <工作区> [--today YYYY-MM-DD] [--reason <原因>] [--json]
//   node course-stop.mjs resume <vault> <slug> --workspace <工作区> [--today YYYY-MM-DD] [--json]
// 停用 = 课程页 ## Key Facts 加一行「- 状态：停用（日期，原因）」，jj 记「停用 <slug> <日期>」；
// 恢复 = 去掉那行、没上的课次顺延到 <today> 起（同开课顺延），jj 记「恢复 <slug> <日期>」。
// 无第三方依赖；暂存、校验、原子提交、上锁、看板、jj 全复用 close/staging.mjs。
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isArchived } from "./course-parse.mjs";
import { completedIds, readSchedule } from "./course-schedule.mjs";
import { localDate } from "./close/durable.mjs";
import { commitInternal, gatherCheck, shiftStaged, stageInternal } from "./close/staging.mjs";

// 与 course-parse.mjs 的 ARCHIVED_RE 相同（它没导出，就近复制，注释写来源）。
const ARCHIVED_LINE_RE = /^-\s*状态：停用（\d{4}-\d{2}-\d{2}/;
const KEY_FACTS_RE = /^##\s+Key Facts\s*$/;
const H2_RE = /^##\s/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const DEFAULT_REASON = "用户在总进度里停用";

function fail(message) {
  process.stderr.write(`course-stop: ${message}\n`);
  process.exit(1);
}

// 暂存建好到提交成功之间，任何失败——抛错或 fail() 直接 process.exit——都要删掉暂存：
// 不然 <ws>/.close/<slug>-* 留下未提交暂存，之后这门课的停用/恢复永远被
// 「已有未提交的暂存」挡住，桌面端没有界面能清。checkOrDrop 与这里的 exit 钩子同责。
let pendingStaging = null;
process.on("exit", (code) => {
  if (code === 0 || pendingStaging === null) return;
  try {
    rmSync(pendingStaging, { recursive: true, force: true });
  } catch {
    /* 删不掉就留着，人能看到 */
  }
});

/** 库里课程页全文；页不存在时报错退出（stageInternal 自己的「没有这门课」检查之前先给停用状态判定）。 */
function vaultPageText(vault, slug) {
  const file = join(vault, "wiki", "courses", `${slug}.md`);
  if (!existsSync(file)) fail(`没有这门课：wiki/courses/${slug}.md`);
  return readFileSync(file, "utf8");
}

/** `## Key Facts` 节的行区间：标题行下标与下一个 `## ` 的下标（或行数）；没有这一节返回 null。 */
function keyFactsRange(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => KEY_FACTS_RE.test(line.trim()));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (H2_RE.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { lines, start, end };
}

/** 在 ## Key Facts 标题下第一行前插入停用行；没有这一节报错退出。 */
function insertStopLine(text, today, reason) {
  const range = keyFactsRange(text);
  if (range === null) fail("课程页没有 ## Key Facts 一节，写不了停用行");
  const lines = [...range.lines];
  lines.splice(range.start + 1, 0, `- 状态：停用（${today}，${reason}）`);
  return lines.join("\n");
}

/** 删掉 ## Key Facts 节里的停用行（可以不止一行，全删）；没有这一节报错退出。 */
function removeStopLines(text) {
  const range = keyFactsRange(text);
  if (range === null) fail("课程页没有 ## Key Facts 一节");
  return range.lines
    .filter((line, index) => index <= range.start || index >= range.end || !ARCHIVED_LINE_RE.test(line.trim()))
    .join("\n");
}

/** 顺延后的第一节没上的新课次日期；没有排期或没有没上的课次返回 null。 */
function firstUndoneLessonDate(text) {
  const schedule = readSchedule(text);
  if (schedule === null) return null;
  const done = completedIds(text);
  const row = schedule.rows.find((item) => item.kind === "new" && !done.has(item.id));
  return row ? row.date : null;
}

/** 提交前自查：校验不过就删掉暂存再报错（不留未提交暂存挡住下次停用/恢复）。 */
function checkOrDrop(staging) {
  const { result } = gatherCheck(staging);
  if (result.ok) return;
  const lines = result.problems.map((problem) => `  ${problem.path}: [${problem.kind}] ${problem.detail}`).join("\n");
  rmSync(staging, { recursive: true, force: true });
  fail(`校验未通过（什么都不写）：\n${lines}`);
}

function emit(json, payload, line) {
  process.stdout.write(json ? `${JSON.stringify(payload)}\n` : `${line}\n`);
}

function cmdStop(vault, slug, workspace, today, reason, json) {
  if (isArchived(vaultPageText(vault, slug))) fail("这门课已经停用了");
  const staging = stageInternal(vault, slug, workspace, { kind: "plan" });
  pendingStaging = staging;
  const rel = `wiki/courses/${slug}.md`;
  const file = join(staging, rel);
  writeFileSync(file, insertStopLine(readFileSync(file, "utf8"), today, reason));
  checkOrDrop(staging);
  const out = commitInternal(staging, "停用");
  pendingStaging = null;
  emit(
    json,
    { slug, action: "stop", date: today, jj: out.jj, firstLesson: null },
    `已停用 ${slug}（${today}，已提交，jj: ${out.jj}）`,
  );
  if (!json && out.board !== "ok") process.stdout.write(`看板未刷新：${out.board}\n`);
}

function cmdResume(vault, slug, workspace, today, json) {
  if (!isArchived(vaultPageText(vault, slug))) fail("这门课没有停用");
  const staging = stageInternal(vault, slug, workspace, { kind: "plan" });
  pendingStaging = staging;
  const rel = `wiki/courses/${slug}.md`;
  const file = join(staging, rel);
  writeFileSync(file, removeStopLines(readFileSync(file, "utf8")));
  // 恢复后从今天起继续上课：没上的课次顺延到 today 起（同收课的 shift）。
  shiftStaged(staging, today, null);
  const firstLesson = firstUndoneLessonDate(readFileSync(file, "utf8"));
  checkOrDrop(staging);
  const out = commitInternal(staging, "恢复");
  pendingStaging = null;
  emit(
    json,
    { slug, action: "resume", date: today, jj: out.jj, firstLesson },
    `已恢复 ${slug}（${today}，已提交，jj: ${out.jj}）${firstLesson === null ? "" : `，下一节 ${firstLesson}`}`,
  );
  if (!json && out.board !== "ok") process.stdout.write(`看板未刷新：${out.board}\n`);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (["json", "help"].includes(key)) flags[key] = true;
    else {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) fail(`--${key} 缺少值`);
      flags[key] = value;
      i += 1;
    }
  }
  return { positional, flags };
}

function usage() {
  return [
    "停用 / 恢复一门课（走计划暂存的事务机：校验、原子提交、上锁、看板、jj）",
    "",
    "用法：",
    "  node course-stop.mjs stop   <vault> <slug> --workspace <工作区> [--today YYYY-MM-DD] [--reason <原因>] [--json]",
    "  node course-stop.mjs resume <vault> <slug> --workspace <工作区> [--today YYYY-MM-DD] [--json]",
    "",
    "stop：课程页 ## Key Facts 加一行「- 状态：停用（<日期>，<原因>）」。",
    "resume：去掉那行，没上的课次顺延到 <日期> 起。",
  ].join("\n");
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [action, vaultArg, slug] = positional;
  if (flags.help || !action) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (action !== "stop" && action !== "resume") fail(`未知命令：${action}\n${usage()}`);
  const vault = resolve(vaultArg ?? fail(`${action} 需要 <vault>`));
  const workspace = resolve(flags.workspace ?? fail(`${action} 需要 --workspace <工作区>`));
  if (!slug || !SLUG_RE.test(slug)) fail(`${action} 需要 <slug>（小写字母、数字和连字符）`);
  const today = flags.today ?? localDate();
  if (flags.today !== undefined && !DATE_RE.test(flags.today)) fail("--today 要写成 YYYY-MM-DD");
  const json = Boolean(flags.json);
  // --reason "" 按没给处理，用默认原因。
  if (action === "stop") cmdStop(vault, slug, workspace, today, flags.reason || DEFAULT_REASON, json);
  else cmdResume(vault, slug, workspace, today, json);
}

// 主模块判定必须比真实路径：经符号链接调用时 argv[1] 与 import.meta.url 字面不同。
function isMain() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    main();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
