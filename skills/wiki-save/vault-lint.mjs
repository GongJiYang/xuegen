#!/usr/bin/env node
// Xuegen 库命名检查（vault-lint）：按 docs/platform/VAULT-NAMING.md 第 1、3、4 节检查。
//   node vault-lint.mjs <vault> [--json]
// 检查范围：wiki/ 与 clippings/ 下所有文件和目录名；
// raw/ 只查第一、二层分区目录名（不查原料文件名）；
// 另查：生成物不在规定位置、空目录、概念页没有编号、卡片页找不到同名概念页、
// [[…]] 链接用了 Obsidian 后缀解析（不以 wiki/ 一级目录或库一级目录开头的）。
// 无第三方依赖。退出码：有问题 1，没有 0。
// lintTree 的入参是库相对路径列表（POSIX 分隔；目录以 `/` 结尾），便于测试。
import { readdir, readFile } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

// 总则第 1 条：小写 ASCII 字母、数字、连字符，至多一个扩展名段。
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+)?$/;
// _generated 是规范第 3 节明定的目录名，不符合总则正则，作为例外放行。
const NAME_EXCEPTIONS = new Set(["_generated"]);
// wiki/ 根下的生成物（新布局应在 wiki/_generated/ 下）。
const GENERATED_WIKI_FILES = new Set(["courses.md", "courses.html", "paradigms.html"]);
// 旧位置的收课截图：wiki/courses/<slug>-YYYY-MM-DD-nn.png（新位置在 <course>/snapshots/ 下）。
const STRAY_SNAPSHOT_RE = /^[a-z0-9-]+-\d{4}-\d{2}-\d{2}-\d{2}\.png$/;
// 概念页 / 卡片页文件名：三位编号起头。
const NUMBERED_PAGE_RE = /^\d{3}-/;
// 卡片页收件箱不参与「卡片页与概念页同名」的对应检查。
const CARD_INBOX_RE = /^inbox(-[a-z0-9-]+)?\.md$/;
// 链接目标允许的库一级目录（wiki/ 一级目录按库内实际存在收集）。
const VAULT_TOP_DIRS = new Set(["raw", "clippings", "wiki"]);
const LINK_RE = /!?\[\[([^\]\n]+)\]\]/g;

// 库里的「规则文档」用 [[…]] 写模板占位符（`[[other-entity]]`、`[[concept-1]]`、
// `[[courses/course-slug]]`、`[[concepts/example]]`），这些名字本来就不指向任何文件，
// 或者存心写成旧路径当说明：查链接只会产出误报，改名脚本也照原样保留。
// 这些文件因此不参与链接检查（命名与结构检查照旧）：
// - AGENTS.md：库自己的写法规范（文件命名、frontmatter、卡片格式的例子）；
// - README.md（库根与 wiki/ 任意一层）：使用说明，示例链接是演示不是真链接；
// - wiki/prompts/：技能提示词，里面是卡片/页面模板。
const LINK_EXEMPT_FILES = new Set(["AGENTS.md", "README.md"]);
const LINK_EXEMPT_PREFIXES = ["wiki/prompts/"];

function fail(message) {
  process.stderr.write(`vault-lint: ${message}\n`);
  process.exit(1);
}

function problem(kind, path, detail) {
  return { kind, path, detail };
}

/** 名字是否合规（含 `_generated` 例外）。 */
export function checkName(segment) {
  if (NAME_EXCEPTIONS.has(segment)) return true;
  return NAME_RE.test(segment);
}

function segments(path) {
  return path.split("/").filter((part) => part !== "");
}

function stripMdSuffix(name) {
  return name.endsWith(".md") ? name.slice(0, -3) : name;
}

// 检查 wiki/ 与 clippings/ 下每个条目的末段名字。
function checkEntryName(entry, isDir, problems) {
  const first = segments(entry)[0];
  if (first !== "wiki" && first !== "clippings") return;
  const name = basename(entry);
  if (name.startsWith(".")) return;
  if (!checkName(name)) {
    problems.push(problem("name", entry, `${isDir ? "目录" : "文件"}名不合规：${name}`));
  }
}

