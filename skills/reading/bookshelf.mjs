#!/usr/bin/env node
// Xuegen 书房：自己读的整本书的排期与进度。无第三方依赖。
// <vault> 为 Wiki 库根目录；书页在 <vault>/wiki/shelf/<slug>.md（旧库：wiki/书房/），目录页是 index.md。
//   node bookshelf.mjs list <vault> [--today YYYY-MM-DD] [--json]
//   node bookshelf.mjs today <vault> [--today YYYY-MM-DD] [--json]
//   node bookshelf.mjs done <vault> <slug> [--today YYYY-MM-DD] [--json]
//   node bookshelf.mjs plan <vault> <slug> [--today YYYY-MM-DD] [--write] [--json]
//   node bookshelf.mjs index <vault> [--today YYYY-MM-DD] [--write] [--json]
//   node bookshelf.mjs lecture <vault> <slug> --label <标签> --course <课程slug> [--pages <页码列表>] [--today YYYY-MM-DD] [--json]
//   node bookshelf.mjs extract <vault> <slug> --page <n> --text <原句> [--today YYYY-MM-DD] [--json]
//   node bookshelf.mjs card <vault> <slug> --index <逗号分隔的序号> [--today YYYY-MM-DD] [--json]
// 所有命令支持 --json；日期由 --today 注入，默认本地日期。
// 书页 frontmatter：kind/slot/order/status/title/short/source/file/page_offset/started/position；
// 正文 `## 分段` 每行 `N. <标题> pp.<起>–<止>`；`## 排期` 两个 xuegen:shelf 标记间由本脚本生成；
// `## 读书记录` 每行 `- <日期>: <说明>`；`## 核心页已读` 每行 `- pp.<页码列表> · <课程slug> · <标签> · <日期>`；
// `## 摘录` 每行 `- p.<页码>: <原句> <标记>`，标记是行尾的 `#待做卡` 或 `#卡/<日期>`。
// 规则：每天一段（每块 ≤ 10 页），计划内一次只读一本，
// 读完自动开 order 最小的 queued；计划外同时最多一本在读。只排页码与日期，不估时长。
import { readFile, writeFile, readdir, rename, mkdir } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

// 书房目录候选：新布局 wiki/shelf 优先，旧库 wiki/书房 兜底。
const SHELF_DIRS = ["shelf", "书房"];
const INDEX_FILE = "index.md";
const PLAN_START = "<!-- xuegen:shelf:start -->";
const PLAN_END = "<!-- xuegen:shelf:end -->";
const FIELD_ORDER = [
  "kind",
  "slot",
  "order",
  "status",
  "title",
  "short",
  "source",
  "file",
  "page_offset",
  "started",
  "position",
];
// 始终以双引号写入的字符串字段；未加引号的 `[[...]]` 会被 YAML 当作嵌套列表。
const STRING_FIELDS = new Set(["title", "short", "source", "file"]);
const STATUSES = ["queued", "reading", "done"];
const BAD_SLUG = /[/\\:*?"<>|#^[\]]/;
const SEGMENT_RE = /^\s*\d+\.\s+(.+?)\s+pp\.\s*(\d+)\s*[–-]\s*(\d+)\s*$/;
const RECORD_RE = /^-\s+(\d{4}-\d{2}-\d{2}):/;
const CORE_READ_RE =
  /^-\s+pp\.(.+?)\s+·\s+([a-z0-9-]+)\s+·\s+(.+?)\s+·\s+(\d{4}-\d{2}-\d{2})\s*$/;
const EXTRACT_RE = /^-\s+p\.(\d+):\s+(.*?)\s+(#待做卡|#卡\/(\d{4}-\d{2}-\d{2}))\s*$/;

function fail(message) {
  process.stderr.write(`bookshelf: ${message}\n`);
  process.exit(1);
}

function localDate() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const time = Date.parse(`${text}T00:00:00Z`);
  if (Number.isNaN(time)) return false;
  return new Date(time).toISOString().slice(0, 10) === text;
}

function addDays(date, n) {
  const time = Date.parse(`${date}T00:00:00Z`);
  const next = new Date(time + n * 86400000);
  return next.toISOString().slice(0, 10);
}

// b - a 的天数（可负）。
function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

function todayFrom(options) {
  if (options.today === undefined) return localDate();
  if (!isDate(options.today)) fail(`--today 日期非法：${options.today}`);
  return options.today;
}

// 解析 CLI 参数：位置参数放入 positional，其余按 --key value 读入 options。
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

function validSlug(slug) {
  return (
    slug.length > 0 &&
    slug !== "." &&
    slug !== ".." &&
    !BAD_SLUG.test(slug) &&
    !/\s/.test(slug)
  );
}

// 解析书页：frontmatter 单行 key: value（值可带引号），正文其余原样保留。
function parsePage(text, file) {
  const lines = text.split("\n");
  if (lines[0] !== "---") fail(`${file} 缺少 frontmatter 起始 "---"`);
  const end = lines.indexOf("---", 1);
  if (end === -1) fail(`${file} frontmatter 未闭合`);
  const fmLines = lines.slice(1, end);
  const fields = [];
  for (const raw of fmLines) {
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    const match = raw.match(/^([A-Za-z_][\w-]*):\s?(.*)$/);
    if (!match) fail(`${file} frontmatter 无法解析：${raw}`);
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
      if (STRING_FIELDS.has(match[1])) value = unescapeString(value);
    }
    fields.push({ key: match[1], value });
  }
  return {
    fields,
    body: lines.slice(end + 1),
  };
}

