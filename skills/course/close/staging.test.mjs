#!/usr/bin/env node
// close/staging.mjs 的测试：暂存目录的布局与 manifest、同课重复暂存的拒绝、workspaceOf、
// gatherCheck 对改坏的暂存报 problems。全部在 mkdtemp 里。
// 会 process.exit(1) 的路径（fail）在子进程里跑，只验退出码与中文报错。
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { escapeRegExp, gatherCheck, stageInternal, workspaceOf } from "./staging.mjs";

const STAGING_URL = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "staging.mjs")).href;

const SCHEDULE = [
  "<!-- xuegen:schedule:start rest=sun -->",
  "| 天 | 日期 | 内容 | 材料 | 完成条件 |",
  "|---|---|---|---|---|",
  "| D1 | 2026-11-09（周一） | 第 1 课 | — | — |",
  "| D2 | 2026-11-10（周二） | 第 2 课 | — | — |",
  "<!-- xuegen:schedule:end -->",
].join("\n");

const INDEX = "# 索引\n\n## Courses\n\n- [[courses/epp|离散数学]]\n";
const LOG = "# 学习日志\n\n## 2026-11-08\n\n- 读了 §1.1\n";

function coursePage(title = "离散数学") {
  return [
    "<!-- xuegen:course-state -->",
    "",
    `# ${title}（Epp）学习计划`,
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
    "## Today",
    "",
    "日期：2026-11-09",
    "",
    "- [ ] 讲 §1.1",
    "",
    "## Next Session",
    "",
    "[[reading/epp|Epp]] §1.2。",
    "",
    "## 计划表（参考）",
    "",
    SCHEDULE,
    "",
    "## Relationships",
    "",
    "- [[subjects/discrete-math|离散数学]]",
    "",
  ].join("\n");
}

/** 库（课程页 + index + log + records 目录）+ 工作区；不建 records 下的当月文件。 */
async function makeFixture({ slug = "epp" } = {}) {
  const root = await mkdtemp(join(tmpdir(), "close-staging-"));
  const vault = join(root, "vault");
  const ws = join(root, "ws");
  await mkdir(join(vault, "wiki", "courses", slug, "records"), { recursive: true });
  await mkdir(ws, { recursive: true });
  await writeFile(join(vault, "wiki", "courses", `${slug}.md`), coursePage());
  await writeFile(join(vault, "wiki", "index.md"), INDEX);
  await writeFile(join(vault, "wiki", "log.md"), LOG);
  return { root, vault, ws };
}

async function cleanup(fixture) {
  try {
    execFileSync("chmod", ["-R", "u+rwX", fixture.root]);
  } catch {
    /* 已经没了 */
  }
  await rm(fixture.root, { recursive: true, force: true });
}

const mode = async (path) => (await stat(path)).mode & 0o777;

/** 在子进程里调 stageInternal（同课未提交暂存时会 fail→exit 1），返回 { code, stderr }。 */
function stageInChild(vault, slug, workspace) {
  const code = [
    `import { stageInternal } from ${JSON.stringify(STAGING_URL)};`,
    `process.stdout.write(JSON.stringify({ staging: stageInternal(${JSON.stringify(vault)}, ${JSON.stringify(slug)}, ${JSON.stringify(workspace)}) }));`,
  ].join("\n");
  try {
    const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
    return { code: 0, stderr: "", stdout };
  } catch (error) {
    return { code: error.status ?? 1, stderr: error.stderr ?? "", stdout: error.stdout ?? "" };
  }
}

// ---- stage ----

