// 书页 `## 课后读` 一节的纯函数：解析、格式化、加行、勾行、汇总已读页。
// 不读写文件、不读时钟（日期由调用方注入）；bookshelf.mjs 的命令层负责 IO。
// 页码列表的解析与格式化也住在这里，bookshelf.mjs 反向 import 并继续导出。
//
// 行格式（一条一行，字段以 ` · ` 分隔）：
//   - [ ] <标签> · pp.<页码列表> · <课程slug> · <排在哪天>
//   - [x] <标签> · pp.<页码列表> · <课程slug> · <排在哪天> · 读于 <读完日期>
// 标签是给人看的范围（§1.1–1.4、Ch1–Ch2 等）：不含 ` · `、不含换行、≤ 60 字；
// 页码是 formatPageList 的规范串；日期 YYYY-MM-DD。不认识的行原样保留、不报错。

// `## 课后读` 新节插在 `## 排期` 之后、这几节中最先出现者之前。
const AFTER_FOLLOWERS = ["## 讲后读已读", "## 核心页已读", "## 摘录", "## 读书记录"];

const AFTER_OPEN_RE =
  /^-\s+\[\s\]\s+(.+?)\s+·\s+pp\.(.+?)\s+·\s+([a-z0-9-]+)\s+·\s+(\d{4}-\d{2}-\d{2})\s*$/;
const AFTER_DONE_RE =
  /^-\s+\[[xX]\]\s+(.+?)\s+·\s+pp\.(.+?)\s+·\s+([a-z0-9-]+)\s+·\s+(\d{4}-\d{2}-\d{2})(?:\s+·\s+读于\s+(\d{4}-\d{2}-\d{2}))?\s*$/;
const COURSE_RE = /^[a-z0-9-]+$/;

export const AFTER_HEADING = "## 课后读";

// 与 bookshelf.mjs 相同的两个小工具：shelf-after 是底层文件，不能反向 import。
function isDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const time = Date.parse(`${text}T00:00:00Z`);
  if (Number.isNaN(time)) return false;
  return new Date(time).toISOString().slice(0, 10) === text;
}

