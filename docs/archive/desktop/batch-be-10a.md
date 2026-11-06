# 批次 BE-10a：科目骨架脚本 `subjects.mjs` 接入数据通道（不改界面）

> 给 Devin（SWE-2）的**逐步执行清单**。按步骤原样做，不要自行设计；某一步做不到时停下，在报告里写清卡在哪一步、报错原文。

## 本批硬约束（压缩后也要记得）

1. 只改 / 新建这些文件：
   - 新建 `skills/cycle-plan/subjects.mjs`、`skills/cycle-plan/subjects.test.mjs`
   - `apps/desktop/src/shared/data-protocol.ts`、`apps/desktop/src/shared/data-protocol.test.ts`
   - `apps/desktop/src/main/data/handler.ts`、`apps/desktop/src/main/data/handler.test.ts`
   - `apps/desktop/src/main/data/README.md`（加一行）
   其他文件一律不动（不动 `renderer/`、`skins/`、`skills/cycle-plan/SKILL.md`、`cycle.mjs`）。
2. 脚本零依赖：只用 `node:` 内置模块、`../course/course-schedule.mjs` 和同目录 `./cycle.mjs` 的导出。
3. 不读写 `~/.xuegen/`，不碰任何 Obsidian 库（`/Users/gjy/Documents/` 下的东西），不启动 Electron，不 `git commit` / `git push`。测试只用临时目录。
4. 不加 `eslint-disable`、`@ts-ignore`、`any`；`switch` 保持穷尽。

## 先读

`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/skills/AUTHORING.md`；`skills/cycle-plan/SKILL.md`、`skills/cycle-plan/cycle.mjs`（会用到它导出的 `CYCLE_DAYS`、`findCycle`、`parseCycle`、`weekOf`）；`apps/desktop/src/shared/data-protocol.ts` 与 `main/data/handler.ts` 里上一批加的 `cycle.day` / `cycle.month`（照同样的方式加 `subjects.list`）。

## 背景

库里每个科目一页 `wiki/subjects/<slug>.md`（frontmatter `layer`、`route`；`## Materials` 下按 `### 书籍` 等分类的资料行；`## Courses` 下链接课程）。桌面版「总进度」要按科目分组显示，本批先把这些读出来：新脚本 `subjects.mjs list`，数据通道新请求 `subjects.list`。

资料行格式：`- ● 学习中 · 主线 · [[2026-11-05-ctm|CTM]] → [[courses/ctm]]`，记号是 `● ! ✓ ○ ◌` 之一；`- （暂无）` 不是资料行。

## 步骤

### 第 1 步：新建 `skills/cycle-plan/subjects.mjs`，原样如下

