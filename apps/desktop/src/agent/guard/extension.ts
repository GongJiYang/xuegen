/**
 * The tool guard extension: a Pi `tool_call` handler that checks every
 * filesystem tool call against the session's role list
 * (docs/platform/ROUTE-1109.md 阶段 2).
 *
 * Denied calls return `{ block: true, reason }` so the model gets the reason
 * and can pick another way; no dialog is shown yet (that waits for the UI
 * discussion). Allowed path calls get their `input.path` rewritten to the
 * already-resolved absolute form, so the tool opens exactly the path that was
 * checked — one resolution shared by the check and the use (Mind the Gap).
 *
 * Every guarded decision is audited to `<home>/guard.log`. A tool the lists do
 * not cover (`mcp__*`, other custom tools) is passed through and audited as a
 * pass-through: the guard cannot judge its arguments, and the log is the place
 * where that gap stays visible (see `guard/README.md`).
 *
 * Stage 4a: when `options.sandbox` is set, an allowed `bash` call's
 * `input.command` is rewritten to run inside the seatbelt sandbox before the
 * tool sees it, and a failing bash result's first text block is annotated with
 * the sandbox violations the run recorded — the model sees *why* the OS
 * refused, not just "Operation not permitted".
 */

import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type { SessionRole } from "../../shared/protocol.js";
import type { SandboxRunner } from "../sandbox/runner.js";
import { appendAudit } from "./audit.js";
import { existsOnDisk, nodePathFacts } from "./facts.js";
import { canonicalParts, expandTilde, type CanonicalPath, type PathFacts } from "./path.js";
import { decide, type Decision, type Roots } from "./roles.js";

/** What the extension needs from the session it guards. */
export interface GuardOptions {
  /** The active session's role, read per call so it can settle after bind. */
  role(): SessionRole;
  /** Pi session id for the audit line. */
  sessionId(): string;
  /** Canonical roots (V/W/H/R) from `guardRoots`. */
  roots: Roots;
  /** `XUEGEN_HOME`, where `guard.log` lives. */
  home: string;
  /** The session cwd that relative tool paths resolve against. */
  cwd: string;
  /** Injectable for tests; defaults to the real filesystem. */
  facts?: PathFacts;
  /** Injectable for tests: does a canonical path already exist? */
  exists?: (path: string) => boolean;
  /**
   * The stage-4a bash sandbox. When set, an allowed `bash` call's `command` is
   * rewritten to its seatbelt-wrapped form before the tool runs; absent, the
   * guard behaves exactly as stage 2/3 left it (the tests' path).
   */
  sandbox?: SandboxRunner;
}

/** Tools whose input carries a `path` the guard can check and rewrite. */
const PATH_TOOLS = new Set(["read", "grep", "find", "ls", "write", "edit"]);
/** Tools the guard judges at all. Anything else is a pass-through (see the header). */
const GUARDED_TOOLS = new Set([...PATH_TOOLS, "bash", "powershell", "course_close", "course_plan", "calendar_write"]);
/** How the audit line marks a call the lists do not cover. */
const PASS_THROUGH = "这个工具不在权限清单里，默认放行（待界面阶段收紧）";

/** `control` / `free` / `course:<slug>` as the audit line records it. */
function roleId(role: SessionRole): string {
  return role.kind === "course" ? `course:${role.slug}` : role.kind;
}

/**
 * What the audit line names: the command's first 200 characters, the canonical
 * path, or — for `course_close`, which carries neither — its `"<action> <slug
 * 或 staging>"` so a close stays traceable after the fact.
 */
function auditTarget(input: Record<string, unknown>, canon: (path: string) => string): string {
  if (typeof input.command === "string") return input.command.slice(0, 200);
  if (typeof input.path === "string" && input.path !== "") {
    try {
      return canon(input.path);
    } catch {
      return input.path;
    }
  }
  // `calendar_write` carries neither a command nor a path; the date it writes
  // is what the audit line should name.
  if (typeof input.date === "string") return input.date;
  return closeTarget(input, canon);
}

/** `course_close` names the staging directory (or the slug) it acts on. */
function closeTarget(input: Record<string, unknown>, canon: (path: string) => string): string {
  if (typeof input.action !== "string" || input.action === "") return "";
  const subject = typeof input.staging === "string" && input.staging !== "" ? input.staging : input.slug;
  if (typeof subject !== "string" || subject === "") return input.action;
  // A staging directory gets the same resolution as a tool path, so a relative
  // one lands in the log as the absolute directory the check used.
  const named = typeof input.staging === "string" ? safeCanon(subject, canon) : subject;
  return `${input.action} ${named}`;
}

