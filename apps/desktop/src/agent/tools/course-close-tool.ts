/**
 * `course_close`: the close transaction as a dedicated tool (阶段 3c,
 * docs/platform/STAGE3-DESIGN.md「与 4a 的关系」, STAGE4A-DESIGN.md §1).
 *
 * The model no longer reaches the script through `bash`: this tool runs
 * `skills/course/course-close.mjs` in the agent's own Node (the same
 * `ELECTRON_RUN_AS_NODE=1` child-process pattern `main/data/scripts.ts`
 * uses), outside the shell sandbox. Who may call it and on which staging
 * directory is the guard's call (`guard/roles.ts`); here the tool only maps
 * the call to argv and hands the script's stdout back to the model — a failed
 * `check` exits non-zero while its JSON problems are still on stdout, so the
 * output is returned, not thrown.
 *
 * Pi values stay behind a dynamic import: `session.ts` applies the
 * environment isolation before Pi loads (see its header), so `Type` is
 * fetched inside the factory, not at module top.
 */

import { execFile } from "node:child_process";
import { join } from "node:path";
import type { AgentToolResult, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { readVaultRoot } from "../guard/facts.js";
import { runScript, type RunExecFile } from "./run-script.js";

export type { RunExecFile } from "./run-script.js";

export interface CourseCloseToolOptions {
  /** Repository root, where `skills/` lives. */
  repo: string;
  /** `XUEGEN_HOME`; `wiki.json` inside it names the vault. */
  home: string;
  /** The session workspace; `stage` / `undo` pass it as `--workspace`. */
  cwd: string;
  /** Injectable for tests: the child spawn. Defaults to `node:child_process`'s. */
  execFile?: RunExecFile;
}

/** The actions the tool schema accepts, in the order the flow uses them. */
export type CloseAction = "stage" | "add" | "check" | "commit" | "abort" | "shift" | "undo" | "snapshot";

/**
 * What `commit` calls the jj commit: 「收课」 by default, 「存档点」 for a
 * mid-session save (long sessions stage → edit Next Session → commit), and
 * 「偏好」 for a lesson-time teaching preference (「以后讲离散都…」) written
 * into the subject page's `## 讲解偏好` section. `undo` only looks for
 * 「收课 <slug> <date>」, so neither a checkpoint nor a preference is undone by it.
 */
export type CommitLabel = "收课" | "存档点" | "偏好";

const SCRIPT = join("skills", "course", "course-close.mjs");

/**
 * Map a tool call to the script's argv (always with `--json` so a failing
 * `check` still prints its problems for the model to read).
 *
 * Missing required parameters throw in Chinese — Pi turns the throw into a
 * failed tool result, which tells the model exactly which field to fill.
 */
export function courseCloseArgs(
  params: {
    action: CloseAction;
    slug?: string | undefined;
    staging?: string | undefined;
    path?: string | undefined;
    today?: string | undefined;
    end?: string | undefined;
    label?: CommitLabel | undefined;
    report?: string | undefined;
    out?: string | undefined;
  },
  vault: string,
  cwd: string,
): string[] {
  switch (params.action) {
    case "stage":
      if (params.slug === undefined) throw new Error("course_close stage 缺少 slug：要收哪门课。");
      return ["stage", vault, params.slug, "--workspace", cwd, "--json"];
    case "add":
      if (params.staging === undefined) throw new Error("course_close add 缺少 staging：哪个暂存目录。");
      if (params.path === undefined)
        throw new Error("course_close add 缺少 path：要复制进暂存的库内相对路径。");
      return ["add", params.staging, params.path, "--json"];
    case "check":
      if (params.staging === undefined) throw new Error(`course_close ${params.action} 缺少 staging。`);
      return [params.action, params.staging, "--json"];
    case "commit":
      if (params.staging === undefined) throw new Error(`course_close ${params.action} 缺少 staging。`);
      // 存档点（长会话中途保存）不能记成「收课」，否则 undo 会撤错那次提交；
      // 课上记的讲解偏好同理（--label 偏好）。
      return ["commit", params.staging, ...(params.label ? ["--label", params.label] : []), "--json"];
    case "abort":
      if (params.staging === undefined) throw new Error("course_close abort 缺少 staging。");
      return ["abort", params.staging, "--json"];
    case "shift":
      if (params.slug === undefined) throw new Error("course_close shift 缺少 slug：要顺延哪门课。");
      return [
        "shift",
        vault,
        params.slug,
        "--workspace",
        cwd,
        ...(params.today ? ["--today", params.today] : []),
        ...(params.end ? ["--end", params.end] : []),
        "--json",
      ];
    case "undo":
      if (params.slug === undefined) throw new Error("course_close undo 缺少 slug：要撤销哪门课的收课。");
      return ["undo", vault, params.slug, "--workspace", cwd, "--json"];
    case "snapshot":
      if (params.staging === undefined) throw new Error("course_close snapshot 缺少 staging：哪个暂存目录。");
      if (params.report === undefined) throw new Error("course_close snapshot 缺少 report：暂存目录里的报告 JSON 相对路径。");
      if (params.out === undefined) throw new Error("course_close snapshot 缺少 out：暂存目录里的 PNG 相对路径。");
      return ["snapshot", params.staging, params.report, params.out, "--json"];
  }
}

/**
 * The extension factory. Registered in `session.ts` after the guard so the
 * role check on `course_close` calls is already in place.
 */
export function createCourseCloseExtension(options: CourseCloseToolOptions): ExtensionFactory {
  // Read once: the option is a capability, not state that changes per call.
  const exec: RunExecFile = options.execFile ?? execFile;
  return async (pi) => {
    const { Type } = await import("typebox");
    pi.registerTool({
      name: "course_close",
      label: "收课",
      description:
        "收课事务：stage 开始暂存 → 在暂存目录里改文件 → check 校验 → commit 一次提交；" +
        "add 把已有页复制进暂存；abort 放弃；undo 撤销最近一次收课。shift 开课时顺延排期。snapshot 在暂存里生成收课截图（沙盒外跑，bash 起不了 Chrome）。课程页和概念页只能经这个工具写；本科目页用 add 复制进来后只许改它的「讲解偏好」一节（commit 带 label 偏好）。",
      parameters: Type.Object({
        action: Type.Union(
          [
            Type.Literal("stage"),
            Type.Literal("add"),
            Type.Literal("check"),
            Type.Literal("commit"),
            Type.Literal("abort"),
            Type.Literal("shift"),
            Type.Literal("undo"),
            Type.Literal("snapshot"),
          ],
          {
            description:
              "stage 开始暂存；add 把已有页复制进暂存（改已有页之前必须先 add）；check 校验；commit 校验并一次提交；abort 放弃暂存；undo 撤销最近一次收课。shift 开课时顺延排期（一步完成暂存、校验、提交）。snapshot 在暂存里生成收课截图（沙盒外跑，bash 起不了 Chrome）。",
          },
        ),
        slug: Type.Optional(Type.String({ description: "课程 slug（stage、shift、undo 必填）" })),
        staging: Type.Optional(
          Type.String({ description: "暂存目录（add、check、commit、abort 必填；stage 输出它）" }),
        ),
        path: Type.Optional(Type.String({ description: "库内相对路径（add 必填）" })),
        today: Type.Optional(Type.String({ description: "shift 用：今天日期 YYYY-MM-DD（不填用本机日期）" })),
        end: Type.Optional(
          Type.String({ description: "shift 用：周期最后一天 YYYY-MM-DD（排期标记里已有 end= 时不填）" }),
        ),
        report: Type.Optional(Type.String({ description: "snapshot 用：暂存目录里的报告 JSON 相对路径" })),
        out: Type.Optional(
          Type.String({
            description: "snapshot 用：暂存目录里的 PNG 相对路径，wiki/courses/<slug>/snapshots/YYYY-MM-DD-NN.png",
          }),
        ),
        label: Type.Optional(
          Type.Union([Type.Literal("收课"), Type.Literal("存档点"), Type.Literal("偏好")], {
            description:
              "commit 用：存档点（长会话中途保存）填「存档点」；课上记讲解偏好（「以后讲<科目>都…」，只改本科目页「讲解偏好」一节）填「偏好」；收课不填",
          }),
        ),
      }),
      async execute(_toolCallId, params): Promise<AgentToolResult<undefined>> {
        const vault = readVaultRoot(options.home);
        if (vault === null) {
          throw new Error("读不到库的位置（wiki.json 缺失或没有 root）；先选好库再收课。");
        }
        const args = courseCloseArgs(params, vault, options.cwd);
        const { ok, stdout, stderr, message } = await runScript(exec, options.repo, SCRIPT, args);
        // A failed check exits 1 with the problems JSON on stdout; stderr only
        // fills in when the script failed before printing anything.
        const text = stdout || stderr || message;
        return ok
          ? { content: [{ type: "text", text }], details: undefined }
          : { content: [{ type: "text", text }], details: undefined, isError: true };
      },
    });
  };
}
