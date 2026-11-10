// 课程看板：提交前用上级目录的 course-state.mjs / render-board.mjs 重画，与本次改动一起进 jj。
// 独占的知识：看板在新旧两种布局下的库内路径、两步重画怎么跑、失败不拖垮收课（返回 error 不抛）。
// 对外接口：BOARD_RELS、refreshBoard。
// 调用方：durable.mjs（recoverInternal）、staging.mjs（commitInternal）、course-close.mjs（cmdUndo）。
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 看板可能出现过的库内路径（新旧两种布局）。undo 把这几条踢出「那次收课
 * 改过的文件」：看板是每次提交自动重画的产物，留着它分析会让别门课的收课
 * （同样动看板）把本课撤销挡下，keptNew 也会把看板误报成新建页。 */
export const BOARD_RELS = new Set([
  "wiki/courses.md",
  "wiki/courses.html",
  "wiki/_generated/courses.md",
  "wiki/_generated/courses.html",
]);

/** 看板的库内相对路径：新库在 wiki/_generated/，旧库在 wiki/ 根。 */
function boardPaths(vault) {
  if (existsSync(join(vault, "wiki/_generated"))) {
    return { md: "wiki/_generated/courses.md", html: "wiki/_generated/courses.html" };
  }
  return { md: "wiki/courses.md", html: "wiki/courses.html" };
}

/** 用本目录的 course-state.mjs dashboard + render-board.mjs 重画看板（沙盒外的
 * Node 子进程，与桌面 agent 同一个 ELECTRON_RUN_AS_NODE 模式）。成功返回
 * { ok: true, paths: [库内相对路径] }；任一步失败返回 { ok: false, paths: [],
 * error: 中文一句 + 原因 }，不抛——看板坏了不影响已落盘的收课。 */
export function refreshBoard(vault) {
  const { md, html } = boardPaths(vault);
  const coursesDir = join(vault, "wiki", "courses");
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
  const steps = [
    ["Markdown 看板", [join(dirname(fileURLToPath(import.meta.url)), "..", "course-state.mjs"), "dashboard", coursesDir, join(vault, md)]],
    ["网页看板", [join(dirname(fileURLToPath(import.meta.url)), "..", "render-board.mjs"), coursesDir, join(vault, html)]],
  ];
  for (const [label, argv] of steps) {
    try {
      execFileSync(process.execPath, argv, { env, stdio: "pipe" });
    } catch (error) {
      const stderr = error && error.stderr ? String(error.stderr) : "";
      const lines = stderr.split("\n").map((line) => line.trim()).filter((line) => line !== "");
      // 脚本报错形如 `render-board: <原因>`；脚本文件缺失时 stderr 是 Node 的
      // 加载器堆栈，这时含 "Error" 的那行（Cannot find module …）才有用。
      const reason =
        lines.find((line) => /Error|失败|无法|缺少/.test(line)) ?? lines[0] ??
        (error instanceof Error ? error.message : String(error));
      return { ok: false, paths: [], error: `重画${label}失败：${reason}` };
    }
  }
  return { ok: true, paths: [md, html] };
}