test("stageInternal：暂存里有课程页、index、log 与 manifest（镜像可写、base 是 sha256）；再 stage 时当月 records 一起进来", async () => {
  const fixture = await makeFixture();
  try {
    const staging = stageInternal(fixture.vault, "epp", fixture.ws);
    assert.equal(dirname(staging), join(fixture.ws, ".close"), "暂存放在工作区 .close 下");
    assert.match(staging.split("/").pop(), /^epp-\d{8}-\d{6}(-\d+)?$/);

    const names = (await readdir(join(staging, "wiki"))).sort();
    assert.deepEqual(names, ["courses", "index.md", "log.md"], "暂存里是库的那几份文件");
    assert.equal(await readFile(join(staging, "wiki", "courses", "epp.md"), "utf8"), coursePage());
    assert.equal(await readFile(join(staging, "wiki", "index.md"), "utf8"), INDEX);
    assert.equal(await readFile(join(staging, "wiki", "log.md"), "utf8"), LOG);
    assert.equal(await mode(join(staging, "wiki", "courses", "epp.md")), 0o644, "镜像放开成可写");

    const manifest = JSON.parse(await readFile(join(staging, "manifest.json"), "utf8"));
    assert.equal(manifest.version, 1);
    assert.equal(manifest.vault, fixture.vault);
    assert.equal(manifest.slug, "epp");
    assert.equal(manifest.subject, "discrete-math");
    assert.deepEqual(Object.keys(manifest.base).sort(), ["wiki/courses/epp.md", "wiki/index.md", "wiki/log.md"]);
    assert.match(manifest.base["wiki/courses/epp.md"], /^[0-9a-f]{64}$/, "基线记的是 sha256");
    // 库里没被动过：stage 只读，不锁、不写
    assert.equal(await readFile(join(fixture.vault, "wiki", "log.md"), "utf8"), LOG);
    assert.equal(await mode(join(fixture.vault, "wiki", "courses", "epp.md")), 0o644, "stage 不锁库");

    // 边界：当月 records 已经存在、课程页已被上一次收课上锁为 0444 时，
    // records 也是「库的那几份文件」之一，一起进暂存与 base；镜像仍然要放开成可写。
    await writeFile(join(staging, "committed"), "", "utf8"); // 让同课的下一份暂存不被挡住
    const { localDate } = await import("./durable.mjs");
    const rel = `wiki/courses/epp/records/${localDate().slice(0, 7)}.md`;
    await writeFile(join(fixture.vault, rel), "- 记录\n", "utf8");
    await chmod(join(fixture.vault, "wiki", "courses", "epp.md"), 0o444); // 锁住的库页也能 stage
    const again = stageInternal(fixture.vault, "epp", fixture.ws);
    const againManifest = JSON.parse(await readFile(join(again, "manifest.json"), "utf8"));
    assert.ok(Object.keys(againManifest.base).includes(rel), `base 里应有 ${rel}`);
    assert.equal(await readFile(join(again, rel), "utf8"), "- 记录\n");
    assert.equal(await mode(join(again, "wiki", "courses", "epp.md")), 0o644, "从 0444 的库页复制后也放开成可写");
    assert.equal(await mode(join(fixture.vault, "wiki", "courses", "epp.md")), 0o444, "库里那份仍是 0444（stage 不改库）");
  } finally {
    await cleanup(fixture);
  }
});

test("stageInternal：同课已有未提交暂存时拒绝（退出码 1、中文报错）；已 committed 的不算", async () => {
  const fixture = await makeFixture();
  try {
    const first = stageInChild(fixture.vault, "epp", fixture.ws);
    assert.equal(first.code, 0, first.stderr);
    const staging = JSON.parse(first.stdout).staging;

    const second = stageInChild(fixture.vault, "epp", fixture.ws);
    assert.equal(second.code, 1);
    assert.equal(second.stdout, "", "拒绝时不输出 staging");
    assert.match(second.stderr, /^course-close: 这门课已有未提交的暂存：/m);
    assert.match(second.stderr, /先 commit 或 abort 再重新 stage/);
    assert.deepEqual(
      (await readdir(join(fixture.ws, ".close"))).filter((name) => name.startsWith("epp-")),
      [staging.split("/").pop()],
      "没有多建暂存目录",
    );

    // 标了 committed 的旧暂存不再挡路
    await writeFile(join(staging, "committed"), "");
    const third = stageInChild(fixture.vault, "epp", fixture.ws);
    assert.equal(third.code, 0, third.stderr);
  } finally {
    await cleanup(fixture);
  }
});

