/**
 * The `shelf.afterDone` flow, split out of `handler.ts` (line cap): mark one
 * 课后读 item done in the book page, then rebuild both generated boards.
 */
import { join } from "node:path";
import type { DataRequest, DataResponse } from "../../shared/data-protocol.js";
import { runScript, runScriptPlain } from "./scripts.js";
import { generatedDir } from "./vault.js";

/**
 * 「读完了」：只写书页 —— 勾 `## 课后读` 第 N 条并记进 `## 读书记录`；
 * 之后照旧重建两份派生看板。每一步失败都直接返回它的失败响应。
 */
export async function shelfAfterDone(
  vault: string,
  request: Extract<DataRequest, { kind: "shelf.afterDone" }>,
): Promise<DataResponse> {
  const done = await runScript("reading/bookshelf.mjs", [
    "after",
    "done",
    vault,
    request.book,
    "--index",
    String(request.index),
    "--today",
    request.today,
    "--json",
  ]);
  if (!done.ok) return done;
  const generated = generatedDir(vault);
  const courses = join(vault, "wiki", "courses");
  for (const step of [
    runScriptPlain("course/course-state.mjs", ["dashboard", courses, join(generated, "courses.md")]),
    runScriptPlain("course/render-board.mjs", [courses, join(generated, "courses.html")]),
  ]) {
    const rebuilt = await step;
    if (!rebuilt.ok) return rebuilt;
  }
  return done;
}
