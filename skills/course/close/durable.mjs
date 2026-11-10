// 磁盘持久化：sha256、写时复制、原子写、临时放开只读锁、课程页上锁、提交日志与崩溃补完。
// 独占的知识：文件怎么安全落盘（tmp+fsync+rename）、只读锁的精确范围、journal 怎么补完中断的提交。
// 对外接口：hashBuffer、sha256、cloneInto、writeAtomic、withWritable、nearestExistingDir、
// lockCourse、journalPath、recoverInternal、localDate、WRITABLE_FILE。
// 调用方：staging.mjs（stage/commit/gather）、course-close.mjs（cmdAdd/cmdUndo/cmdRecover 与测试转出）。
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
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fail } from "./fail.mjs";
import { jjCommit } from "./jj.mjs";
import { refreshBoard } from "./board.mjs";

const READONLY_FILE = 0o444;
export const WRITABLE_FILE = 0o644;
const READONLY_DIR = 0o555;

// ---- IO：sha、写时复制、原子写、临时放开只读锁 ----

export function hashBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function sha256(file) {
  return hashBuffer(readFileSync(file));
}

/** 写时复制进暂存；跨卷或不支持退回普通复制。目标父目录先建好。 */
export function cloneInto(src, dst) {
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
export function writeAtomic(file, data, mode) {
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
export function nearestExistingDir(path) {
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

// ---- 上锁 ----

/** 上锁：课程页与 `wiki/courses/<slug>/**` 下所有文件 0444（含早先写的 records、截图），
 * `<slug>/` 及其子目录 0555。范围严格限于本课：`wiki/courses/` 本身不改 mode，
 * 别的课与概念页/卡片页/index/log 一律不动（保持 0644）。 */
export function lockCourse(vault, slug, writtenPaths) {
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

export function journalPath(workspace) {
  return join(workspace, ".close", "journal.json");
}

export function localDate() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function recoverInternal(workspace) {
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
  // 补完也把看板重画进同一次提交；看板失败只写 stderr，不影响补完。
  const board = refreshBoard(journal.vault);
  const jjResult = jjCommit(
    journal.vault,
    // journal.label 由 commitInternal 写入（计划暂存为「计划」）；旧 journal 没有它，照旧记「收课」。
    `${journal.label ?? "收课"} ${journal.slug} ${localDate()}`,
    [...journal.files.map((entry) => entry.path), ...board.paths],
  );
  process.stderr.write(`已补完上次中断的收课：${journal.slug}\n`);
  // 文件已经补完；jj 失败只报（设计：jj 失败不回滚，文件已原子落盘）。
  if (jjResult.startsWith("failed")) process.stderr.write(`course-close: jj ${jjResult}\n`);
  if (!board.ok) process.stderr.write(`course-close: ${board.error}\n`);
  return journal.slug;
}
