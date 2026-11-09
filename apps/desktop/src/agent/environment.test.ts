// @vitest-environment node
// Exercises findRepoRoot in isolation; the module-level `repoRoot` constant is
// resolved at import time and is not what these tests assert on.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findRepoRoot, stableRoot } from "./environment.js";

type ProcessWithResources = NodeJS.Process & { resourcesPath?: string };

let workDir: string;
/** A scratch home directory for the stableRoot tests. */
let dir: string;
let savedResourcesPath: string | undefined;
let savedRepoRootEnv: string | undefined;

function setResourcesPath(value: string | undefined): void {
  const proc: { resourcesPath?: string } = process as ProcessWithResources;
  if (value === undefined) {
    delete proc.resourcesPath;
  } else {
    proc.resourcesPath = value;
  }
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "xuegen-env-"));
  dir = join(workDir, "home");
  mkdirSync(dir, { recursive: true });
  savedResourcesPath = (process as ProcessWithResources).resourcesPath;
  savedRepoRootEnv = process.env.XUEGEN_REPO_ROOT;
  delete process.env.XUEGEN_REPO_ROOT;
});

afterEach(() => {
  setResourcesPath(savedResourcesPath);
  if (savedRepoRootEnv === undefined) {
    delete process.env.XUEGEN_REPO_ROOT;
  } else {
    process.env.XUEGEN_REPO_ROOT = savedRepoRootEnv;
  }
  rmSync(workDir, { recursive: true, force: true });
});

/** Real repository root: `src/agent` → `src` → `desktop` → `apps` → root. */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("findRepoRoot", () => {
  it("returns Resources/xuegen in a packaged app", () => {
    const bundled = join(workDir, "xuegen");
    mkdirSync(bundled, { recursive: true });
    writeFileSync(join(bundled, "package.json"), "{}");
    writeFileSync(join(bundled, "instructions.md"), "# xuegen\n");
    setResourcesPath(workDir);

    expect(findRepoRoot()).toBe(bundled);
  });

  it("falls back to walking up when resources have no xuegen directory", () => {
    setResourcesPath(workDir);

    expect(existsSync(join(repoRoot, "instructions.md"))).toBe(true);
    expect(findRepoRoot()).toBe(repoRoot);
  });
});

describe("stableRoot", () => {
  /** Resolve `<home>/app` the way the OS would (or null when it is not a link). */
  function linkTarget(home: string): string | null {
    const appPath = join(home, "app");
    try {
      return readlinkSync(appPath);
    } catch {
      return null;
    }
  }

  it("creates <home>/app as a link to the root when it is missing", () => {
    const target = join(workDir, "install-v1");
    mkdirSync(target, { recursive: true });

    expect(stableRoot(dir, target)).toBe(join(dir, "app"));
    expect(linkTarget(dir)).toBe(resolve(target));
  });

  it("replaces a link that points at an older install", () => {
    const oldRoot = join(workDir, "old");
    const newRoot = join(workDir, "new");
    mkdirSync(oldRoot, { recursive: true });
    mkdirSync(newRoot, { recursive: true });
    symlinkSync(oldRoot, join(dir, "app"));

    expect(stableRoot(dir, newRoot)).toBe(join(dir, "app"));
    expect(linkTarget(dir)).toBe(resolve(newRoot));
    // The atomic replacement leaves no stray temp link behind.
    expect(existsSync(`${join(dir, "app")}.tmp-${process.pid}`)).toBe(false);
  });

  it("keeps a link that already points at the root", () => {
    const root = join(workDir, "install");
    mkdirSync(root, { recursive: true });
    symlinkSync(root, join(dir, "app"));

    expect(stableRoot(dir, root)).toBe(join(dir, "app"));
    expect(linkTarget(dir)).toBe(resolve(root));
  });

  it("leaves a plain directory at <home>/app alone and returns the root", () => {
    const root = join(workDir, "install");
    mkdirSync(root, { recursive: true });
    mkdirSync(join(dir, "app"), { recursive: true });

    expect(stableRoot(dir, root)).toBe(root);
    expect(linkTarget(dir)).toBeNull();
  });

  it("leaves a plain file at <home>/app alone and returns the root", () => {
    const root = join(workDir, "install");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(dir, "app"), "not ours");

    expect(stableRoot(dir, root)).toBe(root);
    expect(linkTarget(dir)).toBeNull();
  });

  it("falls back to the root when the link cannot be written", () => {
    const root = join(workDir, "install");
    mkdirSync(root, { recursive: true });
    // A path that cannot be created: a file where the home directory would go.
    const unwritable = join(workDir, "not-a-dir");
    writeFileSync(unwritable, "");

    expect(stableRoot(unwritable, root)).toBe(root);
  });
});
