/**
 * `cycle_open`: the control session's dedicated cycle-opening tool (批 5a,
 * docs/platform/PLANBOOK-456-PLAN.md「批 5」).
 *
 * Why it exists: cycle-level files (the new cycle page, the previous cycle's
 * Acceptance/Log, the route, `subjects.md`, `index.md`, `log.md`) now have one
 * write path — the cycle transaction (`skills/cycle-plan/cycle-open.mjs`):
 * stage copies into the workspace `.cycle` staging directory, edit the copies,
 * `check`, wait for the user's go-ahead, then one atomic `commit` that
 * jj-records as 「开周期」and `plan-undo` can revert. Course pages keep going
 * through `course_plan` — same machine shape, separate doors.
 *
 * Who may call it: only the 总控 (control) session — that is the guard's call
 * (`guard/roles.ts`); the tool itself just maps the call to argv and hands the
 * script's stdout back to the model. A failed `check` exits non-zero while its
 * JSON problems are still on stdout, so the output is returned, not thrown.
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

export interface CycleOpenToolOptions {
  /** Repository root, where `skills/` lives. */
  repo: string;
  /** `XUEGEN_HOME`; `wiki.json` inside it names the vault. */
  home: string;
  /** The session workspace; `stage` passes it as `--workspace`. */
  cwd: string;
  /** Injectable for tests: the child spawn. Defaults to `node:child_process`'s. */
  execFile?: RunExecFile;
}

/** The actions the tool schema accepts, in the order the flow uses them. */
export type CycleOpenAction = "stage" | "check" | "commit" | "abort";

/** The parameters the tool schema accepts, as `cycleOpenCall` sees them. */
export interface CycleOpenParams {
  action: CycleOpenAction;
  cycle?: string | undefined;
  staging?: string | undefined;
}

/** One `cycle-open.mjs` invocation a tool call stands for. */
export interface CycleOpenCall {
  /** Repo-relative script path, `skills/cycle-plan/cycle-open.mjs`. */
  script: string;
  args: string[];
}

const OPEN_SCRIPT = join("skills", "cycle-plan", "cycle-open.mjs");

/** The cycle id is also a file name (`c2.md`) and a staging dir prefix, so it stays `C<digits>`. */
const CYCLE_RE = /^C\d+$/;

/**
 * Map a tool call to the script call it stands for.
 *
 * Every action is a single `cycle-open.mjs` invocation — the script itself
 * stages, checks, commits, or aborts. Missing or malformed parameters throw in
 * Chinese — Pi turns the throw into a failed tool result, which tells the
 * model exactly which field to fill.
 */
export function cycleOpenCall(params: CycleOpenParams, vault: string, cwd: string): CycleOpenCall {
  switch (params.action) {
    case "stage": {
      if (params.cycle === undefined) {
        throw new Error("cycle_open stage 缺少 cycle：要开的周期（如 C2）。");
      }
      if (!CYCLE_RE.test(params.cycle)) throw new Error("cycle 必须是 C 加数字（如 C2）。");
      return {
        script: OPEN_SCRIPT,
        args: ["stage", vault, params.cycle, "--workspace", cwd, "--json"],
      };
    }
    case "check":
    case "commit":
    case "abort":
      return { script: OPEN_SCRIPT, args: [params.action, needStaging(params), "--json"] };
  }
}

function needStaging(params: CycleOpenParams): string {
  if (params.staging === undefined) {
    throw new Error(`cycle_open ${params.action} 缺少 staging：stage 开出来的暂存目录。`);
  }
  return params.staging;
}

/**
 * The extension factory. Registered in `session.ts` after the guard so the
 * role check on `cycle_open` calls is already in place.
 */
export function createCycleOpenExtension(options: CycleOpenToolOptions): ExtensionFactory {
  // Read once: the option is a capability, not state that changes per call.
  const exec: RunExecFile = options.execFile ?? execFile;
  return async (pi) => {
    const { Type } = await import("typebox");
    pi.registerTool({
      name: "cycle_open",
      label: "开周期",
      description:
        "总控专用：开下一周期。stage 把周期层文件（新周期页、上一周期页、route、subjects、" +
        "index、log）复制进工作区 .cycle 暂存 → 用编辑工具改暂存目录里的副本 → check 校验 → " +
        "用户说可以 → commit（jj 一笔记『开周期』，可随这一轮计划一起撤销）；abort 放弃。" +
        "课程页照旧走 course_plan，不在此列。",
      parameters: Type.Object({
        action: Type.Union(
          [Type.Literal("stage"), Type.Literal("check"), Type.Literal("commit"), Type.Literal("abort")],
          {
            description:
              "stage 开一个周期暂存（cycle 必填）；check 校验暂存副本；commit 一次提交（jj 记「开周期」）；abort 放弃暂存。",
          },
        ),
        cycle: Type.Optional(Type.String({ description: "stage 必填：要开的周期，C 加数字（如 C2）" })),
        staging: Type.Optional(
          Type.String({ description: "暂存目录（check、commit、abort 必填；stage 输出它）" }),
        ),
      }),
      async execute(_toolCallId, params): Promise<AgentToolResult<undefined>> {
        const vault = readVaultRoot(options.home);
        if (vault === null) {
          throw new Error("读不到库的位置（wiki.json 缺失或没有 root）；先选好库再开周期。");
        }
        const call = cycleOpenCall(params, vault, options.cwd);
        const result = await runScript(exec, options.repo, call.script, call.args);
        const text = result.stdout || result.stderr || result.message;
        return result.ok
          ? { content: [{ type: "text", text }], details: undefined }
          : { content: [{ type: "text", text }], details: undefined, isError: true };
      },
    });
  };
}
