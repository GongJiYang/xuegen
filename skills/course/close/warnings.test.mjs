#!/usr/bin/env node
// close/warnings.mjs 的测试：纯函数 closeWarnings 的两条提醒各自独立开关；
// gatherCloseWarnings 用带周期页/科目页/书页的临时小库判主课；
// check --json 端到端——提醒随 after-read / archive 消失、ok 不受影响。不碰真实库。
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { closeWarnings, gatherCloseWarnings } from "./warnings.mjs";

const run = promisify(execFile);
const CLOSE = join(dirname(fileURLToPath(import.meta.url)), "..", "course-close.mjs");

const AFTER_READ = "主课收课还没写课后读：用 course_close after-read 写进书页";
const ARCHIVE = "学习记录超过 2 条：先用 course_close archive 归档";

const SCHEDULE = `<!-- xuegen:schedule:start rest=sun -->
| 天 | 日期 | 内容 | 材料 | 完成条件 |
|---|---|---|---|---|
| D1 | 2026-11-09（周一） | 第 1 课 | — | — |
| D2 | 2026-11-10（周二） | 第 2 课 | — | — |
| D3 | 2026-11-16（周一） | 第 3 课 | — | — |
<!-- xuegen:schedule:end -->`;

// 周期窗口盖住任何「今天」：check 用本机日期判主课，e2e 不依赖跑测试的那天。
const CYCLE = `---
cycle: C1
start: 2020-01-01
end: 2099-12-31
---

# C1 · 离散

## Weekly Template

| 星期 | 类型 | 课程 |
|---|---|---|
| 周一 | 深度 | [[subjects/x\\|离散]] |
| 周二 | 深度 | [[subjects/x\\|离散]] |
| 周三 | 深度 | [[subjects/x\\|离散]] |
| 周四 | 深度 | [[subjects/x\\|离散]] |
| 周五 | 整合 | — |
| 周六 | 低强度 | — |
| 周日 | 休息 | — |
`;

// 带「## 排期」的书页；「## 课后读」一节由 after-read 插在排期之后、摘录之前。
const BOOK = `---
title: Epp
---

# Epp

## 排期

<!-- xuegen:shelf:start -->
| 块 | 日期 | 读什么 |
|---|---|---|
| 1 | 2026-11-09 | Ch1 pp.1–9 |
<!-- xuegen:shelf:end -->

## 摘录
`;

const BOOK_AFTER = BOOK.replace(
  "## 摘录",
  "## 课后读\n\n- [ ] §3 · pp.30–40 · epp · 2026-11-17\n\n## 摘录",
);

const page = (records) => `<!-- xuegen:course-state -->
# 离散数学（Epp）学习计划

## Next Session

[[shelf/epp-book|Epp 书页]]

## 计划表

${SCHEDULE}

## Learning Record

${records}## Relationships

- [[subjects/x|离散]]
`;

const rec = (id, done) => `### ${id}\n\n- 记一笔。\n- 完成：${done}\n\n`;
const BASE_REC = rec("2026-11-09-01", "D1");
const CLOSE_REC = `${rec("2026-11-10-01", "D2")}${rec("2026-11-16-01", "D3")}`;

/** 临时小库：周期页（epp 是主课）、科目页、书页、index/log——check 的 e2e 需要。 */
async function makeVault() {
  const root = await mkdtemp(join(tmpdir(), "close-warnings-"));
  const vault = join(root, "vault");
  const ws = join(root, "ws");
  await mkdir(join(vault, "wiki", "courses", "epp", "records"), { recursive: true });
  await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
  await mkdir(join(vault, "wiki", "subjects"), { recursive: true });
  await mkdir(join(vault, "wiki", "shelf"), { recursive: true });
  await mkdir(ws, { recursive: true });
  await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE);
  await writeFile(join(vault, "wiki", "subjects", "x.md"), "# 离散\n\n## Courses\n\n- [[courses/epp|离散]]\n");
  await writeFile(join(vault, "wiki", "shelf", "epp-book.md"), BOOK);
  await writeFile(join(vault, "wiki", "courses", "epp.md"), page(BASE_REC));
  await writeFile(join(vault, "wiki", "index.md"), "# 索引\n\n- [[courses/epp|离散数学]]\n");
  await writeFile(join(vault, "wiki", "log.md"), "# 学习日志\n");
  return { root, vault, ws };
}