// raw/ 只查第一、二层分区目录名（raw/<d>/ 与 raw/<d>/<d>/），不查原料文件名与更深层。
function checkRawDir(entry, isDir, problems) {
  if (!isDir) return;
  const parts = segments(entry);
  if (parts[0] !== "raw" || parts.length < 2 || parts.length > 3) return;
  const name = parts[parts.length - 1];
  if (name.startsWith(".")) return;
  if (!checkName(name)) {
    problems.push(problem("name", entry, `raw/ 分区目录名不合规：${name}`));
  }
}

// 生成物不在规定位置：wiki/ 根下的已知生成物与任何 .html，以及
// wiki/courses/ 直下旧格式的收课截图（应进 courses/<course>/snapshots/）。
function checkGenerated(entry, isDir, problems) {
  if (isDir) return;
  const parts = segments(entry);
  if (parts[0] !== "wiki") return;
  const name = parts[parts.length - 1];
  if (parts.length === 2 && (GENERATED_WIKI_FILES.has(name) || name.endsWith(".html"))) {
    problems.push(problem("generated", entry, "生成物应在 wiki/_generated/ 下"));
  }
  if (parts.length === 3 && parts[1] === "courses" && STRAY_SNAPSHOT_RE.test(name)) {
    problems.push(problem("generated", entry, "收课截图应在 wiki/courses/<course>/snapshots/ 下"));
  }
}

function checkEmptyDirs(dirs, entries, problems) {
  for (const dir of dirs) {
    const parts = segments(dir);
    if (parts[0] === "raw" && parts.length > 3) continue;
    const prefix = `${dir}/`;
    const hasChild = entries.some((entry) => entry !== `${dir}/` && entry.startsWith(prefix));
    if (!hasChild) problems.push(problem("empty-dir", dir, "空目录"));
  }
}

// 概念页没有编号；卡片页找不到同名概念页（同相对路径，flashcards ↔ concepts）。
function checkConceptCardPairs(files, problems) {
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const parts = segments(file);
    const at = parts.indexOf("concepts");
    if (at !== -1 && parts[0] === "wiki" && !NUMBERED_PAGE_RE.test(basename(file))) {
      problems.push(problem("concept-number", file, "概念页缺少三位编号"));
      continue;
    }
    const cardsAt = parts.indexOf("flashcards");
    if (cardsAt === -1 || parts[0] !== "wiki" || CARD_INBOX_RE.test(basename(file))) continue;
    const concept = [...parts.slice(0, cardsAt), "concepts", ...parts.slice(cardsAt + 1)].join("/");
    if (!files.has(concept)) {
      problems.push(problem("card-concept", file, `找不到同名概念页 ${concept}`));
    }
  }
}

/**
 * 命名与结构检查。entries 是库相对路径列表：文件形如 "wiki/index.md"，
 * 目录以 "/" 结尾（"wiki/courses/"）。返回 [{kind, path, detail}]。
 * kind：name | generated | empty-dir | concept-number | card-concept。
 */
export function lintTree(entries) {
  const problems = [];
  const dirs = new Set();
  const files = new Set();
  for (const entry of entries) {
    if (entry.endsWith("/")) dirs.add(entry.slice(0, -1));
    else files.add(entry);
  }
  for (const entry of entries) {
    const isDir = entry.endsWith("/");
    checkEntryName(entry, isDir, problems);
    checkRawDir(entry, isDir, problems);
    checkGenerated(entry, isDir, problems);
  }
  checkEmptyDirs(dirs, entries, problems);
  checkConceptCardPairs(files, problems);
  return problems;
}

