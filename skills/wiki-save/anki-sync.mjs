#!/usr/bin/env node
// Xuegen 卡片直连 AnkiConnect：把 <知识目录>/flashcards/ 里没有 <!--ID:--> 的卡片块写进 Anki，
// 并在块内 END 前回填 ID（Obsidian_to_Anki 以后再扫会因已有 ID 跳过，格式保持兼容）。
// 无第三方依赖（AnkiConnect 用全局 fetch）。<vault> 为 Wiki 库根目录（含 wiki/ 子目录）；
// 知识目录 = wiki/knowledge（与 flashcards.mjs 同一约定）。
//   node anki-sync.mjs push <vault> [--dry-run] [--json] [--url http://127.0.0.1:8765]
// 沙盒内直连 127.0.0.1:8765 会被 seatbelt 拦下（NO_PROXY 含 127.0.0.1，只有代理端口被放行），
// 所以进程里有 HTTP_PROXY / http_proxy 且目标是本机地址时，不用 fetch，改经代理发
// HTTP 正向代理的绝对 URL POST（见 postViaProxy）；没有代理变量时照旧直连。
import { request as httpRequest } from "node:http";
import { readFile, writeFile, readdir, rename } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const START_RE = /^START\s*$/;
const END_RE = /^END\s*$/;
const ID_RE = /<!--ID:\s*(\d+)\s*-->/;
const BACK_RE = /^Back:\s*/;
// 页头关键字：`TARGET DECK` / `FILE TAGS` 的取值不能是这些行本身。
const CONTROL_LINES = new Set(["TARGET DECK", "FILE TAGS", "START", "END"]);
const DEFAULT_URL = "http://127.0.0.1:8765";
const ANKI_TIMEOUT_MS = 10_000;
// 牌组以此前缀开头时，把它们设到预设「书房」上（该预设挂在同名牌组下）。
const STUDY_PREFIX = "书房::";
const STUDY_PRESET_DECK = "书房";

function fail(message) {
  process.stderr.write(`anki-sync: ${message}\n`);
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

// 知识目录：wiki/knowledge。
function knowledgeDir(vault) {
  return join(wikiDir(vault), "knowledge");
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

/** 跳过空行后的下一行，但停在后栅关键字上（避免把 `FILE TAGS` 当成牌组名）。 */
function nextValueLine(lines, from) {
  for (let i = from; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "") continue;
    if (CONTROL_LINES.has(line.trim())) return null;
    return line;
  }
  return null;
}

function nextNonEmpty(lines, from) {
  for (let i = from; i < lines.length; i += 1) {
    if (lines[i].trim() !== "") return lines[i];
  }
  return null;
}

/**
 * 解析一个卡片页：整页一个牌组（`TARGET DECK` 下一非空行，没有则 "Default"）、
 * 可选 `FILE TAGS`（下一非空行，空格分隔），以及全部 START…END 块。
 *
 * 每块：type 为 START 下一行的笔记类型名；front 为类型行之后到 `Back:` 行之前；
 * back 为 `Back:` 行去前缀后到块内 `<!--ID` 行或 END 之前（无 `Back:` 行时为 null）；
 * id 为块内或紧随 END 后（允许空行）的 `<!--ID: 数字-->`，没有为 null。
 * start/end 是 START、END 所在行号（0 起）。忽略 STARTI/ENDI、DELETE、FROZEN。
 */
export function parseCardPage(text) {
  const lines = text.split("\n");
  let deck = "Default";
  let tags = [];
  const blocks = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "TARGET DECK") {
      const value = nextValueLine(lines, i + 1);
      if (value !== null) deck = value.trim();
      continue;
    }
    if (line.trim() === "FILE TAGS") {
      const value = nextValueLine(lines, i + 1);
      if (value !== null) tags = value.trim().split(/\s+/);
      continue;
    }
    if (!START_RE.test(line.trim())) continue;

    const end = lines.findIndex((later, j) => j > i && END_RE.test(later.trim()));
    if (end === -1) break;
    const inner = lines.slice(i + 1, end);
    const idInBlock = inner.find((l) => ID_RE.test(l));
    const after = nextNonEmpty(lines, end + 1);
    const idLine = idInBlock ?? (after !== null && ID_RE.test(after) ? after : undefined);
    const id = idLine === undefined ? null : idLine.match(ID_RE)[1];

    const type = inner.length > 0 ? inner[0].trim() : "";
    const backLineAt = inner.findIndex((l) => BACK_RE.test(l));
    const idLineAt = inner.findIndex((l) => ID_RE.test(l));
    const frontEnd = backLineAt === -1 ? (idLineAt === -1 ? inner.length : idLineAt) : backLineAt;
    const front = inner.slice(1, frontEnd).join("\n").trim();
    let back = null;
    if (backLineAt !== -1) {
      const rest = [inner[backLineAt].replace(BACK_RE, "")];
      const backEnd = idLineAt === -1 || idLineAt < backLineAt ? inner.length : idLineAt;
      rest.push(...inner.slice(backLineAt + 1, backEnd));
      back = rest.join("\n").trim();
    }
    blocks.push({ start: i, end, type, front, back, id });
    i = end;
  }
  return { deck, tags, blocks };
}

