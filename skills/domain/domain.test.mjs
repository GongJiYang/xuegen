#!/usr/bin/env node
// domain.mjs 的测试：node:test + node:assert，无第三方依赖。
// 在 os.tmpdir() 下建临时库夹具，不触碰真实库。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { shortName } from "./domain.mjs";

const exec = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "domain.mjs");

/** 科目页：带非空「## 领域小结」。 */
const SUBJECT_PP = `---
layer: A 数学与理论基础
---

# 编程语言与编程范式

## Overview

一段。

## 领域小结

1. 第一条
2. 第二条

## Courses

- [[courses/ctm]]
`;

/** 空小结：「## 领域小结」一节只有空行 → summary null、hasSummary false。 */
const SUBJECT_BLANK = `# 白科目

## 领域小结


## 其他节

内容。
`;

/** 无小结节、无概念目录。 */
const SUBJECT_EMPTY = `# 空科目

## Overview

没有概念目录。
`;

/**
 * 课程页：010-alpha 被 D1（11-12）与 D2（11-14）两节课存过 → 只算最早的 D1；
 * 020-beta 只在 D2；999-missing 链接指向不存在的页；D0 块没有存库行。
 */
const COURSE = `<!-- xuegen:course-state -->

# CTM 7 周学习计划

## Learning Record

### 2026-11-14-01（收课：D2 · 第二章）

完成：D2

- 存库：新建 [[knowledge/concepts/programming-paradigms/010-alpha|甲页]]、[[knowledge/concepts/programming-paradigms/020-beta]] 与 [[knowledge/concepts/programming-paradigms/999-missing]]

### 2026-11-12-01（收课：D1 · 第一章）

完成：D1

- 存库：[[knowledge/concepts/programming-paradigms/010-alpha]]

### 2026-11-10-01（收课：D0 · 前言）

- 没有存库行。
`;

const PAGES = {
  "knowledge/concepts/programming-paradigms/010-alpha.md": `---
sources:
  - "[[knowledge/sources/2026-11-05-ctm]]"
---

# CTM：闭包与静态作用域

## Definition

闭包的定义句。第二句不算。

## How It Works

过程值带 **自由标识符**（free identifier）与 **上下文环境**（contextual environment）；重复 **自由标识符**（free identifier）只取一次。
`,
  "knowledge/concepts/programming-paradigms/020-beta.md": `# 无冒号标题

## Definition

乙的定义。
`,
  "knowledge/concepts/programming-paradigms/030-gamma.md": "# 伽马概念\n\n没有 Definition 节。\n",
  // topic 子目录里的页也算这个科目的概念页，没被存库 → other。
  "knowledge/concepts/programming-paradigms/topic/040-delta.md": "# 德尔塔\n",
};

const conceptPath = (vault, sample) =>
  join(vault, "wiki", "knowledge", "concepts", "programming-paradigms", sample);

async function freshVault() {
  const vault = await mkdtemp(join(tmpdir(), "domain-"));
  const put = async (rel, text) => {
    const file = join(vault, rel);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text, "utf8");
  };
  await put("wiki/subjects/programming-paradigms.md", SUBJECT_PP);
  await put("wiki/subjects/a-empty.md", SUBJECT_EMPTY);
  await put("wiki/subjects/b-blank.md", SUBJECT_BLANK);
  await put("wiki/subjects/.hidden.md", "# 不应出现\n");
  await put("wiki/courses/ctm.md", COURSE);
  for (const [rel, text] of Object.entries(PAGES)) await put(`wiki/${rel}`, text);
  return vault;
}

