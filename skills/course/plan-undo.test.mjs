#!/usr/bin/env node
// plan-undo.mjs 的测试：临时目录里 jj git init 建真仓库（本机没有 jj 时 skip），
// 不碰真实库、真实工作区或 ~/.xuegen。计划提交直接用 jj commit -m「计划/顺延 …」
// 造出来（总控那条写路的产物），再跑 list / undo。
import { test, skip } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "plan-undo.mjs");

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

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

/** 临时 jj 库：{ root, vault, ws, env, jj }，epp 课程页已提交成「基线」。 */
async function makeRepo() {
  const root = await mkdtemp(join(tmpdir(), "plan-undo-"));
  const vault = join(root, "vault");
  const ws = join(root, "ws");
  const config = join(root, "jj-config.toml");
  await writeFile(config, 'user.name = "计划撤销测试"\nuser.email = "test@example.com"\n');
  await mkdir(join(vault, "wiki", "courses", "epp"), { recursive: true });
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

/** 把 rel 改成 content 并提交为 message（默认「计划 epp …」），返回 commit_id。 */
async function commitAs(fixture, rel, content, message = "计划 epp 2026-11-14") {
  const abs = join(fixture.vault, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content);
  fixture.jj(["commit", "-m", message, "--", `root-file:"${rel}"`]);
  return fixture.jj(["log", "-r", "@-", "--no-graph", "-T", "commit_id"]).trim();
}

const SINCE = () => new Date().toISOString();
const undoArgs = (fixture, since) => ["undo", fixture.vault, "--since", since, "--workspace", fixture.ws];

jjTest("list：输出 commits（id/kind/slug/date，从旧到新），空库是空数组", async () => {
  const fixture = await makeRepo();
  try {
    const before = await cliJson(["list", fixture.vault, "--since", SINCE()], { env: fixture.env });
    assert.deepEqual(before, { commits: [] });
    // since 要在提交之前取：jj 提交时间只存到秒，先提交再取可能跨过一秒边界把它漏掉。
    const since = SINCE();
    const id = await commitAs(fixture, "wiki/courses/epp.md", `${PAGE_V1}- v2\n`);
    const after = await cliJson(["list", fixture.vault, "--since", since], { env: fixture.env });
    assert.deepEqual(after.commits, [{ id, kind: "计划", slug: "epp", date: "2026-11-14" }]);
  } finally {
    await cleanup(fixture);
  }
});

jjTest("list：--since 之前的计划提交不算，「收课 …」提交也不算", async () => {
  const fixture = await makeRepo();
  try {
    await commitAs(fixture, "wiki/courses/epp.md", `${PAGE_V1}- 旧计划\n`, "计划 epp 2026-11-13");
    await commitAs(fixture, "wiki/log.md", "# 日志\n- 收课痕迹\n", "收课 epp 2026-11-14");
    await sleep(1100); // jj 提交时间只有秒精度，隔开一秒保证 since 落在两次提交之间
    const since = SINCE();
    await commitAs(fixture, "wiki/courses/epp.md", `${PAGE_V1}- 新计划\n`, "计划 epp 2026-11-14");
    const out = await cliJson(["list", fixture.vault, "--since", since], { env: fixture.env });
    assert.equal(out.commits.length, 1, "只算 since 之后的那次计划");
    assert.equal(out.commits[0].date, "2026-11-14");
  } finally {
    await cleanup(fixture);
  }
});

jjTest("undo：一轮两个提交改同一文件，一起撤回到最早那次之前", async () => {
  const fixture = await makeRepo();
  try {
    const since = SINCE();
    const first = await commitAs(fixture, "wiki/courses/epp.md", `${PAGE_V1}- v2\n`, "计划 epp 2026-11-14");
    const second = await commitAs(fixture, "wiki/courses/epp.md", `${PAGE_V1}- v3\n`, "顺延 epp 2026-11-14");
    const out = await cliJson(undoArgs(fixture, since), { env: fixture.env });
    assert.deepEqual(out.undone.sort(), [first, second].sort());
    assert.deepEqual(out.restoreFiles, ["wiki/courses/epp.md"]);
    assert.deepEqual(out.keptNew, []);
    assert.equal(out.jj, "ok");
    assert.equal(await readFile(join(fixture.vault, "wiki", "courses", "epp.md"), "utf8"), PAGE_V1);
    assert.match(fixture.jj(["log", "--no-graph", "-T", "description.first_line()"]), /撤销计划 epp/);
  } finally {
    await cleanup(fixture);
  }
});

jjTest("undo：这一轮新建的页保留进 keptNew，不恢复也不提交", async () => {
  const fixture = await makeRepo();
  try {
    const since = SINCE();
    await commitAs(fixture, "wiki/courses/linear.md", "# 线性代数\n");
    const out = await cliJson(undoArgs(fixture, since), { env: fixture.env });
    assert.deepEqual(out.keptNew, ["wiki/courses/linear.md"]);
    assert.deepEqual(out.restoreFiles, []);
    assert.equal(out.jj, "skipped");
    assert.equal(out.board, "skipped");
    assert.ok(existsSync(join(fixture.vault, "wiki", "courses", "linear.md")), "新页留着");
    const log = fixture.jj(["log", "--no-graph", "-T", "description.first_line()"]);
    assert.doesNotMatch(log, /撤销计划/, "没有可恢复的东西就不新增撤销提交");
  } finally {
    await cleanup(fixture);
  }
});

jjTest("undo：这一轮之后同页被别的提交改过 → 拒绝且什么都不动", async () => {
  const fixture = await makeRepo();
  try {
    const since = SINCE();
    await commitAs(fixture, "wiki/courses/epp.md", `${PAGE_V1}- v2\n`);
    await commitAs(fixture, "wiki/courses/epp.md", `${PAGE_V1}- 手工\n`, "手工改动");
    const failed = await cli(undoArgs(fixture, since), { expectFail: true, env: fixture.env });
    assert.match(failed.stderr, /这一轮之后 wiki\/courses\/epp\.md 又被改过，不能直接撤销/);
    assert.equal(await readFile(join(fixture.vault, "wiki", "courses", "epp.md"), "utf8"), `${PAGE_V1}- 手工\n`);
    assert.doesNotMatch(fixture.jj(["log", "--no-graph", "-T", "description.first_line()"]), /撤销计划/);
  } finally {
    await cleanup(fixture);
  }
});

jjTest("undo：这一轮之后同页在工作副本里改过 → 拒绝且什么都不动", async () => {
  const fixture = await makeRepo();
  try {
    const since = SINCE();
    await commitAs(fixture, "wiki/courses/epp.md", `${PAGE_V1}- v2\n`);
    await writeFile(join(fixture.vault, "wiki", "courses", "epp.md"), `${PAGE_V1}- 未提交的改动\n`);
    const failed = await cli(undoArgs(fixture, since), { expectFail: true, env: fixture.env });
    assert.match(failed.stderr, /又被改过，不能直接撤销/);
    assert.equal(await readFile(join(fixture.vault, "wiki", "courses", "epp.md"), "utf8"), `${PAGE_V1}- 未提交的改动\n`);
  } finally {
    await cleanup(fixture);
  }
});

jjTest("undo：撤过一次再撤 → 第二次被「撤销计划」那次提交挡下", async () => {
  const fixture = await makeRepo();
  try {
    const since = SINCE();
    await commitAs(fixture, "wiki/courses/epp.md", `${PAGE_V1}- v2\n`);
    const first = await cliJson(undoArgs(fixture, since), { env: fixture.env });
    assert.equal(first.jj, "ok");
    const failed = await cli(undoArgs(fixture, since), { expectFail: true, env: fixture.env });
    assert.match(failed.stderr, /又被改过，不能直接撤销/);
    assert.equal(await readFile(join(fixture.vault, "wiki", "courses", "epp.md"), "utf8"), PAGE_V1);
  } finally {
    await cleanup(fixture);
  }
});

jjTest("undo：since 之后没有计划提交 → 报「没有可撤销的」", async () => {
  const fixture = await makeRepo();
  try {
    const failed = await cli(undoArgs(fixture, SINCE()), { expectFail: true, env: fixture.env });
    assert.match(failed.stderr, /这一轮没有提交过计划改动，没有可撤销的/);
  } finally {
    await cleanup(fixture);
  }
});

jjTest("undo：库不在 jj 下 → 报「撤销需要库在 jj 下」", async () => {
  const root = await mkdtemp(join(tmpdir(), "plan-undo-nojj-"));
  try {
    const vault = join(root, "vault");
    const ws = join(root, "ws");
    await mkdir(vault, { recursive: true });
    await mkdir(ws, { recursive: true });
    const failed = await cli(["undo", vault, "--since", SINCE(), "--workspace", ws], { expectFail: true });
    assert.match(failed.stderr, /撤销需要库在 jj 下/);
    const listFailed = await cli(["list", vault, "--since", SINCE()], { expectFail: true });
    assert.match(listFailed.stderr, /撤销需要库在 jj 下/);
  } finally {
    await cleanup({ root });
  }
});

jjTest("撤销后课程页重新上锁（0444），目录 0555", async () => {
  const fixture = await makeRepo();
  try {
    const since = SINCE();
    await commitAs(fixture, "wiki/courses/epp.md", `${PAGE_V1}- v2\n`);
    const out = await cliJson(undoArgs(fixture, since), { env: fixture.env });
    assert.equal(out.jj, "ok");
    const mode = async (path) => (await stat(path)).mode & 0o777;
    assert.equal(await mode(join(fixture.vault, "wiki", "courses", "epp.md")), 0o444);
    assert.equal(await mode(join(fixture.vault, "wiki", "courses", "epp")), 0o555);
  } finally {
    await cleanup(fixture);
  }
});