/**
 * 卡片正反面 → Anki 字段 HTML（最小转换）：
 * `$$…$$` → `\[…\]`，`$…$` → `\(…\)`，`**x**` → `<b>x</b>`，换行 → `<br>`，其余原样。
 */
export function toAnkiHtml(text) {
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, "\\[$1\\]")
    .replace(/\$([^$\n]+?)\$/g, "\\($1\\)")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\n/g, "<br>");
}

/**
 * 在指定块的 END 前各插一行 `<!--ID: <id>-->`，返回新文本（不改动其他行）。
 * 已有 ID 的块跳过（重复插入会留下两个 ID，插件以后扫会当成两张卡）。
 * 同一页多块时按块各自的 END 行号定位，夹在中间的已同步块不受影响。
 */
export function insertIds(text, pairs) {
  const lines = text.split("\n");
  const { blocks } = parseCardPage(text);
  const inserts = new Map();
  for (const { blockIndex, id } of pairs) {
    const block = blocks[blockIndex];
    if (block === undefined || block.id !== null) continue;
    const list = inserts.get(block.end) ?? [];
    list.push(id);
    inserts.set(block.end, list);
  }
  if (inserts.size === 0) return text;
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (inserts.has(i)) for (const id of inserts.get(i)) out.push(`<!--ID: ${id}-->`);
    out.push(lines[i]);
  }
  return out.join("\n");
}

/**
 * 经 HTTP 正向代理发一个 POST：请求行是完整目标 URL，Host 头写目标主机。
 * signal 与 fetch 的同款：abort 时底层 request 被销毁、Promise 以 AbortError 拒绝。
 */
function postViaProxy(proxyUrl, targetUrl, bodyText, signal) {
  return new Promise((resolvePromise, rejectPromise) => {
    const proxy = new URL(proxyUrl);
    const target = new URL(targetUrl);
    const headers = {
      Host: target.host,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(bodyText),
    };
    // 沙盒代理按 URL 里的凭据认连接（user 还编码了命令 id，放行清单靠它匹配）。
    if (proxy.username !== "" || proxy.password !== "") {
      headers["Proxy-Authorization"] =
        `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}`;
    }
    const req = httpRequest(
      {
        host: proxy.hostname,
        port: proxy.port,
        method: "POST",
        path: targetUrl,
        headers,
        signal,
      },
      (response) => {
        let data = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => resolvePromise({ status: response.statusCode, body: data }));
      },
    );
    req.on("error", rejectPromise);
    req.write(bodyText);
    req.end();
  });
}

