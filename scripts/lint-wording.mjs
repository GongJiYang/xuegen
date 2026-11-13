#!/usr/bin/env node
/**
 * lint-wording — 用词闸门。
 *
 * 词表来自 `docs/desktop/SKIN-LEDGER.md` 第三节「不要用」那一列，机器可读的副本在
 * `scripts/wording-rules.json`（改词表时两处一起改）。只扫用户看得见的文字：
 *
 *   1. `apps/desktop/src/renderer/**\/*.{ts,tsx}`（跳过 `*.test.*`）：字符串字面量、
 *      模板字面量与 JSX 文本节点；注释不算。
 *   2. `skills/**\/*.mjs`（跳过 `*.test.mjs`）：字符串与模板字面量；脚本给模型看的
 *      错误信息常被原样转述给用户，所以同样算。
 *   3. `skills/*\/SKILL.md` 与 `skills/*\/references/*.md`：只算 ```` ```text ```` 代码块
 *      里的行，以及「告诉用户」「对用户说」「回复」「说一句」所在行里「」引号中的文字。
 *
 * 用法：node scripts/lint-wording.mjs [--json] [--root <dir>] [--rules <file>]
 * 有命中时退出码 1。
 *
 * 已知局限（有意的取舍，不做完整解析）：
 *
 * - 提取靠一个小状态机：`'…'`、`"…"`、`` `…` ``（含 `${}` 嵌套，嵌套里还能再出现
 *   字符串与模板字面量）、`//` 与 `/* *\/` 注释。不是词法分析器，不认正则字面量：
 *   正则里的带引号文本会被当成字符串（内容可见），正则里的中文会漏掉。
 * - JSX 文本节点用 `>` 与 `<` 之间的窗口近似（只在 `.tsx` 里开）：窗口内不会有
 *   `>`/`<`，嵌套元素里的文字被分成多段分别检查，效果一样。副作用是同一段文字
 *   可能被字符串与 JSX 文本两条路各取一次——`findBanned` 按行与词去重，不重复报。
 * - JSX 文本里的 ASCII 单双引号或反引号会让状态机误以为字符串开始，直到行尾
 *   （中文文案里极少见）：那半行可能漏报，不会误报。
 * - 一行里同一个词出现两次只报一处；同行相邻的长词优先（`教材通读` 盖住 `通读`）。
 * - 判断「用户看得见」是保守的：`strings.ts` 之外的散落中文、面板里拼出来的句子都
 *   照扫，是否内部用靠 `allow` 白名单说明。
 * - markdown 只看 ```text 块与触发词所在行的「」引号；散文里的词不报（文档不是
 *   界面，词表本身就在这里）。
 */

