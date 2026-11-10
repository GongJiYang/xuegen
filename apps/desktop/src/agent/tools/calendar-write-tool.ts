/**
 * `calendar_write`: the dedicated calendar-note tool (阶段 4a,
 * docs/platform/STAGE4A-DESIGN.md).
 *
 * Why it exists: once the stage-4a shell sandbox is on, `bash` can no longer
 * write `wiki/calendar/` (it is one of the locations the dedicated tools own),
 * so "记一下 / 记在某天" moves into this tool, which spawns
 * `skills/calendar/calendar.mjs` in the app's own Node outside the sandbox —
 * the same arrangement as `course_close` (`course-close-tool.ts`). The script
 * keeps the two rules a direct file write would skip: the note is written
 * atomically, and an empty body deletes the day's file.
 *
 * Who may call it: every role — the guard allows `calendar_write` for all of
 * them (`guard/roles.ts`), matching what running `calendar.mjs` through `bash`
 * used to allow.
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

export interface CalendarWriteToolOptions {
  /** Repository root, where `skills/` lives. */
  repo: string;
  /** `XUEGEN_HOME`; `wiki.json` inside it names the vault. */
  home: string;
  /** Injectable for tests: the child spawn. Defaults to `node:child_process`'s. */
  execFile?: RunExecFile;
}

const SCRIPT = join("skills", "calendar", "calendar.mjs");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Map a tool call to the script's argv: `write <vault> <date> --text <text>`.
 *
 * Missing or malformed parameters throw in Chinese — Pi turns the throw into
 * a failed tool result, which tells the model exactly which field to fill. An
 * impossible date (`2026-02-30`) passes this shape check and is refused by the
 * script's own stricter validation.
 */
export function calendarWriteArgs(
  params: { date?: string | undefined; text?: string | undefined },
  vault: string,
): string[] {
  if (typeof params.date !== "string" || !DATE_RE.test(params.date)) {
    throw new Error("calendar_write 缺少 date：要记在哪一天，格式 YYYY-MM-DD。");
  }
  if (typeof params.text !== "string") {
    throw new Error("calendar_write 缺少 text：那天的笔记正文；要删除那天的笔记就传空字符串。");
  }
  return ["write", vault, params.date, "--text", params.text];
}

/**
 * The extension factory. Registered in `session.ts` after the guard; the
 * guard already lets every role call it.
 */
export function createCalendarWriteExtension(options: CalendarWriteToolOptions): ExtensionFactory {
  // Read once: the option is a capability, not state that changes per call.
  const exec: RunExecFile = options.execFile ?? execFile;
  return async (pi) => {
    const { Type } = await import("typebox");
    pi.registerTool({
      name: "calendar_write",
      label: "日历笔记",
      description:
        "写日历笔记（wiki/calendar/<日期>.md）：用户明确说『记一下 / 记在某天 / 安排某天』时用。正文为空即删除那天的笔记。",
      parameters: Type.Object({
        date: Type.String({ description: "日期 YYYY-MM-DD" }),
        text: Type.String({ description: "那天的笔记正文；空字符串删除那天的笔记" }),
      }),
      async execute(_toolCallId, params): Promise<AgentToolResult<undefined>> {
        const vault = readVaultRoot(options.home);
        if (vault === null) {
          throw new Error("读不到库的位置（wiki.json 缺失或没有 root）；先选好库再记日历。");
        }
        const args = calendarWriteArgs(params, vault);
        const { ok, stdout, stderr, message } = await runScript(exec, options.repo, SCRIPT, args);
        // The script's own output tells the model what happened; stderr fills
        // in only when it failed before printing anything.
        const text = stdout || stderr || message;
        return ok
          ? { content: [{ type: "text", text }], details: undefined }
          : { content: [{ type: "text", text }], details: undefined, isError: true };
      },
    });
  };
}