/**
 * AnkiConnect 单次调用：超时或 error 字段都抛错。
 * 有 HTTP_PROXY 且目标是本机地址时经代理发（沙盒里直连本机端口被拦，见文件头）；
 * 否则照旧 fetch。两条分支的语义一致：abort 拒绝、响应 JSON 的 error 字段抛错。
 */
async function invoke(url, action, params = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANKI_TIMEOUT_MS);
  const bodyText = JSON.stringify({ action, params, version: 6 });
  try {
    const proxy = process.env.HTTP_PROXY ?? process.env.http_proxy;
    const local = url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost");
    const body =
      proxy && local
        ? JSON.parse((await postViaProxy(proxy, url, bodyText, controller.signal)).body)
        : await (
            await fetch(url, { method: "POST", body: bodyText, signal: controller.signal })
          ).json();
    if (body.error) throw new Error(String(body.error));
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

function short(text) {
  const flat = String(text).replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
}

function relativeToVault(vault, file) {
  const prefix = `${resolve(vault)}/`;
  const full = resolve(file);
  return full.startsWith(prefix) ? full.slice(prefix.length) : full;
}

/** 卡片页 → 待处理项分类：Basic 且没缺正/背面的进 pending，其余进 skipped/failed。 */
function classifyPage(file, parsed) {
  const pending = [];
  const skipped = [];
  const failed = [];
  parsed.blocks.forEach((block, index) => {
    if (block.id !== null) return;
    const ref = { file, block: index + 1, deck: parsed.deck, front: short(block.front) };
    if (block.type !== "Basic") {
      skipped.push({ ...ref, type: block.type });
      return;
    }
    if (block.front === "") {
      failed.push({ ...ref, error: "正面为空" });
      return;
    }
    if (block.back === null) {
      failed.push({ ...ref, error: "缺少 Back: 行" });
      return;
    }
    if (block.back === "") {
      failed.push({ ...ref, error: "背面为空" });
      return;
    }
    pending.push({ index, ...ref });
  });
  return { pending, skipped, failed };
}

/**
 * 给书房牌组设预设「书房」：预设挂在名为「书房」的牌组上。
 * 没有该牌组（或取不到预设）时返回 true，由输出报告 presetMissing。
 */
async function setupStudyPreset(url, decks) {
  const studyDecks = decks.filter((deck) => deck.startsWith(STUDY_PREFIX));
  if (studyDecks.length === 0) return false;
  try {
    const config = await invoke(url, "getDeckConfig", { deck: STUDY_PRESET_DECK });
    if (typeof config?.id !== "number") return true;
    for (const deck of studyDecks) {
      await invoke(url, "setDeckConfigId", { decks: [deck], configId: config.id });
    }
    return false;
  } catch {
    return true;
  }
}

async function commandPush(vault, options) {
  const url = typeof options.url === "string" ? options.url : DEFAULT_URL;
  const dryRun = options["dry-run"] === true;

  const files = await walkMarkdown(join(knowledgeDir(vault), "flashcards"));
  const pages = [];
  const skipped = [];
  const failed = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const parsed = parseCardPage(text);
    const rel = relativeToVault(vault, file);
    const page = { file, rel, text, parsed, ...classifyPage(rel, parsed) };
    skipped.push(...page.skipped);
    failed.push(...page.failed);
    pages.push(page);
  }
  const decks = [...new Set(pages.flatMap((page) => page.pending.map((item) => item.deck)))].sort();

  const result = {
    added: 0,
    duplicates: [],
    failed,
    skipped,
    decks,
    presetMissing: false,
  };

  if (dryRun) {
    result.dryRun = true;
    result.pending = pages.flatMap((page) =>
      page.pending.map((item) => ({ ...item, back: short(page.parsed.blocks[item.index].back) })),
    );
    output(options, result, () => renderDryRun(result));
    return;
  }

  const total = pages.reduce((sum, page) => sum + page.pending.length, 0);
  if (total > 0) {
    try {
      await invoke(url, "version");
    } catch {
      fail("连不上 Anki：请打开 Anki 并确认装了 AnkiConnect");
    }
  }

  const fieldNames = total === 0 ? null : await invoke(url, "modelFieldNames", { modelName: "Basic" });
  if (total > 0 && (!Array.isArray(fieldNames) || fieldNames.length < 2)) {
    fail(`Anki 的 Basic 笔记类型字段不足：${JSON.stringify(fieldNames)}`);
  }
  const [frontField, backField] = fieldNames ?? [];

  for (const deck of decks) {
    await invoke(url, "createDeck", { deck });
  }
  result.presetMissing = await setupStudyPreset(url, decks);

  for (const page of pages) {
    const inserted = [];
    for (const item of page.pending) {
      const block = page.parsed.blocks[item.index];
      const note = {
        deckName: item.deck,
        modelName: "Basic",
        fields: { [frontField]: toAnkiHtml(block.front), [backField]: toAnkiHtml(block.back) },
        tags: ["xuegen", ...page.parsed.tags],
        options: { allowDuplicate: false },
      };
      try {
        const noteId = await invoke(url, "addNote", { note });
        inserted.push({ blockIndex: item.index, id: noteId });
        result.added += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/duplicate/i.test(message)) result.duplicates.push({ file: item.file, block: item.block, deck: item.deck, front: item.front });
        else failed.push({ file: item.file, block: item.block, deck: item.deck, front: item.front, error: message });
      }
    }
    if (inserted.length > 0) {
      await writeAtomic(page.file, insertIds(page.text, inserted));
    }
  }

  output(options, result, () => renderResult(result));
}

