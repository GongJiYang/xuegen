#!/usr/bin/env node
// Xuegen 学习 skill 检查：frontmatter、名称规则、description、正文行数、个人绝对路径、脚本测试齐备。
// 无第三方依赖。用法：
//   node scripts/lint-skills.mjs [--json] [skillsDir]
// 默认检查仓库根目录下的 skills/。存在错误时退出码为 1；仅有警告时退出码为 0。
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, basename, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { collectFlows, flowsToMarkdown, markedSection, WIKI_PATH } from "./feature-steps.mjs";

const MAX_DESCRIPTION = 1024;
const MAX_BODY_LINES = 500;
// 个人绝对路径特征：允许出现在明确标注的占位符 <...> 中。
const PERSONAL_PATH_PATTERNS = [
  { name: "/Users/", re: /\/Users\// },
  { name: "/home/", re: /\/home\// },
  { name: "C:\\Users\\", re: /[A-Za-z]:\\Users\\/ },
];
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
// 主模块判定必须比真实路径：Node 把主模块解析成真实路径，字面比较会让经符号链接
// 调用（~/.xuegen/app → 仓库、/tmp → /private/tmp）的脚本静默不执行（exit 0）。
const MAIN_CHECK_RE = /resolve\(\s*process\.argv\[1\]\s*\)/;
const REALPATH_MAIN_RE = /realpathSync\(\s*fileURLToPath\(\s*import\.meta\.url\s*\)\s*\)/;

function parseArgs(argv) {
  const options = { json: false, dir: null };
  for (const token of argv) {
    if (token === "--json") options.json = true;
    else if (token.startsWith("--")) throw new Error(`未知选项：${token}`);
    else options.dir = token;
  }
  return options;
}

// 预览 frontmatter 行：解析 `key: value`（值为单行）。仅供检查使用，不求完整 YAML 语义。
function parseFrontmatter(text) {
  const match = text.match(FRONTMATTER_RE);
  if (!match) return null;
  const fields = {};
  for (const raw of match[1].split(/\r?\n/)) {
    if (raw.trim() === "") continue;
    const kv = raw.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return fields;
}

// 正文 = 去掉 frontmatter 与首尾空行后的行数。
function bodyLineCount(text) {
  const match = text.match(FRONTMATTER_RE);
  const body = match ? text.slice(match.index + match[0].length) : text;
  const trimmed = body.replace(/^\s+/, "").replace(/\s+$/, "");
  return trimmed === "" ? 0 : trimmed.split(/\r?\n/).length;
}

// 找出个人路径，排除 <...> 占位符覆盖的范围。
function findPersonalPaths(text) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // 占位符 <...> 内的片段不参与匹配。
    const scrubbed = line.replace(/<[^>]*>/g, (m) => " ".repeat(m.length));
    for (const { name, re } of PERSONAL_PATH_PATTERNS) {
      if (re.test(scrubbed)) {
        hits.push({ line: i + 1, pattern: name, text: line.trim() });
        break;
      }
    }
  }
  return hits;
}

async function listSkills(dir) {
  if (!existsSync(dir)) throw new Error(`skills 目录不存在：${dir}`);
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
}

// 递归收集目录下的文件相对路径。
async function walkFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkFiles(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

// 技能脚本里「是否直接运行」的判定：出现 resolve(process.argv[1]) 这类字面比较即报错；
// 比较了 import.meta.url 与 argv[1] 却没过 realpathSync 的也报。返回 [{line, text}]。
export function findUnsafeMainChecks(text) {
  const lines = text.split(/\r?\n/);
  const hits = [];
  const comparesWithImportUrl =
    /import\.meta\.url/.test(text) && /argv\[1\]/.test(text) && !REALPATH_MAIN_RE.test(text);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const unsafeResolve = MAIN_CHECK_RE.test(line);
    const unsafeUrlCompare = comparesWithImportUrl && /argv\[1\]/.test(line) && /import\.meta\.url/.test(line);
    if (unsafeResolve || unsafeUrlCompare) hits.push({ line: i + 1, text: line.trim() });
  }
  return hits;
}

async function checkSkill(skillsDir, name) {
  const dir = join(skillsDir, name);
  const problems = [];
  const skillFile = join(dir, "SKILL.md");
  const push = (level, rule, message) => problems.push({ level, rule, message });

  if (!existsSync(skillFile)) {
    push("error", "skill-md-exists", `${name}: 缺少 SKILL.md`);
    return problems;
  }

  const text = await readFile(skillFile, "utf8");
  const fm = parseFrontmatter(text);
  if (fm === null) {
    push("error", "frontmatter", `${name}: SKILL.md 缺少可解析的 frontmatter（--- 包裹）`);
  } else {
    const declared = fm.name;
    if (!declared) {
      push("error", "name-present", `${name}: frontmatter 缺少 name`);
    } else {
      if (declared.length > 64) push("error", "name-length", `${name}: name 超过 64 字符（${declared.length}）`);
      if (!NAME_RE.test(declared)) {
        push("error", "name-format", `${name}: name 不符合规则：${declared}（只允许小写字母、数字、连字符，且不以连字符开头/结尾或连续连字符）`);
      }
      if (declared !== name) push("error", "name-matches-dir", `${name}: name（${declared}）与目录名不一致`);
    }

    const description = fm.description;
    if (!description) {
      push("error", "description-present", `${name}: frontmatter 缺少 description`);
    } else if (description.length > MAX_DESCRIPTION) {
      push("error", "description-length", `${name}: description 超过 ${MAX_DESCRIPTION} 字符（${description.length}）`);
    }
  }

  const bodyLines = bodyLineCount(text);
  if (bodyLines > MAX_BODY_LINES) {
    push("error", "body-lines", `${name}: 正文 ${bodyLines} 行，超过 ${MAX_BODY_LINES} 行`);
  }

  const files = await walkFiles(dir);
  for (const file of files) {
    const rel = relative(skillsDir, file);
    const hits = findPersonalPaths(await readFile(file, "utf8"));
    for (const hit of hits) {
      push("error", "personal-path", `${rel}:${hit.line} 含个人绝对路径（${hit.pattern}）：${hit.text}`);
    }
  }

  const scripts = files.filter((file) => file.endsWith(".mjs") && !file.endsWith(".test.mjs"));
  for (const script of scripts) {
    const testFile = script.replace(/\.mjs$/, ".test.mjs");
    if (!existsSync(testFile)) {
      push("warning", "script-has-test", `${relative(skillsDir, script)}: 缺少同名测试 ${basename(testFile)}`);
    }
    for (const hit of findUnsafeMainChecks(await readFile(script, "utf8"))) {
      push(
        "error",
        "script-main-check",
        `${relative(skillsDir, script)}:${hit.line} 主模块判定未用 realpathSync（经符号链接调用会静默不执行）：${hit.text}`,
      );
    }
  }

  return problems;
}

// feature-steps：FEATURE-WIKI.md 的固定流程步骤表由 scripts/feature-steps.mjs 从 SKILL.md
// 生成；标记之间的内容必须与重新生成的一致。FEATURE-WIKI 不存在就跳过（例如对别的
// skills 目录跑 lint）。skillsDir 的上一级当作仓库根。
async function checkFeatureSteps(skillsDir) {
  const root = dirname(skillsDir);
  const wikiPath = join(root, WIKI_PATH);
  if (!existsSync(wikiPath)) return [];
  let expected;
  try {
    expected = flowsToMarkdown(await collectFlows(root)).trim();
  } catch (error) {
    return [{
      level: "error",
      rule: "feature-steps",
      message: `固定流程步骤表抽取失败：${error instanceof Error ? error.message : String(error)}`,
    }];
  }
  const actual = markedSection(await readFile(wikiPath, "utf8"));
  if (actual === null || actual !== expected) {
    return [{
      level: "error",
      rule: "feature-steps",
      message: `${WIKI_PATH} 的固定流程步骤表与 SKILL.md 不一致：运行 npm run feature-steps 更新 FEATURE-WIKI`,
    }];
  }
  return [];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const skillsDir = options.dir ? resolve(options.dir) : resolve("skills");
  const names = await listSkills(skillsDir);
  const all = [];
  for (const name of names) {
    for (const problem of await checkSkill(skillsDir, name)) all.push({ skill: name, ...problem });
  }
  for (const problem of await checkFeatureSteps(skillsDir)) all.push({ skill: null, ...problem });

  const errors = all.filter((item) => item.level === "error");
  const warnings = all.filter((item) => item.level === "warning");

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ skillsDir, skills: names, errors, warnings }, null, 2)}\n`);
  } else {
    for (const item of all) {
      const tag = item.level === "error" ? "错误" : "警告";
      process.stdout.write(`[${tag}] ${item.message}\n`);
    }
    process.stdout.write(
      `lint:skills: ${names.length} 个 skill，${errors.length} 个错误，${warnings.length} 个警告\n`,
    );
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((error) => {
  process.stderr.write(`lint-skills: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
