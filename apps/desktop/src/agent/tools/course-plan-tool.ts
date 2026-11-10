/**
 * `course_plan`: the control session's dedicated course-planning tool
 * (阶段 4a, docs/platform/STAGE4A-DESIGN.md; 整理批 1, docs/platform/TIDY-1110.md §1).
 *
 * Why it exists: the vault's course pages have exactly one write path — the
 * close transaction (`skills/course/course-close.mjs`): stage a copy into the
 * workspace `.close` staging directory, edit the copy, `check`, then one
 * atomic `commit` that jj-records as 「计划」. The control session drives that
 * transaction through this tool (`--kind plan`), while the course session
 * drives it through `course_close` — two role-gated doors onto one machine.
 * `board` still runs the board redraw scripts directly, outside the sandbox.
 *
 * Who may call it: only the 总控 (control) session — that is the guard's call
 * (`guard/roles.ts`); the tool itself just maps the call to argv and hands the
 * scripts' stdout back to the model. A failed `check` exits non-zero while its
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

export interface CoursePlanToolOptions {
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
export type PlanAction = "stage" | "schedule" | "check" | "commit" | "abort" | "shift" | "board";

/** The parameters the tool schema accepts, as `coursePlanCalls` sees them. */
export interface CoursePlanParams {
  action: PlanAction;
  slug?: string | undefined;
  new?: boolean | undefined;
  subject?: string | undefined;
  staging?: string | undefined;
  lessons?: string | undefined;
  start?: string | undefined;
  end?: string | undefined;
  rest?: string | undefined;
  days?: string | undefined;
  extra?: string | undefined;
  reviews?: string | undefined;
  elastic?: boolean | undefined;
  today?: string | undefined;
}

/** One script invocation in a plan action's sequence. */
export interface CoursePlanCall {
  /** Repo-relative script path, e.g. `skills/course/course-close.mjs`. */
  script: string;
  args: string[];
}

const CLOSE_SCRIPT = join("skills", "course", "course-close.mjs");
const STATE_SCRIPT = join("skills", "course", "course-state.mjs");
const BOARD_SCRIPT = join("skills", "course", "render-board.mjs");

/** File names and directory names are generated from the slug, so it must stay a slug. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Map a tool call to the script calls it stands for.
 *
 * Every transaction action is a single `course-close.mjs` invocation — the
 * script itself stages, schedules, checks, commits, or aborts; `board` is the
 * dashboard → render-board pair. Missing required parameters throw in
 * Chinese — Pi turns the throw into a failed tool result, which tells the
 * model exactly which field to fill.
 */
export function coursePlanCalls(params: CoursePlanParams, vault: string, cwd: string): CoursePlanCall[] {
  if (params.slug !== undefined && !SLUG_RE.test(params.slug)) {
    throw new Error("slug 只能是小写字母、数字和连字符。");
  }
  if (params.subject !== undefined && !SLUG_RE.test(params.subject)) {
    throw new Error("subject 只能是小写字母、数字和连字符。");
  }
  switch (params.action) {
    case "stage":
      return [stageCall(params, vault, cwd)];
    case "schedule":
      return [scheduleCall(params)];
    case "check":
    case "commit":
    case "abort":
      return [{ script: CLOSE_SCRIPT, args: [params.action, needStaging(params), "--json"] }];
    case "shift":
      return [shiftCall(params, vault, cwd)];
    case "board":
      return boardCalls(vault, join(vault, "wiki", "courses"));
  }
}

/** `stage --kind plan`（新建课程再加 `--new --subject`）；`stage` 必须带 slug。 */
function stageCall(params: CoursePlanParams, vault: string, cwd: string): CoursePlanCall {
  if (params.slug === undefined) {
    throw new Error("course_plan stage 缺少 slug：要计划哪门课（新建课程也要先定 slug）。");
  }
  const args = ["stage", vault, params.slug, "--workspace", cwd, "--kind", "plan"];
  if (params.new === true) {
    if (params.subject === undefined) {
      throw new Error("course_plan stage 新建课程缺少 subject：科目 id（小写字母/数字/连字符）。");
    }
    args.push("--new", "--subject", params.subject);
  } else if (params.subject !== undefined) {
    throw new Error("course_plan stage 的 subject 只在新建课程（new: true）时用。");
  }
  return { script: CLOSE_SCRIPT, args: [...args, "--json"] };
}

/** `schedule`：在暂存副本上跑排期；`staging` 与 `lessons` 必填。 */
function scheduleCall(params: CoursePlanParams): CoursePlanCall {
  const staging = needStaging(params);
  if (params.lessons === undefined) {
    throw new Error("course_plan schedule 缺少 lessons：课次清单 JSON 文件的路径。");
  }
  const args = ["schedule", staging, "--lessons", params.lessons];
  const flags = [
    ["--start", params.start],
    ["--end", params.end],
    ["--rest", params.rest],
    ["--days", params.days],
    ["--extra", params.extra],
    ["--reviews", params.reviews],
  ] as const;
  for (const [flag, value] of flags) {
    if (value !== undefined) args.push(flag, value);
  }
  if (params.elastic === true) args.push("--elastic");
  return { script: CLOSE_SCRIPT, args: [...args, "--json"] };
}

