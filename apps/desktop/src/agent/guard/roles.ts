/**
 * The session-role permission lists, hard-coded (ARCH-DISCUSSION-1109 §7.1;
 * AuthBench shows model-generated permissions do not converge to least
 * privilege, so the lists live in code and can only tighten).
 *
 * Every rule is a "tool + argument" check in the Progent style: `decide` is a
 * pure function — paths arrive canonical via `canon`, existence arrives via
 * `exists` (raw material may only be *added*, so the check has to tell a new
 * clip from an existing one), and the returned reason tells the model which
 * role denied it and what to do instead, in Chinese.
 *
 * The lists follow `docs/platform/PRINCIPLES.md` 四类划分:
 *
 * - 原料 (`raw/`、剪藏): `raw/` is 用户放入的材料，AI only reads it; 剪藏
 *   (`Clippings`/`clippings`) may only grow — a `write` to a path that does not
 *   exist yet passes, an existing file is never overwritten or edited (原料不变).
 * - 知识 (`wiki/知识`): 概念页只经 `course_close` 收课写入（阶段 3）；the
 *   extract, card, source, entity and synthesis pages come out of the reading
 *   and wiki-save workflows any session can run, so those stay open to every
 *   role — and free sessions still write knowledge pages directly.
 * - 意图 (`profile.md`、`subjects*`、`cycles/`) and plan-level 进度
 *   (`courses/*.md`、课程看板) belong to the 总控 session；课程页同样只经
 *   `course_close`，不经 write/edit。
 * - 进度 pages no course owns (`书房`、`reading/`、`log.md`、`index.md`) are
 *   written from whatever session the user is in; 日历 (`calendar/`) is written
 *   only through `calendar.mjs`, so no role writes it with a file tool.
 * - 库规则 (`wiki/prompts/**`、库根 `AGENTS.md`) are never written: the model
 *   must not edit the rules it follows.
 * - 读取 (read / grep / find / ls) is unrestricted except for credentials: the
 *   user decided (2026-11-09) that any file outside the credential list may be
 *   read, in every role. `grep` / `find` add one rule because they walk a
 *   subtree: a search root that contains a credential directory is refused
 *   too, otherwise `grep ~` would read it without naming it.
 */

import { posix } from "node:path";
import type { SessionRole } from "../../shared/protocol.js";
import { decideBash } from "./bash.js";
import {
  containedCredential,
  inAnyDir,
  isAnyFile,
  isDeniedReadPath,
  isOutsideVaultScratch,
  isOwnCloseStaging,
  rulePaths,
  withinAny,
  type CanonFn,
  type RulePaths,
  type Roots,
} from "./vault-paths.js";
import { within } from "./path.js";

export type { CanonFn, ExistsFn, Roots } from "./vault-paths.js";
import type { ExistsFn } from "./vault-paths.js";

export interface Decision {
  allow: boolean;
  /** Why the call was denied (Chinese, addressed to the model); empty on allow. */
  reason: string;
}

const READ_TOOLS = new Set(["read", "grep", "find", "ls"]);
const WRITE_TOOLS = new Set(["write", "edit"]);
const BASH_TOOLS = new Set(["bash", "powershell"]);

/**
 * The tools whose first argument names a path.
 *
 * `grep` / `find` / `ls` take an optional `path` (the search root) under the same
 * field name `read` / `write` / `edit` use, so one lookup covers every path tool.
 * A missing path means the session cwd, which every role may read.
 */
const PATH_ARG_TOOLS = new Set(["read", "grep", "find", "ls", "write", "edit"]);

/**
 * The read tools that walk everything below the path they name.
 *
 * `read` and `ls` only open the one path (Pi's `ls` lists a single directory, it
 * has no recursive flag), so naming an ancestor is harmless. `grep` and `find`
 * search the whole subtree, so naming a credential's ancestor would reach the
 * credential without naming it — see {@link decideRead}.
 */
const RECURSIVE_READ_TOOLS = new Set(["grep", "find"]);

