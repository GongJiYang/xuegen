// @vitest-environment node
// Exercises findRepoRoot in isolation; the module-level `repoRoot` constant is
// resolved at import time and is not what these tests assert on.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findRepoRoot } from "./environment.js";

type ProcessWithResources = NodeJS.Process & { resourcesPath?: string };

let workDir: string;
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
