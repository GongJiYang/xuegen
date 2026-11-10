#!/usr/bin/env node
// Xuegen 收课/计划事务：在库外暂存目录里改课程页等文件，校验通过后一次性提交进库。
// 两个入口走同一台事务机：课程会话的 course_close（kind=close，收课）与总控的
// course_plan（kind=plan，建课/改计划）。无第三方依赖。设计见 docs/platform/STAGE3-DESIGN.md
// 与 docs/platform/TIDY-1110.md §1。
//   node course-close.mjs stage   <vault> <slug> --workspace <工作区> [--kind plan] [--new --subject <科目id>] [--json]
//   node course-close.mjs add     <暂存目录> <库内相对路径> [--json]
//   node course-close.mjs check   <暂存目录> [--json]
//   node course-close.mjs commit  <暂存目录> [--label 收课|存档点] [--json]
//   node course-close.mjs abort   <暂存目录>
//   node course-close.mjs schedule <暂存目录> --lessons <课次清单> [--start --end --rest --days --extra --reviews] [--json]
//   node course-close.mjs shift   <vault> <slug> --workspace <工作区> [--today YYYY-MM-DD] [--end YYYY-MM-DD] [--json]
//   node course-close.mjs undo    <vault> <slug> --workspace <工作区> [--json]
//   node course-close.mjs recover <vault> --workspace <工作区> [--json]
//   node course-close.mjs snapshot <暂存目录> <报告相对路径> <PNG相对路径> [--json]
//
// 落盘可靠性：写临时文件后 fsync 再 rename。Node 的 fsync/FileHandle.sync() 在 macOS 上
// 由 libuv uv__fs_fsync（src/unix/fs.c）实现：__APPLE__ 分支先 fcntl(F_FULLFSYNC)，
// 不支持时退回 F_BARRIERFSYNC、再退回 fsync()，因此 sync 即「刷到持久存储」。
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fail } from "./close/fail.mjs";
import { isOwned, isSafeRelPath } from "./close/rules.mjs";
import { BOARD_RELS, refreshBoard } from "./close/board.mjs";
import {
  diffEntries,
  filesetLiteral,
  guardLaterChanges,
  isJjRepo,
  jj,
  jjCommit,
} from "./close/jj.mjs";
import {
  cloneInto,
  localDate,
  lockCourse,
  recoverInternal,
  sha256,
  WRITABLE_FILE,
} from "./close/durable.mjs";
import {
  commitInternal,
  escapeRegExp,
  gatherCheck,
  loadManifest,
  saveManifest,
  stageInternal,
  shiftStaged,
  workspaceOf,
} from "./close/staging.mjs";

// 转出给现有测试（import 路径不变，实现已搬入 close/ 各模块）。
export {
  checkAppendOnly,
  checkConceptPage,
  checkCoursePage,
  checkNoDeletedLines,
  isOwned,
  isSafeRelPath,
  ownedPrefixes,
  planCheck,
  stagingName,
  subjectOf,
} from "./close/rules.mjs";
export { withWritable } from "./close/durable.mjs";
export { parseDiffEntries } from "./close/jj.mjs";

// ---- 命令 ----

function cmdStage(vaultArg, slug, flags, json) {
  const vault = resolve(vaultArg ?? fail("stage 需要 <vault>"));
  const workspace = resolve(flags.workspace ?? fail("stage 需要 --workspace <工作区>"));
  if (!slug) fail("stage 需要 <slug>");
  const staging = stageInternal(vault, slug, workspace, {
    kind: flags.kind ?? "close",
    isNew: flags.new === true,
    subject: flags.subject ?? null,
  });
  process.stdout.write(json ? `${JSON.stringify({ staging })}\n` : `${staging}\n`);
}

