#!/usr/bin/env node
// Xuegen 库一次性改名（rename-vault）：按 docs/platform/vault-rename-map.json 把
// 旧布局库改成英文命名，并改写全部 [[…]] 链接。无第三方依赖。
//   node rename-vault.mjs <vault> <map.json> [--apply] [--skip-jj-check] [--skip-process-check] [--json]
// 不带 --apply 是试运行，只打印计划，不写任何文件。
// 顺序：前置检查 → 链接改写表 → 改写链接 → 目录改名 → 逐文件搬动 → 删空目录 → 核对。
// 前置检查不过就 fail，什么都不动；apply 中途出错即停，打印已做到哪一步
//（库在 jj 下，事后用 jj restore 回滚；本脚本不做 jj 提交）。
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  statSync,
} from "node:fs";
import { writeFile, rename } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lintTree, allowedLinkRoots, lintLinks, makeCodeTest } from "./vault-lint.mjs";

const PROCESS_CHECK = "学根.app/Contents/MacOS|Obsidian.app/Contents/MacOS";
const LINK_RE = /(!?)\[\[([^\]\n]+)\]\]/g;

function fail(message) {
  process.stderr.write(`rename-vault: ${message}\n`);
  process.exit(1);
}

function stripMd(path) {
  return path.endsWith(".md") ? path.slice(0, -3) : path;
}

// 链接目标按「wiki/ 起的完整路径」写：去掉路径里的 wiki/ 前缀。
function stripWiki(path) {
  return path.startsWith("wiki/") ? path.slice("wiki/".length) : path;
}

// ---- 前置检查 ----

function loadMap(file) {
  const text = readFileSync(file, "utf8");
  let map;
  try {
    map = JSON.parse(text);
  } catch (error) {
    fail(`map.json 解析失败：${error instanceof Error ? error.message : error}`);
  }
  for (const key of ["dirs", "files"]) {
    if (!Array.isArray(map[key])) fail(`map.json 缺少 ${key} 数组`);
    for (const entry of map[key]) {
      if (typeof entry?.from !== "string" || typeof entry?.to !== "string") {
        fail(`map.json ${key} 条目缺 from/to：${JSON.stringify(entry)}`);
      }
    }
  }
  if (!Array.isArray(map.removeEmptyDirs)) map.removeEmptyDirs = [];
  return map;
}

function checkPaths(vault, map) {
  for (const entry of map.dirs) {
    if (!existsSync(join(vault, entry.from)) || !statSync(join(vault, entry.from)).isDirectory()) {
      fail(`目录不存在：${entry.from}`);
    }
  }
  for (const entry of map.files) {
    if (!existsSync(join(vault, entry.from)) || !statSync(join(vault, entry.from)).isFile()) {
      fail(`文件不存在：${entry.from}`);
    }
  }
  const seen = new Set();
  for (const entry of [...map.dirs, ...map.files]) {
    if (seen.has(entry.to)) fail(`目标路径重复：${entry.to}`);
    seen.add(entry.to);
    // 大小写不敏感的盘上，仅大小写不同的改名（Clippings → clippings）会让
    // `to` 看起来"已存在"——那其实是 `from` 本身，放行；其余已存在一律失败。
    if (existsSync(join(vault, entry.to)) && entry.to.toLowerCase() !== entry.from.toLowerCase()) {
      fail(`目标已存在：${entry.to}`);
    }
  }
}

function checkJj(vault) {
  let out;
  try {
    out = execFileSync("jj", ["--no-pager", "st"], { cwd: vault, encoding: "utf8" });
  } catch (error) {
    fail(`jj st 失败（库必须在 jj 下，改名后靠 jj undo/restore 兜底）：${error.message}`);
  }
  if (!/no changes/i.test(out)) fail("jj 工作区不干净：先处理未提交改动再改名");
}

function checkProcesses() {
  const result = spawnSync("pgrep", ["-f", PROCESS_CHECK], { encoding: "utf8" });
  if (result.error) {
    fail(`pgrep 不可用，无法确认学根/Obsidian 没在运行（可用 --skip-process-check 跳过）`);
  }
  if (result.status === 0) {
    fail(`学根或 Obsidian 正在运行（pid ${result.stdout.trim().split("\n").join("、")}）：先退出再改名`);
  }
}

