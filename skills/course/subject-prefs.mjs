#!/usr/bin/env node
// 科目页「## 讲解偏好」一节的列表与删除（设计稿 logic-ui-1116.html A 节第 6 项）。
//   node subject-prefs.mjs list   <vault> [--json]
//   node subject-prefs.mjs remove <vault> <subject> --text <整行原文> [--json]
// list：遍历 wiki/subjects/*.md，取「## 讲解偏好」节里每个 `- ` 行 →
//   [{ subject, title, lines: [{ text, style }] }]（按 subject 排序；没有这节或没有行的科目不输出）。
//   text 是去掉开头 `- ` 的原文；style = 以「默认风格：」开头。
// remove：删该科目页这一节里 `- <text>` 完全相同的一行（只删一行），记 jj「偏好 <subject> 删一条」；
//   找不到报「这条偏好已经不在了」。不是 jj 库就只写文件（jjCommit 返回 skipped）。
// 无第三方依赖；写文件用 close/durable.mjs 的原子写，jj 用 close/jj.mjs。
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeAtomic } from "./close/durable.mjs";
import { jjCommit } from "./close/jj.mjs";

// 「## 讲解偏好」标题：与 close/rules.mjs 的 PREF_HEADING_RE 相同（就近复制，注释写来源）。
const PREF_HEADING_RE = /^##\s+讲解偏好\s*$/;
const H2_RE = /^##\s/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const STYLE_PREFIX = "默认风格：";

function fail(message) {
  process.stderr.write(`subject-prefs: ${message}\n`);
  process.exit(1);
}

/** text 里「## 讲解偏好」一节的 { lines, start, end }（同 rules.mjs prefSection 的找法）；没有返回 null。 */
function prefSection(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => PREF_HEADING_RE.test(line.trim()));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (H2_RE.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { lines, start, end };
}

/** 页面第一行 `# 标题` 去掉 `# `；没有返回 ""。 */
function titleOf(lines) {
  const line = lines.find((item) => item.startsWith("# "));
  return line ? line.slice(2).trim() : "";
}

function listPrefs(vault) {
  const dir = join(vault, "wiki", "subjects");
  const names = existsSync(dir)
    ? readdirSync(dir).filter((name) => name.endsWith(".md") && !name.startsWith("."))
    : [];
  const out = [];
  for (const name of names.sort()) {
    const section = prefSection(readFileSync(join(dir, name), "utf8"));
    if (section === null) continue;
    const lines = section.lines
      .slice(section.start + 1, section.end)
      .filter((line) => line.startsWith("- "))
      .map((line) => ({ text: line.slice(2), style: line.slice(2).startsWith(STYLE_PREFIX) }));
    if (lines.length === 0) continue;
    out.push({ subject: name.slice(0, -3), title: titleOf(section.lines), lines });
  }
  return out;
}

function removePref(vault, subject, text) {
  const rel = `wiki/subjects/${subject}.md`;
  const file = join(vault, rel);
  if (!existsSync(file)) fail(`没有这个科目页：${rel}`);
  const section = prefSection(readFileSync(file, "utf8"));
  const wanted = `- ${text}`;
  const index =
    section === null
      ? -1
      : section.lines.findIndex((line, i) => i > section.start && i < section.end && line === wanted);
  if (index === -1) fail("这条偏好已经不在了");
  const next = [...section.lines.slice(0, index), ...section.lines.slice(index + 1)].join("\n");
  writeAtomic(file, next);
  const jj = jjCommit(vault, `偏好 ${subject} 删一条`, [rel]);
  return { subject, removed: text, jj };
}

const USAGE = `科目页「## 讲解偏好」一节的列表与删除

用法：
  node subject-prefs.mjs list   <vault> [--json]
  node subject-prefs.mjs remove <vault> <subject> --text <整行原文> [--json]`;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) positional.push(arg);
    else if (["json", "help"].includes(arg.slice(2))) flags[arg.slice(2)] = true;
    else {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) fail(`--${key} 缺少值`);
      flags[key] = value;
      i += 1;
    }
  }
  return { positional, flags };
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [action, vaultArg, subject] = positional;
  if (flags.help || !action) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  const vault = resolve(vaultArg ?? fail(`${action} 需要 <vault>`));
  const json = Boolean(flags.json);
  if (action === "list") {
    const prefs = listPrefs(vault);
    if (json) process.stdout.write(`${JSON.stringify(prefs, null, 2)}\n`);
    else
      for (const entry of prefs) {
        process.stdout.write(`${entry.subject}（${entry.title}）\n${entry.lines.map((line) => `- ${line.text}`).join("\n")}\n`);
      }
    return;
  }
  if (action !== "remove") fail(`未知命令：${action}\n${USAGE}`);
  if (!subject || !SLUG_RE.test(subject)) fail("remove 需要 <subject>（小写字母、数字和连字符）");
  const text = flags.text ?? fail("remove 需要 --text <整行原文>");
  const out = removePref(vault, subject, text);
  process.stdout.write(
    json ? `${JSON.stringify(out)}\n` : `已删除 ${subject} 的一条偏好：${out.removed}（jj: ${out.jj}）\n`,
  );
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
  try {
    main();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
