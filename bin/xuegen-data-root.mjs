#!/usr/bin/env node
// 新电脑上一条命令接好数据根（见 docs/platform/NEW-MACHINE.md 第 3 步）：
//   <home>/sessions → <数据根>/会话、~/learning → <数据根>/工作区、<home>/wiki.json 写 root。
// 不新建库、不覆盖已有链接或真实目录；写文件用「临时文件 + rename」。
// 用法：
//   node bin/xuegen-data-root.mjs <数据根> [--home <XUEGEN_HOME>] [--learning <路径>] [--dry-run]
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, renameSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

function fail(message) {
  process.stderr.write(`xuegen-data-root: ${message}\n`);
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

function usage() {
  return [
    "Xuegen 数据根接线（xuegen-data-root）",
    "",
    "用法：",
    "  node bin/xuegen-data-root.mjs <数据根> [--home <XUEGEN_HOME>] [--learning <路径>] [--dry-run]",
    "",
    "<数据根> 下必须有 库/ 会话/ 工作区 三个目录（不新建库）。",
    "做的事：<home>/sessions → <数据根>/会话；<learning> → <数据根>/工作区；",
    "        <home>/wiki.json 写入 { \"root\": \"<数据根>/库\" }。",
    "<home> 默认 $XUEGEN_HOME，未设置时为 ~/.xuegen；<learning> 默认 ~/learning。",
    "--dry-run 只打印要做什么，不改任何东西。",
  ].join("\n");
}

function writeAtomicSync(file, text) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, file);
}

function realpath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/** 链接 → 目标的实际位置（跟随链接本身再解析），用于「是不是已经指向它」。 */
function linkDestination(link) {
  return realpath(resolve(dirname(link), readlinkSync(link)));
}

/**
 * 预检一条链接：缺 → 计划创建；已是指向 target 的链接 → 计划跳过；
 * 别的链接或真实目录 → fail。预检阶段不改任何东西，两条链接都查过才动手。
 */
function planLink(link, target) {
  if (!lstatExists(link)) return { action: "create", message: `将创建 ${link} → ${target}` };
  const stat = lstatSync(link);
  if (stat.isSymbolicLink() && linkDestination(link) === realpath(target)) {
    return { action: "skip", message: `已是链接 ${link} → ${target}，跳过` };
  }
  if (stat.isSymbolicLink()) fail(`${link} 已是指向 ${readlinkSync(link)} 的链接，不覆盖`);
  fail(`${link} 已存在且不是指向 ${target} 的链接，不覆盖`);
}

/** 执行预检的计划；dryRun 时只打印。 */
function applyLink(link, target, plan, dryRun) {
  if (plan.action !== "create") return plan.message;
  if (dryRun) return plan.message;
  mkdirSync(dirname(link), { recursive: true });
  symlinkSync(target, link, "dir");
  return `已创建 ${link} → ${target}`;
}

/** 读已有 wiki.json 的 root，读不到或不是我们的格式时返回 null。 */
function existingWikiRoot(wikiJson) {
  try {
    const parsed = JSON.parse(readFileSync(wikiJson, "utf8"));
    return typeof parsed.root === "string" ? parsed.root : null;
  } catch {
    return null;
  }
}

function lstatExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function main() {
  const raw = process.argv.slice(2);
  if (raw.length === 0 || raw[0] === "--help" || raw[0] === "-h") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const { positional, options } = parseArgs(raw);
  const dataRoot = resolve(positional[0] ?? fail("需要 <数据根> 路径"));
  const dryRun = options["dry-run"] === true;
  const home = resolve(
    typeof options.home === "string" ? options.home : (process.env.XUEGEN_HOME ?? join(homedir(), ".xuegen")),
  );
  const learning = resolve(
    typeof options.learning === "string" ? options.learning : join(homedir(), "learning"),
  );

  for (const name of ["库", "会话", "工作区"]) {
    const dir = join(dataRoot, name);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      fail(`数据根缺少 ${name}/：${dir}（不新建库，先按换电脑清单拷数据）`);
    }
  }

  // 先预检完三条落地动作（两条链接 + wiki.json），全部通过才动文件系统；
  // 一种冲突都不应该留下半套接线。
  const sessionsLink = join(home, "sessions");
  const sessionsPlan = planLink(sessionsLink, join(dataRoot, "会话"));
  const learningPlan = planLink(learning, join(dataRoot, "工作区"));
  const wikiJson = join(home, "wiki.json");
  const root = join(dataRoot, "库");
  const wikiUpToDate = existingWikiRoot(wikiJson) === root;

  process.stdout.write(`数据根 ${dataRoot}：库/、会话/、工作区/ 都在\n`);

  if (!existsSync(home)) {
    if (dryRun) process.stdout.write(`将创建 ${home}\n`);
    else {
      mkdirSync(home, { recursive: true, mode: 0o700 });
      process.stdout.write(`已创建 ${home}\n`);
    }
  }

  process.stdout.write(`${applyLink(sessionsLink, join(dataRoot, "会话"), sessionsPlan, dryRun)}\n`);
  process.stdout.write(`${applyLink(learning, join(dataRoot, "工作区"), learningPlan, dryRun)}\n`);

  if (wikiUpToDate) process.stdout.write(`${wikiJson} 已指向 ${root}，跳过\n`);
  else if (dryRun) process.stdout.write(`将写入 ${wikiJson}：{ "root": "${root}" }\n`);
  else {
    writeAtomicSync(wikiJson, `{\n  "root": ${JSON.stringify(root)}\n}\n`);
    process.stdout.write(`已写入 ${wikiJson}：{ "root": "${root}" }\n`);
  }
}

main();
