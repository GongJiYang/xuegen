#!/usr/bin/env node
// 撤销总控这一轮的计划改动：--since（ISO 时间）之后所有「计划 <slug> <日期>」与
// 「顺延 <slug> <日期>」jj 提交一起撤回——新建的页保留，其余文件恢复到最早那次
// 计划提交之前，再记一条「撤销计划 …」提交。与 cmdUndo（收课撤销）同一套规则：
// 只读锁先放后锁、看板重画、之后又被改过就拒绝。无第三方依赖。
//   node plan-undo.mjs list <库根> --since <ISO> [--json]
//   node plan-undo.mjs undo <库根> --since <ISO> --workspace <工作区> [--json]
import { resolve } from "node:path";
import { BOARD_RELS, refreshBoard } from "./close/board.mjs";
import { localDate, lockCourse, recoverInternal } from "./close/durable.mjs";
import { fail } from "./close/fail.mjs";
import { diffEntries, isJjRepo, jj, jjCommit } from "./close/jj.mjs";
import { restoreFiles as restoreFromRev } from "./close/restore.mjs";

// 「计划/顺延 <slug> <YYYY-MM-DD>」：glob 粗筛后再用精确正则，与 cmdUndo 同理。
const PLAN_DESC = /^(计划|顺延) (\S+) (\d{4}-\d{2}-\d{2})\s*$/;
// 描述（JSON 转义）、commit_id、提交时间（ISO 带时区，Date.parse 可解；
// jj 的提交时间只存到秒，比较时 since 也下取整到秒，否则同一秒内的提交会被漏掉）。
const LOG_TEMPLATE =
  'json(description) ++ "\\t" ++ commit_id ++ "\\t" ++ json(committer.timestamp()) ++ "\\n"';

/** --since（ISO，带时区）→ 毫秒（下取整到秒，对齐 jj 的秒精度）；解析不了就 fail。 */
function sinceMs(flags) {
  const raw = flags.since ?? fail("需要 --since <ISO 时间>");
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) fail(`--since 不是合法的 ISO 时间：${raw}`);
  return Math.floor(ms / 1000) * 1000;
}

/** 当前历史（::@）上时间 ≥ since 的「计划/顺延」提交，从旧到新。 */
function planCommits(vault, since) {
  let listed;
  try {
    listed = jj(
      [
        "log",
        "-r",
        '(description(glob:"计划 *") | description(glob:"顺延 *")) & ::@',
        "--no-graph",
        "-T",
        LOG_TEMPLATE,
      ],
      vault,
    );
  } catch (error) {
    fail(`jj log 失败：${error instanceof Error ? error.message : error}`);
  }
  const commits = [];
  for (const line of listed.split("\n")) {
    if (line.trim() === "") continue;
    const [descriptionJson, id, timeJson] = line.split("\t");
    if (id === undefined || timeJson === undefined) continue;
    let description;
    let time;
    try {
      description = JSON.parse(descriptionJson);
      time = Date.parse(JSON.parse(timeJson));
    } catch {
      continue;
    }
    const match = PLAN_DESC.exec(description);
    if (!match || Number.isNaN(time) || time < since) continue;
    commits.push({ id: id.trim(), kind: match[1], slug: match[2], date: match[3] });
  }
  // jj log 由新到旧，翻成由旧到新：commits[0] 是最早的一次。
  return commits.reverse();
}

/** 这轮提交动过的文件：首次出现是 A（新建）的进 keptNew，其余进 restoreFiles；
 * 看板（BOARD_RELS）两边都不算（同 cmdUndo）。 */
function collectPaths(vault, commits) {
  const keptNew = new Set();
  const restore = new Set();
  const seen = new Set();
  for (const commit of commits) {
    let entries;
    try {
      entries = diffEntries(vault, commit.id);
    } catch (error) {
      fail(`jj diff 失败：${error instanceof Error ? error.message : error}`);
    }
    for (const entry of entries) {
      for (const path of entry.paths) {
        if (BOARD_RELS.has(path) || seen.has(path)) continue;
        seen.add(path);
        (entry.status === "A" ? keptNew : restore).add(path);
      }
    }
  }
  return { keptNew: [...keptNew], restoreFiles: [...restore] };
}

/**
 * 安全闸：最早那轮提交之后（<最早>+::@，含工作副本 @）凡不在本轮集合里的提交
 * 改过 watched 里的路径，就不能直接撤回，否则会盖掉那次改动（含上一轮「撤销计划」）。
 */
