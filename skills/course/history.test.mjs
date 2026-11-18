#!/usr/bin/env node
// history.mjs 的测试：classify 是纯函数直接断言；list / undo 在临时目录里
// jj git init 建真仓库（本机没有 jj 时 skip），不碰真实库、真实工作区或 ~/.xuegen。
// 提交照 plan-undo.test.mjs 的写法直接用 jj commit -m 造出来。
import { test, skip } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { classify } from "./history.mjs";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "history.mjs");

const hasJj = (() => {
  try {
    execFileSync("jj", ["--version"], { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
})();
const jjTest = hasJj ? test : (name) => skip(`${name}（本机没有 jj，跳过）`);

const PAGE_V1 = [
  "<!-- xuegen:course-state -->",
  "",
  "# 离散数学（Epp）学习计划",
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
  "## Learning Record",
  "",
  "### 2026-11-09-01",
  "",
  "- 讲了 §1.1。",
  "",
].join("\n");

const CONCEPT = "wiki/knowledge/concepts/discrete-math/010-predicate.md";
const CARD = "wiki/knowledge/flashcards/discrete-math/010-predicate.md";

/** 临时 jj 库：{ root, vault, ws, env, jj }，epp 课程页与 wiki/index.md 已提交成「基线」。 */
async function makeRepo() {
  const root = await mkdtemp(join(tmpdir(), "history-"));
  const vault = join(root, "vault");
  const ws = join(root, "ws");
  const config = join(root, "jj-config.toml");
  await writeFile(config, 'user.name = "改动记录测试"\nuser.email = "test@example.com"\n');
  await mkdir(join(vault, "wiki", "courses"), { recursive: true });
  await mkdir(ws, { recursive: true });
  const env = { ...process.env, JJ_CONFIG: config };
  const jj = (args) => execFileSync("jj", args, { cwd: vault, encoding: "utf8", env });
  jj(["git", "init"]);
  await writeFile(join(vault, "wiki", "courses", "epp.md"), PAGE_V1);
  await writeFile(join(vault, "wiki", "index.md"), "# 索引\n");
  jj(["commit", "-m", "基线"]);
  return { root, vault, ws, env, jj };
}

async function cleanup(fixture) {
  try {
    execFileSync("chmod", ["-R", "u+rwX", fixture.root]);
  } catch {
    /* 已经没了 */
  }
  await rm(fixture.root, { recursive: true, force: true });
}

/** 跑 CLI；expectFail 时返回 { code, stdout, stderr } 而不是抛错。 */
async function cli(args, { expectFail = false, env = {} } = {}) {
  try {
    const { stdout, stderr } = await run(process.execPath, [SCRIPT, ...args], {
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
    if (expectFail) assert.fail(`期望失败但成功：${args.join(" ")}\n${stdout}`);
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (!expectFail) throw error;
    return { code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

const cliJson = async (args, opts) => JSON.parse((await cli([...args, "--json"], opts)).stdout);

/** 一次写多个文件并整体提交为 message，返回 commit_id。 */
async function commitFiles(fixture, files, message) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(fixture.vault, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content);
  }
  fixture.jj(["commit", "-m", message]);
  return fixture.jj(["log", "-r", "@-", "--no-graph", "-T", "commit_id"]).trim();
}

/** 基线之上依次造「计划 epp」「收课 epp」「改名：手工」三个提交，返回 {fixture, planId, closeId, manualId}。 */
async function makeHistoryFixture() {
  const fixture = await makeRepo();
  const planId = await commitFiles(
    fixture,
    { "wiki/courses/epp.md": `${PAGE_V1}- 计划 v2\n` },
    "计划 epp 2026-11-16",
  );
  const closeId = await commitFiles(
    fixture,
    {
      "wiki/courses/epp.md": `${PAGE_V1}- 收课 v3\n`,
      [CONCEPT]: "# 谓词\n",
      [CARD]: "# 谓词卡片\n",
    },
    "收课 epp 2026-11-17",
  );
  const manualId = await commitFiles(fixture, { "wiki/index.md": "# 索引\n\n- 新名\n" }, "改名：库全英文命名");
  return { fixture, planId, closeId, manualId };
}

const listArgs = (fixture, days = 30) => ["list", fixture.vault, "--days", String(days)];
const undoArgs = (fixture, ids) => ["undo", fixture.vault, "--ids", ids, "--workspace", fixture.ws];

test("classify：动词、slug、日期与手工提交", () => {
  assert.deepEqual(classify("收课 ctm 2026-11-17"), { verb: "收课", slug: "ctm", text: "收课 ctm 2026-11-17", manual: false });
  assert.deepEqual(classify("卡片 2026-11-17"), { verb: "卡片", slug: null, text: "卡片 2026-11-17", manual: false });
  assert.deepEqual(classify("卡片：离散 谓词与量词（D4，6 张）"), {
    verb: "卡片",
    slug: null,
    text: "卡片：离散 谓词与量词（D4，6 张）",
    manual: false,
  });
  assert.deepEqual(classify("偏好 discrete-math 删一条"), {
    verb: "偏好",
    slug: "discrete-math",
    text: "偏好 discrete-math 删一条",
    manual: false,
  });
  assert.deepEqual(classify("撤销计划 ctm、epp 2026-11-16"), {
    verb: "撤销计划",
    slug: "ctm、epp",
    text: "撤销计划 ctm、epp 2026-11-16",
    manual: false,
  });
  assert.deepEqual(classify("改名：库全英文命名"), { verb: null, slug: null, text: "改名：库全英文命名", manual: true });
});

test("classify：多行描述只看第一行；空描述返回 null", () => {
  assert.deepEqual(classify("顺延 epp 2026-11-16\n\n第二行不算"), {
    verb: "顺延",
    slug: "epp",
    text: "顺延 epp 2026-11-16",
    manual: false,
  });
  assert.equal(classify(""), null);
  assert.equal(classify("   \n"), null);
});

jjTest("list --days 30 --json：三条由新到旧，added 与 undoable/blocked 各就位", async () => {
  const { fixture, planId, closeId, manualId } = await makeHistoryFixture();
  try {
    const out = await cliJson(listArgs(fixture), { env: fixture.env });
    // 基线那条是手工提交，排最旧。
    assert.deepEqual(
      out.entries.map((entry) => entry.id),
      [manualId, closeId, planId, out.entries[3].id],
    );
    const [manual, close, plan, base] = out.entries;
    assert.equal(manual.manual, true);
    assert.equal(manual.verb, null);
    assert.equal(manual.text, "改名：库全英文命名");
    assert.equal(manual.undoable, false);
    assert.equal(manual.blocked, "kind");
    assert.deepEqual(close, {
      id: closeId,
      at: close.at,
      verb: "收课",
      slug: "epp",
      text: "收课 epp 2026-11-17",
      manual: false,
      added: { concepts: 1, cards: 1 },
      undoable: true,
      blocked: null,
    });
    assert.equal(plan.verb, "计划");
    assert.equal(plan.undoable, false);
    assert.equal(plan.blocked, "later", "课程页被更新的收课改过");
    assert.equal(base.text, "基线");
  } finally {
    await cleanup(fixture);
  }
});

jjTest("list：工作副本改了课程页（不提交）→ 收课也变 blocked later", async () => {
  const { fixture, closeId } = await makeHistoryFixture();
  try {
    await writeFile(join(fixture.vault, "wiki", "courses", "epp.md"), `${PAGE_V1}- 未提交\n`);
    const out = await cliJson(listArgs(fixture), { env: fixture.env });
    const close = out.entries.find((entry) => entry.id === closeId);
    assert.equal(close.undoable, false);
    assert.equal(close.blocked, "later");
  } finally {
    await cleanup(fixture);
  }
});

jjTest("undo --ids <收课 id>：课程页回到收课前且仍只读，新建页保留，撤销记录不可再撤", async () => {
  const { fixture, closeId } = await makeHistoryFixture();
  try {
    // 收课事务会把课程页锁成只读；模拟一下再撤。
    await chmod(join(fixture.vault, "wiki", "courses", "epp.md"), 0o444);
    const out = await cliJson(undoArgs(fixture, closeId), { env: fixture.env });
    assert.deepEqual(out.undone, [closeId]);
    assert.deepEqual(out.restoreFiles, ["wiki/courses/epp.md"]);
    assert.deepEqual([...out.keptNew].sort(), [CONCEPT, CARD].sort());
    assert.equal(out.jj, "ok");
    const page = join(fixture.vault, "wiki", "courses", "epp.md");
    assert.equal(await readFile(page, "utf8"), `${PAGE_V1}- 计划 v2\n`, "回到收课前的内容");
    assert.equal((await stat(page)).mode & 0o777, 0o444, "课程页仍是只读");
    assert.ok(existsSync(join(fixture.vault, CONCEPT)), "概念页保留");
    assert.ok(existsSync(join(fixture.vault, CARD)), "卡片页保留");
    assert.match(fixture.jj(["log", "--no-graph", "-T", "description.first_line() ++ \"\\n\""]), /^撤销 收课 epp 2026-11-17$/m);
    const listed = await cliJson(listArgs(fixture), { env: fixture.env });
    const undoEntry = listed.entries.find((entry) => entry.verb === "撤销");
    assert.equal(undoEntry.blocked, "kind");
    const close = listed.entries.find((entry) => entry.id === closeId);
    assert.equal(close.blocked, "later", "原收课被撤销提交挡下");
  } finally {
    await cleanup(fixture);
  }
});

jjTest("undo --ids <计划 id>（收课还在）→ 报「又被改过」，什么都不动", async () => {
  const { fixture, planId } = await makeHistoryFixture();
  try {
    const failed = await cli(undoArgs(fixture, planId), { expectFail: true, env: fixture.env });
    assert.match(failed.stderr, /wiki\/courses\/epp\.md 在这之后又被改过，不能直接撤销/);
    assert.equal(await readFile(join(fixture.vault, "wiki", "courses", "epp.md"), "utf8"), `${PAGE_V1}- 收课 v3\n`);
    assert.doesNotMatch(fixture.jj(["log", "--no-graph", "-T", "description.first_line() ++ \"\\n\""]), /撤销/);
  } finally {
    await cleanup(fixture);
  }
});

jjTest("undo --ids <手工 id> → 报「不能在这里撤销」", async () => {
  const { fixture, manualId } = await makeHistoryFixture();
  try {
    const failed = await cli(undoArgs(fixture, manualId), { expectFail: true, env: fixture.env });
    assert.match(failed.stderr, /这条不能在这里撤销/);
  } finally {
    await cleanup(fixture);
  }
});

jjTest("undo --ids a,b：两条同课同类提交一起撤，回到最早那条之前，描述带「等 2 条」", async () => {
  const fixture = await makeRepo();
  try {
    const first = await commitFiles(
      fixture,
      { "wiki/courses/epp.md": `${PAGE_V1}- v2\n` },
      "计划 epp 2026-11-16",
    );
    const second = await commitFiles(
      fixture,
      { "wiki/courses/epp.md": `${PAGE_V1}- v3\n` },
      "计划 epp 2026-11-17",
    );
    // --ids 反着给也要按列表位置从旧到新撤。
    const out = await cliJson(undoArgs(fixture, `${second},${first}`), { env: fixture.env });
    assert.deepEqual(out.undone, [first, second]);
    assert.deepEqual(out.restoreFiles, ["wiki/courses/epp.md"]);
    assert.equal(await readFile(join(fixture.vault, "wiki", "courses", "epp.md"), "utf8"), PAGE_V1);
    assert.match(fixture.jj(["log", "--no-graph", "-T", "description.first_line() ++ \"\\n\""]), /^撤销 计划 epp 2026-11-17 等 2 条$/m);
  } finally {
    await cleanup(fixture);
  }
});

jjTest("list：库不在 jj 下 / --days 越界 → 中文报错", async () => {
  const root = await mkdtemp(join(tmpdir(), "history-nojj-"));
  try {
    const vault = join(root, "vault");
    const ws = join(root, "ws");
    await mkdir(vault, { recursive: true });
    await mkdir(ws, { recursive: true });
    const failed = await cli(["list", vault, "--days", "30"], { expectFail: true });
    assert.match(failed.stderr, /历史需要库在 jj 下/);
    const undoFailed = await cli(["undo", vault, "--ids", "abc", "--workspace", ws], { expectFail: true });
    assert.match(undoFailed.stderr, /历史需要库在 jj 下/);
  } finally {
    await cleanup({ root });
  }
  const fixture = await makeRepo();
  try {
    for (const days of ["0", "91", "abc"]) {
      const failed = await cli(["list", fixture.vault, "--days", days], { expectFail: true, env: fixture.env });
      assert.match(failed.stderr, /--days 要 1–90 的整数/);
    }
    const noIds = await cli(undoArgs(fixture, ""), { expectFail: true, env: fixture.env });
    assert.match(noIds.stderr, /需要 --ids/);
    const unknown = await cli(undoArgs(fixture, "0123abcd"), { expectFail: true, env: fixture.env });
    assert.match(unknown.stderr, /这条改动不在最近 90 天的记录里/);
  } finally {
    await cleanup(fixture);
  }
});
