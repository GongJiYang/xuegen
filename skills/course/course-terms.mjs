#!/usr/bin/env node
// 总控「术语」数据：把课程收课记录里「存库」行链接的概念页按课次分组列出（只读）。
// 每条记录是一个 ### 标题开头的块；记录在两处：课程页 wiki/courses/<slug>.md 的
// ## Learning Record 段，与已归档的 wiki/courses/<slug>/records/YYYY-MM.md（整份文件）。
// 无第三方依赖，不写任何文件。用法：
//   node course-terms.mjs list <库根> [--json] [--since YYYY-MM-DD]
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { findSection, parseCourse } from "./course-parse.mjs";

const MONTH_FILE_RE = /^\d{4}-\d{2}\.md$/;
const BLOCK_HEADING_RE = /^###\s+(.+?)\s*$/;
const SECTION_RE = /^##\s/;
const DONE_RE = /^\s*(?:[-*]\s+)?完成：\s*(\S+)/;
// 存库行：`- 存库：…`；收课记录里也写成加粗的 `- **存库**：…`，两种都认。
const DEPOSIT_RE = /^\s*[-*]\s+\**存库\**\s*[：:]/;
const LINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
const DATE_RE = /^(\d{4}-\d{2}-\d{2})/;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const CONCEPT_PREFIX = "knowledge/concepts/";
const MAX_DEFINITION = 60;

function fail(message) {
  process.stderr.write(`course-terms: ${message}\n`);
  process.exit(1);
}

/** 把行切成三级标题块：块到下一个 `### ` 或 `## ` 为止（`## ` 之后的内容不属于任何块）。 */
function splitBlocks(lines) {
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const heading = line.match(BLOCK_HEADING_RE);
    if (heading) {
      current = { heading: heading[1], lines: [] };
      blocks.push(current);
      continue;
    }
    if (SECTION_RE.test(line)) {
      current = null;
      continue;
    }
    if (current) current.lines.push(line);
  }
  return blocks;
}

/**
 * 课次：先找块里「完成：」行的第一个词；没有时取标题括号里「收课：」到
 * ` · `（或括号结尾）之间的部分；都没有返回 null。
 */
function lessonOf(block) {
  for (const line of block.lines) {
    const match = line.match(DONE_RE);
    if (match) return match[1];
  }
  const index = block.heading.indexOf("收课：");
  if (index === -1) return null;
  const rest = block.heading.slice(index + 3);
  const cut = rest.search(/ · |）|\)/);
  const lesson = (cut === -1 ? rest : rest.slice(0, cut)).trim();
  return lesson || null;
}

/** 块里所有存库行中的概念页链接：[{target, alias}]；非 concepts 目标忽略。 */
function depositLinks(block) {
  const links = [];
  for (const line of block.lines) {
    if (!DEPOSIT_RE.test(line)) continue;
    for (const match of line.matchAll(LINK_RE)) {
      const target = match[1].trim();
      if (!target.startsWith(CONCEPT_PREFIX)) continue;
      links.push({ target, alias: match[2] ? match[2].trim() : null });
    }
  }
  return links;
}

/**
 * `## Definition` 下第一个非空段落的第一句：到第一个「。」或换行为止；
 * 去掉 `**`、`` ` ``、`$`，超过 60 字截断加「…」。没有这一节返回 null。
 */
