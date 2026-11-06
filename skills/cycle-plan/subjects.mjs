#!/usr/bin/env node
// Xuegen 科目骨架：读 wiki/subjects/*.md（frontmatter、资料、课程）与当天所在的周期，供总进度按科目分组。
// 只读，不写任何文件。无第三方依赖。
//   node subjects.mjs list <vault> [--date YYYY-MM-DD] [--json]
// <vault> 是库根目录（含 wiki/）。
import { readFile, readdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidDate } from "../course/course-schedule.mjs";
import { CYCLE_DAYS, findCycle, parseCycle, weekOf } from "./cycle.mjs";

const MARKS = { "●": "now", "!": "warn", "✓": "done", "○": "plan", "◌": "none" };

/** `[[target|alias]]` → alias，`[[target]]` → target 的最后一段。 */
export function stripLinks(text) {
  return text.replace(/\[\[([^\]|\\]+)(?:\\?\|([^\]]+))?\]\]/g, (_, target, alias) => (alias ?? target.split("/").pop()).trim());
}

/** 一行资料 `- ● 学习中 · 主线 · [[来源|标题]] → [[courses/slug]]`；不是资料行返回 null。 */
export function parseMaterial(line, type) {
  const match = /^-\s+([●!✓○◌])\s+(.+)$/.exec(line.trim());
  if (!match) return null;
  const parts = match[2].split(" · ");
  if (parts.length < 3) return null;
  const [status, role, ...rest] = parts;
  let body = rest.join(" · ");
  const courseMatch = /→\s*\[\[courses\/([^\]|\\]+)/.exec(body);
  if (courseMatch) body = body.slice(0, courseMatch.index);
  return {
    type,
    mark: MARKS[match[1]],
    status: status.trim(),
    role: role.trim(),
    title: stripLinks(body).trim(),
    course: courseMatch ? courseMatch[1].trim() : null,
  };
}

/** 解析一个科目页：{ slug, title, layer, route, courses, materials }。 */
export function parseSubject(text, slug) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text);
  const field = (key) => {
    if (!fm) return "";
    const match = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(fm[1]);
    return match ? match[1].trim() : "";
  };
  const lines = text.split("\n");
  const titleLine = lines.find((line) => /^#\s+/.test(line));
  const materials = [];
  const courses = [];
  let section = "";
  let type = "";
  for (const line of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      section = h2[1];
      type = "";
      continue;
    }
    const h3 = /^###\s+(.+?)\s*$/.exec(line);
    if (h3) {
      type = h3[1];
      continue;
    }
    if (section === "Materials" && type) {
      const item = parseMaterial(line, type);
      if (item) materials.push(item);
    }
    if (section === "Courses") {
      for (const match of line.matchAll(/\[\[courses\/([^\]|\\]+)/g)) courses.push(match[1].trim());
    }
  }
  return {
    slug,
    title: titleLine ? titleLine.replace(/^#\s+/, "").trim() : slug,
    layer: field("layer"),
    route: field("route"),
    courses: [...new Set(courses)],
    materials,
  };
}

/** 是否为当前周期的主项：route 以「C1 主项」这样的文字开头。 */
export function isMain(subject, cycle) {
  return cycle !== null && subject.route.startsWith(`${cycle.cycle} 主项`);
}

export async function loadSubjects(vault) {
  const dir = join(vault, "wiki", "subjects");
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const subjects = [];
  for (const name of names.filter((item) => item.endsWith(".md")).sort()) {
    subjects.push(parseSubject(await readFile(join(dir, name), "utf8"), basename(name, ".md")));
  }
  return subjects;
}

/** date 所在的周期：{ cycle, week, weeks, aux } 或 null；aux 是周期页「- 辅助：」那一行冒号后的文字。 */
export async function currentCycle(vault, date) {
  const dir = join(vault, "wiki", "cycles");
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  for (const name of names.filter((item) => /^c\d+\.md$/.test(item)).sort()) {
    const text = await readFile(join(dir, name), "utf8");
    const cycle = parseCycle(text, `cycles/${name}`);
    if (!findCycle([cycle], date)) continue;
    const aux = /^-\s*辅助：\s*(.+)$/m.exec(text);
    return { cycle: cycle.cycle, week: weekOf(cycle, date), weeks: CYCLE_DAYS / 7, aux: aux ? aux[1].trim() : null };
  }
  return null;
}

/** 总进度要的全部：{ date, cycle, subjects: [... , main] }。 */
export async function listSubjects(vault, date) {
  const cycle = await currentCycle(vault, date);
  const subjects = (await loadSubjects(vault)).map((subject) => ({ ...subject, main: isMain(subject, cycle) }));
  return { date, cycle, subjects };
}

// ---- CLI ----

function localToday() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function fail(message) {
  process.stderr.write(`subjects: ${message}\n`);
  process.exit(1);
}

function usage() {
  return ["用法：", "  node subjects.mjs list <vault> [--date YYYY-MM-DD] [--json]"].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const flags = { json: args.includes("--json"), help: args.includes("--help") };
  const dateIndex = args.indexOf("--date");
  const date = dateIndex === -1 ? localToday() : args[dateIndex + 1];
  const positional = args.filter((arg, index) => !arg.startsWith("--") && (dateIndex === -1 || index !== dateIndex + 1));
  const [command, vault] = positional;
  if (flags.help || !command) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command !== "list") fail(`未知命令：${command}\n${usage()}`);
  if (!vault) fail(`缺少库根目录\n${usage()}`);
  if (!isValidDate(date ?? "")) fail(`--date 必须是 YYYY-MM-DD，收到 ${date ?? "（空）"}`);
  let result;
  try {
    result = await listSubjects(vault, date);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  if (flags.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const lines = [result.cycle ? `${result.cycle.cycle} · 第 ${result.cycle.week} / ${result.cycle.weeks} 周` : `${date} 不在任何周期内`];
  for (const subject of result.subjects) {
    lines.push(`${subject.main ? "主项" : "    "} ${subject.title}  课程 ${subject.courses.length} · 资料 ${subject.materials.length}`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

function isMainModule() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
