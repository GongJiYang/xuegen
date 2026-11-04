#!/usr/bin/env node
// Xuegen 闪卡统计与新增：扫描 wiki/flashcards/ 的 Obsidian_to_Anki 卡片块，并追加新卡。
// 无第三方依赖。<vault> 为 Wiki 库根目录（含 wiki/ 子目录）。
//   node flashcards.mjs stats <vault> [--json]
//   node flashcards.mjs add <vault> --deck <deck> --front <text> --back <text> [--json]
// 只写 wiki/flashcards/ 下牌组的 inbox.md；其他位置只读。
import { readFile, writeFile, readdir, rename, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname, basename, sep } from "node:path";

const START_RE = /^START\s*$/;
const END_RE = /^END\s*$/;
const ID_RE = /<!--ID:\s*\d+-->/;

function fail(message) {
  process.stderr.write(`flashcards: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const body = token.slice(2);
    if (body.includes("=")) {
      const eq = body.indexOf("=");
      options[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      options[body] = true;
    } else {
      options[body] = next;
      i += 1;
    }
  }
  return { positional, options };
}

function wikiDir(vault) {
  return join(vault, "wiki");
}

function requireVault(vault) {
  const dir = wikiDir(vault);
  if (!existsSync(dir)) fail(`不是 Wiki 库根目录：${vault}（缺少 wiki/ 子目录）`);
  return dir;
}

async function writeAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, file);
}

/** 递归收集目录下所有 .md 文件的绝对路径。 */
async function walkMarkdown(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkMarkdown(full)));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/**
 * 解析一个闪卡文件：当前牌组、卡片块数量、已同步块数量。
 *
 * 卡片 = START…END 块；已同步 = 块内或紧随其后（允许空行）有 `<!--ID: 数字-->`。
 * 牌组取文件中最近一次 `TARGET DECK` 的下一行（非空）。
 */
function parseFlashcardFile(text) {
  const lines = text.split("\n");
  let deck = "";
  let total = 0;
  let synced = 0;
  let inBlock = false;
  let blockHasId = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (START_RE.test(line.trim())) {
      inBlock = true;
      blockHasId = false;
      continue;
    }
    if (inBlock && END_RE.test(line.trim())) {
      // 块内或块后（跳过空行）出现 ID 即视为已同步。
      const after = nextNonEmpty(lines, i + 1);
      synced += blockHasId || (after !== null && ID_RE.test(after)) ? 1 : 0;
      total += 1;
      inBlock = false;
      continue;
    }
    if (inBlock) {
      if (ID_RE.test(line)) blockHasId = true;
      continue;
    }
    if (line.trim() === "TARGET DECK") {
      const value = nextNonEmpty(lines, i + 1);
      deck = value === null ? "" : value.trim();
    }
  }
  return { deck, total, synced };
}

function nextNonEmpty(lines, from) {
  for (let i = from; i < lines.length; i += 1) {
    if (lines[i].trim() !== "") return lines[i];
  }
  return null;
}

/** 摘录页 frontmatter `cards: pending` 计数。 */
function isPendingExtract(text) {
  const lines = text.split("\n");
  if (lines[0] !== "---") return false;
  const end = lines.indexOf("---", 1);
  if (end === -1) return false;
  return lines.slice(1, end).some((line) => /^\s*cards:\s*pending\s*$/.test(line));
}

async function commandStats(vault, options) {
  const files = await walkMarkdown(join(wikiDir(vault), "flashcards"));
  const decks = new Map();
  let total = 0;
  let synced = 0;
  for (const file of files) {
    const parsed = parseFlashcardFile(await readFile(file, "utf8"));
    if (parsed.total === 0) continue;
    total += parsed.total;
    synced += parsed.synced;
    const key = parsed.deck || "(未指定牌组)";
    // 每个牌组输出 `unsynced`（与 data-protocol.ts 的 CardsStats 一致，见 batch-f1 §1.3）。
    const entry = decks.get(key) ?? { deck: key, total: 0, unsynced: 0, files: [] };
    entry.total += parsed.total;
    entry.unsynced += parsed.total - parsed.synced;
    entry.files.push(relativeToVault(vault, file));
    decks.set(key, entry);
  }
  const extractFiles = await walkMarkdown(join(wikiDir(vault), "extracts"));
  let pendingExtracts = 0;
  for (const file of extractFiles) {
    if (isPendingExtract(await readFile(file, "utf8"))) pendingExtracts += 1;
  }
  const result = {
    total,
    unsynced: total - synced,
    decks: [...decks.values()].sort((a, b) => (a.deck < b.deck ? -1 : 1)),
    pendingExtracts,
  };
  output(options, result, () => {
    const lines = [`卡片 ${total}｜待同步 ${total - synced}｜待制卡摘录 ${pendingExtracts}`];
    for (const deck of result.decks) {
      lines.push(`${deck.deck}｜${deck.total}（待同步 ${deck.unsynced}）｜${deck.files.length} 个文件`);
    }
    return lines.join("\n");
  });
}

function relativeToVault(vault, file) {
  const prefix = `${resolve(vault)}/`;
  const full = resolve(file);
  return full.startsWith(prefix) ? full.slice(prefix.length) : full;
}

/** 校验文本：非空且不含独立成行的 END。 */
function validateText(kind, text) {
  if (typeof text !== "string" || text.trim() === "") fail(`${kind}不能为空`);
  const bad = text.split("\n").some((line) => END_RE.test(line.trim()));
  if (bad) fail(`${kind}不能包含独立成行的 END`);
  return text.replace(/\s+$/, "");
}

/**
 * 新卡写到哪个文件。一个文件只能有一个 `TARGET DECK`，所以每个牌组用自己的收件箱：
 * - 牌组已有卡片：放在该牌组卡片所在目录的 `inbox.md`；若那个 `inbox.md` 已属于同目录的另一个牌组
 *   （如 `Link` 与 `Link::符号处理` 同在 `link/`），改用 `inbox-<牌组安全名>.md`，不混进同一文件；
 * - 牌组尚未存在：`flashcards/<牌组安全名>/inbox.md`。
 * 返回路径一定在 `wiki/flashcards/` 内。
 */
async function deckInboxPath(vault, deck) {
  const base = join(wikiDir(vault), "flashcards");
  const safe = safeDeckName(deck);
  let target = join(base, safe, "inbox.md");
  for (const file of await walkMarkdown(base)) {
    const parsed = parseFlashcardFile(await readFile(file, "utf8"));
    if (parsed.deck !== deck) continue;
    const dir = dirname(file);
    const legacy = join(dir, "inbox.md");
    const legacyDeck = existsSync(legacy) ? parseFlashcardFile(await readFile(legacy, "utf8")).deck : null;
    target = legacyDeck === null || legacyDeck === deck ? legacy : join(dir, `inbox-${safe}.md`);
    break;
  }
  const root = `${resolve(base)}${sep}`;
  if (!resolve(target).startsWith(root)) fail(`牌组名不合法：${deck}`);
  return target;
}

/** 牌组名 → 目录/文件名：`::` 变 `-`，只保留字母、数字、中文、连字符与下划线。 */
function safeDeckName(deck) {
  const name = deck
    .replace(/::/g, "-")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return name || "deck";
}

async function commandAdd(vault, options) {
  const deck = typeof options.deck === "string" ? options.deck.trim() : "";
  if (!deck) fail("add 需要 --deck");
  const front = validateText("正面（--front）", options.front);
  const back = validateText("背面（--back）", options.back);

  const file = await deckInboxPath(vault, deck);
  await mkdir(dirname(file), { recursive: true });
  const existing = existsSync(file) ? await readFile(file, "utf8") : "";
  const prefix = existing === "" ? `# ${deck} 收件箱\n\nTARGET DECK\n${deck}\n\n` : ensureTrailingBlank(existing);
  const block = `START\nBasic\n${front}\nBack: ${back}\nEND\n`;
  await writeAtomic(file, `${prefix}${block}`);
  output(options, { file, deck }, `add: ${deck} → ${file}`);
}

/** 保证已有内容后有一个空行再接新块。 */
function ensureTrailingBlank(text) {
  return `${text.replace(/\s+$/, "")}\n\n`;
}

function output(options, data, render) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(data)}\n`);
    return;
  }
  process.stdout.write(`${typeof render === "function" ? render() : render}\n`);
}

function usage() {
  return [
    "Xuegen 闪卡统计与新增（flashcards）",
    "",
    "用法：",
    "  node flashcards.mjs stats <vault> [--json]",
    "  node flashcards.mjs add <vault> --deck <deck> --front <text> --back <text> [--json]",
    "",
    "<vault> 为 Wiki 库根目录（须含 wiki/ 子目录）。",
    "stats：卡片 = wiki/flashcards/ 下的 START…END 块；已同步 = 块内或块后有 <!--ID: 数字-->。",
    "add：按 flashcard-rules.md 的 Basic 格式追加到该牌组 inbox.md，只写 wiki/flashcards/。",
  ].join("\n");
}

async function main() {
  const raw = process.argv.slice(2);
  if (raw.length === 0 || raw[0] === "--help" || raw[0] === "-h") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const command = raw[0];
  const { positional, options } = parseArgs(raw.slice(1));
  if (command === "stats") {
    const vault = resolve(positional[0] ?? fail("stats 需要 vault 路径"));
    requireVault(vault);
    await commandStats(vault, options);
  } else if (command === "add") {
    const vault = resolve(positional[0] ?? fail("add 需要 vault 路径"));
    requireVault(vault);
    await commandAdd(vault, options);
  } else {
    fail(`未知命令：${command}`);
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});

export { parseFlashcardFile, isPendingExtract };
