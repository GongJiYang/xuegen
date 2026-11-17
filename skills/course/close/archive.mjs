// 收课归档（issue「收课提速」）：Learning Record 只留最新 keep 条，更早的整条原样挪进
// wiki/courses/<slug>/records/YYYY-MM.md，并在节首写「- 归档：…· 完成：…」行（脚本靠它判断完成）。
// 只改暂存目录；库里已有的 records 文件由调用方给的 addToStaging 复制进暂存（记 manifest.base）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { blockText, recordBlocks, RECORD_HEADING_RE } from "./rules.mjs";

const SECTION_RE = /^##\s+Learning Record\s*$/;
const HEADING_KEY_RE = /^###\s+(\d{4}-\d{2}-\d{2}-\d{2})/;
const DONE_RE = /完成[:：]\s*(.+)$/;

/** 一份文本里所有记录块「完成：」行的 id，按第一次出现的顺序去重。 */
function doneIds(text) {
  const ids = [];
  for (const block of recordBlocks(text, { whole: true })) {
    for (const line of block.body) {
      const match = DONE_RE.exec(line);
      if (!match) continue;
      for (const id of match[1].split(/[,，、\s]+/)) {
        if (id && !ids.includes(id.trim())) ids.push(id.trim());
      }
    }
  }
  return ids;
}

/** records 文件全文：暂存里有读暂存，否则读正式库，都没有当空。 */
function recordsText(staging, vault, rel) {
  const staged = join(staging, rel);
  if (existsSync(staged)) return readFileSync(staged, "utf8");
  const abs = join(vault, rel);
  return existsSync(abs) ? readFileSync(abs, "utf8") : "";
}

/**
 * 把早于最新 keep 条的记录块挪进按月归档并写好归档行。返回 { moved, months }：
 * moved 是挪走的块标题（去掉 ### ），months 是挪进过的 YYYY-MM（升序）。
 */
export function archiveRecords(staging, manifest, { keep = 2, addToStaging } = {}) {
  const slug = manifest.slug;
  const courseRel = `wiki/courses/${slug}.md`;
  const courseAbs = join(staging, courseRel);
  const text = readFileSync(courseAbs, "utf8");
  const allBlocks = recordBlocks(text);
  const records = allBlocks.filter((block) => RECORD_HEADING_RE.test(block.heading));
  const keyOf = (block) => HEADING_KEY_RE.exec(block.heading)[1];
  const newestFirst = [...records].sort((a, b) => (keyOf(a) < keyOf(b) ? 1 : keyOf(a) > keyOf(b) ? -1 : 0));
  const victims = new Set(newestFirst.slice(keep));
  if (victims.size === 0) return { moved: [], months: [] };
  const moving = records.filter((block) => victims.has(block)); // 页面原顺序

  // 要挪的块按页面原顺序、按标题日期的 YYYY-MM 分组，逐月写进 records 文件。
  const groups = new Map();
  for (const block of moving) {
    const month = keyOf(block).slice(0, 7);
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(block);
  }
  const title = /^#\s+(.+?)\s*$/m.exec(text)?.[1] ?? slug;
  for (const [month, blocks] of groups) {
    const rel = `wiki/courses/${slug}/records/${month}.md`;
    const abs = join(staging, rel);
    let out;
    if (existsSync(abs)) {
      out = readFileSync(abs, "utf8");
    } else if (existsSync(join(manifest.vault, rel))) {
      addToStaging(rel);
      out = readFileSync(abs, "utf8");
    } else {
      const [year, monthNum] = month.split("-");
      out = `# ${title} · ${year} 年 ${Number(monthNum)} 月收课记录\n\n> 由课程页 [[courses/${slug}]] 归档，原文不改。\n`;
    }
    if (!out.endsWith("\n")) out += "\n";
    if (!out.endsWith("\n\n")) out += "\n";
    for (const block of blocks) out += `${blockText(block)}\n\n`;
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, out);
  }

  // 课程页：Learning Record 一节切成「节首 + 逐块」，删掉挪走的块（含块尾空行）。
  const lines = text.split("\n");
  const secStart = lines.findIndex((line) => SECTION_RE.test(line.trim()));
  let secEnd = lines.length;
  for (let i = secStart + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) {
      secEnd = i;
      break;
    }
  }
  const chunks = [{ heading: null, lines: [] }];
  for (let i = secStart + 1; i < secEnd; i += 1) {
    if (/^###\s/.test(lines[i])) chunks.push({ heading: lines[i].trim(), lines: [lines[i]] });
    else chunks[chunks.length - 1].lines.push(lines[i]);
  }
  const kept = [chunks[0]];
  for (let i = 1; i < chunks.length; i += 1) {
    if (!victims.has(allBlocks[i - 1])) kept.push(chunks[i]);
  }

  // 归档行：挪进过的月份 + 节首已有归档行的月份，每行收该月 records 全文的完成 id。
  // slug 只有小写字母/数字/连字符（stageInternal 校验），进正则安全。
  const lineRe = new RegExp(`^- 归档：.*\\[\\[courses/${slug}/records/(\\d{4}-\\d{2})\\]\\]`);
  const months = new Set(groups.keys());
  const oldLines = new Map();
  for (const line of chunks[0].lines) {
    const match = lineRe.exec(line.trim());
    if (match) {
      months.add(match[1]);
      oldLines.set(match[1], line.trim());
    }
  }
  const archiveLines = [...months].sort().map((month) => {
    const rel = `wiki/courses/${slug}/records/${month}.md`;
    const ids = doneIds(recordsText(staging, manifest.vault, rel));
    // 旧归档行里已有的 id 兜底保留：records 文件丢了也不把「完成」信息写丢。
    const old = DONE_RE.exec(oldLines.get(month) ?? "");
    if (old) for (const id of old[1].split(/[,，、\s]+/)) if (id && !ids.includes(id.trim())) ids.push(id.trim());
    const [year, monthNum] = month.split("-");
    return `- 归档：${year} 年 ${Number(monthNum)} 月的收课记录见 [[courses/${slug}/records/${month}]] · 完成：${ids.join("、")}`;
  });
  const others = chunks[0].lines.filter((line) => !lineRe.test(line.trim()));
  let start = 0;
  while (start < others.length && others[start].trim() === "") start += 1;
  let end = others.length;
  while (end > start && others[end - 1].trim() === "") end -= 1;
  const preamble = ["", ...archiveLines, "", ...others.slice(start, end)];
  if (end > start) preamble.push("");
  const body = [...preamble, ...kept.slice(1).flatMap((chunk) => chunk.lines)];
  writeFileSync(courseAbs, [...lines.slice(0, secStart + 1), ...body, ...lines.slice(secEnd)].join("\n"));
  return { moved: moving.map((block) => block.heading.replace(/^###\s+/, "")), months: [...groups.keys()].sort() };
}