test("stageInternal：slug 前缀相同的别门课（epp-advanced）的暂存不挡 epp", async () => {
  const fixture = await makeFixture();
  try {
    const other = join(fixture.ws, ".close", "epp-advanced-20261110-101010");
    await mkdir(other, { recursive: true });
    await writeFile(join(other, "manifest.json"), "{}\n");
    const result = stageInChild(fixture.vault, "epp", fixture.ws);
    assert.equal(result.code, 0, result.stderr);
    assert.match(JSON.parse(result.stdout).staging, /\.close\/epp-\d{8}-\d{6}$/);
  } finally {
    await cleanup(fixture);
  }
});

// ---- workspaceOf ----

test("workspaceOf：从 <ws>/.close/<name> 推出工作区根", async () => {
  const fixture = await makeFixture();
  try {
    const staging = stageInternal(fixture.vault, "epp", fixture.ws);
    assert.equal(workspaceOf(staging), fixture.ws);
    // 纯字符串推导：不要求目录存在
    assert.equal(workspaceOf("/tmp/ws/.close/epp-20261110-101010"), "/tmp/ws");
    assert.equal(workspaceOf("/tmp/a/b/c"), "/tmp/a");
  } finally {
    await cleanup(fixture);
  }
});

// ---- gatherCheck ----

test("gatherCheck：干净的暂存 ok 且 changes 为空；改坏的暂存放在 problems 里逐条说明", async () => {
  const fixture = await makeFixture();
  try {
    const staging = stageInternal(fixture.vault, "epp", fixture.ws);
    const clean = gatherCheck(staging);
    assert.equal(clean.result.ok, true, JSON.stringify(clean.result.problems));
    assert.deepEqual(clean.result.problems, []);
    assert.deepEqual(clean.result.changes, [], "没改就没变更");

    // 1) log 不是纯追加；2) 写了一个不属于本课的路径；3) 课程页丢了状态标记
    await writeFile(join(staging, "wiki", "log.md"), "# 学习日志\n\n- 把基线整段换掉\n");
    await mkdir(join(staging, "wiki", "knowledge"), { recursive: true });
    await writeFile(join(staging, "wiki", "knowledge", "profile.md"), "# 我的资料\n");
    await writeFile(join(staging, "wiki", "courses", "epp.md"), "# 离散数学\n\n没有状态标记的课程页\n");
    // 4) 概念页缺 sources
    await mkdir(join(staging, "wiki", "knowledge", "concepts", "discrete-math"), { recursive: true });
    await writeFile(
      join(staging, "wiki", "knowledge", "concepts", "discrete-math", "truth-table.md"),
      "---\ntitle: 真值表\n---\n\n# 真值表\n",
    );

    const broken = gatherCheck(staging);
    assert.equal(broken.result.ok, false);
    const kinds = Object.fromEntries(broken.result.problems.map((problem) => [problem.path, problem.kind]));
    assert.equal(kinds["wiki/log.md"], "append-only");
    assert.equal(kinds["wiki/knowledge/profile.md"], "owner", "不属于本课的路径被拒");
    assert.equal(kinds["wiki/courses/epp.md"], "course-page");
    assert.equal(kinds["wiki/knowledge/concepts/discrete-math/truth-table.md"], "concept-page");
    assert.ok(
      broken.result.problems.every((problem) => problem.detail && problem.detail.length > 0),
      "每条问题都带中文 detail",
    );
    assert.equal(broken.manifest.slug, "epp", "manifest 原样读回");
  } finally {
    await cleanup(fixture);
  }
});

test("gatherCheck：暂存里的符号链接不跟随，按 owner 报出来", async () => {
  const fixture = await makeFixture();
  try {
    const staging = stageInternal(fixture.vault, "epp", fixture.ws);
    const link = join(staging, "wiki", "courses", "epp", "records", "link.md");
    await mkdir(dirname(link), { recursive: true });
    await symlink(join(fixture.vault, "wiki", "log.md"), link);
    const { result } = gatherCheck(staging);
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.problems.map((problem) => [problem.path, problem.kind]),
      [["wiki/courses/epp/records/link.md", "owner"]],
    );
    assert.match(result.problems[0].detail, /符号链接/);
  } finally {
    await cleanup(fixture);
  }
});
