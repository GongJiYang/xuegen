/**
 * The bash / powershell checks that are decidable at the tool layer
 * (ARCH-DISCUSSION-1109 §7.1「bash」行; the complete restriction lands with
 * the stage-4 system sandbox, so this stays deliberately small).
 *
 * Four things can be judged from the command text alone:
 *
 * - a credential path in the command (the same predicate the read rule uses),
 * - `rm -rf`-like deletion whose targets are outside the workspace,
 * - `chmod` / `chflags` on a course page, which only `course-state.mjs` runs,
 * - `pdftotext` asking for more than 10 pages at once（用户 11-08 定：课上读原书
 *   一次不超过 10 页；这条规矩原先只在技能文字里，模型照样跑 `-f 1 -l 20`）。
 *
 * Everything else passes and is audited by the caller.
 */

import { isDeniedReadPath, isOutsideVaultScratch, rulePaths, withinAny, type CanonFn, type Roots } from "./vault-paths.js";
import type { Decision } from "./roles.js";

const RM = /\brm\b/;
const CHMOD = /\b(?:chmod|chflags)\b/;
const COURSE_STATE = /course-state\.mjs/;
const PDFTOTEXT = "pdftotext";
/** 课上读原书一次最多读的页数（用户 11-08 定）。 */
const MAX_PDF_PAGES = 10;
const TOO_MANY_PAGES =
  "：原书一次最多读 10 页（pdftotext -f <起> -l <止>，止 − 起 + 1 ≤ 10）；要看更多就分几次读，找章节先看 PDF 书签或目录页。";

/**
 * Whether this `rm` segment asks for a recursive removal.
 *
 * `rm -r`, `-rf`, `-Rf` and `--recursive` are all the same danger; matching only
 * the literal spelling from the spec would let `rm -fr <vault>` through while
 * blocking `rm -rf`.
 */
function isRecursiveRm(segment: string): boolean {
  const tokens = segment.trim().split(/\s+/);
  const index = tokens.findIndex((token) => token === "rm" || token.endsWith("/rm"));
  if (index < 0) return false;
  for (const token of tokens.slice(index + 1)) {
    if (token === "--recursive") return true;
    // A short flag cluster (`-rf`, `-fr`, `-Rf`) that contains `r`/`R`.
    if (/^-[a-zA-Z]+$/.test(token) && /[rR]/.test(token.slice(1))) return true;
  }
  return false;
}

function deny(reason: string): Decision {
  return { allow: false, reason };
}

/** Judge one shell command for `label` (the role's name, as reasons address it). */
export function decideBash(
  label: string,
  command: unknown,
  roots: Roots,
  canon: CanonFn,
): Decision {
  if (typeof command !== "string" || command.trim() === "") return { allow: true, reason: "" };
  const rules = rulePaths(roots, canon);
  const paths = commandPaths(command, canon);
  for (const target of paths) {
    if (isDeniedReadPath(target, roots, canon)) {
      return deny(`${label}不能碰 ${target}：凭据和密钥不属于学习材料，不要在命令里读或动它。`);
    }
  }
  if (RM.test(command)) {
    for (const target of rmTargets(command, canon)) {
      // 库优先：库内的目标即使也在临时目录（库落在 `/private/tmp` 下的情形）里，
      // 也不算草稿位置——库不是可以整块删掉的草稿。
      if (!isOutsideVaultScratch(target, roots, rules)) {
        return deny(
          `${label}：递归删除（rm -r / rm -rf）的目标 ${target} 不在工作区或 /private/tmp 里，拒绝执行；要清理请限定在工作区内。`,
        );
      }
    }
  }
  if (CHMOD.test(command) && !COURSE_STATE.test(command)) {
    for (const target of paths) {
      if (withinAny(target, rules.courses)) {
        return deny(`${label}不能给课程页改权限：课程页的锁只由 course-state.mjs 脚本动。`);
      }
    }
  }
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const pages = pdftotextPages(segment);
    if (pages === null) continue;
    const { from, to } = pages;
    // 缺任何一头（整本 `pdftotext x.pdf -`、只给 `-f`）就判断不了读几页，拒绝。
    if (from === undefined || to === undefined) {
      return deny(`${label}${TOO_MANY_PAGES}`);
    }
    // `-f $A` 这类非数字的值判断不了，放行（与 rm 的 best-effort 一致）。
    if (typeof from !== "number" || typeof to !== "number") continue;
    if (to - from + 1 > MAX_PDF_PAGES) return deny(`${label}${TOO_MANY_PAGES}`);
  }
  return { allow: true, reason: "" };
}

/**
 * The `-f` / `-l` page range of a `pdftotext` segment, or `null` when this
 * segment does not run `pdftotext`.
 *
 * Only a command-position `pdftotext` counts (the segment's first word, or an
 * absolute path like `/opt/homebrew/bin/pdftotext`), so a filename or an
 * argument that merely contains the word is left alone. Per side, `undefined`
 * means the flag is absent and `null` means its value is not a plain number
 * (`-f $A`): absent is a refusal, undecidable is a pass.
 */
function pdftotextPages(segment: string): { from?: number | null; to?: number | null } | null {
  const tokens = segment.trim().split(/\s+/).filter((token) => token !== "");
  const strip = (token: string | undefined): string | undefined => token?.replace(/^["'`]+|["'`]+$/g, "");
  const first = strip(tokens[0]);
  if (first !== PDFTOTEXT && !first?.endsWith(`/${PDFTOTEXT}`)) return null;
  const pages: { from?: number | null; to?: number | null } = {};
  for (let index = 1; index < tokens.length; index += 1) {
    const token = strip(tokens[index]);
    if (token !== "-f" && token !== "-l") continue;
    const value = strip(tokens[index + 1]);
    const parsed = value !== undefined && /^\d+$/.test(value) ? Number(value) : null;
    if (token === "-f") pages.from = parsed;
    else pages.to = parsed;
    index += 1;
  }
  return pages;
}

/**
 * Path-looking tokens in a shell command, canonicalized.
 *
 * A token counts as path-ish when it contains `/` or starts with `~`/`.`;
 * everything else (flags, words, substitutions) is ignored. Best-effort by
 * design — the full guarantee lands with the stage-4 system sandbox.
 */
function commandPaths(command: string, canon: CanonFn): string[] {
  const results: string[] = [];
  for (const raw of command.split(/\s+/)) {
    const token = raw.replace(/^["'`]+|["'`]+$/g, "");
    if (token === "" || token.startsWith("-")) continue;
    if (!token.includes("/") && !token.startsWith("~") && !token.startsWith(".")) continue;
    try {
      results.push(canon(token));
    } catch {
      // A token that does not canonicalize is not a usable path; skip it.
    }
  }
  return results;
}

/** The canonical targets of each recursive `rm` segment in `command`. */
function rmTargets(command: string, canon: CanonFn): string[] {
  const targets: string[] = [];
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    if (!isRecursiveRm(segment)) continue;
    let seenRm = false;
    for (const raw of segment.trim().split(/\s+/)) {
      const token = raw.replace(/^["']+|["']+$/g, "");
      if (!seenRm) {
        if (token === "rm" || token.endsWith("/rm")) seenRm = true;
        continue;
      }
      if (token === "" || token.startsWith("-")) continue;
      try {
        targets.push(canon(token));
      } catch {
        // Unresolvable argument: rm will fail on it anyway.
      }
    }
  }
  return targets;
}
