#!/usr/bin/env node
// 领域总控数据（只读，不写文件）：
//   subjects — 各科目的概念页数、词条总数、有没有「## 领域小结」；
//   glossary — 一个科目的词表：每个概念页一条 kind:"page"（H1 去「书：」前缀）加
//   正文里 **中文**（English）的 kind:"term" 词条，按「哪节课收课时存的」分组
//   （沿用 course-terms.mjs 的存库记录；一个页被几节课存过只算最早那组），
//   没进任何存库记录的页进 other。
//   node domain.mjs subjects <库根> --json
//   node domain.mjs glossary <库根> <科目id> --json
import { readFile, readdir, lstat, realpath } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { collectTerms, definitionOf } from "../course/course-terms.mjs";

const SUBJECT_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const H1_PREFIX_RE = /^\S+?：/;
const SECTION_RE = /^##\s/;
const SUMMARY_RE = /^##\s+领域小结\s*$/;
// 新术语写法：**中文**（English）；`**中文（English）**` 这种整体加粗的不算。
const BOLD_TERM_RE = /\*\*([^*\n]{1,20})\*\*（([A-Za-z][^）\n]{0,60})）/g;

function fail(message) {
  process.stderr.write(`domain: ${message}\n`);
  process.exit(1);
}

/** 库根的实路径：库根本身常是符号链接（`~/学根/库` → `~/xuegen-data/vault`），
 *  判断「库内条目是不是链接」要按实路径算，库根那一条不算链接。 */
async function vaultRealpath(root) {
  return await realpath(root).catch(() => resolve(root));
}

/** 库内条目（文件或目录）是不是符号链接。`lstat` 不跟随链接，`stat` 会。 */
async function linkedEntry(real, file) {
  if (file === real) return false;
  const info = await lstat(file).catch(() => null);
  return info?.isSymbolicLink() === true;
}

/** 概念目录下全部 .md 的绝对路径（含 topic 子目录，跳过 `.` 开头），按路径升序。
 *  库内符号链接（文件或目录）一律跳过：词表不该把库外内容读进来。 */
async function conceptFiles(root, subject) {
  const base = join(root, "wiki", "knowledge", "concepts", subject);
  const real = await vaultRealpath(root);
  if (await linkedEntry(real, base)) return [];
  const files = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      // `readdir` 的 dirent 按 lstat 报类型：链接既不是目录也不是普通文件，先剔掉。
      if (entry.isSymbolicLink()) continue;
      const file = join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.name.endsWith(".md")) files.push(file);
    }
  }
  await walk(base);
  return files.sort();
}

/** 一页的词条数组：kind:"page" 词条在前，其后按出现顺序排 kind:"term" 词条。 */
function entriesOf(text, path) {
  const lines = text.split("\n");
  const h1 = (lines.find((line) => line.startsWith("# ")) ?? "").slice(2).trim();
  const page = h1 || basename(path, ".md");
  const entries = [
    {
      term: page.replace(H1_PREFIX_RE, ""),
      en: null,
      path,
      page,
      kind: "page",
      definition: definitionOf(lines),
    },
  ];
  const seen = new Set();
  for (const match of text.matchAll(BOLD_TERM_RE)) {
    const term = match[1].trim();
    if (seen.has(term)) continue;
    seen.add(term);
    entries.push({ term, en: match[2].trim(), path, page, kind: "term", definition: null });
  }
  return entries;
}

/** 科目页「## 领域小结」节的正文：去首尾空行、原样保留中间换行；没有或全空 → null。 */
function summaryOf(lines) {
  const start = lines.findIndex((line) => SUMMARY_RE.test(line.trim()));
  if (start === -1) return null;
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (SECTION_RE.test(line)) break;
    body.push(line);
  }
  let lo = 0;
  let hi = body.length;
  while (lo < hi && !body[lo].trim()) lo += 1;
  while (hi > lo && !body[hi - 1].trim()) hi -= 1;
  return hi > lo ? body.slice(lo, hi).join("\n") : null;
}

