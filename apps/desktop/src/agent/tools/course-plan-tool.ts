/**
 * `course_plan`: the control session's dedicated course-planning tool
 * (阶段 4a, docs/platform/STAGE4A-DESIGN.md).
 *
 * Why it exists: once the stage-4a shell sandbox is on, `bash` can no longer
 * write `wiki/courses/` or the course board, so the flows the control session
 * used to drive through `bash` — `course-state.mjs unlock|lock|dashboard`,
 * `course-schedule.mjs plan --write`, `render-board.mjs` — move into this
 * dedicated tool, which spawns the scripts in the app's own Node outside the
 * sandbox, the same arrangement as `course_close` (`course-close-tool.ts`).
 *
 * Who may call it: only the 总控 (control) session — that is the guard's call
 * (`guard/roles.ts`); the tool itself just maps the call to argv and hands the
 * scripts' stdout back to the model.
 *
 * Pi values stay behind a dynamic import: `session.ts` applies the
 * environment isolation before Pi loads (see its header), so `Type` is
 * fetched inside the factory, not at module top.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentToolResult, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { readVaultRoot } from "../guard/facts.js";
import { runScript, type RunExecFile } from "./run-script.js";

export interface CoursePlanToolOptions {
  /** Repository root, where `skills/` lives. */
  repo: string;
  /** `XUEGEN_HOME`; `wiki.json` inside it names the vault. */
  home: string;
  /** The session workspace; no action needs it yet, kept for symmetry with the close tool. */
  cwd: string;
  /** Injectable for tests: the child spawn. Defaults to `node:child_process`'s. */
  execFile?: RunExecFile;
}

/** The actions the tool schema accepts. */
export type PlanAction = "unlock" | "lock" | "schedule" | "board";

/** The parameters the tool schema accepts, as `coursePlanCalls` sees them. */
export interface CoursePlanParams {
  action: PlanAction;
  slug?: string | undefined;
  lessons?: string | undefined;
  start?: string | undefined;
  end?: string | undefined;
  rest?: string | undefined;
  days?: string | undefined;
  extra?: string | undefined;
  reviews?: string | undefined;
}

/** One script invocation in a plan action's sequence. */
export interface CoursePlanCall {
  /** Repo-relative script path, e.g. `skills/course/course-state.mjs`. */
  script: string;
  args: string[];
}

const STATE_SCRIPT = join("skills", "course", "course-state.mjs");
const SCHEDULE_SCRIPT = join("skills", "course", "course-schedule.mjs");
const BOARD_SCRIPT = join("skills", "course", "render-board.mjs");

/** File names and directory names are generated from the slug, so it must stay a slug. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Map a tool call to the sequence of script calls it stands for.
 *
 * `unlock`/`lock` are one call; `schedule` is unlock → plan --write → lock (the
 * caller still runs the trailing lock when the middle step fails, so a course
 * page is never left writable); `board` is dashboard → render-board. Missing
 * required parameters throw in Chinese — Pi turns the throw into a failed tool
 * result, which tells the model exactly which field to fill.
 */
export function coursePlanCalls(params: CoursePlanParams, vault: string): CoursePlanCall[] {
  const coursesDir = join(vault, "wiki", "courses");
  if (params.slug !== undefined && !SLUG_RE.test(params.slug)) {
    throw new Error("slug 只能是小写字母、数字和连字符。");
  }
  const page = params.slug === undefined ? null : join(coursesDir, `${params.slug}.md`);
  switch (params.action) {
    case "unlock":
      return [unlockCall(coursesDir, page)];
    case "lock":
      if (page === null) throw new Error("course_plan lock 缺少 slug：要上锁哪门课。");
      return [{ script: STATE_SCRIPT, args: ["lock", page, coursesDir] }];
    case "schedule":
      if (page === null) throw new Error("course_plan schedule 缺少 slug：要排哪门课。");
      return scheduleCalls(coursesDir, page, params);
    case "board":
      return boardCalls(vault, coursesDir);
  }
}

/** unlock the course page plus its directory — or only the directory when creating a course. */
function unlockCall(coursesDir: string, page: string | null): CoursePlanCall {
  return page === null
    ? { script: STATE_SCRIPT, args: ["unlock", coursesDir] }
    : { script: STATE_SCRIPT, args: ["unlock", page, coursesDir] };
}