function sectionRange(body, heading) {
  const start = body.findIndex((line) => line.trim() === heading);
  if (start === -1) return null;
  const rest = body.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return { start: start + 1, end: end === -1 ? body.length : start + 1 + end };
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

// ---- 校验：抛 Error（中文文案，命令层转 fail） ----

function checkLabel(label) {
  const clean = typeof label === "string" ? label.trim() : "";
  if (
    clean === "" ||
    clean.includes("\n") ||
    clean.includes(" · ") ||
    clean.length > 60
  ) {
    throw new Error(`--label 非法：${label}`);
  }
  return clean;
}

function checkPages(pages) {
  const canonical = formatPageList(parsePageList(String(pages ?? "")));
  if (canonical === "") throw new Error(`页码列表非法：${pages}`);
  return canonical;
}

function checkCourse(course) {
  if (typeof course !== "string" || !COURSE_RE.test(course)) {
    throw new Error(`--course 非法：${course}`);
  }
  return course;
}

function checkDate(date) {
  if (!isDate(String(date))) throw new Error(`日期非法：${date}`);
  return String(date);
}

// ---- 解析 ----

// 单行 → {label, pages, course, date, done, readOn}；不认识返回 null。
// pages 归一成 formatPageList 的规范串；`pp.` 后面解析不出页码的行当作不认识。
function parseAfterLine(line) {
  const done = line.match(AFTER_DONE_RE);
  const match = done ?? line.match(AFTER_OPEN_RE);
  if (!match) return null;
  const pages = formatPageList(parsePageList(match[2]));
  if (pages === "") return null;
  return {
    label: match[1].trim(),
    pages,
    course: match[3],
    date: match[4],
    done: done !== null,
    readOn: done ? (match[5] ?? null) : null,
  };
}

// 节内匹配行 → [{ line, entry }]：line 是 body 行号，entry.index 从 1 起、只数匹配行。
function afterLines(body) {
  const range = sectionRange(body, AFTER_HEADING);
  if (range === null) return [];
  const rows = [];
  for (let line = range.start; line < range.end; line += 1) {
    const parsed = parseAfterLine(body[line]);
    if (parsed === null) continue;
    rows.push({ line, entry: { index: rows.length + 1, ...parsed } });
  }
  return rows;
}

// `## 课后读` 一节 → [{ index, label, pages, course, date, done, readOn }]；没有该节返回 []。
export function parseAfterReads(body) {
  return afterLines(body).map(({ entry }) => entry);
}

// ---- 格式化 ----

// { label, pages, course, date, readOn } → 一行；readOn null 是 `- [ ]`，否则 `- [x] … · 读于 <readOn>`。
export function formatAfterRead({ label, pages, course, date, readOn = null }) {
  const cleanLabel = checkLabel(label);
  const canonical = checkPages(pages);
  checkCourse(course);
  checkDate(date);
  const base = `- ${readOn === null ? "[ ]" : "[x]"} ${cleanLabel} · pp.${canonical} · ${course} · ${date}`;
  if (readOn === null) return base;
  return `${base} · 读于 ${checkDate(readOn)}`;
}

// ---- 加行与勾行 ----

// `## 课后读` 新节的插入点：`## 排期` 一节之后、AFTER_FOLLOWERS 中最先出现者的行号；没有返回 -1。
function sectionAnchor(body) {
  const plan = sectionRange(body, "## 排期");
  const from = plan === null ? 0 : plan.end;
  for (let line = from; line < body.length; line += 1) {
    if (AFTER_FOLLOWERS.includes(body[line].trim())) return line;
  }
  return -1;
}

// 加一条：同 course 同 label 的未勾行已存在 → 只改那行的页码与日期（updated: true）；
// 否则加在节末（节不存在按 AFTER_FOLLOWERS 的位置新建，前后留空行，updated: false）。
// 返回 { body, index, updated }，不改入参；index 是该行在 `## 课后读` 里的序号。
export function addAfterRead(body, { label, pages, course, date }) {
  const cleanLabel = checkLabel(label);
  const canonical = checkPages(pages);
  checkCourse(course);
  checkDate(date);
  const line = formatAfterRead({ label: cleanLabel, pages: canonical, course, date });

  const rows = afterLines(body);
  const existing = rows.find(
    ({ entry }) => !entry.done && entry.course === course && entry.label === cleanLabel,
  );
  if (existing !== undefined) {
    const copy = body.slice();
    copy[existing.line] = line;
    return { body: copy, index: existing.entry.index, updated: true };
  }

  const copy = body.slice();
  const range = sectionRange(copy, AFTER_HEADING);
  if (range !== null) {
    let at = range.end;
    while (at > range.start && copy[at - 1].trim() === "") at -= 1;
    copy.splice(at, 0, line);
    return { body: copy, index: rows.length + 1, updated: false };
  }
  const section = [AFTER_HEADING, "", line, ""];
  const anchor = sectionAnchor(copy);
  if (anchor === -1) {
    if (copy.length > 0 && copy[copy.length - 1].trim() !== "") copy.push("");
    copy.push(...section);
    return { body: copy, index: 1, updated: false };
  }
  const needsBlank = anchor > 0 && copy[anchor - 1].trim() !== "";
  copy.splice(anchor, 0, ...(needsBlank ? ["", ...section] : section));
  return { body: copy, index: 1, updated: false };
}

// 勾第 index 行：改成 `- [x]` 加 ` · 读于 <today>`。已勾过或没有这一行都抛错。
// 不改入参。
export function markAfterRead(body, index, today) {
  const target = afterLines(body).find(({ entry }) => entry.index === index);
  if (target === undefined) throw new Error(`没有第 ${index} 条课后读`);
  if (target.entry.done) throw new Error("这条课后读已经记过");
  checkDate(today);
  const copy = body.slice();
  copy[target.line] = formatAfterRead({ ...target.entry, readOn: today });
  return copy;
}

// 所有已勾行的页码：parsePageList 展开后去重、升序。
export function afterReadPages(body) {
  const pages = [];
  for (const { entry } of afterLines(body)) {
    if (entry.done) pages.push(...parsePageList(entry.pages));
  }
  return [...new Set(pages)].sort((a, b) => a - b);
}