const ALLOW: Decision = { allow: true, reason: "" };

function deny(reason: string): Decision {
  return { allow: false, reason };
}

/** The role's name as reasons address it. */
export function roleLabel(role: SessionRole): string {
  switch (role.kind) {
    case "control":
      return "总控会话";
    case "course":
      return `课程会话（${role.slug}）`;
    case "free":
      return "自由会话";
  }
}

/**
 * Judge a path-bearing tool call against the role's list.
 *
 * `exists` only matters for writes into 原料 (a new file may be added, an
 * existing one may not be touched); every other rule is path-only.
 */
export function decide(
  role: SessionRole,
  tool: string,
  input: Record<string, unknown>,
  roots: Roots,
  canon: CanonFn,
  exists: ExistsFn,
): Decision {
  const path =
    PATH_ARG_TOOLS.has(tool) && typeof input.path === "string" && input.path !== ""
      ? input.path
      : null;
  if (READ_TOOLS.has(tool)) return decideRead(role, tool, path, roots, canon);
  if (WRITE_TOOLS.has(tool)) return decideWrite(role, tool, path, roots, canon, exists);
  if (BASH_TOOLS.has(tool)) return decideBash(roleLabel(role), input.command, roots, canon);
  if (tool === "course_close") return decideCourseClose(role, input, roots, canon);
  return ALLOW;
}

/** `course_close`（tools/course-close-tool.ts）：只有课程会话能收课，且只收本课
 * （slug 等于本课 slug、staging 是本课的 `.close/<slug>-*`）；`add` 的 `path`
 * 只查形状（归属由脚本 `isOwned` 判）；缺参数留给工具自己报错。 */
function decideCourseClose(role: SessionRole, input: Record<string, unknown>, roots: Roots, canon: CanonFn): Decision {
  if (role.kind !== "course") return deny(`${roleLabel(role)}不能收课；收课请在那门课的会话里做。`);
  if (typeof input.slug === "string" && input.slug !== "" && input.slug !== role.slug) {
    return deny(`课程会话（${role.slug}）只能收自己这门课。`);
  }
  if (typeof input.staging === "string" && input.staging !== "" && !isOwnCloseStaging(canon(input.staging), role.slug, roots, canon)) {
    return deny("暂存目录不属于这门课。");
  }
  if (input.action === "add" && typeof input.path === "string" && (posix.isAbsolute(input.path) || input.path.split("/").includes(".."))) {
    return deny("add 的 path 必须是库内相对路径：不能是绝对路径，也不能含 ..。");
  }
  return ALLOW;
}

/**
 * read / grep / find / ls: everything is readable except credentials.
 *
 * 用户 2026-11-09 定：模型可以读库以外的文件（`~/Downloads/某篇.pdf`、`/etc/hosts`
 * 都要能读），只有凭据与密钥不能读。所以读取没有位置清单，只有一条拒绝：
 * `isDeniedReadPath`（`<home>` 的凭据文件与系统凭据目录）。写入规则不受影响。
 *
 * 递归工具（`grep` / `find`）多一条：搜索根是某条凭据目录的祖先时也拒绝——
 * `grep ~`、`find /` 不会点名凭据，却会把整个子树走一遍，等于绕过上面的清单。
 */
function decideRead(role: SessionRole, tool: string, path: string | null, roots: Roots, canon: CanonFn): Decision {
  const target = canon(path ?? ".");
  if (isDeniedReadPath(target, roots, canon)) {
    return deny(`${roleLabel(role)}不能读 ${target}：凭据和密钥不属于学习材料，换个方式完成，不要读它。`);
  }
  if (RECURSIVE_READ_TOOLS.has(tool)) {
    const inside = containedCredential(target, roots, canon);
    if (inside !== null) {
      return deny(
        `${roleLabel(role)}不能用 ${tool} 搜 ${target}：这个目录里含凭据目录 ${inside}，递归搜索会把它读出来；请缩小搜索范围。`,
      );
    }
  }
  return ALLOW;
}

