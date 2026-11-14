#!/usr/bin/env node
// 周期事务（开下一周期）：周期层的几份文件一次暂存、校验、一笔 jj 提交「开周期 <cN> <日期>」。
// 与 course-close 同一台事务机的思路：<工作区>/.cycle/<cN>-<时间戳>/ 里放库内同路径的副本，
// 模型用编辑工具改副本，check 校验（周期页 / 路线页格式、周期重叠、log 只追加、index 不删行），
// commit 先核对库里没被改过再原子写回并记一笔 jj；abort 删暂存目录。无第三方依赖。
//   node cycle-open.mjs stage  <库根> <cN> --workspace <工作区> [--json]
//   node cycle-open.mjs check  <暂存目录> [--json]
//   node cycle-open.mjs commit <暂存目录> [--json]
//   node cycle-open.mjs abort  <暂存目录> [--json]
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fail } from "../course/close/fail.mjs";
import { cloneInto, localDate, sha256, writeAtomic, WRITABLE_FILE } from "../course/close/durable.mjs";
import { checkAppendOnly, checkNoDeletedLines, stagingName } from "../course/close/rules.mjs";
import { jjCommit } from "../course/close/jj.mjs";
import { checkOverlap, parseCycle, parseRoute } from "./cycle.mjs";

const CYCLE_RE = /^C\d+$/i;
const CYCLE_PAGE_RE = /^wiki\/cycles\/c\d+\.md$/;
const ROUTE_REL = "wiki/cycles/route.md";
const LOG_REL = "wiki/log.md";
const INDEX_REL = "wiki/index.md";

// ---- 暂存 ----

function cycleName(raw) {
  if (!CYCLE_RE.test(raw ?? "")) fail(`需要 <cN>（如 C2），收到 ${raw ?? "（空）"}`);
  return raw.toUpperCase();
}

/** 这次事务暂存的库内相对路径：新周期页、上一周期页（C1 没有）、路线页、科目表、index、log。 */
function stagedRels(cN) {
  const n = Number(cN.slice(1));
  const rels = [`wiki/cycles/c${n}.md`];
  if (n > 1) rels.push(`wiki/cycles/c${n - 1}.md`);
  rels.push(ROUTE_REL, "wiki/subjects.md", INDEX_REL, LOG_REL);
  return rels;
}

function loadManifest(staging) {
  const file = join(staging, "manifest.json");
  if (!existsSync(file)) fail(`不是周期暂存目录（缺 manifest.json）：${staging}`);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`manifest.json 无法解析：${error instanceof Error ? error.message : error}`);
  }
}

/** 同一秒内连跑两次 stage 时名字会撞：加 -2、-3 后缀，绝不复用已有目录。 */
function uniqueStagingDir(cycleDir, name) {
  let candidate = join(cycleDir, name);
  for (let i = 2; existsSync(candidate); i += 1) candidate = join(cycleDir, `${name}-${i}`);
  return candidate;
}

function cmdStage(vaultArg, cNArg, flags, json) {
  const vault = resolve(vaultArg ?? fail("stage 需要 <库根>"));
  const workspace = resolve(flags.workspace ?? fail("stage 需要 --workspace <工作区>"));
  const cN = cycleName(cNArg);
  if (!existsSync(vault) || !statSync(vault).isDirectory()) fail(`库根目录不存在：${vault}`);
  const cycleDir = join(workspace, ".cycle");
  if (existsSync(cycleDir)) {
    const own = new RegExp(`^${cN}-\\d{8}-\\d{6}(-\\d+)?$`);
    for (const name of readdirSync(cycleDir)) {
      if (own.test(name) && statSync(join(cycleDir, name)).isDirectory()) {
        fail(`${cN} 已有未提交的暂存：${join(cycleDir, name)}\n先 commit 或 abort 再重新 stage`);
      }
    }
  }
  const staging = uniqueStagingDir(cycleDir, stagingName(cN, new Date()));
  mkdirSync(staging, { recursive: true });
  const base = {};
  try {
    for (const rel of stagedRels(cN)) {
      const src = join(vault, rel);
      const dst = join(staging, rel);
      if (existsSync(src) && statSync(src).isFile()) {
        cloneInto(src, dst);
        chmodSync(dst, WRITABLE_FILE);
        base[rel] = sha256(src);
      } else {
        // 库里还没有的文件先建空的（新周期页最常见），基线记 null 表示新建。
        mkdirSync(dirname(dst), { recursive: true });
        writeFileSync(dst, "");
        base[rel] = null;
      }
    }
    writeAtomic(
      join(staging, "manifest.json"),
      `${JSON.stringify({ version: 1, kind: "cycle", vault, cycle: cN, createdAt: new Date().toISOString(), base }, null, 2)}\n`,
    );
  } catch (error) {
    try {
      rmSync(staging, { recursive: true, force: true });
    } catch {
      /* 删不掉就留着，人能看到 */
    }
    fail(error instanceof Error ? error.message : String(error));
  }
  const out = { staging, files: Object.keys(base) };
  process.stdout.write(json ? `${JSON.stringify(out)}\n` : `${staging}\n`);
}

// ---- check（stage 副本的格式与一致性；commit 前还要核对库里没被改过）----

