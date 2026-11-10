#!/usr/bin/env node
// close/jj.mjs 的测试：filesetLiteral 是纯函数；isJjRepo / jjCommit 在 mkdtemp 里的真 jj 库上测。
// 建库方式照 course-close.test.mjs（JJ_CONFIG 指向临时配置、jj git init 建真库）；
// jjCommit 内部用 process.env 调 jj，所以它在子进程里跑，子进程只带临时的 JJ_CONFIG。
// 本机没有 jj 时 jj 相关用例 skip 并说明。
import { test, skip } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { filesetLiteral, isJjRepo } from "./jj.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const JJ_URL = pathToFileURL(join(HERE, "jj.mjs")).href;

const hasJj = (() => {
  try {
    execFileSync("jj", ["--version"], { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
})();
const jjTest = hasJj ? test : (name) => skip(`${name}（本机没有 jj，跳过）`);

/** 临时 jj 库：{root, vault, env, jj(args)}。基线提交后工作副本干净。 */
async function makeJjRepo() {
  const root = await mkdtemp(join(tmpdir(), "close-jj-"));
  const vault = join(root, "vault");
  await mkdir(vault, { recursive: true });
  const config = join(root, "jj-config.toml");
  await writeFile(config, 'user.name = "收课测试"\nuser.email = "test@example.com"\n');
  // 只留 PATH 与 JJ_CONFIG：不继承宿主的 jj 配置与 JJ_* 变量。
  const env = { PATH: process.env.PATH, HOME: root, JJ_CONFIG: config };
  const run = (args) => execFileSync("jj", args, { cwd: vault, encoding: "utf8", env });
  run(["git", "init"]);
  run(["commit", "-m", "基线"]);
  return { root, vault, env, jj: run };
}

/** 在干净的子进程里调 jjCommit（模块内部走 process.env），返回结果字符串。 */
function jjCommitInChild(vault, message, paths, env) {
  const code = [
    `import { jjCommit } from ${JSON.stringify(JJ_URL)};`,
    `const result = jjCommit(${JSON.stringify(vault)}, ${JSON.stringify(message)}, ${JSON.stringify(paths)});`,
    "process.stdout.write(JSON.stringify({ result }));",
  ].join("\n");
  const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", env });
  return JSON.parse(stdout).result;
}

async function cleanup(fixture) {
  try {
    execFileSync("chmod", ["-R", "u+rwX", fixture.root]);
  } catch {
    /* 已经没了 */
  }
  await rm(fixture.root, { recursive: true, force: true });
}

// ---- 纯函数 ----

test("filesetLiteral：root-file: 前缀 + 双引号包裹，反斜杠与引号各自转义，花括号与空格原样", () => {
  assert.equal(filesetLiteral("wiki/courses/epp.md"), 'root-file:"wiki/courses/epp.md"');
  // 引号加反斜杠；反斜杠翻倍（顺序不能反，否则引号的转义会被再转一遍）
  assert.equal(filesetLiteral('a"b.md'), 'root-file:"a\\"b.md"');
  assert.equal(filesetLiteral("a\\b.md"), 'root-file:"a\\\\b.md"');
  assert.equal(filesetLiteral('a\\"b.md'), 'root-file:"a\\\\\\"b.md"');
  // 花括号、空格、制表符不做模式解释：`{a => b}.md` 必须是字面量路径
  assert.equal(filesetLiteral("wiki/{a => b}.md"), 'root-file:"wiki/{a => b}.md"');
  assert.equal(filesetLiteral("wiki/a b.md"), 'root-file:"wiki/a b.md"');
  assert.equal(filesetLiteral("wiki/a\tb.md"), 'root-file:"wiki/a\tb.md"');
});

// ---- 仓库判定 ----

test("isJjRepo：只看库根的 .jj，空目录、不存在的路径、.jj 自己都为假", async () => {
  const root = await mkdtemp(join(tmpdir(), "close-jj-isdir-"));
  try {
    const withMeta = join(root, "with-meta");
    await mkdir(join(withMeta, ".jj"), { recursive: true });
    assert.equal(isJjRepo(withMeta), true);
    const plain = join(root, "plain");
    await mkdir(plain);
    assert.equal(isJjRepo(plain), false);
    assert.equal(isJjRepo(join(root, "没有这个目录")), false);
    // 不往上级找：子目录里有/没有 .jj 都不会误判
    assert.equal(isJjRepo(join(withMeta, ".jj")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---- jjCommit ----

jjTest("jjCommit：只提交给定路径，库里别的未提交改动留在工作副本", async () => {
  const fixture = await makeJjRepo();
  try {
    await writeFile(join(fixture.vault, "a.md"), "改过的\n");
    await writeFile(join(fixture.vault, "b.md"), "无关改动\n");
    assert.equal(jjCommitInChild(fixture.vault, "只收 a", ["a.md"], fixture.env), "ok");
    const summary = fixture.jj(["diff", "-r", "@-", "--summary"])
      .trim()
      .split("\n")
      .map((line) => line.slice(1).trim());
    assert.deepEqual(summary, ["a.md"], "提交里只有 a.md");
    const status = fixture.jj(["st"]);
    assert.match(status, /b\.md/, "无关改动仍在工作副本");
    assert.doesNotMatch(status, /a\.md/, "a.md 已提交、不在工作副本");
    assert.equal(fixture.jj(["log", "-r", "@-", "--no-graph", "-T", "description.first_line()"]).trim(), "只收 a");
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jjCommit：非 jj 库、空列表、非数组都返回 skipped，不抛、不建提交", async () => {
  const root = await mkdtemp(join(tmpdir(), "close-jj-skip-"));
  try {
    const plain = join(root, "plain");
    await mkdir(plain);
    const env = { PATH: process.env.PATH, HOME: root };
    assert.equal(jjCommitInChild(plain, "x", ["a.md"], env), "skipped", "非 jj 库整个跳过");
    assert.equal(jjCommitInChild(plain, "x", [], env), "skipped");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  const fixture = await makeJjRepo();
  try {
    await writeFile(join(fixture.vault, "a.md"), "改动\n");
    assert.equal(jjCommitInChild(fixture.vault, "空列表", [], fixture.env), "skipped", "没有路径就不提交");
    assert.equal(jjCommitInChild(fixture.vault, "非数组", "a.md", fixture.env), "skipped");
    assert.match(fixture.jj(["st"]), /a\.md/, "工作副本没被动过");
    assert.equal(fixture.jj(["log", "-r", "@-", "--no-graph", "-T", "description.first_line()"]).trim(), "基线");
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jjCommit：jj 失败时返回 `failed: <首行原因>` 而不抛，且工作副本与提交历史都不动", async () => {
  const fixture = await makeJjRepo();
  try {
    await writeFile(join(fixture.vault, "a.md"), "改动\n");
    const before = fixture.jj(["log", "--no-graph", "-T", "commit_id"]);
    // 库根之外的路径（`..` 逃出库）：jj 的 fileset 解析器直接拒绝，命令以非 0 退出。
    const result = jjCommitInChild(fixture.vault, "坏路径", ["../a.md"], fixture.env);
    assert.match(result, /^failed: Error/, `应为 failed: Error…，实际 ${result}`);
    assert.doesNotMatch(result, /\n/, "只留首行原因");
    assert.match(result, /Invalid file pattern/, "原因原样带上 jj 的说明");
    assert.equal(fixture.jj(["log", "--no-graph", "-T", "commit_id"]), before, "jj 没有多提交");
    assert.match(fixture.jj(["st"]), /a\.md/, "工作副本还是原样");
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jjCommit：路径含引号、花括号、空格时按字面量匹配，只收那一个文件", async () => {
  const fixture = await makeJjRepo();
  try {
    const odd = 'wiki/{a => b} 或 "c".md';
    await mkdir(join(fixture.vault, "wiki"), { recursive: true });
    await writeFile(join(fixture.vault, odd), "内容\n");
    const listed = fixture.jj(["file", "list", "-T", 'json(path) ++ "\\n"'])
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(listed, [odd], "库里文件名就是字面量 {a => b} 或 \"c\".md");
    assert.equal(jjCommitInChild(fixture.vault, "怪名", [odd], fixture.env), "ok");
    assert.equal(fixture.jj(["diff", "-r", "@-", "--summary"]).trim(), `A ${odd}`, "提交里正好是这个字面量文件");
    assert.doesNotMatch(fixture.jj(["st"]), /wiki\//, "工作副本干净");
  } finally {
    await cleanup(fixture);
  }
});
