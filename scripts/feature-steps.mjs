#!/usr/bin/env node
// 固定流程步骤表：编号步骤只写在各 SKILL.md 的一节里（唯一来源），本脚本抽出后
// 生成 JSON / markdown，并同步进 docs/platform/FEATURE-WIKI.md 的标记之间；
// lint:skills 的 feature-steps 检查核对两边一致。界面「开课 · 第 3/8 步」读 --json。
// 用法：
//   node scripts/feature-steps.mjs --json      { "course.open": { name, file, steps } }
//   node scripts/feature-steps.mjs --markdown  #### 小节 + 编号列表
//   node scripts/feature-steps.mjs --write     更新 FEATURE-WIKI.md（npm run feature-steps）
import { readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const MARK_START = "<!-- feature-steps:start -->";
export const MARK_END = "<!-- feature-steps:end -->";
export const SECTION_TITLE = "## 固定流程步骤表（自动生成，勿手改）";
export const WIKI_PATH = "docs/platform/FEATURE-WIKI.md";
const WIKI_ANCHOR = /^## 1\. course/m;
const STEP_RE = /^(\d+)\.\s+(.*)$/;
const BOLD_RE = /^\*\*(.+?)\*\*/;
const CUT_RE = /[。：，]/;
const MAX_TITLE = 16;
const HEADING_RE = /^(#{1,6})[ \t]+(.*)$/;
const FENCE_RE = /^\s*```/;

// 固定流程：编号步骤只写在 file 的 heading 一节里；file 相对仓库根。
export const FLOWS = [
  { id: "course.open", name: "开课", file: "skills/course/SKILL.md", heading: "## 开课顺序" },
  { id: "course.close", name: "收课", file: "skills/course/SKILL.md", heading: "## 收课：打勾与抵消" },
  { id: "course.replan", name: "改计划", file: "skills/course/SKILL.md", heading: "## 改计划（总控会话）" },
  { id: "course.weekly", name: "周核实", file: "skills/course/references/weekly-check.md", heading: "# 周核实（整合日）" },
  { id: "cycle.brief", name: "今日简报", file: "skills/cycle-plan/SKILL.md", heading: "### 每日简报（打开总控、问「今天学什么」）" },
];

function headingOf(line) {
  const m = line.match(HEADING_RE);
  return m ? { level: m[1].length, title: m[2].trim() } : null;
}

// 每行是否在 ``` 代码围栏内（围栏行本身也标记）。
function fenceMask(lines) {
  const mask = new Array(lines.length).fill(false);
  let open = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (FENCE_RE.test(lines[i])) {
      open = !open;
      mask[i] = true;
      continue;
    }
    mask[i] = open;
  }
  return mask;
}

function clip(text) {
  return Array.from(text).slice(0, MAX_TITLE).join("").trim();
}

// 步骤名：行首 **…** 的文字；没有加粗就取第一个 。：， 之前、最多 16 个字。
export function stepTitle(content) {
  const text = content.trim();
  const bold = text.match(BOLD_RE);
  if (bold) return bold[1].trim();
  const cut = text.search(CUT_RE);
  const clipped = clip(cut === -1 ? text : text.slice(0, cut));
  return clipped || clip(text);
}

// 抽一节里行首的编号行（`N. ` 起；缩进行、代码围栏里的不算），
// 范围是该标题到下一个同级或更高级标题之间。编号须从 0 或 1 起连续递增。
export function extractSteps(text, { file, heading }) {
  const lines = text.split(/\r?\n/);
  const mask = fenceMask(lines);
  const target = heading.match(HEADING_RE);
  if (!target) throw new Error(`${file}：配置的「${heading}」不是 markdown 标题`);
  const level = target[1].length;
  const title = target[2].trim();

  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (mask[i]) continue;
    const h = headingOf(lines[i]);
    if (h && h.level === level && h.title === title) {
      start = i;
      break;
    }
  }
  if (start === -1) throw new Error(`${file}：找不到标题「${heading}」`);

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (mask[i]) continue;
    const h = headingOf(lines[i]);
    if (h && h.level <= level) {
      end = i;
      break;
    }
  }

  const steps = [];
  for (let i = start + 1; i < end; i += 1) {
    if (mask[i]) continue;
    const m = lines[i].match(STEP_RE);
    if (!m) continue;
    steps.push({ n: Number(m[1]), title: stepTitle(m[2]), line: i + 1 });
  }
  if (steps.length === 0) throw new Error(`${file}「${heading}」：没有抽到编号步骤`);
  if (steps[0].n !== 0 && steps[0].n !== 1) {
    throw new Error(`${file}「${heading}」：编号从 ${steps[0].n} 起，不是 0 或 1`);
  }
  for (let i = 1; i < steps.length; i += 1) {
    if (steps[i].n !== steps[i - 1].n + 1) {
      throw new Error(
        `${file}「${heading}」：编号不连续，第 ${steps[i].line} 行是 ${steps[i].n}（上一步是 ${steps[i - 1].n}）`,
      );
    }
  }
  return { headingLine: start + 1, steps };
}