/** write / edit: hard denies first, then new raw material, then the role's set. */
function decideWrite(
  role: SessionRole,
  tool: string,
  path: string | null,
  roots: Roots,
  canon: CanonFn,
  exists: ExistsFn,
): Decision {
  if (path === null) return deny("write/edit 缺少有效的 path 参数。");
  const target = canon(path);
  const rules = rulePaths(roots, canon);
  const hardDeny = hardDenyReason(target, roots, rules);
  if (hardDeny) return deny(`${roleLabel(role)}不能写${hardDeny}：这是对所有角色都生效的硬性限制。`);
  // 库优先：库内的写入只看库的规则；工作区与临时目录的放行只给库外（库整个放在
  // 临时目录下时，先看临时目录会让库的全部规则失效）。工作区落在库里时同理。
  if (!within(target, roots.vault) && !isOutsideVaultScratch(target, roots, rules)) {
    return deny(`${roleLabel(role)}只能写库、工作区和 /private/tmp；${target} 不在可写范围。`);
  }
  // 原料只许新增：剪藏目录里可以放一份新文件，既有文件不许改（准则第 1 条）。`reading`
  // 的剪藏流程就是用 write 存 `clippings/<标题>.md`，所以这条例外是必要的。
  if (withinAny(target, rules.clippings)) return decideRawWrite(role, tool, target, exists);
  if (writeAllowed(role, target, roots, rules)) return ALLOW;
  return deny(writeDenyReason(role, target, rules));
}

/** 原料 may only be *added*: a `write` to a path that does not exist yet passes. */
function decideRawWrite(role: SessionRole, tool: string, target: string, exists: ExistsFn): Decision {
  if (tool === "write" && !exists(target)) return ALLOW;
  return deny(
    `${roleLabel(role)}不能改动 ${target}：原料只许新增。同名或同路径的文件已经存在就沿用它，不要覆盖、改写或删除。`,
  );
}

/** Places no role may ever write, or null when `target` is clear of them. */
function hardDenyReason(target: string, roots: Roots, rules: RulePaths): string | null {
  if (withinAny(target, rules.version)) return "库的版本目录";
  if (within(target, roots.repo)) return "程序代码目录";
  if (within(target, roots.home)) return "学根自己的目录";
  // `raw/` 是用户放进来的外界材料，AI 只读（准则第 1 条「原料…AI 只读」）。教材进
  // `raw/books/` 由用户同意后用 bash 复制（`cp`，不移动原文件），不经 write/edit。
  if (withinAny(target, rules.raw)) return "原料目录 raw/（原料 AI 只读，新增也走复制不当写入）";
  // 库规则 `wiki/prompts/**`（制卡规则等）与库根 `AGENTS.md`：wiki-save 与 cycle-plan 都写明
  // 「不修改规则文件或库内原有 prompts」，而模型正在按这些规则做事——不能改自己遵守的规则。
  if (withinAny(target, rules.vaultRules)) return "库内提示词与规则文件（模型不改自己遵守的规则）";
  if (target === roots.vault) return "库根目录（请写到具体的页面文件）";
  return null;
}