function field(page, key) {
  const found = page.fields.find((entry) => entry.key === key);
  return found ? found.value : "";
}

function sectionRange(body, heading) {
  const start = body.findIndex((line) => line.trim() === heading);
  if (start === -1) return null;
  const rest = body.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return { start: start + 1, end: end === -1 ? body.length : start + 1 + end };
}

// 渲染 frontmatter：已知字段按 FIELD_ORDER 排前（缺席的跳过，free 书可省 order），
// 其余字段原样跟在后面；正文原样。
// 正文末尾的空行被裁掉：plan/done 每次都会在章节边界插空行，若不归一化，
// 反复运行会在文件尾部逐次累积空行。
function renderPage(fields, body) {
  const known = new Map(fields.map((entry) => [entry.key, entry.value]));
  const ordered = [];
  for (const key of FIELD_ORDER) {
    if (!known.has(key)) continue;
    ordered.push({ key, value: known.get(key) });
    known.delete(key);
  }
  for (const [key, value] of known) ordered.push({ key, value });
  const fm = ["---", ...ordered.map(renderField), "---"];
  let last = body.length;
  while (last > 0 && body[last - 1].trim() === "") last -= 1;
  return [...fm, ...body.slice(0, last)].join("\n") + "\n";
}

// 单行渲染：字符串字段始终加双引号并转义；其余字段空值写 `""`，否则原样。
function renderField(entry) {
  if (STRING_FIELDS.has(entry.key)) return `${entry.key}: ${quoteString(entry.value)}`;
  if (entry.value === "") return `${entry.key}: ""`;
  return `${entry.key}: ${entry.value}`;
}

function setField(page, key, value) {
  const found = page.fields.find((entry) => entry.key === key);
  if (found) found.value = value;
  else page.fields.push({ key, value });
}

