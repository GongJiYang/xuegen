#!/usr/bin/env node
// Xuegen 渐进阅读队列维护：导入排程、今日清单、复习推进、暂停/恢复、统计与校验。
// 无第三方依赖。<vault> 为 Wiki 库根目录，内含 raw/、Clippings/ 与 wiki/。
//   node reading-queue.mjs add <vault> <原文相对路径> [--priority high|medium|low] [--slug s] [--due today|scheduled|YYYY-MM-DD] [--every N] [--today YYYY-MM-DD]
//   node reading-queue.mjs today <vault> [--limit 3]
//   node reading-queue.mjs list <vault>
//   node reading-queue.mjs review <vault> <slug> --outcome next|postpone|done [--position ...] [--note ...]
//   node reading-queue.mjs note <vault> <slug> --text ...
//   node reading-queue.mjs pause|resume <vault> <slug>
//   node reading-queue.mjs stats <vault>
//   node reading-queue.mjs verify <vault>
// 所有命令支持 --json；日期由 --today 注入，默认本地日期。
// 路径：原文 = <vault>/<相对路径>；阅读页 = <vault>/wiki/reading/；摘录 = <知识目录>/extracts/（知识目录 = wiki/知识，不存在时为 wiki）；日志 = <vault>/wiki/log.md。
import { readFile, writeFile, readdir, stat, rename, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, basename, relative, sep } from "node:path";

const PRIORITIES = ["high", "medium", "low"];
const STATUSES = ["queued", "active", "paused", "done"];
const FACTORS = { high: 1.5, medium: 2, low: 3 };
const FIELD_ORDER = [
  "source",
  "priority",
  "status",
  "due",
  "interval_days",
  "last_read",
  "position",
];
// 始终以双引号写入的字符串字段；未加引号的 `[[...]]` 会被 YAML 当作嵌套列表。
const STRING_FIELDS = new Set(["source", "position"]);
const FS_ESCAPE = /[/\\:*?"<>|#^[\]]/g;
const BAD_SLUG = /[/\\:*?"<>|#^[\]]/;

function fail(message) {
  process.stderr.write(`reading-queue: ${message}\n`);
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

// slug：去扩展名 → 空白转 - → ASCII 小写 → 去非法字符（保留中文）。
function slugify(name) {
  let base = name.replace(/\.[^./\\]+$/, "");
  base = base.trim().replace(/\s+/g, "-");
  base = base.toLowerCase();
  base = base.replace(FS_ESCAPE, "");
  base = base.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return base || "untitled";
}

function validSlug(slug) {
  return slug.length > 0 && !BAD_SLUG.test(slug) && !/\s/.test(slug);
}

// 解析阅读页：frontmatter 单行 key: value（值可带引号），正文其余原样保留。
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
    head: lines.slice(0, end + 1),
  };
}

function field(page, key) {
  const found = page.fields.find((entry) => entry.key === key);
  return found ? found.value : "";
}

function knownValue(page, key) {
  return field(page, key);
}

function sectionRange(body, heading) {
  const start = body.findIndex((line) => line.trim() === heading);
  if (start === -1) return null;
  const rest = body.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return { start: start + 1, end: end === -1 ? body.length : start + 1 + end };
}

function extractLinks(body) {
  const range = sectionRange(body, "## Extracts");
  if (!range) return [];
  const links = [];
  for (const line of body.slice(range.start, range.end)) {
    for (const match of line.matchAll(/\[\[([^\]]+)\]\]/g)) {
      links.push(match[1].split("|")[0].trim());
    }
  }
  return links;
}