/** `shift`：总控替一门课顺延（同 course_close 的 shift）；slug、today 必填。 */
function shiftCall(params: CoursePlanParams, vault: string, cwd: string): CoursePlanCall {
  if (params.slug === undefined) throw new Error("course_plan shift 缺少 slug：要顺延哪门课。");
  if (params.today === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(params.today)) {
    throw new Error("course_plan shift 缺少 today（YYYY-MM-DD）：这一天之前没学的新课顺延到它或之后的第一个上课日。");
  }
  const args = ["shift", vault, params.slug, "--workspace", cwd, "--today", params.today];
  if (params.end !== undefined) args.push("--end", params.end);
  return { script: CLOSE_SCRIPT, args: [...args, "--json"] };
}

function needStaging(params: CoursePlanParams): string {
  if (params.staging === undefined) {
    throw new Error(`course_plan ${params.action} 缺少 staging：stage 开出来的暂存目录。`);
  }
  return params.staging;
}

/** dashboard → render-board; the board lives in `wiki/_generated/`. */
function boardCalls(vault: string, coursesDir: string): CoursePlanCall[] {
  const md = join(vault, "wiki/_generated/courses.md");
  const html = join(vault, "wiki/_generated/courses.html");
  return [
    { script: STATE_SCRIPT, args: ["dashboard", coursesDir, md] },
    { script: BOARD_SCRIPT, args: [coursesDir, html] },
  ];
}

/**
 * The extension factory. Registered in `session.ts` after the guard so the
 * role check on `course_plan` calls is already in place.
 */
export function createCoursePlanExtension(options: CoursePlanToolOptions): ExtensionFactory {
  // Read once: the option is a capability, not state that changes per call.
  const exec: RunExecFile = options.execFile ?? execFile;
  return async (pi) => {
    const { Type } = await import("typebox");
    pi.registerTool({
      name: "course_plan",
      label: "课程计划",
      description:
        "总控专用：建课、改计划。stage 开一个计划暂存（新建课程加 new 和 subject）→ " +
        "用编辑工具改暂存目录里的课程页 / 科目页 / index / log → 需要排期时 schedule → check → " +
        "commit（jj 记『计划』，看板自动重画）；abort 放弃；board 只重画看板。课程会话不能用。" +
        "临时不上课、要把某天的课往后挪：shift（不开暂存、一步提交）。",
      parameters: Type.Object({
        action: Type.Union(
          [
            Type.Literal("stage"),
            Type.Literal("schedule"),
            Type.Literal("check"),
            Type.Literal("commit"),
            Type.Literal("abort"),
            Type.Literal("shift"),
            Type.Literal("board"),
          ],
          {
            description:
              "stage 开一个计划暂存（new: true 加 subject 建新课程）；schedule 把排期写进暂存课程页；check 校验；commit 一次提交（jj 记「计划」）；abort 放弃暂存；board 重画看板（Markdown + 网页）；shift 替一门课顺延（slug + today，today 填明天就是把今天没上的课挪走）。",
          },
        ),
        slug: Type.Optional(Type.String({ description: "课程 slug，小写字母/数字/连字符（stage 必填）" })),
        new: Type.Optional(Type.Boolean({ description: "stage 用：true 表示新建课程（课程页必须不存在），需要 subject" })),
        subject: Type.Optional(Type.String({ description: "stage 新建课程必填：科目 id，小写字母/数字/连字符" })),
        staging: Type.Optional(
          Type.String({ description: "暂存目录（schedule、check、commit、abort 必填；stage 输出它）" }),
        ),
        lessons: Type.Optional(Type.String({ description: "schedule 必填：课次清单 JSON 文件的路径" })),
        start: Type.Optional(Type.String({ description: "schedule 用：周期第一天 YYYY-MM-DD" })),
        end: Type.Optional(
          Type.String({ description: "schedule 用：周期最后一天 YYYY-MM-DD；shift 时只给辅助课：周期计划最后一天" }),
        ),
        rest: Type.Optional(Type.String({ description: "schedule 用：休息日，如 sun、sat,sun、none" })),
        days: Type.Optional(Type.String({ description: "schedule 用：上课日，如 mon,wed" })),
        extra: Type.Optional(Type.String({ description: "schedule 用：额外上课日 YYYY-MM-DD,…" })),
        reviews: Type.Optional(Type.String({ description: "schedule 用：复习方式 spaced 或 anki" })),
        elastic: Type.Optional(
          Type.Boolean({
            description:
              "schedule 用：主项课传 true——照 end 铺课，但不把 end 记进排期标记（以后没学就整体顺延，不砍课）；辅助课不传",
          }),
        ),
        today: Type.Optional(
          Type.String({ description: "shift 用：YYYY-MM-DD，这一天之前没学的新课顺延到它或之后的第一个上课日" }),
        ),
      }),
      async execute(_toolCallId, params): Promise<AgentToolResult<undefined>> {
        const vault = readVaultRoot(options.home);
        if (vault === null) {
          throw new Error("读不到库的位置（wiki.json 缺失或没有 root）；先选好库再排课程计划。");
        }
        const calls = coursePlanCalls(params, vault, options.cwd);
        const outputs: string[] = [];
        let failure: { stdout: string; stderr: string; message: string } | null = null;
        for (const call of calls) {
          // Each call is one step of the transaction: stop at the first
          // failure — there is no trailing lock to run anymore.
          if (failure !== null) break;
          const result = await runScript(exec, options.repo, call.script, call.args);
          outputs.push(result.stdout || result.stderr || result.message);
          if (!result.ok) failure = result;
        }
        const text = outputs.filter((part) => part !== "").join("\n");
        return failure === null
          ? { content: [{ type: "text", text }], details: undefined }
          : { content: [{ type: "text", text }], details: undefined, isError: true };
      },
    });
  };
}