/** The role's writable set inside the vault (workspace and temp already excluded for 库内). */
function writeAllowed(role: SessionRole, target: string, roots: Roots, rules: RulePaths): boolean {
  // 库外的工作区与临时目录是每个角色的草稿空间（库内的目标已经在 decideWrite 里
  // 被挡在草稿位置之外了，见 `isOutsideVaultScratch`）。
  if (isOutsideVaultScratch(target, roots, rules)) return true;
  // 进度 pages no course owns, plus the 知识 pages the reading / wiki-save
  // workflows produce: the user can run those from any session, so denying them
  // would refuse a normal flow.
  if (withinAny(target, rules.shelf)) return true;
  if (withinAny(target, rules.reading)) return true;
  // 摘录、卡片、来源登记出自 reading 与 wiki-save：阅读面板在任何会话里都能用，
  // 只认课程会话会把正常流程拦下（误拦之三）。
  if (withinAny(target, rules.extracts)) return true;
  if (withinAny(target, rules.flashcards)) return true;
  if (withinAny(target, rules.sources)) return true;
  // wiki-save「整理文档关系」也产分析与实体页，同样可能发生在任何会话里。
  if (withinAny(target, rules.synthesis)) return true;
  if (withinAny(target, rules.entities)) return true;
  // Append-only registers: every workflow appends to the log or registers a page.
  if (isAnyFile(target, rules.log) || isAnyFile(target, rules.index)) return true;
  switch (role.kind) {
    case "control":
      // Plan-level work: cycles, subject pages (material registration, 讲解偏好),
      // the board, and the course plan pages.
      return (
        withinAny(target, rules.cycles) ||
        withinAny(target, rules.subjects) ||
        isAnyFile(target, rules.subjectBoard) ||
        isAnyFile(target, rules.profile) ||
        isAnyFile(target, rules.coursesBoard) ||
        inAnyDir(target, rules.courses, ".md")
      );
    case "course":
      // 阶段 3：课程页（含 records、snapshots、<slug>-*.png）与概念页只经
      // `course_close` 收课写入；直接写的只剩本科目页（「讲解偏好」）。
      return withinAny(target, rules.subjects);
    case "free":
      // Free questions still整理 into 知识 when the user asks; nothing
      // plan-level is writable from here.
      return withinAny(target, rules.knowledge);
  }
}

/** A specific denial for writes that named a place the role cannot touch. */
function writeDenyReason(role: SessionRole, target: string, rules: RulePaths): string {
  // 阶段 3：课程会话写课程页/概念页只走收课事务（这条挡在其它原因之前；能走到
  // 这里的 `wiki/知识` 路径只剩概念页，共享子目录已在 writeAllowed 放行）。
  if (role.kind === "course" && (withinAny(target, rules.courses) || withinAny(target, rules.knowledge))) {
    return "课程页和概念页只能经 course_close 收课写入：先 stage，在暂存目录里改，再 check、commit。";
  }
  if (role.kind !== "control" && (withinAny(target, rules.courses) || isAnyFile(target, rules.coursesBoard))) {
    return `${roleLabel(role)}不能改课程页和课程看板；要改计划请到总控会话。`;
  }
  if (role.kind !== "control" && withinAny(target, rules.cycles)) {
    return `${roleLabel(role)}不能改周期页；周期安排由总控会话来改。`;
  }
  if (role.kind !== "control" && (withinAny(target, rules.subjects) || isAnyFile(target, rules.subjectBoard))) {
    return role.kind === "course"
      ? `${roleLabel(role)}不能改科目页：讲解偏好只写本科目页的「讲解偏好」一节，资料登记归总控会话。`
      : `${roleLabel(role)}不能改科目页；讲解偏好和资料登记都在课程会话或总控会话里做。`;
  }
  if (role.kind === "control" && withinAny(target, rules.knowledge)) {
    return "总控会话不写知识页：知识在课程收课时写，请到那门课的会话里做（摘录、卡片、来源登记不受此限）。";
  }
  if (role.kind !== "control" && isAnyFile(target, rules.profile)) {
    return `${roleLabel(role)}不能写全局偏好页；只有用户明确要求时由总控会话写。`;
  }
  // 日历笔记只经 `calendar.mjs` 写（原子写入、正文为空时删文件）；模型直接写会
  // 跳过这两条规则，所以在所有角色上都拒绝。
  if (withinAny(target, rules.calendar)) {
    return `${roleLabel(role)}不能直接写日历笔记；日历只经 calendar 脚本写（原子写入，正文为空时删文件）。请在对话里让脚本记，别手写文件。`;
  }
  return `${roleLabel(role)}不允许写 ${target}：这个位置不在它的可写清单里，请把工作放进允许的位置。`;
}