test("课后读提醒：主课新勾课次 + 链着书 + 书页课后读没新行 → 提醒；其余缺一不发", () => {
  const base = page(BASE_REC);
  const staged = page(`${BASE_REC}${CLOSE_REC}`);
  const args = (over = {}) => ({
    isMain: true,
    book: "epp-book",
    baseCourseText: base,
    courseText: staged,
    baseBookText: BOOK,
    bookText: BOOK,
    ...over,
  });
  assert.deepEqual(closeWarnings(args()), [AFTER_READ, ARCHIVE]);
  assert.deepEqual(closeWarnings(args({ bookText: BOOK_AFTER })), [ARCHIVE], "写了课后读提醒消失");
  assert.deepEqual(closeWarnings(args({ isMain: false })), [ARCHIVE], "非主课不提醒课后读");
  assert.deepEqual(closeWarnings(args({ courseText: base })), [], "没新勾课次不提醒（base 只 1 条记录，归档提醒也不发）");
  assert.deepEqual(closeWarnings(args({ book: null, baseBookText: null, bookText: null })), [ARCHIVE]);
});

test("归档提醒：Learning Record 超 2 条 → 提醒；归档行不数、回到 2 条消失", () => {
  const none = { isMain: false, book: null, baseCourseText: null, courseText: null, baseBookText: null, bookText: null };
  assert.deepEqual(closeWarnings({ ...none, courseText: page(`${BASE_REC}${CLOSE_REC}`) }), [ARCHIVE]);
  const archived = page(
    `- 归档：2026 年 11 月的收课记录见 [[courses/epp/records/2026-11]] · 完成：D1\n\n${CLOSE_REC}`,
  );
  assert.deepEqual(closeWarnings({ ...none, courseText: archived }), [], "归档后剩 2 条不提醒");
});

test("gatherCloseWarnings：本周期主课才发课后读提醒；日期在周期外只按记录数提醒", async (t) => {
  const f = await makeVault();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const staging = join(f.root, "staging");
  await mkdir(join(staging, "wiki", "courses"), { recursive: true });
  await mkdir(join(staging, "wiki", "shelf"), { recursive: true });
  await writeFile(join(staging, "wiki", "shelf", "epp-book.md"), BOOK);
  const manifest = { kind: "close", vault: f.vault, slug: "epp", subject: "x", book: "epp-book", base: {} };
  await writeFile(join(staging, "wiki", "courses", "epp.md"), page(`${BASE_REC}${rec("2026-11-16-01", "D3")}`));
  assert.deepEqual(await gatherCloseWarnings(staging, manifest, "2026-11-16"), [AFTER_READ]);
  await writeFile(join(staging, "wiki", "courses", "epp.md"), page(`${BASE_REC}${CLOSE_REC}`));
  assert.deepEqual(
    await gatherCloseWarnings(staging, manifest, "1999-01-01"),
    [ARCHIVE],
    "日期在周期外判不出主课：课后读提醒不发，归档提醒照发",
  );
});

test("check 端到端：两条提醒各一条；after-read / archive 后各自消失；ok 不受影响", async (t) => {
  const f = await makeVault();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const staged = JSON.parse(
    (await run(process.execPath, [CLOSE, "stage", f.vault, "epp", "--workspace", f.ws, "--json"])).stdout,
  ).staging;
  const check = async () =>
    JSON.parse((await run(process.execPath, [CLOSE, "check", staged, "--json"])).stdout);
  await writeFile(join(staged, "wiki", "courses", "epp.md"), page(`${BASE_REC}${CLOSE_REC}`));
  let out = await check();
  assert.equal(out.ok, true, JSON.stringify(out.problems));
  assert.deepEqual(out.warnings, [AFTER_READ, ARCHIVE]);
  const plain = await run(process.execPath, [CLOSE, "check", staged]);
  assert.match(plain.stdout, new RegExp(`^提醒：${AFTER_READ}$`, "m"));
  assert.match(plain.stdout, new RegExp(`^提醒：${ARCHIVE}$`, "m"));
  await run(process.execPath, [
    CLOSE, "after-read", staged, "--label", "§3", "--pages", "30–40", "--date", "2026-11-17", "--json",
  ]);
  out = await check();
  assert.equal(out.ok, true, JSON.stringify(out.problems));
  assert.deepEqual(out.warnings, [ARCHIVE], "写了课后读，只剩归档提醒");
  await run(process.execPath, [CLOSE, "archive", staged, "--json"]);
  out = await check();
  assert.equal(out.ok, true, JSON.stringify(out.problems));
  assert.deepEqual(out.warnings, [], "归档后没有提醒");
});
