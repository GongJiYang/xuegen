/**
 * Vault checks for the settings dialog's 库检查 section: runs
 * `vault-lint.mjs --json` and `course-state.mjs verify --json` in parallel,
 * merges their problems, and persists the last result so it can be shown
 * without re-running the scripts.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckProblem, CheckResult, DataResponse } from "../../shared/data-protocol.js";
import { runScript } from "./scripts.js";

/** The failure half of a script result, passed through untouched. */
export type ScriptFailure = Extract<DataResponse, { ok: false }>;

const LAST_FILE = "check-last.json";

interface LintProblem {
  path?: unknown;
  kind?: unknown;
  detail?: unknown;
}
interface VerifyProblem {
  slug?: unknown;
  kind?: unknown;
  detail?: unknown;
}

/** File name without directory or extension ("raw/library/" → "library"). */
function shortWhere(path: string): string {
  const name =
    path
      .replace(/[/\\]+$/, "")
      .split(/[/\\]/)
      .pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Both check scripts always print `{problems: [...]}`; anything else is a malformed run. */
function scriptFailure(relative: string): ScriptFailure {
  return { ok: false, code: "script-failed", error: `脚本 ${relative} 输出的 problems 不是数组。` };
}

function lintProblems(data: unknown): CheckProblem[] | null {
  const problems = (data as { problems?: LintProblem[] } | null)?.problems;
  if (!Array.isArray(problems)) return null;
  return problems.map((problem) => ({
    area: "vault",
    where: typeof problem.path === "string" ? shortWhere(problem.path) : null,
    kind: String(problem.kind ?? ""),
    detail: String(problem.detail ?? ""),
  }));
}

function verifyProblems(data: unknown): CheckProblem[] | null {
  const problems = (data as { problems?: VerifyProblem[] } | null)?.problems;
  if (!Array.isArray(problems)) return null;
  return problems.map((problem) => ({
    area: "courses",
    where: typeof problem.slug === "string" ? problem.slug : null,
    kind: String(problem.kind ?? ""),
    detail: String(problem.detail ?? ""),
  }));
}

/** Write the result atomically (temp file + rename) under `<home>`. */
function writeLast(home: string, result: CheckResult): void {
  mkdirSync(home, { recursive: true });
  const file = join(home, LAST_FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  renameSync(tmp, file);
}

/**
 * Run both checks against `vault`. Either script failing returns its failure
 * unchanged (and nothing is persisted). `run` is injectable for tests.
 */
export async function runChecks(
  vault: string,
  home: string,
  run: typeof runScript = runScript,
): Promise<CheckResult | ScriptFailure> {
  const [lint, verify] = await Promise.all([
    run("wiki-save/vault-lint.mjs", [vault, "--json"]),
    run("course/course-state.mjs", ["verify", join(vault, "wiki", "courses"), "--json"]),
  ]);
  if (!lint.ok) return lint;
  if (!verify.ok) return verify;
  const vaultProblems = lintProblems(lint.data);
  if (vaultProblems === null) return scriptFailure("wiki-save/vault-lint.mjs");
  const courseProblems = verifyProblems(verify.data);
  if (courseProblems === null) return scriptFailure("course/course-state.mjs");
  const result: CheckResult = {
    checkedAt: new Date().toISOString(),
    vault: vaultProblems,
    courses: courseProblems,
  };
  writeLast(home, result);
  return result;
}

/** The `check.run` route's response: run both checks, then wrap the result. */
export async function checkRunResponse(vault: string, home: string): Promise<DataResponse> {
  const result = await runChecks(vault, home);
  return "checkedAt" in result ? { ok: true, data: result } : result;
}

/** The last `runChecks` result stored under `<home>`; null when absent or unreadable. */
export function lastCheck(home: string): CheckResult | null {
  try {
    const parsed = JSON.parse(readFileSync(join(home, LAST_FILE), "utf8")) as CheckResult;
    if (
      typeof parsed.checkedAt !== "string" ||
      !Array.isArray(parsed.vault) ||
      !Array.isArray(parsed.courses)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