/** unlock → `course-schedule.mjs plan … --write` → lock; only the flags given are passed on. */
function scheduleCalls(coursesDir: string, page: string, params: CoursePlanParams): CoursePlanCall[] {
  if (params.lessons === undefined) {
    throw new Error("course_plan schedule 缺少 lessons：课次清单 JSON 文件的路径。");
  }
  const plan = ["plan", page, "--lessons", params.lessons];
  const flags = [
    ["--start", params.start],
    ["--end", params.end],
    ["--rest", params.rest],
    ["--days", params.days],
    ["--extra", params.extra],
    ["--reviews", params.reviews],
  ] as const;
  for (const [flag, value] of flags) {
    if (value !== undefined) plan.push(flag, value);
  }
  plan.push("--write");
  return [
    unlockCall(coursesDir, page),
    { script: SCHEDULE_SCRIPT, args: plan },
    { script: STATE_SCRIPT, args: ["lock", page, coursesDir] },
  ];
}

/** dashboard → render-board; the board lives in `wiki/_generated/` on new vaults. */
function boardCalls(vault: string, coursesDir: string): CoursePlanCall[] {
  const generated = existsSync(join(vault, "wiki", "_generated"));
  const md = join(vault, generated ? "wiki/_generated/courses.md" : "wiki/courses.md");
  const html = join(vault, generated ? "wiki/_generated/courses.html" : "wiki/courses.html");
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
        "总控专用：建课、改计划、刷新看板。unlock 放开课程页（不给 slug 只放开课程目录，用于新建课程）→ " +
        "用编辑工具改 → lock 上锁；schedule 一步完成解锁、排期写入、上锁；board 重画课程看板。课程会话不能用。",
      parameters: Type.Object({
        action: Type.Union(
          [
            Type.Literal("unlock"),
            Type.Literal("lock"),
            Type.Literal("schedule"),
            Type.Literal("board"),
          ],
          {
            description:
              "unlock 放开课程页（不带 slug 只放开课程目录）；lock 上锁；schedule 解锁→排期写入→上锁；board 重画看板（Markdown + 网页）。",
          },
        ),
        slug: Type.Optional(
          Type.String({ description: "课程 slug，小写字母/数字/连字符（lock、schedule 必填）" }),
        ),
        lessons: Type.Optional(
          Type.String({ description: "schedule 必填：课次清单 JSON 文件的路径" }),
        ),
        start: Type.Optional(Type.String({ description: "schedule 用：周期第一天 YYYY-MM-DD" })),
        end: Type.Optional(Type.String({ description: "schedule 用：周期最后一天 YYYY-MM-DD" })),
        rest: Type.Optional(Type.String({ description: "schedule 用：休息日，如 sun、sat,sun、none" })),
        days: Type.Optional(Type.String({ description: "schedule 用：上课日，如 mon,wed" })),
        extra: Type.Optional(Type.String({ description: "schedule 用：额外上课日 YYYY-MM-DD,…" })),
        reviews: Type.Optional(Type.String({ description: "schedule 用：复习方式 spaced 或 anki" })),
      }),
      async execute(_toolCallId, params): Promise<AgentToolResult<undefined>> {
        const vault = readVaultRoot(options.home);
        if (vault === null) {
          throw new Error("读不到库的位置（wiki.json 缺失或没有 root）；先选好库再排课程计划。");
        }
        const calls = coursePlanCalls(params, vault);
        const outputs: string[] = [];
        let failure: { stdout: string; stderr: string; message: string } | null = null;
        for (const [index, call] of calls.entries()) {
          // schedule 的排期写入失败也要跑完最后一步 lock，别把课程页留在解锁状态。
          if (failure !== null && !(params.action === "schedule" && index === calls.length - 1)) {
            break;
          }
          const result = await runScript(exec, options.repo, call.script, call.args);
          outputs.push(result.stdout || result.stderr || result.message);
          if (!result.ok && failure === null) failure = result;
        }
        const text = outputs.filter((part) => part !== "").join("\n");
        return failure === null
          ? { content: [{ type: "text", text }], details: undefined }
          : { content: [{ type: "text", text }], details: undefined, isError: true };
      },
    });
  };
}
