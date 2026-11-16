#!/usr/bin/env node
// close/archive.mjs 的测试：临时目录建小库与小暂存，直测 archiveRecords，再走一次 CLI 端到端
// （stage → archive → check），不碰真实库。
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { archiveRecords } from "./archive.mjs";

const run = promisify(execFile);
const CLOSE = join(dirname(fileURLToPath(import.meta.url)), "..", "course-close.mjs");

const SCHEDULE = `<!-- xuegen:schedule:start rest=sun -->
| 天 | 日期 | 内容 | 材料 | 完成条件 |
|---|---|---|---|---|
| D1 | 2026-10-20（周二） | 第 1 课 | — | — |
| D2 | 2026-10-27（周二） | 第 2 课 | — | — |
| D3 | 2026-11-03（周二） | 第 3 课 | — | — |
| D4 | 2026-11-10（周二） | 第 4 课 | — | — |
| D5 | 2026-11-14（周六） | 第 5 课 | — | — |
<!-- xuegen:schedule:end -->`;

const block = (heading, done) => `### ${heading}\n\n- 记一笔。\n- 完成：${done}\n`;
const B1 = block("2026-10-20-01", "D1");
const B2 = block("2026-10-27-01", "D2");
const B3 = block("2026-11-03-01", "D3");
const B4 = block("2026-11-10-01", "D4");
const B5 = block("2026-11-14-01", "D5");

function coursePage({ preamble = "", records = [] } = {}) {
  return `<!-- xuegen:course-state -->\n# 离散数学（Epp）学习计划\n\n## 计划表\n\n${SCHEDULE}\n\n## Learning Record\n\n${preamble}${records.join("\n")}\n## Relationships\n`;
}

async function makeVault({ recordFiles = {} } = {}) {
  const root = await mkdtemp(join(tmpdir(), "close-archive-"));
  const vault = join(root, "vault");
  const staging = join(root, "staging");
  const ws = join(root, "ws");
  await mkdir(join(vault, "wiki", "courses"), { recursive: true });
  await mkdir(ws, { recursive: true });
  for (const [name, body] of Object.entries(recordFiles)) {
    const file = join(vault, "wiki", "courses", "epp", "records", name);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
  }
  return { root, vault, staging, ws };
}

async function put(fixture, text) {
  const file = join(fixture.staging, "wiki", "courses", "epp.md");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
  return file;
}

function runArchive(fixture, keep = 2) {
  const manifest = { kind: "close", vault: fixture.vault, slug: "epp", subject: "x", base: {} };
  const addToStaging = (rel) => {
    const dst = join(fixture.staging, rel);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(join(fixture.vault, rel), dst);
    manifest.base[rel] = "test";
  };
  const out = archiveRecords(fixture.staging, manifest, { keep, addToStaging });
  return { out, manifest };
}

// 夹具里没有只读文件（stage 只复制不改 mode），直接删。
const cleanup = (fixture) => rm(fixture.root, { recursive: true, force: true });

const staged = (fixture, rel) => readFile(join(fixture.staging, rel), "utf8");

