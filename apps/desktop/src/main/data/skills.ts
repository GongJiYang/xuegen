/**
 * Skills inventory and installation for the desktop app.
 *
 * A skill is a directory with a `SKILL.md` whose frontmatter carries `name` and
 * `description`. The app shows three sources:
 *   - `builtin`:  the repository `skills/` tree (always present),
 *   - `personal`: the user's `~/.xuegen/skills/`,
 *   - `pending`:  fetched-but-not-enabled skills in `~/.xuegen/skills-pending/`.
 *
 * Enabling is recorded in `desktop.json` (`disabledSkills`); fetching never
 * enables a skill. A pending skill is only moved into `skills/` when the user
 * turns it on.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, join, relative, sep } from "node:path";
import { repoRoot, resolveHome } from "../../agent/environment.js";
import type { DataErrorCode, SkillInfo, SkillReview } from "../../shared/data-protocol.js";

const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A skill operation failure carrying the code the renderer maps to copy. */
export class SkillError extends Error {
  constructor(
    readonly code: DataErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SkillError";
  }
}

function builtinDir(): string {
  return join(repoRoot, "skills");
}

function personalDir(): string {
  return join(resolveHome(), "skills");
}

function pendingDir(): string {
  return join(resolveHome(), "skills-pending");
}