/**
 * 单个 [[…]] 目标是否走了后缀解析。allowed 是允许的开头段集合
 * （wiki/ 一级目录名 ∪ wiki/ 顶层页面名 ∪ 库一级目录名）。返回 true 表示违规。
 * 不带 `/` 的裸名（`[[index]]`、`[[log]]`）本身就是完整路径，只要它在 allowed 里就不算。
 */
export function linkUsesSuffixResolution(target, allowed) {
  const base = target.split("|")[0].split("#")[0].trim().replace(/\\+$/, "");
  if (base === "" || base.startsWith(".")) return false;
  const first = base.split("/")[0];
  return !allowed.has(first);
}

/** 一段文本里所有违规链接：返回 [{target, line}]（line 从 1 起；代码里的不算）。 */
export function linkProblemsInText(text, allowed) {
  const out = [];
  const isInCode = makeCodeTest(text);
  let line = 1;
  let scanned = 0;
  for (const match of text.matchAll(LINK_RE)) {
    const offset = match.index ?? 0;
    line += countNewlines(text.slice(scanned, offset));
    scanned = offset;
    if (isInCode(offset)) continue;
    if (!linkUsesSuffixResolution(match[1], allowed)) continue;
    out.push({ target: linkTarget(match[1]), line });
  }
  return out;
}

/** [[…]] 里的目标部分（去掉显示文字、锚点与表格里的转义竖线）。 */
export function linkTarget(inner) {
  const pipeAt = inner.indexOf("|");
  const head = pipeAt === -1 ? inner : inner.slice(0, inner[pipeAt - 1] === "\\" ? pipeAt - 1 : pipeAt);
  return head.split("#")[0].trim().replace(/\\+$/, "");
}

function countNewlines(text) {
  let count = 0;
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) count += 1;
  return count;
}

/** 这个库相对路径是否属于「规则文档」（链接检查豁免）。 */
export function isLinkExemptPath(entry) {
  // README.md 按文件名豁免：库根与 wiki/ 下任何一层都是说明文档。
  return (
    LINK_EXEMPT_FILES.has(entry) ||
    basename(entry) === "README.md" ||
    LINK_EXEMPT_PREFIXES.some((prefix) => entry.startsWith(prefix))
  );
}

// ---- 代码区（代码块与行内代码）----

// Obsidian 不解析代码里的 [[…]]：库里的卡片模板、日志里的示例都写成字面量。
// 扫链接前先标出这些区域，既避免 lint 误报，也避免改名脚本把示例改掉。
const FENCE_RE = /^[ \t]{0,3}(`{3,}|~{3,})/;
const INLINE_CODE_RE = /`[^`\n]*`/g;

/** 文本里的代码区（含 ``` / ~~~ 围起来的块与行内反引号），返回 [[起, 止)] 偏移列表。 */
export function codeRanges(text) {
  const ranges = [];
  let fence = null;
  let lineStart = 0;
  for (const line of text.split("\n")) {
    const fenceMark = FENCE_RE.exec(line);
    if (fence !== null) {
      // 同一字符、长度不短于开头的围栏才算闭合；未闭合就一直算代码区。
      if (fenceMark !== null && fenceMark[1][0] === fence.char && fenceMark[1].length >= fence.length) {
        ranges.push([fence.start, lineStart + line.length]);
        fence = null;
      }
    } else if (fenceMark !== null) {
      fence = { char: fenceMark[1][0], length: fenceMark[1].length, start: lineStart };
    } else {
      for (const span of line.matchAll(INLINE_CODE_RE)) {
        ranges.push([lineStart + span.index, lineStart + span.index + span[0].length]);
      }
    }
    lineStart += line.length + 1;
  }
  if (fence !== null) ranges.push([fence.start, text.length]);
  return ranges;
}

/** 给定文本，返回 `isInCode(offset)`，用来跳过代码里的 [[…]]。 */
export function makeCodeTest(text) {
  const ranges = codeRanges(text);
  return (offset) => ranges.some(([start, end]) => offset >= start && offset < end);
}

// ---- 库扫描 ----

// 递归收集库相对路径：目录以 "/" 结尾；跳过 . 开头的目录（.jj、.obsidian 等）。
export async function collectEntries(vault) {
  const out = [];
  async function walk(dir, rel) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const r = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        out.push(`${r}/`);
        await walk(join(dir, entry.name), r);
      } else {
        out.push(r);
      }
    }
  }
  await walk(vault, "");
  return out;
}