// 读 FLOWS 里每个文件抽步骤。root 是仓库根；返回按 FLOWS 顺序的对象。
export async function collectFlows(root) {
  const out = {};
  for (const flow of FLOWS) {
    let text;
    try {
      text = await readFile(join(root, flow.file), "utf8");
    } catch {
      throw new Error(`${flow.file}（${flow.name}）：读不到文件`);
    }
    const { headingLine, steps } = extractSteps(text, flow);
    out[flow.id] = { name: flow.name, file: flow.file, headingLine, steps };
  }
  return out;
}

// --json 的形状：{ "course.open": { name, file, steps: [{ n, title, line }] } }。
export function flowsToJson(flows) {
  const out = {};
  for (const { id } of FLOWS) {
    const f = flows[id];
    out[id] = { name: f.name, file: f.file, steps: f.steps };
  }
  return out;
}

// --markdown：每个流程一个 `#### 名（file:标题行号）` 加 `N. 步骤名（:行号）` 列表。
export function flowsToMarkdown(flows) {
  return FLOWS.map(({ id }) => {
    const f = flows[id];
    const items = f.steps.map((s) => `${s.n}. ${s.title}（:${s.line}）`);
    return [`#### ${f.name}（${f.file}:${f.headingLine}）`, ...items].join("\n");
  }).join("\n\n");
}

// FEATURE-WIKI 标记之间的内容（trim 后）；没有标记返回 null。
export function markedSection(wikiText) {
  const start = wikiText.indexOf(MARK_START);
  const end = wikiText.indexOf(MARK_END);
  if (start === -1 || end === -1 || end < start) return null;
  return wikiText.slice(start + MARK_START.length, end).trim();
}

// 把生成 markdown 放进标记之间；没有标记就在「## 1. course」前插入整节。
export function updateWikiText(wikiText, markdown) {
  const block = `${MARK_START}\n${markdown}\n${MARK_END}`;
  const start = wikiText.indexOf(MARK_START);
  const end = wikiText.indexOf(MARK_END);
  if (start !== -1 && end !== -1 && end > start) {
    return wikiText.slice(0, start) + block + wikiText.slice(end + MARK_END.length);
  }
  const anchor = wikiText.match(WIKI_ANCHOR);
  if (!anchor) {
    throw new Error(`${WIKI_PATH}：没有 ${MARK_START} 标记，也找不到「## 1. course」标题，无法插入`);
  }
  const before = wikiText.slice(0, anchor.index);
  const sep = before === "" || before.endsWith("\n\n") ? "" : "\n";
  return `${before}${sep}${SECTION_TITLE}\n\n${block}\n\n${wikiText.slice(anchor.index)}`;
}

// --write：生成并更新 FEATURE-WIKI.md。返回 { wikiPath, changed }。
export async function writeFeatureSteps(root) {
  const wikiPath = join(root, WIKI_PATH);
  const markdown = flowsToMarkdown(await collectFlows(root));
  let wiki;
  try {
    wiki = await readFile(wikiPath, "utf8");
  } catch {
    throw new Error(`${WIKI_PATH}：读不到文件`);
  }
  const next = updateWikiText(wiki, markdown);
  if (next !== wiki) await writeFile(wikiPath, next, "utf8");
  return { wikiPath, changed: next !== wiki };
}

function isMain() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  if (args.length !== 1) {
    process.stderr.write("用法：node scripts/feature-steps.mjs --json | --markdown | --write\n");
    process.exit(2);
  }
  if (args[0] === "--json") {
    process.stdout.write(`${JSON.stringify(flowsToJson(await collectFlows(root)), null, 2)}\n`);
  } else if (args[0] === "--markdown") {
    process.stdout.write(`${flowsToMarkdown(await collectFlows(root))}\n`);
  } else if (args[0] === "--write") {
    const { changed } = await writeFeatureSteps(root);
    process.stdout.write(`feature-steps: ${changed ? "已更新" : "内容一致，未改动"} ${WIKI_PATH}\n`);
  } else {
    process.stderr.write(`未知选项：${args[0]}\n用法：node scripts/feature-steps.mjs --json | --markdown | --write\n`);
    process.exit(2);
  }
}

if (isMain()) {
  main().catch((error) => {
    process.stderr.write(`feature-steps: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
