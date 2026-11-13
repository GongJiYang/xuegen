// @vitest-environment node
/**
 * Guard: renderer code reads "today" only through `core/today.ts`.
 *
 * `now()` / `todayKey()` apply the `XUEGEN_TODAY` override; a stray
 * `dateKey(new Date())` — or any bare `new Date()` that is not a timezone
 * query — silently bypasses it. Test files are excluded (they pin the clock on
 * purpose), as is the clock module itself and the files owned by the parallel
 * wording/ledger batch, whose reads land there.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RENDERER = join(fileURLToPath(new URL(".", import.meta.url)), "..");

/** Files whose remaining `new Date()` reads belong to another batch. */
const EXEMPT = new Set(
  [
    "core/today.ts",
    "core/strings.ts",
    "core/board/control-card.ts",
    "core/board/plan-view.ts",
    "skins/bear/today-panel.tsx",
    "skins/bear/cycle-today.tsx",
  ].map((path) => join(RENDERER, path)),
);

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* sourceFiles(path);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) {
      yield path;
    }
  }
}

describe("today guard", () => {
  it("no renderer module reads today via dateKey(new Date())", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(RENDERER)) {
      if (EXEMPT.has(file)) continue;
      const text = readFileSync(file, "utf8");
      if (/dateKey\(\s*new Date\(\s*\)/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("the only bare new Date() outside the clock module is getTimezoneOffset()", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(RENDERER)) {
      if (EXEMPT.has(file)) continue;
      const text = readFileSync(file, "utf8");
      if (/new Date\(\)(?!\s*\.getTimezoneOffset\(\))/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
