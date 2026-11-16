#!/usr/bin/env node
// close/brief.mjs 的测试：临时目录建小库（周期页、科目页、另一门主课、概念目录）与小暂存，
// 不碰真实库。closeBrief 只读，fixture 里没有 index/log——它不看这两个文件。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { closeBrief } from "./brief.mjs";

const SCHEDULE = `<!-- xuegen:schedule:start rest=sun -->
| 天 | 日期 | 内容 | 材料 | 完成条件 |
|---|---|---|---|---|
| D1 | 2026-11-09（周一） | 第 1 课 | — | — |
| D2 | 2026-11-10（周二） | 第 2 课 | — | — |
| D3 | 2026-11-16（周一） | 第 3 课 | 书 §3 | 复述 |
| D4 | 2026-11-18（周三） | 第 4 课 | — | — |
<!-- xuegen:schedule:end -->`;

const CYCLE = `---
cycle: C1
start: 2026-11-06
end: 2026-12-24
---

# C1 · 离散 + 范式

## Weekly Template

| 星期 | 类型 | 课程 |
|---|---|---|
| 周一 | 深度 | [[subjects/x\\|离散]] |
| 周二 | 深度 | [[subjects/y\\|范式]] |
| 周三 | 深度 | [[subjects/x\\|离散]] |
| 周四 | 深度 | [[subjects/y\\|范式]] |
| 周五 | 整合 | — |
| 周六 | 低强度 | — |
| 周日 | 休息 | — |
`;

// 另一门主课（周二/周四）：P1 在本周二，P2 在下下周二——周四收课时下一个另一门主课日落到了下周。
const PLF = `# 编程范式

## 计划表

<!-- xuegen:schedule:start rest=sun -->
| 天 | 日期 | 内容 | 材料 | 完成条件 |
|---|---|---|---|---|
| P1 | 2026-11-17（周二） | 范式 1 | — | — |
| P2 | 2026-11-24（周二） | 范式 2 | — | — |
<!-- xuegen:schedule:end -->
`;

const PAGE = (record = "", weeks = "", schedule = SCHEDULE) => `<!-- xuegen:course-state -->
# 离散数学（Epp）学习计划

${weeks}## 计划表

${schedule}

## Learning Record

${record}## Relationships

- [[subjects/x|离散]]
`;

async function makeVault({ cycle = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "close-brief-"));
  const vault = join(root, "vault");
  const staging = join(root, "staging");
  if (cycle) {
    for (const dir of ["cycles", "subjects", "courses"]) {
      await mkdir(join(vault, "wiki", dir), { recursive: true });
    }
    await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE);
    await writeFile(join(vault, "wiki", "subjects", "x.md"), "# 离散\n\n## Courses\n\n- [[courses/epp|离散]]\n");
    await writeFile(join(vault, "wiki", "subjects", "y.md"), "# 范式\n\n## Courses\n\n- [[courses/plf|范式]]\n");
    await writeFile(join(vault, "wiki", "courses", "plf.md"), PLF);
    await writeFile(join(vault, "wiki", "courses", "epp.md"), PAGE());
  }
  return { root, vault, staging };
}

/** 把课程页与 records 写进暂存，返回 closeBrief 要的 manifest。 */
async function stage(f, text, records = {}) {
  const page = join(f.staging, "wiki", "courses", "epp.md");
  await mkdir(dirname(page), { recursive: true });
  await writeFile(page, text);
  for (const [name, body] of Object.entries(records)) {
    const file = join(f.staging, "wiki", "courses", "epp", "records", name);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
  }
  return { kind: "close", vault: f.vault, slug: "epp", subject: "x", base: {} };
}

