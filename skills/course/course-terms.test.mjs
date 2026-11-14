#!/usr/bin/env node
// course-terms.mjs 的测试：node:test + node:assert，无第三方依赖。
// 在 os.tmpdir() 下建临时库夹具，不触碰真实库。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "course-terms.mjs");

/** 课程页：Learning Record 里 D1 两个块（合并去重）、D2 一个块（无「完成：」行）、一个无存库行的块。 */
const DEMO_COURSE = `<!-- xuegen:course-state -->

# 演示课

## Learning Record

- 归档：见 [[courses/demo/records/2026-10]]

### 2026-11-07-01（收课：D1 · 第一章）

完成：D1

- 存库：新建 2 个概念页 [[knowledge/concepts/demo/010-alpha|甲页]]、[[knowledge/concepts/demo/020-beta]]

### 2026-11-07-02（收课：D1 · 补记）

完成：D1

- 存库：补充 [[knowledge/concepts/demo/020-beta]] 与 [[knowledge/concepts/demo/030-gamma|丙页]]、[[knowledge/concepts/demo/040-delta]]
- 制卡：写了 [[knowledge/sources/2026-11-07-x|来源页]]。

### 2026-11-07-03（收课：D2 · 第二章）

- 存库：[[knowledge/concepts/demo/050-epsilon|戊页]]

### 2026-11-09-01（收课：D9 · 无存库）

- 普通行里的链接 [[knowledge/concepts/demo/999-x]] 不算存库。
`;

/** 归档文件：加粗存库行 + 无「完成：」行（课次取标题）+ 非 concepts 链接；另一块无存库。 */
const DEMO_RECORDS = `# 演示课 · 2026 年 10 月收课记录

> 由课程页归档。

### 2026-10-20-01（收课：D0 · 前言）

- **存库**：补 [[knowledge/concepts/demo/000-preface|前言页]]；另见 [[knowledge/sources/2026-10-01-x|来源]]。

### 2026-10-20-02（收课补充：杂记）

完成：D0

- 杂记，没有存库行。
`;

const ZETA_COURSE = `<!-- xuegen:course-state -->

# 泽塔课

## Learning Record

### 2026-11-07-01（收课：Z1 · 一课）

- 存库：[[knowledge/concepts/zeta/001-zed|泽页]]
`;

const LONG_DEFINITION = `**甲** 的定义带 \`代码\` 与 $公式$：${"说明".repeat(40)}。第二句。`;

const PAGES = {
  "knowledge/concepts/demo/000-preface.md": "# 前言\n\n## How It Works\n\n没有定义节。\n",
  "knowledge/concepts/demo/010-alpha.md": `# 甲概念\n\n## Definition\n\n${LONG_DEFINITION}\n`,
  "knowledge/concepts/demo/020-beta.md": "# 乙概念\n\n## Definition\n\n这是乙的第一句。还有第二句。\n",
  "knowledge/concepts/demo/050-epsilon.md": "# 戊概念\n\n## Definition\n\n戊的定义。\n",
  "knowledge/concepts/zeta/001-zed.md": "# 泽\n\n## Definition\n\n泽的定义。\n",
};

async function freshVault() {
  const vault = await mkdtemp(join(tmpdir(), "course-terms-"));
  const put = async (rel, text) => {
    const file = join(vault, rel);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text, "utf8");
  };
  await put("wiki/courses/demo.md", DEMO_COURSE);
  await put("wiki/courses/demo/records/2026-10.md", DEMO_RECORDS);
  await put("wiki/courses/zeta.md", ZETA_COURSE);
  for (const [rel, text] of Object.entries(PAGES)) await put(`wiki/${rel}`, text);
  return vault;
}

async function runList(vault, extra = []) {
  const { stdout } = await exec(process.execPath, [SCRIPT, "list", vault, "--json", ...extra]);
  return JSON.parse(stdout);
}

async function runRaw(args) {
  try {
    const { stdout } = await exec(process.execPath, [SCRIPT, ...args]);
    return { ok: true, stdout };
  } catch (error) {
    return { ok: false, stderr: error.stderr ?? "", code: error.code };
  }
}

