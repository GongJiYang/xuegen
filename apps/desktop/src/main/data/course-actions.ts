/**
 * The `course.stop` / `course.resume` / `prefs.remove` routes: they call
 * `course-stop.mjs` / `subject-prefs.mjs` and trim each script's payload to the
 * protocol shape (the scripts' `jj` field stays out of the protocol — the
 * renderer only needs the outcome, not how the commit was recorded).
 */
import type { CourseStopResult, DataResponse } from "../../shared/data-protocol.js";
import { resolveWorkspace } from "../../agent/environment.js";
import { runScript, withToday } from "./scripts.js";

/** Trim a `course-stop.mjs --json` payload to the protocol shape. */
export function courseStopOf(data: unknown, slug: string, action: "stop" | "resume"): CourseStopResult {
  const payload = data as { date?: unknown; firstLesson?: unknown } | null;
  return {
    slug,
    action,
    date: typeof payload?.date === "string" ? payload.date : "",
    firstLesson: typeof payload?.firstLesson === "string" ? payload.firstLesson : null,
  };
}

/** `course.stop` / `course.resume`: run `course-stop.mjs` through the plan staging transaction. */
export async function courseStopRun(
  vault: string,
  action: "stop" | "resume",
  slug: string,
  today: string | null,
): Promise<DataResponse> {
  const result = await runScript(
    "course/course-stop.mjs",
    withToday([action, vault, slug, "--workspace", resolveWorkspace(), "--json"], today),
  );
  return result.ok ? { ok: true, data: courseStopOf(result.data, slug, action) } : result;
}

/** `prefs.remove`: delete one 讲解偏好 line; the response echoes the request fields. */
export async function prefsRemoveRun(vault: string, subject: string, text: string): Promise<DataResponse> {
  const result = await runScript("course/subject-prefs.mjs", [
    "remove",
    vault,
    subject,
    "--text",
    text,
    "--json",
  ]);
  return result.ok ? { ok: true, data: { subject, removed: text } } : result;
}