/** 校验逻辑：返回 { ok, problems }。读暂存目录与库，不写任何东西。 */
export function runCheck(staging) {
  const manifest = loadManifest(staging);
  const vault = manifest.vault;
  const problems = [];
  const staged = {};
  for (const rel of Object.keys(manifest.base)) {
    const file = join(staging, rel);
    if (!existsSync(file)) {
      problems.push(`暂存里缺少 ${rel}`);
      continue;
    }
    staged[rel] = readFileSync(file, "utf8");
  }
  const parsed = [];
  for (const [rel, text] of Object.entries(staged)) {
    if (!CYCLE_PAGE_RE.test(rel)) continue;
    try {
      parsed.push(parseCycle(text, rel));
    } catch (error) {
      problems.push(`${rel}：${error instanceof Error ? error.message : error}`);
    }
  }
  if (ROUTE_REL in staged) {
    try {
      parseRoute(staged[ROUTE_REL]);
    } catch (error) {
      problems.push(`cycles/route.md：${error instanceof Error ? error.message : error}`);
    }
  }
  const cyclesDir = join(vault, "wiki", "cycles");
  if (existsSync(cyclesDir)) {
    for (const name of readdirSync(cyclesDir).filter((item) => /^c\d+\.md$/.test(item)).sort()) {
      const rel = `wiki/cycles/${name}`;
      if (rel in staged) continue; // 暂存里的副本才是要交的版本
      try {
        parsed.push(parseCycle(readFileSync(join(cyclesDir, name), "utf8"), rel));
      } catch (error) {
        problems.push(`${rel}：${error instanceof Error ? error.message : error}`);
      }
    }
  }
  const all = parsed.sort((a, b) => (a.start < b.start ? -1 : 1));
  const seen = new Set();
  for (const cycle of all) {
    if (seen.has(cycle.cycle)) problems.push(`${cycle.cycle} 出现了两次`);
    seen.add(cycle.cycle);
  }
  problems.push(...checkOverlap(all));
  if (LOG_REL in staged) {
    const current = join(vault, LOG_REL);
    const reason = checkAppendOnly(existsSync(current) ? readFileSync(current, "utf8") : "", staged[LOG_REL]);
    if (reason !== null) problems.push(`${LOG_REL}：${reason}`);
  }
  if (INDEX_REL in staged && existsSync(join(vault, INDEX_REL))) {
    const reason = checkNoDeletedLines(readFileSync(join(vault, INDEX_REL), "utf8"), staged[INDEX_REL]);
    if (reason !== null) problems.push(`${INDEX_REL}：${reason}`);
  }
  return { ok: problems.length === 0, problems };
}

function cmdCheck(stagingArg, json) {
  const staging = resolve(stagingArg ?? fail("check 需要 <暂存目录>"));
  const result = runCheck(staging);
  if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else {
    for (const problem of result.problems) process.stdout.write(`${problem}\n`);
    process.stdout.write(result.ok ? "check: 通过\n" : "check: 未通过\n");
  }
  if (!result.ok) process.exit(1);
}

function cmdCommit(stagingArg, json) {
  const staging = resolve(stagingArg ?? fail("commit 需要 <暂存目录>"));
  const manifest = loadManifest(staging);
  const result = runCheck(staging);
  if (!result.ok) {
    if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
    else process.stdout.write(`${result.problems.map((problem) => `- ${problem}`).join("\n")}\n`);
    process.exit(1);
  }
  for (const [rel, sha] of Object.entries(manifest.base)) {
    const abs = join(manifest.vault, rel);
    if (sha === null ? existsSync(abs) : !existsSync(abs) || sha256(abs) !== sha) {
      fail(`库里 ${rel} 在暂存后被改过，重新 stage`);
    }
  }
  const rels = Object.keys(manifest.base);
  for (const rel of rels) {
    const dst = join(manifest.vault, rel);
    mkdirSync(dirname(dst), { recursive: true });
    writeAtomic(dst, readFileSync(join(staging, rel)));
  }
  const jj = jjCommit(manifest.vault, `开周期 ${manifest.cycle} ${localDate()}`, rels);
  rmSync(staging, { recursive: true, force: true });
  const out = { committed: rels, jj };
  process.stdout.write(json ? `${JSON.stringify(out)}\n` : `已提交（jj: ${out.jj}）\n`);
}

function cmdAbort(stagingArg, json) {
  const staging = resolve(stagingArg ?? fail("abort 需要 <暂存目录>"));
  if (!existsSync(staging)) fail(`暂存目录不存在：${staging}`);
  rmSync(staging, { recursive: true, force: true });
  process.stdout.write(json ? `${JSON.stringify({ aborted: staging })}\n` : `已删除暂存目录：${staging}\n`);
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
    "周期事务（开下一周期）：暂存 → 改副本 → check → 用户说可以 → commit（jj 记「开周期」）",
    "",
    "用法：",
    "  node cycle-open.mjs stage  <库根> <cN> --workspace <工作区> [--json]",
    "  node cycle-open.mjs check  <暂存目录> [--json]",
    "  node cycle-open.mjs commit <暂存目录> [--json]",
    "  node cycle-open.mjs abort  <暂存目录> [--json]",
    "",
    "stage 在 <工作区>/.cycle/<cN>-<时间戳>/ 下按库内相对路径复制新周期页、上一周期页、",
    "route.md、subjects.md、index.md、log.md（库里没有的建空文件，基线记 null）；",
    "模型随后用编辑工具改暂存目录里的副本，commit 时库里已被改过的文件会拒绝。",
  ].join("\n");
}

const { positional, flags } = parseArgs(process.argv.slice(2));
const [command, ...rest] = positional;
if (flags.help === true || command === undefined) {
  process.stdout.write(`${usage()}\n`);
  process.exit(command === undefined ? 1 : 0);
}
switch (command) {
  case "stage":
    cmdStage(rest[0], rest[1], flags, flags.json === true);
    break;
  case "check":
    cmdCheck(rest[0], flags.json === true);
    break;
  case "commit":
    cmdCommit(rest[0], flags.json === true);
    break;
  case "abort":
    cmdAbort(rest[0], flags.json === true);
    break;
  default:
    fail(`未知命令：${command}\n${usage()}`);
}