function cmdAdd(stagingArg, rel, json) {
  const staging = resolve(stagingArg ?? fail("add 需要 <暂存目录>"));
  if (!rel) fail("add 需要 <库内相对路径>");
  recoverInternal(workspaceOf(staging));
  const manifest = loadManifest(staging);
  if (!isOwned(rel, manifest.slug, manifest.subject, manifest.kind ?? "close")) fail(`这个路径不属于本课：${rel}`);
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

function cmdCommit(stagingArg, rawLabel, json) {
  const staging = resolve(stagingArg ?? fail("commit 需要 <暂存目录>"));
  recoverInternal(workspaceOf(staging));
  const manifest = loadManifest(staging);
  // 提交名按暂存种类分：计划暂存一律记「计划」，--label 不给也不许改。
  const kind = manifest.kind ?? "close";
  if (kind === "plan" && rawLabel !== undefined) fail("计划暂存的提交一律记「计划」，不接受 --label");
  const label = kind === "plan" ? "计划" : commitLabel(rawLabel);
  const out = commitInternal(staging, label);
  if (json) {
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  } else {
    for (const change of out.changes) {
      process.stdout.write(`${change.action === "create" ? "新增" : "修改"} ${change.path}\n`);
    }
    process.stdout.write(`已提交（jj: ${out.jj}）\n`);
    if (out.board !== "ok") process.stdout.write(`看板未刷新：${out.board}\n`);
  }
}

/** commit 的 --label（收课暂存）：只允许「收课」（默认）与「存档点」；别的值直接拒绝，什么都不写。 */
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
  // 看板文件不算「改过的文件」（BOARD_RELS，见上方注释）。
  const contentEntries = entries
    .map((entry) => ({ status: entry.status, paths: entry.paths.filter((path) => !BOARD_RELS.has(path)) }))
    .filter((entry) => entry.paths.length > 0);
  const keptNew = [
    ...new Set(contentEntries.filter((entry) => entry.status === "A").flatMap((entry) => entry.paths)),
  ];
  const restoreFiles = [
    ...new Set(contentEntries.filter((entry) => entry.status !== "A").flatMap((entry) => entry.paths)),
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
  let board = null;
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
    board = refreshBoard(vault);
    jjResult = jjCommit(vault, `撤销收课 ${slug} ${originalDate}`, [...restoreFiles, ...board.paths]);
  }
  const out = {
    undone: id,
    restoreFiles,
    keptNew,
    newCards,
    jj: jjResult,
    board: board === null ? "skipped" : board.ok ? "ok" : board.error,
  };
  if (json) {
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  } else {
    process.stdout.write(`已撤销收课提交 ${id}，恢复 ${restoreFiles.length} 个文件\n`);
    for (const path of keptNew) {
      process.stdout.write(`这次收课新建的页面（保留，可询问后删除）：${path}\n`);
    }
    if (out.board !== "ok" && out.board !== "skipped") process.stdout.write(`看板未刷新：${out.board}\n`);
  }
}

/** 截图渲染（render-snapshot.mjs）。在沙盒外跑：bash 里起不了 Chrome。 */
const SNAPSHOT_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "render-snapshot.mjs");

/** 逐日排期（course-schedule.mjs）。schedule 命令在暂存副本上跑它的 plan --write。 */
const SCHEDULE_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "course-schedule.mjs");

/** 从 course-schedule 的 stderr 取一行可读原因（去掉 `course-schedule:` 前缀）。 */
function scheduleReason(error) {
  const stderr = error && error.stderr ? String(error.stderr) : "";
  const lines = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const line = lines.find((text) => /course-schedule:/.test(text)) ?? lines[0];
  if (line) return line.replace(/^course-schedule:\s*/, "");
  return error instanceof Error ? error.message : String(error);
}

/**
 * 计划暂存的排期：只允许 kind: plan 的暂存；在暂存里的课程页副本上跑
 * `course-schedule.mjs plan … --write`（沙盒外 Node 子进程）。--lessons 给相对
 * 路径时按暂存目录解析；脚本报错（课次多于上课日等）原样返回，暂存不动。
 */