test("keep 2 → 最新 2 条留下；10 月新建带头行、11 月原内容在前新块在后，块文字逐字不变", async () => {
  const old11 = "# 2026-11\n\n### 2026-11-01-01\n\n- 旧归档。\n";
  const f = await makeVault({ recordFiles: { "2026-11.md": old11 } });
  try {
    await put(f, coursePage({ records: [B1, B2, B3, B4, B5] }));
    const { out, manifest } = runArchive(f);
    assert.deepEqual(out.moved, ["2026-10-20-01", "2026-10-27-01", "2026-11-03-01"]);
    assert.deepEqual(out.months, ["2026-10", "2026-11"]);
    const page = await staged(f, "wiki/courses/epp.md");
    assert.ok(!page.includes("### 2026-10-20-01") && !page.includes("### 2026-11-03-01"));
    assert.ok(page.includes("### 2026-11-10-01") && page.includes("### 2026-11-14-01"), "留最新 2 条");
    const oct = await staged(f, "wiki/courses/epp/records/2026-10.md");
    assert.equal(
      oct,
      "# 离散数学（Epp）学习计划 · 2026 年 10 月收课记录\n\n> 由课程页 [[courses/epp]] 归档，原文不改。\n\n" +
        "### 2026-10-20-01\n\n- 记一笔。\n- 完成：D1\n\n### 2026-10-27-01\n\n- 记一笔。\n- 完成：D2\n\n",
    );
    const nov = await staged(f, "wiki/courses/epp/records/2026-11.md");
    assert.equal(nov, `${old11}\n### 2026-11-03-01\n\n- 记一笔。\n- 完成：D3\n\n`);
    assert.ok(manifest.base["wiki/courses/epp/records/2026-11.md"], "库里已有的 11 月文件经 addToStaging 进暂存");
    assert.match(
      page,
      /- 归档：2026 年 10 月的收课记录见 \[\[courses\/epp\/records\/2026-10\]\] · 完成：D1、D2\n- 归档：2026 年 11 月的收课记录见 \[\[courses\/epp\/records\/2026-11\]\] · 完成：D3\n\n### 2026-11-10-01/,
      "归档行按月份从早到晚排，后留一个空行",
    );
  } finally {
    await cleanup(f);
  }
});

test("已有「· 完成：D1」归档行，再挪一条完成：D3 → 那行变 完成：D1、D3，没有重复 id", async () => {
  const old11 = "# 2026-11\n\n### 2026-11-05-01\n\n- 完成：D1\n";
  const f = await makeVault({ recordFiles: { "2026-11.md": old11 } });
  try {
    const preamble = "- 归档：2026 年 11 月的收课记录见 [[courses/epp/records/2026-11]] · 完成：D1\n\n";
    await put(f, coursePage({ preamble, records: [B3, B4, B5] }));
    const { out } = runArchive(f);
    assert.deepEqual(out.moved, ["2026-11-03-01"]);
    assert.deepEqual(out.months, ["2026-11"]);
    const page = await staged(f, "wiki/courses/epp.md");
    assert.match(page, /- 归档：2026 年 11 月的收课记录见 \[\[courses\/epp\/records\/2026-11\]\] · 完成：D1、D3/);
    assert.ok(!page.includes("D1、D1"), "不重复（复现 11-16 的「D1、D1、D3」）");
    assert.equal((page.match(/- 归档：/g) ?? []).length, 1, "原地替换，不多加一行");
  } finally {
    await cleanup(f);
  }
});

test("只有 2 条 → 什么都不写", async () => {
  const f = await makeVault();
  try {
    const text = coursePage({ records: [B4, B5] });
    const file = await put(f, text);
    const { out } = runArchive(f);
    assert.deepEqual(out, { moved: [], months: [] });
    assert.equal(await readFile(file, "utf8"), text, "课程页没动");
    assert.ok(!existsSync(join(f.staging, "wiki", "courses", "epp")), "没有新建 records 目录");
  } finally {
    await cleanup(f);
  }
});

test("CLI 端到端：stage → 写第 3 条记录 → archive --json → check --json 通过", async () => {
  const f = await makeVault();
  try {
    await writeFile(join(f.vault, "wiki", "courses", "epp.md"), coursePage({ records: [B4] }));
    await writeFile(join(f.vault, "wiki", "index.md"), "# 索引\n\n- [[courses/epp|离散数学]]\n");
    await writeFile(join(f.vault, "wiki", "log.md"), "# 学习日志\n");
    const stagedOut = await run(process.execPath, [CLOSE, "stage", f.vault, "epp", "--workspace", f.ws, "--json"]);
    const { staging } = JSON.parse(stagedOut.stdout);
    await writeFile(join(staging, "wiki", "courses", "epp.md"), coursePage({ records: [B3, B4, B5] }));
    const archived = JSON.parse((await run(process.execPath, [CLOSE, "archive", staging, "--json"])).stdout);
    assert.deepEqual(archived.moved, ["2026-11-03-01"]);
    assert.deepEqual(archived.months, ["2026-11"]);
    const check = JSON.parse((await run(process.execPath, [CLOSE, "check", staging, "--json"])).stdout);
    assert.equal(check.ok, true, JSON.stringify(check.problems));
  } finally {
    await cleanup(f);
  }
});
