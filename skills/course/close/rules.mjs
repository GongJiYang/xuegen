// 收课校验规则：全部纯函数，不读文件、不起子进程，供测试直接调用。
// 独占的知识：什么路径属于这门课、log 只能追加、index 不许删行、课程页与概念页的合法形状、
// 以及收课暂存里的科目页只能改「## 讲解偏好」一节。
// 对外接口：planCheck 汇总校验，以及各 check*/is*/owned*/subjectOf/stagingName 判定函数；
// addedCompletedIds/checkSelfReport 是计划暂存「自报」提交（用户说学过、直接勾课次）的校验。
// 调用方：staging.mjs 的 gatherCheck；course-close.mjs 的 cmd* 与测试转出。
import { posix } from "node:path";
import { parseCourse } from "../course-parse.mjs";
import { completedIds, readSchedule } from "../course-schedule.mjs";
import { AFTER_HEADING, parseAfterReads } from "../../reading/shelf-after.mjs";

const COURSE_PAGE_MAX_LINES = 200;
const PREF_HEADING_RE = /^##\s+讲解偏好\s*$/;
const PREF_MAX_LINES = 15;
const RECORD_SECTION_RE = /^##\s+Learning Record\s*$/;
const DONE_LINE_RE = /完成[:：]/;

/** 暂存目录名：本地时间 <slug>-YYYYMMDD-HHMMSS。 */
export function stagingName(slug, now) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${slug}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