function safeCanon(path: string, canon: (path: string) => string): string {
  try {
    return canon(path);
  } catch {
    return path;
  }
}

/**
 * The extension factory. Registered first among the session's extensions so
 * the check runs before any other `tool_call` handler sees the call.
 */
export function createGuardExtension(options: GuardOptions): ExtensionFactory {
  const facts = options.facts ?? nodePathFacts();
  const exists = options.exists ?? existsOnDisk;
  const userHome = homedir();
  const auditFile = join(options.home, "guard.log");

  /**
   * Rewrite `input.command` to its sandboxed form. Fail closed when `wrap`
   * throws — a command the sandbox could not take must not run unwrapped —
   * and record a second audit line (allow:false) naming the *original*
   * command, so the log shows both that the lists allowed it and that the
   * sandbox refused to start it.
   */
  const sandboxWrap = async (
    input: Record<string, unknown>,
    toolCallId: string,
    role: SessionRole,
  ): Promise<{ block: true; reason: string } | undefined> => {
    const sandbox = options.sandbox;
    if (sandbox === undefined) return undefined;
    const command = String(input.command);
    try {
      input.command = await sandbox.wrap(command, toolCallId, role);
      return undefined;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      appendAudit(auditFile, {
        time: new Date().toISOString(),
        session: options.sessionId(),
        role: roleId(role),
        tool: "bash",
        target: command.slice(0, 200),
        allow: false,
        reason: `沙盒启动失败（${detail}）`,
      });
      return { block: true, reason: `沙盒启动失败（${detail}），这次 bash 没有运行；请告诉用户。` };
    }
  };

  return (pi) => {
    pi.on("tool_result", (event) => {
      const sandbox = options.sandbox;
      if (event.toolName !== "bash" || sandbox === undefined || !event.isError) return;
      const index = event.content.findIndex((part) => part.type === "text");
      const part = index === -1 ? undefined : event.content[index];
      if (part === undefined || part.type !== "text") return;
      const content = event.content.slice();
      content[index] = { ...part, text: sandbox.annotate(event.toolCallId, part.text) };
      return { content };
    });

    pi.on("tool_call", (event) => {
      const role = options.role();
      // One cache per call: whichever path the rules canonicalize is the same
      // resolution the tool input is rewritten to, so nothing can be swapped
      // between the check and the use.
      const resolved = new Map<string, CanonicalPath>();
      const canon = (path: string): string => {
        let parts = resolved.get(path);
        if (parts === undefined) {
          parts = canonicalParts(expandTilde(path, userHome), options.cwd, facts);
          resolved.set(path, parts);
        }
        return parts.canonical;
      };

      if (!GUARDED_TOOLS.has(event.toolName)) {
        appendAudit(auditFile, {
          time: new Date().toISOString(),
          session: options.sessionId(),
          role: roleId(role),
          tool: event.toolName,
          target: auditTarget(event.input as Record<string, unknown>, canon),
          allow: true,
          reason: PASS_THROUGH,
        });
        return;
      }

      const input = event.input as Record<string, unknown>;
      let decision: Decision;
      try {
        decision = decide(role, event.toolName, input, options.roots, canon, exists);
      } catch (error) {
        // Fail closed: an internal error must not let an unchecked call run.
        decision = {
          allow: false,
          reason: `权限检查内部出错（${error instanceof Error ? error.message : String(error)}），这次调用被拦下；请换个方式或告诉我。`,
        };
      }
      appendAudit(auditFile, {
        time: new Date().toISOString(),
        session: options.sessionId(),
        role: roleId(role),
        tool: event.toolName,
        target: auditTarget(input, canon),
        allow: decision.allow,
        reason: decision.reason,
      });
      if (!decision.allow) return { block: true, reason: decision.reason };
      if (PATH_TOOLS.has(event.toolName) && typeof input.path === "string" && input.path !== "") {
        const parts = resolved.get(input.path);
        if (parts !== undefined) input.path = parts.resolved;
      }
      // Only the sandboxed bash path goes async: `Pi` accepts a promise here,
      // while every other call keeps its plain return so the decision path
      // stays synchronous.
      if (event.toolName === "bash" && options.sandbox !== undefined) {
        return sandboxWrap(input, event.toolCallId, role);
      }
      return undefined;
    });
  };
}
