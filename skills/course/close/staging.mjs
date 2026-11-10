// 暂存目录：<工作区>/.close/<slug>-<时间戳>/ 的布局、manifest、镜像收集与提交编排。
// 独占的知识：暂存里有什么文件、基线怎么记、commit 按什么顺序把暂存镜像写进库。
// 暂存分两种（manifest.kind）："close" 收课暂存（默认，旧 manifest 没有 kind 一律算它）与
// "plan" 计划暂存（总控建课/改计划用；--new 时不复制课程页，归属只含课程页/科目页/index/log）。
// 对外接口：loadManifest、saveManifest、walkStaged、workspaceOf、gatherCheck、stageInternal、commitInternal、shiftStaged、escapeRegExp。
// 调用方：course-close.mjs 的 cmd* 命令层。
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  completedIds,
  lastNewLessonDate,
  readSchedule,
  renderTable,
  shiftSchedule,
  writeSchedule,
} from "../course-schedule.mjs";
import { fail } from "./fail.mjs";
import {
  cloneInto,
  hashBuffer,
  journalPath,
  localDate,
  lockCourse,
  nearestExistingDir,
  recoverInternal,
  sha256,
  withWritable,
  writeAtomic,
  WRITABLE_FILE,
} from "./durable.mjs";
import { planCheck, stagingName, subjectOf } from "./rules.mjs";
import { jjCommit } from "./jj.mjs";
import { refreshBoard } from "./board.mjs";

// ---- 暂存目录与 manifest ----

export function loadManifest(staging) {
  const file = join(staging, "manifest.json");
  if (!existsSync(file)) fail(`不是收课暂存目录（缺 manifest.json）：${staging}`);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`manifest.json 无法解析：${error instanceof Error ? error.message : error}`);
  }
}

export function saveManifest(staging, manifest) {
  writeAtomic(join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** 暂存目录里的镜像文件（库内相对路径）；跳过 manifest、committed 与点开头文件。
 * 符号链接单独标出（不跟随、不读内容），由 planCheck 报 owner。 */
export function walkStaged(staging) {
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
export function workspaceOf(staging) {
  return dirname(dirname(staging));
}

// ---- 校验执行（IO 外壳，收集数据后调 planCheck） ----

export function gatherCheck(staging) {
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

// ---- stage / commit / shift ----

function localMonth() {
  return localDate().slice(0, 7);
}

/** 正则里的字面量转义（slug 可能带 . ( ) 等字符）。 */
export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 同一秒内连跑两次 stage 时名字会撞：加 -2、-3 后缀，绝不复用已有目录。 */
function uniqueStagingDir(closeDir, name) {
  let candidate = join(closeDir, name);
  for (let i = 2; existsSync(candidate); i += 1) candidate = join(closeDir, `${name}-${i}`);
  return candidate;
}

/** slug 与科目 id 都会成为库内文件名，只能是 slug 形状。 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function stageInternal(vault, slug, workspace, { kind = "close", isNew = false, subject = null } = {}) {
  recoverInternal(workspace);
  if (kind !== "close" && kind !== "plan") fail(`--kind 只能是 close 或 plan：${kind}`);
  if (!SLUG_RE.test(slug)) fail(`slug 只能是小写字母、数字和连字符：${slug}`);
  if (isNew && kind !== "plan") fail("--new 只能和 --kind plan 一起用");
  if (!isNew && subject !== null) fail("--subject 只能和 --new 一起用");
  if (isNew && (subject === null || !SLUG_RE.test(subject))) {
    fail("--new 需要 --subject <科目id>（小写字母、数字和连字符）");
  }
  const courseRel = `wiki/courses/${slug}.md`;
  const courseAbs = join(vault, courseRel);
  if (isNew ? existsSync(courseAbs) : !existsSync(courseAbs)) {
    fail(isNew ? `这门课已存在：${courseRel}` : `没有这门课：${courseRel}`);
  }
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
  const courseSubject = isNew ? subject : subjectOf(readFileSync(courseAbs, "utf8"));
  const rels = isNew
    ? ["wiki/index.md", "wiki/log.md"]
    : [courseRel, "wiki/index.md", "wiki/log.md", `wiki/courses/${slug}/records/${localMonth()}.md`];
  // 计划暂存还带上科目页（总控可以改资料登记/讲解偏好），存在才复制。
  if (kind === "plan" && courseSubject !== null) rels.push(`wiki/subjects/${courseSubject}.md`);
  const base = {};
  try {
    for (const rel of rels) {
      const src = join(vault, rel);
      if (!existsSync(src)) {
        // 当月 records 与科目页可以还没有；index.md 与 log.md 是必写的清单页。
        if (rel.startsWith(`wiki/courses/${slug}/records/`) || rel.startsWith("wiki/subjects/")) continue;
        throw new Error(`库里缺少 ${rel}`);
      }
      cloneInto(src, join(staging, rel));
      chmodSync(join(staging, rel), WRITABLE_FILE);
      base[rel] = sha256(src);
    }
    saveManifest(staging, {
      version: 1,
      kind,
      vault,
      slug,
      subject: courseSubject,
      // 新建课程标记：check 要求暂存里必须有课程页（见 rules.planCheck）。
      ...(isNew ? { isNew: true } : {}),
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

export function commitInternal(staging, label) {
  recoverInternal(workspaceOf(staging));
  const { manifest, result } = gatherCheck(staging);
  if (!result.ok) {
    const lines = result.problems.map((p) => `  ${p.path}: [${p.kind}] ${p.detail}`).join("\n");
    fail(`校验未通过（什么都不写）：\n${lines}`);
  }
  const vault = manifest.vault;
  const journal = { staging, vault, slug: manifest.slug, label, files: [], startedAt: new Date().toISOString() };
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
  // 5. 删 journal、标 committed、重画看板、jj 提交（失败不回滚，文件已原子落盘；
  // 看板文件与本次改动一起进提交，重画失败只报告）。
  rmSync(journalPath(workspaceOf(staging)));
  writeFileSync(join(staging, "committed"), "");
  const board = refreshBoard(vault);
  const jjResult = jjCommit(
    vault,
    `${label} ${manifest.slug} ${localDate()}`,
    [...result.changes.map((change) => change.path), ...board.paths],
  );
  const out = { committed: true, changes: result.changes, jj: jjResult, board: board.ok ? "ok" : board.error };
  return out;
}

/** 在暂存副本上顺延排期（算法同 course-schedule.mjs shift）：不碰库，改动写回暂存里的课程页。 */
export function shiftStaged(staging, today, endFlag) {
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