function definitionOf(lines) {
  const start = lines.findIndex((line) => /^##\s+Definition\b/.test(line.trim()));
  if (start === -1) return null;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (SECTION_RE.test(line)) break;
    const text = line.trim();
    if (!text || /^#/.test(text)) continue;
    const cut = text.indexOf("。");
    const clean = (cut === -1 ? text : text.slice(0, cut)).replace(/[*`$]/g, "").trim();
    if (!clean) return null;
    const chars = [...clean];
    return chars.length > MAX_DEFINITION ? `${chars.slice(0, MAX_DEFINITION).join("")}…` : clean;
  }
  return null;
}

/** 概念页内容：H1 标题与 Definition 首句；文件读不到时 exists 为 false。 */
async function conceptInfo(file) {
  const text = await readFile(file, "utf8").catch(() => null);
  if (text === null) return { title: null, definition: null, exists: false };
  const lines = text.split("\n");
  const h1 = lines.find((line) => line.startsWith("# "));
  return {
    title: h1 ? h1.slice(2).trim() : null,
    definition: definitionOf(lines),
    exists: true,
  };
}

/** 一门课的全部记录块：课程页 `## Learning Record` 段 + records/ 下各月份归档。 */
async function courseBlocks(coursesDir, slug, course) {
  const blocks = [];
  const section = findSection(course.sections, "Learning Record");
  if (section) blocks.push(...splitBlocks(section.lines));
  const recordsDir = join(coursesDir, slug, "records");
  if (existsSync(recordsDir)) {
    const months = (await readdir(recordsDir)).filter((name) => MONTH_FILE_RE.test(name)).sort();
    for (const month of months) {
      const text = await readFile(join(recordsDir, month), "utf8");
      blocks.push(...splitBlocks(text.split("\n")));
    }
  }
  return blocks;
}

/**
 * 遍历 wiki/courses/*.md，把含存库链接的记录块按「课程 + 日期 + 课次」合并成组，
 * 组内术语按 path 去重、保持出现顺序；返回按日期倒序、同日按课程 slug 升序的数组。
 */
async function collect(root, coursesDir) {
  const names = await readdir(coursesDir);
  const slugs = names
    .filter((name) => name.endsWith(".md") && !name.startsWith("."))
    .map((name) => basename(name, ".md"))
    .sort();
  const groups = [];
  const index = new Map();
  for (const slug of slugs) {
    const text = await readFile(join(coursesDir, `${slug}.md`), "utf8");
    const course = parseCourse(text, slug);
    for (const block of await courseBlocks(coursesDir, slug, course)) {
      const links = depositLinks(block);
      if (links.length === 0) continue;
      const date = block.heading.match(DATE_RE)?.[1] ?? "";
      const lesson = lessonOf(block);
      const key = `${slug}\n${date}\n${lesson ?? ""}`;
      let group = index.get(key);
      if (!group) {
        group = { course: slug, courseTitle: course.title, date, lesson, terms: [], seen: new Set() };
        index.set(key, group);
        groups.push(group);
      }
      for (const link of links) {
        const target = link.target.split("#")[0];
        const file = join(root, "wiki", `${target}.md`);
        if (group.seen.has(file)) continue;
        group.seen.add(file);
        const info = await conceptInfo(file);
        group.terms.push({
          title: link.alias ?? info.title ?? target.split("/").pop(),
          path: file,
          definition: info.definition,
          exists: info.exists,
        });
      }
    }
  }
  return groups
    .map(({ seen, ...rest }) => rest)
    .sort((a, b) => b.date.localeCompare(a.date) || a.course.localeCompare(b.course));
}

const [command, ...args] = process.argv.slice(2);
if (!command) fail("用法：node course-terms.mjs list <库根> [--json] [--since YYYY-MM-DD]");
if (command !== "list") fail(`未知命令：${command}`);

const positional = [];
let since = null;
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--json") continue;
  if (arg === "--since") {
    since = args[i + 1] ?? "";
    i += 1;
    continue;
  }
  if (arg.startsWith("--")) fail(`未知参数：${arg}`);
  positional.push(arg);
}
if (since !== null && !DATE_SHAPE.test(since)) fail(`--since 日期非法：${since || "缺值"}`);
if (positional.length === 0) fail("list 需要库根目录");
if (positional.length > 1) fail(`多余参数：${positional.slice(1).join(" ")}`);

const root = resolve(positional[0]);
if (!existsSync(root)) fail(`库根不存在：${root}`);
const coursesDir = join(root, "wiki", "courses");
if (!existsSync(coursesDir)) fail(`库内缺少 wiki/courses 目录：${coursesDir}`);

const groups = (await collect(root, coursesDir)).filter(
  (group) => since === null || group.date >= since,
);
if (args.includes("--json")) {
  process.stdout.write(`${JSON.stringify(groups, null, 2)}\n`);
} else if (groups.length === 0) {
  process.stdout.write("（没有存库记录）\n");
} else {
  for (const group of groups) {
    process.stdout.write(
      `${group.date || "日期未知"}｜${group.courseTitle}｜${group.lesson ?? "课次未知"}｜${group.terms.length} 个术语\n`,
    );
    for (const term of group.terms) {
      process.stdout.write(`  - ${term.title}${term.exists ? "" : "（页面不存在）"}${term.definition ? ` — ${term.definition}` : ""}\n`);
    }
  }
}