function renderDryRun(result) {
  const lines = [`将同步 ${result.pending.length} 张卡`];
  for (const item of result.pending) {
    lines.push(`  ${item.deck} ← ${item.file} 第${item.block}块：${item.front}`);
  }
  return `${lines.join("\n")}${renderTail(result)}`;
}

function renderResult(result) {
  const lines = [
    `新增 ${result.added}｜重复 ${result.duplicates.length}｜失败 ${result.failed.length}｜跳过 ${result.skipped.length}`,
  ];
  for (const item of result.duplicates) lines.push(`重复：${item.file} 第${item.block}块「${item.front}」`);
  for (const item of result.failed) lines.push(`失败：${item.file} 第${item.block}块「${item.front}」${item.error}`);
  for (const item of result.skipped) lines.push(`跳过（${item.type}）：${item.file} 第${item.block}块「${item.front}」`);
  return `${lines.join("\n")}${renderTail(result)}`;
}

function renderTail(result) {
  const lines = [];
  if (result.decks.length > 0) lines.push(`牌组：${result.decks.join("、")}`);
  if (result.presetMissing) lines.push(`提示：Anki 里没有「${STUDY_PRESET_DECK}」牌组，${STUDY_PREFIX}* 未设预设`);
  return lines.length === 0 ? "" : `\n${lines.join("\n")}`;
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
    "Xuegen 卡片直连 AnkiConnect（anki-sync）",
    "",
    "用法：",
    "  node anki-sync.mjs push <vault> [--dry-run] [--json] [--url http://127.0.0.1:8765]",
    "",
    "<vault> 为 Wiki 库根目录（须含 wiki/ 子目录）；知识目录 = wiki/knowledge。",
    "push：把 <知识目录>/flashcards/ 下没有 <!--ID:--> 的 Basic 块写进 Anki，ID 回填到块内。",
    "--dry-run 只列出要同步的卡，不连 Anki、不写文件。",
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
  if (command === "push") {
    const vault = resolve(positional[0] ?? fail("push 需要 vault 路径"));
    requireVault(vault);
    await commandPush(vault, options);
  } else {
    fail(`未知命令：${command}`);
  }
}

// 只在直接运行时执行 main；测试 import 纯函数不触发副作用。
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
