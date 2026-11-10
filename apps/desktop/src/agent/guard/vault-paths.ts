/**
 * The vault's rule paths and the alias handling the guard needs.
 *
 * The vault uses the English layout (docs/platform/VAULT-NAMING.md); each rule
 * has one canonical path.
 *
 * All paths here are canonical (`guard/path.ts`); the helpers compare by path
 * segment so `/a/bc` is never inside `/a/b`.
 */

import { posix } from "node:path";
import { within } from "./path.js";

/** The canonical roots every rule compares against (V/W/H/R). */
export interface Roots {
  /** Vault root (库). */
  vault: string;
  /** Agent workspace (工作区, the session's cwd). */
  workspace: string;
  /** `XUEGEN_HOME`. */
  home: string;
  /** Repository/program root. */
  repo: string;
  /**
   * The OS temp directory (`os.tmpdir()`, canonical), when the caller knows it.
   *
   * macOS hands out `/var/folders/…/T` (canonically `/private/var/folders/…/T`),
   * not `/private/tmp`; a skill that asks the model to write a scratch file into
   * 「临时文件」must not be refused for picking that directory.
   */
  temp?: string;
}

/** Canonicalize a tool-supplied path; implementations also expand a leading `~`. */
export type CanonFn = (path: string) => string;

/** Whether a canonical path already exists on disk (原料只许新增，要靠它分辨). */
export type ExistsFn = (canonicalPath: string) => boolean;

const KNOWLEDGE = "wiki/knowledge";
const SHELF = "wiki/shelf";

/** Canonical rule paths; each entry lists the aliases a logical location has. */
export interface RulePaths {
  /** `wiki/knowledge`: every 知识 page. */
  knowledge: string[];
  /** `wiki/knowledge/extracts`: 摘录页 (reading workflow, any session). */
  extracts: string[];
  /** `wiki/knowledge/flashcards`: 卡片页 (wiki-save workflow, any session). */
  flashcards: string[];
  /** `wiki/knowledge/sources`: 来源登记页 (registration, any session). */
  sources: string[];
  /** `wiki/knowledge/synthesis`: 综合分析页 (wiki-save「整理文档关系」, any session). */
  synthesis: string[];
  /** `wiki/knowledge/entities`: 实体页 (同上). */
  entities: string[];
  /** `wiki/subjects`: 科目页 (讲解偏好 / 资料登记). */
  subjects: string[];
  subjectBoard: string[];
  cycles: string[];
  /** `wiki/courses`: one plan page per course. */
  courses: string[];
  /** 课程看板 `wiki/_generated/courses.md`。 */
  coursesBoard: string[];
  log: string[];
  index: string[];
  profile: string[];
  /** `wiki/shelf`: 整本书的进度页 (reading workflow, any session). */
  shelf: string[];
  /** `wiki/reading`: 阅读队列页 (reading workflow, any session). */
  reading: string[];
  /** 剪藏目录 (`clippings`): 原料，只许新增. */
  clippings: string[];
  /** `raw/`: 原料，只许新增、不许改. */
  raw: string[];
  /** `wiki/calendar`: 手写日历笔记，只由 `calendar.mjs` 写. */
  calendar: string[];
  /** 库规则与提示词：`wiki/prompts/**`、库根 `AGENTS.md`（只读：模型不改自己遵守的规则）. */
  vaultRules: string[];
  version: string[];
  tmp: string[];
}

