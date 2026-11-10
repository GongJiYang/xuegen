/**
 * Per-role sandbox policy (stage 4a-1): the `SandboxRuntimeConfig` a wrapped
 * bash command runs under.
 *
 * The write lists mirror the guard's `writeAllowed` so a bash command gets at
 * most what write/edit would allow, minus the locations the dedicated tools
 * own (course pages and board, 周期, 日历) — those stay read-only for every
 * role because bash must not produce them at all.
 *
 * Pure: `roots` and every rule path arrive canonical via `canon` (the same
 * canonicalization the guard applies), and every entry is marked `literal` so
 * a real directory name containing glob characters (`[`, `?`, `*`) can never
 * be read as a pattern.
 */

import type { FilesystemPathEntry, SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import type { SessionRole } from "../../shared/protocol.js";
import {
  deniedReadPaths,
  rulePaths,
  type CanonFn,
  type Roots,
  type RulePaths,
} from "../guard/vault-paths.js";

/** A canonical path entry: a name on disk, never a glob pattern. */
function lit(path: string): FilesystemPathEntry {
  return { path, literal: true };
}

/**
 * Vault locations every role may write — the "any session" group of
 * `writeAllowed` in `../guard/roles.ts` (书房, 阅读队列, 摘录, 卡片, 来源登记,
 * 分析, 实体页 — old and new vault names both come out of `rulePaths` — plus
 * the append-only registers `log.md` and `index.md`).
 * 与 roles.ts writeAllowed 对应，改一处要改两处。
 */
const ANY_SESSION_WRITE: readonly (keyof RulePaths)[] = [
  "shelf",
  "reading",
  "extracts",
  "flashcards",
  "sources",
  "synthesis",
  "entities",
  "log",
  "index",
];

/**
 * The role-keyed extras of `writeAllowed`. `cycles` and `coursesBoard` appear
 * in `DENY_WRITE` too, so on `control` they are dead entries — kept anyway so
 * this table stays a mechanical mirror of the guard.
 * 与 roles.ts writeAllowed 对应，改一处要改两处。
 */
const ROLE_WRITE: Record<SessionRole["kind"], readonly (keyof RulePaths)[]> = {
  control: ["cycles", "subjects", "subjectBoard", "profile", "coursesBoard"],
  course: ["subjects"],
  free: ["knowledge"],
};

/**
 * No wrapped command may write these, whatever the role allows: the vault's
 * version directories, 原料 `raw/`, the vault's own rules (`wiki/prompts`,
 * root `AGENTS.md`), and everything only the dedicated tools may produce —
 * course pages plus the generated board in both spellings
 * (`wiki/courses.md`, `wiki/_generated/courses.md`), 周期, 日历. denyWrite
 * carves out of allowWrite, and the seatbelt layer also pins every entry and
 * its ancestors against rename/move (issue #8).
 */
const DENY_WRITE: readonly (keyof RulePaths)[] = [
  "version",
  "raw",
  "vaultRules",
  "courses",
  "coursesBoard",
  "cycles",
  "calendar",
];

/**
 * The sandbox configuration for one role.
 *
 * `denyRead` is exactly `deniedReadPaths`: the sandbox matches by path, so
 * the guard's credential *naming* rule under `<home>` cannot be expressed
 * here and stays in the guard — a `<home>` file whose name merely contains
 * `auth`/`token`/`secret`/`key` without being on the exact list is still
 * readable by bash (known gap, reported for the review batch).
 *
 * `allowLocalBinding` is deliberately unset: it would open every local port,
 * while AnkiConnect on `127.0.0.1:8765` is already reachable as an allowed
 * domain literal through the proxy (see the batch self-test).
 */
export function sandboxConfigFor(role: SessionRole, roots: Roots, canon: CanonFn): SandboxRuntimeConfig {
  const rules = rulePaths(roots, canon);
  const pick = (keys: readonly (keyof RulePaths)[]): string[] => keys.flatMap((key) => rules[key]);
  return {
    network: {
      allowedDomains: ["127.0.0.1:8765"],
      deniedDomains: [],
    },
    filesystem: {
      denyRead: deniedReadPaths(roots, canon).map(lit),
      allowWrite: [roots.workspace, ...rules.tmp, ...pick(ANY_SESSION_WRITE), ...pick(ROLE_WRITE[role.kind])].map(
        lit,
      ),
      denyWrite: [roots.repo, roots.home, ...pick(DENY_WRITE)].map(lit),
    },
  };
}