function cmdSchedule(stagingArg, flags, json) {
  const staging = resolve(stagingArg ?? fail("schedule 需要 <暂存目录>"));
  recoverInternal(workspaceOf(staging));
  const manifest = loadManifest(staging);
  if ((manifest.kind ?? "close") !== "plan") fail("schedule 只能用在计划暂存（stage --kind plan）；收课顺延用 shift");
  if (existsSync(join(staging, "committed"))) fail("这次计划已提交，不能再排期（要改请重新 stage）");
  if (flags.lessons === undefined) fail("schedule 需要 --lessons <课次清单 JSON 文件>");
  const courseRel = `wiki/courses/${manifest.slug}.md`;
  const courseAbs = join(staging, courseRel);
  if (!existsSync(courseAbs) || !lstatSync(courseAbs).isFile()) fail(`暂存里没有课程页（先写好再排期）：${courseRel}`);
  const args = [SCHEDULE_SCRIPT, "plan", courseAbs, "--lessons", resolve(staging, flags.lessons)];
  for (const [flag, value] of [
    ["--start", flags.start],
    ["--end", flags.end],
    ["--rest", flags.rest],
    ["--days", flags.days],
    ["--extra", flags.extra],
    ["--reviews", flags.reviews],
  ]) {
    if (value !== undefined) args.push(flag, value);
  }
  args.push("--write");
  try {
    execFileSync(process.execPath, args, {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000,
    });
  } catch (error) {
    fail(`排期失败：${scheduleReason(error)}`);
  }
  process.stdout.write(json ? `${JSON.stringify({ scheduled: courseRel })}\n` : `已把排期写进暂存课程页：${courseRel}\n`);
}

/** 从 render-snapshot 的 stderr 取一行可读原因（去掉它自己的 `Snapshot failed:` 前缀）。 */
function snapshotReason(error) {
  const stderr = error && error.stderr ? String(error.stderr) : "";
  const lines = stderr.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  const line = lines.find((text) => /Snapshot failed:/.test(text)) ?? lines[0];
  if (line) return line.replace(/^Snapshot failed:\s*/, "");
  return error instanceof Error ? error.message : String(error);
}

/**
 * 在暂存目录里生成收课截图：report 与 png 都是暂存内相对路径。png 必须是本课
 * snapshots/ 下的 .png；渲染失败时撤掉本次新建的目录，暂存里不留半张图。
 * 输出 { snapshot: png 相对路径 }。截图随后照常 check/commit。
 */
function cmdSnapshot(stagingArg, reportRel, pngRel, json) {
  const staging = resolve(stagingArg ?? fail("snapshot 需要 <暂存目录>"));
  recoverInternal(workspaceOf(staging));
  const manifest = loadManifest(staging);
  if (existsSync(join(staging, "committed"))) fail("这次收课已提交，不能再生成截图（要改请重新 stage）");
  if (!isSafeRelPath(reportRel)) fail(`报告路径不安全（只能是暂存目录内的相对路径）：${reportRel}`);
  if (!isSafeRelPath(pngRel)) fail(`截图路径不安全（只能是暂存目录内的相对路径）：${pngRel}`);
  if (!pngRel.endsWith(".png")) fail(`截图必须以 .png 结尾：${pngRel}`);
  const snapshotsPrefix = `wiki/courses/${manifest.slug}/snapshots/`;
  if (!isOwned(pngRel, manifest.slug, manifest.subject, manifest.kind ?? "close")) fail(`截图不属于本课：${pngRel}`);
  if (!pngRel.startsWith(snapshotsPrefix)) fail(`截图必须放在 ${snapshotsPrefix} 下：${pngRel}`);
  const reportAbs = join(staging, reportRel);
  // lstat：报告必须是暂存里的普通文件，符号链接不跟随。
  if (!existsSync(reportAbs) || !lstatSync(reportAbs).isFile()) fail(`报告文件不存在或不是普通文件：${reportRel}`);
  if (existsSync(join(manifest.vault, pngRel))) fail(`库里已有这张截图，不覆盖：${pngRel}`);
  const pngAbs = join(staging, pngRel);
  if (existsSync(pngAbs)) fail(`暂存里已有这张截图，不覆盖：${pngRel}`);
  // 截图路径经过暂存里的符号链接会写到目录外，拒绝。
  let cursor = staging;
  for (const part of pngRel.split("/")) {
    cursor = join(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
      fail(`暂存目录里的路径经过符号链接，拒绝写入：${pngRel}`);
    }
  }
  // 本次新建的最上层目录，失败时整棵撤掉。
  let createdTop = null;
  let dir = dirname(pngAbs);
  while (!existsSync(dir)) {
    createdTop = dir;
    dir = dirname(dir);
  }
  const rollback = () => {
    try {
      if (existsSync(pngAbs)) rmSync(pngAbs, { force: true });
      if (createdTop !== null) rmSync(createdTop, { recursive: true, force: true });
    } catch {
      /* 删不掉不遮主错 */
    }
  };
  try {
    mkdirSync(dirname(pngAbs), { recursive: true });
    execFileSync(process.execPath, [SNAPSHOT_SCRIPT, pngAbs], {
      input: readFileSync(reportAbs),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000,
    });
  } catch (error) {
    rollback();
    fail(`截图失败：${snapshotReason(error)}`);
  }
  if (!existsSync(pngAbs)) {
    rollback();
    fail("截图失败：渲染没有产出 PNG 文件");
  }
  process.stdout.write(json ? `${JSON.stringify({ snapshot: pngRel })}\n` : `已生成截图 ${pngRel}\n`);
}