// 渲染 frontmatter：字段顺序固定，其余正文原样。
function renderPage(fields, body) {
  const known = new Map(fields.map((entry) => [entry.key, entry.value]));
  const ordered = [];
  for (const key of FIELD_ORDER) {
    if (!known.has(key)) fail(`缺少字段：${key}`);
    ordered.push({ key, value: known.get(key) });
    known.delete(key);
  }
  for (const [key, value] of known) ordered.push({ key, value });
  const fm = ["---", ...ordered.map(renderField), "---"];
  return [...fm, ...body].join("\n") + "\n";
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

// 原文标题：第一个 "# " 标题，无则用文件名。
function sourceTitle(text, relPath) {
  for (const line of text.split("\n")) {
    const match = line.match(/^#\s+(.+)$/);
    if (match) return match[1].trim();
  }
  return basename(relPath);
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

async function appendLog(vault, date, title, message) {
  const logFile = join(wikiDir(vault), "log.md");
  const existing = existsSync(logFile) ? await readFile(logFile, "utf8") : "";
  const block = `## ${date} reading | ${title}\n${message}\n`;
  const separator = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  await writeAtomic(logFile, `${existing}${separator}\n${block}`);
}

// 知识目录：迁移后为 <vault>/wiki/知识，迁移前为 <vault>/wiki（两种布局都支持）。
function knowledgeDir(vault) {
  const migrated = join(wikiDir(vault), "知识");
  return existsSync(migrated) ? migrated : wikiDir(vault);
}

function readingDir(vault) {
  return join(wikiDir(vault), "reading");
}

async function pagePath(vault, slug) {
  return join(readingDir(vault), `${slug}.md`);
}

async function loadSlugs(vault) {
  const dir = readingDir(vault);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  return entries
    .filter((name) => name.endsWith(".md") && !name.startsWith("."))
    .map((name) => basename(name, ".md"))
    .sort();
}

async function loadPage(vault, slug) {
  const file = await pagePath(vault, slug);
  if (!existsSync(file)) fail(`阅读页不存在：${file}`);
  const text = await readFile(file, "utf8");
  return { page: parsePage(text, file), file };
}

// 原文位置：raw/、Clippings/，或知识目录下 sources/ 的登记页（教材通读用，脚本不读 PDF）。
function validateSourceReachability(relPath) {
  const normalized = relPath.split(sep).join("/");
  const first = normalized.split("/")[0];
  if (first === "raw" || first === "Clippings") return;
  if (/^wiki\/(知识\/)?sources\/[^/]+\.md$/.test(normalized)) return;
  fail(`原文必须位于 raw/、Clippings/ 或 wiki/知识/sources/ 下：${relPath}`);
}

async function commandAdd(vault, positional, options, today) {
  const relPath = positional[0];
  if (!relPath) fail("add 需要原文相对路径");
  validateSourceReachability(relPath);
  const srcFile = join(vault, relPath);
  if (!existsSync(srcFile)) fail(`原文不存在：${srcFile}`);
  const srcText = await readFile(srcFile, "utf8");
  const title = sourceTitle(srcText, relPath);

  const priority = options.priority ?? "medium";
  if (!PRIORITIES.includes(priority)) fail(`--priority 非法：${priority}`);

  const slug = options.slug ? String(options.slug) : slugify(basename(relPath));
  if (!validSlug(slug)) fail(`slug 非法：${slug}`);

  const dir = readingDir(vault);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${slug}.md`);
  if (existsSync(file)) fail(`已存在同 slug 的阅读页：${file}（可用 --slug 指定其他名字）`);

  // --due today forces 「今天就读」: the item is scheduled for today even at a
  // lower priority (medium/low otherwise wait until tomorrow).
  const dueOption = options.due ?? "scheduled";
  let due;
  if (dueOption === "today") due = today;
  else if (dueOption === "scheduled") due = priority === "high" ? today : addDays(today, 1);
  else if (isDate(String(dueOption))) due = String(dueOption);
  else fail(`--due 非法：${dueOption}（应为 today、scheduled 或 YYYY-MM-DD）`);

  let every = null;
  if (options.every !== undefined) {
    const n = Number(options.every);
    if (!Number.isInteger(n) || n < 1 || n > 365) fail(`--every 非法：${options.every}（应为 1–365 的整数）`);
    every = n;
  }
  const fields = [
    { key: "source", value: `[[${normalizeSourceLink(relPath)}]]` },
    { key: "priority", value: priority },
    { key: "status", value: "queued" },
    { key: "due", value: due },
    { key: "interval_days", value: every === null ? "1" : String(every) },
    { key: "last_read", value: "" },
    { key: "position", value: "" },
  ];
  if (every !== null) fields.splice(fields.findIndex((entry) => entry.key === "interval_days") + 1, 0, { key: "every", value: String(every) });
  const body = [
    "",
    `# ${title}`,
    "",
    "## Reading Log",
    "",
    "## Extracts",
    "",
  ];
  await writeAtomic(file, renderPage(fields, body));
  const logMessage = every === null
    ? `Added to queue (priority: ${priority}).`
    : `Added to queue (priority: ${priority}, every ${every} days).`;
  await appendLog(vault, today, title, logMessage);

  const result = { slug, title, priority, status: "queued", due, every };
  output(options, result, `add: ${slug}（${title}）priority=${priority} due=${due}`);
}

function normalizeSourceLink(relPath) {
  let p = relPath.split(sep).join("/");
  p = p.replace(/\.[^./]+$/, "");
  p = p.replace(/^wiki\/(知识\/)?(?=sources\/)/, "");
  return p;
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

async function commandToday(vault, options, today) {
  const limit = options.limit === undefined ? 3 : Number(options.limit);
  if (!Number.isInteger(limit) || limit < 0) fail(`--limit 非法：${options.limit}`);
  const slugs = await loadSlugs(vault);
  const items = [];
  for (const slug of slugs) {
    const { page } = await loadPage(vault, slug);
    const status = field(page, "status");
    if (status !== "queued" && status !== "active") continue;
    const due = field(page, "due");
    if (!due || !isDate(due)) continue;
    if (due > today) continue;
    items.push({
      slug,
      title: pageTitle(page),
      priority: field(page, "priority"),
      due,
      position: knownValue(page, "position"),
      status,
    });
  }
  items.sort((a, b) => {
    const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (pr !== 0) return pr;
    if (a.due !== b.due) return a.due < b.due ? -1 : 1;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  const limited = items.slice(0, limit);
  output(options, limited, () => {
    if (limited.length === 0) return "今天没有到期材料。";
    return limited
      .map(
        (item) =>
          `${item.slug}｜${item.title}｜${item.priority}｜due ${item.due}｜位置：${item.position || "未开始"}`,
      )
      .join("\n");
  });
}

// 整个队列（排除 done），按到期日排序；due 相同的按优先级、再按 slug。
// 供界面展示「队列共 M 篇」与尚未到期的条目（today 只返回今天到期的）。
async function commandList(vault, options) {
  const slugs = await loadSlugs(vault);
  const items = [];
  for (const slug of slugs) {
    const { page } = await loadPage(vault, slug);
    const status = field(page, "status");
    if (status === "done") continue;
    items.push({
      slug,
      title: pageTitle(page),
      priority: field(page, "priority"),
      due: field(page, "due"),
      position: knownValue(page, "position"),
      status,
    });
  }
  items.sort((a, b) => {
    if (a.due !== b.due) {
      // 无 due 的排在最后。
      if (!a.due) return 1;
      if (!b.due) return -1;
      return a.due < b.due ? -1 : 1;
    }
    const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (pr !== 0) return pr;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  output(options, items, () => {
    if (items.length === 0) return "队列是空的。";
    return items
      .map(
        (item) =>
          `${item.slug}｜${item.title}｜${item.priority}｜due ${item.due || "—"}｜位置：${item.position || "未开始"}`,
      )
      .join("\n");
  });
}

function pageTitle(page) {
  for (const line of page.body) {
    const match = line.match(/^#\s+(.+)$/);
    if (match) return match[1].trim();
  }
  return "";
}

// 固定间隔：从原到期日起每 every 天一次，取今天之后的第一个；原到期日无效时从今天算。
function nextFixedDue(due, every, today) {
  if (!isDate(due)) return addDays(today, every);
  let next = addDays(due, every);
  while (next <= today) next = addDays(next, every);
  return next;
}

async function commandReview(vault, positional, options, today) {
  const slug = positional[0];
  if (!slug) fail("review 需要 slug");
  const outcome = options.outcome;
  if (!["next", "postpone", "done"].includes(outcome)) {
    fail(`--outcome 必须为 next|postpone|done，收到：${outcome}`);
  }
  const { page, file } = await loadPage(vault, slug);
  const status = field(page, "status");
  if (status === "done" || status === "paused") {
    fail(`条目状态为 ${status}，无法 review：${slug}`);
  }
  const interval = Number(field(page, "interval_days")) || 1;
  const every = Number(field(page, "every")) || 0;
  const priority = field(page, "priority");
  const note = options.note;
  const position = options.position;
  let logResult;
  let nextDue;

  if (outcome === "next") {
    setField(page, "status", "active");
    setField(page, "last_read", today);
    if (every > 0) {
      setField(page, "interval_days", String(every));
      nextDue = nextFixedDue(field(page, "due"), every, today);
    } else {
      const factor = FACTORS[priority] ?? 2;
      const nextInterval = Math.max(1, Math.round(interval * factor));
      setField(page, "interval_days", String(nextInterval));
      nextDue = addDays(today, nextInterval);
    }
    setField(page, "due", nextDue);
    if (position !== undefined) setField(page, "position", String(position));
    logResult = "next";
  } else if (outcome === "postpone") {
    nextDue = every > 0 ? nextFixedDue(field(page, "due"), every, today) : addDays(today, interval);
    setField(page, "due", nextDue);
    logResult = "postpone";
  } else {
    setField(page, "status", "done");
    setField(page, "last_read", today);
    setField(page, "due", "");
    nextDue = "";
    logResult = "done";
  }

  const parts = [logResult];
  if (position !== undefined) parts.push(String(position));
  if (note !== undefined) parts.push(String(note));
  page.body = appendReadingLog(page.body, today, parts.join(", "));
  await writeAtomic(file, renderPage(page.fields, page.body));

  if (outcome === "done") {
    const extractCount = extractLinks(page.body).length;
    await appendLog(vault, today, pageTitle(page), `Finished; extracts: ${extractCount}.`);
  }

  const result = { slug, outcome: logResult, status: field(page, "status"), due: nextDue };
  output(options, result, `review: ${slug} ${logResult} due=${nextDue || "—"}`);
}

function appendReadingLog(body, date, message) {
  const range = sectionRange(body, "## Reading Log");
  const line = `- ${date}: ${message}`;
  if (!range) {
    return [...body, "## Reading Log", line];
  }
  let insertAt = range.end;
  while (insertAt > range.start && body[insertAt - 1].trim() === "") insertAt -= 1;
  const copy = body.slice();
  copy.splice(insertAt, 0, line);
  return copy;
}

// 只追加一行 Reading Log，不改任何排程字段（讲后读等课内阅读用）。
async function commandNote(vault, positional, options, today) {
  const slug = positional[0];
  if (!slug) fail("note 需要 slug");
  const text = options.text;
  if (typeof text !== "string" || text.trim() === "") fail("note 需要 --text");
  const { page, file } = await loadPage(vault, slug);
  page.body = appendReadingLog(page.body, today, text.trim());
  await writeAtomic(file, renderPage(page.fields, page.body));
  output(options, { slug, date: today, text: text.trim() }, `note: ${slug} ${today}`);
}

async function commandPauseOrResume(vault, positional, options, command, today) {
  const slug = positional[0];
  if (!slug) fail(`${command} 需要 slug`);
  const { page, file } = await loadPage(vault, slug);
  const status = field(page, "status");
  if (command === "pause") {
    if (status === "done") fail(`条目已完成，无法 pause：${slug}`);
    if (status === "paused") fail(`条目已暂停，无法 pause：${slug}`);
    setField(page, "status", "paused");
  } else {
    if (status !== "paused") fail(`只有暂停的条目可以恢复：${slug}（当前 ${status}）`);
    const nextStatus = knownValue(page, "last_read") ? "active" : "queued";
    setField(page, "status", nextStatus);
    setField(page, "due", today);
  }
  page.body = appendReadingLog(page.body, today, command === "pause" ? "paused" : "resumed");
  await writeAtomic(file, renderPage(page.fields, page.body));
  const result = { slug, status: field(page, "status") };
  output(options, result, `${command}: ${slug} → ${field(page, "status")}`);
}

async function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

async function commandStats(vault, options) {
  const slugs = await loadSlugs(vault);
  const counts = { queued: 0, active: 0, paused: 0, done: 0 };
  let dueToday = 0;
  let overdue = 0;
  let reviewsLast7 = 0;
  const today = options.__today;
  const since = addDays(today, -6);
  for (const slug of slugs) {
    const { page } = await loadPage(vault, slug);
    const status = field(page, "status");
    if (counts[status] !== undefined) counts[status] += 1;
    const due = field(page, "due");
    if (status !== "done" && due && isDate(due)) {
      if (due === today) dueToday += 1;
      if (due < today) overdue += 1;
    }
    const range = sectionRange(page.body, "## Reading Log");
    if (range) {
      for (const line of page.body.slice(range.start, range.end)) {
        const match = line.match(/^-\s+(\d{4}-\d{2}-\d{2}):/);
        if (match && match[1] >= since && match[1] <= today) reviewsLast7 += 1;
      }
    }
  }
  const extractFiles = await walk(join(knowledgeDir(vault), "extracts"));
  let cardsPending = 0;
  for (const file of extractFiles) {
    const text = await readFile(file, "utf8");
    if (/^\s*cards:\s*pending\s*$/m.test(text)) cardsPending += 1;
  }
  const result = {
    reading: counts,
    dueToday,
    overdue,
    reviewsLast7,
    cardsPending,
  };
  output(
    options,
    result,
    () =>
      `阅读页 ${slugs.length}：queued ${counts.queued}｜active ${counts.active}｜paused ${counts.paused}｜done ${counts.done}\n` +
      `今天到期 ${dueToday}｜逾期 ${overdue}｜近 7 天 review ${reviewsLast7} 次｜抄录待制卡 ${cardsPending}`,
  );
}

async function commandVerify(vault, options) {
  const slugs = await loadSlugs(vault);
  const problems = [];
  for (const slug of slugs) {
    const { page } = await loadPage(vault, slug);
    for (const key of FIELD_ORDER) {
      if (!page.fields.some((entry) => entry.key === key)) {
        problems.push(`${slug}: 缺少字段 ${key}`);
      }
    }
    const priority = field(page, "priority");
    if (priority && !PRIORITIES.includes(priority)) problems.push(`${slug}: priority 非法 ${priority}`);
    const status = field(page, "status");
    if (status && !STATUSES.includes(status)) problems.push(`${slug}: status 非法 ${status}`);
    const interval = knownValue(page, "interval_days");
    if (interval && !/^\d+$/.test(interval)) problems.push(`${slug}: interval_days 非法 ${interval}`);
    const due = knownValue(page, "due");
    const lastRead = knownValue(page, "last_read");
    if (due && !isDate(due)) problems.push(`${slug}: due 日期非法 ${due}`);
    if (lastRead && !isDate(lastRead)) problems.push(`${slug}: last_read 日期非法 ${lastRead}`);
    if (status === "done" && due) problems.push(`${slug}: status=done 但 due 非空`);

    const source = knownValue(page, "source");
    const srcMatch = source.match(/\[\[([^\]|]+)/);
    if (srcMatch) {
      // source 链接依次相对 <vault>、知识目录、wiki/ 解析（如 [[raw/articles/x]]、[[sources/x]]）。
      const srcRel = `${srcMatch[1]}.md`;
      const candidates = [join(vault, srcRel), join(knowledgeDir(vault), srcRel), join(wikiDir(vault), srcRel)];
      if (!candidates.some((file) => existsSync(file))) problems.push(`${slug}: source 指向的文件不存在 ${srcRel}`);
    } else if (source) {
      problems.push(`${slug}: source 格式非法 ${source}`);
    }

    // Extracts 链接相对知识目录解析（如 [[extracts/a/x]] → <知识目录>/extracts/a/x.md）。
    const extractBase = knowledgeDir(vault);
    for (const link of extractLinks(page.body)) {
      const rel = link.endsWith(".md") ? link : `${link}.md`;
      if (!existsSync(join(extractBase, rel))) problems.push(`${slug}: Extracts 链接的文件不存在 ${rel}`);
    }
  }
  if (problems.length) {
    for (const problem of problems) process.stderr.write(`reading-queue: ${problem}\n`);
    output(options, { ok: false, problems });
    process.exit(1);
  }
  output(options, { ok: true, count: slugs.length }, `verify: OK（${slugs.length} 个阅读页通过）`);
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
    "渐进阅读队列维护（reading-queue）",
    "",
    "用法：",
    "  node reading-queue.mjs add <vault> <原文相对路径> [--priority high|medium|low] [--slug s] [--due today|scheduled|YYYY-MM-DD] [--every N]",
    "  node reading-queue.mjs today <vault> [--limit 3]",
    "  node reading-queue.mjs list <vault>",
    "  node reading-queue.mjs review <vault> <slug> --outcome next|postpone|done [--position ...] [--note ...]",
    "  node reading-queue.mjs note <vault> <slug> --text ...",
    "  node reading-queue.mjs pause <vault> <slug>",
    "  node reading-queue.mjs resume <vault> <slug>",
    "  node reading-queue.mjs stats <vault>",
    "  node reading-queue.mjs verify <vault>",
    "",
    "<vault> 为 Wiki 库根目录，须包含 wiki/ 子目录；原文位于 raw/、Clippings/，或 wiki/知识/sources/ 的登记页。",
    "",
    "选项：",
    "  --today YYYY-MM-DD  注入「今天」（测试用），默认本地日期",
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

  if (command === "add") {
    const vault = resolve(positional[0] ?? fail("add 需要 vault 路径"));
    requireVault(vault);
    await commandAdd(vault, positional.slice(1), options, todayFrom(options));
  } else if (command === "today") {
    const vault = resolve(positional[0] ?? fail("today 需要 vault 路径"));
    requireVault(vault);
    options.__today = todayFrom(options);
    await commandToday(vault, options, todayFrom(options));
  } else if (command === "list") {
    const vault = resolve(positional[0] ?? fail("list 需要 vault 路径"));
    requireVault(vault);
    await commandList(vault, options);
  } else if (command === "review") {
    const vault = resolve(positional[0] ?? fail("review 需要 vault 路径"));
    requireVault(vault);
    await commandReview(vault, positional.slice(1), options, todayFrom(options));
  } else if (command === "note") {
    const vault = resolve(positional[0] ?? fail("note 需要 vault 路径"));
    requireVault(vault);
    await commandNote(vault, positional.slice(1), options, todayFrom(options));
  } else if (command === "pause" || command === "resume") {
    const vault = resolve(positional[0] ?? fail(`${command} 需要 vault 路径`));
    requireVault(vault);
    await commandPauseOrResume(vault, positional.slice(1), options, command, todayFrom(options));
  } else if (command === "stats") {
    const vault = resolve(positional[0] ?? fail("stats 需要 vault 路径"));
    requireVault(vault);
    options.__today = todayFrom(options);
    await commandStats(vault, options);
  } else if (command === "verify") {
    const vault = resolve(positional[0] ?? fail("verify 需要 vault 路径"));
    requireVault(vault);
    await commandVerify(vault, options);
  } else {
    fail(`未知命令：${command}`);
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