/** 课程页 Relationships 节里第一个 [[subjects/<s>]] 的 <s>；没有返回 null。 */
export function subjectOf(courseText) {
  const lines = courseText.split("\n");
  const start = lines.findIndex((line) => /^##\s+Relationships\s*$/.test(line.trim()));
  if (start === -1) return null;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) break;
    const match = /\[\[subjects\/([^\]|#\s]+)/.exec(lines[i]);
    if (match) return match[1];
  }
  return null;
}

/** 课程页正文里第一个 [[shelf/<书>]] 链接的 <书>（正则同 course-state.mjs）；没有返回 null。 */
export function bookOf(courseText) {
  return /\[\[shelf\/([^\]|]+)/.exec(courseText)?.[1] ?? null;
}

/**
 * 这门课允许写入的库内路径（见设计「校验 1」）。返回字符串数组：
 * 以 "/" 结尾的是目录前缀，其余是必须精确相等的文件路径。新旧两种布局都列。
 * kind 是暂存的种类（manifest.kind，旧的没有一律当 "close"）：
 * "close" 收课暂存还放本科目的概念页、卡片目录与本科目页；"plan" 计划暂存只放
 * 课程页与科目页、index、log——总控不写知识页。
 *
 * 收课暂存也含 `wiki/subjects/<subject>.md`：用户 2026-11-08 要求课上说的「以后讲
 * 离散都…」当场记进本科目页。那不是放开整页写入——`planCheck` 只许改
 * 「## 讲解偏好」一节（见 checkSubjectPreference），别的行一行都不能动。
 *
 * book 非 null 时两种 kind 都加 `wiki/shelf/<book>.md`（收敛 A2：课后读写进
 * 本课链着的书页，planCheck 只许改它的「## 课后读」一节，见 checkAfterReadSection）。
 */
export function ownedPrefixes(slug, subject, kind = "close", book = null) {
  const owned = [
    `wiki/courses/${slug}.md`,
    `wiki/courses/${slug}/`,
    "wiki/index.md",
    "wiki/log.md",
  ];
  if (book !== null) owned.push(`wiki/shelf/${book}.md`);
  if (kind === "plan") {
    if (subject) owned.push(`wiki/subjects/${subject}.md`);
    return owned;
  }
  if (subject) {
    owned.push(
      `wiki/knowledge/concepts/${subject}/`,
      `wiki/knowledge/flashcards/${subject}/`,
      `wiki/subjects/${subject}.md`,
    );
  }
  return owned;
}

/**
 * 是否是安全的库内相对路径：非空、不含反斜杠与 NUL、不是绝对路径（含盘符）、
 * 不以 "/" 结尾、且已经是 posix 规范形式（没有 `.`、`..`、连续斜杠）。
 * `wiki/courses/<slug>/../profile.md` 这类用 `..` 逃出本课目录的写法在这里被判为不安全。
 */
export function isSafeRelPath(path) {
  if (typeof path !== "string" || path === "") return false;
  if (path.includes("\0") || path.includes("\\")) return false;
  if (path.startsWith("/")) return false;
  if (/^[A-Za-z]:/.test(path)) return false;
  if (path.endsWith("/")) return false;
  if (path === ".") return false;
  if (posix.isAbsolute(path)) return false;
  // 有 `.`、`..`、连续斜杠、结尾斜杠的写法都不是规范形式：直接拒绝，不做纠正。
  if (path !== posix.normalize(path)) return false;
  return !path.startsWith("../") && path !== ".." && !path.startsWith("./");
}

/** path 为库内相对路径（posix 分隔符）；不安全或不属于本课时返回 false。 */
export function isOwned(path, slug, subject, kind = "close", book = null) {
  if (!isSafeRelPath(path)) return false;
  for (const entry of ownedPrefixes(slug, subject, kind, book)) {
    if (entry.endsWith("/") ? path.startsWith(entry) : path === entry) return true;
  }
  return false;
}

/** log.md 只允许追加：新内容必须以基线全文开头。通过返回 null，否则中文原因。 */
export function checkAppendOnly(baseText, newText) {
  if (newText.startsWith(baseText)) return null;
  let i = 0;
  while (i < baseText.length && i < newText.length && baseText[i] === newText[i]) i += 1;
  const line = baseText.slice(0, i).split("\n").length;
  return `不是纯追加：第 ${line} 行起的内容与基线不同（log.md 只能在末尾追加）`;
}

/** index.md 不许删行：基线每个非空行（去掉行尾空白）都必须还在。通过返回 null。 */
export function checkNoDeletedLines(baseText, newText) {
  const present = new Set(newText.split("\n").map((line) => line.replace(/\s+$/, "")));
  for (const line of baseText.split("\n")) {
    const trimmed = line.replace(/\s+$/, "");
    if (trimmed === "") continue;
    if (!present.has(trimmed)) {
      const shown = trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
      return `基线里的行被删除或改动：${shown}`;
    }
  }
  return null;
}

/**
 * 课程页校验：能解析且带 xuegen:course-state 标记；「完成：」里的课次 id 都在排期表；
 * 不超过 200 行；`## Learning Record` 只能有一节（两节时第二段的「完成：」既绕过自报
 * 校验、又不被 completedIds 认，落盘就是脏数据）。返回问题数组（空 = 通过）。
 */
export function checkCoursePage(text, slug) {
  const problems = [];
  const course = parseCourse(text, slug);
  if (!course.marked) problems.push("缺少 xuegen:course-state 标记，不是有效课程页");
  const lines = text.split("\n");
  if (lines.length > COURSE_PAGE_MAX_LINES) {
    problems.push(`课程页 ${lines.length} 行，超过 ${COURSE_PAGE_MAX_LINES} 行上限`);
  }
  const recordSections = lines.filter((line) => RECORD_SECTION_RE.test(line.trim())).length;
  if (recordSections > 1) problems.push("课程页只能有一节 ## Learning Record");
  let schedule = null;
  try {
    schedule = readSchedule(text);
  } catch (error) {
    problems.push(`排期表无法解析：${error instanceof Error ? error.message : error}`);
  }
  const ids = new Set(schedule ? schedule.rows.map((row) => row.id) : []);
  for (const id of completedIds(text)) {
    if (!ids.has(id)) problems.push(`「完成：」里的课次不在排期表：${id}`);
  }
  return problems;
}

/** text 里「## 讲解偏好」一节的 { start: 标题行下标, end: 下一个 ## 的下标或行数 }；没有返回 null。 */
function prefSection(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => PREF_HEADING_RE.test(line.trim()));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { lines, start, end };
}

/** 去掉「讲解偏好」一节后的行（节不存在就是全文的行），用来逐行比对节外内容。 */
function linesOutsidePref(text) {
  const section = prefSection(text);
  const lines = text.split("\n");
  if (section === null) return lines;
  return [...lines.slice(0, section.start), ...lines.slice(section.end)];
}

/**
 * 收课暂存的科目页校验（用户 2026-11-08 要求课上记「以后讲<科目>都…」）：
 * 相对基线 baseText，只有「## 讲解偏好」标题行到下一个 `## ` 之间的内容可以变，
 * 节外每一行必须完全相同；基线没有这一节时只许在文末追加这一节。
 * 这一节的行数（不含标题与空行）不超过 15 行。
 * 返回 [{ kind, detail }]（空 = 通过）；kind 为 subject-scope / subject-lines。
 */
export function checkSubjectPreference(baseText, newText) {
  const problems = [];
  // 基线没有这一节：只许在文末新建（新内容必须以基线全文开头，同 log.md 的追加规则）。
  // 中间插一节、或改掉原来的行，都不算「在文末新建」。
  if (prefSection(baseText) === null) {
    if (checkAppendOnly(baseText, newText) !== null) {
      problems.push({ kind: "subject-scope", detail: "收课只能改本科目页的「讲解偏好」一节" });
    }
  } else if (prefSection(newText) === null) {
    // 基线有这一节、新内容整节不见了：等于删了偏好，不算「只改这一节」。
    problems.push({ kind: "subject-scope", detail: "收课只能改本科目页的「讲解偏好」一节（不能整节删掉）" });
  } else {
    const before = linesOutsidePref(baseText);
    const after = linesOutsidePref(newText);
    const sameOutside = before.length === after.length && before.every((line, index) => line === after[index]);
    if (!sameOutside) {
      problems.push({ kind: "subject-scope", detail: "收课只能改本科目页的「讲解偏好」一节" });
    }
  }
  const section = prefSection(newText);
  const count =
    section === null
      ? 0
      : section.lines.slice(section.start + 1, section.end).filter((line) => line.trim() !== "").length;
  if (count > PREF_MAX_LINES) {
    problems.push({ kind: "subject-lines", detail: `讲解偏好不超过 ${PREF_MAX_LINES} 行（现在 ${count} 行）` });
  }
  return problems;
}

const AFTER_HEADING_RE = /^##\s+课后读\s*$/;
// 课程页里「讲后读」待办行：收敛后一律写进书页（course_close after-read），课程页不许新写。
const AFTER_TODO_RE = /^\s*-\s+\[[ xX]\]\s+讲后读/;

/** text 里「## 课后读」一节的 { lines, start: 标题行下标, end: 下一个 ## 的下标或行数 }；没有返回 null。 */
function afterSection(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => AFTER_HEADING_RE.test(line.trim()));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { lines, start, end };
}

/** 去掉「## 课后读」一节后的行（节不存在就是全文的行），用来逐行比对节外内容。 */
function linesOutsideAfter(text) {
  const section = afterSection(text);
  const lines = text.split("\n");
  if (section === null) return lines;
  return [...lines.slice(0, section.start), ...lines.slice(section.end)];
}

/** 「## 课后读」一节里的非空行（不含标题）。节不存在返回 []。 */
export function afterSectionRows(text) {
  const section = afterSection(text);
  if (section === null) return [];
  return section.lines.slice(section.start + 1, section.end).filter((line) => line.trim() !== "");
}

/**
 * 收课/计划暂存的书页校验（收敛 A2：课后读写进本课链着的书页）：
 * 照 checkSubjectPreference 的写法——只有「## 课后读」标题行到下一个 `## ` 之间的内容
 * 可以变，节外每一行必须与基线完全相同；基线没有这一节时等于「插了一节」，
 * 去掉新节后的行必须与基线逐行相同（addAfterRead 把新节插在「## 排期」之后、
 * 不是文末，所以这里不能用 log.md 那种纯追加规则）。整节删掉不允许。
 * 这一节里新出现的非空行（相对基线按多重集比）必须能被 parseAfterReads 认出来。
 * 返回 [{ kind: "shelf-scope", detail }]（空 = 通过）。
 */
export function checkAfterReadSection(baseText, newText) {
  const problems = [];
  if (afterSection(baseText) !== null && afterSection(newText) === null) {
    problems.push({ kind: "shelf-scope", detail: "收课只能改书页的「课后读」一节（不能整节删掉）" });
  } else {
    const before = linesOutsideAfter(baseText);
    const after = linesOutsideAfter(newText);
    const sameOutside = before.length === after.length && before.every((line, index) => line === after[index]);
    if (!sameOutside) {
      problems.push({ kind: "shelf-scope", detail: "收课只能改书页的「课后读」一节" });
    }
  }
  // 节里新出现的非空行必须能被 parseAfterReads 认出来（删行、原样行、挪位置都不算新）。
  const baseRows = new Map();
  for (const row of afterSectionRows(baseText)) {
    baseRows.set(row, (baseRows.get(row) ?? 0) + 1);
  }
  for (const row of afterSectionRows(newText)) {
    const count = baseRows.get(row) ?? 0;
    if (count > 0) {
      baseRows.set(row, count - 1);
      continue;
    }
    if (parseAfterReads([AFTER_HEADING, row]).length === 0) {
      problems.push({ kind: "shelf-scope", detail: `课后读这一行格式不对：${row.trim()}` });
    }
  }
  return problems;
}

/**
 * 课程页不许新写「讲后读」待办行（收敛 A2：课后读改用 course_close after-read 写进书页）。
 * 基线里已有的旧行不算（迁移前不拦），删掉旧行允许——按行做多重集比较，
 * 只有 staged 比 base 多出来的、形状是 `- [ ]/- [x] 讲后读…` 的行才报。
 * 返回 [{ kind: "course-page", detail }]（空 = 通过）；baseText 为 null 时全部算新加。
 */
export function checkNoNewAfterReadLines(baseText, newText) {
  const left = new Map();
  for (const line of (baseText ?? "").split("\n")) {
    const key = line.trim();
    if (key === "") continue;
    left.set(key, (left.get(key) ?? 0) + 1);
  }
  const problems = [];
  for (const line of newText.split("\n")) {
    const key = line.trim();
    if (key !== "" && (left.get(key) ?? 0) > 0) {
      left.set(key, left.get(key) - 1);
      continue;
    }
    if (AFTER_TODO_RE.test(line)) {
      problems.push({ kind: "course-page", detail: "课后读不再写进课程页，用 course_close after-read 写进书页" });
    }
  }
  return problems;
}

/**
 * 计划暂存提交前：课程页新加的完成 id（staged 有、base 没有），与排期表顺序无关，
 * 返回排序后的数组。baseText 为 null（新建课程，库里还没有课程页）时当空集。
 */
export function addedCompletedIds(baseText, stagedText) {
  const base = baseText === null ? new Set() : completedIds(baseText);
  return [...completedIds(stagedText)].filter((id) => !base.has(id)).sort();
}

/**
 * 记录块：`### ` 开头到下一个 `### ` / `## ` 之间的内容。
 * 默认只看课程页的 `## Learning Record` 节（没有这一节返回 []）；whole 为 true 时
 * 整份文件都切块——归档文件 `wiki/courses/<slug>/records/YYYY-MM.md` 没有这一节标题。
 * 返回 [{ heading: 去掉首尾空白的标题行, body: 标题行之后的行 }]。
 */
export function recordBlocks(text, { whole = false } = {}) {
  const lines = text.split("\n");
  const start = whole ? 0 : lines.findIndex((line) => RECORD_SECTION_RE.test(line.trim()));
  if (start === -1) return [];
  const blocks = [];
  let current = null;
  // 课程页从节标题的下一行开始切；整份文件（归档）从第一行开始，别把首行的块标题吃掉。
  for (const line of lines.slice(whole ? 0 : start + 1)) {
    if (/^##\s/.test(line)) break;
    if (/^###\s/.test(line)) {
      current = { heading: line.trim(), body: [] };
      blocks.push(current);
      continue;
    }
    if (current) current.body.push(line);
  }
  return blocks;
}

/** 块的比较文本：标题 + 正文（去掉正文尾部空行，免得块间空行变化被当成改记录）。 */
export function blockText(block) {
  const body = [...block.body];
  while (body.length > 0 && body[body.length - 1].trim() === "") body.pop();
  return [block.heading, ...body].join("\n");
}

/** 记录块正文里「完成：…」列出的课次 id。 */
function blockCompletedIds(block) {
  const done = new Set();
  for (const line of block.body) {
    const match = line.match(/完成[:：]\s*(.+)$/);
    if (!match) continue;
    for (const id of match[1].split(/[,，、\s]+/)) if (id) done.add(id.trim());
  }
  return done;
}

export const RECORD_HEADING_RE = /^###\s+\d{4}-\d{2}-\d{2}-\d{2}/;

/**
 * 自报提交的课程页校验，返回问题字符串数组（空 = 通过）：
 * ① added 为空 → 「自报提交没有新勾掉的课次（完成：行没变）」
 * ② stagedText 里没有**新加**的、标题含「自报」的 `### YYYY-MM-DD-NN（…自报…）` 记录
 *    → 「自报勾选要在学习记录里加一条标题含「自报」的记录」
 * ③ base 里的旧记录必须原样还在（标题与正文都不变），否则「自报不能改旧记录：<旧标题>」
 *    —— 只比标题行会被「把旧记录标题改成含自报」绕过。
 *    例外：旧记录整块**原样**挪进了归档（`wiki/courses/<slug>/records/*.md`，技能规定的
 *    「超过 2 条就把最早的挪进当月 records」），算合法移走，不报错。
 * ④ 新勾的课次必须写在那条新自报记录的「完成：」行里（写进别的块不算数）。
 * 「新块」= 标题 + 正文原样都找不到对应旧块的块。baseText 为 null（新建课程）时
 * 没有旧块可比，③④ 不适用（缺 ① ② 仍然拒）。
 * archivedTexts 是暂存里 records 文件的全文数组（course-close.mjs 从暂存目录读）。
 */
export function checkSelfReport(baseText, stagedText, archivedTexts = []) {
  const problems = [];
  const added = addedCompletedIds(baseText, stagedText);
  if (added.length === 0) {
    problems.push("自报提交没有新勾掉的课次（完成：行没变）");
  }
  const stagedBlocks = recordBlocks(stagedText);
  const baseBlocks = baseText === null ? [] : recordBlocks(baseText);
  // 旧块按「标题 + 正文」多重集比对：改标题、改正文、删旧块都算改了旧记录。
  const stagedTexts = stagedBlocks.map(blockText);
  const matched = new Array(stagedBlocks.length).fill(false);
  // 归档文件整份切块（没有 `## Learning Record` 标题），按同样的「标题 + 正文」比对。
  const archivedBlocks = archivedTexts.flatMap((text) => recordBlocks(text, { whole: true }));
  const archivedTextsOfBlocks = archivedBlocks.map(blockText);
  const archivedMatched = new Array(archivedBlocks.length).fill(false);
  for (const block of baseBlocks) {
    const text = blockText(block);
    const index = stagedTexts.findIndex((candidate, i) => !matched[i] && candidate === text);
    if (index === -1) {
      // 课程页里没了：原样出现在某个归档里就算「按归档规则挪走」，不算改旧记录。
      const archived = archivedTextsOfBlocks.findIndex((candidate, i) => !archivedMatched[i] && candidate === text);
      if (archived === -1) {
        problems.push(`自报不能改旧记录：${block.heading}`);
        continue;
      }
      archivedMatched[archived] = true;
      continue;
    }
    matched[index] = true;
  }
  const newBlocks = stagedBlocks.filter((_, index) => !matched[index]);
  const reportBlocks = newBlocks.filter((block) => RECORD_HEADING_RE.test(block.heading) && block.heading.includes("自报"));
  if (reportBlocks.length === 0) {
    problems.push("自报勾选要在学习记录里加一条标题含「自报」的记录");
  } else if (baseText !== null) {
    const done = new Set();
    for (const block of reportBlocks) for (const id of blockCompletedIds(block)) done.add(id);
    const missing = added.filter((id) => !done.has(id));
    if (missing.length > 0) {
      problems.push(`新勾的课次要写在自报记录的「完成：」行里：${missing.join("、")}`);
    }
  }
  return problems;
}

/**
 * 暂存文本里比 baseText 多出来的「完成：」行（按行做多重集比较，baseText 为 null 当空）。
 * 归档记录（wiki/courses/<slug>/records/*.md）用：计划暂存只许原样搬，不许新加完成行。
 */
export function addedDoneLines(baseText, stagedText) {
  const left = new Map();
  for (const line of (baseText === null ? "" : baseText).split("\n")) {
    const key = line.trim();
    if (key === "") continue;
    left.set(key, (left.get(key) ?? 0) + 1);
  }
  const added = [];
  for (const line of stagedText.split("\n")) {
    const key = line.trim();
    if (key === "" || !DONE_LINE_RE.test(key)) continue;
    const count = left.get(key) ?? 0;
    if (count > 0) {
      left.set(key, count - 1);
      continue;
    }
    added.push(key);
  }
  return added;
}

/** 归档记录路径：wiki/courses/<slug>/records/ 下的 .md。 */
function isArchiveRecord(slug, path) {
  return path.startsWith(`wiki/courses/${slug}/records/`) && path.endsWith(".md");
}

/**
 * 计划暂存里「整块原样挪进这份归档」的块里的「完成：」行（多重集，已 trim）：
 * base 课程页有这一块、staged 课程页里已经没了、而它原样出现在这份归档文本里。
 * 用于放行技能规定的「收课记录超过 2 条就把最早的挪进当月 records」——那种挪动能把
 * 块自带的「完成：」行一起搬走，不能当成「给归档新加完成行」。
 * 课程页不在暂存里、或库里没有基线课程页时返回 []（没有「挪走」可言）。
 */
function movedDoneLines(manifest, staged, baseCourseText, archivedText) {
  if (typeof baseCourseText !== "string") return [];
  const courseRel = `wiki/courses/${manifest.slug}.md`;
  const stagedPage = staged.find(
    (item) => item.path === courseRel && !item.symlink && typeof item.text === "string",
  );
  if (!stagedPage) return [];
  const stagedTexts = recordBlocks(stagedPage.text).map(blockText);
  const archivedTexts = recordBlocks(archivedText, { whole: true }).map(blockText);
  const out = [];
  for (const block of recordBlocks(baseCourseText)) {
    const text = blockText(block);
    if (stagedTexts.includes(text)) continue;
    if (!archivedTexts.includes(text)) continue;
    for (const line of block.body) {
      const key = line.trim();
      if (key !== "" && DONE_LINE_RE.test(key)) out.push(key);
    }
  }
  return out;
}

/** 新增概念页：以 "---\n" 开头且 frontmatter 内有 sources: 行。通过返回 null。 */
export function checkConceptPage(text) {
  if (!text.startsWith("---\n")) return "概念页缺少 frontmatter（须以 --- 开头）";
  const end = text.indexOf("\n---", 3);
  const frontmatter = end === -1 ? text : text.slice(4, end);
  if (!/^sources\s*:/m.test(frontmatter)) return "概念页 frontmatter 缺少 sources:";
  return null;
}

/**
 * 汇总校验（设计「校验」1–5 + 变更清单）。
 * manifest：{ slug, subject, base: { <库内路径>: <sha256> } }
 * staged：[{ path, sha, text }]（暂存镜像；text 仅 .md 有，其他为 null）
 * current：Map<库内路径, { sha, text }>，库里不存在的路径不在 map 里。
 * 返回 { ok, problems: [{ path, kind, detail }], changes: [{ path, action }] }。
 */
export function planCheck(manifest, staged, current) {
  const problems = [];
  const changes = [];
  // 新建课程（plan --new）必须写出课程页：没有就是半成品，不能提交。
  if (manifest.isNew === true && !staged.some((item) => item.path === `wiki/courses/${manifest.slug}.md`)) {
    problems.push({
      path: `wiki/courses/${manifest.slug}.md`,
      kind: "course-page",
      detail: "新建课程必须写课程页",
    });
  }
  for (const item of staged) {
    const { path } = item;
    if (item.symlink) {
      problems.push({ path, kind: "owner", detail: "暂存目录里是符号链接，拒绝跟随（收课只接受普通文件）" });
      continue;
    }
    const inBase = Object.prototype.hasOwnProperty.call(manifest.base, path);
    const cur = current.get(path);
    const subjectPage = manifest.subject ? path === `wiki/subjects/${manifest.subject}.md` : false;
    const book = manifest.book ?? null;
    const bookPage = book !== null && path === `wiki/shelf/${book}.md`;
    if (!isOwned(path, manifest.slug, manifest.subject, manifest.kind ?? "close", book)) {
      problems.push({ path, kind: "owner", detail: "路径不属于这门课，不能写入" });
      continue;
    }
    let conflicted = false;
    if (inBase) {
      if (!cur || cur.sha !== manifest.base[path]) {
        problems.push({ path, kind: "conflict", detail: "库里的文件在暂存后已被改动或删除，先 abort 重新 stage" });
        conflicted = true;
      }
    } else if (cur) {
      problems.push({ path, kind: "conflict", detail: "库里已有这个文件，先用 add 复制进来再改" });
      conflicted = true;
    }
    if (!conflicted && item.text !== null) {
      if (path === "wiki/log.md") {
        const reason = checkAppendOnly(cur.text, item.text);
        if (reason) problems.push({ path, kind: "append-only", detail: reason });
      } else if (path === "wiki/index.md") {
        const reason = checkNoDeletedLines(cur.text, item.text);
        if (reason) problems.push({ path, kind: "deleted-lines", detail: reason });
      } else if (path === `wiki/courses/${manifest.slug}.md`) {
        for (const detail of checkCoursePage(item.text, manifest.slug)) {
          problems.push({ path, kind: "course-page", detail });
        }
        // 收敛 A2：课程页不许新写「讲后读」待办行。基线取库里当前那份（同科目页的写法）。
        const baseText = inBase && cur && typeof cur.text === "string" ? cur.text : null;
        for (const problem of checkNoNewAfterReadLines(baseText, item.text)) {
          problems.push({ path, ...problem });
        }
      } else if (isArchiveRecord(manifest.slug, path) && (manifest.kind ?? "close") === "plan") {
        // 计划暂存不许往归档记录里新加「完成：」行：完成状态只能由课程页来（收课时整条记录
        // 连完成行一起搬过去，所以收课暂存不受这条限制）。库里没有这份记录时按空文本比。
        // 例外：整块原样挪走的旧记录（技能规定的归档）自带的完成行跟着搬，不算新加。
        const baseText = inBase && cur && typeof cur.text === "string" ? cur.text : null;
        const courseCur = current.get(`wiki/courses/${manifest.slug}.md`);
        const moved = new Map();
        for (const line of movedDoneLines(manifest, staged, courseCur?.text, item.text)) {
          moved.set(line, (moved.get(line) ?? 0) + 1);
        }
        const leftover = [];
        for (const line of addedDoneLines(baseText, item.text)) {
          const count = moved.get(line) ?? 0;
          if (count > 0) {
            moved.set(line, count - 1);
            continue;
          }
          leftover.push(line);
        }
        if (leftover.length > 0) {
          problems.push({ path, kind: "archive-record", detail: "归档记录只能原样搬进来，不能新加完成行" });
        }
      } else if (bookPage) {
        // 本课链着的书页（close 与 plan 都限）：只许改「## 课后读」一节
        // （checkAfterReadSection），且节里新加的行必须能被 parseAfterReads 认出来。
        // 基线文本取库里的那份：冲突检查已保证它与 stage 时的基线一致。
        const baseText = inBase && cur && typeof cur.text === "string" ? cur.text : null;
        if (baseText === null) {
          problems.push({
            path,
            kind: "shelf-scope",
            detail: "书页不在暂存基线里：先用 add 把书页复制进暂存再改",
          });
          continue;
        }
        for (const problem of checkAfterReadSection(baseText, item.text)) {
          problems.push({ path, ...problem });
        }
      } else if (subjectPage && (manifest.kind ?? "close") !== "plan") {
        // 收课暂存的本科目页：只许改「## 讲解偏好」一节（计划暂存不设此限，总控能改整页）。
        // 基线文本取库里的那份：冲突检查已保证它与 stage 时的基线一致。
        const baseText = inBase && cur && typeof cur.text === "string" ? cur.text : null;
        if (baseText === null) {
          problems.push({
            path,
            kind: "subject-scope",
            detail: "科目页不在暂存基线里：先用 add 把本科目页复制进暂存再改",
          });
          continue;
        }
        for (const problem of checkSubjectPreference(baseText, item.text)) {
          problems.push({ path, ...problem });
        }
      }
      if (!inBase && /(^|\/)concepts\//.test(path) && path.endsWith(".md")) {
        const reason = checkConceptPage(item.text);
        if (reason) problems.push({ path, kind: "concept-page", detail: reason });
      }
    }
    if (!cur || cur.sha !== item.sha) {
      changes.push({ path, action: inBase ? "update" : "create" });
    }
  }
  return { ok: problems.length === 0, problems, changes };
}
