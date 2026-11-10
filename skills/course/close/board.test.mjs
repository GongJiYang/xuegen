#!/usr/bin/env node
// close/board.mjs 的测试：refreshBoard 在新旧两种布局下写到对应位置，出错时返回 ok:false 不抛。
// 全部在 mkdtemp 里；重画用的是仓库里真的 course-state.mjs / render-board.mjs 子进程。
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BOARD_RELS, refreshBoard } from "./board.mjs";

const SCHEDULE = [
  "<!-- xuegen:schedule:start rest=sun -->",
  "| 天 | 日期 | 内容 | 材料 | 完成条件 |",
  "|---|---|---|---|---|",
  "| D1 | 2026-11-09（周一） | 第 1 课 | — | — |",
  "<!-- xuegen:schedule:end -->",
].join("\n");

/** 一份带 course-state 标记、段落齐全的课程页（看板只收这种）。 */
function coursePage(slug = "离散数学") {
  return [
    "<!-- xuegen:course-state -->",
    "",
    `# ${slug}（Epp）学习计划`,
    "",
    "## Key Facts",
    "",
    "- 当前周：W1 · 命题逻辑",
    "",
    "## This Week",
    "",
    "W1 · 命题逻辑",
    "",
    "- [ ] 讲 §1.1",
    "",
    "## Today",
    "",
    "日期：2026-11-09",
    "",
    "- [ ] 讲 §1.1",
    "",
    "## Next Session",
    "",
    "[[reading/epp|Epp]] §1.2。",
    "",
    "## 计划表（参考）",
    "",
    SCHEDULE,
    "",
    "## Relationships",
    "",
    "- [[subjects/discrete-math|离散数学]]",
    "",
  ].join("\n");
}

/** 建库：newLayout 为真时先造 wiki/_generated/。withCourse 为假时 courses 目录留空。 */
async function makeVault({ newLayout, withCourse = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), "close-board-"));
  const vault = join(root, "vault");
  const coursesDir = join(vault, "wiki", "courses");
  await mkdir(coursesDir, { recursive: true });
  if (newLayout) await mkdir(join(vault, "wiki", "_generated"), { recursive: true });
  if (withCourse) await writeFile(join(coursesDir, "epp.md"), coursePage());
  return { root, vault };
}

async function cleanup(fixture) {
  try {
    await chmod(fixture.root, 0o755);
  } catch {
    /* 已经没了 */
  }
  await rm(fixture.root, { recursive: true, force: true });
}

const mode = async (path) => (await stat(path)).mode & 0o777;

test("refreshBoard：新布局（有 wiki/_generated/）写到 wiki/_generated/courses.{md,html}，返回 ok 与库内路径", async () => {
  const fixture = await makeVault({ newLayout: true });
  try {
    const result = refreshBoard(fixture.vault);
    assert.deepEqual(result, { ok: true, paths: ["wiki/_generated/courses.md", "wiki/_generated/courses.html"] });
    const md = await readFile(join(fixture.vault, "wiki", "_generated", "courses.md"), "utf8");
    assert.match(md, /xuegen:courses-dashboard/, "是 dashboard 生成的看板");
    assert.match(md, /离散数学/, "看板里有这门课");
    assert.match(
      await readFile(join(fixture.vault, "wiki", "_generated", "courses.html"), "utf8"),
      /<html|<!DOCTYPE/i,
      "第二份是网页看板",
    );
    assert.equal(await mode(join(fixture.vault, "wiki", "_generated", "courses.md")), 0o444, "看板只读");
    assert.equal(await mode(join(fixture.vault, "wiki", "_generated", "courses.html")), 0o444);
  } finally {
    await cleanup(fixture);
  }
});

test("refreshBoard：旧布局（没有 wiki/_generated/）写到 wiki/courses.{md,html}，不动 _generated", async () => {
  const fixture = await makeVault({ newLayout: false });
  try {
    const result = refreshBoard(fixture.vault);
    assert.deepEqual(result, { ok: true, paths: ["wiki/courses.md", "wiki/courses.html"] });
    assert.match(await readFile(join(fixture.vault, "wiki", "courses.md"), "utf8"), /xuegen:courses-dashboard/);
    assert.match(await readFile(join(fixture.vault, "wiki", "courses.html"), "utf8"), /<html|<!DOCTYPE/i);
    await assert.rejects(stat(join(fixture.vault, "wiki", "_generated")), /ENOENT/, "旧布局不该凭空造 _generated");
  } finally {
    await cleanup(fixture);
  }
});

test("refreshBoard：课程目录为空时返回 ok:false、中文原因，不抛，也不留半份看板", async () => {
  const fixture = await makeVault({ newLayout: true, withCourse: false });
  try {
    const result = refreshBoard(fixture.vault);
    assert.equal(result.ok, false);
    assert.deepEqual(result.paths, []);
    assert.match(result.error, /^重画Markdown 看板失败：/);
    assert.match(result.error, /no course state files/, "原因来自 course-state 的 stderr");
    // 第一步就失败：网页看板不会再跑，两份看板都不存在。
    await assert.rejects(stat(join(fixture.vault, "wiki", "_generated", "courses.md")), /ENOENT/);
    await assert.rejects(stat(join(fixture.vault, "wiki", "_generated", "courses.html")), /ENOENT/);
  } finally {
    await cleanup(fixture);
  }
});

test("BOARD_RELS：新旧两种布局的四条路径都在集合里（undo 按它把看板踢出改动清单）", () => {
  assert.deepEqual([...BOARD_RELS].sort(), [
    "wiki/_generated/courses.html",
    "wiki/_generated/courses.md",
    "wiki/courses.html",
    "wiki/courses.md",
  ]);
});