function cmdRecover(vaultArg, workspaceArg, json) {
  resolve(vaultArg ?? fail("recover 需要 <vault>"));
  const workspace = resolve(workspaceArg ?? fail("recover 需要 --workspace <工作区>"));
  const recovered = recoverInternal(workspace);
  if (json) process.stdout.write(`${JSON.stringify({ recovered })}\n`);
  else if (!recovered) process.stdout.write("没有中断的收课\n");
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
    if (out.board !== "ok") process.stdout.write(`看板未刷新：${out.board}\n`);
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
    if (["json", "help", "new"].includes(key)) flags[key] = true;
    else {
      flags[key] = argv[i + 1];
      i += 1;
    }
  }
  return { positional, flags };
}

function usage() {
  return [
    "收课/计划事务（course-close）：暂存目录 → 校验 → 原子提交进库",
    "暂存分两种：close（默认，课程会话收课）与 plan（总控建课/改计划，commit 记「计划」）。",
    "",
    "用法：",
    "  node course-close.mjs stage   <vault> <slug> --workspace <工作区> [--kind plan] [--new --subject <科目id>] [--json]",
    "  node course-close.mjs add     <暂存目录> <库内相对路径> [--json]",
    "  node course-close.mjs check   <暂存目录> [--json]",
    "  node course-close.mjs commit  <暂存目录> [--label 收课|存档点] [--json]",
    "  node course-close.mjs abort   <暂存目录>",
    "  node course-close.mjs schedule <暂存目录> --lessons <课次清单> [--start --end --rest --days --extra --reviews] [--json]",
    "  node course-close.mjs shift   <vault> <slug> --workspace <工作区> [--today YYYY-MM-DD] [--end YYYY-MM-DD] [--json]",
    "  node course-close.mjs undo    <vault> <slug> --workspace <工作区> [--json]",
    "  node course-close.mjs recover <vault> --workspace <工作区> [--json]",
    "  node course-close.mjs snapshot <暂存目录> <报告相对路径> <PNG相对路径> [--json]",
    "",
    "  --kind plan：计划暂存。--new（只能配 --kind plan）开新建课程暂存：课程页必须不存在，",
    "  暂存里不放课程页，只复制 index/log/科目页。schedule 只在计划暂存上跑，把排期写进暂存课程页。",
    "  plan 暂存的 commit 一律记「计划 <slug> <日期>」，不接受 --label；undo 仍只认「收课」。",
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
  if (command === "stage") cmdStage(rest[0], rest[1], flags, json);
  else if (command === "add") cmdAdd(rest[0], rest[1], json);
  else if (command === "check") cmdCheck(rest[0], json);
  else if (command === "commit") cmdCommit(rest[0], flags.label, json);
  else if (command === "abort") cmdAbort(rest[0]);
  else if (command === "schedule") cmdSchedule(rest[0], flags, json);
  else if (command === "shift") cmdShift(rest[0], rest[1], flags.workspace, flags.today, flags.end, json);
  else if (command === "undo") cmdUndo(rest[0], rest[1], flags.workspace, json);
  else if (command === "recover") cmdRecover(rest[0], flags.workspace, json);
  else if (command === "snapshot") cmdSnapshot(rest[0], rest[1], rest[2], json);
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
