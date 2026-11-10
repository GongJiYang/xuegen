#!/usr/bin/env node
// Xuegen 收课事务：课程会话在库外暂存目录里改课程页与概念页，校验通过后一次性提交进库。
// 无第三方依赖。设计见 docs/platform/STAGE3-DESIGN.md。
//   node course-close.mjs stage   <vault> <slug> --workspace <工作区> [--json]
//   node course-close.mjs add     <暂存目录> <库内相对路径> [--json]
//   node course-close.mjs check   <暂存目录> [--json]
//   node course-close.mjs commit  <暂存目录> [--label 收课|存档点] [--json]
//   node course-close.mjs abort   <暂存目录>
//   node course-close.mjs shift   <vault> <slug> --workspace <工作区> [--today YYYY-MM-DD] [--end YYYY-MM-DD] [--json]
//   node course-close.mjs undo    <vault> <slug> --workspace <工作区> [--json]
//   node course-close.mjs recover <vault> --workspace <工作区> [--json]
//
// 落盘可靠性：写临时文件后 fsync 再 rename。Node 的 fsync/FileHandle.sync() 在 macOS 上
// 由 libuv uv__fs_fsync（src/unix/fs.c）实现：__APPLE__ 分支先 fcntl(F_FULLFSYNC)，
// 不支持时退回 F_BARRIERFSYNC、再退回 fsync()，因此 sync 即「刷到持久存储」。
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCourse } from "./course-parse.mjs";
import { completedIds, lastNewLessonDate, readSchedule, renderTable, shiftSchedule, writeSchedule } from "./course-schedule.mjs";

const READONLY_FILE = 0o444;
const WRITABLE_FILE = 0o644;
const READONLY_DIR = 0o555;
const COURSE_PAGE_MAX_LINES = 200;

function fail(message) {
  process.stderr.write(`course-close: ${message}\n`);
  process.exit(1);
}

// ---- 纯函数：不读文件、不碰子进程，供测试直接调用 ----

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

// ---- IO：sha、写时复制、原子写、临时放开只读锁、jj ----

function hashBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sha256(file) {
  return hashBuffer(readFileSync(file));
}

/** 写时复制进暂存；跨卷或不支持退回普通复制。目标父目录先建好。 */
function cloneInto(src, dst) {
  mkdirSync(dirname(dst), { recursive: true });
  try {
    copyFileSync(src, dst, constants.COPYFILE_FICLONE);
  } catch (error) {
    if (error && ["EXDEV", "ENOTSUP", "ENOSYS"].includes(error.code)) {
      copyFileSync(src, dst);
    } else {
      throw error;
    }
  }
}

/** 同目录临时文件 → fsync → rename；mode 给出时先 chmod。 */
function writeAtomic(file, data, mode) {
  const tmp = join(dirname(file), `.${basename(file)}.tmp-${process.pid}`);
  const fd = openSync(tmp, "w");
  try {
    writeFileSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  if (mode !== undefined) chmodSync(tmp, mode);
  renameSync(tmp, file);
}

/** 临时把目录 chmod u+w，结束后恢复原 mode：fn 抛错、返回的 Promise 失败时都恢复。
 * 导出只为测试（不在文档里承诺）；调用方不要依赖。 */
export function withWritable(dir, fn) {
  const before = statSync(dir).mode & 0o777;
  const restore = () => {
    if (!(before & 0o200)) chmodSync(dir, before);
  };
  if (!(before & 0o200)) chmodSync(dir, before | 0o700);
  let result;
  try {
    result = fn();
  } catch (error) {
    restore();
    throw error;
  }
  // fn 是异步的时候，等它结束再恢复（读目录、写文件目前都是同步的，这里只是兜底）。
  if (result && typeof result.then === "function") return result.finally(restore);
  restore();
  return result;
}

/** path 向上找第一个已存在的祖先目录（新文件的父目录可能还没建）。 */
function nearestExistingDir(path) {
  let dir = path;
  while (!existsSync(dir) || !statSync(dir).isDirectory()) dir = dirname(dir);
  return dir;
}

/** 目录本身及其全部子目录（不递归进 . 开头目录，不跟随符号链接）。 */
function walkDirs(dir) {
  const out = [dir];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) out.push(...walkDirs(join(dir, entry.name)));
  }
  return out;
}