/** Every rule path, canonicalized. */
export function rulePaths(roots: Roots, canon: CanonFn): RulePaths {
  const at = (path: string): string => canon(`${roots.vault}/${path}`);
  const raw = (paths: readonly string[]): string[] => paths.map(canon);
  const all = (paths: readonly string[]): string[] => paths.map(at);
  return {
    knowledge: all([KNOWLEDGE]),
    extracts: all([`${KNOWLEDGE}/extracts`]),
    flashcards: all([`${KNOWLEDGE}/flashcards`]),
    sources: all([`${KNOWLEDGE}/sources`]),
    synthesis: all([`${KNOWLEDGE}/synthesis`]),
    entities: all([`${KNOWLEDGE}/entities`]),
    subjects: all(["wiki/subjects"]),
    subjectBoard: all(["wiki/subjects.md"]),
    cycles: all(["wiki/cycles"]),
    courses: all(["wiki/courses"]),
    coursesBoard: all(["wiki/_generated/courses.md"]),
    log: all(["wiki/log.md"]),
    index: all(["wiki/index.md"]),
    profile: all(["wiki/profile.md"]),
    shelf: all([SHELF]),
    reading: all(["wiki/reading"]),
    clippings: all(["clippings"]),
    raw: all(["raw"]),
    calendar: all(["wiki/calendar"]),
    vaultRules: all(["wiki/prompts", "AGENTS.md"]),
    version: all([".git", ".jj"]),
    // Absolute paths, not vault-relative: the OS temp directory (`/private/tmp`
    // plus whatever `os.tmpdir()` resolves to, e.g. `/private/var/folders/…/T`).
    tmp: [...raw(["/private/tmp"]), ...(roots.temp === undefined ? [] : [roots.temp])],
  };
}

/** `target` is inside (or equal to) any of `dirs`. */
export function withinAny(target: string, dirs: readonly string[]): boolean {
  return dirs.some((dir) => within(target, dir));
}

/**
 * Whether `target` sits inside the vault (库优先，见 {@link isOutsideVaultScratch}).
 */
export function isInVault(target: string, roots: Roots): boolean {
  return within(target, roots.vault);
}

/**
 * Whether `target` may be treated as scratch space: 工作区 or the OS temp directory.
 *
 * 库优先：库内的路径**永远**不算草稿位置。库可能整个放在临时目录下（测试库、
 * 备份、用户把库放在 `~/tmp` 里），而规则路径又都按库根拼出来——若先看临时目录，
 * 库里的每一条规则都会被「临时目录可写」一句盖掉，`write wiki/knowledge/concepts/x.md`
 * 就从总控会话里漏了过去（11-09 真机验收）。工作区落在库里时同理：库的规则先判。
 */
export function isOutsideVaultScratch(target: string, roots: Roots, rules: RulePaths): boolean {
  if (isInVault(target, roots)) return false;
  return within(target, roots.workspace) || withinAny(target, rules.tmp);
}

/** `target` is one of `files`. */
export function isAnyFile(target: string, files: readonly string[]): boolean {
  return files.includes(target);
}

/**
 * Whether `target` (canonical) is a staging directory owned by `slug`:
 * `<workspace>/.close/<slug>-…`（阶段 3 收课事务的暂存目录）. The course session
 * may only run `course_close` on its own staging, so a `<slug>-` prefix that is
 * not this session's slug, or any directory outside `.close`, is refused.
 */
export function isOwnCloseStaging(target: string, slug: string, roots: Roots, canon: CanonFn): boolean {
  return within(target, canon(`${roots.workspace}/.close`)) && posix.basename(target).startsWith(`${slug}-`);
}

/** `target` sits directly inside one of `dirs` and ends with `suffix` (`courses/*.md`). */
export function inAnyDir(target: string, dirs: readonly string[], suffix: string): boolean {
  return dirs.some((dir) => posix.dirname(target) === dir && target.endsWith(suffix));
}

/** `courses/<slug>-*.png`: directly inside one of `dirs`, basename starts with `prefix`. */
export function prefixedInAnyDir(
  target: string,
  dirs: readonly string[],
  prefix: string,
  suffix: string,
): boolean {
  return dirs.some(
    (dir) =>
      posix.dirname(target) === dir &&
      posix.basename(target).startsWith(prefix) &&
      target.endsWith(suffix),
  );
}

