/**
 * Isolation setup shared by the agent process and the smoke script.
 *
 * Pi captures filesystem paths from the environment when its modules load, so
 * this must run before `@earendil-works/pi-coding-agent` is imported. It mirrors
 * the setup in `bin/xuegen.mjs`: same personal directory (`XUEGEN_HOME`), same
 * `AI_AGENT` marker, and no `PI_*` overrides leaking in from the shell.
 */

import { constants, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Repository root, shared by the CLI and the desktop app.
 *
 * The main process passes it explicitly (`XUEGEN_REPO_ROOT`) because once this
 * module is bundled its file path no longer sits at the same depth as its source.
 * The fallback walks up from this file until it finds the root `package.json`,
 * which also covers the smoke script running from source.
 */
export function findRepoRoot(): string {
  const fromEnv = process.env.XUEGEN_REPO_ROOT;
  if (fromEnv && existsSync(join(fromEnv, "package.json"))) return resolve(fromEnv);

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

/** Where the user's Xuegen state lives, shared with the CLI. */
export function resolveHome(): string {
  return resolve(process.env.XUEGEN_HOME || join(homedir(), ".xuegen"));
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

  const cwd = resolve(process.env.XUEGEN_DESKTOP_CWD || join(homedir(), "learning"));
  mkdirSync(cwd, { recursive: true });

  return { home, cwd };
}
