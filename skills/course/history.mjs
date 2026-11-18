#!/usr/bin/env node
// 「改动记录」的后端：把库根 jj 历史（::@）上的提交按描述第一个词分类成条目——
// 动作 verb、对象 slug、新建的页数，并标出哪条还能撤：手工整理、撤销记录本身、
// 只动看板的提交、之后（含工作副本）又被改过的提交都不可撤。
// undo 把一批条目撤回到最早那条之前：新建的页保留（keptNew），公共日志/索引
// 的行也保留（keptShared），其余文件恢复、课程页锁回只读、看板重画，
// 再记一条「撤销 <原文>（等 N 条）」提交。无第三方依赖。
//   node history.mjs list <库根> --days <N> [--json]
//   node history.mjs undo <库根> --ids <id,id,…> --workspace <工作区> [--json]
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BOARD_RELS, refreshBoard } from "./close/board.mjs";
import { lockCourse, recoverInternal } from "./close/durable.mjs";
import { fail } from "./close/fail.mjs";
import { diffEntries, isJjRepo, jj, jjCommit } from "./close/jj.mjs";
import { restoreFiles as restoreFromRev } from "./close/restore.mjs";

// 学根自己写的提交的第一个词（描述格式「<动作> [<slug>] [<日期>]」）。其余都是手工整理。
const VERBS = [
  "撤销收课", "撤销计划", "撤销",
  "收课", "计划", "顺延", "开周期", "自报", "存档点", "偏好", "卡片", "停用", "恢复",
  "读书", "暂停", "排课后读", "课后读", "摘录", "制卡", "目标",
];

// 只追加的公共文件：别的课也往里写，不算冲突、撤销时不恢复（留着那几行；新建页保留，索引行正好对得上）。
const SHARED_RELS = new Set(["wiki/log.md", "wiki/index.md"]);

// 描述（JSON 转义）、commit_id、提交时间（ISO 带时区，Date.parse 可解），一行一条。
const LOG_TEMPLATE =
  'json(description) ++ "\\t" ++ commit_id ++ "\\t" ++ json(committer.timestamp()) ++ "\\n"';

/**
 * 提交描述 → { verb, slug, text, manual }；空描述（工作副本 @、jj 根提交）返回 null。
 * verb 是第一行里第一个命中的动作词（「撤销收课」「排课后读」这类长词排在短词前面），
 * slug 是动词后第一个词（日期与「卡片」的栏位不算 slug）；没有命中就是手工提交。
 */
export function classify(description) {
  const line = description.split("\n")[0].trim();
  if (line === "") return null;
  const verb = VERBS.find(
    (word) => line === word || line.startsWith(`${word} `) || line.startsWith(`${word}：`),
  );
  if (verb === undefined) return { verb: null, slug: null, text: line, manual: true };
  const rest = line.slice(verb.length).replace(/^[ ：]/, "");
  const first = rest.split(" ")[0] ?? "";
  const slug = first !== "" && !/^\d{4}-\d{2}-\d{2}/.test(first) && verb !== "卡片" ? first : null;
  return { verb, slug, text: line, manual: false };
}

/**
 * 最近 days 天 ::@ 上的提交，由新到旧。每条带 classify 的结果、这次提交改过的路径
 * （diff 留在 entry.diff 供 undo 复用）、新建概念页/卡片页数与可撤标记。
 */