```js
#!/usr/bin/env node
// Xuegen 科目骨架：读 wiki/subjects/*.md（frontmatter、资料、课程）与当天所在的周期，供总进度按科目分组。
// 只读，不写任何文件。无第三方依赖。
//   node subjects.mjs list <vault> [--date YYYY-MM-DD] [--json]
// <vault> 是库根目录（含 wiki/）。
import { readFile, readdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidDate } from "../course/course-schedule.mjs";
import { CYCLE_DAYS, findCycle, parseCycle, weekOf } from "./cycle.mjs";

const MARKS = { "●": "now", "!": "warn", "✓": "done", "○": "plan", "◌": "none" };

/** `[[target|alias]]` → alias，`[[target]]` → target 的最后一段。 */
export function stripLinks(text) {
  return text.replace(/\[\[([^\]|\\]+)(?:\\?\|([^\]]+))?\]\]/g, (_, target, alias) => (alias ?? target.split("/").pop()).trim());
}

/** 一行资料 `- ● 学习中 · 主线 · [[来源|标题]] → [[courses/slug]]`；不是资料行返回 null。 */
export function parseMaterial(line, type) {
  const match = /^-\s+([●!✓○◌])\s+(.+)$/.exec(line.trim());
  if (!match) return null;
  const parts = match[2].split(" · ");
  if (parts.length < 3) return null;
  const [status, role, ...rest] = parts;
  let body = rest.join(" · ");
  const courseMatch = /→\s*\[\[courses\/([^\]|\\]+)/.exec(body);
  if (courseMatch) body = body.slice(0, courseMatch.index);
  return {
    type,
    mark: MARKS[match[1]],
    status: status.trim(),
    role: role.trim(),
    title: stripLinks(body).trim(),
    course: courseMatch ? courseMatch[1].trim() : null,
  };
}

/** 解析一个科目页：{ slug, title, layer, route, courses, materials }。 */
export function parseSubject(text, slug) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text);
  const field = (key) => {
    if (!fm) return "";
    const match = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(fm[1]);
    return match ? match[1].trim() : "";
  };
  const lines = text.split("\n");
  const titleLine = lines.find((line) => /^#\s+/.test(line));
  const materials = [];
  const courses = [];
  let section = "";
  let type = "";
  for (const line of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      section = h2[1];
      type = "";
      continue;
    }
    const h3 = /^###\s+(.+?)\s*$/.exec(line);
    if (h3) {
      type = h3[1];
      continue;
    }
    if (section === "Materials" && type) {
      const item = parseMaterial(line, type);
      if (item) materials.push(item);
    }
    if (section === "Courses") {
      for (const match of line.matchAll(/\[\[courses\/([^\]|\\]+)/g)) courses.push(match[1].trim());
    }
  }
  return {
    slug,
    title: titleLine ? titleLine.replace(/^#\s+/, "").trim() : slug,
    layer: field("layer"),
    route: field("route"),
    courses: [...new Set(courses)],
    materials,
  };
}

/** 是否为当前周期的主项：route 以「C1 主项」这样的文字开头。 */
export function isMain(subject, cycle) {
  return cycle !== null && subject.route.startsWith(`${cycle.cycle} 主项`);
}

export async function loadSubjects(vault) {
  const dir = join(vault, "wiki", "subjects");
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const subjects = [];
  for (const name of names.filter((item) => item.endsWith(".md")).sort()) {
    subjects.push(parseSubject(await readFile(join(dir, name), "utf8"), basename(name, ".md")));
  }
  return subjects;
}

/** date 所在的周期：{ cycle, week, weeks, aux } 或 null；aux 是周期页「- 辅助：」那一行冒号后的文字。 */
export async function currentCycle(vault, date) {
  const dir = join(vault, "wiki", "cycles");
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  for (const name of names.filter((item) => item.endsWith(".md")).sort()) {
    const text = await readFile(join(dir, name), "utf8");
    const cycle = parseCycle(text, `cycles/${name}`);
    if (!findCycle([cycle], date)) continue;
    const aux = /^-\s*辅助：\s*(.+)$/m.exec(text);
    return { cycle: cycle.cycle, week: weekOf(cycle, date), weeks: CYCLE_DAYS / 7, aux: aux ? aux[1].trim() : null };
  }
  return null;
}

/** 总进度要的全部：{ date, cycle, subjects: [... , main] }。 */
export async function listSubjects(vault, date) {
  const cycle = await currentCycle(vault, date);
  const subjects = (await loadSubjects(vault)).map((subject) => ({ ...subject, main: isMain(subject, cycle) }));
  return { date, cycle, subjects };
}

// ---- CLI ----

function localToday() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function fail(message) {
  process.stderr.write(`subjects: ${message}\n`);
  process.exit(1);
}

function usage() {
  return ["用法：", "  node subjects.mjs list <vault> [--date YYYY-MM-DD] [--json]"].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const flags = { json: args.includes("--json"), help: args.includes("--help") };
  const dateIndex = args.indexOf("--date");
  const date = dateIndex === -1 ? localToday() : args[dateIndex + 1];
  const positional = args.filter((arg, index) => !arg.startsWith("--") && (dateIndex === -1 || index !== dateIndex + 1));
  const [command, vault] = positional;
  if (flags.help || !command) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command !== "list") fail(`未知命令：${command}\n${usage()}`);
  if (!vault) fail(`缺少库根目录\n${usage()}`);
  if (!isValidDate(date ?? "")) fail(`--date 必须是 YYYY-MM-DD，收到 ${date ?? "（空）"}`);
  let result;
  try {
    result = await listSubjects(vault, date);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  if (flags.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const lines = [result.cycle ? `${result.cycle.cycle} · 第 ${result.cycle.week} / ${result.cycle.weeks} 周` : `${date} 不在任何周期内`];
  for (const subject of result.subjects) {
    lines.push(`${subject.main ? "主项" : "    "} ${subject.title}  课程 ${subject.courses.length} · 资料 ${subject.materials.length}`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

function isMainModule() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
```

### 第 2 步：新建 `skills/cycle-plan/subjects.test.mjs`，原样如下

```js
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
| 周一 | 深度 | [[courses/epp\\|离散]] |
| 周二 | 深度 | [[courses/ctm\\|CTM]] |
| 周三 | 深度 | [[courses/epp\\|离散]] |
| 周四 | 深度 | [[courses/ctm\\|CTM]] |
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
```

