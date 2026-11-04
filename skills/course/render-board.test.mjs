#!/usr/bin/env node
// render-board.mjs 的快照式测试：node:test + node:assert，无第三方依赖。
// 在 os.tmpdir() 下建临时课程目录渲染看板，断言结构稳定、无编辑入口、只读锁，
// 并核对渲染所用的解析结果（parseCourse 共享模块）与看板输出一致。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, stat, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "render-board.mjs");

const COURSE = `<!-- xuegen:course-state — 本文件由 AI 维护（只读锁 0444）。-->

# CTM 学习计划

## Key Facts

- 当前周：W1 · 声明式计算模型

## Overall Goals

- [x] 里程碑一
- [ ] 里程碑二

## This Week

W1 · 声明式计算模型｜日期范围：未设定

- [ ] 模块 1a（完成条件：能复述概念阶梯）
- [x] 模块 1b

## Today

日期：2026-10-21

- [ ] 继续模块 1a

## Next Session

读 Ch1 并复述概念阶梯。

## 计划表

| 天 | 日期 | 内容 |
|---|---|---|
| D1 | 10-21 | 概念讲解 |

## Learning Record

### 2026-10-21-01

- 收课。
`;

/** 建临时课程目录（wiki/courses），含一门带标记的课程。 */
async function makeCoursesDir(files) {
  const dir = await mkdtemp(join(tmpdir(), "render-board-"));
  await mkdir(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    await writeFile(join(dir, `${name}.md`), text, "utf8");
  }
  return dir;
}

/** 生成 Markdown 看板（course-state.mjs dashboard），供校验输出一致性。 */
async function makeDashboard(coursesDir) {
  const dash = join(dirname(coursesDir), "courses.md");
  await run("node", [join(HERE, "course-state.mjs"), "dashboard", coursesDir, dash], { encoding: "utf8" });
  return dash;
}

test("渲染看板：结构完整、包含课程、无编辑入口、输出为只读", async () => {
  const coursesDir = await makeCoursesDir({ ctm: COURSE });
  const dash = await makeDashboard(coursesDir);
  const out = join(dirname(coursesDir), "board.html");

  // 复刻收课后的只读锁：目录 555、状态文件 444，看板校验才应通过。
  await chmod(join(coursesDir, "ctm.md"), 0o444);
  await chmod(coursesDir, 0o555);

  const { stdout } = await run("node", [SCRIPT, coursesDir, out], { encoding: "utf8" });
  const meta = JSON.parse(stdout);
  assert.equal(meta.verify, true, "看板应与 dashboard 一致（verify:true）");
  assert.equal(meta.courses.length, 1);
  assert.equal(meta.courses[0].slug, "ctm");
  assert.deepEqual(meta.courses[0].weekCount, { done: 1, total: 2 });

  const html = await readFile(out, "utf8");
  assert.match(html, /学根 · 课程看板/);
  assert.match(html, /CTM 学习计划/);
  assert.match(html, /校验通过/);
  // 只读视图：没有任何表单/按钮/输入元素。
  assert.ok(!/<form|<button|<input|<textarea|contenteditable/i.test(html), "看板不得含编辑入口");

  const mode = (await stat(out)).mode & 0o777;
  assert.equal(mode, 0o444, `看板应只读 444，实际 ${mode.toString(8)}`);

  await chmod(coursesDir, 0o755);
  await chmod(join(coursesDir, "ctm.md"), 0o644);
  await rm(coursesDir, { recursive: true, force: true });
  await rm(dash, { force: true });
  await rm(out, { force: true });
});

test("渲染看板：跳过无标记文件，未命中课程时非零退出", async () => {
  const coursesDir = await makeCoursesDir({ plain: "# 不是课程状态文件\n" });
  const out = join(dirname(coursesDir), "board.html");
  const failure = await run("node", [SCRIPT, coursesDir, out], { encoding: "utf8" }).then(
    () => null,
    (error) => error,
  );
  assert.ok(failure, "无标记文件时应失败退出");
  assert.match(failure.stderr, /未找到课程状态文件/);
  await rm(coursesDir, { recursive: true, force: true });
});