/**
 * Whether a file name looks like a credential.
 *
 * The naming convention is the only signal available for files the guard does
 * not know by name: anything carrying `auth`, `token`, `secret` or `key`
 * (case-insensitive, as a substring) is treated as a credential — that covers
 * `github-token.txt`, `client_secret.json`, `api-key.md` and would rather deny a
 * harmless `keynote.md` than let a real key through.
 */
export function isCredentialName(fileName: string): boolean {
  const name = fileName.toLowerCase();
  return CREDENTIAL_NAME_PARTS.some((part) => name.includes(part));
}

const CREDENTIAL_NAME_PARTS = ["auth", "token", "secret", "key"] as const;

/**
 * Paths no role may read: credentials, keys, the system keychain.
 *
 * Reads are otherwise open (用户 2026-11-09 定：除凭据外都能读), so this list is
 * the whole read restriction and has to name every credential-bearing location
 * explicitly:
 *
 * - `<home>` by exact name (`auth.json`, `mcp-auth.json`, `models-store.json`),
 * - `<home>` by naming convention (any depth, see {@link isCredentialName}), so
 *   `github-token.txt` caught by the pattern cannot slip past the exact list,
 * - the standard credential directories of SSH, cloud CLIs, `gh`, npm and the
 *   macOS keychain (entries are *directories* or files; `within` covers both).
 *
 * Everything else under `<home>` (`wiki.json`, `guard.log`, `desktop.json`,
 * session files) is readable — the user agreed to that when reads were opened
 * up.
 *
 * `~` spellings are expanded by `canon`, so a tool path written either way
 * resolves to the same entry.
 */
export function deniedReadPaths(roots: Roots, canon: CanonFn): string[] {
  return [
    canon(`${roots.home}/auth.json`),
    canon(`${roots.home}/mcp-auth.json`),
    canon(`${roots.home}/models-store.json`),
    canon("~/.ssh"),
    canon("~/.aws"),
    canon("~/.gnupg"),
    canon("~/.config/gh"),
    canon("~/.netrc"),
    canon("~/.npmrc"),
    canon("~/.docker/config.json"),
    canon("~/Library/Keychains"),
  ];
}

/**
 * The credential *inside* `target`, for the recursive tools (`grep` / `find`).
 *
 * `read` and a plain `ls` only touch the path they name, but `grep` / `find`
 * walk the whole subtree below it. Naming an ancestor (`~`, `/Users`, `/`,
 * `~/.config`, `~/Library`) therefore reaches the credential directories
 * without ever naming them — so a search root is refused when any denied
 * entry (or `<home>` itself, whose children are credentials by name) sits
 * inside it.
 *
 * Returns the offending entry (canonical) or null when the subtree is clear.
 * `target` is canonical.
 */
export function containedCredential(target: string, roots: Roots, canon: CanonFn): string | null {
  const entries = [canon(roots.home), ...deniedReadPaths(roots, canon)];
  for (const entry of entries) {
    // `entry === target` is the direct case, already refused by
    // {@link isDeniedReadPath}; this is about what lies *below* the target.
    if (entry !== target && within(entry, target)) return entry;
  }
  return null;
}

/**
 * Whether `target` is a credential the guard refuses — the one predicate reads
 * and the shell checks share. `target` is canonical.
 */
export function isDeniedReadPath(target: string, roots: Roots, canon: CanonFn): boolean {
  // Directories compare by exact path: `<home>` itself is refused (a
  // `grep <home>` would walk into every credential file at once), while its
  // children are judged individually by the naming rule below.
  if (target === canon(roots.home)) return true;
  if (withinAny(target, deniedReadPaths(roots, canon))) return true;
  // The naming rule applies to everything under `<home>` (at any depth, so a
  // token in a subdirectory is caught too); outside it a `key` in a file name
  // is just a word and reads there are open.
  return within(target, canon(roots.home)) && isCredentialName(posix.basename(target));
}