/** 科目页的 H1 与领域小结；页面读不到或是指向库外的符号链接返回 null。 */
async function subjectPage(root, id) {
  const file = join(root, "wiki", "subjects", `${id}.md`);
  if (await linkedEntry(await vaultRealpath(root), file)) return null;
  const text = await readFile(file, "utf8").catch(() => null);
  if (text === null) return null;
  const lines = text.split("\n");
  const h1 = lines.find((line) => line.startsWith("# "));
  return { title: h1 ? h1.slice(2).trim() : id, summary: summaryOf(lines) };
}

/** 一个科目目录下全部页的词条表：绝对路径 → 词条数组；读不到的页跳过。
 *  页码输出与 `course-terms.mjs` 一致用完整路径（界面的 `wiki.read` 只认完整路径）。 */
async function pageEntries(root, subject) {
  const map = new Map();
  for (const file of await conceptFiles(root, subject)) {
    const text = await readFile(file, "utf8").catch(() => null);
    if (text === null) continue;
    map.set(file, entriesOf(text, resolve(file)));
  }
  return map;
}

/** 课程短名：标题从第一个全角「（」或半角「(」处截断，去首尾空白后取第一个词
 * （「CTM 7 周学习计划」→「CTM」；「离散数学（Epp, 5th ed）」→「离散数学」）。
 * 截完为空时用课程 slug。 */