test("lesson/next：今天有课取当天、没课取最早逾期、全完成或无排期 → null", async (t) => {
  const f = await makeVault();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const done1 = PAGE("### 2026-11-09-01\n\n- 完成：D1\n");
  const b = await closeBrief(f.staging, await stage(f, done1), "2026-11-16");
  assert.deepEqual(b.lesson, { id: "D3", date: "2026-11-16", content: "第 3 课", material: "书 §3", doneWhen: "复述" });
  assert.deepEqual(b.next, { id: "D4", date: "2026-11-18", content: "第 4 课" });
  assert.equal(b.today, "2026-11-16");
  assert.equal(b.recordId, "2026-11-16-01");
  assert.deepEqual(b.records, { count: 1, archiveAfterThis: false });
  assert.equal(b.cycleWeek, null, "没有周期文件");
  assert.equal(b.afterRead, null);
  assert.equal(b.week, null);
  assert.deepEqual(b.concepts, { dir: "wiki/knowledge/concepts/x/", pages: [] });
  const overdue = await closeBrief(f.staging, await stage(f, done1), "2026-11-11");
  assert.equal(overdue.lesson.id, "D2");
  assert.equal(overdue.next.id, "D3");
  const allDone = PAGE("### 2026-11-09-01\n\n- 完成：D1、D2、D3、D4\n");
  const done = await closeBrief(f.staging, await stage(f, allDone), "2026-11-16");
  assert.equal(done.lesson, null);
  assert.equal(done.next, null);
  const bare = await closeBrief(f.staging, await stage(f, PAGE("", "", "")), "2026-11-16");
  assert.equal(bare.lesson, null, "没有排期标记");
  assert.equal(bare.next, null);
});

test("recordId：课程页与 records 里今天的最大编号 + 1；两条记录 → archiveAfterThis", async (t) => {
  const f = await makeVault();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const record = "### 2026-11-16-01\n\n- 完成：D3\n\n### 2026-11-09-01\n\n- 完成：D1\n";
  const m = await stage(f, PAGE(record), { "2026-11.md": "# 11 月\n\n### 2026-11-16-02\n\n- 归档旧记录\n" });
  const b = await closeBrief(f.staging, m, "2026-11-16");
  assert.equal(b.recordId, "2026-11-16-03");
  assert.deepEqual(b.records, { count: 2, archiveAfterThis: true });
});

test("周期：cycleWeek 与 afterRead——周一→周二另一门主课、周四→本周六、周六→当天", async (t) => {
  const f = await makeVault({ cycle: true });
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const m = await stage(f, PAGE());
  const b = (today) => closeBrief(f.staging, m, today);
  assert.equal((await b("2026-11-16")).cycleWeek, 2);
  assert.deepEqual((await b("2026-11-16")).afterRead, { date: "2026-11-17", reason: "另一门主课的下一个上课日" });
  assert.deepEqual((await b("2026-11-19")).afterRead, { date: "2026-11-21", reason: "落到下周，改排本周六" });
  assert.deepEqual((await b("2026-11-21")).afterRead, { date: "2026-11-21", reason: "周六的课当天读" });
});

test("week 与 concepts：MM-DD 结束日补年；概念页 zh-Hans-CN 排序去扩展名、subject 空 → null", async (t) => {
  const f = await makeVault();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const dir = join(f.vault, "wiki", "knowledge", "concepts", "x");
  await mkdir(dir, { recursive: true });
  for (const [name, body] of [["200-b.md", "# b\n"], ["100-a.md", "# a\n"], ["not-md.txt", "x"]]) {
    await writeFile(join(dir, name), body);
  }
  const weeks = "### W1 — 命题逻辑｜2026-11-06 ~ 11-12\n\n### W2 — 量词（Ch3）｜2026-11-13 ~ 11-19\n";
  const m = await stage(f, PAGE("", weeks));
  assert.deepEqual((await closeBrief(f.staging, m, "2026-11-16")).week, { label: "W2 — 量词（Ch3）", from: "2026-11-13", to: "2026-11-19" });
  assert.equal((await closeBrief(f.staging, m, "2026-11-20")).week, null);
  assert.deepEqual((await closeBrief(f.staging, m, "2026-11-16")).concepts, { dir: "wiki/knowledge/concepts/x/", pages: ["100-a", "200-b"] });
  assert.equal((await closeBrief(f.staging, { ...m, subject: null }, "2026-11-16")).concepts, null);
});
