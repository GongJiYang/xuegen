// subjects.mjs 的测试：资料行解析、科目页解析、当前周期与主项判断、CLI。全部在临时目录。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { listSubjects, parseMaterial, parseSubject, stripLinks } from "./subjects.mjs";

const run = promisify(execFile);
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "subjects.mjs");

const CYCLE = `---
cycle: C1
start: 2026-11-06
end: 2026-12-24
---

# C1

## Overview
- 主项：离散、范式
- 辅助：（空）；（空）——路线原定数据结构与算法、C 与系统编程

## Weekly Template

| 星期 | 类型 | 课程 |
|---|---|---|
| 周一 | 深度 | [[subjects/discrete-math\\|离散]] |
| 周二 | 深度 | [[subjects/programming-paradigms\\|CTM]] |
| 周三 | 深度 | [[subjects/discrete-math\\|离散]] |
| 周四 | 深度 | [[subjects/programming-paradigms\\|CTM]] |
| 周五 | 整合 | — |
| 周六 | 低强度 | — |
| 周日 | 休息 | — |
`;

const DISCRETE = `---
layer: A 数学与理论基础
route: C1 主项
related: [algorithms]
---

# 离散数学

## Overview
逻辑与证明。

## Materials

### 书籍
- ● 学习中 · 主线 · [[2026-11-05-epp|Epp · Discrete Mathematics]] → [[courses/epp]]
- ◌ 未制定计划 · 预习 · [[2026-11-05-cool-brisk-walk|A Cool Brisk Walk]]

### 在线书籍
- （暂无）

### 公开课
- ✓ 已摄取 · 参考 · [[2026-05-15-MIT-6.1200J-Lec01|MIT 6.1200J 第 1 讲]]（仅第 1 讲）

## Topics
- [[concepts/math/000-谓词集合与证明]] - 谓词

## Courses
- [[courses/epp]] - Epp 主线课程

## Sources
- [[2026-11-05-计算机知识体系]]
`;

const AI = `---
layer: C 计算方法与交互
route: 路线外（专项方向：AI 与数据）
---

# 人工智能与机器学习

## Materials

### 论文
- ○ 已排期 · 主线 · 阅读路线 29 篇（链接在 [[courses/mi]] 的 Sources）→ [[courses/mi]]

## Courses
- [[courses/mi]] - 多义神经元
- [[courses/di]] - DeepInfer
`;

test("stripLinks keeps aliases and last path segments", () => {
  assert.equal(stripLinks("[[a/b/c|别名]] 和 [[x/y]]"), "别名 和 y");
});

test("parseMaterial reads mark, status, role, title and the linked course", () => {
  assert.deepEqual(parseMaterial("- ● 学习中 · 主线 · [[2026-11-05-epp|Epp · Discrete Mathematics]] → [[courses/epp]]", "书籍"), {
    type: "书籍",
    mark: "now",
    status: "学习中",
    role: "主线",
    title: "Epp · Discrete Mathematics",
    course: "epp",
  });
  assert.deepEqual(parseMaterial("- ✓ 已摄取 · 参考 · [[2026-05-15-MIT|MIT 第 1 讲]]（仅第 1 讲）", "公开课"), {
    type: "公开课",
    mark: "done",
    status: "已摄取",
    role: "参考",
    title: "MIT 第 1 讲（仅第 1 讲）",
    course: null,
  });
  assert.equal(parseMaterial("- （暂无）", "书籍"), null);
  assert.equal(parseMaterial("- ● 只有一段", "书籍"), null);
});

test("parseSubject reads frontmatter, materials by type and courses", () => {
  const subject = parseSubject(DISCRETE, "discrete-math");
  assert.equal(subject.title, "离散数学");
  assert.equal(subject.layer, "A 数学与理论基础");
  assert.equal(subject.route, "C1 主项");
  assert.deepEqual(subject.courses, ["epp"]);
  assert.deepEqual(subject.materials.map((item) => [item.type, item.mark, item.title]), [
    ["书籍", "now", "Epp · Discrete Mathematics"],
    ["书籍", "none", "A Cool Brisk Walk"],
    ["公开课", "done", "MIT 6.1200J 第 1 讲（仅第 1 讲）"],
  ]);
  const ai = parseSubject(AI, "ai-ml");
  assert.deepEqual(ai.courses, ["mi", "di"]);
  assert.equal(ai.materials[0]?.course, "mi");
});

test("listSubjects finds the current cycle, its aux line and the main subjects", async () => {
  const vault = await mkdtemp(join(tmpdir(), "subjects-"));
  try {
    await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
    await mkdir(join(vault, "wiki", "subjects"), { recursive: true });
    await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE);
    await writeFile(join(vault, "wiki", "subjects", "discrete-math.md"), DISCRETE);
    await writeFile(join(vault, "wiki", "subjects", "ai-ml.md"), AI);

    const inside = await listSubjects(vault, "2026-11-13");
    assert.deepEqual(inside.cycle, { cycle: "C1", week: 2, weeks: 7, aux: "（空）；（空）——路线原定数据结构与算法、C 与系统编程" });
    assert.deepEqual(inside.subjects.map((subject) => [subject.slug, subject.main]), [
      ["ai-ml", false],
      ["discrete-math", true],
    ]);

    const outside = await listSubjects(vault, "2027-01-05");
    assert.equal(outside.cycle, null);
    assert.ok(outside.subjects.every((subject) => subject.main === false));

    const cli = JSON.parse((await run("node", [SCRIPT, "list", vault, "--date", "2026-11-06", "--json"])).stdout);
    assert.equal(cli.cycle.week, 1);
    assert.equal(cli.subjects.length, 2);
    const text = (await run("node", [SCRIPT, "list", vault, "--date", "2026-11-06"])).stdout;
    assert.match(text, /^C1 · 第 1 \/ 7 周/);
    const noDate = JSON.parse((await run("node", [SCRIPT, "list", vault, "--json"])).stdout);
    assert.equal(noDate.subjects.length, 2);
    await assert.rejects(run("node", [SCRIPT, "list", vault, "--date", "11-06"]), (error) => /YYYY-MM-DD/.test(error.stderr));
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("a vault without subjects or cycles gives an empty list", async () => {
  const vault = await mkdtemp(join(tmpdir(), "subjects-empty-"));
  try {
    assert.deepEqual(await listSubjects(vault, "2026-11-06"), { date: "2026-11-06", cycle: null, subjects: [] });
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});