function entriesOf(vault, days) {
  let listed;
  try {
    listed = jj(["log", "-r", "::@", "--no-graph", "-T", LOG_TEMPLATE], vault);
  } catch (error) {
    fail(`jj log 失败：${error instanceof Error ? error.message : error}`);
  }
  const cutoff = Date.now() - days * 86400000;
  const entries = [];
  for (const line of listed.split("\n")) {
    if (line.trim() === "") continue;
    const [descriptionJson, id, timeJson] = line.split("\t");
    if (id === undefined || timeJson === undefined) continue;
    let description;
    let at;
    try {
      description = JSON.parse(descriptionJson);
      at = JSON.parse(timeJson);
    } catch {
      continue;
    }
    // log 由新到旧，遇到第一条过期就停。
    if (Date.parse(at) < cutoff) break;
    const classified = classify(description);
    if (classified === null) continue;
    let diff;
    try {
      diff = diffEntries(vault, id.trim());
    } catch (error) {
      fail(`jj diff 失败：${error instanceof Error ? error.message : error}`);
    }
    const paths = new Set();
    const added = { concepts: 0, cards: 0 };
    for (const entry of diff) {
      for (const path of entry.paths) {
        if (BOARD_RELS.has(path) || SHARED_RELS.has(path)) continue;
        paths.add(path);
        if (entry.status === "A") {
          if (path.includes("/concepts/")) added.concepts += 1;
          else if (path.includes("/flashcards/")) added.cards += 1;
        }
      }
    }
    entries.push({ id: id.trim(), at, ...classified, diff, paths: [...paths], added });
  }
  // 工作副本 @ 里没提交的改动也算「更新的改动」，先放进 laterPaths 挡一轮。
  let dirty;
  try {
    dirty = diffEntries(vault, "@");
  } catch (error) {
    fail(`jj diff 失败：${error instanceof Error ? error.message : error}`);
  }
  const laterPaths = new Set(
    dirty.flatMap((entry) => entry.paths.filter((path) => !BOARD_RELS.has(path) && !SHARED_RELS.has(path))),
  );
  for (const entry of entries) {
    if (entry.manual || entry.verb.startsWith("撤销")) {
      entry.undoable = false;
      entry.blocked = "kind";
    } else if (entry.paths.length === 0) {
      entry.undoable = false;
      entry.blocked = "empty";
    } else if (entry.paths.some((path) => laterPaths.has(path))) {
      entry.undoable = false;
      entry.blocked = "later";
    } else {
      entry.undoable = true;
      entry.blocked = null;
    }
    for (const path of entry.paths) laterPaths.add(path);
  }
  return entries;
}

/** 批次动过的文件：同一路径以第一次出现为准，状态 A（新建）进 keptNew，其余进
 * restoreFiles；看板（BOARD_RELS）两边都不算（同 plan-undo 的 collectPaths）；
 * 公共文件（SHARED_RELS）不恢复、不挡冲突，单列 keptShared 让界面说明「这几行留着」。 */
function collectPaths(batch) {
  const keptNew = new Set();
  const restore = new Set();
  const keptShared = new Set();
  const seen = new Set();
  for (const entry of batch) {
    for (const item of entry.diff) {
      for (const path of item.paths) {
        if (SHARED_RELS.has(path)) {
          keptShared.add(path);
          continue;
        }
        if (BOARD_RELS.has(path) || seen.has(path)) continue;
        seen.add(path);
        (item.status === "A" ? keptNew : restore).add(path);
      }
    }
  }
  return { keptNew: [...keptNew], restoreFiles: [...restore], keptShared: [...keptShared] };
}

/**
 * 安全闸：最早那条之后（<earliest>+::@）凡不在批次里的提交、以及工作副本 @ 的改动，
 * 碰过 watched 里的任一路径就不能撤，否则会盖掉那次改动。有冲突时 fail 且什么都不动。
 */
function guardLaterCommits(vault, earliest, batchIds, watched) {
  let later;
  try {
    later = jj(["log", "-r", `${earliest}+::@`, "--no-graph", "-T", 'commit_id ++ "\\n"'], vault)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !batchIds.has(line));
  } catch (error) {
    fail(`jj log 失败：${error instanceof Error ? error.message : error}`);
  }
  const check = (diff) => {
    for (const entry of diff) {
      const hit = entry.paths.find((path) => watched.has(path));
      if (hit !== undefined) fail(`${hit} 在这之后又被改过，不能直接撤销`);
    }
  };
  for (const id of later) {
    let diff;
    try {
      diff = diffEntries(vault, id);
    } catch (error) {
      fail(`jj diff 失败：${error instanceof Error ? error.message : error}`);
    }
    check(diff);
  }
  let working;
  try {
    working = diffEntries(vault, "@");
  } catch (error) {
    fail(`jj diff 失败：${error instanceof Error ? error.message : error}`);
  }
  check(working);
}

