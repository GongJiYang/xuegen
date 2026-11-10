// 收课校验规则：全部纯函数，不读文件、不起子进程，供测试直接调用。
// 独占的知识：什么路径属于这门课、log 只能追加、index 不许删行、课程页与概念页的合法形状。
// 对外接口：planCheck 汇总校验，以及各 check*/is*/owned*/subjectOf/stagingName 判定函数。
// 调用方：staging.mjs 的 gatherCheck；course-close.mjs 的 cmd* 与测试转出。
import { posix } from "node:path";
import { parseCourse } from "../course-parse.mjs";
import { completedIds, readSchedule } from "../course-schedule.mjs";

const COURSE_PAGE_MAX_LINES = 200;

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
 */
export function ownedPrefixes(slug, subject) {
  const owned = [
    `wiki/courses/${slug}.md`,
    `wiki/courses/${slug}/`,
    "wiki/index.md",
    "wiki/log.md",
  ];
  if (subject) {
    owned.push(
      `wiki/knowledge/concepts/${subject}/`,
      `wiki/knowledge/flashcards/${subject}/`,
      "wiki/知识/concepts/",
      "wiki/知识/flashcards/",
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
export function isOwned(path, slug, subject) {
  if (!isSafeRelPath(path)) return false;
  for (const entry of ownedPrefixes(slug, subject)) {
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
  for (const item of staged) {
    const { path } = item;
    if (item.symlink) {
      problems.push({ path, kind: "owner", detail: "暂存目录里是符号链接，拒绝跟随（收课只接受普通文件）" });
      continue;
    }
    const inBase = Object.prototype.hasOwnProperty.call(manifest.base, path);
    const cur = current.get(path);
    if (!isOwned(path, manifest.slug, manifest.subject)) {
      problems.push({ path, kind: "owner", detail: "路径不属于这门课，不能收课写入" });
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