function groupOf(groups, course, lesson) {
  const group = groups.find((item) => item.course === course && item.lesson === lesson);
  assert.ok(group, `缺少分组 ${course}/${lesson}`);
  return group;
}

test("课程页与归档两处都读，按日期倒序、同日按课程 slug 升序", async () => {
  const vault = await freshVault();
  try {
    const groups = await runList(vault);
    assert.deepEqual(
      groups.map((g) => `${g.course}/${g.date}/${g.lesson}`),
      ["demo/2026-11-07/D1", "demo/2026-11-07/D2", "zeta/2026-11-07/Z1", "demo/2026-10-20/D0"],
    );
    assert.equal(groupOf(groups, "demo", "D1").courseTitle, "演示课");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("title：别名优先，其次页面 H1，缺页用链接最后一段", async () => {
  const vault = await freshVault();
  try {
    const groups = await runList(vault);
    const terms = groupOf(groups, "demo", "D1").terms;
    assert.equal(terms[0].title, "甲页"); // 别名
    assert.equal(terms[1].title, "乙概念"); // 无别名 → H1
    assert.equal(terms[2].title, "丙页"); // 缺页但有别名
    assert.equal(terms[3].title, "040-delta"); // 缺页无别名 → 链接最后一段
    assert.equal(terms[3].exists, false);
    assert.equal(terms[0].path, join(vault, "wiki", "knowledge/concepts/demo/010-alpha.md"));
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("definition：去 ** ` $ 标记，超 60 字截断加省略号；无 Definition 节为 null", async () => {
  const vault = await freshVault();
  try {
    const groups = await runList(vault);
    const alpha = groupOf(groups, "demo", "D1").terms[0];
    assert.equal(alpha.definition.endsWith("…"), true);
    assert.equal([...alpha.definition].length, 61);
    assert.equal(alpha.definition.startsWith("甲 的定义带 代码 与 公式："), true);
    for (const mark of ["*", "`", "$"]) assert.equal(alpha.definition.includes(mark), false);
    const beta = groupOf(groups, "demo", "D1").terms[1];
    assert.equal(beta.definition, "这是乙的第一句");
    const preface = groupOf(groups, "demo", "D0").terms[0];
    assert.equal(preface.definition, null);
    assert.equal(preface.exists, true);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("同课同日同课次的多个块合并，术语按 path 去重保序", async () => {
  const vault = await freshVault();
  try {
    const groups = await runList(vault);
    const terms = groupOf(groups, "demo", "D1").terms;
    assert.deepEqual(
      terms.map((term) => term.title),
      ["甲页", "乙概念", "丙页", "040-delta"],
    );
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("无存库行的块被跳过，存库行里的非 concepts 链接被忽略", async () => {
  const vault = await freshVault();
  try {
    const groups = await runList(vault);
    assert.equal(groups.some((g) => g.date === "2026-11-09"), false);
    const all = groups.flatMap((g) => g.terms.map((t) => t.path));
    assert.equal(all.some((p) => p.includes("knowledge/sources")), false);
    assert.equal(groupOf(groups, "demo", "D0").terms.length, 1);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("--since 只保留日期不早于它的组", async () => {
  const vault = await freshVault();
  try {
    const groups = await runList(vault, ["--since", "2026-11-01"]);
    assert.deepEqual(
      groups.map((g) => `${g.course}/${g.date}`),
      ["demo/2026-11-07", "demo/2026-11-07", "zeta/2026-11-07"],
    );
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("参数错误与库根不存在都非零退出并给出中文说明", async () => {
  const missing = await runRaw(["list", join(tmpdir(), "course-terms-no-such-vault")]);
  assert.equal(missing.ok, false);
  assert.match(missing.stderr, /库根不存在/);
  const noArg = await runRaw(["list"]);
  assert.equal(noArg.ok, false);
  assert.match(noArg.stderr, /需要库根/);
  const badSince = await runRaw(["list", tmpdir(), "--since", "2026-1-1"]);
  assert.equal(badSince.ok, false);
  assert.match(badSince.stderr, /--since 日期非法/);
});
