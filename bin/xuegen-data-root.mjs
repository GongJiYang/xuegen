#!/usr/bin/env node
// 新电脑上一条命令接好数据根（见 docs/platform/NEW-MACHINE.md 第 3 步）：
//   <home>/sessions → <数据根>/sessions、~/learning → <数据根>/workspace、<home>/wiki.json 写 root。
// 不新建库、不覆盖已有链接或真实目录；写文件用「临时文件 + rename」。
// 用法：
//   node bin/xuegen-data-root.mjs <数据根> [--home <XUEGEN_HOME>] [--learning <路径>] [--dry-run]
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, renameSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** 数据根下的三个子目录名（2026-11-10 起为英文；旧的中文名见 LEGACY_LAYOUT）。 */
const LAYOUT = { vault: "vault", sessions: "sessions", workspace: "workspace" };

/** 旧（2026-11-10 之前）的中文子目录名，只用于认出旧布局并拒绝。 */
const LEGACY_LAYOUT = { vault: "库", sessions: "会话", workspace: "工作区" };

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
    "<数据根> 下必须有 vault/ sessions/ workspace/ 三个目录（不新建库）。",
    "做的事：<home>/sessions → <数据根>/sessions；<learning> → <数据根>/workspace；",
    "        <home>/wiki.json 写入 { \"root\": \"<数据根>/vault\" }。",
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

/**
 * 检查数据根是不是新布局（vault/ sessions/ workspace/）。
 * 三个英文目录缺任何一个就失败：全是旧中文目录时报旧布局并给出改名做法，否则报缺目录。
 */
function checkLayout(dataRoot) {
  const missing = Object.values(LAYOUT).filter((name) => {
    const dir = join(dataRoot, name);
    return !existsSync(dir) || !statSync(dir).isDirectory();
  });
  if (missing.length === 0) return;

  const legacyNames = Object.values(LEGACY_LAYOUT);
  const onlyLegacy =
    legacyNames.every((name) => {
      const dir = join(dataRoot, name);
      return lstatExists(dir) && !lstatSync(dir).isSymbolicLink() && statSync(dir).isDirectory();
    }) && missing.length === Object.keys(LAYOUT).length;
  if (onlyLegacy) {
    fail(
      `数据根还是旧布局（${legacyNames.map((name) => `${name}/`).join(" ")}）：${dataRoot}\n` +
        `请先把三个目录改名成 vault/ sessions/ workspace/（见 docs/platform/RENAME-DAY.md），再重跑本脚本。`,
    );
  }

  const name = missing[0];
  fail(`数据根缺少 ${name}/：${join(dataRoot, name)}（不新建库，先按换电脑清单拷数据）`);
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

  checkLayout(dataRoot);

  // 先预检完三条落地动作（两条链接 + wiki.json），全部通过才动文件系统；
  // 一种冲突都不应该留下半套接线。
  const sessionsLink = join(home, "sessions");
  const sessionsTarget = join(dataRoot, LAYOUT.sessions);
  const sessionsPlan = planLink(sessionsLink, sessionsTarget);
  const workspaceTarget = join(dataRoot, LAYOUT.workspace);
  const learningPlan = planLink(learning, workspaceTarget);
  const wikiJson = join(home, "wiki.json");
  const root = join(dataRoot, LAYOUT.vault);
  const wikiUpToDate = existingWikiRoot(wikiJson) === root;

  process.stdout.write(`数据根 ${dataRoot}：vault/、sessions/、workspace/ 都在\n`);

  if (!existsSync(home)) {
    if (dryRun) process.stdout.write(`将创建 ${home}\n`);
    else {
      mkdirSync(home, { recursive: true, mode: 0o700 });
      process.stdout.write(`已创建 ${home}\n`);
    }
  }

  process.stdout.write(`${applyLink(sessionsLink, sessionsTarget, sessionsPlan, dryRun)}\n`);
  process.stdout.write(`${applyLink(learning, workspaceTarget, learningPlan, dryRun)}\n`);

  if (wikiUpToDate) process.stdout.write(`${wikiJson} 已指向 ${root}，跳过\n`);
  else if (dryRun) process.stdout.write(`将写入 ${wikiJson}：{ "root": "${root}" }\n`);
  else {
    writeAtomicSync(wikiJson, `{\n  "root": ${JSON.stringify(root)}\n}\n`);
    process.stdout.write(`已写入 ${wikiJson}：{ "root": "${root}" }\n`);
  }
}

main();
