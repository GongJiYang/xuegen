/**
 * Source guards for the agent entry point.
 *
 * `index.ts` cannot be imported by a test: importing it creates a Pi session and
 * attaches the process message port. The two rules that live there are therefore
 * checked on the source itself — every event the class posts goes through the
 * stamping wrapper, and a session switch unsubscribes and disposes the old
 * session *before* the new one becomes `this.session`.
 *
 * The behaviours behind these rules are tested against `turn.ts` /
 * `session-request.ts`; this file only stops a future edit from bypassing them.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "index.ts"), "utf8");

/** The `class AgentHost { ... }` body, without the module-level code after it. */
function classBody(): string {
  const start = source.indexOf("class AgentHost {");
  const end = source.indexOf("\nconst host = new AgentHost()");
  if (start === -1 || end === -1) throw new Error("cannot locate the AgentHost class");
  return source.slice(start, end);
}

describe("agent entry: every posted event carries a session id", () => {
  it("has exactly one wrapper that stamps withSessionId", () => {
    const body = classBody();
    const wrappers = body.match(/private post\(message: AgentToHostEvent\)/g) ?? [];
    expect(wrappers).toHaveLength(1);
    expect(body).toContain("withSessionId(message, this.session?.sessionId ?? null)");
  });

  it("never calls the module-level post from inside the class", () => {
    const body = classBody();
    // The wrapper is the only place the bare `post(` may appear (its own
    // declaration plus the call inside it); everything else must go through it.
    const withoutWrapper = body.replace(/private post\(message: AgentToHostEvent\): void \{[^}]*\}/, "");
    expect(withoutWrapper).not.toMatch(/(^|[^.\w])post\(/m);
  });

  it("posts state with the session id in the snapshot", () => {
    const snapshot = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "snapshot.ts"), "utf8");
    expect(snapshot).toContain("sessionId: session?.sessionId ?? null");
  });
});

describe("agent entry: a switch stops the old session first", () => {
  it("unsubscribes, stops, and clears before assigning the new session", () => {
    const body = classBody();
    const restartStart = body.indexOf("private async restart(");
    const restart = body.slice(restartStart, body.indexOf("  dispose(): void {", restartStart));
    const unsubscribe = restart.indexOf("this.unsubscribe?.()");
    // The abort-then-dispose ordering lives in restart.ts (tested there); a
    // bare `dispose()` here would lose the partial answer of a running turn.
    const stop = restart.indexOf("await stopSessionForRestart(this.session)");
    const clear = restart.indexOf("this.session = null");
    const assign = restart.indexOf("this.session = session");
    expect(unsubscribe).toBeGreaterThan(-1);
    expect(stop).toBeGreaterThan(unsubscribe);
    expect(clear).toBeGreaterThan(stop);
    // The old session must be gone before the new one is subscribed, so a late
    // event from the old session cannot be stamped with the new id.
    expect(assign).toBeGreaterThan(clear);
    expect(restart.indexOf("this.unsubscribe = session.subscribe")).toBeGreaterThan(assign);
    expect(restart).not.toContain("this.session?.dispose()");
  });
});

describe("agent entry: session-scoped requests go through the stale check", () => {
  it("routes prompt, compact, and abort through runSessionRequest", () => {
    const body = classBody();
    expect(body).toContain('case "prompt":\n      case "compact":\n      case "abort": {');
    expect(body).toContain("await runSessionRequest(this.turnDeps(), message)");
  });
});