async function run(args) {
  const { stdout } = await exec(process.execPath, [SCRIPT, ...args]);
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

async function withVault(fn) {
  const vault = await freshVault();
  try {
    await fn(vault);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
}

test("subjects：pages 降序、同数按 id 升序；跳过 . 开头文件", () =>
  withVault(async (vault) => {
    const rows = await run(["subjects", vault, "--json"]);
    assert.deepEqual(
      rows.map((row) => row.id),
      ["programming-paradigms", "a-empty", "b-blank"],
    );
    const pp = rows[0];
    assert.equal(pp.title, "编程语言与编程范式");
    assert.equal(pp.pages, 4);
    assert.equal(pp.terms, 6); // alpha 3 条 + beta/gamma/delta 各 1 条
    assert.equal(pp.hasSummary, true);
    assert.deepEqual(rows[1], {
      id: "a-empty",
      title: "空科目",
      pages: 0,
      terms: 0,
      hasSummary: false,
    });
    assert.equal(rows[2].hasSummary, false); // 空小结算没有
  }));

test("glossary：summary 原样保留换行；组按日期倒序，未被存的页进 other", () =>
  withVault(async (vault) => {
    const data = await run(["glossary", vault, "programming-paradigms", "--json"]);
    assert.equal(data.subject, "programming-paradigms");
    assert.equal(data.title, "编程语言与编程范式");
    assert.equal(data.summary, "1. 第一条\n2. 第二条");
    assert.deepEqual(
      data.groups.map((g) => g.label),
      ["CTM D2", "CTM D1"],
    );
    assert.deepEqual(data.groups[0], {
      label: "CTM D2",
      course: "ctm",
      lesson: "D2",
      date: "2026-11-14",
      terms: [
        {
          term: "无冒号标题",
          en: null,
          path: conceptPath(vault, "020-beta.md"),
          page: "无冒号标题",
          kind: "page",
          definition: "乙的定义",
        },
      ],
    });
    assert.deepEqual(
      data.other.map((t) => t.page),
      ["伽马概念", "德尔塔"],
    );
  }));

test("glossary：H1 去「书：」前缀；加粗术语带出英文、同页去重、跟在页词条后", () =>
  withVault(async (vault) => {
    const data = await run(["glossary", vault, "programming-paradigms", "--json"]);
    const d1 = data.groups.find((g) => g.lesson === "D1");
    const path = conceptPath(vault, "010-alpha.md");
    assert.deepEqual(d1.terms, [
      {
        term: "闭包与静态作用域",
        en: null,
        path,
        page: "CTM：闭包与静态作用域",
        kind: "page",
        definition: "闭包的定义句",
      },
      {
        term: "自由标识符",
        en: "free identifier",
        path,
        page: "CTM：闭包与静态作用域",
        kind: "term",
        definition: null,
      },
      {
        term: "上下文环境",
        en: "contextual environment",
        path,
        page: "CTM：闭包与静态作用域",
        kind: "term",
        definition: null,
      },
    ]);
  }));

test("glossary：一页被两节课存过只进最早那组；存库行指向缺页不报错", () =>
  withVault(async (vault) => {
    const data = await run(["glossary", vault, "programming-paradigms", "--json"]);
    const allPaths = data.groups.flatMap((g) => g.terms.map((t) => t.path));
    assert.equal(
      allPaths.filter((p) => p.includes("010-alpha")).length,
      3,
      "alpha 只出现在 D1 一组",
    );
    assert.equal(
      allPaths.some((p) => p.includes("999-missing")),
      false,
      "缺页被跳过",
    );
    const d2 = data.groups.find((g) => g.lesson === "D2");
    assert.deepEqual(
      d2.terms.map((t) => t.page),
      ["无冒号标题"],
    );
  }));

test("glossary：没有概念目录的科目 groups/other 都空、summary null", () =>
  withVault(async (vault) => {
    const data = await run(["glossary", vault, "a-empty", "--json"]);
    assert.deepEqual(data, {
      subject: "a-empty",
      title: "空科目",
      summary: null,
      groups: [],
      other: [],
    });
    const blank = await run(["glossary", vault, "b-blank", "--json"]);
    assert.equal(blank.summary, null);
  }));

test("shortName：先按全角/半角括号截断标题，再取第一个词", () => {
  const group = (courseTitle, course = "ctm") => ({ courseTitle, course });
  assert.equal(shortName(group("CTM 7 周学习计划")), "CTM");
  assert.equal(shortName(group("离散数学（Epp, 5th ed）")), "离散数学");
  assert.equal(shortName(group("Algorithms (Sedgewick)")), "Algorithms");
  // 括号后还有空白时也要去掉首尾空白再取词。
  assert.equal(shortName(group("离散数学 （Epp）")), "离散数学");
  // 截完为空（标题以括号开头）→ 用课程 slug；标题为空同理。
  assert.equal(shortName(group("（附录）离散数学", "epp")), "epp");
  assert.equal(shortName(group("   ", "epp")), "epp");
});

test("非法科目 id 与没有的科目都非零退出并给中文说明", async () => {
  const badId = await runRaw(["glossary", tmpdir(), "Bad_ID", "--json"]);
  assert.equal(badId.ok, false);
  assert.match(badId.stderr, /科目 id 非法/);
  await withVault(async (vault) => {
    const missing = await runRaw(["glossary", vault, "no-such", "--json"]);
    assert.equal(missing.ok, false);
    assert.equal(missing.code, 1);
    assert.match(missing.stderr, /没有这个科目：no-such/);
  });
  const badRoot = await runRaw(["subjects", join(tmpdir(), "domain-no-such-vault")]);
  assert.equal(badRoot.ok, false);
  assert.match(badRoot.stderr, /库根不存在/);
});

/** 只放一门课、一份记录块的库：块按给定顺序拼进课程页。 */
async function vaultWithBlocks(blocks) {
  const vault = await mkdtemp(join(tmpdir(), "domain-order-"));
  const put = async (rel, text) => {
    const file = join(vault, rel);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text, "utf8");
  };
  await put("wiki/subjects/programming-paradigms.md", SUBJECT_PP);
  await put("wiki/courses/ctm.md", `<!-- xuegen:course-state -->\n\n# CTM 7 周学习计划\n\n## Learning Record\n\n${blocks.join("\n")}\n`);
  await put("wiki/knowledge/concepts/programming-paradigms/010-alpha.md", "# 甲页\n");
  return vault;
}

const block = (heading, lesson, link) =>
  `### ${heading}\n\n完成：${lesson}\n\n- 存库：[[knowledge/concepts/programming-paradigms/${link}]]\n`;

/** 词表里这一页落在哪个组的 label（没有就 undefined）。 */
function labelOf(data, page) {
  return data.groups.find((group) => group.terms.some((t) => t.path.includes(page)))?.label;
}

test("glossary：同日两节课记录块换顺序，分组不变（按课次自然序 D1 < D2）", async () => {
  const dated = [
    block("2026-11-14-01（收课：D1 · 第一章）", "D1", "010-alpha"),
    block("2026-11-14-02（收课：D2 · 第二章）", "D2", "010-alpha"),
  ];
  for (const order of [dated, [...dated].reverse()]) {
    const vault = await vaultWithBlocks(order);
    try {
      const data = await run(["glossary", vault, "programming-paradigms", "--json"]);
      assert.equal(labelOf(data, "010-alpha"), "CTM D1", "同一天总是课次小的那组");
    } finally {
      await rm(vault, { recursive: true, force: true });
    }
  }
});

test("glossary：同日按课次自然序排（D2 在 D10 前），不按字符串序", () =>
  withVault(async (vault) => {
    const vault2 = await vaultWithBlocks([
      block("2026-11-14-01（收课：D10 · 第十章）", "D10", "010-alpha"),
      block("2026-11-14-02（收课：D2 · 第二章）", "D2", "010-alpha"),
      block("2026-11-14-03（收课：D10 · 第十章）", "D10", "020-beta"),
    ]);
    await writeFile(
      join(vault2, "wiki", "knowledge", "concepts", "programming-paradigms", "020-beta.md"),
      "# 乙页\n",
      "utf8",
    );
    try {
      const data = await run(["glossary", vault2, "programming-paradigms", "--json"]);
      assert.equal(labelOf(data, "010-alpha"), "CTM D2");
      assert.deepEqual(
        data.groups.map((g) => g.lesson),
        ["D2", "D10"],
      );
    } finally {
      await rm(vault2, { recursive: true, force: true });
    }
    // 本来那个库不受影响，仍然两页。
    const base = await run(["glossary", vault, "programming-paradigms", "--json"]);
    assert.equal(base.groups.length, 2);
  }));

test("glossary：没有日期的组不抢有日期组的页，且排在所有有日期的组之后", async () => {
  const vault = await vaultWithBlocks([
    block("收课：D9 · 备注（没有日期）", "D9", "010-alpha"),
    block("2026-11-14-01（收课：D1 · 第一章）", "D1", "010-alpha"),
    block("收课：D9 · 备注（没有日期）", "D9", "030-gamma"),
  ]);
  await writeFile(
    join(vault, "wiki", "knowledge", "concepts", "programming-paradigms", "030-gamma.md"),
    "# 伽马页\n",
    "utf8",
  );
  try {
    const data = await run(["glossary", vault, "programming-paradigms", "--json"]);
    assert.equal(labelOf(data, "010-alpha"), "CTM D1", "页归有日期那组");
    assert.deepEqual(
      data.groups.map((g) => g.label),
      ["CTM D1", "CTM D9"],
      "没有日期的组排最后",
    );
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("glossary：概念目录里的符号链接不跟随（文件与目录都不进词表）", async () => {
  const outside = await mkdtemp(join(tmpdir(), "domain-outside-"));
  try {
    await writeFile(join(outside, "secret.md"), "# 外部秘密\n\n**外词**（outer term）\n", "utf8");
    await mkdir(join(outside, "inner"), { recursive: true });
    await writeFile(join(outside, "inner", "leak.md"), "# 外部子目录页\n", "utf8");
    await withVault(async (vault) => {
      const base = conceptPath(vault, "");
      await symlink(join(outside, "secret.md"), join(base, "999-link.md"));
      await symlink(join(outside, "inner"), join(base, "099-dir-link"));
      const data = await run(["glossary", vault, "programming-paradigms", "--json"]);
      const pages = [...data.groups.flatMap((g) => g.terms), ...data.other].map((t) => t.page);
      for (const leaked of ["外部秘密", "外词", "外部子目录页"]) {
        assert.equal(pages.includes(leaked), false, `不读库外的 ${leaked}`);
      }
      assert.equal(
        [...data.groups.flatMap((g) => g.terms), ...data.other].some((t) => t.path.includes("999-link")),
        false,
      );
    });
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});

test("glossary/subjects：科目页是指向库外的符号链接时不读、不列", async () => {
  const outside = await mkdtemp(join(tmpdir(), "domain-outside-"));
  try {
    await writeFile(join(outside, "evil.md"), "# 外部秘密\n\n## 领域小结\n\n不该看见。\n", "utf8");
    await withVault(async (vault) => {
      await symlink(join(outside, "evil.md"), join(vault, "wiki", "subjects", "evil.md"));
      const rows = await run(["subjects", vault, "--json"]);
      assert.equal(rows.some((row) => row.id === "evil"), false);
      const glossary = await runRaw(["glossary", vault, "evil", "--json"]);
      assert.equal(glossary.ok, false);
      assert.match(glossary.stderr, /没有这个科目：evil/);
    });
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});

test("库根本身是符号链接时照常列出（只跳过库内的链接）", async () => {
  await withVault(async (vault) => {
    const link = `${vault}-link`;
    await symlink(vault, link);
    try {
      const rows = await run(["subjects", link, "--json"]);
      assert.deepEqual(
        rows.map((row) => row.id),
        ["programming-paradigms", "a-empty", "b-blank"],
      );
      const data = await run(["glossary", link, "programming-paradigms", "--json"]);
      assert.equal(data.groups.length, 2);
      assert.equal(
        data.groups.flatMap((g) => g.terms).filter((t) => t.path.endsWith("010-alpha.md")).length,
        3,
      );
    } finally {
      await rm(link, { force: true });
    }
  });
});

test("subjects：文件名不合科目 id 的不列（点进去只会报「科目 id 非法」）", () =>
  withVault(async (vault) => {
    await mkdir(join(vault, "wiki", "subjects"), { recursive: true });
    await writeFile(join(vault, "wiki", "subjects", "Foo.md"), "# 大写科目\n", "utf8");
    await writeFile(join(vault, "wiki", "subjects", "-lead.md"), "# 横杠开头\n", "utf8");
    const rows = await run(["subjects", vault, "--json"]);
    assert.deepEqual(
      rows.map((row) => row.id),
      ["programming-paradigms", "a-empty", "b-blank"],
    );
  }));
