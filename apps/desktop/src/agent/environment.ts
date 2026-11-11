/**
 * Isolation setup shared by the agent process and the smoke script.
 *
 * Pi captures filesystem paths from the environment when its modules load, so
 * this must run before `@earendil-works/pi-coding-agent` is imported. It mirrors
 * the setup in `bin/xuegen.mjs`: same personal directory (`XUEGEN_HOME`), same
 * `AI_AGENT` marker, and no `PI_*` overrides leaking in from the shell.
 */

import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readlinkSync, renameSync, rmSync, symlinkSync, type Stats } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Repository root, shared by the CLI and the desktop app.
 *
 * The main process passes it explicitly (`XUEGEN_REPO_ROOT`) because once this
 * module is bundled its file path no longer sits at the same depth as its source.
 * The fallbacks are the packaged app's `Resources/xuegen` (extra resources) and
 * then walking up from this file until the root `package.json` is found, which
 * also covers the smoke script running from source.
 */
export function findRepoRoot(): string {
  const fromEnv = process.env.XUEGEN_REPO_ROOT;
  if (fromEnv && existsSync(join(fromEnv, "package.json"))) return resolve(fromEnv);

  // Packaged app: the repository files ship as extra resources (electron-builder.json).
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resources) {
    const bundled = join(resources, "xuegen");
    if (existsSync(join(bundled, "package.json")) && existsSync(join(bundled, "instructions.md")))
      return bundled;
  }

  let current = dirname(fileURLToPath(import.meta.url));
  const { root } = parse(current);
  while (true) {
    if (existsSync(join(current, "package.json")) && existsSync(join(current, "instructions.md"))) {
      return current;
    }
    if (current === root) break;
    current = dirname(current);
  }
  throw new Error("找不到 Xuegen 仓库根目录（缺少 instructions.md/package.json）");
}

export const repoRoot = findRepoRoot();

/**
 * A stable path for the repository files that follows the *installation*, not
 * the version.
 *
 * Pi writes the skill directories into the system prompt, so a session's
 * transcript keeps replaying whatever path it was started with. In a packaged
 * app that path is `<app>.app/Contents/Resources/xuegen/skills`, which changes
 * whenever the app is reinstalled or a new version lands somewhere else — and
 * an old session then tries to read a path that no longer exists before it
 * gives up and looks around. Pointing `<home>/app` at the current root keeps
 * the path Pi sees constant across versions; the link is refreshed when the
 * install moves. A plain directory or file at `<home>/app` is left alone (it
 * is not ours), and any failure falls back to the root itself so the agent
 * still starts.
 */
export function stableRoot(home: string, root: string = repoRoot): string {
  const appPath = join(home, "app");
  try {
    mkdirSync(home, { recursive: true, mode: 0o700 });
    const existing = lstatOrNull(appPath);
    if (existing && !existing.isSymbolicLink()) return root;
    if (existing) {
      // A relative link target is resolved against the directory holding the link.
      if (resolve(home, readlinkSync(appPath)) === resolve(root)) return appPath;
    }
    pointAt(appPath, root);
    return appPath;
  } catch {
    return root;
  }
}

/** `lstat` that reports a missing path as null instead of throwing. */
function lstatOrNull(path: string): Stats | null {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Replace `<home>/app` with a symlink to `root`, atomically via a temp link. */
function pointAt(appPath: string, root: string): void {
  const temporary = `${appPath}.tmp-${process.pid}`;
  rmSync(temporary, { force: true });
  symlinkSync(resolve(root), temporary);
  renameSync(temporary, appPath);
}

/** Where the user's Xuegen state lives, shared with the CLI. */
export function resolveHome(): string {
  return resolve(process.env.XUEGEN_HOME || join(homedir(), ".xuegen"));
}

/** Directories that hold the tools Xuegen shells out to (`jj`, `node`, `pdftotext`). */
const darwinToolDirs = ["/opt/homebrew/bin", "/usr/local/bin"];
/** What macOS gives a process launched from Finder or the Dock. */
const darwinSystemPath = "/usr/bin:/bin:/usr/sbin:/sbin";

/**
 * Make sure the tools Xuegen spawns can be found.
 *
 * An app opened from Finder or the Dock inherits no shell PATH — only
 * `/usr/bin:/bin:/usr/sbin:/sbin` — so `jj`, `node` and `pdftotext` in
 * `/opt/homebrew/bin` are invisible and `spawnSync jj` fails with ENOENT.
 * Prepending the Homebrew directories fixes it for every call site at once.
 * Missing directories and directories already on PATH are skipped, so the
 * result is stable when PATH is a login shell's (the CLI and test runs).
 */
export function withToolPath(
  path: string | undefined,
  exists: (dir: string) => boolean,
  platform: string,
): string {
  const current = path ?? "";
  if (platform !== "darwin") return current;

  const entries = (path ?? darwinSystemPath).split(":");
  const missing = darwinToolDirs.filter((dir) => !entries.includes(dir) && exists(dir));
  return [...missing, ...entries].join(":");
}

/**
 * Apply the same environment isolation the CLI applies, before Pi is imported.
 * Idempotent, so the agent process and the smoke script can both call it.
 */
export function applyXuegenEnvironment(): { home: string; cwd: string } {
  const home = resolveHome();
  mkdirSync(home, { recursive: true, mode: 0o700 });

  try {
    copyFileSync(
      join(repoRoot, "defaults/settings.json"),
      join(home, "settings.json"),
      constants.COPYFILE_EXCL,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }

  process.env.PI_CODING_AGENT_DIR = home;
  process.env.XUEGEN_HOME = home;
  delete process.env.PI_CODING_AGENT_SESSION_DIR;
  delete process.env.PI_PACKAGE_DIR;
  process.env.PI_CODING_AGENT = "true";
  process.env.AI_AGENT = "xuegen";
  // An app opened from Finder/Dock has no shell PATH, so `jj`, `pdftotext` and
  // `node` (all in Homebrew directories) were not found and `jj` commits failed
  // with `spawnSync jj ENOENT` — course planning and undo silently lost history.
  process.env.PATH = withToolPath(process.env.PATH, existsSync, process.platform);

  const cwd = resolve(process.env.XUEGEN_DESKTOP_CWD || join(homedir(), "learning"));
  mkdirSync(cwd, { recursive: true });

  return { home, cwd };
}