// 转义 `\` 与 `"`，得到可作为 YAML 双引号标量的内层文本。
function escapeString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// escapeString 的逆运算，仅还原 `\\` 与 `\"`，其他反斜杠原样保留。
function unescapeString(value) {
  return String(value).replace(/\\(["\\])/g, "$1");
}

function quoteString(value) {
  return `"${escapeString(value)}"`;
}

// 原子写入：写临时文件再 rename，避免半截文件。
async function writeAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, file);
}

// Wiki 目录：<vault>/wiki，不存在时拒绝操作（不自动创建 wiki/ 本身）。
function wikiDir(vault) {
  return join(vault, "wiki");
}

// 校验 <vault> 确实为 Wiki 库根目录（存在 wiki/ 子目录），否则报错退出。
function requireVault(vault) {
  const dir = wikiDir(vault);
  if (!existsSync(dir)) fail(`不是 Wiki 库根目录：${vault}（缺少 wiki/ 子目录）`);
  return dir;
}

// 书房目录：有新的用新的，没有用旧的；两个都没有时按新名返回（由调用方决定是否创建）。
function shelfDir(vault) {
  for (const name of SHELF_DIRS) {
    const dir = join(wikiDir(vault), name);
    if (existsSync(dir)) return dir;
  }
  return join(wikiDir(vault), SHELF_DIRS[0]);
}

// index.md 里 [[…]] 链接的前缀就是实际书房目录名（shelf 或 书房）。
function shelfName(vault) {
  return basename(shelfDir(vault));
}

// ---- 书页字段访问（frontmatter 原样是字符串，这里统一落成可用值）----

function bookSlot(page) {
  return field(page, "slot") === "free" ? "free" : "planned";
}

function bookStatus(page) {
  const status = field(page, "status");
  return STATUSES.includes(status) ? status : "queued";
}

function bookOrder(page) {
  const raw = field(page, "order");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

function bookPosition(page) {
  const n = Number(field(page, "position"));
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function bookStarted(page) {
  const started = field(page, "started");
  return isDate(started) ? started : "";
}

function bookTitle(page, slug) {
  return field(page, "title") || slug;
}

function bookShort(page, slug) {
  return field(page, "short") || field(page, "title") || slug;
}

// ---- 切块与单本视图（纯函数，导出供测试）----

// 解析 `## 分段` 一节 → [{title, from, to}]；格式不对的行忽略。
export function parseSegments(body) {
  const range = sectionRange(body, "## 分段");
  if (!range) return [];
  const segments = [];
  for (const line of body.slice(range.start, range.end)) {
    const match = line.match(SEGMENT_RE);
    if (!match) continue;
    const from = Number(match[2]);
    const to = Number(match[3]);
    if (from > to) continue;
    segments.push({ title: match[1].trim(), from, to });
  }
  return segments;
}

// 每个分段：n = to - from + 1，k = ceil(n / 10)，size = ceil(n / k)；
// 从 from 起每块 size 页，最后一块到 to 为止。index 从 1 连续编号。
export function chunksOf(segments) {
  const chunks = [];
  for (const segment of segments) {
    const n = segment.to - segment.from + 1;
    const k = Math.ceil(n / 10);
    const size = Math.ceil(n / k);
    for (let from = segment.from; from <= segment.to; from += size) {
      chunks.push({
        index: chunks.length + 1,
        title: segment.title,
        from,
        to: Math.min(from + size - 1, segment.to),
      });
    }
  }
  return chunks;
}

// 页码列表 `"1–5、7–12、31"` → 展开的升序页码数组。
// 分隔符接受 `、` `,` `，`；每项是 `a` 或 `a–b`（连接号也接受 `-`）。
// 反向区间与不合法的项忽略；结果去重、升序。
export function parsePageList(text) {
  const pages = [];
  for (const part of String(text).split(/[、,，]/)) {
    const match = part.trim().match(/^(\d+)(?:\s*[–-]\s*(\d+))?$/);
    if (!match) continue;
    const from = Number(match[1]);
    const to = match[2] === undefined ? from : Number(match[2]);
    if (from > to) continue;
    for (let page = from; page <= to; page += 1) pages.push(page);
  }
  return [...new Set(pages)].sort((a, b) => a - b);
}

// 升序页码数组 → 连续段合并的页码列表：`[12,13,14,15,17]` → `"12–15、17"`；空数组 → `""`。
export function formatPageList(pages) {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts = [];
  let from = -1;
  let prev = -1;
  for (const page of sorted) {
    if (from === -1 || page !== prev + 1) {
      if (from !== -1) parts.push(from === prev ? `${from}` : `${from}–${prev}`);
      from = page;
    }
    prev = page;
  }
  if (from !== -1) parts.push(from === prev ? `${from}` : `${from}–${prev}`);
  return parts.join("、");
}

// 解析 `## 核心页已读` 一节 → [{pages, course, label, date}]（pages 保留原文），
// 不匹配的行忽略；没有该节返回 []。
export function parseCoreRead(body) {
  const range = sectionRange(body, "## 核心页已读");
  if (!range) return [];
  const rows = [];
  for (const line of body.slice(range.start, range.end)) {
    const match = line.match(CORE_READ_RE);
    if (!match) continue;
    rows.push({ pages: match[1], course: match[2], label: match[3], date: match[4] });
  }
  return rows;
}

// 解析 `## 摘录` 一节 → [{index, page, text, carded}]；index 是匹配行从 1 起的序号，
// carded 是 `#卡/<日期>` 的日期或 null（`#待做卡`）；没有该节返回 []。
export function parseExtracts(body) {
  const range = sectionRange(body, "## 摘录");
  if (!range) return [];
  const extracts = [];
  for (const line of body.slice(range.start, range.end)) {
    const match = line.match(EXTRACT_RE);
    if (!match) continue;
    extracts.push({
      index: extracts.length + 1,
      page: Number(match[1]),
      text: match[2],
      carded: match[4] ?? null,
    });
  }
  return extracts;
}

// 单本视图。page 是 parsePage 结果并带 slug 属性（loadBooks 会附上）。
// plannedEnd：按计划（started 起每天一段）读完的日子；started 为空时用 today 起算。
// end：预计读完 = 下一段该读的那天 + 剩余段数 - 1；读完了 = 最后一条读书记录的日期。
// late：end 比 plannedEnd 晚几天（不晚为 0）。
// coreOverlap：今天这段里讲后读已读过的页（`"pp.…"`），没有或读完全部分段时为 null。
// doneToday：今天的读书记录里已有「第 position 段」（今天这块已读）；
// doneChunk：已读的这块（chunks[position - 1]），doneToday 为假时是 null。
export function bookView(page, today) {
  const segments = parseSegments(page.body);
  const chunks = chunksOf(segments);
  const total = chunks.length;
  const position = bookPosition(page);
  const started = bookStarted(page);
  const finished = position >= total;
  const lastRecord = lastRecordDate(page.body);
  const plannedEnd = addDays(started || today, Math.max(total - 1, 0));
  const end = finished
    ? (lastRecord ?? today)
    : addDays(nextReadDay(page, today), total - position - 1);
  const chunk = finished ? null : chunks[position];
  const doneToday = position > 0 && recordDate(page.body, position) === today;
  const doneChunk = doneToday ? (chunks[position - 1] ?? null) : null;
  let coreOverlap = null;
  if (chunk !== null) {
    const read = parseCoreRead(page.body).flatMap((row) => parsePageList(row.pages));
    const overlap = read.filter((page) => page >= chunk.from && page <= chunk.to);
    if (overlap.length > 0) coreOverlap = `pp.${formatPageList(overlap)}`;
  }
  return {
    slug: typeof page.slug === "string" ? page.slug : "",
    title: bookTitle(page, typeof page.slug === "string" ? page.slug : ""),
    short: bookShort(page, typeof page.slug === "string" ? page.slug : ""),
    slot: bookSlot(page),
    total,
    position,
    chunk,
    coreOverlap,
    doneToday,
    doneChunk,
    plannedEnd,
    end,
    late: Math.max(0, daysBetween(plannedEnd, end)),
  };
}

// 计划内排队书的预计读完日期（入参是 loadBooks 的结果）：按 order 升序（无 order 排最后）
// 串起来，第一本从在读的计划内书 end 的次日起（没有在读的从 today 起），
// 每本 end = start + total - 1，下一本接着前一本。只算 slot: planned 且 status: queued。
// 排队书还没开始读，日期不能从今天算——否则会和在读的书重叠。
// 返回 Map<slug, end>；非排队书不出现在 Map 里。
export function queueEnds(books, today) {
  const ends = new Map();
  const planned = books
    .filter(({ page }) => bookSlot(page) === "planned")
    .map(({ slug, page }) => ({ slug, page, status: bookStatus(page), order: bookOrder(page) }))
    .sort(compareBooks);
  const inProgress = planned.find((book) => book.status === "reading");
  let start = inProgress === undefined ? today : addDays(bookView(inProgress.page, today).end, 1);
  for (const { slug, page } of planned.filter((book) => book.status === "queued")) {
    const total = chunksOf(parseSegments(page.body)).length;
    const end = addDays(start, Math.max(total - 1, 0));
    ends.set(slug, end);
    start = addDays(end, 1);
  }
  return ends;
}

// `## 读书记录` 最后一条记录的日期；没有记录返回 null。
function lastRecordDate(body) {
  const range = sectionRange(body, "## 读书记录");
  if (!range) return null;
  let found = null;
  for (const line of body.slice(range.start, range.end)) {
    const match = line.match(RECORD_RE);
    if (match) found = match[1];
  }
  return found;
}

// `- <日期>: 第 <n> 段 …` 这种读书记录里，第 n 段最后一条的日期；没有为 null。
// 「讲后读 … 已读」的记录没有「第 n 段」，不算。
function recordDate(body, index) {
  const range = sectionRange(body, "## 读书记录");
  if (!range) return null;
  const matcher = new RegExp(`^-\\s+(\\d{4}-\\d{2}-\\d{2}):\\s+第\\s+${index}\\s+段\\s`);
  let found = null;
  for (const line of body.slice(range.start, range.end)) {
    const match = line.match(matcher);
    if (match) found = match[1];
  }
  return found;
}

// 下一段该读的那天：今天已经记过「第 position 段」就是明天，否则今天；不早于 started。
function nextReadDay(page, today) {
  const started = bookStarted(page) || today;
  const position = bookPosition(page);
  const readToday = position > 0 && recordDate(page.body, position) === today;
  const base = readToday ? addDays(today, 1) : today;
  return base > started ? base : started;
}

// ---- 读取书页 ----

async function loadBooks(vault) {
  const dir = shelfDir(vault);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const books = [];
  for (const name of entries.sort()) {
    if (!name.endsWith(".md") || name.startsWith(".") || name === INDEX_FILE) continue;
    const file = join(dir, name);
    const page = parsePage(await readFile(file, "utf8"), file);
    if (field(page, "kind") !== "book") continue;
    page.slug = basename(name, ".md");
    books.push({ slug: page.slug, page, file });
  }
  return books;
}

async function loadBook(vault, slug) {
  if (!validSlug(slug)) fail(`slug 非法：${slug}`);
  const file = join(shelfDir(vault), `${slug}.md`);
  if (!existsSync(file)) fail(`书页不存在：${file}`);
  const page = parsePage(await readFile(file, "utf8"), file);
  if (field(page, "kind") !== "book") fail(`不是书页（kind 不是 book）：${file}`);
  page.slug = slug;
  return { slug, page, file };
}

// ---- 排期表（`## 排期` 标记之间）----

// 排期表：已读的块按实际记录日期（没记录就按 started 顺推），未读的块从
// 「下一段该读的那天」起每天一块。
function planRows(page, today) {
  const started = bookStarted(page) || today;
  const position = bookPosition(page);
  const next = nextReadDay(page, today);
  const chunks = chunksOf(parseSegments(page.body));
  return {
    started,
    rows: chunks.map((chunk) => ({
      index: chunk.index,
      date:
        chunk.index <= position
          ? (recordDate(page.body, chunk.index) ?? addDays(started, chunk.index - 1))
          : addDays(next, chunk.index - position - 1),
      title: chunk.title,
      from: chunk.from,
      to: chunk.to,
    })),
  };
}

function renderPlanTable(rows) {
  const lines = ["| 块 | 日期 | 读什么 |", "|---|---|---|"];
  for (const row of rows) {
    lines.push(`| ${row.index} | ${row.date} | ${row.title} pp.${row.from}–${row.to} |`);
  }
  return lines.join("\n");
}

// 用新排期表替换两个标记之间的内容；没有标记时在 `## 读书记录` 前插入
// `## 排期` 与标记（也没有 `## 读书记录` 就追加到文末）。
// 已经有 `## 排期` 但人把标记删了时，重写该节而不是再插一个同名标题。
function withPlan(body, table) {
  const block = [PLAN_START, ...table.split("\n"), PLAN_END];
  const start = body.findIndex((line) => line.trim() === PLAN_START);
  const end = body.findIndex((line) => line.trim() === PLAN_END);
  if (start !== -1 && end !== -1 && end > start) {
    const copy = body.slice();
    copy.splice(start, end - start + 1, ...block);
    return copy;
  }
  const existing = sectionRange(body, "## 排期");
  if (existing) {
    // Keep whatever the human wrote under the heading and add the markers after it;
    // later runs replace the block between the markers.
    let at = existing.end;
    while (at > existing.start && body[at - 1].trim() === "") at -= 1;
    const copy = body.slice();
    copy.splice(at, 0, "", ...block);
    return copy;
  }
  const section = ["## 排期", "", ...block, ""];
  const copy = body.slice();
  const recordAt = copy.findIndex((line) => line.trim() === "## 读书记录");
  if (recordAt === -1) {
    if (copy.length > 0 && copy[copy.length - 1].trim() !== "") copy.push("");
    copy.push(...section);
    return copy;
  }
  const needsBlank = recordAt > 0 && copy[recordAt - 1].trim() !== "";
  copy.splice(recordAt, 0, ...(needsBlank ? ["", ...section] : section));
  return copy;
}

// ---- 命令 ----

const STATUS_RANK = { reading: 0, queued: 1, done: 2 };

function compareBooks(a, b) {
  const rank = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
  if (rank !== 0) return rank;
  const order = (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
  if (order !== 0) return order;
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

async function commandList(vault, options, today) {
  const books = await loadBooks(vault);
  const queue = queueEnds(books, today);
  const items = books.map(({ slug, page }) => {
    const view = bookView(page, today);
    const status = bookStatus(page);
    return {
      slug,
      title: view.title,
      short: view.short,
      slot: view.slot,
      order: bookOrder(page),
      status,
      total: view.total,
      position: view.position,
      started: bookStarted(page),
      // 排队书的预计读完日期由 queueEnds 串接得出，不是从今天算。
      end: queue.get(slug) ?? view.end,
      extracts: parseExtracts(page.body),
      coreRead: parseCoreRead(page.body),
      // 排队书还没开始读，没有日程。
      upcoming:
        status === "done" || status === "queued"
          ? []
          : planRows(page, today)
              .rows.filter((row) => row.index > bookPosition(page))
              .slice(0, 5),
    };
  });
  items.sort(compareBooks);
  output(options, items, () => {
    if (items.length === 0) return "书房是空的。";
    return items
      .map(
        (item) =>
          `${item.slug}｜${item.title}｜${item.slot}｜${item.status}｜` +
          `${item.position}/${item.total} 段｜预计 ${item.end} 读完`,
      )
      .join("\n");
  });
}

async function commandToday(vault, options, today) {
  const books = await loadBooks(vault);
  const pick = (slot) => {
    const reading = books
      .filter((book) => bookSlot(book.page) === slot && bookStatus(book.page) === "reading")
      .sort((a, b) => compareBooks(
        { slug: a.slug, status: "reading", order: bookOrder(a.page) },
        { slug: b.slug, status: "reading", order: bookOrder(b.page) },
      ));
    return reading.length === 0 ? null : bookView(reading[0].page, today);
  };
  const result = { planned: pick("planned"), free: pick("free") };
  output(options, result, () => {
    const line = (label, view) => {
      if (view === null) return `${label}：没有在读的书。`;
      const chunk = view.chunk;
      const doing = chunk ? `下一段 ${chunk.title} pp.${chunk.from}–${chunk.to}` : "已读完全部分段";
      return `${label}：${view.title}（${view.position}/${view.total} 段，${doing}，预计 ${view.end} 读完）`;
    };
    return [line("计划内", result.planned), line("计划外", result.free)].join("\n");
  });
}

// 单节在书页正文里的先后：`## 核心页已读` → `## 摘录` → `## 读书记录`。
const NEXT_SECTIONS = {
  "## 核心页已读": ["## 摘录", "## 读书记录"],
  "## 摘录": ["## 读书记录"],
};

// 在 `heading` 一节末尾追加一行（末尾的空行保持在 line 之后）。
// 节不存在时：`## 读书记录` 直接加在文末（同原 appendRecord）；其余新节插在
// 它后面那节之前（`## 核心页已读` 插在 `## 摘录` 或 `## 读书记录` 之前），
// 都没有就加在文末，前后补空行。
function appendToSection(body, heading, line) {
  const range = sectionRange(body, heading);
  if (range) {
    let insertAt = range.end;
    while (insertAt > range.start && body[insertAt - 1].trim() === "") insertAt -= 1;
    const copy = body.slice();
    copy.splice(insertAt, 0, line);
    return copy;
  }
  if (heading === "## 读书记录") {
    const copy = body.slice();
    if (copy.length > 0 && copy[copy.length - 1].trim() !== "") copy.push("");
    copy.push("## 读书记录", "", line);
    return copy;
  }
  const section = [heading, "", line, ""];
  const copy = body.slice();
  const followers = NEXT_SECTIONS[heading] ?? [];
  const anchor = copy.findIndex((item) => followers.some((name) => item.trim() === name));
  if (anchor === -1) {
    if (copy.length > 0 && copy[copy.length - 1].trim() !== "") copy.push("");
    copy.push(...section);
    return copy;
  }
  const needsBlank = anchor > 0 && copy[anchor - 1].trim() !== "";
  copy.splice(anchor, 0, ...(needsBlank ? ["", ...section] : section));
  return copy;
}

// 在 `## 读书记录` 末尾追加一行；没有这一节就在文末补一节。
function appendRecord(body, date, message) {
  return appendToSection(body, "## 读书记录", `- ${date}: ${message}`);
}

// 读完一本计划内的书后，自动开 order 最小的 planned queued：
// status → reading、started → 明天、position → 0，并写入它的排期表。
async function startNextPlanned(vault, today) {
  const books = await loadBooks(vault);
  const queued = books
    .filter((book) => bookSlot(book.page) === "planned" && bookStatus(book.page) === "queued")
    .sort((a, b) => compareBooks(
      { slug: a.slug, status: "queued", order: bookOrder(a.page) },
      { slug: b.slug, status: "queued", order: bookOrder(b.page) },
    ));
  if (queued.length === 0) return null;
  const { slug, page, file } = queued[0];
  setField(page, "status", "reading");
  setField(page, "started", addDays(today, 1));
  setField(page, "position", "0");
  const { rows } = planRows(page, today);
  page.body = withPlan(page.body, renderPlanTable(rows));
  await writeAtomic(file, renderPage(page.fields, page.body));
  return slug;
}

async function commandDone(vault, positional, options, today) {
  const slug = positional[0];
  if (!slug) fail("done 需要 slug");
  const { page, file } = await loadBook(vault, slug);
  const status = bookStatus(page);
  if (status !== "reading") fail(`${slug} 状态为 ${status}，只有在读的书可以记读完`);
  const chunks = chunksOf(parseSegments(page.body));
  const position = bookPosition(page);
  const chunk = chunks[position];
  if (!chunk) fail(`${slug} 没有下一段（position=${position}，共 ${chunks.length} 段）`);

  const nextPosition = position + 1;
  setField(page, "position", String(nextPosition));
  page.body = appendRecord(
    page.body,
    today,
    `第 ${nextPosition} 段 pp.${chunk.from}–${chunk.to} 读完（用户自报）`,
  );
  const finished = nextPosition >= chunks.length;
  if (finished) setField(page, "status", "done");
  // 没读完就把排期表按「今天已经读了这段」重算：后面每块从现在起每天一块。
  if (!finished) page.body = withPlan(page.body, renderPlanTable(planRows(page, today).rows));
  await writeAtomic(file, renderPage(page.fields, page.body));

  let next = null;
  if (finished && bookSlot(page) === "planned") next = await startNextPlanned(vault, today);
  await writeIndex(vault, today);

  const result = { slug, position: nextPosition, total: chunks.length, finished, next };
  output(
    options,
    result,
    `done: ${slug} 第 ${nextPosition}/${chunks.length} 段` +
      (finished ? `（读完${next ? `，下一本 ${next}` : ""}）` : ""),
  );
}

async function commandPlan(vault, positional, options, today) {
  const slug = positional[0];
  if (!slug) fail("plan 需要 slug");
  const { page, file } = await loadBook(vault, slug);
  const status = bookStatus(page);
  if (status !== "reading") {
    fail(`${slug} 还在排队（或已读完），开始读时会自动排期`);
  }
  if (bookStarted(page) === "") setField(page, "started", today);
  const { started, rows } = planRows(page, today);
  const table = renderPlanTable(rows);
  if (options.write) {
    page.body = withPlan(page.body, table);
    await writeAtomic(file, renderPage(page.fields, page.body));
  }
  output(
    options,
    { slug, started, rows, wrote: options.write === true },
    () => `${table}${options.write ? `\n（已写入 ${file}）` : ""}`,
  );
}

// 讲后读读完：记一条读书记录，给了 --pages 时再记一行核心页已读；不改 position/status。
async function commandLecture(vault, positional, options, today) {
  const slug = positional[0];
  if (!slug) fail("lecture 需要 slug");
  const { page, file } = await loadBook(vault, slug);
  const label = options.label;
  if (
    typeof label !== "string" ||
    label === "" ||
    label.includes("\n") ||
    label.length > 200
  ) {
    fail(`--label 非法：${label}`);
  }
  const course = options.course;
  if (typeof course !== "string" || !/^[a-z0-9-]+$/.test(course)) {
    fail(`--course 非法：${course}`);
  }
  let pages = null;
  if (options.pages !== undefined) {
    const parsed = parsePageList(String(options.pages));
    if (parsed.length === 0) fail(`页码列表非法：${options.pages}`);
    pages = formatPageList(parsed);
  }
  page.body = appendRecord(page.body, today, `讲后读 ${label} 已读（${course}，用户自报）`);
  if (pages !== null) {
    page.body = appendToSection(
      page.body,
      "## 核心页已读",
      `- pp.${pages} · ${course} · ${label} · ${today}`,
    );
  }
  await writeAtomic(file, renderPage(page.fields, page.body));
  output(
    options,
    { slug, label, course, pages },
    () => `lecture: ${slug} 讲后读 ${label} 已读（${course}，用户自报）`,
  );
}

// 存一句摘录：在 `## 摘录` 末尾加 `- p.<n>: <原句> #待做卡`；不改 frontmatter。
async function commandExtract(vault, positional, options) {
  const slug = positional[0];
  if (!slug) fail("extract 需要 slug");
  const { page, file } = await loadBook(vault, slug);
  const pageNo = Number(options.page);
  if (!Number.isInteger(pageNo) || pageNo < 1 || pageNo > 99999) {
    fail(`--page 非法：${options.page}`);
  }
  const text = String(options.text ?? "")
    .replace(/\s*\r?\n\s*/g, " ")
    .trim();
  if (text === "" || text.length > 500) fail(`--text 非法：${options.text}`);
  page.body = appendToSection(page.body, "## 摘录", `- p.${pageNo}: ${text} #待做卡`);
  await writeAtomic(file, renderPage(page.fields, page.body));
  const index = parseExtracts(page.body).length;
  output(options, { slug, index, page: pageNo, text }, () => `extract: ${slug} 摘录 ${index}（p.${pageNo}）`);
}

// 把摘录标成已做卡：`#待做卡` → `#卡/<today>`；已是 `#卡/…` 的序号进 skipped。
async function commandCard(vault, positional, options, today) {
  const slug = positional[0];
  if (!slug) fail("card 需要 slug");
  const { page, file } = await loadBook(vault, slug);
  const total = parseExtracts(page.body).length;
  const wanted = new Set(
    String(options.index ?? "")
      .split(",")
      .map((part) => Number(part.trim())),
  );
  for (const index of wanted) {
    if (!Number.isInteger(index) || index < 1 || index > total) {
      fail(`--index 非法：${options.index}（共 ${total} 条摘录）`);
    }
  }
  const range = sectionRange(page.body, "## 摘录");
  if (!range) fail(`${slug} 没有 \`## 摘录\` 可以标记`);
  const next = page.body.slice();
  const marked = [];
  const skipped = [];
  let counter = 0;
  for (let line = range.start; line < range.end; line += 1) {
    const match = next[line].match(EXTRACT_RE);
    if (!match) continue;
    counter += 1;
    if (!wanted.has(counter)) continue;
    if (match[3] === "#待做卡") {
      next[line] = next[line].replace(/#待做卡\s*$/, `#卡/${today}`);
      marked.push(counter);
    } else {
      skipped.push(counter);
    }
  }
  if (marked.length > 0) {
    page.body = next;
    await writeAtomic(file, renderPage(page.fields, page.body));
  }
  output(options, { slug, marked, skipped }, () =>
    `card: ${slug} 做卡 ${marked.join("、") || "无"}${skipped.length ? `（跳过 ${skipped.join("、")}）` : ""}`,
  );
}

// ---- index.md ----

function indexLine(view, status, end, shelfName) {
  const prefix = `- [[${shelfName}/${view.slug}|${view.short}]] · ${view.title} · ${view.position}/${view.total} 段`;
  return status === "done" ? `${prefix} · ${end} 读完` : `${prefix} · 预计 ${end} 读完`;
}

function renderIndex(books, today, shelfName) {
  const queue = queueEnds(books, today);
  const groups = { reading: [], queued: [], done: [] };
  for (const { slug, page } of books) {
    const status = bookStatus(page);
    const view = bookView(page, today);
    // 排队书用 queueEnds 的串接日期（等在读的读完再算），其余用 bookView 的 end。
    const end = status === "queued" ? (queue.get(slug) ?? view.end) : view.end;
    groups[status].push({ slug, order: bookOrder(page), status, line: indexLine(view, status, end, shelfName) });
  }
  const blocks = ["# 书房"];
  for (const [status, heading] of [
    ["reading", "## 在读"],
    ["queued", "## 排队"],
    ["done", "## 读完"],
  ]) {
    const group = groups[status].sort(compareBooks);
    // 空组也保留标题：界面按标题定位，缺一组会让人以为文件坏了。
    blocks.push(
      group.length === 0 ? heading : [heading, "", ...group.map((item) => item.line)].join("\n"),
    );
  }
  return `${blocks.join("\n\n")}\n`;
}

async function writeIndex(vault, today) {
  const books = await loadBooks(vault);
  const dir = shelfDir(vault);
  await mkdir(dir, { recursive: true });
  await writeAtomic(join(dir, INDEX_FILE), renderIndex(books, today, shelfName(vault)));
}

async function commandIndex(vault, options, today) {
  const books = await loadBooks(vault);
  const text = renderIndex(books, today, shelfName(vault));
  const file = join(shelfDir(vault), INDEX_FILE);
  if (options.write) {
    await mkdir(shelfDir(vault), { recursive: true });
    await writeAtomic(file, text);
  }
  output(options, { file, text }, () => `${text}${options.write ? `\n（已写入 ${file}）` : ""}`);
}

// 统一输出：--json 输出机器可读，否则调用 render（字符串或函数）。
function output(options, data, render) {
  if (options.json) {
    const payload = typeof data === "function" ? data() : data;
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }
  const text = typeof render === "function" ? render() : render;
  process.stdout.write(`${text}\n`);
}

function usage() {
  return [
    "书房：整本书通读的排期与进度（bookshelf）",
    "",
    "用法：",
    "  node bookshelf.mjs list <vault> [--json]",
    "  node bookshelf.mjs today <vault> [--today YYYY-MM-DD] [--json]",
    "  node bookshelf.mjs done <vault> <slug> [--today YYYY-MM-DD] [--json]",
    "  node bookshelf.mjs plan <vault> <slug> [--today YYYY-MM-DD] [--write] [--json]",
    "  node bookshelf.mjs index <vault> [--today YYYY-MM-DD] [--write] [--json]",
    "  node bookshelf.mjs lecture <vault> <slug> --label <标签> --course <课程slug> [--pages <页码列表>] [--today YYYY-MM-DD] [--json]",
    "  node bookshelf.mjs extract <vault> <slug> --page <n> --text <原句> [--today YYYY-MM-DD] [--json]",
    "  node bookshelf.mjs card <vault> <slug> --index <逗号分隔的序号> [--today YYYY-MM-DD] [--json]",
    "",
    "<vault> 为 Wiki 库根目录，须包含 wiki/ 子目录；书页在 wiki/shelf/<slug>.md（旧库：wiki/书房/）。",
    "done：记完一段（position+1、追加读书记录）；读完时置 done，计划内的书自动开",
    "order 最小的 queued（明天起读），最后重写 index.md。",
    "plan：生成/重写 `## 排期` 的排期表（不带 --write 只打印）。",
    "index：生成/重写 wiki/shelf/index.md（旧库：wiki/书房/index.md；不带 --write 只打印）。",
    "lecture：讲后读读完——追加读书记录，给了 --pages 再记一行 `## 核心页已读`；不改 position/status。",
    "extract：在 `## 摘录` 末尾存一句摘录（行尾标 `#待做卡`）。",
    "card：把 `## 摘录` 里指定序号的 `#待做卡` 改成 `#卡/<today>`。",
    "",
    "选项：",
    "  --today YYYY-MM-DD  注入「今天」（测试用），默认本地日期",
    "  --write             plan / index 真正写文件",
    "  --json              输出机器可读结果",
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
  if (options.today !== undefined && !isDate(String(options.today))) {
    fail(`--today 日期非法：${options.today}`);
  }
  const today = todayFrom(options);
  const vaultArg = () => resolve(positional[0] ?? fail(`${command} 需要 vault 路径`));

  if (command === "list") {
    const vault = vaultArg();
    requireVault(vault);
    await commandList(vault, options, today);
  } else if (command === "today") {
    const vault = vaultArg();
    requireVault(vault);
    await commandToday(vault, options, today);
  } else if (command === "done") {
    const vault = vaultArg();
    requireVault(vault);
    await commandDone(vault, positional.slice(1), options, today);
  } else if (command === "plan") {
    const vault = vaultArg();
    requireVault(vault);
    await commandPlan(vault, positional.slice(1), options, today);
  } else if (command === "index") {
    const vault = vaultArg();
    requireVault(vault);
    await commandIndex(vault, options, today);
  } else if (command === "lecture") {
    const vault = vaultArg();
    requireVault(vault);
    await commandLecture(vault, positional.slice(1), options, today);
  } else if (command === "extract") {
    const vault = vaultArg();
    requireVault(vault);
    await commandExtract(vault, positional.slice(1), options);
  } else if (command === "card") {
    const vault = vaultArg();
    requireVault(vault);
    await commandCard(vault, positional.slice(1), options, today);
  } else {
    fail(`未知命令：${command}`);
  }
}

// 只有直接运行时才进入 CLI；测试 import 纯函数不触发 main。
// 两边都取真实路径再比：经符号链接调用（~/.xuegen/app、/tmp → /private/tmp）时
// argv[1] 与 import.meta.url 字面不同，只比字面路径会静默不执行。
function isMain() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
}

if (isMain()) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