function guardLaterCommits(vault, earliest, batchIds, watched) {
  let reachable;
  try {
    reachable = jj(["log", "-r", `${earliest}::@`, "--no-graph", "-T", 'commit_id ++ "\\n"'], vault).trim();
  } catch (error) {
    fail(`jj log 失败：${error instanceof Error ? error.message : error}`);
  }
  if (reachable === "") {
    fail("这一轮的计划提交不在当前历史上（可能已经撤销过）");
  }
  let later;
  try {
    later = jj(["log", "-r", `${earliest}+::@`, "--no-graph", "-T", 'commit_id ++ "\\n"'], vault)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !batchIds.has(line));
  } catch (error) {
    fail(`jj log 失败：${error instanceof Error ? error.message : error}`);
  }
  for (const id of later) {
    let entries;
    try {
      entries = diffEntries(vault, id);
    } catch (error) {
      fail(`jj diff 失败：${error instanceof Error ? error.message : error}`);
    }
    for (const entry of entries) {
      const hit = entry.paths.find((path) => watched.has(path));
      if (hit !== undefined) fail(`这一轮之后 ${hit} 又被改过，不能直接撤销`);
    }
  }
}

function cmdList(vaultArg, flags, json) {
  const vault = resolve(vaultArg ?? fail("list 需要 <库根>"));
  const since = sinceMs(flags);
  if (!isJjRepo(vault)) fail("撤销需要库在 jj 下");
  const commits = planCommits(vault, since);
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ commits: commits.map(({ id, kind, slug, date }) => ({ id, kind, slug, date })) })}\n`,
    );
  } else {
    for (const commit of commits) {
      process.stdout.write(`${commit.kind} ${commit.slug} ${commit.date}\t${commit.id}\n`);
    }
    if (commits.length === 0) process.stdout.write("这个时间之后没有计划改动\n");
  }
}

function cmdUndo(vaultArg, flags, json) {
  const vault = resolve(vaultArg ?? fail("undo 需要 <库根>"));
  const workspace = resolve(flags.workspace ?? fail("undo 需要 --workspace <工作区>"));
  recoverInternal(workspace);
  const since = sinceMs(flags);
  if (!isJjRepo(vault)) fail("撤销需要库在 jj 下");
  const commits = planCommits(vault, since);
  if (commits.length === 0) fail("这一轮没有提交过计划改动，没有可撤销的");
  const { keptNew, restoreFiles } = collectPaths(vault, commits);
  guardLaterCommits(
    vault,
    commits[0].id,
    new Set(commits.map((commit) => commit.id)),
    new Set([...keptNew, ...restoreFiles]),
  );
  // 全是新建页时没有可恢复的东西：不调 jj restore、不提交，直接输出（同 cmdUndo）。
  let jjResult = "skipped";
  let board = null;
  if (restoreFiles.length > 0) {
    restoreFromRev(vault, `${commits[0].id}-`, restoreFiles);
    const slugs = [...new Set(commits.map((commit) => commit.slug))];
    for (const slug of slugs) lockCourse(vault, slug, restoreFiles);
    board = refreshBoard(vault);
    jjResult = jjCommit(vault, `撤销计划 ${slugs.join("、")} ${localDate()}`, [
      ...restoreFiles,
      ...board.paths,
    ]);
  }
  const out = {
    undone: commits.map((commit) => commit.id),
    restoreFiles,
    keptNew,
    jj: jjResult,
    board: board === null ? "skipped" : board.ok ? "ok" : board.error,
  };
  if (json) {
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  } else {
    process.stdout.write(`已撤销 ${commits.length} 个计划提交，恢复 ${restoreFiles.length} 个文件\n`);
    for (const path of keptNew) {
      process.stdout.write(`这一轮新建的页面（保留，可询问后删除）：${path}\n`);
    }
    if (out.board !== "ok" && out.board !== "skipped") process.stdout.write(`看板未刷新：${out.board}\n`);
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
    if (key === "json" || key === "help") flags[key] = true;
    else {
      flags[key] = argv[i + 1];
      i += 1;
    }
  }
  return { positional, flags };
}

function usage() {
  return [
    "撤销总控这一轮的计划改动（plan-undo）：--since 之后的「计划」「顺延」提交一起撤回",
    "",
    "用法：",
    "  node plan-undo.mjs list <库根> --since <ISO> [--json]",
    "  node plan-undo.mjs undo <库根> --since <ISO> --workspace <工作区> [--json]",
    "",
    "list 输出这一轮可撤销的提交（从旧到新）；undo 把其余文件恢复到最早那次之前，",
    "新建的页保留并列在 keptNew。这一轮之后文件又被改过则拒绝，什么都不动。",
  ].join("\n");
}

const { positional, flags } = parseArgs(process.argv.slice(2));
const [command, ...rest] = positional;
if (flags.help === true || command === undefined) {
  process.stdout.write(`${usage()}\n`);
  process.exit(command === undefined ? 1 : 0);
}
switch (command) {
  case "list":
    cmdList(rest[0], flags, flags.json === true);
    break;
  case "undo":
    cmdUndo(rest[0], flags, flags.json === true);
    break;
  default:
    fail(`未知命令：${command}\n${usage()}`);
}