// 查链接的文本：wiki/ 下的 .md + 库根的 .md（AGENTS.md、README.md 等）；
// raw/ 是只读原料，里面的 [[…]] 来自外部文档，不查。
// 规则文档（AGENTS.md、wiki/prompts/）是模板占位符，跳过。
function linkCheckedFiles(entries) {
  return entries.filter(
    (entry) =>
      !entry.endsWith("/") &&
      entry.endsWith(".md") &&
      (entry.startsWith("wiki/") || !entry.includes("/")) &&
      !isLinkExemptPath(entry),
  );
}

// 链接检查允许的开头段：库内实际存在的 wiki/ 一级目录 + 库一级目录，
// 再加上 wiki/ 下的顶层页面名（去 .md）——`[[index]]`、`[[subjects]]`、`[[log]]`、
// `[[profile]]` 指的就是 wiki/index.md 等，已经是完整路径，不是后缀解析。
export function allowedLinkRoots(entries) {
  const allowed = new Set(VAULT_TOP_DIRS);
  for (const entry of entries) {
    const parts = segments(entry);
    if (parts[0] !== "wiki") continue;
    if (entry.endsWith("/")) {
      if (parts.length >= 2) allowed.add(parts[1]);
      continue;
    }
    // wiki/ 顶层文件：只要一层（wiki/index.md），加进去扩展名的名字。
    if (parts.length === 2 && entry.endsWith(".md")) allowed.add(stripMdSuffix(parts[1]));
  }
  return allowed;
}

// 读哪些文件查链接：见 linkCheckedFiles。
export async function lintLinks(vault, entries, allowed) {
  const problems = [];
  for (const entry of linkCheckedFiles(entries)) {
    const text = await readFile(join(vault, entry), "utf8").catch(() => null);
    if (text === null) continue;
    for (const hit of linkProblemsInText(text, allowed)) {
      problems.push(problem("link", entry, `链接走了后缀解析：[[${hit.target}]]（第 ${hit.line} 行）`));
    }
  }
  return problems;
}

function usage() {
  return [
    "库命名检查（vault-lint）",
    "",
    "用法：node vault-lint.mjs <vault> [--json]",
    "",
    "按 VAULT-NAMING.md 检查 wiki/、clippings/ 下所有文件与目录名，",
    "raw/ 第一、二层分区目录名；另查生成物位置、空目录、概念页编号、卡片页与概念页",
    "同名对应、[[…]] 链接是否走了 Obsidian 后缀解析。有问题退出码 1，没有 0。",
  ].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const json = args.includes("--json");
  const vault = resolve(args.find((arg) => !arg.startsWith("--")) ?? fail("需要 vault 路径"));
  if (!existsSync(vault)) fail(`库不存在：${vault}`);
  const entries = await collectEntries(vault);
  const problems = lintTree(entries);
  problems.push(...(await lintLinks(vault, entries, allowedLinkRoots(entries))));
  if (json) {
    process.stdout.write(`${JSON.stringify({ problems }, null, 2)}\n`);
  } else if (problems.length === 0) {
    process.stdout.write("vault-lint: OK（无问题）\n");
  } else {
    for (const item of problems) process.stdout.write(`${item.path}: [${item.kind}] ${item.detail}\n`);
    process.stdout.write(`vault-lint: ${problems.length} 个问题\n`);
  }
  process.exit(problems.length === 0 ? 0 : 1);
}

// 只有直接运行时才进入 CLI；rename-vault.mjs 与测试 import 纯函数不触发 main。
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
