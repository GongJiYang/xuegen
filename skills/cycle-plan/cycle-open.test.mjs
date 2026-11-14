// cycle-open.mjs 的测试：周期事务的 stage → check → commit → abort。
// 库与暂存目录一律建在临时目录；要 jj 的用 `jj git init`（没有 jj 就跳过）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "cycle-open.mjs");

const C1 = `---
cycle: C1
start: 2026-11-06
end: 2026-12-24
---

# C1 · 离散 + 范式

## Weekly Template

| 星期 | 类型 | 主项 | 辅助 |
|---|---|---|---|
| 周一 | 深度 | [[subjects/x\\|离散]] | — |
| 周二 | 深度 | [[subjects/y\\|范式]] | — |
| 周三 | 深度 | [[subjects/x\\|离散]] | — |
| 周四 | 深度 | [[subjects/y\\|范式]] | — |
| 周五 | 整合 | — | — |
| 周六 | 低强度 | — | — |
| 周日 | 休息 | — | — |
`;

const ROUTE = `---
route: 测试路线
start: 2026-11-06
end: 2027-04-08
buffer_weeks: 12
---

## Cycles

| 周期 | 开始 | 结束 | 主项 | 辅助（下周期主项） | 状态 |
|---|---|---|---|---|---|
| [[cycles/c1\\|C1]] | 2026-11-06 | 2026-12-24 | 离散、范式 | — | 进行中 |
| C2 | 2026-12-25 | 2027-02-11 | 算法、C | — | 未开始 |
`;

/** 一个合法的 C2 周期页（起止接在 C1 之后，与 C1 不重叠）。 */
const C2 = (template = "| 周一 | 深度 | [[subjects/z\\|算法]] | — |") => `---
cycle: C2
start: 2026-12-25
end: 2027-02-11
---

# C2 · 算法 + C

## Weekly Template

| 星期 | 类型 | 主项 | 辅助 |
|---|---|---|---|
${template}
| 周二 | 深度 | [[subjects/w\\|C]] | — |
| 周三 | 深度 | [[subjects/z\\|算法]] | — |
| 周四 | 深度 | [[subjects/w\\|C]] | — |
| 周五 | 整合 | — | — |
| 周六 | 低强度 | — | — |
| 周日 | 休息 | — | — |
`;

async function writeVault(vault) {
  await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
  await writeFile(join(vault, "wiki", "cycles", "c1.md"), C1);
  await writeFile(join(vault, "wiki", "cycles", "route.md"), ROUTE);
  await writeFile(join(vault, "wiki", "subjects.md"), "# 科目\n");
  await writeFile(join(vault, "wiki", "index.md"), "# 索引\n\n- [[cycles/c1|C1]]\n");
  await writeFile(join(vault, "wiki", "log.md"), "# 日志\n\n- 旧条目\n");
}

async function stage(workspace, vault, cN) {
  const out = JSON.parse((await run("node", [SCRIPT, "stage", vault, cN, "--workspace", workspace, "--json"])).stdout);
  return out;
}

const hasJj = await run("which", ["jj"]).then(() => true).catch(() => false);