import { readFile, readdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RULES_PATH = join(HERE, "wording-rules.json");

/** Lines whose 「」-quoted text is spoken to the user, in skill markdown. */
const SPEECH_MARKERS = ["告诉用户", "对用户说", "回复", "说一句"];

/** Repo-relative, posix separators, so `allow` entries are portable. */
function toPosix(path) {
  return path.split(sep).join("/");
}

function parseArgs(argv) {
  const options = { json: false, root: null, rules: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--json") options.json = true;
    else if (token === "--root") options.root = argv[++i] ?? null;
    else if (token === "--rules") options.rules = argv[++i] ?? null;
    else throw new Error(`未知选项：${token}`);
  }
  return options;
}

// ---------------------------------------------------------------------------
// 规则
// ---------------------------------------------------------------------------

/** Read and shape-check the rules file. Missing fields are treated as empty. */
export function normalizeRules(raw) {
  const banned = Array.isArray(raw?.banned) ? raw.banned : [];
  const allow = Array.isArray(raw?.allow) ? raw.allow : [];
  return {
    banned: banned
      .filter((entry) => typeof entry?.word === "string" && entry.word !== "")
      .map((entry) => ({ word: entry.word, say: typeof entry.say === "string" ? entry.say : "" })),
    allow: allow
      .filter((entry) => typeof entry?.file === "string" && typeof entry?.word === "string")
      .map((entry) => ({ file: toPosix(entry.file), word: entry.word, why: entry.why ?? "" })),
  };
}

/** Words this file is allowed to use internally. `options.extraAllow` adds more. */
function allowedWords(rules, file, extraAllow) {
  const allowed = new Set(extraAllow ?? []);
  if (typeof file === "string") {
    const key = toPosix(file);
    for (const entry of rules.allow ?? []) {
      if (toPosix(entry.file) === key) allowed.add(entry.word);
    }
  }
  return allowed;
}

// ---------------------------------------------------------------------------
// findBanned：纯函数
// ---------------------------------------------------------------------------

/**
 * Banned words in `text`, one entry per (line, word) — `[{ line, word, say }]`
 * sorted by line and then by where the word starts. Overlapping matches keep the
 * longest word (「教材通读」 wins over 「通读」), so a line reads as one finding.
 *
 * `options.file` (repo-relative) applies that file's `allow` entries.
 */
export function findBanned(text, rules, options = {}) {
  const banned = (rules?.banned ?? []).filter((entry) => typeof entry?.word === "string" && entry.word !== "");
  const allowed = allowedWords(normalizeRules(rules ?? {}), options.file, options.allowWords);
  const hits = [];
  const lines = String(text ?? "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const matches = [];
    for (const entry of banned) {
      if (allowed.has(entry.word)) continue;
      let from = 0;
      for (;;) {
        const at = line.indexOf(entry.word, from);
        if (at === -1) break;
        matches.push({ start: at, end: at + entry.word.length, word: entry.word, say: entry.say ?? "" });
        from = at + entry.word.length;
      }
    }
    // Longest match wins, so 「教材通读」 is not reported twice (它含「通读」).
    matches.sort((a, b) => a.start - b.start || b.end - a.end);
    let cursor = -1;
    const seen = new Set();
    for (const match of matches) {
      // One finding per line and word: the report points at the line, and a word
      // repeated in one line is one thing to fix.
      if (match.start < cursor || seen.has(match.word)) continue;
      cursor = match.end;
      seen.add(match.word);
      hits.push({ line: index + 1, word: match.word, say: match.say, column: match.start + 1 });
    }
  }
  return hits.map(({ line, word, say }) => ({ line, word, say }));
}

// ---------------------------------------------------------------------------
// 字面量提取
// ---------------------------------------------------------------------------

/**
 * The user-visible text of a JS/TS source, as a string of the same shape (every
 * non-visible character replaced by a space, newlines kept), so line numbers in
 * the result match the source.
 *
 * Visible: string literals, template literals (the `${}` code inside them is
 * not), and — with `jsx` — JSX text nodes. Comments are not, JSX comments
 * (a comment inside braces in JSX) included.
 */
export function extractVisibleText(source, options = {}) {
  const { jsx = false } = options;
  const text = String(source ?? "");
  const visible = new Uint8Array(text.length);
  // The same pass also records which characters belong to code (not string, not
  // comment); the JSX-text pass runs over that skeleton.
  const code = new Uint8Array(text.length);

  const stack = [{ mode: "code", depth: 0 }];
  const top = () => stack[stack.length - 1];
  let i = 0;
  const n = text.length;
  // Comment bodies: never visible, and the JSX-text pass below must not fill them
  // back in (`{/* 辅助 */}` looks like text between `>` and `<` otherwise).
  const commented = new Uint8Array(text.length);
  const markComment = (from, to) => {
    for (let k = from; k < to && k < n; k += 1) commented[k] = 1;
  };
  const markVisible = (from, to) => {
    for (let k = from; k < to && k < n; k += 1) if (text[k] !== "\r") visible[k] = 1;
  };

  while (i < n) {
    const frame = top();
    const ch = text[i];
    const next = text[i + 1];

    if (frame.mode === "line") {
      markComment(i, i + 1);
      if (ch === "\n") stack.pop();
      i += 1;
      continue;
    }

    if (frame.mode === "block") {
      if (ch === "*" && next === "/") {
        markComment(i, i + 2);
        stack.pop();
        i += 2;
      } else {
        markComment(i, i + 1);
        i += 1;
      }
      continue;
    }

    if (frame.mode === "sq" || frame.mode === "dq") {
      const quote = frame.mode === "sq" ? "'" : '"';
      if (ch === "\\") {
        markVisible(i, i + 2);
        i += 2;
      } else if (ch === quote) {
        stack.pop();
        i += 1;
      } else if (ch === "\n") {
        // 未闭合的字符串（或 JSX 文本里的撇号）：到行尾收手，别吞掉整个文件。
        stack.pop();
        i += 1;
      } else {
        markVisible(i, i + 1);
        i += 1;
      }
      continue;
    }

    if (frame.mode === "template") {
      if (ch === "\\") {
        markVisible(i, i + 2);
        i += 2;
      } else if (ch === "`") {
        stack.pop();
        i += 1;
      } else if (ch === "$" && next === "{") {
        stack.push({ mode: "code", depth: 1 });
        i += 2;
      } else {
        markVisible(i, i + 1);
        i += 1;
      }
      continue;
    }

    // code
    if (ch === "/" && next === "/") {
      markComment(i, i + 2);
      stack.push({ mode: "line" });
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      markComment(i, i + 2);
      stack.push({ mode: "block" });
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      stack.push({ mode: ch === "'" ? "sq" : "dq" });
      i += 1;
      continue;
    }
    if (ch === "`") {
      stack.push({ mode: "template" });
      i += 1;
      continue;
    }
    if (frame.depth > 0) {
      // Only interpolation frames count braces; a plain code frame ignores them,
      // so an unbalanced `{` in JSX text cannot eat the rest of the file.
      if (ch === "{") frame.depth += 1;
      else if (ch === "}") {
        frame.depth -= 1;
        if (frame.depth === 0) {
          stack.pop();
          i += 1;
          continue;
        }
      }
    }
    code[i] = 1;
    i += 1;
  }

  const out = [];
  for (let k = 0; k < n; k += 1) out.push(visible[k] === 1 ? text[k] : text[k] === "\n" ? "\n" : " ");

  if (jsx) {
    // JSX text sits between a tag's `>` and the next `<`. Strings inside `{}` are
    // already visible, code has no Chinese of its own, and comments are blocked,
    // so a window can only contribute real JSX text.
    const skeleton = [];
    for (let k = 0; k < n; k += 1) skeleton.push(code[k] === 1 ? text[k] : text[k] === "\n" ? "\n" : " ");
    const joined = skeleton.join("");
    const window = />([^<>]*)</g;
    let match;
    while ((match = window.exec(joined)) !== null) {
      const start = match.index + 1;
      const end = start + match[1].length;
      for (let k = start; k < end; k += 1) if (out[k] === " " && commented[k] === 0) out[k] = text[k];
    }
  }

  return out.join("");
}

/**
 * The user-visible text of a skill markdown file: lines inside ```text fences,
 * plus 「」-quoted text on lines that talk about what to tell the user.
 */
export function extractMarkdownVisibleText(source) {
  const text = String(source ?? "");
  const visible = new Uint8Array(text.length);
  const markVisible = (from, to) => {
    for (let k = from; k < to && k < text.length; k += 1) if (text[k] !== "\r") visible[k] = 1;
  };

  let offset = 0;
  let inFence = false;
  let fenceIsText = false;
  for (const raw of text.split("\n")) {
    const start = offset;
    const end = start + raw.length;
    offset = end + 1;

    const fence = /^\s*```(.*)$/.exec(raw);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceIsText = fence[1].trim().toLowerCase() === "text";
      } else {
        inFence = false;
        fenceIsText = false;
      }
      continue;
    }

    if (inFence) {
      if (fenceIsText) markVisible(start, end);
      continue;
    }

    if (!SPEECH_MARKERS.some((marker) => raw.includes(marker))) continue;
    for (const quoted of raw.matchAll(/「([^」]*)」/g)) {
      const quotedStart = start + quoted.index + 1;
      markVisible(quotedStart, quotedStart + quoted[1].length);
    }
  }

  const out = [];
  for (let k = 0; k < text.length; k += 1) out.push(visible[k] === 1 ? text[k] : text[k] === "\n" ? "\n" : " ");
  return out.join("");
}

// ---------------------------------------------------------------------------
// 文件收集与检查
// ---------------------------------------------------------------------------

const isTestFile = (name) => /\.test\.[cm]?[jt]sx?$/.test(name) || name.includes(".test.");

async function walk(dir, accept, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      await walk(full, accept, out);
    } else if (entry.isFile() && accept(full, entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every file the gate reads, in a stable order. */
export async function collectTargets(root) {
  const targets = [];

  const renderer = join(root, "apps", "desktop", "src", "renderer");
  for (const file of await walk(renderer, (_full, name) => /\.tsx?$/.test(name) && !isTestFile(name), [])) {
    targets.push({ file, kind: file.endsWith(".tsx") ? "jsx" : "js" });
  }

  const skills = join(root, "skills");
  for (const file of await walk(skills, (_full, name) => name.endsWith(".mjs") && !isTestFile(name), [])) {
    targets.push({ file, kind: "js" });
  }

  const skillDirNames = [];
  try {
    for (const entry of await readdir(skills, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) skillDirNames.push(entry.name);
    }
  } catch {
    // 没有 skills/ 目录（例如对临时根跑）就当没有技能文档。
  }
  for (const name of skillDirNames.sort()) {
    targets.push({ file: join(skills, name, "SKILL.md"), kind: "md", optional: true });
    for (const file of await walk(join(skills, name, "references"), (_full, file_) => file_.endsWith(".md"), [])) {
      targets.push({ file, kind: "md" });
    }
  }

  return targets;
}

/** Visible text of one file, per its kind. */
export function visibleTextOf(kind, source) {
  if (kind === "md") return extractMarkdownVisibleText(source);
  return extractVisibleText(source, { jsx: kind === "jsx" });
}

/** Scan one file's source. Exported for tests. */
export function lintSource(kind, source, rules, file) {
  const text = visibleTextOf(kind, source);
  return findBanned(text, rules, { file }).map((hit) => ({
    ...hit,
    text: (text.split(/\r?\n/)[hit.line - 1] ?? "").trim().slice(0, 120),
  }));
}

/** Scan the whole tree. */
export async function lintTree(root, rules) {
  const results = [];
  for (const target of await collectTargets(root)) {
    let source;
    try {
      source = await readFile(target.file, "utf8");
    } catch (error) {
      if (target.optional) continue;
      throw error;
    }
    const file = toPosix(relative(root, target.file));
    const hits = lintSource(target.kind, source, rules, file);
    if (hits.length > 0) results.push({ file, hits });
  }
  results.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return results;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function report(results) {
  const lines = [];
  let total = 0;
  for (const { file, hits } of results) {
    for (const hit of hits) {
      total += 1;
      lines.push(`${file}:${hit.line}  「${hit.word}」→ 用「${hit.say}」`);
    }
    lines.push("");
  }
  lines.push(`lint-wording: ${total} 处`);
  return { text: `${lines.join("\n")}\n`, total };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = options.root ? resolve(options.root) : ROOT;
  const rulesPath = options.rules ? resolve(options.rules) : RULES_PATH;
  const rules = normalizeRules(JSON.parse(await readFile(rulesPath, "utf8")));
  const results = await lintTree(root, rules);
  const { text, total } = report(results);

  if (options.json) {
    const payload = { root: toPosix(root), total, files: results };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(text);
  }
  process.exit(total > 0 ? 1 : 0);
}

// Compare real paths, not literals: a call through a symlink (~/.xuegen/app, /tmp →
// /private/tmp) must still run the CLI (see scripts/lint-skills.mjs).
function isMain() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
}

if (isMain()) {
  main().catch((error) => {
    process.stderr.write(`lint-wording: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