export function shortName(group) {
  const cut = group.courseTitle.search(/[（(]/);
  const head = (cut === -1 ? group.courseTitle : group.courseTitle.slice(0, cut)).trim();
  return head.split(/\s+/)[0] || group.course;
}

/** 课程课次的自然序：`D2` < `D10`（数字段按数值比，其余按字符串比）。 */
function naturalCompare(a, b) {
  const ax = String(a).match(/\d+|\D+/g) ?? [];
  const bx = String(b).match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.max(ax.length, bx.length); i += 1) {
    const left = ax[i];
    const right = bx[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
      const diff = Number(left) - Number(right);
      if (diff !== 0) return diff;
      continue;
    }
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

/** 「早」的那组：有日期的按日期升序在前，没有日期的排最后；同日按课次自然序，
 *  再按课程 slug（再兜底比课次原文）。第三级之后同一门课同一天同一课次不会再有
 *  两组，所以重排记录块、挪动归档都不改变一页归哪组。 */
function compareGroupsAsc(a, b) {
  if (a.date !== b.date) {
    if (a.date === "") return 1;
    if (b.date === "") return -1;
    return a.date.localeCompare(b.date);
  }
  const lesson = naturalCompare(a.lesson ?? "", b.lesson ?? "");
  if (lesson !== 0) return lesson;
  const raw = (a.lesson ?? "").localeCompare(b.lesson ?? "");
  if (raw !== 0) return raw;
  return a.course.localeCompare(b.course);
}

/** 输出的组序：日期倒序（近的在前），没有日期的排最后；同日按课次自然序、课程 slug。 */
function compareGroupsDesc(a, b) {
  if (a.date !== b.date) {
    if (a.date === "") return 1;
    if (b.date === "") return -1;
    return b.date.localeCompare(a.date);
  }
  const lesson = naturalCompare(a.lesson ?? "", b.lesson ?? "");
  if (lesson !== 0) return lesson;
  return a.course.localeCompare(b.course);
}

/** 每个概念页属于哪一组：存库记录里日期最早的那组（见 `compareGroupsAsc`）。 */
function assignGroups(groups, pages, conceptsDir) {
  const owner = new Map();
  const sorted = [...groups].sort(compareGroupsAsc);
  for (const group of sorted) {
    for (const term of group.terms) {
      const file = term.path;
      if (!file.startsWith(`${conceptsDir}${sep}`) || !pages.has(file) || owner.has(file)) continue;
      owner.set(file, group);
    }
  }
  return owner;
}

async function subjects(root) {
  const dir = join(root, "wiki", "subjects");
  const real = await vaultRealpath(root);
  const entries = existsSync(dir) ? await readdir(dir, { withFileTypes: true }) : [];
  const rows = [];
  for (const entry of entries) {
    const name = entry.name;
    if (!name.endsWith(".md") || name.startsWith(".")) continue;
    if (entry.isSymbolicLink()) continue;
    const id = basename(name, ".md");
    // 文件名不合科目 id 的一律不列：`glossary` 与界面协议都会拒绝这种 id，
    // 列出来点进去只会报「科目 id 非法」。
    if (!SUBJECT_ID_RE.test(id)) continue;
    if (await linkedEntry(real, join(dir, name))) continue;
    const page = await subjectPage(root, id);
    const entries = await pageEntries(root, id);
    const terms = [...entries.values()].reduce((sum, list) => sum + list.length, 0);
    rows.push({
      id,
      title: page?.title ?? id,
      pages: entries.size,
      terms,
      hasSummary: page?.summary != null,
    });
  }
  return rows.sort((a, b) => b.pages - a.pages || a.id.localeCompare(b.id));
}

async function glossary(root, id) {
  const page = await subjectPage(root, id);
  if (page === null) fail(`没有这个科目：${id}`);
  const pages = await pageEntries(root, id);
  const conceptsDir = join(root, "wiki", "knowledge", "concepts", id);
  const coursesDir = join(root, "wiki", "courses");
  const stored = existsSync(coursesDir) ? await collectTerms(root) : [];
  const owner = assignGroups(stored, new Set(pages.keys()), conceptsDir);
  const byGroup = new Map();
  const other = [];
  for (const [file, entries] of pages) {
    const group = owner.get(file);
    if (!group) {
      other.push(...entries);
      continue;
    }
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(...entries);
  }
  const groups = [...byGroup.entries()].map(([group, terms]) => ({
    label: group.lesson ? `${shortName(group)} ${group.lesson}` : shortName(group),
    course: group.course,
    lesson: group.lesson,
    date: group.date,
    terms,
  }));
  groups.sort(compareGroupsDesc);
  return { subject: id, title: page.title, summary: page.summary, groups, other };
}

/** 主模块判定必须比真实路径，否则经符号链接调用时静默不执行（见 course-parse.mjs）。 */
function isMain() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
}

if (isMain()) {
  const [command, ...args] = process.argv.slice(2);
  const usage = "用法：node domain.mjs subjects <库根> [--json] | node domain.mjs glossary <库根> <科目id> [--json]";
  if (!command) fail(usage);
  const positional = [];
  for (const arg of args) {
    if (arg === "--json") continue;
    if (arg.startsWith("--")) fail(`未知参数：${arg}`);
    positional.push(arg);
  }
  if (positional.length === 0) fail(`${command} 需要库根目录`);
  const root = resolve(positional[0]);
  if (!existsSync(root)) fail(`库根不存在：${root}`);
  const json = args.includes("--json");

  if (command === "subjects") {
    if (positional.length > 1) fail(`多余参数：${positional.slice(1).join(" ")}`);
    const rows = await subjects(root);
    if (json) {
      process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    } else {
      for (const row of rows) {
        process.stdout.write(
          `${row.title}（${row.id}）｜${row.pages} 页｜${row.terms} 词${row.hasSummary ? "｜有小结" : ""}\n`,
        );
      }
    }
  } else if (command === "glossary") {
    if (positional.length > 2) fail(`多余参数：${positional.slice(2).join(" ")}`);
    const id = positional[1] ?? "";
    if (!SUBJECT_ID_RE.test(id)) fail(`科目 id 非法：${id || "缺值"}`);
    const result = await glossary(root, id);
    if (json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(`${result.title}（${id}）｜小结：${result.summary ? "有" : "无"}\n`);
      for (const group of result.groups) {
        process.stdout.write(`${group.date}｜${group.label}｜${group.terms.length} 词\n`);
      }
      process.stdout.write(`其他｜${result.other.length} 词\n`);
    }
  } else {
    fail(`未知命令：${command}`);
  }
}