test("stage：按清单复制文件、基线记 sha256、库里没有的文件建空且记 null；重复 stage 拒绝", async () => {
  const vault = await mkdtemp(join(tmpdir(), "open-vault-"));
  const workspace = await mkdtemp(join(tmpdir(), "open-ws-"));
  try {
    await writeVault(vault);
    const { staging, files } = await stage(workspace, vault, "C2");
    assert.match(staging, /\.cycle\/C2-\d{8}-\d{6}(-\d+)?$/);
    assert.deepEqual(files, [
      "wiki/cycles/c2.md",
      "wiki/cycles/c1.md",
      "wiki/cycles/route.md",
      "wiki/subjects.md",
      "wiki/index.md",
      "wiki/log.md",
    ]);
    const manifest = JSON.parse(await readFile(join(staging, "manifest.json"), "utf8"));
    assert.equal(manifest.cycle, "C2");
    assert.equal(manifest.base["wiki/cycles/c2.md"], null); // 新建
    assert.match(manifest.base["wiki/log.md"], /^[0-9a-f]{64}$/);
    assert.equal(await readFile(join(staging, "wiki", "cycles", "c1.md"), "utf8"), C1);
    assert.equal(await readFile(join(staging, "wiki", "cycles", "c2.md"), "utf8"), "");

    await assert.rejects(
      run("node", [SCRIPT, "stage", vault, "C2", "--workspace", workspace, "--json"]),
      (error) => /已有未提交的暂存/.test(error.stderr),
    );
    // 工作区换了就能再 stage（不同 .cycle 目录）。
    const other = await mkdtemp(join(tmpdir(), "open-ws2-"));
    try {
      const second = await stage(other, vault, "C2");
      assert.ok(second.staging !== staging);
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  } finally {
    await rm(vault, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  }
});

test("C1 的 stage 没有上一周期页", async () => {
  const vault = await mkdtemp(join(tmpdir(), "open-vault-"));
  const workspace = await mkdtemp(join(tmpdir(), "open-ws-"));
  try {
    await writeVault(vault);
    const { files } = await stage(workspace, vault, "C1");
    assert.deepEqual(files, ["wiki/cycles/c1.md", "wiki/cycles/route.md", "wiki/subjects.md", "wiki/index.md", "wiki/log.md"]);
  } finally {
    await rm(vault, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  }
});

test("check：空的新周期页不过；改好副本后过；route 坏、log 只追加、index 不删行都查", async () => {
  const vault = await mkdtemp(join(tmpdir(), "open-vault-"));
  const workspace = await mkdtemp(join(tmpdir(), "open-ws-"));
  try {
    await writeVault(vault);
    const { staging } = await stage(workspace, vault, "C2");

    // 空的新周期页：parseCycle 失败。
    const bad = JSON.parse(
      await run("node", [SCRIPT, "check", staging, "--json"]).then((ok) => ok.stdout, (error) => error.stdout),
    );
    assert.equal(bad.ok, false);
    assert.ok(bad.problems.some((problem) => problem.startsWith("wiki/cycles/c2.md")));

    // 写新周期页：与 C1 日期重叠 → 周期重叠问题。
    await writeFile(join(staging, "wiki", "cycles", "c2.md"), C2().replace("start: 2026-12-25", "start: 2026-12-01"));
    const overlap = JSON.parse(
      await run("node", [SCRIPT, "check", staging, "--json"]).then((ok) => ok.stdout, (error) => error.stdout),
    );
    assert.equal(overlap.ok, false);
    assert.ok(overlap.problems.some((problem) => /重叠/.test(problem)));

    // 修好日期；route 弄坏（C2 的结束日早于开始日）→ route 问题。
    await writeFile(join(staging, "wiki", "cycles", "c2.md"), C2());
    await writeFile(join(staging, "wiki", "cycles", "route.md"), ROUTE.replace("2027-02-11", "2026-12-24"));
    const badRoute = JSON.parse(
      await run("node", [SCRIPT, "check", staging, "--json"]).then((ok) => ok.stdout, (error) => error.stdout),
    );
    assert.equal(badRoute.ok, false);
    assert.ok(badRoute.problems.some((problem) => problem.startsWith("cycles/route.md")));
    await writeFile(join(staging, "wiki", "cycles", "route.md"), ROUTE);

    // log 改原文不是追加 → 拒绝；index 删行 → 拒绝。
    await writeFile(join(staging, "wiki", "log.md"), "# 日志\n\n- 被改过的条目\n");
    await writeFile(join(staging, "wiki", "index.md"), "# 索引\n");
    const both = JSON.parse(
      await run("node", [SCRIPT, "check", staging, "--json"]).then((ok) => ok.stdout, (error) => error.stdout),
    );
    assert.equal(both.ok, false);
    assert.ok(both.problems.some((problem) => problem.startsWith("wiki/log.md")));
    assert.ok(both.problems.some((problem) => problem.startsWith("wiki/index.md")));

    // 全部修好：log 只追加、index 原样 → 通过。
    await writeFile(join(staging, "wiki", "log.md"), "# 日志\n\n- 旧条目\n- 开 C2\n");
    await writeFile(join(staging, "wiki", "index.md"), "# 索引\n\n- [[cycles/c1|C1]]\n- [[cycles/c2|C2]]\n");
    const ok = JSON.parse((await run("node", [SCRIPT, "check", staging, "--json"])).stdout);
    assert.deepEqual(ok, { ok: true, problems: [] });
  } finally {
    await rm(vault, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  }
});

test("commit：校验不过不写；库里被改过拒绝；通过后写回文件、删暂存、jj 记一笔「开周期 C2 <日期>」", { skip: !hasJj }, async () => {
  const vault = await mkdtemp(join(tmpdir(), "open-vault-"));
  const workspace = await mkdtemp(join(tmpdir(), "open-ws-"));
  try {
    await writeVault(vault);
    await run("jj", ["git", "init"], { cwd: vault });
    await writeFile(join(vault, ".gitignore"), ".jj/\n");
    await run("jj", ["describe", "-m", "初始"], { cwd: vault });
    await run("jj", ["new"], { cwd: vault });

    // 第一笔：check 不过的 commit 拒绝且不写库。
    const bad = await stage(workspace, vault, "C2");
    await assert.rejects(run("node", [SCRIPT, "commit", bad.staging, "--json"]), (error) => {
      const out = JSON.parse(error.stdout);
      assert.equal(out.ok, false);
      return true;
    });
    await run("node", [SCRIPT, "abort", bad.staging, "--json"]);

    // 第二笔：暂存后库里 subjects.md 被改（check 不管这个文件）→ commit 的 sha 核对拒绝。
    const conflict = await stage(workspace, vault, "C2");
    await writeFile(join(conflict.staging, "wiki", "cycles", "c2.md"), C2());
    await writeFile(join(vault, "wiki", "subjects.md"), "# 科目\n\n- [[subjects/z|算法]]\n");
    await assert.rejects(
      run("node", [SCRIPT, "commit", conflict.staging, "--json"]),
      (error) => /wiki\/subjects\.md 在暂存后被改过，重新 stage/.test(error.stderr),
    );
    await rm(conflict.staging, { recursive: true, force: true });

    // 第三笔：正常通过。
    const { staging } = await stage(workspace, vault, "C2");
    await writeFile(join(staging, "wiki", "cycles", "c2.md"), C2());
    await writeFile(join(staging, "wiki", "log.md"), "# 日志\n\n- 旧条目\n- 开 C2\n");
    await writeFile(join(staging, "wiki", "cycles", "route.md"), ROUTE.replace("未开始", "进行中"));
    const out = JSON.parse((await run("node", [SCRIPT, "commit", staging, "--json"])).stdout);
    assert.deepEqual(out.committed, [
      "wiki/cycles/c2.md",
      "wiki/cycles/c1.md",
      "wiki/cycles/route.md",
      "wiki/subjects.md",
      "wiki/index.md",
      "wiki/log.md",
    ]);
    assert.equal(out.jj, "ok");
    assert.equal(await readFile(join(vault, "wiki", "cycles", "c2.md"), "utf8"), C2());
    assert.equal(await readFile(join(vault, "wiki", "log.md"), "utf8"), "# 日志\n\n- 旧条目\n- 开 C2\n");
    assert.ok((await readFile(join(vault, "wiki", "cycles", "route.md"), "utf8")).includes("进行中"));
    assert.ok(!existsSync(staging), "暂存目录已删");
    assert.deepEqual((await readdir(join(workspace, ".cycle"))), []);

    const log = (await run("jj", ["log", "-r", "description(glob:\"开周期 *\")", "-T", "description.first_line()"], { cwd: vault })).stdout;
    assert.match(log, /开周期 C2 \d{4}-\d{2}-\d{2}/);
    const history = (await run("jj", ["log", "-T", "description.first_line() ++ \"\\n\""], { cwd: vault })).stdout;
    assert.equal((history.match(/开周期 C2/g) ?? []).length, 1, "恰好一笔开周期提交");
  } finally {
    await rm(vault, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  }
});

test("非 jj 库也能 commit（jj: skipped）；abort 删暂存目录", async () => {
  const vault = await mkdtemp(join(tmpdir(), "open-vault-"));
  const workspace = await mkdtemp(join(tmpdir(), "open-ws-"));
  try {
    await writeVault(vault);
    const { staging } = await stage(workspace, vault, "C2");
    await writeFile(join(staging, "wiki", "cycles", "c2.md"), C2());
    const out = JSON.parse((await run("node", [SCRIPT, "commit", staging, "--json"])).stdout);
    assert.equal(out.jj, "skipped");
    assert.equal(await readFile(join(vault, "wiki", "cycles", "c2.md"), "utf8"), C2());

    const second = await stage(workspace, vault, "C3");
    assert.ok(existsSync(second.staging));
    await run("node", [SCRIPT, "abort", second.staging]);
    assert.ok(!existsSync(second.staging));
    await assert.rejects(run("node", [SCRIPT, "abort", second.staging]), (error) => /暂存目录不存在/.test(error.stderr));
    // 删了暂存里某个文件 → check 报缺少。
    const third = await stage(workspace, vault, "C4");
    await rm(join(third.staging, "wiki", "cycles", "c4.md"));
    const missing = JSON.parse(
      await run("node", [SCRIPT, "check", third.staging, "--json"]).then((ok) => ok.stdout, (error) => error.stdout),
    );
    assert.equal(missing.ok, false);
    assert.ok(missing.problems.includes("暂存里缺少 wiki/cycles/c4.md"));
  } finally {
    await rm(vault, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  }
});