function cmdList(vaultArg, flags, json) {
  const vault = resolve(vaultArg ?? fail("list 需要 <库根>"));
  const days = Number(flags.days);
  if (!Number.isInteger(days) || days < 1 || days > 90) fail("--days 要 1–90 的整数");
  if (!isJjRepo(vault)) fail("历史需要库在 jj 下");
  const entries = entriesOf(vault, days);
  if (json) {
    process.stdout.write(
      `${JSON.stringify({
        entries: entries.map(({ id, at, verb, slug, text, manual, added, undoable, blocked }) => ({
          id,
          at,
          verb,
          slug,
          text,
          manual,
          added,
          undoable,
          blocked,
        })),
      })}\n`,
    );
    return;
  }
  for (const entry of entries) {
    process.stdout.write(
      `${entry.at}\t${entry.verb ?? "手工"}\t${entry.slug ?? ""}\t${entry.undoable ? "可撤" : "不可撤"}\n`,
    );
  }
  if (entries.length === 0) process.stdout.write("这段时间没有改动记录\n");
}

function cmdUndo(vaultArg, flags, json) {
  const vault = resolve(vaultArg ?? fail("undo 需要 <库根>"));
  const workspace = resolve(flags.workspace ?? fail("undo 需要 --workspace <工作区>"));
  recoverInternal(workspace);
  if (!isJjRepo(vault)) fail("历史需要库在 jj 下");
  const ids = (flags.ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
  if (ids.length === 0) fail("需要 --ids");
  const entries = entriesOf(vault, 90);
  const position = new Map(entries.map((entry, index) => [entry.id, index]));
  const batch = [];
  for (const id of new Set(ids)) {
    const index = position.get(id);
    if (index === undefined) fail("这条改动不在最近 90 天的记录里");
    const entry = entries[index];
    if (entry.manual || entry.verb.startsWith("撤销")) fail("这条不能在这里撤销");
    batch.push({ entry, index });
  }
  // 列表由新到旧（下标大的更旧）：按下标从大到小排就是从旧到新。
  batch.sort((a, b) => b.index - a.index);
  const commits = batch.map((item) => item.entry);
  const earliest = commits[0].id;
  const { keptNew, restoreFiles, keptShared } = collectPaths(commits);
  guardLaterCommits(vault, earliest, new Set(ids), new Set([...keptNew, ...restoreFiles]));
  // 全是新建页时没有可恢复的东西：不调 jj restore、不提交，直接输出（同 plan-undo）。
  let jjResult = "skipped";
  let board = null;
  if (restoreFiles.length > 0) {
    restoreFromRev(vault, `${earliest}-`, restoreFiles);
    const slugs = [
      ...new Set(
        restoreFiles
          .map((path) => /^wiki\/courses\/([^/]+?)(?:\.md|\/)/.exec(path)?.[1])
          .filter((slug) => slug !== undefined),
      ),
    ];
    for (const slug of slugs) lockCourse(vault, slug, restoreFiles);
    board = refreshBoard(vault);
    const newest = commits[commits.length - 1];
    jjResult = jjCommit(
      vault,
      `撤销 ${newest.text}${commits.length > 1 ? ` 等 ${commits.length} 条` : ""}`,
      [...restoreFiles, ...board.paths],
    );
  }
  const out = {
    undone: commits.map((entry) => entry.id),
    restoreFiles,
    keptNew,
    keptShared,
    jj: jjResult,
    board: board === null ? "skipped" : board.ok ? "ok" : board.error,
  };
  if (json) {
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  } else {
    process.stdout.write(`已撤销 ${commits.length} 条改动，恢复 ${restoreFiles.length} 个文件\n`);
    for (const path of keptNew) {
      process.stdout.write(`这批新建的页面（保留，可询问后删除）：${path}\n`);
    }
    for (const path of keptShared) {
      process.stdout.write(`日志 / 索引里的行保留：${path}\n`);
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
    "库的改动记录（history）：按描述第一个词把 jj 提交分成可读的条目，能撤的标出来",
    "",
    "用法：",
    "  node history.mjs list <库根> --days <N> [--json]",
    "  node history.mjs undo <库根> --ids <id,id,…> --workspace <工作区> [--json]",
    "",
    "list 输出最近 N 天的改动（由新到旧）；undo 把一批条目恢复到最早那条之前，",
    "新建的页保留并列在 keptNew。那之后文件又被改过则拒绝，什么都不动。",
  ].join("\n");
}

// 主模块判定必须比真实路径：经符号链接调用时 argv[1] 与 import.meta.url 字面不同。
function isMain() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
}

if (isMain()) {
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
}