/** Parse a SKILL.md frontmatter into `{name, description}` (single-line values). */
function readFrontmatter(file: string): { name: string; description: string } | null {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const block = match?.[1];
  if (block === undefined) return null;
  const fields: Record<string, string> = {};
  const lines = block.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const kv = (lines[index] ?? "").match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv || kv[1] === undefined || kv[2] === undefined) continue;
    let value = kv[2].trim();
    // YAML block scalars (`key: |` / `key: >`): the value is the indented lines below.
    if (/^[|>][+-]?$/.test(value)) {
      const body: string[] = [];
      while (index + 1 < lines.length && /^(\s+\S|\s*$)/.test(lines[index + 1] ?? "")) {
        index += 1;
        body.push((lines[index] ?? "").trim());
      }
      value = body.filter(Boolean).join(value.startsWith(">") ? " " : "\n");
    }
    fields[kv[1]] = value.replace(/^(["'])(.*)\1$/, "$2");
  }
  return { name: fields.name ?? "", description: fields.description ?? "" };
}

/** Read every skill directory under `dir` into `SkillInfo.` */
function readSkillDir(dir: string, source: SkillInfo["source"]): SkillInfo[] {
  if (!existsSync(dir)) return [];
  const out: SkillInfo[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const frontmatter = readFrontmatter(join(dir, entry.name, "SKILL.md"));
    if (!frontmatter || !frontmatter.name) continue;
    out.push({ name: frontmatter.name, description: frontmatter.description, source, enabled: false });
  }
  return out;
}

/**
 * List all skills with their enabled flag.
 *
 * Builtin and personal skills come first (builtin wins a name clash), then any
 * pending skills not already enabled. `disabledSkills` marks a skill disabled;
 * a pending skill is always shown as disabled because it is not enabled yet.
 */
export function listSkills(disabledSkills: string[]): SkillInfo[] {
  const disabled = new Set(disabledSkills);
  const builtin = readSkillDir(builtinDir(), "builtin");
  const seen = new Set(builtin.map((skill) => skill.name));
  const personal = readSkillDir(personalDir(), "personal").filter((skill) => !seen.has(skill.name));
  for (const skill of personal) seen.add(skill.name);
  const pending = readSkillDir(pendingDir(), "pending").filter((skill) => !seen.has(skill.name));

  return [...builtin, ...personal, ...pending]
    .map((skill) => ({
      ...skill,
      enabled: skill.source === "pending" ? false : !disabled.has(skill.name),
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Where a pending skill came from; written next to its SKILL.md. */
const SOURCE_FILE = ".xuegen-source.json";

/** Files a reviewer should look at closely: anything the agent could execute. */
const EXECUTABLE_RE = /\.(mjs|cjs|js|ts|sh|bash|zsh|py|rb|pl)$/i;

/** Largest SKILL.md shown in the review dialog (bytes). */
const REVIEW_MAX_BYTES = 64 * 1024;

/**
 * Fetch every skill a repository contains into `~/.xuegen/skills-pending/`.
 *
 * The repository is cloned into a scratch directory, then each `SKILL.md`
 * within three levels (repos often keep skills under `skills/<name>/`) is
 * copied out as its own pending skill, named by its frontmatter `name`. Only a
 * missing SKILL.md or an invalid `name` rejects a skill: authoring-rule
 * problems are shown in the review dialog instead, because third-party skills
 * do not follow Xuegen's own rules. Nothing is enabled here.
 */
export async function fetchSkill(url: string): Promise<{ skills: { name: string; path: string }[] }> {
  if (!/^https:\/\/[^\s]+$/.test(url)) throw new SkillError("skill-url", "只允许 https 仓库地址。");
  mkdirSync(pendingDir(), { recursive: true, mode: 0o700 });
  const scratch = mkdtempSync(join(pendingDir(), ".fetch-"));
  try {
    const repo = join(scratch, "repo");
    gitClone(url, repo, resolveHome());
    const commit = gitHead(repo);
    const found = findSkillDirs(repo, 3);
    if (found.length === 0) throw new SkillError("skill-invalid", "仓库里没有找到 SKILL.md。");

    const skills: { name: string; path: string }[] = [];
    for (const dir of found) {
      const frontmatter = readFrontmatter(join(dir, "SKILL.md"));
      if (!frontmatter || !SKILL_NAME_RE.test(frontmatter.name)) continue;
      const target = join(pendingDir(), frontmatter.name);
      if (existsSync(target) || existsSync(join(personalDir(), frontmatter.name))) {
        throw new SkillError("skill-exists", `已存在同名技能：${frontmatter.name}`);
      }
      cpSync(dir, target, { recursive: true, filter: (src) => !src.split(sep).includes(".git") });
      const subdir = relative(repo, dir).split(sep).join("/") || ".";
      writeFileSync(
        join(target, SOURCE_FILE),
        JSON.stringify({ url, commit, subdir, fetchedAt: new Date().toISOString() }, null, 2),
      );
      skills.push({ name: frontmatter.name, path: target });
    }
    if (skills.length === 0) {
      throw new SkillError("skill-invalid", "SKILL.md 的 name 不合法（应为小写字母、数字与连字符）。");
    }
    return { skills };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Directories (depth ≤ `maxDepth`) that contain a SKILL.md, skipping `.git`. */
function findSkillDirs(root: string, maxDepth: number): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (existsSync(join(dir, "SKILL.md"))) {
      out.push(dir);
      return;
    }
    if (depth >= maxDepth) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
        walk(join(dir, entry.name), depth + 1);
      }
    }
  };
  walk(root, 0);
  return out;
}

/**
 * Shallow-clone `url` into `target`. Network access happens only here.
 *
 * Repository hooks are disabled and submodules are not fetched; the URL comes
 * after `--` so it can never be read as an option.
 */
function gitClone(url: string, target: string, cwd: string): void {
  try {
    execFileSync(
      "git",
      ["-c", "core.hooksPath=/dev/null", "clone", "--depth", "1", "--no-recurse-submodules", "--", url, target],
      { cwd, stdio: "pipe", timeout: 120_000 },
    );
  } catch (error) {
    const detail = (error as { stderr?: Buffer }).stderr?.toString().trim();
    throw new SkillError("skill-invalid", `git clone 失败：${detail || (error as Error).message}`);
  }
}

/** The cloned commit, so the review dialog can show exactly what was fetched. */
function gitHead(repo: string): string {
  try {
    return execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { stdio: "pipe" }).toString().trim();
  } catch {
    return "";
  }
}

/** Everything the user needs to decide whether to enable a pending skill. */
export function reviewSkill(name: string): SkillReview {
  const dir = pendingSkillDir(name);
  const frontmatter = readFrontmatter(join(dir, "SKILL.md"));
  const skillMd = readFileSync(join(dir, "SKILL.md"), "utf8");
  let source: { url?: string; commit?: string; subdir?: string } = {};
  try {
    source = JSON.parse(readFileSync(join(dir, SOURCE_FILE), "utf8")) as typeof source;
  } catch {
    // An older pending skill without provenance: show what we have.
  }
  const files = listFiles(dir)
    .filter((file) => file.path !== SOURCE_FILE)
    .map((file) => ({ ...file, executable: EXECUTABLE_RE.test(file.path) }));
  return {
    name,
    description: frontmatter?.description ?? "",
    url: source.url ?? "",
    commit: source.commit ?? "",
    subdir: source.subdir ?? "",
    skillMd: skillMd.length > REVIEW_MAX_BYTES ? `${skillMd.slice(0, REVIEW_MAX_BYTES)}\n…（已截断）` : skillMd,
    files,
    lint: lintIssues(dir),
  };
}

/** Delete a pending skill (the user rejected it in review). */
export function discardSkill(name: string): void {
  rmSync(pendingSkillDir(name), { recursive: true, force: true });
}

/** Resolve a pending skill directory, rejecting names that are not plain skill names. */
function pendingSkillDir(name: string): string {
  if (!SKILL_NAME_RE.test(name)) throw new SkillError("skill-invalid", `技能名不合法：${name}`);
  const dir = join(pendingDir(), name);
  if (!existsSync(join(dir, "SKILL.md"))) throw new SkillError("skill-invalid", `待审核区没有这个技能：${name}`);
  return dir;
}

/** Every file under `dir` (relative POSIX paths), with sizes. */
function listFiles(dir: string): { path: string; size: number }[] {
  const out: { path: string; size: number }[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push({ path: relative(dir, full).split(sep).join("/"), size: statSync(full).size });
    }
  };
  walk(dir);
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}

/** Xuegen's authoring-rule findings for a skill, as hints (never a rejection). */
function lintIssues(dir: string): { errors: string[]; warnings: string[] } {
  const script = join(repoRoot, "scripts", "lint-skills.mjs");
  const parent = mkdtempSync(join(pendingDir(), ".lint-"));
  try {
    // lint-skills takes a skills root; give it a root holding just this skill.
    cpSync(dir, join(parent, basename(dir)), { recursive: true });
    let stdout = "";
    try {
      stdout = execFileSync(process.execPath, [script, "--json", parent], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        stdio: "pipe",
      }).toString();
    } catch (error) {
      stdout = (error as { stdout?: Buffer }).stdout?.toString() ?? "";
    }
    const report = JSON.parse(stdout || "{}") as { errors?: unknown[]; warnings?: unknown[] };
    const text = (items: unknown[] | undefined) => (items ?? []).map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
    return { errors: text(report.errors), warnings: text(report.warnings) };
  } catch {
    return { errors: [], warnings: ["无法运行规范检查。"] };
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

/**
 * Move a pending skill into `~/.xuegen/skills/` so the agent can load it.
 *
 * Called when the user enables a skill from the review dialog. A skill that is
 * already builtin or personal needs no move; a name that exists nowhere is an
 * error, never a silent no-op.
 */
export function promotePendingSkill(name: string): void {
  const from = join(pendingDir(), name);
  if (!existsSync(from)) {
    const known = existsSync(join(personalDir(), name, "SKILL.md")) || existsSync(join(builtinDir(), name, "SKILL.md"));
    if (known) return;
    throw new SkillError("skill-invalid", `找不到技能：${name}`);
  }
  const to = join(personalDir(), name);
  if (existsSync(to)) throw new SkillError("skill-exists", `已存在同名技能：${name}`);
  mkdirSync(personalDir(), { recursive: true, mode: 0o700 });
  try {
    renameSync(from, to);
  } catch {
    // Cross-device rename fails; fall back to copy + remove.
    cpSync(from, to, { recursive: true });
    rmSync(from, { recursive: true, force: true });
  }
}
