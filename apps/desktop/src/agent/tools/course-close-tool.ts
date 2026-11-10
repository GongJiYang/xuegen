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

/**
 * The part of `execFile` this tool uses, so a test can replay an exit code
 * without spawning Node or needing `skills/` on disk.
 */
export type RunExecFile = (
  file: string,
  args: readonly string[],
  options: { env: NodeJS.ProcessEnv; timeout: number; maxBuffer: number },
  callback: (error: Error | null, stdout: string, stderr: string) => void,
) => void;

/** The actions the tool schema accepts, in the order the flow uses them. */
export type CloseAction = "stage" | "add" | "check" | "commit" | "abort" | "undo";

const SCRIPT = join("skills", "course", "course-close.mjs");
/** A close can copy snapshots; give it more room than the data-channel 15 s. */
const TIMEOUT_MS = 120_000;
const MAX_BUFFER_BYTES = 4 * 1024 * 1024;

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
    case "commit":
      if (params.staging === undefined) throw new Error(`course_close ${params.action} 缺少 staging。`);
      return [params.action, params.staging, "--json"];
    case "abort":
      if (params.staging === undefined) throw new Error("course_close abort 缺少 staging。");
      return ["abort", params.staging, "--json"];
    case "undo":
      if (params.slug === undefined) throw new Error("course_close undo 缺少 slug：要撤销哪门课的收课。");
      return ["undo", vault, params.slug, "--workspace", cwd, "--json"];
  }
}

/** Spawn the script in the app's Node; resolves with its output, never rejects. */
function runScript(
  exec: RunExecFile,
  repo: string,
  args: string[],
): Promise<{ ok: boolean; stdout: string; stderr: string; message: string }> {
  return new Promise((resolvePromise) => {
    exec(
      process.execPath,
      [join(repo, SCRIPT), ...args],
      {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_BUFFER_BYTES,
      },
      (error, stdout, stderr) =>
        resolvePromise({
          ok: error === null,
          stdout,
          stderr,
          message: error?.message ?? "",
        }),
    );
  });
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
        "add 把已有页复制进暂存；abort 放弃；undo 撤销最近一次收课。课程页和概念页只能经这个工具写。",
      parameters: Type.Object({
        action: Type.Union(
          [
            Type.Literal("stage"),
            Type.Literal("add"),
            Type.Literal("check"),
            Type.Literal("commit"),
            Type.Literal("abort"),
            Type.Literal("undo"),
          ],
          {
            description:
              "stage 开始暂存；add 把已有页复制进暂存（改已有页之前必须先 add）；check 校验；commit 校验并一次提交；abort 放弃暂存；undo 撤销最近一次收课。",
          },
        ),
        slug: Type.Optional(Type.String({ description: "课程 slug（stage、undo 必填）" })),
        staging: Type.Optional(
          Type.String({ description: "暂存目录（add、check、commit、abort 必填；stage 输出它）" }),
        ),
        path: Type.Optional(Type.String({ description: "库内相对路径（add 必填）" })),
      }),
      async execute(_toolCallId, params): Promise<AgentToolResult<undefined>> {
        const vault = readVaultRoot(options.home);
        if (vault === null) {
          throw new Error("读不到库的位置（wiki.json 缺失或没有 root）；先选好库再收课。");
        }
        const args = courseCloseArgs(params, vault, options.cwd);
        const { ok, stdout, stderr, message } = await runScript(exec, options.repo, args);
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
