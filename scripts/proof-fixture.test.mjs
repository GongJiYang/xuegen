#!/usr/bin/env node
// proof fixture 的测试：在临时目录生成合成测试库，再用真实技能脚本验一遍。
// 不触碰 ~/.xuegen、~/xuegen-data、~/学根；所有文件都在 os.tmpdir() 下。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { makeFixture } from "../apps/desktop/e2e/make-fixture.mjs";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const FIXTURE = join(REPO, "apps", "desktop", "e2e", "fixture");

async function cli(args) {
  try {
    const { stdout, stderr } = await run(process.execPath, args, { cwd: REPO });
    return { ok: true, code: 0, stdout, stderr };
  } catch (error) {
    return { ok: false, code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

async function cleanup(root) {
  await run("chmod", ["-R", "u+w", root]).catch(() => {});
  await rm(root, { recursive: true, force: true });
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(file)));
    else out.push(file);
  }
  return out;
}

test("make-fixture 生成的合成库能让 cycle / course / vault / bookshelf 脚本全部通过", async () => {
  const base = await mkdtemp(join(tmpdir(), "xg-proof-fixture-"));
  const root = join(base, "root");
  try {
    await makeFixture(root);
    const vault = join(root, "vault");

    const desktopJson = JSON.parse(await readFile(join(root, "home", "desktop.json"), "utf8"));
    assert.deepEqual(desktopJson, { skin: "bear", bodyScale: 1 }, "合成库的 desktop.json 应是正常字号");

    const cycle = await cli(["skills/cycle-plan/cycle.mjs", "check", vault]);
    assert.equal(cycle.ok, true, cycle.stderr || cycle.stdout);

    const courses = await cli(["skills/course/course-state.mjs", "verify", join(vault, "wiki", "courses")]);
    assert.equal(courses.ok, true, courses.stderr || courses.stdout);

    const lint = await cli(["skills/wiki-save/vault-lint.mjs", vault]);
    assert.equal(lint.ok, true, lint.stderr || lint.stdout);

    const day = await cli([
      "skills/cycle-plan/cycle.mjs",
      "day",
      vault,
      "--date",
      "2026-11-17",
      "--json",
    ]);
    assert.equal(day.ok, true, day.stderr || day.stdout);
    const info = JSON.parse(day.stdout);
    const mainCourses = new Set(["discrete-math-epp", "programming-paradigms"]);
    assert.ok(
      info.lessons.some((lesson) => mainCourses.has(lesson.course)),
      `2026-11-17 应有两门主课之一的课：${JSON.stringify(info.lessons)}`,
    );
    assert.equal(info.week, 3);
    assert.equal(info.overdue.length, 1, `应只有 1 节拖欠：${JSON.stringify(info.overdue)}`);

    const shelf = await cli([
      "skills/reading/bookshelf.mjs",
      "today",
      vault,
      "--today",
      "2026-11-17",
      "--json",
    ]);
    assert.equal(shelf.ok, true, shelf.stderr || shelf.stdout);
    const reading = JSON.parse(shelf.stdout);
    const segments =
      (reading.planned?.chunk ? 1 : 0) + (Array.isArray(reading.guided) ? reading.guided.length : 0);
    assert.ok(segments >= 1, `今天应至少有一段读：${shelf.stdout}`);

    const files = await walk(FIXTURE);
    for (const file of files) {
      const text = await readFile(file, "utf8");
      for (const forbidden of ["/Users/", "/home/", "gjy"]) {
        assert.equal(text.includes(forbidden), false, `${file} 不应包含 ${forbidden}`);
      }
    }
  } finally {
    await cleanup(base);
  }
});
