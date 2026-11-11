// 收课校验规则：全部纯函数，不读文件、不起子进程，供测试直接调用。
// 独占的知识：什么路径属于这门课、log 只能追加、index 不许删行、课程页与概念页的合法形状、
// 以及收课暂存里的科目页只能改「## 讲解偏好」一节。
// 对外接口：planCheck 汇总校验，以及各 check*/is*/owned*/subjectOf/stagingName 判定函数。
// 调用方：staging.mjs 的 gatherCheck；course-close.mjs 的 cmd* 与测试转出。
import { posix } from "node:path";
import { parseCourse } from "../course-parse.mjs";
import { completedIds, readSchedule } from "../course-schedule.mjs";

const COURSE_PAGE_MAX_LINES = 200;
const PREF_HEADING_RE = /^##\s+讲解偏好\s*$/;
const PREF_MAX_LINES = 15;

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
 */
export function ownedPrefixes(slug, subject, kind = "close") {
  const owned = [
    `wiki/courses/${slug}.md`,
    `wiki/courses/${slug}/`,
    "wiki/index.md",
    "wiki/log.md",
  ];
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
export function isOwned(path, slug, subject, kind = "close") {
  if (!isSafeRelPath(path)) return false;
  for (const entry of ownedPrefixes(slug, subject, kind)) {
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
 * 不超过 200 行。返回问题数组（空 = 通过）。
 */
export function checkCoursePage(text, slug) {
  const problems = [];
  const course = parseCourse(text, slug);
  if (!course.marked) problems.push("缺少 xuegen:course-state 标记，不是有效课程页");
  const lines = text.split("\n").length;
  if (lines > COURSE_PAGE_MAX_LINES) {
    problems.push(`课程页 ${lines} 行，超过 ${COURSE_PAGE_MAX_LINES} 行上限`);
  }
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
    if (!isOwned(path, manifest.slug, manifest.subject, manifest.kind ?? "close")) {
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