// 组合前置检查：任何一项不过就 fail（此时还没写过任何文件）。
// --skip-jj-check / --skip-process-check 只给测试与临时副本用。
function precheck(vault, map, { skipJjCheck, skipProcessCheck } = {}) {
  checkPaths(vault, map);
  if (!skipJjCheck) checkJj(vault);
  if (!skipProcessCheck) checkProcesses();
  checkGitignore(vault, map);
}

// ---- .gitignore 前缀改写 ----

// 库的 .gitignore 用旧目录名写规则（`raw/学习路径/` 装着 228 MB 教材与 .venv）。
// 目录改名后这些规则会失效，raw/library/ 就会被 jj/git 收进版本库。
// 因此把以某个 from 开头的行改成对应的 to（只换前缀，保留注释、空行与其余行）。
// 带 `!` 的否定规则没法用前缀替换表达，不自动改，由 checkGitignore 报错。
const GITIGNORE = ".gitignore";

function readGitignore(vault) {
  const file = join(vault, GITIGNORE);
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

// 返回 {text, lines}；lines 为 [{index, before, after}]，供试运行打印。
// 只改以旧前缀开头的行（`raw/旧/`、`raw/旧/sub/`、以及不带末尾斜的 `raw/旧`），
// 注释、空行、无关规则一律原样。
export function rewriteGitignore(text, dirs) {
  const rules = dirs.map((entry) => ({ from: entry.from, to: entry.to })).sort((a, b) => b.from.length - a.from.length);
  const lines = [];
  const next = text.split("\n").map((line, index) => {
    const trimmed = line.replace(/^!/, "");
    const rule = rules.find((entry) => trimmed === entry.from || trimmed.startsWith(`${entry.from}/`));
    if (rule === undefined || line.startsWith("!")) return line;
    const after = `${rule.to}${line.slice(rule.from.length)}`;
    lines.push({ index, before: line, after });
    return after;
  });
  return { text: next.join("\n"), lines };
}

// 简单 glob → 正则：`**` 任意层，`*` 单层，`?` 单字符；行尾 `/` 表示目录。
function ignorePatternToRegExp(pattern) {
  const body = pattern.replace(/\/+$/, "");
  let re = "";
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (char === "*" && body[i + 1] === "*") {
      re += ".*";
      i += 1;
    } else if (char === "*") {
      re += "[^/]*";
    } else if (char === "?") {
      re += "[^/]";
    } else {
      re += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}($|/)`);
}

/** 这个库相对路径是否被 .gitignore 忽略（前缀/通配的近似语义）。 */
export function isIgnored(relPath, text) {
  if (text === null) return false;
  const path = relPath.replace(/\/+$/, "");
  let ignored = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const negated = line.startsWith("!");
    const pattern = negated ? line.slice(1) : line;
    if (!ignorePatternToRegExp(pattern).test(path)) continue;
    ignored = !negated;
  }
  return ignored;
}

// 前置检查：任何一个 from 被忽略而改名后的 to 不被忽略就 fail。自动改写能处理
// 普通的旧前缀行，处理不了的（如否定规则）不能默默放过去。
function checkGitignore(vault, map) {
  const text = readGitignore(vault);
  if (text === null) return;
  const rewritten = rewriteGitignore(text, map.dirs).text;
  for (const entry of map.dirs) {
    if (!isIgnored(entry.from, text)) continue;
    if (!isIgnored(entry.to, rewritten)) {
      fail(`${entry.from} 现在被 .gitignore 忽略，改名成 ${entry.to} 后不会被忽略：先把它加进 .gitignore`);
    }
  }
}

// ---- 链接改写表 ----

// 改名后某个库内目标的新位置（wiki/ 起完整路径，.md 去扩展名）：
// files 是权威清单，逐个命中；目录改名按最长前缀换算；都不中返回 null。
function newTargetFor(oldRel, map, dirPairs) {
  const file = map.files.find((entry) => stripMd(entry.from) === oldRel);
  if (file) return file.to.endsWith(".md") ? stripMd(stripWiki(file.to)) : stripWiki(file.to);
  const dir = dirPairs.find((entry) => oldRel.startsWith(`${entry.from}/`));
  if (dir) return `${stripWiki(dir.to)}${oldRel.slice(dir.from.length)}`;
  return null;
}

// 链接解析：Obsidian 后缀解析语义——目标的每个路径后缀都可能被写成链接。
// 对每个目标记录命中它的文件集合；只有唯一命中才改写（歧义的不动，列入残留）。
export function buildLinkContext(vault, map) {
  const resolver = new Map();
  const allFiles = collectEntriesSync(vault).filter((entry) => !entry.endsWith("/"));
  for (const path of allFiles) {
    const canonical = path.endsWith(".md") ? stripMd(path) : path;
    const parts = canonical.split("/");
    for (let i = 0; i < parts.length; i += 1) {
      const suffix = parts.slice(i).join("/");
      if (!resolver.has(suffix)) resolver.set(suffix, new Set());
      resolver.get(suffix).add(canonical);
    }
  }
  const titles = new Map(
    map.files.map((entry) => [stripMd(entry.from), typeof entry.title === "string" ? entry.title : null]),
  );
  const dirPairs = map.dirs
    .map((entry) => ({ from: entry.from, to: entry.to }))
    .sort((a, b) => b.from.length - a.from.length);
  return { resolver, titles, map, dirPairs };
}

function resolveLink(base, context) {
  const candidates = context.resolver.get(base);
  const oldRel = pickCandidate(candidates);
  if (oldRel === null) return null;
  const to = newTargetFor(oldRel, context.map, context.dirPairs);
  if (to === null) return null;
  return { to, title: context.titles.get(oldRel) ?? null };
}

// 卡片页是概念页的同名附属物（同名同路径，只是分别在 flashcards/ 与 concepts/ 下）。
// 旧库里大量链接写成 `[[link/210-符号处理]]`，两边都命中；有多个命中时，
// 若恰好一个不在 flashcards/ 下，就取它（链接默认指概念/正文页）；
// 其余情况（同一类里还有多个同名文件）仍算歧义，不改写。
function isFlashcardPage(path) {
  return path.split("/").includes("flashcards");
}

function pickCandidate(candidates) {
  if (candidates === undefined) return null;
  if (candidates.size === 1) return [...candidates][0];
  if (candidates.size === 0) return null;
  const nonCards = [...candidates].filter((path) => !isFlashcardPage(path));
  return nonCards.length === 1 ? nonCards[0] : null;
}

// 改写文本里的 [[旧]]、[[旧|显示]]、[[旧#标题]]、![[旧]]；只替换完整链接目标。
// 没有显示文字的 [[旧]] 改成 [[新|title]]（嵌入链接 ![[…]] 不加别名）。
// 代码块与行内代码里的 [[…]] 是字面量，Obsidian 不解析，一律不改。
// 返回 ambiguous：命中了多个文件（后缀解析有歧义）因而没改的目标。
export function rewriteLinks(text, table) {
  let count = 0;
  const ambiguous = new Set();
  const isInCode = makeCodeTest(text);
  const next = text.replace(LINK_RE, (match, bang, inner, offset) => {
    if (isInCode(offset)) return match;
    const pipeAt = inner.indexOf("|");
    // 表格里写的是转义的 `\|`；分隔符保留原样，目标不带走反斜杠。
    const escapedPipe = pipeAt > 0 && inner[pipeAt - 1] === "\\";
    const head = pipeAt === -1 ? inner : inner.slice(0, escapedPipe ? pipeAt - 1 : pipeAt);
    const display = pipeAt === -1 ? null : inner.slice(pipeAt + 1);
    const sep = escapedPipe ? "\\|" : "|";
    const hashAt = head.indexOf("#");
    const base = (hashAt === -1 ? head : head.slice(0, hashAt)).trim();
    const anchor = hashAt === -1 ? "" : head.slice(hashAt);
    if (base === "") return match;
    const hit = resolveLink(base, table);
    if (hit === null) {
      const candidates = table.resolver.get(base);
      if (candidates !== undefined && candidates.size > 1 && pickCandidate(candidates) === null) {
        ambiguous.add(base);
      }
      return match;
    }
    count += 1;
    const alias =
      display !== null ? `${sep}${display}` : hit.title !== null && bang !== "!" ? `|${hit.title}` : "";
    return `${bang}[[${hit.to}${anchor}${alias}]]`;
  });
  return { text: next, count, ambiguous };
}

// ---- 库扫描与写文件 ----

// 库里所有 .md 的相对路径（含 AGENTS.md、README.md、log.md；跳过 . 开头目录）。
function markdownFiles(vault) {
  return collectEntriesSync(vault).filter((entry) => !entry.endsWith("/") && entry.endsWith(".md"));
}

function collectEntriesSync(vault) {
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const r = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        out.push(`${r}/`);
        walk(join(dir, entry.name), r);
      } else {
        out.push(r);
      }
    }
  };
  walk(vault, "");
  return out;
}

async function writeAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, text, "utf8");
  // 保留原文件权限（课程页等 0444 的只读锁不能被改写顺手解开）。
  if (existsSync(file)) chmodSync(tmp, statSync(file).mode & 0o777);
  await rename(tmp, file);
}

// 库里有只读锁（课程页 0444、wiki/courses 0555）：写文件/改名只需要父目录可写，
// 临时 u+w 并记下原权限，结束时统一恢复。
function ensureWritable(dir, restored) {
  const mode = statSync(dir).mode & 0o777;
  if (mode & 0o200) return;
  if (!restored.has(dir)) restored.set(dir, mode);
  chmodSync(dir, mode | 0o700);
}

// 目标路径的父目录可能还在只读锁里（如 courses/<slug>/）：向上找到第一个
// 已存在的祖先并放开写权限；其下新建目录默认可写。
function ensureWritableParent(vault, to, restored) {
  let dir = dirname(join(vault, to));
  while (!existsSync(dir)) dir = dirname(dir);
  ensureWritable(dir, restored);
}

function restoreModes(restored) {
  for (const [dir, mode] of restored) {
    try {
      chmodSync(dir, mode);
    } catch {
      process.stderr.write(`rename-vault: 恢复权限失败 ${dir}（应 ${mode.toString(8)}）\n`);
    }
  }
}

// ---- 搬动 ----

// 目录被改名后，记录在案的原权限键要跟着改坐标，否则恢复权限时会找不到路径。
function translateRestored(restored, from, to) {
  for (const [dir, mode] of [...restored]) {
    if (dir === from || dir.startsWith(`${from}/`)) {
      restored.delete(dir);
      restored.set(`${to}${dir.slice(from.length)}`, mode);
    }
  }
}

// 已完成的改名（原始坐标 → 最终路径）；from/to 都按「全部改完后的坐标」记录。
function translate(path, applied) {
  let best = null;
  for (const moved of applied) {
    if (path === moved.from || path.startsWith(`${moved.from}/`)) {
      if (best === null || moved.from.length > best.from.length) best = moved;
    }
  }
  return best === null ? path : `${best.to}${path.slice(best.from.length)}`;
}

// 目录整体改名（父在前）；from/to 都是改名前/全部改完后的坐标，
// 实际位置经已完成的改名换算（父目录改名会把子目录一起带走）。
function moveDirs(vault, map, applied, restored) {
  for (const entry of map.dirs) {
    const actual = translate(entry.from, applied);
    if (actual === entry.to) {
      applied.push({ from: entry.from, to: entry.to });
      continue;
    }
    // 抛错而不是 fail：apply 中途出错要让 finally 先把权限恢复回去。
    if (!existsSync(join(vault, actual))) throw new Error(`目录改名时找不到 ${actual}（原 ${entry.from}）`);
    ensureWritable(join(vault, dirname(actual)), restored);
    ensureWritableParent(vault, entry.to, restored);
    mkdirSync(dirname(join(vault, entry.to)), { recursive: true });
    renameSync(join(vault, actual), join(vault, entry.to));
    translateRestored(restored, actual, entry.to);
    applied.push({ from: entry.from, to: entry.to });
  }
}

function moveFiles(vault, map, applied, restored) {
  let moved = 0;
  for (const entry of map.files) {
    const actual = translate(entry.from, applied);
    if (actual === entry.to) continue;
    if (!existsSync(join(vault, actual))) {
      if (existsSync(join(vault, entry.to))) continue;
      throw new Error(`搬文件时找不到 ${actual}（原 ${entry.from}）`);
    }
    ensureWritable(join(vault, dirname(actual)), restored);
    ensureWritableParent(vault, entry.to, restored);
    mkdirSync(dirname(join(vault, entry.to)), { recursive: true });
    renameSync(join(vault, actual), join(vault, entry.to));
    moved += 1;
  }
  return moved;
}

function removeEmptyDirs(vault, map, applied, problems, restored) {
  let removed = 0;
  for (const dir of map.removeEmptyDirs) {
    const actual = translate(dir, applied);
    if (!existsSync(join(vault, actual))) continue;
    try {
      ensureWritable(join(vault, dirname(actual)), restored);
      rmdirSync(join(vault, actual));
      removed += 1;
    } catch {
      problems.push(`目录未空或删除失败：${actual}`);
    }
  }
  return removed;
}

// ---- 核对 ----

// 重新扫描所有 .md，列出解析不到的链接目标。paths 为改名后的文件集合
//（库相对路径，含扩展名）；texts 可传入改写后的文本（试运行用），默认读盘上原文。
// 目标匹配 Obsidian 语义：全路径或后缀路径去 .md。
function unresolvedLinks(vault, paths, texts = null) {
  const stripped = [...paths].map(stripMd);
  const resolvable = (base) =>
    paths.has(base) || stripped.some((path) => path === base || path.endsWith(`/${base}`));
  const out = [];
  for (const file of markdownFiles(vault)) {
    const text = texts === null ? readFileSync(join(vault, file), "utf8") : texts.get(file) ?? "";
    // 代码块与行内代码里的 [[…]] 是字面量（Obsidian 不解析），不算断链。
    const isInCode = makeCodeTest(text);
    for (const match of text.matchAll(LINK_RE)) {
      if (isInCode(match.index ?? 0)) continue;
      const base = match[2].split("|")[0].split("#")[0].trim().replace(/\\+$/, "");
      if (base === "" || base.startsWith(".")) continue;
      if (!resolvable(base)) out.push({ file, target: base });
    }
  }
  return out;
}

function usage() {
  return [
    "库一次性改名（rename-vault）",
    "",
    "用法：node rename-vault.mjs <vault> <map.json> [--apply] [--skip-jj-check] [--skip-process-check] [--json]",
    "",
    "不带 --apply 是试运行：前置检查 + 打印改名与链接改写计划，不写文件。",
    "--apply 才执行：先改写全部 .md 链接，再目录改名、逐文件搬动、删空目录，",
    "最后核对链接可解析并跑 vault-lint。不做 jj 提交；出错即停并报告进度。",
    "--skip-jj-check / --skip-process-check 只给测试与临时副本用，真实库不要加。",
  ].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const apply = args.includes("--apply");
  const skipJjCheck = args.includes("--skip-jj-check");
  const skipProcessCheck = args.includes("--skip-process-check");
  const json = args.includes("--json");
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const vault = resolve(positional[0] ?? fail("需要 vault 路径"));
  const mapFile = resolve(positional[1] ?? fail("需要 map.json 路径"));
  if (!existsSync(vault)) fail(`库不存在：${vault}`);
  const map = loadMap(mapFile);

  precheck(vault, map, { skipJjCheck, skipProcessCheck });

  const table = buildLinkContext(vault, map);
  const mdFiles = markdownFiles(vault);
  const rewrites = mdFiles.map((file) => {
    const result = rewriteLinks(readFileSync(join(vault, file), "utf8"), table);
    return { file, ...result };
  });
  const linkCount = rewrites.reduce((sum, item) => sum + item.count, 0);
  const touched = rewrites.filter((item) => item.count > 0);
  // 后缀解析有歧义而没改的链接：试运行就报出来，别等 apply 后才看残留。
  const ambiguous = [...new Set(rewrites.flatMap((item) => [...item.ambiguous]))].sort();

  const gitignoreText = readGitignore(vault);
  const gitignorePlan = gitignoreText === null ? null : rewriteGitignore(gitignoreText, map.dirs);
  const plan = {
    dirs: map.dirs.length,
    files: map.files.length,
    removeEmptyDirs: map.removeEmptyDirs.length,
    linkRewrites: linkCount,
    filesTouched: touched.length,
    ambiguous,
    gitignore: (gitignorePlan?.lines ?? []).map((line) => ({ before: line.before, after: line.after })),
  };

  if (!apply) {
    // 试运行：预告改名后仍无法解析的链接（现有文件 - from + to 模拟改名后布局）。
    const current = new Set(collectEntriesSync(vault).filter((entry) => !entry.endsWith("/")));
    for (const entry of [...map.dirs, ...map.files]) current.delete(entry.from);
    for (const entry of map.files) current.add(entry.to);
    for (const entry of map.dirs) {
      for (const path of [...current]) {
        if (path === entry.from || path.startsWith(`${entry.from}/`)) {
          current.delete(path);
          current.add(`${entry.to}${path.slice(entry.from.length)}`);
        }
      }
    }
    const unresolved = unresolvedLinks(
      vault,
      current,
      new Map(rewrites.map((item) => [item.file, item.text])),
    );
    if (json) {
      process.stdout.write(`${JSON.stringify({ dryRun: true, plan, unresolved }, null, 2)}\n`);
      return;
    }
    for (const entry of map.dirs) process.stdout.write(`目录 ${entry.from} → ${entry.to}\n`);
    for (const entry of map.files) process.stdout.write(`文件 ${entry.from} → ${entry.to}\n`);    for (const dir of map.removeEmptyDirs) process.stdout.write(`删空目录 ${dir}\n`);
    for (const line of gitignorePlan?.lines ?? []) {
      process.stdout.write(`.gitignore 第 ${line.index + 1} 行 ${line.before} → ${line.after}\n`);
    }
    process.stdout.write(
      `试运行（未写文件）：目录改名 ${plan.dirs}、文件搬动 ${plan.files}、删空目录 ${plan.removeEmptyDirs}、\n` +
        `链接改写 ${plan.linkRewrites} 条（${plan.filesTouched} 个文件）；` +
        `改名后仍有 ${unresolved.length} 条链接无法解析：\n`,
    );
    for (const item of unresolved) process.stdout.write(`  ${item.file}: [[${item.target}]]\n`);
    for (const target of ambiguous) process.stdout.write(`  歧义未改（多个文件同名）：${target}\n`);
    return;
  }

  // ---- apply ----
  let step = "改写 .gitignore";
  const progress = { gitignore: 0, links: 0, dirs: 0, files: 0, removedDirs: 0 };
  const problems = [];
  const restored = new Map();
  try {
    // .gitignore 必须在搬目录之前改好：改名期间库的忽略规则不能有一刻失效。
    if (gitignorePlan !== null && gitignorePlan.lines.length > 0) {
      await writeAtomic(join(vault, GITIGNORE), gitignorePlan.text);
      progress.gitignore = gitignorePlan.lines.length;
    }
    step = "改写链接";
    for (const item of touched) {
      ensureWritable(join(vault, dirname(item.file)), restored);
      await writeAtomic(join(vault, item.file), item.text);
      progress.links += 1;
    }
    step = "目录改名";
    const applied = [];
    moveDirs(vault, map, applied, restored);
    progress.dirs = applied.length;
    step = "搬动文件";
    progress.files = moveFiles(vault, map, applied, restored);
    step = "删空目录";
    progress.removedDirs = removeEmptyDirs(vault, map, applied, problems, restored);
    step = "核对";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 先恢复只读锁再退出：中途失败也要把临时放开的权限还原。
    restoreModes(restored);
    fail(
      `「${step}」失败：${message}\n` +
        `已做到：.gitignore 改写 ${progress.gitignore} 行、链接改写 ${progress.links} 个文件、目录改名 ${progress.dirs}、` +
        `文件搬动 ${progress.files}、删空目录 ${progress.removedDirs}。用 jj restore 回滚。`,
    );
  }

  // 成功路径也要把临时放开的只读锁恢复回去（catch 里已恢复一次）。
  restoreModes(restored);

  const entriesAfter = collectEntriesSync(vault);
  const paths = new Set(entriesAfter.filter((entry) => !entry.endsWith("/")));
  const unresolved = unresolvedLinks(vault, paths);
  const lintProblems = [
    ...lintTree(entriesAfter),
    ...(await lintLinks(vault, entriesAfter, allowedLinkRoots(entriesAfter))),
  ];

  const summary = { plan, progress, unresolved, problems, lintProblems };
  if (json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(
      `完成：.gitignore 改写 ${progress.gitignore} 行、目录改名 ${progress.dirs}、文件搬动 ${progress.files}、删空目录 ${progress.removedDirs}、\n` +
        `链接改写 ${plan.linkRewrites} 条（${plan.filesTouched} 个 .md 文件）。\n`,
    );
    for (const item of unresolved) process.stdout.write(`无法解析 [[${item.target}]]（${item.file}）\n`);
    for (const item of lintProblems) process.stdout.write(`${item.path}: [${item.kind}] ${item.detail}\n`);
    for (const item of problems) process.stdout.write(`${item}\n`);
    process.stdout.write(`残留：${unresolved.length} 条无法解析的链接，${lintProblems.length + problems.length} 个 lint 问题。\n`);
  }
  process.exit(unresolved.length + lintProblems.length + problems.length === 0 ? 0 : 1);
}

// 只有直接运行时才进入 CLI；测试 import 纯函数不触发 main。
// 两边都取真实路径再比：经符号链接调用（~/.xuegen/app、/tmp → /private/tmp）时
// argv[1] 与 import.meta.url 字面不同，只比字面路径会静默不执行。
function isMain() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
}

if (isMain()) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