/** 目录下全部普通文件（同样跳过 . 开头目录与符号链接）。 */
function walkFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function isJjRepo(vault) {
  return existsSync(join(vault, ".jj"));
}

/** 库不是 jj 仓库时整个 jj 步骤跳过（调用方在结果里写 "skipped"）。 */
function jj(args, cwd) {
  return execFileSync("jj", args, { cwd, encoding: "utf8" });
}

/** jj fileset 里的单文件字面量：用 `root-file:`（库根相对、精确匹配），并转义路径里的
 * 反斜杠与引号。不用默认的 prefix-glob 写法：`{a => b}.md` 这类文件名会被当成模式。 */
function filesetLiteral(path) {
  return `root-file:"${path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** jj diff 用的模板：状态 + JSON 转义的源/目标路径，一行一条，路径里的制表符、引号、
 * 花括号都不会弄乱解析。 */
const DIFF_TEMPLATE = 'status ++ "\\t" ++ json(source.path()) ++ "\\t" ++ json(target.path()) ++ "\\n"';

function jjCommit(vault, message, paths) {
  if (!isJjRepo(vault)) return "skipped";
  // 只提交本次写入的文件（jj fileset 参数，路径相对库根）：库里别的未提交改动留在工作副本里。
  if (!Array.isArray(paths) || paths.length === 0) return "skipped";
  try {
    jj(["commit", "-m", message, "--", ...paths.map(filesetLiteral)], vault);
    return "ok";
  } catch (error) {
    const stderr = error && error.stderr ? String(error.stderr) : String(error);
    const first = stderr.split("\n").find((line) => line.trim() !== "") ?? "";
    return `failed: ${first.trim()}`;
  }
}

/** jj 的状态词（added/modified/…）→ 单字母（A/M/D/R/C）。 */
const STATUS_LETTER = {
  added: "A",
  modified: "M",
  removed: "D",
  deleted: "D",
  renamed: "R",
  copied: "C",
};

/**
 * jj diff（DIFF_TEMPLATE）的输出 → [{ status, paths }]。重命名/复制给出源与目标两条路径，
 * 撤销时两边都要恢复；其余状态只有一条。
 */
export function parseDiffEntries(text) {
  const out = [];
  for (const raw of text.split("\n")) {
    if (raw.trim() === "") continue;
    const [statusWord, sourceJson, targetJson] = raw.split("\t");
    if (!statusWord || sourceJson === undefined) continue;
    const status = STATUS_LETTER[statusWord.trim()] ?? statusWord.trim().slice(0, 1).toUpperCase();
    let paths;
    try {
      const source = JSON.parse(sourceJson);
      const target = targetJson === undefined ? source : JSON.parse(targetJson);
      paths = [source, target];
    } catch {
      continue;
    }
    out.push({ status, paths: [...new Set(paths)] });
  }
  return out;
}

/** 某次提交（或某个 diff 范围）改过哪些文件。 */
function diffEntries(vault, revset) {
  return parseDiffEntries(jj(["diff", "-r", revset, "-T", DIFF_TEMPLATE], vault));
}

/**
 * undo 的安全闸：收课提交 <id> 之后（<id>+::@，含之后的所有提交与工作副本改动）
 * 又改过这批文件，就不能从 <id>- 恢复，否则会盖掉那次改动。有冲突时 fail 且什么都不动。
 */
function guardLaterChanges(vault, slug, id, files) {
  let reachable;
  try {
    reachable = jj(["log", "-r", `${id}::@`, "--no-graph", "-T", 'commit_id ++ "\\n"'], vault).trim();
  } catch (error) {
    fail(`jj log 失败：${error instanceof Error ? error.message : error}`);
  }
  if (reachable === "") {
    fail(`最近的收课提交 ${id} 不在当前工作副本的历史上，不能直接撤销（可能已经撤销过）`);
  }
  let later;
  try {
    later = diffEntries(vault, `${id}+::@`);
  } catch (error) {
    fail(`jj diff 失败：${error instanceof Error ? error.message : error}`);
  }
  const touched = new Map();
  for (const entry of later) for (const path of entry.paths) touched.set(path, entry.status);
  const hit = files.filter((file) => touched.has(file));
  if (hit.length > 0) {
    fail(`这次收课之后 ${hit.join("、")} 又被改过，不能直接撤销；先处理那次改动（撤销或另行保存）再来撤销 ${slug}`);
  }
}

// ---- 暂存目录与 manifest ----

function loadManifest(staging) {
  const file = join(staging, "manifest.json");
  if (!existsSync(file)) fail(`不是收课暂存目录（缺 manifest.json）：${staging}`);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`manifest.json 无法解析：${error instanceof Error ? error.message : error}`);
  }
}

function saveManifest(staging, manifest) {
  writeAtomic(join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** 暂存目录里的镜像文件（库内相对路径）；跳过 manifest、committed 与点开头文件。
 * 符号链接单独标出（不跟随、不读内容），由 planCheck 报 owner。 */
function walkStaged(staging) {
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      if (rel === "" && (entry.name === "manifest.json" || entry.name === "committed")) continue;
      const r = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        out.push({ path: r, symlink: true });
        continue;
      }
      if (entry.isDirectory()) walk(join(dir, entry.name), r);
      else out.push({ path: r, symlink: false });
    }
  };
  walk(staging, "");
  return out;
}

/** 暂存目录 → 工作区根（staging 固定在 <ws>/.close/<name>/）。 */
function workspaceOf(staging) {
  return dirname(dirname(staging));
}

// ---- 校验执行（IO 外壳，收集数据后调 planCheck） ----

function gatherCheck(staging) {
  const manifest = loadManifest(staging);
  const staged = walkStaged(staging).map((entry) => {
    if (entry.symlink) return { path: entry.path, sha: null, text: null, symlink: true };
    const buffer = readFileSync(join(staging, entry.path));
    return {
      path: entry.path,
      sha: hashBuffer(buffer),
      text: entry.path.endsWith(".md") ? buffer.toString("utf8") : null,
      symlink: false,
    };
  });
  const current = new Map();
  const wanted = new Set([...staged.map((item) => item.path), ...Object.keys(manifest.base)]);
  for (const rel of wanted) {
    const abs = join(manifest.vault, rel);
    if (!existsSync(abs)) continue;
    // 库里这个路径被目录等非普通文件占着，也算「已存在」，不能当新文件写过去。
    if (!statSync(abs).isFile()) {
      current.set(rel, { sha: null, text: null, kind: "other" });
      continue;
    }
    const buffer = readFileSync(abs);
    current.set(rel, { sha: hashBuffer(buffer), text: rel.endsWith(".md") ? buffer.toString("utf8") : null });
  }
  return { manifest, result: planCheck(manifest, staged, current) };
}

// ---- 上锁 ----

/** 上锁：课程页与 `wiki/courses/<slug>/**` 下所有文件 0444（含早先写的 records、截图），
 * `<slug>/` 及其子目录 0555。范围严格限于本课：`wiki/courses/` 本身不改 mode，
 * 别的课与概念页/卡片页/index/log 一律不动（保持 0644）。 */
function lockCourse(vault, slug, writtenPaths) {
  const slugDirRel = `wiki/courses/${slug}`;
  const page = join(vault, `${slugDirRel}.md`);
  if (existsSync(page) && statSync(page).isFile()) chmodSync(page, READONLY_FILE);
  for (const rel of writtenPaths) {
    const abs = join(vault, rel);
    if (!existsSync(abs) || !statSync(abs).isFile()) continue;
    if (rel === `${slugDirRel}.md`) continue; // 课程页已在上面锁定
    // 只有课程自己目录下的页上行锁；概念页/卡片页/index/log 保持 0644。
    chmodSync(abs, rel.startsWith(`${slugDirRel}/`) ? READONLY_FILE : WRITABLE_FILE);
  }
  const slugDir = join(vault, slugDirRel);
  if (existsSync(slugDir) && statSync(slugDir).isDirectory()) {
    for (const file of walkFiles(slugDir)) chmodSync(file, READONLY_FILE);
    for (const dir of walkDirs(slugDir)) chmodSync(dir, READONLY_DIR);
  }
}

// ---- 恢复：提交中断后由任何命令开头自动补完 ----

function journalPath(workspace) {
  return join(workspace, ".close", "journal.json");
}

function recoverInternal(workspace) {
  const file = journalPath(workspace);
  if (!existsSync(file)) return null;
  let journal;
  try {
    journal = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`收课提交日志损坏，无法自动补完：${file}（${error instanceof Error ? error.message : error}）`);
  }
  if (!journal || typeof journal.vault !== "string" || !Array.isArray(journal.files)) {
    fail(`收课提交日志缺少 vault / files，无法自动补完：${file}`);
  }
  for (const entry of journal.files) {
    // 已经 rename 到位的（tmp 不在了）跳过，不报错：recover 可重复跑。
    if (!existsSync(entry.tmp)) continue;
    const dst = join(journal.vault, entry.path);
    try {
      withWritable(nearestExistingDir(dirname(dst)), () => {
        mkdirSync(dirname(dst), { recursive: true });
        renameSync(entry.tmp, dst);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail(`补完上次收课失败（${entry.path}）：${message}\n提交日志仍在 ${file}，处理后重新运行 recover`);
    }
  }
  lockCourse(journal.vault, journal.slug, journal.files.map((entry) => entry.path));
  rmSync(file);
  if (existsSync(journal.staging)) writeFileSync(join(journal.staging, "committed"), "");
  const jjResult = jjCommit(
    journal.vault,
    `收课 ${journal.slug} ${localDate()}`,
    journal.files.map((entry) => entry.path),
  );
  process.stderr.write(`已补完上次中断的收课：${journal.slug}\n`);
  // 文件已经补完；jj 失败只报（设计：jj 失败不回滚，文件已原子落盘）。
  if (jjResult.startsWith("failed")) process.stderr.write(`course-close: jj ${jjResult}\n`);
  return journal.slug;
}

// ---- 命令 ----

function localDate() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function localMonth() {
  return localDate().slice(0, 7);
}

/** 正则里的字面量转义（slug 可能带 . ( ) 等字符）。 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 同一秒内连跑两次 stage 时名字会撞：加 -2、-3 后缀，绝不复用已有目录。 */
function uniqueStagingDir(closeDir, name) {
  let candidate = join(closeDir, name);
  for (let i = 2; existsSync(candidate); i += 1) candidate = join(closeDir, `${name}-${i}`);
  return candidate;
}

function stageInternal(vault, slug, workspace) {
  recoverInternal(workspace);
  const courseRel = `wiki/courses/${slug}.md`;
  const courseAbs = join(vault, courseRel);
  if (!existsSync(courseAbs)) fail(`没有这门课：${courseRel}`);
  const closeDir = join(workspace, ".close");
  if (existsSync(closeDir)) {
    // 只认本课自己的暂存名：<slug>-YYYYMMDD-HHMMSS[-n]；slug 前缀相同的别门课不算。
    const own = new RegExp(`^${escapeRegExp(slug)}-\\d{8}-\\d{6}(-\\d+)?$`);
    for (const name of readdirSync(closeDir)) {
      const dir = join(closeDir, name);
      if (!own.test(name) || !statSync(dir).isDirectory()) continue;
      if (!existsSync(join(dir, "committed"))) {
        fail(`这门课已有未提交的暂存：${dir}\n先 commit 或 abort 再重新 stage`);
      }
    }
  }
  const staging = uniqueStagingDir(closeDir, stagingName(slug, new Date()));
  mkdirSync(staging, { recursive: true });
  const subject = subjectOf(readFileSync(courseAbs, "utf8"));
  const rels = [courseRel, "wiki/index.md", "wiki/log.md", `wiki/courses/${slug}/records/${localMonth()}.md`];
  const base = {};
  try {
    for (const rel of rels) {
      const src = join(vault, rel);
      if (!existsSync(src)) {
        // 当月 records 可以还没有；index.md 与 log.md 是收课必写的清单页。
        if (rel.startsWith(`wiki/courses/${slug}/records/`)) continue;
        throw new Error(`库里缺少 ${rel}`);
      }
      cloneInto(src, join(staging, rel));
      chmodSync(join(staging, rel), WRITABLE_FILE);
      base[rel] = sha256(src);
    }
    saveManifest(staging, {
      version: 1,
      vault,
      slug,
      subject,
      createdAt: new Date().toISOString(),
      base,
    });
  } catch (error) {
    // stage 半途失败不能留个没有 manifest 的目录：下次 stage 会把它当成未提交暂存而堵住。
    try {
      rmSync(staging, { recursive: true, force: true });
    } catch {
      /* 删不掉就留着，人能看到 */
    }
    fail(error instanceof Error ? error.message : String(error));
  }
  return staging;
}

function cmdStage(vaultArg, slug, workspaceArg, json) {
  const vault = resolve(vaultArg ?? fail("stage 需要 <vault>"));
  const workspace = resolve(workspaceArg ?? fail("stage 需要 --workspace <工作区>"));
  const staging = stageInternal(vault, slug, workspace);
  process.stdout.write(json ? `${JSON.stringify({ staging })}\n` : `${staging}\n`);
}

function cmdAdd(stagingArg, rel, json) {
  const staging = resolve(stagingArg ?? fail("add 需要 <暂存目录>"));
  if (!rel) fail("add 需要 <库内相对路径>");
  recoverInternal(workspaceOf(staging));
  const manifest = loadManifest(staging);
  if (!isOwned(rel, manifest.slug, manifest.subject)) fail(`这个路径不属于本课：${rel}`);
  const src = join(manifest.vault, rel);
  if (!existsSync(src) || !statSync(src).isFile()) fail(`库里没有这个文件：${rel}`);
  if (Object.prototype.hasOwnProperty.call(manifest.base, rel)) fail(`已在暂存清单里：${rel}`);
  cloneInto(src, join(staging, rel));
  chmodSync(join(staging, rel), WRITABLE_FILE);
  manifest.base[rel] = sha256(src);
  saveManifest(staging, manifest);
  process.stdout.write(json ? `${JSON.stringify({ added: rel })}\n` : `已暂存 ${rel}\n`);
}

function cmdCheck(stagingArg, json) {
  const staging = resolve(stagingArg ?? fail("check 需要 <暂存目录>"));
  recoverInternal(workspaceOf(staging));
  const { result } = gatherCheck(staging);
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    for (const problem of result.problems) {
      process.stdout.write(`${problem.path}: [${problem.kind}] ${problem.detail}\n`);
    }
    for (const change of result.changes) {
      process.stdout.write(`${change.action === "create" ? "新增" : "修改"} ${change.path}\n`);
    }
    process.stdout.write(result.ok ? `check: 通过，${result.changes.length} 个文件待提交\n` : "check: 未通过\n");
  }
  if (!result.ok) process.exit(1);
}

function commitInternal(staging, label) {
  recoverInternal(workspaceOf(staging));
  const { manifest, result } = gatherCheck(staging);
  if (!result.ok) {
    const lines = result.problems.map((p) => `  ${p.path}: [${p.kind}] ${p.detail}`).join("\n");
    fail(`校验未通过（什么都不写）：\n${lines}`);
  }
  const vault = manifest.vault;
  const journal = { staging, vault, slug: manifest.slug, files: [], startedAt: new Date().toISOString() };
  let journalWritten = false;
  try {
    // 1. 新内容先全部写成库内同目录的临时文件并 fsync。
    for (const change of result.changes) {
      const dst = join(vault, change.path);
      const tmp = join(dirname(dst), `.${basename(dst)}.close-tmp-${process.pid}`);
      const data = readFileSync(join(staging, change.path));
      // 先记进 journal，写失败时那条的临时文件也要被 catch 里的清理覆盖到。
      journal.files.push({ path: change.path, tmp });
      try {
        withWritable(nearestExistingDir(dirname(dst)), () => {
          mkdirSync(dirname(dst), { recursive: true });
          const fd = openSync(tmp, "w");
          try {
            writeFileSync(fd, data);
            fsyncSync(fd);
          } finally {
            closeSync(fd);
          }
        });
      } catch (error) {
        // 临时文件可能已经建出来（写了一半），立刻删掉，别在库里留垃圾。
        try {
          unlinkSync(tmp);
        } catch {
          /* 没建出来就算了 */
        }
        throw error;
      }
    }
    // 2. 提交日志落盘；之后的崩溃由 recover 补完 rename。
    writeAtomic(journalPath(workspaceOf(staging)), `${JSON.stringify(journal, null, 2)}\n`);
    journalWritten = true;
    // 3. 逐个 rename 到位。
    for (const entry of journal.files) {
      const dst = join(vault, entry.path);
      withWritable(nearestExistingDir(dirname(dst)), () => renameSync(entry.tmp, dst));
    }
    // 4. 上锁。
    lockCourse(vault, manifest.slug, journal.files.map((entry) => entry.path));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (journalWritten) {
      fail(`提交中断（${message}），下次运行任何 course-close 命令会自动补完`);
    }
    for (const entry of journal.files) {
      try {
        unlinkSync(entry.tmp);
      } catch {
        /* 临时文件清不掉不遮主错 */
      }
    }
    fail(`提交失败（journal 未写，临时文件已清理）：${message}`);
  }
  // 5. 删 journal、标 committed、jj 提交（失败不回滚，文件已原子落盘）。
  rmSync(journalPath(workspaceOf(staging)));
  writeFileSync(join(staging, "committed"), "");
  const jjResult = jjCommit(
    vault,
    `${label} ${manifest.slug} ${localDate()}`,
    result.changes.map((change) => change.path),
  );
  const out = { committed: true, changes: result.changes, jj: jjResult };
  return out;
}

function cmdCommit(stagingArg, label, json) {
  const staging = resolve(stagingArg ?? fail("commit 需要 <暂存目录>"));
  const out = commitInternal(staging, label);
  if (json) {
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  } else {
    for (const change of out.changes) {
      process.stdout.write(`${change.action === "create" ? "新增" : "修改"} ${change.path}\n`);
    }
    process.stdout.write(`已提交（jj: ${out.jj}）\n`);
  }
}

/** commit 的 --label：只允许「收课」（默认）与「存档点」；别的值直接拒绝，什么都不写。 */
const COMMIT_LABELS = ["收课", "存档点"];

function commitLabel(raw) {
  if (raw === undefined) return "收课";
  if (!COMMIT_LABELS.includes(raw)) fail("--label 只能是 收课 或 存档点");
  return raw;
}

function cmdAbort(stagingArg) {
  const staging = resolve(stagingArg ?? fail("abort 需要 <暂存目录>"));
  recoverInternal(workspaceOf(staging));
  if (!existsSync(staging)) fail(`暂存目录不存在：${staging}`);
  if (existsSync(join(staging, "committed"))) fail(`这次收课已提交，不能 abort（要回退用 undo）`);
  rmSync(staging, { recursive: true });
  process.stdout.write(`已删除暂存目录：${staging}\n`);
}

function cmdUndo(vaultArg, slug, workspaceArg, json) {
  const vault = resolve(vaultArg ?? fail("undo 需要 <vault>"));
  const workspace = resolve(workspaceArg ?? fail("undo 需要 --workspace <工作区>"));
  recoverInternal(workspace);
  if (!isJjRepo(vault)) fail("撤销需要库在 jj 下");
  if (!slug) fail("undo 需要 <slug>");
  // 取当前历史里所有「收课 …」提交，再用精确正则挑本课的最近一条：
  // 只用 glob 会把 slug 前缀相同的另一门课（epp 与 epp-advanced）当成自己。
  let listed;
  try {
    listed = jj(
      [
        "log",
        "-r",
        'description(glob:"收课 *") & ::@',
        "--no-graph",
        "-T",
        'json(description) ++ "\\t" ++ commit_id ++ "\\n"',
      ],
      vault,
    );
  } catch (error) {
    fail(`jj log 失败：${error instanceof Error ? error.message : error}`);
  }
  const own = new RegExp(`^收课 ${escapeRegExp(slug)} (\\d{4}-\\d{2}-\\d{2})\\s*$`);
  let id = null;
  let originalDate = null;
  for (const line of listed.split("\n")) {
    if (line.trim() === "") continue;
    const [descriptionJson, commitId] = line.split("\t");
    if (commitId === undefined) continue;
    let description;
    try {
      description = JSON.parse(descriptionJson);
    } catch {
      continue;
    }
    const match = own.exec(description);
    if (!match) continue;
    id = commitId.trim();
    originalDate = match[1];
    break;
  }
  if (!id) fail(`没有找到这门课的收课提交：${slug}`);
  let entries;
  try {
    entries = diffEntries(vault, id);
  } catch (error) {
    fail(`jj diff 失败：${error instanceof Error ? error.message : error}`);
  }
  // 那次收课新建的页面（状态 A）留着不动：Anki 里的卡不删，库与 Anki 要对得上，
  // 删不删由用户决定。其余（修改、删除、改名涉及的路径）恢复到提交前。
  const keptNew = [...new Set(entries.filter((entry) => entry.status === "A").flatMap((entry) => entry.paths))];
  const restoreFiles = [
    ...new Set(entries.filter((entry) => entry.status !== "A").flatMap((entry) => entry.paths)),
  ];
  const newCards = keptNew.filter((path) => path.split("/").includes("flashcards"));
  // 收课之后同一批文件又被改过（提交或工作副本）就不能直接撤回，否则会盖掉那次改动。
  // 新建的页也要查：它们之后被改过同样拦下来（保持原行为）。
  guardLaterChanges(vault, slug, id, [...new Set([...keptNew, ...restoreFiles])]);
  // 放开可能上了只读锁的课程目录与文件，记下原权限事后恢复。
  const restored = new Map();
  const open = (abs, bits) => {
    const mode = statSync(abs).mode & 0o777;
    if (mode & 0o200) return;
    if (!restored.has(abs)) restored.set(abs, mode);
    chmodSync(abs, mode | bits);
  };
  for (const rel of restoreFiles) {
    const abs = join(vault, rel);
    let dir = dirname(abs);
    // 只放开库内的祖先目录（用 relative 判断，避免 /vault2 被 startsWith("/vault") 误当成库内）。
    while (existsSync(dir) && dir !== vault) {
      const up = relative(vault, dir);
      if (up === "" || up.startsWith("..") || posix.isAbsolute(up)) break;
      open(dir, 0o700);
      dir = dirname(dir);
    }
    if (existsSync(abs) && statSync(abs).isFile()) open(abs, 0o200);
  }
  // 只新建过文件时没有可恢复的东西：不调 jj restore、不提交，直接输出。
  let jjResult = "skipped";
  if (restoreFiles.length > 0) {
    try {
      // 一次调用传全部路径：中间某个失败时不会已经撤了一半。
      jj(["restore", "--from", `${id}-`, "--to", "@", "--", ...restoreFiles.map(filesetLiteral)], vault);
    } catch (error) {
      for (const [dir, mode] of restored) {
        try {
          chmodSync(dir, mode);
        } catch {
          /* 恢复失败不遮主错 */
        }
      }
      fail(`jj restore 失败：${error instanceof Error ? error.message : error}`);
    }
    for (const [dir, mode] of restored) {
      try {
        chmodSync(dir, mode);
      } catch {
        /* 同上 */
      }
    }
    lockCourse(vault, slug, restoreFiles);
    jjResult = jjCommit(vault, `撤销收课 ${slug} ${originalDate}`, restoreFiles);
  }
  const out = { undone: id, restoreFiles, keptNew, newCards, jj: jjResult };
  if (json) {
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  } else {
    process.stdout.write(`已撤销收课提交 ${id}，恢复 ${restoreFiles.length} 个文件\n`);
    for (const path of keptNew) {
      process.stdout.write(`这次收课新建的页面（保留，可询问后删除）：${path}\n`);
    }
  }
}

function cmdRecover(vaultArg, workspaceArg, json) {
  resolve(vaultArg ?? fail("recover 需要 <vault>"));
  const workspace = resolve(workspaceArg ?? fail("recover 需要 --workspace <工作区>"));
  const recovered = recoverInternal(workspace);
  if (json) process.stdout.write(`${JSON.stringify({ recovered })}\n`);
  else if (!recovered) process.stdout.write("没有中断的收课\n");
}

/** 在暂存副本上顺延排期（算法同 course-schedule.mjs shift）：不碰库，改动写回暂存里的课程页。 */
function shiftStaged(staging, today, endFlag) {
  const manifest = loadManifest(staging);
  const rel = `wiki/courses/${manifest.slug}.md`;
  const file = join(staging, rel);
  const text = readFileSync(file, "utf8");
  const schedule = readSchedule(text);
  if (schedule === null) return null;
  const end = endFlag ?? schedule.end;
  const done = completedIds(text);
  const { rows, shiftedDays, movedReviews, dropped } = shiftSchedule(
    schedule.rows,
    done,
    today,
    schedule.rest,
    schedule.days,
    end,
  );
  const changed = shiftedDays > 0 || movedReviews > 0 || dropped.length > 0;
  const lastLesson = lastNewLessonDate(rows);
  const deferred =
    dropped.length === 0
      ? ""
      : `${dropped.length} 节排不进本周期，已移到「留到下个周期」：${dropped.map((row) => row.id).join("、")}`;
  if (changed) {
    writeFileSync(
      file,
      writeSchedule(text, renderTable(rows, schedule.rest, schedule.days, schedule.reviews, end), dropped),
    );
  }
  return { changed, shiftedDays, movedReviews, lastLesson, end: end ?? null, dropped, deferred };
}

function cmdShift(vaultArg, slug, workspaceArg, todayArg, endArg, json) {
  const vault = resolve(vaultArg ?? fail("shift 需要 <vault>"));
  const workspace = resolve(workspaceArg ?? fail("shift 需要 --workspace <工作区>"));
  if (!slug) fail("shift 需要 <slug>");
  const today = todayArg ?? localDate();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (todayArg && !dateRe.test(todayArg)) fail("--today 要写成 YYYY-MM-DD");
  if (endArg && !dateRe.test(endArg)) fail("--end 要写成 YYYY-MM-DD");
  const staging = stageInternal(vault, slug, workspace);
  let shifted;
  try {
    shifted = shiftStaged(staging, today, endArg ?? null);
  } catch (error) {
    // 顺延本身抛错（排期标记坏了等）也不能留未提交暂存：它会挡住当天收课的 stage。
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  if (shifted === null || !shifted.changed) {
    // 没有要顺延的：删掉暂存、什么都不提交，免得挡住当天收课的 stage。
    rmSync(staging, { recursive: true, force: true });
    if (json) process.stdout.write(`${JSON.stringify({ shifted: false })}\n`);
    else if (shifted === null) process.stdout.write("这门课没有排期表，不用顺延\n");
    else process.stdout.write("没有需要顺延的安排\n");
    return;
  }
  const { result } = gatherCheck(staging);
  if (!result.ok) {
    const lines = result.problems.map((p) => `  ${p.path}: [${p.kind}] ${p.detail}`).join("\n");
    // 校验不过也不能留未提交暂存：它会挡住当天收课的 stage。
    rmSync(staging, { recursive: true, force: true });
    fail(`校验未通过（什么都不写）：\n${lines}`);
  }
  const out = commitInternal(staging, "顺延");
  const { shiftedDays, movedReviews, lastLesson, end, dropped, deferred } = shifted;
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ ...out, shiftedDays, movedReviews, lastLesson, end, dropped, deferred }, null, 2)}\n`,
    );
  } else {
    process.stdout.write(
      `没学的新课顺延 ${shiftedDays} 个上课日（最后一节 ${lastLesson}），${movedReviews} 条过期复习挪到今天` +
        `${deferred ? `；${deferred}` : ""}（已提交，jj: ${out.jj}）\n`,
    );
  }
}

// ---- CLI ----

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
      flags[key] = argv[i + 1];
      i += 1;
    }
  }
  return { positional, flags };
}

function usage() {
  return [
    "收课事务（course-close）：暂存目录 → 校验 → 原子提交进库",
    "",
    "用法：",
    "  node course-close.mjs stage   <vault> <slug> --workspace <工作区> [--json]",
    "  node course-close.mjs add     <暂存目录> <库内相对路径> [--json]",
    "  node course-close.mjs check   <暂存目录> [--json]",
    "  node course-close.mjs commit  <暂存目录> [--label 收课|存档点] [--json]",
    "  node course-close.mjs abort   <暂存目录>",
    "  node course-close.mjs shift   <vault> <slug> --workspace <工作区> [--today YYYY-MM-DD] [--end YYYY-MM-DD] [--json]",
    "  node course-close.mjs undo    <vault> <slug> --workspace <工作区> [--json]",
    "  node course-close.mjs recover <vault> --workspace <工作区> [--json]",
  ].join("\n");
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [command, ...rest] = positional;
  if (flags.help || !command) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const json = Boolean(flags.json);
  if (command === "stage") cmdStage(rest[0], rest[1], flags.workspace, json);
  else if (command === "add") cmdAdd(rest[0], rest[1], json);
  else if (command === "check") cmdCheck(rest[0], json);
  else if (command === "commit") cmdCommit(rest[0], commitLabel(flags.label), json);
  else if (command === "abort") cmdAbort(rest[0]);
  else if (command === "shift") cmdShift(rest[0], rest[1], flags.workspace, flags.today, flags.end, json);
  else if (command === "undo") cmdUndo(rest[0], rest[1], flags.workspace, json);
  else if (command === "recover") cmdRecover(rest[0], flags.workspace, json);
  else fail(`未知命令：${command}\n${usage()}`);
}

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
