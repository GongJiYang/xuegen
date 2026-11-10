// jj 的一切：仓库判定、fileset 字面量转义、提交、diff 输出解析、undo 的可达性闸。
// 独占的知识：jj 命令怎么调、fileset 与 diff 模板怎么写、状态词怎么翻译成单字母。
// 对外接口：isJjRepo、jj、filesetLiteral、jjCommit、parseDiffEntries、diffEntries、guardLaterChanges。
// 调用方：durable.mjs（recoverInternal）、staging.mjs（commitInternal）、course-close.mjs（cmdUndo 与测试转出）。
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fail } from "./fail.mjs";

export function isJjRepo(vault) {
  return existsSync(join(vault, ".jj"));
}

/** 库不是 jj 仓库时整个 jj 步骤跳过（调用方在结果里写 "skipped"）。 */
export function jj(args, cwd) {
  return execFileSync("jj", args, { cwd, encoding: "utf8" });
}

/** jj fileset 里的单文件字面量：用 `root-file:`（库根相对、精确匹配），并转义路径里的
 * 反斜杠与引号。不用默认的 prefix-glob 写法：`{a => b}.md` 这类文件名会被当成模式。 */
export function filesetLiteral(path) {
  return `root-file:"${path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** jj diff 用的模板：状态 + JSON 转义的源/目标路径，一行一条，路径里的制表符、引号、
 * 花括号都不会弄乱解析。 */
const DIFF_TEMPLATE = 'status ++ "\\t" ++ json(source.path()) ++ "\\t" ++ json(target.path()) ++ "\\n"';

export function jjCommit(vault, message, paths) {
  if (!isJjRepo(vault)) return "skipped";
  // 只提交本次写入的文件（jj fileset 参数，路径相对库根）：库里别的未提交改动留在工作副本里。
  if (!Array.isArray(paths) || paths.length === 0) return "skipped";
  try {
    jj(["commit", "-m", message, "--", ...paths.map(filesetLiteral)], vault);
    return "ok";
  } catch (error) {
    const stderr = error && error.stderr ? String(error.stderr) : String(error);
    const first = stderr.split("\n").find((line) => line.trim() !== "") ?? "";
    return `failed: ${first.trim()}`;
  }
}

/** jj 的状态词（added/modified/…）→ 单字母（A/M/D/R/C）。 */
const STATUS_LETTER = {
  added: "A",
  modified: "M",
  removed: "D",
  deleted: "D",
  renamed: "R",
  copied: "C",
};

/**
 * jj diff（DIFF_TEMPLATE）的输出 → [{ status, paths }]。重命名/复制给出源与目标两条路径，
 * 撤销时两边都要恢复；其余状态只有一条。
 */
export function parseDiffEntries(text) {
  const out = [];
  for (const raw of text.split("\n")) {
    if (raw.trim() === "") continue;
    const [statusWord, sourceJson, targetJson] = raw.split("\t");
    if (!statusWord || sourceJson === undefined) continue;
    const status = STATUS_LETTER[statusWord.trim()] ?? statusWord.trim().slice(0, 1).toUpperCase();
    let paths;
    try {
      const source = JSON.parse(sourceJson);
      const target = targetJson === undefined ? source : JSON.parse(targetJson);
      paths = [source, target];
    } catch {
      continue;
    }
    out.push({ status, paths: [...new Set(paths)] });
  }
  return out;
}

/** 某次提交（或某个 diff 范围）改过哪些文件。 */
export function diffEntries(vault, revset) {
  return parseDiffEntries(jj(["diff", "-r", revset, "-T", DIFF_TEMPLATE], vault));
}

/**
 * undo 的安全闸：收课提交 <id> 之后（<id>+::@，含之后的所有提交与工作副本改动）
 * 又改过这批文件，就不能从 <id>- 恢复，否则会盖掉那次改动。有冲突时 fail 且什么都不动。
 */
export function guardLaterChanges(vault, slug, id, files) {
  let reachable;
  try {
    reachable = jj(["log", "-r", `${id}::@`, "--no-graph", "-T", 'commit_id ++ "\\n"'], vault).trim();
  } catch (error) {
    fail(`jj log 失败：${error instanceof Error ? error.message : error}`);
  }
  if (reachable === "") {
    fail(`最近的收课提交 ${id} 不在当前工作副本的历史上，不能直接撤销（可能已经撤销过）`);
  }
  let later;
  try {
    later = diffEntries(vault, `${id}+::@`);
  } catch (error) {
    fail(`jj diff 失败：${error instanceof Error ? error.message : error}`);
  }
  const touched = new Map();
  for (const entry of later) for (const path of entry.paths) touched.set(path, entry.status);
  const hit = files.filter((file) => touched.has(file));
  if (hit.length > 0) {
    fail(`这次收课之后 ${hit.join("、")} 又被改过，不能直接撤销；先处理那次改动（撤销或另行保存）再来撤销 ${slug}`);
  }
}