### 第 3 步：`shared/data-protocol.ts` 加类型与请求

1. 在 `CycleMonth` 接口之后插入：

```ts
/** One material line on a subject page, from `subjects.mjs`. */
export interface SubjectMaterial {
  /** The `###` heading it sits under: 书籍 / 在线书籍 / 论文 / 公开课 / 视频 / 文章 / 代码与工具. */
  type: string;
  mark: "now" | "warn" | "done" | "plan" | "none";
  /** 学习中 / 已摄取 / 未制定计划 … as written on the page. */
  status: string;
  /** 主线 / 参考 / 练习 / 预习 / 拓展 … as written on the page. */
  role: string;
  title: string;
  /** The course that uses it, when the line links one. */
  course: string | null;
}

/** One subject page, from `subjects.mjs list --json`. */
export interface SubjectInfo {
  slug: string;
  title: string;
  layer: string;
  route: string;
  /** True when the route makes it a main subject of the current cycle. */
  main: boolean;
  courses: string[];
  materials: SubjectMaterial[];
}

/** Every subject plus the cycle the date falls in (null outside every cycle). */
export interface SubjectsOverview {
  date: string;
  cycle: { cycle: string; week: number; weeks: number; aux: string | null } | null;
  subjects: SubjectInfo[];
}
```

2. `DataRequest` 联合里 `| { kind: "cycle.month"; month: string }` 之后加 `| { kind: "subjects.list"; date: string }`。
3. `DataResponseMap` 里 `"cycle.month": CycleMonth;` 之后加 `"subjects.list": SubjectsOverview;`。
4. `isDataRequest` 里 `case "cycle.month": …` 那一条之后加：
   ```ts
       case "subjects.list":
         return typeof value.date === "string" && isIsoDate(value.date);
   ```

### 第 4 步：`shared/data-protocol.test.ts`

- `valid` 数组里 `{ kind: "cycle.month", month: "2026-11" },` 之后加 `{ kind: "subjects.list", date: "2026-11-06" },`
- `invalid` 数组里 `{ kind: "cycle.month", month: "2026-13" },` 之后加 `{ kind: "subjects.list" },` 和 `{ kind: "subjects.list", date: "2026/11/06" },`

### 第 5 步：`main/data/handler.ts`

在 `case "cycle.month": …` 那一条之后、`default:` 之前插入：

```ts
    case "subjects.list":
      return runScript("cycle-plan/subjects.mjs", ["list", vault.vault, "--date", request.date, "--json"]);
```

### 第 6 步：`main/data/handler.test.ts`

在 `it("cycle.day and cycle.month read the cycle page", …)` 之后插入：

```ts
  it("subjects.list reads the subject pages", async () => {
    touch(
      join(vault, "wiki", "subjects", "demo-subject.md"),
      [
        "---",
        "layer: A 数学与理论基础",
        "route: 路线外",
        "---",
        "",
        "# 演示科目",
        "",
        "## Materials",
        "",
        "### 书籍",
        "- ◌ 未制定计划 · 拓展 · [[2026-11-05-demo|演示书]]",
        "",
        "## Courses",
        "- [[courses/demo]] - Demo",
        "",
      ].join("\n"),
    );
    const result = await handleDataRequest({ kind: "subjects.list", date: "2026-11-09" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        date: "2026-11-09",
        cycle: null,
        subjects: [{ slug: "demo-subject", title: "演示科目", main: false, courses: ["demo"], materials: [{ title: "演示书", mark: "none" }] }],
      });
    }
  });
```

### 第 7 步：`main/data/README.md`

在 BE-9a 加的那行 `cycle.day / cycle.month → …` 之后加一行：
`- subjects.list → skills/cycle-plan/subjects.mjs（list，只读）`

## 完成标准（可观察）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && npm test && npm run lint:skills
cd /Users/gjy/pi-learning/xuegen && git status --short apps/desktop/src skills/cycle-plan
```

- 贴出每条输出的最后 15 行。`subjects.test.mjs` 的 5 个测试、handler 新测试、协议新样例都通过；原有测试全部仍通过；`lint:skills` 0 错误且没有「subjects.mjs 缺少同名测试」警告。
- 若某个断言与实际行为不符：先不要改测试或代码去迁就，在报告里写出失败的断言、实际值和你判断的原因，停下。

## 结束报告

列出：改了 / 新建了哪些文件；每一步是否照做；偏离之处及原因；未完成项。
