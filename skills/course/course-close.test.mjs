#!/usr/bin/env node
// course-close.mjs 的测试：纯函数一组 + CLI 端到端一组。
// 全部在 os.tmpdir() 下建临时库与临时工作区，绝不触碰真实库、真实工作区或 ~/.xuegen。
// jj 相关用例在临时目录里 `jj git init` 建真仓库；本机没有 jj 时这些用例 skip 并说明。
import { test, skip } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { existsSync, statSync as statSyncSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  checkAppendOnly,
  checkConceptPage,
  checkCoursePage,
  checkNoDeletedLines,
  isOwned,
  isSafeRelPath,
  ownedPrefixes,
  parseDiffEntries,
  planCheck,
  stagingName,
  subjectOf,
  withWritable,
} from "./course-close.mjs";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "course-close.mjs");

const hasJj = (() => {
  try {
    execFileSync("jj", ["--version"], { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
})();
const jjTest = hasJj ? test : (name) => skip(`${name}（本机没有 jj，跳过）`);

// ---- 夹具 ----

const SCHEDULE = [
  "<!-- xuegen:schedule:start rest=sun -->",
  "| 天 | 日期 | 内容 | 材料 | 完成条件 |",
  "|---|---|---|---|---|",
  "| D1 | 2026-11-09（周一） | 第 1 课 | — | — |",
  "| D2 | 2026-11-10（周二） | 第 2 课 | — | — |",
  "| R1-D1 | 2026-11-10（周二） | 复习：第 1 课 | 笔记 / 检查题 | 不看笔记复述要点 |",
  "<!-- xuegen:schedule:end -->",
].join("\n");

const INDEX = "# 索引\n\n## Courses\n\n- [[courses/epp|离散数学]]\n";
const LOG = "# 学习日志\n\n## 2026-11-08\n\n- 读了 §1.1\n";

/** 一份合法课程页。record 为额外的 Learning Record 段落、subject 为 Relationships 行。 */
function coursePage({ record = "", subject = "- [[subjects/discrete-math|离散数学]]", tail = "" } = {}) {
  return [
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
    "## Learning Record",
    "",
    "### 2026-11-09-01",
    "",
    "- 讲了 §1.1。",
    "- 完成：D1",
    record,
    tail,
    "## Relationships",
    "",
    subject,
    "",
  ].join("\n");
}

/** 收课时在课程页里追加一条记录（在 ## Relationships 前插入）。 */
function withCloseRecord(text, id = "D1") {
  return text.replace(
    "## Relationships",
    `### 2026-11-09-02\n\n- 收课：讲了第二节。\n- 完成：${id}\n\n## Relationships`,
  );
}

const CONCEPT = (subject = "discrete-math", name = "truth-table") =>
  `---\ntitle: 真值表\nsources:\n  - [[reading/epp|Epp]] §1.1\n---\n\n# 真值表\n\n定义。\n`;

/** 临时根目录：{root, vault, ws}，库里有课程页、index.md、log.md、records 目录、概念目录。 */
async function makeVault({ slug = "epp" } = {}) {
  const root = await mkdtemp(join(tmpdir(), "course-close-"));
  const vault = join(root, "vault");
  const ws = join(root, "ws");
  await mkdir(join(vault, "wiki", "courses", slug, "records"), { recursive: true });
  await mkdir(join(vault, "wiki", "knowledge", "concepts", "discrete-math"), { recursive: true });
  await mkdir(join(vault, "wiki", "knowledge", "flashcards", "discrete-math"), { recursive: true });
  await mkdir(ws, { recursive: true });
  const page = join(vault, "wiki", "courses", `${slug}.md`);
  await writeFile(page, coursePage());
  await chmod(page, 0o444);
  await chmod(join(vault, "wiki", "courses", slug), 0o755);
  await chmod(join(vault, "wiki", "courses"), 0o755);
  await writeFile(join(vault, "wiki", "index.md"), INDEX);
  await writeFile(join(vault, "wiki", "log.md"), LOG);
  return { root, vault, ws, page };
}

async function cleanup(fixture) {
  // 只读锁会挡住 rm -r 的某些实现，先尽量放开。
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

async function cliJson(args, opts) {
  const { stdout } = await cli([...args, "--json"], opts);
  return JSON.parse(stdout);
}

const mode = async (path) => (await stat(path)).mode & 0o777;

// ══ 纯函数 ══

test("stagingName：本地时间，月日时分秒都补零", () => {
  assert.equal(stagingName("epp", new Date(2026, 0, 2, 3, 4, 5)), "epp-20260102-030405");
  assert.equal(stagingName("discrete-math-epp", new Date(2026, 10, 9, 23, 59, 59)), "discrete-math-epp-20261109-235959");
  assert.equal(stagingName("a", new Date(2026, 11, 31, 0, 0, 0)), "a-20261231-000000");
});

test("subjectOf：只取 Relationships 节里第一个 [[subjects/<s>]]", () => {
  assert.equal(subjectOf(coursePage()), "discrete-math");
  assert.equal(
    subjectOf(
      coursePage({ subject: "- 次要\n- [[subjects/linear-algebra|线代]]\n- [[subjects/other|x]]" }),
    ),
    "linear-algebra",
  );
  // 别的节里出现 subjects 链接不算。
  assert.equal(subjectOf(coursePage({ subject: "- 无" }).replace("## Today", "## Today\n\n- [[subjects/x]]")), null);
  assert.equal(subjectOf("# 没有 Relationships 的页面\n"), null);
  assert.equal(subjectOf("## Relationships\n\n- [[courses/epp]]\n"), null);
});

test("ownedPrefixes：无科目时不放概念/卡片目录，有科目时新旧两种布局都放", () => {
  const bare = ownedPrefixes("epp", null);
  assert.deepEqual(bare, [
    "wiki/courses/epp.md",
    "wiki/courses/epp/",
    "wiki/index.md",
    "wiki/log.md",
  ]);
  const full = ownedPrefixes("epp", "discrete-math");
  assert.ok(full.includes("wiki/knowledge/concepts/discrete-math/"));
  assert.ok(full.includes("wiki/knowledge/flashcards/discrete-math/"));
  assert.ok(full.includes("wiki/知识/concepts/"));
  assert.ok(full.includes("wiki/知识/flashcards/"));
});

test("isSafeRelPath：拒绝绝对路径、反斜杠、NUL、非规范形式、空串", () => {
  for (const bad of [
    "",
    "/etc/passwd",
    "C:/" + "Users/x",
    "wiki\\courses\\epp.md",
    "wiki/courses/epp.md\0.txt",
    "wiki//index.md",
    "wiki/./index.md",
    "wiki/courses/epp/../profile.md",
    "wiki/courses/../profile.md",
    "..",
    "../x.md",
    "./x.md",
    "wiki/courses/",
    ".",
  ]) {
    assert.equal(isSafeRelPath(bad), false, `应判为不安全：${JSON.stringify(bad)}`);
  }
  for (const good of ["wiki/index.md", "wiki/courses/epp.md", "wiki/courses/epp/records/2026-11.md"]) {
    assert.equal(isSafeRelPath(good), true, `应判为安全：${good}`);
  }
});

test("isOwned：本课路径通过，越界、大小写变体、别课、无科目时的概念页都拒绝", () => {
  assert.equal(isOwned("wiki/courses/epp.md", "epp", "discrete-math"), true);
  assert.equal(isOwned("wiki/courses/epp/records/2026-11.md", "epp", "discrete-math"), true);
  assert.equal(isOwned("wiki/index.md", "epp", "discrete-math"), true);
  assert.equal(isOwned("wiki/log.md", "epp", null), true);
  assert.equal(isOwned("wiki/knowledge/concepts/discrete-math/a.md", "epp", "discrete-math"), true);
  assert.equal(isOwned("wiki/knowledge/flashcards/discrete-math/a.md", "epp", "discrete-math"), true);
  assert.equal(isOwned("wiki/知识/concepts/math/a.md", "epp", "discrete-math"), true);
  // 越界与变体
  assert.equal(isOwned("wiki/courses/epp/../profile.md", "epp", "discrete-math"), false);
  assert.equal(isOwned("wiki/courses/../profile.md", "epp", "discrete-math"), false);
  assert.equal(isOwned("/wiki/courses/epp.md", "epp", "discrete-math"), false);
  assert.equal(isOwned("wiki/courses/EPP.md", "epp", "discrete-math"), false);
  assert.equal(isOwned("wiki/courses/epp.md.bak", "epp", "discrete-math"), false);
  assert.equal(isOwned("wiki/courses/epp2.md", "epp", "discrete-math"), false);
  assert.equal(isOwned("wiki/courses/epp-other/records/x.md", "epp", "discrete-math"), false);
  assert.equal(isOwned("wiki/profile.md", "epp", "discrete-math"), false);
  assert.equal(isOwned("raw/clip.md", "epp", "discrete-math"), false);
  // 科目取不到时，概念页不算本课
  assert.equal(isOwned("wiki/knowledge/concepts/discrete-math/a.md", "epp", null), false);
  assert.equal(isOwned("wiki/knowledge/concepts/other/a.md", "epp", "discrete-math"), false);
});

test("checkAppendOnly：纯追加通过，改动/删除报出第一处不同的行号", () => {
  assert.equal(checkAppendOnly("a\n", "a\nb\n"), null);
  assert.equal(checkAppendOnly("a\nb\n", "a\nb\n"), null);
  const reason = checkAppendOnly("a\nb\n", "a\nX\n");
  assert.match(reason, /不是纯追加/);
  assert.match(reason, /第 2 行/);
  assert.match(checkAppendOnly("a\nb\n", "a\n"), /第 2 行/);
});

test("checkNoDeletedLines：不删行通过，删行点名那条，空行不算", () => {
  assert.equal(checkNoDeletedLines("a\n\nb\n", "a\nb\nc\n"), null);
  assert.equal(checkNoDeletedLines("a\n", "a\n"), null);
  assert.equal(checkNoDeletedLines("a\nb\n", "a\n").includes("被删除或改动：b"), true);
  const reason = checkNoDeletedLines("a\nb\n", "a\n");
  assert.match(reason, /被删除或改动：b/);
  assert.equal(checkNoDeletedLines("a  \nb\n", "a\nb\n"), null, "行尾空白不算改动");
});

test("checkCoursePage：合法通过；缺标记、超 200 行、完成 id 不在排期、排期表坏掉都报", () => {
  assert.deepEqual(checkCoursePage(coursePage(), "epp"), []);
  assert.match(checkCoursePage(coursePage().replace("<!-- xuegen:course-state -->", "---\n---"), "epp").join("\n"), /标记/);
  const tooLong = `${coursePage()}\n${"## 附注\n\n".repeat(120)}`;
  assert.match(checkCoursePage(tooLong, "epp").join("\n"), /超过 200 行上限/);
  assert.match(checkCoursePage(withCloseRecord(coursePage(), "D9"), "epp").join("\n"), /不在排期表：D9/);
  const brokenSchedule = coursePage().replace("<!-- xuegen:schedule:end -->", "");
  assert.match(checkCoursePage(brokenSchedule, "epp").join("\n"), /排期表无法解析/);
});

test("checkConceptPage：要有 frontmatter 与 sources:", () => {
  assert.equal(checkConceptPage(CONCEPT()), null);
  assert.match(checkConceptPage("# 真值表\n"), /frontmatter/);
  assert.match(checkConceptPage("---\ntitle: x\n---\n"), /sources/);
});

test("parseDiffEntries：状态词转单字母、重命名给两路径、JSON 转义的制表符与引号不乱", () => {
  assert.deepEqual(parseDiffEntries('modified\t"wiki/a.md"\t"wiki/a.md"\nadded\t"wiki/b.md"\t"wiki/b.md"\n'), [
    { status: "M", paths: ["wiki/a.md"] },
    { status: "A", paths: ["wiki/b.md"] },
  ]);
  assert.deepEqual(parseDiffEntries('renamed\t"wiki/a.md"\t"wiki/b.md"\n'), [
    { status: "R", paths: ["wiki/a.md", "wiki/b.md"] },
  ]);
  assert.deepEqual(parseDiffEntries('removed\t"wiki/a.md"\t"wiki/a.md"\n'), [{ status: "D", paths: ["wiki/a.md"] }]);
  // 路径里带制表符、引号、花括号都没问题：JSON 会转义掉
  assert.deepEqual(parseDiffEntries('modified\t"w/a\\tb.md"\t"w/a\\tb.md"\n')[0].paths, ["w/a\tb.md"]);
  assert.deepEqual(parseDiffEntries('modified\t"w/{a => b}.md"\t"w/{a => b}.md"\n')[0].paths, ["w/{a => b}.md"]);
  assert.deepEqual(parseDiffEntries("\n\n"), []);
});

test("planCheck：归属、符号链接、冲突、只追加、课程页、概念页、" + "变更清单一次算清", () => {
  const page = "wiki/courses/epp.md";
  const manifest = { slug: "epp", subject: "discrete-math", base: { [page]: "sha-page", "wiki/log.md": "sha-log" } };
  const current = new Map([
    [page, { sha: "sha-page", text: coursePage() }],
    ["wiki/log.md", { sha: "sha-log", text: LOG }],
  ]);
  const staged = [
    { path: page, sha: "sha-page", text: coursePage(), symlink: false },
    { path: "wiki/log.md", sha: "sha-log", text: LOG, symlink: false },
  ];
  const clean = planCheck(manifest, staged, current);
  assert.equal(clean.ok, true);
  assert.deepEqual(clean.problems, []);
  assert.deepEqual(clean.changes, [], "内容与库里相同的文件不算变更");

  // 归属：越界路径
  const foreign = planCheck(manifest, [...staged, { path: "wiki/courses/epp/../profile.md", sha: "x", text: null, symlink: false }], current);
  assert.equal(foreign.ok, false);
  assert.deepEqual(foreign.problems.map((p) => [p.path, p.kind]), [["wiki/courses/epp/../profile.md", "owner"]]);
  assert.ok(!foreign.changes.some((change) => change.path.includes("profile")));

  // 符号链接：不跟随，报 owner
  const link = planCheck(manifest, [{ path: "wiki/courses/epp/records/x.md", sha: null, text: null, symlink: true }], current);
  assert.deepEqual(link.problems.map((p) => p.kind), ["owner"]);
  assert.match(link.problems[0].detail, /符号链接/);

  // 冲突：库里基线已变；新文件已存在
  const changed = new Map(current);
  changed.set("wiki/log.md", { sha: "sha-other", text: LOG });
  changed.set("wiki/knowledge/concepts/discrete-math/new.md", { sha: "sha-x", text: "x" });
  const conflict = planCheck(
    manifest,
    [...staged, { path: "wiki/knowledge/concepts/discrete-math/new.md", sha: "sha-new", text: CONCEPT(), symlink: false }],
    changed,
  );
  assert.deepEqual(
    conflict.problems.map((p) => [p.path, p.kind]).sort(),
    [
      ["wiki/knowledge/concepts/discrete-math/new.md", "conflict"],
      ["wiki/log.md", "conflict"],
    ],
  );

  // 只追加 / 不删行 / 课程页 / 概念页
  const appended = new Map([
    [page, { sha: "sha-page", text: coursePage() }],
    ["wiki/log.md", { sha: "sha-log", text: LOG }],
    ["wiki/index.md", { sha: "sha-index", text: INDEX }],
  ]);
  const bad = planCheck(
    { ...manifest, base: { ...manifest.base, "wiki/index.md": "sha-index" } },
    [
      { path: "wiki/log.md", sha: "s1", text: `${LOG}- 追加\n`.replace("- 读了", "- 读了改"), symlink: false },
      { path: "wiki/index.md", sha: "s2", text: "# 索引\n", symlink: false },
      { path: page, sha: "s3", text: withCloseRecord(coursePage(), "D9"), symlink: false },
      { path: "wiki/knowledge/concepts/discrete-math/t.md", sha: "s4", text: "# 无 frontmatter\n", symlink: false },
    ],
    appended,
  );
  assert.deepEqual(
    bad.problems.map((p) => p.kind).sort(),
    ["append-only", "concept-page", "course-page", "deleted-lines"],
  );
  assert.deepEqual(
    bad.changes.map((change) => [change.path, change.action]).sort(),
    [
      ["wiki/courses/epp.md", "update"],
      ["wiki/index.md", "update"],
      ["wiki/knowledge/concepts/discrete-math/t.md", "create"],
      ["wiki/log.md", "update"],
    ],
  );
});

test("withWritable：同步抛错也恢复 mode，返回 Promise 时等它结束再恢复", async () => {
  const root = await mkdtemp(join(tmpdir(), "course-close-writable-"));
  try {
    const dir = join(root, "locked");
    await mkdir(dir);
    await chmod(dir, 0o555);
    assert.equal(await mode(dir), 0o555);
    assert.throws(
      () =>
        withWritable(dir, () => {
          assert.equal(statSyncSync(dir).mode & 0o777, 0o755, "进去时临时放开写");
          throw new Error("炸");
        }),
      /炸/,
    );
    assert.equal(await mode(dir), 0o555, "同步抛错后仍恢复原 mode");
    await assert.rejects(
      withWritable(dir, async () => {
        assert.equal(await mode(dir), 0o755, "异步进同里临时放开写");
        throw new Error("炸异步");
      }),
      /炸异步/,
    );
    assert.equal(await mode(dir), 0o555, "异步失败后仍恢复原 mode");
    const value = await withWritable(dir, async () => 42);
    assert.equal(value, 42);
    assert.equal(await mode(dir), 0o555);
    assert.equal(withWritable(dir, () => "同步返回"), "同步返回");
    assert.equal(await mode(dir), 0o555);
  } finally {
    await cleanup({ root });
  }
});

// ══ CLI 端到端 ══

test("stage → 改 → check → commit：文件落盘、上锁、manifest 基线正确", async () => {
  const fixture = await makeVault();
  try {
    const staged = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    const staging = staged.staging;
    assert.match(staging, /\/\.close\/epp-\d{8}-\d{6}$/);
    const manifest = JSON.parse(await readFile(join(staging, "manifest.json"), "utf8"));
    assert.equal(manifest.version, 1);
    assert.equal(manifest.slug, "epp");
    assert.equal(manifest.subject, "discrete-math");
    assert.deepEqual(Object.keys(manifest.base).sort(), [
      "wiki/courses/epp.md",
      "wiki/index.md",
      "wiki/log.md",
    ]);
    assert.equal(await mode(join(staging, "wiki", "courses", "epp.md")), 0o644, "镜像可写");

    // 未改动时 check 通过且没有待提交文件
    const before = await cliJson(["check", staging]);
    assert.deepEqual(before, { ok: true, problems: [], changes: [] });

    await writeFile(join(staging, "wiki", "courses", "epp.md"), withCloseRecord(coursePage()));
    const concept = join(staging, "wiki", "knowledge", "concepts", "discrete-math", "truth-table.md");
    await mkdir(dirname(concept), { recursive: true });
    await writeFile(concept, CONCEPT());
    await writeFile(join(staging, "wiki", "log.md"), `${LOG}- 收课：epp D1\n`);

    const checked = await cliJson(["check", staging]);
    assert.equal(checked.ok, true, JSON.stringify(checked.problems));
    assert.deepEqual(
      checked.changes.map((change) => [change.path, change.action]).sort(),
      [
        ["wiki/courses/epp.md", "update"],
        ["wiki/knowledge/concepts/discrete-math/truth-table.md", "create"],
        ["wiki/log.md", "update"],
      ],
    );

    const committed = await cliJson(["commit", staging]);
    assert.equal(committed.committed, true);
    assert.equal(committed.jj, "skipped", "库不在 jj 下时跳过");
    assert.equal(await readFile(join(fixture.vault, "wiki", "courses", "epp.md"), "utf8"), withCloseRecord(coursePage()));
    assert.equal(await readFile(join(fixture.vault, "wiki", "log.md"), "utf8"), `${LOG}- 收课：epp D1\n`);
    assert.equal(await readFile(join(fixture.vault, "wiki", "knowledge", "concepts", "discrete-math", "truth-table.md"), "utf8"), CONCEPT());
    assert.equal(await readFile(join(fixture.vault, "wiki", "index.md"), "utf8"), INDEX, "没改的文件原样");

    // 锁：课程页与 records 目录只读，概念页与 index/log 保持 0644，wiki/courses 本身不动
    assert.equal(await mode(fixture.page), 0o444);
    assert.equal(await mode(join(fixture.vault, "wiki", "courses", "epp")), 0o555);
    assert.equal(await mode(join(fixture.vault, "wiki", "courses", "epp", "records")), 0o555);
    assert.equal(await mode(join(fixture.vault, "wiki", "courses")), 0o755);
    assert.equal(await mode(join(fixture.vault, "wiki", "knowledge", "concepts", "discrete-math", "truth-table.md")), 0o644);
    assert.equal(await mode(join(fixture.vault, "wiki", "log.md")), 0o644);
    assert.ok(existsSync(join(staging, "committed")));
    assert.ok(!existsSync(join(fixture.ws, ".close", "journal.json")));
    assert.deepEqual(
      (await readdir(join(fixture.vault, "wiki"))).filter((name) => name.includes("close-tmp")),
      [],
      "库里不留临时文件",
    );
  } finally {
    await cleanup(fixture);
  }
});

test("check 不通过时 exit 1，--json 仍输出问题清单，库和暂存都不动", async () => {
  const fixture = await makeVault();
  try {
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    await writeFile(join(staging, "wiki", "log.md"), "# 学习日志\n\n- 换掉基线\n");
    const failed = await cli(["check", staging, "--json"], { expectFail: true });
    assert.equal(failed.code, 1);
    const result = JSON.parse(failed.stdout);
    assert.equal(result.ok, false);
    assert.equal(result.problems[0].kind, "append-only");
    assert.equal(await readFile(join(fixture.vault, "wiki", "log.md"), "utf8"), LOG, "库没变");
    const plain = await cli(["check", staging], { expectFail: true });
    assert.match(plain.stdout, /check: 未通过/);
  } finally {
    await cleanup(fixture);
  }
});

test("冲突：暂存后库里被改 → check 与 commit 都拒绝，commit 什么都不写", async () => {
  const fixture = await makeVault();
  try {
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    await writeFile(join(staging, "wiki", "log.md"), `${LOG}- 收课\n`);
    await chmod(fixture.page, 0o644);
    await writeFile(fixture.page, `${coursePage()}\n- 别人在外面改的一行\n`);
    const failed = await cli(["check", staging, "--json"], { expectFail: true });
    assert.equal(failed.code, 1);
    const parsed = JSON.parse(failed.stdout);
    assert.deepEqual(parsed.problems.map((p) => [p.path, p.kind]), [["wiki/courses/epp.md", "conflict"]]);

    const commitFailed = await cli(["commit", staging], { expectFail: true });
    assert.match(commitFailed.stderr, /校验未通过（什么都不写）/);
    assert.match(await readFile(join(fixture.vault, "wiki", "log.md"), "utf8"), /- 读了 §1\.1/, "库里 log 仍是基线");
    assert.ok(!existsSync(join(fixture.ws, ".close", "journal.json")));
  } finally {
    await cleanup(fixture);
  }
});

test("冲突：暂存里新加的文件库里已经有了 → 提示先 add", async () => {
  const fixture = await makeVault();
  try {
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    const rel = "wiki/knowledge/concepts/discrete-math/existing.md";
    await mkdir(dirname(join(staging, rel)), { recursive: true });
    await writeFile(join(staging, rel), CONCEPT());
    await writeFile(join(fixture.vault, rel), "---\nsources: x\n---\n库里原有\n");
    const failed = await cli(["check", staging, "--json"], { expectFail: true });
    const parsed = JSON.parse(failed.stdout);
    assert.deepEqual(parsed.problems.map((p) => [p.path, p.kind]), [[rel, "conflict"]]);
    assert.match(parsed.problems[0].detail, /先用 add/);
  } finally {
    await cleanup(fixture);
  }
});

test("课程页：完成 id 不在排期、超过 200 行、新增概念页缺 sources 分别被拒", async () => {
  const fixture = await makeVault();
  try {
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    await writeFile(join(staging, "wiki", "courses", "epp.md"), withCloseRecord(coursePage(), "D9"));
    const badId = JSON.parse((await cli(["check", staging, "--json"], { expectFail: true })).stdout);
    assert.deepEqual(badId.problems.map((p) => p.kind), ["course-page"]);
    assert.match(badId.problems[0].detail, /不在排期表：D9/);

    await writeFile(join(staging, "wiki", "courses", "epp.md"), `${coursePage()}\n${"## 附注\n\n".repeat(120)}`);
    const tooLong = JSON.parse((await cli(["check", staging, "--json"], { expectFail: true })).stdout);
    assert.match(tooLong.problems.map((p) => p.detail).join("\n"), /超过 200 行上限/);

    await writeFile(join(staging, "wiki", "courses", "epp.md"), withCloseRecord(coursePage()));
    const rel = "wiki/knowledge/concepts/discrete-math/no-sources.md";
    await mkdir(dirname(join(staging, rel)), { recursive: true });
    await writeFile(join(staging, rel), "---\ntitle: 没来源\n---\n\n# 没来源\n");
    const noSources = JSON.parse((await cli(["check", staging, "--json"], { expectFail: true })).stdout);
    assert.deepEqual(noSources.problems.map((p) => [p.path, p.kind]), [[rel, "concept-page"]]);
    assert.match(noSources.problems[0].detail, /sources/);
  } finally {
    await cleanup(fixture);
  }
});

test("暂存里出现指向库内的符号链接 → 报 owner 并拒绝提交", async () => {
  const fixture = await makeVault();
  try {
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    await mkdir(join(staging, "wiki", "courses", "epp"), { recursive: true });
    await symlink(join(fixture.vault, "wiki", "index.md"), join(staging, "wiki", "courses", "epp", "link.md"));
    const failed = await cli(["check", staging, "--json"], { expectFail: true });
    const parsed = JSON.parse(failed.stdout);
    assert.deepEqual(parsed.problems.map((p) => [p.path, p.kind]), [["wiki/courses/epp/link.md", "owner"]]);
    assert.match(parsed.problems[0].detail, /符号链接/);
    const commitFailed = await cli(["commit", staging], { expectFail: true });
    assert.match(commitFailed.stderr, /校验未通过/);
  } finally {
    await cleanup(fixture);
  }
});

test("暂存里出现不属于本课的路径（含符号链接目录）→ 报 owner", async () => {
  const fixture = await makeVault();
  try {
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    // 直接往暂存根放一个 wiki/profile.md（不在 courses/epp 下，也不在本科目概念目录下）
    await mkdir(join(staging, "wiki"), { recursive: true });
    await writeFile(join(staging, "wiki", "profile.md"), "# 资料\n");
    // 再放一个指向库里的符号链接目录（不跟随）
    await symlink(join(fixture.vault, "wiki", "knowledge"), join(staging, "wiki", "linked"));
    const failed = await cli(["check", staging, "--json"], { expectFail: true });
    const parsed = JSON.parse(failed.stdout);
    const byPath = Object.fromEntries(parsed.problems.map((p) => [p.path, p.kind]));
    assert.equal(byPath["wiki/profile.md"], "owner");
    assert.equal(byPath["wiki/linked"], "owner");
    assert.match(parsed.problems.find((p) => p.path === "wiki/linked").detail, /符号链接/);
    const commitFailed = await cli(["commit", staging], { expectFail: true });
    assert.match(commitFailed.stderr, /路径不属于这门课/);
  } finally {
    await cleanup(fixture);
  }
});

test("只追加与不删行：log.md 只能末尾追加、index.md 不得删基线行（端到端）", async () => {
  const fixture = await makeVault();
  try {
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    // log.md：把基线的一行改掉 → append-only
    await writeFile(join(staging, "wiki", "log.md"), LOG.replace("读了 §1.1", "读了 §1.2"));
    // index.md：删掉一行 → deleted-lines
    await writeFile(join(staging, "wiki", "index.md"), INDEX.replace("- [[courses/epp|离散数学]]\n", ""));
    const failed = await cli(["check", staging, "--json"], { expectFail: true });
    const parsed = JSON.parse(failed.stdout);
    assert.deepEqual(
      parsed.problems.map((p) => [p.path, p.kind]).sort(),
      [
        ["wiki/index.md", "deleted-lines"],
        ["wiki/log.md", "append-only"],
      ],
    );
    assert.match(parsed.problems.find((p) => p.kind === "append-only").detail, /第 \d+ 行/);
    assert.match(parsed.problems.find((p) => p.kind === "deleted-lines").detail, /courses\/epp/);

    // 改成合法的追加/只在末尾加行就能过
    await writeFile(join(staging, "wiki", "log.md"), `${LOG}- 追加一行\n`);
    await writeFile(join(staging, "wiki", "index.md"), `${INDEX}- [[courses/algo|算法]]\n`);
    const ok = await cliJson(["check", staging]);
    assert.equal(ok.ok, true, JSON.stringify(ok.problems));
    assert.deepEqual(
      ok.changes.map((change) => [change.path, change.action]).sort(),
      [
        ["wiki/index.md", "update"],
        ["wiki/log.md", "update"],
      ],
    );
  } finally {
    await cleanup(fixture);
  }
});

test("stage 半途失败（库里缺 index.md）不留空暂存目录，下次 stage 不被堵", async () => {
  const fixture = await makeVault();
  try {
    await chmod(join(fixture.vault, "wiki", "index.md"), 0o644);
    await rm(join(fixture.vault, "wiki", "index.md"));
    const failed = await cli(["stage", fixture.vault, "epp", "--workspace", fixture.ws], { expectFail: true });
    assert.match(failed.stderr, /库里缺少 wiki\/index\.md/);
    assert.ok(!existsSync(join(fixture.ws, ".close")) || (await readdir(join(fixture.ws, ".close"))).length === 0);

    await writeFile(join(fixture.vault, "wiki", "index.md"), INDEX);
    const ok = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    assert.ok(existsSync(join(ok.staging, "manifest.json")));
  } finally {
    await cleanup(fixture);
  }
});

test("什么都没改时 commit 也不报错：没有变更、不写库、不留 journal", async () => {
  const fixture = await makeVault();
  try {
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    const result = await cliJson(["commit", staging]);
    assert.deepEqual(result, { committed: true, changes: [], jj: "skipped" });
    assert.equal(await mode(fixture.page), 0o444, "没变更也保持锁");
    assert.ok(!existsSync(join(fixture.ws, ".close", "journal.json")));
  } finally {
    await cleanup(fixture);
  }
});

test("重复 stage 拒绝；commit 后可以再 stage；abort 删暂存；已提交不能 abort", async () => {
  const fixture = await makeVault();
  try {
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    const dup = await cli(["stage", fixture.vault, "epp", "--workspace", fixture.ws], { expectFail: true });
    assert.match(dup.stderr, /这门课已有未提交的暂存/);

    await writeFile(join(staging, "wiki", "log.md"), `${LOG}- 追加\n`);
    await cliJson(["commit", staging]);
    const again = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    assert.notEqual(again.staging, staging);

    await cli(["abort", again.staging]);
    assert.ok(!existsSync(again.staging), "abort 后暂存目录没了");
    const abortCommitted = await cli(["abort", staging], { expectFail: true });
    assert.match(abortCommitted.stderr, /已提交，不能 abort/);
  } finally {
    await cleanup(fixture);
  }
});

test("add：越界路径、库里没有的文件、重复 add 都拒绝；合法 add 记进基线", async () => {
  const fixture = await makeVault();
  try {
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    const rel = "wiki/knowledge/concepts/discrete-math/covered.md";
    await writeFile(join(fixture.vault, rel), CONCEPT());
    const added = await cliJson(["add", staging, rel]);
    assert.equal(added.added, rel);
    const manifest = JSON.parse(await readFile(join(staging, "manifest.json"), "utf8"));
    assert.ok(manifest.base[rel], "基线里记了新文件");
    assert.equal(await mode(join(staging, rel)), 0o644);

    assert.match(
      (await cli(["add", staging, rel], { expectFail: true })).stderr,
      /已在暂存清单里/,
    );
    assert.match(
      (await cli(["add", staging, "wiki/profile.md"], { expectFail: true })).stderr,
      /不属于本课/,
    );
    assert.match(
      (await cli(["add", staging, "wiki/courses/epp/../profile.md"], { expectFail: true })).stderr,
      /不属于本课/,
    );
    assert.match(
      (await cli(["add", staging, "wiki/index.md"], { expectFail: true })).stderr,
      /已在暂存清单里/,
    );
    assert.match(
      (await cli(["add", staging, "wiki/courses/epp/missing.md"], { expectFail: true })).stderr,
      /库里没有这个文件/,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("recover：journal + 部分已 rename 时补完剩下文件，连跑两次第二次什么都不做", async () => {
  const fixture = await makeVault();
  try {
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    const relPage = "wiki/courses/epp.md";
    const relLog = "wiki/log.md";
    const newPage = withCloseRecord(coursePage());
    const newLog = `${LOG}- 收课：epp D1\n`;
    await writeFile(join(staging, relPage), newPage);
    await writeFile(join(staging, relLog), newLog);

    // 手工模拟一次崩溃：两个临时文件都写好、日志已落盘，但只有一个 rename 完成。
    const tmpPage = join(fixture.vault, "wiki", "courses", ".epp.md.close-tmp-9999");
    const tmpLog = join(fixture.vault, "wiki", ".log.md.close-tmp-9999");
    await chmod(join(fixture.vault, "wiki", "courses"), 0o755);
    await chmod(fixture.page, 0o644);
    await writeFile(tmpPage, newPage);
    // 第一个 rename 已经完成：临时文件不在，目标已是新内容。
    await writeFile(tmpLog, newLog);
    const journal = {
      staging,
      vault: fixture.vault,
      slug: "epp",
      files: [
        { path: relPage, tmp: tmpPage },
        { path: relLog, tmp: tmpLog },
      ],
      startedAt: "2026-11-09T00:00:00.000Z",
    };
    await mkdir(join(fixture.ws, ".close"), { recursive: true });
    await writeFile(join(fixture.ws, ".close", "journal.json"), `${JSON.stringify(journal, null, 2)}\n`);

    const recovered = await cliJson(["recover", fixture.vault, "--workspace", fixture.ws]);
    assert.equal(recovered.recovered, "epp");
    assert.equal(await readFile(join(fixture.vault, relPage), "utf8"), newPage);
    assert.equal(await readFile(join(fixture.vault, relLog), "utf8"), newLog);
    assert.equal(await mode(fixture.page), 0o444, "补完后上锁");
    assert.equal(await mode(join(fixture.vault, "wiki", "courses", "epp")), 0o555);
    assert.ok(!existsSync(tmpLog));
    assert.ok(!existsSync(join(fixture.ws, ".close", "journal.json")));
    assert.ok(existsSync(join(staging, "committed")), "补完的暂存标记已提交");

    const second = await cliJson(["recover", fixture.vault, "--workspace", fixture.ws]);
    assert.equal(second.recovered, null);
    const plain = await cli(["recover", fixture.vault, "--workspace", fixture.ws]);
    assert.match(plain.stdout, /没有中断的收课/);
  } finally {
    await cleanup(fixture);
  }
});

test("recover 会由其它命令自动触发（check 前先补完上次中断的收课）", async () => {
  const fixture = await makeVault();
  try {
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    const relLog = "wiki/log.md";
    const newLog = `${LOG}- 收课：epp D1\n`;
    await writeFile(join(staging, relLog), newLog);
    const tmpLog = join(fixture.vault, "wiki", ".log.md.close-tmp-8888");
    await writeFile(tmpLog, newLog);
    const journal = {
      staging,
      vault: fixture.vault,
      slug: "epp",
      files: [{ path: relLog, tmp: tmpLog }],
      startedAt: "2026-11-09T00:00:00.000Z",
    };
    await mkdir(join(fixture.ws, ".close"), { recursive: true });
    await writeFile(join(fixture.ws, ".close", "journal.json"), `${JSON.stringify(journal)}\n`);

    // 补完之后库里是新内容、manifest 基线是旧的，这份暂存已被标记提交，不该再 check；
    // 这里只验证「其它命令开头会自动补完」：stderr 有提示、文件已落盘。
    const checked = await cli(["check", staging, "--json"], { expectFail: true });
    assert.match(checked.stderr, /已补完上次中断的收课：epp/);
    assert.equal(await readFile(join(fixture.vault, relLog), "utf8"), newLog);
    assert.ok(!existsSync(join(fixture.ws, ".close", "journal.json")));
  } finally {
    await cleanup(fixture);
  }
});

test("commit 在 journal 之前失败：清掉临时文件、库不变、不留 journal", async () => {
  const fixture = await makeVault();
  try {
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    // 让库里的父路径是「文件」而不是目录：mkdir 会失败，发生在写 journal 之前。
    await writeFile(join(fixture.vault, "wiki", "knowledge", "concepts", "discrete-math", "blocker"), "我是文件\n");
    const rel = "wiki/knowledge/concepts/discrete-math/blocker/x.md";
    await mkdir(dirname(join(staging, rel)), { recursive: true });
    await writeFile(join(staging, rel), CONCEPT());
    await writeFile(join(staging, "wiki", "log.md"), `${LOG}- 收课\n`);

    assert.equal((await cliJson(["check", staging])).ok, true, "check 本身是过的");
    const failed = await cli(["commit", staging], { expectFail: true });
    assert.match(failed.stderr, /提交失败（journal 未写，临时文件已清理）/);
    assert.ok(!existsSync(join(fixture.ws, ".close", "journal.json")));
    assert.match(await readFile(join(fixture.vault, "wiki", "log.md"), "utf8"), /- 读了 §1\.1/, "库没变");
    const leftovers = (await readdir(join(fixture.vault, "wiki"))).filter((name) => name.includes("close-tmp"));
    assert.deepEqual(leftovers, [], "临时文件已清理");

    // 清掉障碍后重跑 commit：暂存目录仍可用（没被误标 committed）
    await rm(join(fixture.vault, "wiki", "knowledge", "concepts", "discrete-math", "blocker"));
    const retry = await cliJson(["commit", staging]);
    assert.equal(retry.committed, true);
    assert.match(await readFile(join(fixture.vault, "wiki", "log.md"), "utf8"), /- 收课/);
  } finally {
    await cleanup(fixture);
  }
});

test("commit 在 journal 之后失败（macOS 不可改名）→ 报提交中断，recover 补完", { skip: process.platform !== "darwin" }, async () => {
  const fixture = await makeVault();
  try {
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    const newPage = withCloseRecord(coursePage());
    await writeFile(join(staging, "wiki", "courses", "epp.md"), newPage);
    // 目标文件加 uchg（用户级不可变）：rename 覆盖它会 EPERM，正好卡在 journal 之后。
    execFileSync("chflags", ["uchg", fixture.page]);
    const failed = await cli(["commit", staging], { expectFail: true });
    assert.match(failed.stderr, /提交中断/);
    assert.match(failed.stderr, /会自动补完/);
    const journalFile = join(fixture.ws, ".close", "journal.json");
    assert.ok(existsSync(journalFile), "journal 留着给 recover");

    execFileSync("chflags", ["nouchg", fixture.page]);
    const recovered = await cliJson(["recover", fixture.vault, "--workspace", fixture.ws]);
    assert.equal(recovered.recovered, "epp");
    assert.equal(await readFile(fixture.page, "utf8"), newPage);
    assert.ok(!existsSync(journalFile));
  } finally {
    try {
      execFileSync("chflags", ["nouchg", fixture.page]);
    } catch {
      /* 已经没了 */
    }
    await cleanup(fixture);
  }
});

// ---- jj：A 节两条修复 ----

/** 在临时库里建 jj 仓库并把当前文件提交成基线。 */
async function initJj(vault, root) {
  const config = join(root, "jj-config.toml");
  await writeFile(config, 'user.name = "收课测试"\nuser.email = "test@example.com"\n');
  const env = { JJ_CONFIG: config };
  const jj = (args) => execFileSync("jj", args, { cwd: vault, encoding: "utf8", env: { ...process.env, ...env } });
  jj(["git", "init"]);
  jj(["commit", "-m", "基线"]);
  return { env, jj };
}

/** 走一遍 stage → 改 → commit，返回 { staging, result, id }。 */
async function closeCourse(fixture, env, slug, edit) {
  const { staging } = await cliJson(["stage", fixture.vault, slug, "--workspace", fixture.ws], { env });
  await edit(staging);
  const result = await cliJson(["commit", staging], { env });
  const id = execFileSync(
    "jj",
    ["log", "-r", `description(glob:"收课 ${slug} *")`, "--no-graph", "-T", "commit_id", "--limit", "1"],
    { cwd: fixture.vault, encoding: "utf8", env: { ...process.env, ...env } },
  ).trim();
  return { staging, result, id };
}

jjTest("jj：收课提交只收本次写入的文件，库里别的未提交改动留在工作副本", async () => {
  const fixture = await makeVault();
  try {
    const { env } = await initJj(fixture.vault, fixture.root);
    // 用户在 Obsidian 里刚改的东西：一个不相关的文件 + 一条没提交的笔记行。
    await writeFile(join(fixture.vault, "wiki", "profile.md"), "# 我的资料\n\n- 手写未提交\n");
    const jj = (args) => execFileSync("jj", args, { cwd: fixture.vault, encoding: "utf8", env: { ...process.env, ...env } });

    const { result, id } = await closeCourse(fixture, env, "epp", async (staging) => {
      await writeFile(join(staging, "wiki", "courses", "epp.md"), withCloseRecord(coursePage()));
      await writeFile(join(staging, "wiki", "log.md"), `${LOG}- 收课：epp D1\n`);
    });
    assert.equal(result.jj, "ok");

    const summary = jj(["diff", "-r", id, "--summary"])
      .trim()
      .split("\n")
      .map((line) => line.slice(1).trim())
      .sort();
    assert.deepEqual(summary, ["wiki/courses/epp.md", "wiki/log.md"], "收课提交里只有本次文件");
    const status = jj(["st"]);
    assert.match(status, /wiki\/profile\.md/, "无关改动仍在工作副本里未提交");
    assert.doesNotMatch(status, /wiki\/courses\/epp\.md/, "本次文件已被提交");
    assert.equal(await readFile(join(fixture.vault, "wiki", "profile.md"), "utf8"), "# 我的资料\n\n- 手写未提交\n");

    // 撤销这次收课也不会连带撤掉无关改动
    const undone = await cliJson(["undo", fixture.vault, "epp", "--workspace", fixture.ws], { env });
    assert.equal(undone.undone, id);
    assert.match(jj(["st"]), /wiki\/profile\.md/);
    assert.equal(await readFile(join(fixture.vault, "wiki", "profile.md"), "utf8"), "# 我的资料\n\n- 手写未提交\n");
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jj：收课之后同页又被改（工作副本）→ undo 拒绝且什么都不动", async () => {
  const fixture = await makeVault();
  try {
    const { env } = await initJj(fixture.vault, fixture.root);
    const closed = withCloseRecord(coursePage());
    await closeCourse(fixture, env, "epp", async (staging) => {
      await writeFile(join(staging, "wiki", "courses", "epp.md"), closed);
    });
    // 用户收课后又在 Obsidian 里改了同一页（还没提交）
    await chmod(fixture.page, 0o644);
    const later = `${closed}- 用户后来又改的一行\n`;
    await writeFile(fixture.page, later);

    const failed = await cli(["undo", fixture.vault, "epp", "--workspace", fixture.ws], { expectFail: true, env });
    assert.match(failed.stderr, /这次收课之后 wiki\/courses\/epp\.md 又被改过，不能直接撤销/);
    assert.equal(await readFile(fixture.page, "utf8"), later, "用户的改动没被盖掉");
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jj：收课之后同页又被改（已有提交）→ undo 拒绝且什么都不动", async () => {
  const fixture = await makeVault();
  try {
    const { env } = await initJj(fixture.vault, fixture.root);
    const closed = withCloseRecord(coursePage());
    await closeCourse(fixture, env, "epp", async (staging) => {
      await writeFile(join(staging, "wiki", "courses", "epp.md"), closed);
    });
    const jj = (args) => execFileSync("jj", args, { cwd: fixture.vault, encoding: "utf8", env: { ...process.env, ...env } });
    await chmod(fixture.page, 0o644);
    await writeFile(fixture.page, `${closed}- 手工又改一次\n`);
    jj(["commit", "-m", "手工改动", "--", '"wiki/courses/epp.md"']);

    const failed = await cli(["undo", fixture.vault, "epp", "--workspace", fixture.ws], { expectFail: true, env });
    assert.match(failed.stderr, /又被改过，不能直接撤销/);
    assert.match(await readFile(fixture.page, "utf8"), /手工又改一次/);
    assert.doesNotMatch(jj(["log", "--no-graph", "-T", "description.first_line()"]), /撤销收课/);
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jj：收课之后只有无关改动 → undo 成功，课程页回到收课前并重新上锁", async () => {
  const fixture = await makeVault();
  try {
    const { env } = await initJj(fixture.vault, fixture.root);
    const before = await readFile(fixture.page, "utf8");
    const { id } = await closeCourse(fixture, env, "epp", async (staging) => {
      await writeFile(join(staging, "wiki", "courses", "epp.md"), withCloseRecord(coursePage()));
      await writeFile(join(staging, "wiki", "log.md"), `${LOG}- 收课：epp D1\n`);
    });
    assert.equal(await mode(fixture.page), 0o444, "收课后上锁");
    // 无关改动：另一个文件，另一次手工编辑
    await writeFile(join(fixture.vault, "wiki", "profile.md"), "# 我的资料\n\n- 手写未提交\n");

    const undone = await cliJson(["undo", fixture.vault, "epp", "--workspace", fixture.ws], { env });
    assert.equal(undone.undone, id);
    assert.deepEqual(undone.restoreFiles.sort(), ["wiki/courses/epp.md", "wiki/log.md"]);
    assert.deepEqual(undone.keptNew, []);
    assert.deepEqual(undone.newCards, []);
    assert.equal(await readFile(fixture.page, "utf8"), before, "课程页回到收课前");
    assert.equal(await readFile(join(fixture.vault, "wiki", "log.md"), "utf8"), LOG, "log 也回到收课前");
    assert.equal(await mode(fixture.page), 0o444, "撤销后重新上锁");
    assert.equal(await mode(join(fixture.vault, "wiki", "courses", "epp")), 0o555);
    assert.equal(await readFile(join(fixture.vault, "wiki", "profile.md"), "utf8"), "# 我的资料\n\n- 手写未提交\n", "无关改动保留");
    const jj = (args) => execFileSync("jj", args, { cwd: fixture.vault, encoding: "utf8", env: { ...process.env, ...env } });
    assert.match(jj(["log", "--no-graph", "-T", "description.first_line()"]), /撤销收课 epp/);
    assert.match(jj(["st"]), /wiki\/profile\.md/);
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jj：两次收课改同一页 → 先撤最近一次成功；再撤前一次被拒（后一次已动过这些文件）", async () => {
  const fixture = await makeVault();
  try {
    const { env } = await initJj(fixture.vault, fixture.root);
    const before = await readFile(fixture.page, "utf8");
    const firstClose = withCloseRecord(coursePage());
    const a = await closeCourse(fixture, env, "epp", async (staging) => {
      await writeFile(join(staging, "wiki", "courses", "epp.md"), firstClose);
    });
    await chmod(fixture.page, 0o644);
    const secondClose = firstClose.replace("### 2026-11-09-02", "### 2026-11-09-03");
    await writeFile(fixture.page, secondClose);
    const b = await closeCourse(fixture, env, "epp", async (staging) => {
      await chmod(fixture.page, 0o644);
      await writeFile(join(staging, "wiki", "courses", "epp.md"), `${secondClose}- 第二轮收课。\n`);
    });
    assert.notEqual(a.id, b.id);

    // 第一次 undo 撤最近一次收课：回到第一轮收课后的内容
    const first = await cliJson(["undo", fixture.vault, "epp", "--workspace", fixture.ws], { env });
    assert.equal(first.undone, b.id);

    // 第二次 undo 想撤第一轮：但后一轮收课与刚才的撤销都改过同一页，按设计拒绝
    const failed = await cli(["undo", fixture.vault, "epp", "--workspace", fixture.ws], { expectFail: true, env });
    assert.match(failed.stderr, /这次收课之后 wiki\/courses\/epp\.md 又被改过/);
    assert.notEqual(await readFile(fixture.page, "utf8"), before, "拒绝时不把页面改回更早的状态");
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jj：另一门课收课改了共享的 index.md → undo 拒绝（会盖掉那次改动）", async () => {
  const fixture = await makeVault();
  try {
    const algo = join(fixture.vault, "wiki", "courses", "algo.md");
    await writeFile(algo, coursePage({ subject: "- [[subjects/algorithms|算法]]" }).replace("离散数学", "算法"));
    const { env } = await initJj(fixture.vault, fixture.root);
    const eppClose = await closeCourse(fixture, env, "epp", async (staging) => {
      await writeFile(join(staging, "wiki", "courses", "epp.md"), withCloseRecord(coursePage()));
      await writeFile(join(staging, "wiki", "index.md"), `${INDEX}- [[courses/algo|算法]]\n`);
    });
    // 另一门课也收课，也改了 index.md
    await closeCourse(fixture, env, "algo", async (staging) => {
      await writeFile(join(staging, "wiki", "index.md"), `${INDEX}- [[courses/algo|算法]]\n- [[courses/epp|离散]]\n`);
    });

    const failed = await cli(["undo", fixture.vault, "epp", "--workspace", fixture.ws], { expectFail: true, env });
    assert.match(failed.stderr, /wiki\/index\.md 又被改过，不能直接撤销/);
    assert.match(await readFile(join(fixture.vault, "wiki", "index.md"), "utf8"), /- \[\[courses\/epp\|离散\]\]/, "别的课的收课结果没被撤回");
    assert.ok(eppClose.id);
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jj：undo 保留那次新增的卡片页（不自动从 Anki 删卡）并只读地报路径", async () => {
  const fixture = await makeVault();
  try {
    const { env } = await initJj(fixture.vault, fixture.root);
    const cardRel = "wiki/knowledge/flashcards/discrete-math/card.md";
    const cardText = "TARGET DECK\n离散\n\nSTART\nBasic\nQ\nBack: A\nEND\n";
    await closeCourse(fixture, env, "epp", async (staging) => {
      await writeFile(join(staging, "wiki", "courses", "epp.md"), withCloseRecord(coursePage()));
      await mkdir(dirname(join(staging, cardRel)), { recursive: true });
      await writeFile(join(staging, cardRel), cardText);
    });
    const undone = await cliJson(["undo", fixture.vault, "epp", "--workspace", fixture.ws], { env });
    assert.deepEqual(undone.newCards, [cardRel]);
    assert.deepEqual(undone.keptNew, [cardRel]);
    assert.deepEqual(undone.restoreFiles, ["wiki/courses/epp.md"]);
    // 那次新建的卡片页留着不动，Anki 里的卡与库仍然对得上。
    assert.equal(existsSync(join(fixture.vault, cardRel)), true);
    assert.equal(await readFile(join(fixture.vault, cardRel), "utf8"), cardText, "新建的页内容不变");
    const plain = await cli(["undo", fixture.vault, "epp", "--workspace", fixture.ws], { expectFail: true, env });
    assert.match(plain.stderr, /不能直接撤销|没有找到这门课的收课提交/);
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jj：undo 恢复改过的文件，那次新建的概念页与卡片页保留并列出", async () => {
  const fixture = await makeVault();
  try {
    const { env } = await initJj(fixture.vault, fixture.root);
    const before = await readFile(fixture.page, "utf8");
    const conceptRel = "wiki/知识/concepts/x.md";
    const cardRel = "wiki/知识/flashcards/y.md";
    const conceptText = "---\ntitle: x\nsources:\n  - [[reading/epp|Epp]] §1.1\n---\n\n# x\n\n定义。\n";
    const cardText = "TARGET DECK\n离散\n\nSTART\nBasic\nQ\nBack: A\nEND\n";
    const { id } = await closeCourse(fixture, env, "epp", async (staging) => {
      await writeFile(join(staging, "wiki", "courses", "epp.md"), withCloseRecord(coursePage()));
      await mkdir(dirname(join(staging, conceptRel)), { recursive: true });
      await writeFile(join(staging, conceptRel), conceptText);
      await mkdir(dirname(join(staging, cardRel)), { recursive: true });
      await writeFile(join(staging, cardRel), cardText);
    });
    const jj = (args) => execFileSync("jj", args, { cwd: fixture.vault, encoding: "utf8", env: { ...process.env, ...env } });

    const undone = await cliJson(["undo", fixture.vault, "epp", "--workspace", fixture.ws], { env });
    assert.equal(undone.undone, id);
    assert.deepEqual(undone.restoreFiles, ["wiki/courses/epp.md"]);
    assert.deepEqual(undone.keptNew.sort(), [conceptRel, cardRel].sort());
    assert.deepEqual(undone.newCards, [cardRel]);
    assert.equal(await readFile(fixture.page, "utf8"), before, "课程页回到收课前");
    assert.equal(await readFile(join(fixture.vault, conceptRel), "utf8"), conceptText, "新建的概念页保留、内容不变");
    assert.equal(await readFile(join(fixture.vault, cardRel), "utf8"), cardText, "新建的卡片页保留、内容不变");

    const undoId = jj([
      "log",
      "-r",
      'description(glob:"撤销收课 epp *")',
      "--no-graph",
      "-T",
      "commit_id",
      "--limit",
      "1",
    ]).trim();
    assert.notEqual(undoId, "");
    const summary = jj(["diff", "-r", undoId, "--summary"])
      .trim()
      .split("\n")
      .map((line) => line.slice(1).trim())
      .sort();
    assert.deepEqual(summary, ["wiki/courses/epp.md"], "「撤销收课」提交里只有改过的文件");
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jj：收课只新建了文件 → undo 不报错，没有可恢复的文件就不提交「撤销收课」", async () => {
  const fixture = await makeVault();
  try {
    const { env } = await initJj(fixture.vault, fixture.root);
    const conceptRel = "wiki/知识/concepts/x.md";
    const cardRel = "wiki/知识/flashcards/y.md";
    const conceptText = "---\ntitle: x\nsources:\n  - [[reading/epp|Epp]] §1.1\n---\n\n# x\n\n定义。\n";
    const cardText = "TARGET DECK\n离散\n\nSTART\nBasic\nQ\nBack: A\nEND\n";
    const { id } = await closeCourse(fixture, env, "epp", async (staging) => {
      await mkdir(dirname(join(staging, conceptRel)), { recursive: true });
      await writeFile(join(staging, conceptRel), conceptText);
      await mkdir(dirname(join(staging, cardRel)), { recursive: true });
      await writeFile(join(staging, cardRel), cardText);
    });
    const jj = (args) => execFileSync("jj", args, { cwd: fixture.vault, encoding: "utf8", env: { ...process.env, ...env } });
    const before = await readFile(fixture.page, "utf8");

    const plain = await cli(["undo", fixture.vault, "epp", "--workspace", fixture.ws], { env });
    assert.ok(plain.stdout.includes(`已撤销收课提交 ${id}，恢复 0 个文件`), plain.stdout);
    assert.ok(plain.stdout.includes(`这次收课新建的页面（保留，可询问后删除）：${conceptRel}`), plain.stdout);
    assert.ok(plain.stdout.includes(`这次收课新建的页面（保留，可询问后删除）：${cardRel}`), plain.stdout);

    // 没有可恢复的文件，再跑一次也不会报错（什么都没变，可以重复跑）。
    const undone = await cliJson(["undo", fixture.vault, "epp", "--workspace", fixture.ws], { env });
    assert.equal(undone.undone, id);
    assert.deepEqual(undone.restoreFiles, []);
    assert.deepEqual(undone.keptNew.sort(), [conceptRel, cardRel].sort());
    assert.deepEqual(undone.newCards, [cardRel]);
    assert.equal(await readFile(fixture.page, "utf8"), before, "课程页没被动过");
    assert.equal(await readFile(join(fixture.vault, conceptRel), "utf8"), conceptText);
    assert.equal(await readFile(join(fixture.vault, cardRel), "utf8"), cardText);
    assert.doesNotMatch(jj(["log", "--no-graph", "-T", "description.first_line()"]), /撤销收课/, "没有新增撤销提交");
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jj：路径带空格与花括号时，提交只收这几个文件，undo 能把它们恢复回原样", async () => {
  const fixture = await makeVault();
  try {
    const { env } = await initJj(fixture.vault, fixture.root);
    const rel = "wiki/知识/concepts/离散 数学/真值 表 {v1}.md";
    const before = "---\nsources: [[reading/epp|Epp]] §1.1\n---\n\n# 真值表\n\n旧的。\n";
    await mkdir(dirname(join(fixture.vault, rel)), { recursive: true });
    await writeFile(join(fixture.vault, rel), before);
    const jj = (args) => execFileSync("jj", args, { cwd: fixture.vault, encoding: "utf8", env: { ...process.env, ...env } });
    jj(["commit", "-m", "基线加概念页"]);

    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws], { env });
    await cliJson(["add", staging, rel], { env });
    await writeFile(join(staging, "wiki", "courses", "epp.md"), withCloseRecord(coursePage()));
    await writeFile(join(staging, rel), before.replace("旧的。", "新的。"));
    const result = await cliJson(["commit", staging], { env });
    const id = jj([
      "log",
      "-r",
      'description(glob:"收课 epp *")',
      "--no-graph",
      "-T",
      "commit_id",
      "--limit",
      "1",
    ]).trim();
    assert.equal(result.jj, "ok", result.jj);
    // 提交里只有这两个文件（不能被当成模式误匹配或被当成路径不存在而漏掉）
    const inCommit = jj(["diff", "-r", id, "-T", 'json(target.path()) ++ "\\n"'])
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .sort();
    assert.deepEqual(inCommit, ["wiki/courses/epp.md", rel].sort());

    const undone = await cliJson(["undo", fixture.vault, "epp", "--workspace", fixture.ws], { env });
    assert.equal(undone.undone, id);
    assert.equal(await readFile(join(fixture.vault, rel), "utf8"), before, "带空格花括号的页也恢复");
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jj：slug 前缀相同的另一门课（epp-advanced）的收课不被当成自己的最近一次", async () => {
  const fixture = await makeVault();
  try {
    const advanced = join(fixture.vault, "wiki", "courses", "epp-advanced.md");
    await writeFile(advanced, coursePage({ subject: "- [[subjects/discrete-math|离散]]" }).replace("离散数学（Epp）", "离散数学（进阶）"));
    const { env } = await initJj(fixture.vault, fixture.root);
    const eppBefore = await readFile(fixture.page, "utf8");
    const advancedBefore = await readFile(advanced, "utf8");
    const epp = await closeCourse(fixture, env, "epp", async (staging) => {
      await writeFile(join(staging, "wiki", "courses", "epp.md"), withCloseRecord(coursePage()));
    });
    await closeCourse(fixture, env, "epp-advanced", async (staging) => {
      await writeFile(join(staging, "wiki", "courses", "epp-advanced.md"), `${advancedBefore}\n- 进阶课收课。\n`);
    });

    // 撤销 epp 不能去撤 epp-advanced 的提交
    const undone = await cliJson(["undo", fixture.vault, "epp", "--workspace", fixture.ws], { env });
    assert.equal(undone.undone, epp.id);
    assert.deepEqual(undone.restoreFiles, ["wiki/courses/epp.md"]);
    assert.equal(await readFile(fixture.page, "utf8"), eppBefore, "epp 回到收课前");
    assert.match(await readFile(advanced, "utf8"), /进阶课收课/, "epp-advanced 的收课没被撤");
    assert.ok(advancedBefore.length > 0);
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jj：undo 在非 jj 库里直接拒绝", async () => {
  const fixture = await makeVault();
  try {
    const failed = await cli(["undo", fixture.vault, "epp", "--workspace", fixture.ws], { expectFail: true });
    assert.match(failed.stderr, /撤销需要库在 jj 下/);
  } finally {
    await cleanup(fixture);
  }
});

// ══ commit --label：存档点不叫「收课」，undo 也就撤不到它 ══

/** 把课程页 Next Session 改成 §1.3（存档点的典型改动）。 */
const checkpoint = (text) => text.replace("[[reading/epp|Epp]] §1.2。", "[[reading/epp|Epp]] §1.3。");

jjTest("jj：commit --label 存档点 → jj 记「存档点 <slug> <今天>」，之后 undo 说没有收课提交", async () => {
  const fixture = await makeVault();
  try {
    const { env, jj } = await initJj(fixture.vault, fixture.root);
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws], { env });
    const text = checkpoint(await readFile(fixture.page, "utf8"));
    await writeFile(join(staging, "wiki", "courses", "epp.md"), text);
    const result = await cliJson(["commit", staging, "--label", "存档点"], { env });
    assert.equal(result.jj, "ok");
    assert.equal(descriptionOf(jj), `存档点 epp ${localDate()}`, "jj 记的是存档点，不是收课");
    assert.equal(await readFile(fixture.page, "utf8"), text, "存档点写进库了");

    // 只有存档点时，undo 找不到这门课的「收课」提交，什么都不撤。
    const failed = await cli(["undo", fixture.vault, "epp", "--workspace", fixture.ws], { expectFail: true, env });
    assert.match(failed.stderr, /没有找到这门课的收课提交/);
    assert.equal(await readFile(fixture.page, "utf8"), text, "undo 没动课程页");
    assert.doesNotMatch(jj(["log", "--no-graph", "-T", "description.first_line()"]), /撤销收课/);
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jj：收课 → 存档点改了课程页 → undo 被拒（之后又被改过），库和 jj 都不动", async () => {
  const fixture = await makeVault();
  try {
    const { env, jj } = await initJj(fixture.vault, fixture.root);
    const closed = withCloseRecord(coursePage());
    const { id } = await closeCourse(fixture, env, "epp", async (staging) => {
      await writeFile(join(staging, "wiki", "courses", "epp.md"), closed);
    });
    assert.equal(descriptionOf(jj), `收课 epp ${localDate()}`, "不给 --label 仍是收课");

    // 长会话中途：stage → 改 Next Session → commit --label 存档点
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws], { env });
    const text = checkpoint(closed);
    await writeFile(join(staging, "wiki", "courses", "epp.md"), text);
    const saved = await cliJson(["commit", staging, "--label", "存档点"], { env });
    assert.equal(saved.committed, true);
    assert.equal(descriptionOf(jj), `存档点 epp ${localDate()}`);
    const logBefore = jj(["log", "--no-graph", "-T", "commit_id"]);

    // undo 认的是那次收课，但存档点之后又改过课程页：拒绝，什么都不动。
    const failed = await cli(["undo", fixture.vault, "epp", "--workspace", fixture.ws], { expectFail: true, env });
    assert.match(failed.stderr, /这次收课之后 wiki\/courses\/epp\.md 又被改过，不能直接撤销/);
    assert.ok(id);
    assert.equal(await readFile(fixture.page, "utf8"), text, "存档点写的内容没被盖掉");
    assert.equal(jj(["log", "--no-graph", "-T", "commit_id"]), logBefore, "jj 没多出撤销提交");
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jj：commit --label 别的 → 非 0、中文报错，库、jj、暂存都不动", async () => {
  const fixture = await makeVault();
  try {
    const { env, jj } = await initJj(fixture.vault, fixture.root);
    const before = await readFile(fixture.page, "utf8");
    const logBefore = jj(["log", "--no-graph", "-T", "commit_id"]);
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws], { env });
    await writeFile(join(staging, "wiki", "courses", "epp.md"), withCloseRecord(coursePage()));

    const failed = await cli(["commit", staging, "--label", "收工"], { expectFail: true, env });
    assert.notEqual(failed.code, 0);
    assert.match(failed.stderr, /--label 只能是 收课 或 存档点/);
    assert.equal(await readFile(fixture.page, "utf8"), before, "库不动");
    assert.equal(jj(["log", "--no-graph", "-T", "commit_id"]), logBefore, "jj 不多提交");
    assert.equal(existsSync(join(staging, "committed")), false, "暂存仍未提交");
    assert.equal(existsSync(join(staging, "manifest.json")), true, "暂存目录还在");
  } finally {
    await cleanup(fixture);
  }
});

// ══ shift：顺延走暂存 → 校验 → 提交（jj 记「顺延」） ══

/** CLI 用的本机今天（与 course-close.mjs 的 localDate 同一算法）。 */
function localDate() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 排期：D1 在 2026-11-10 之前且没学，末节挨着结束日。 */
const SHIFT_ROWS = [
  { id: "D1", date: "2026-11-04", content: "第 1 课" },
  { id: "D2", date: "2026-11-09", content: "第 2 课" },
  { id: "D3", date: "2026-11-11", content: "第 3 课" },
  { id: "D4", date: "2026-11-16", content: "第 4 课" },
  { id: "D5", date: "2026-11-18", content: "第 5 课" },
];

/**
 * 可顺延的课程页：排期标记 `rest=sun days=mon,wed reviews=anki`（end 可选），
 * 计划表里有「### 留到下个周期」一节，且只有一行占位「- 无：…」。
 */
function shiftPage({ rows = SHIFT_ROWS, end = null, defer = "- 无：本周期还没挤出课次" } = {}) {
  return [
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
    "## Today",
    "",
    "日期：2026-11-10",
    "",
    "- [ ] 讲 §1.1",
    "",
    "## Next Session",
    "",
    "[[reading/epp|Epp]] §1.2。",
    "",
    "## 计划表（参考）",
    "",
    "### 留到下个周期",
    "",
    defer,
    "",
    `<!-- xuegen:schedule:start rest=sun days=mon,wed reviews=anki${end === null ? "" : ` end=${end}`} -->`,
    "| 天 | 日期 | 内容 | 材料 | 完成条件 |",
    "|---|---|---|---|---|",
    ...rows.map((row) => `| ${row.id} | ${row.date} | ${row.content} | — | — |`),
    "<!-- xuegen:schedule:end -->",
    "",
    "## Learning Record",
    "",
    "## Relationships",
    "",
    "- [[subjects/discrete-math|离散数学]]",
    "",
  ].join("\n");
}

/** 用 shiftPage 覆盖课程页（仍保持 0444）。 */
async function makeShiftVault(options) {
  const fixture = await makeVault();
  await chmod(fixture.page, 0o644);
  await writeFile(fixture.page, shiftPage(options));
  await chmod(fixture.page, 0o444);
  return fixture;
}

/** 某次提交的描述（jj 存的是 commit message，末尾带一个换行，比较前去掉）。 */
function descriptionOf(jj, revset = "@-") {
  return JSON.parse(jj(["log", "-r", revset, "--no-graph", "-T", "json(description)"]).trim()).trim();
}

/** `<ws>/.close/` 下的条目（不存在时为空数组）。 */
async function closeEntries(ws) {
  return existsSync(join(ws, ".close")) ? (await readdir(join(ws, ".close"))).sort() : [];
}

jjTest("jj：shift 有变化 → 提交描述「顺延 <slug> <今天>」，只含课程页，课程页 0444，暂存带 committed", async () => {
  const fixture = await makeShiftVault();
  try {
    const { env, jj } = await initJj(fixture.vault, fixture.root);
    const before = await readFile(fixture.page, "utf8");
    const result = await cliJson(
      ["shift", fixture.vault, "epp", "--workspace", fixture.ws, "--today", "2026-11-10"],
      { env },
    );
    assert.equal(result.committed, true);
    assert.equal(result.jj, "ok");
    assert.equal(result.shiftedDays, 2, "D1 从 11-04 顺延到 11-11（周一/周三两个上课日）");
    assert.deepEqual(result.dropped, [], "标记里没有 end=，不挤出课次");

    // 最近一次提交（工作副本的父提交）就是这次的顺延，且只含课程页。
    assert.equal(descriptionOf(jj), `顺延 epp ${localDate()}`);
    const summary = jj(["diff", "-r", "@-", "--summary"])
      .trim()
      .split("\n")
      .map((line) => line.slice(1).trim())
      .sort();
    assert.deepEqual(summary, ["wiki/courses/epp.md"], "顺延提交里只有课程页");

    // 课程页 0444，内容确实顺延了。
    assert.equal(await mode(fixture.page), 0o444);
    const after = await readFile(fixture.page, "utf8");
    assert.notEqual(after, before);
    assert.match(after, /\| D1 \| 2026-11-11（周三） \|/, "D1 顺延到 2026-11-11");

    // 本次暂存留在 <ws>/.close/，且带 committed 标记。
    const entries = await closeEntries(fixture.ws);
    assert.equal(entries.length, 1, `暂存目录应只有一个：${entries.join("、")}`);
    assert.ok(existsSync(join(fixture.ws, ".close", entries[0], "committed")), "暂存带 committed");
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jj：shift 有结束日、末节被挤出 → dropped 列出该课次，「留到下个周期」的「- 无：」被替换", async () => {
  const fixture = await makeShiftVault({ end: "2026-11-23" });
  try {
    const { env } = await initJj(fixture.vault, fixture.root);
    const result = await cliJson(["shift", fixture.vault, "epp", "--workspace", fixture.ws, "--today", "2026-11-10"], {
      env,
    });
    assert.equal(result.committed, true);
    assert.equal(result.end, "2026-11-23", "没给 --end 时用排期标记里的 end=");
    assert.deepEqual(result.dropped.map((row) => row.id), ["D5"], "只有末节 D5 越过结束日");
    assert.equal(result.lastLesson, "2026-11-23");
    assert.equal(result.deferred, "1 节排不进本周期，已移到「留到下个周期」：D5");

    const page = await readFile(fixture.page, "utf8");
    const deferredSection = page.slice(page.indexOf("### 留到下个周期"), page.indexOf("<!-- xuegen:schedule:start"));
    assert.doesNotMatch(deferredSection, /-\s*无\s*[：:]/, "占位行被替换掉");
    assert.match(deferredSection, /- D5：第 5 课（—）/, "挤出的课次登记在「留到下个周期」");
    assert.match(page, /\| D4 \| 2026-11-23（周一） \|/, "末节之前的课次仍留在表里");
    assert.doesNotMatch(page, /\| D5 \|/, "挤出的课次不再出现在排期表里");
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jj：shift 没有要顺延的 → {shifted:false}、退出 0、无新提交、.close 无残留", async () => {
  // 所有课次都在今天之后：没有过期的新课，也没有过期复习。
  const rows = [
    { id: "D1", date: "2026-11-16", content: "第 1 课" },
    { id: "D2", date: "2026-11-18", content: "第 2 课" },
  ];
  const fixture = await makeShiftVault({ rows });
  try {
    const { env, jj } = await initJj(fixture.vault, fixture.root);
    const before = await readFile(fixture.page, "utf8");
    const result = await cliJson(["shift", fixture.vault, "epp", "--workspace", fixture.ws, "--today", "2026-11-10"], {
      env,
    });
    assert.deepEqual(result, { shifted: false });
    assert.equal(await readFile(fixture.page, "utf8"), before, "课程页没动");
    assert.deepEqual(await closeEntries(fixture.ws), [], "没有残留暂存目录");
    assert.equal(descriptionOf(jj), "基线", "jj 没有新提交");
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jj：课程页没有排期标记 → 文本「这门课没有排期表，不用顺延」、无残留、无提交", async () => {
  const fixture = await makeShiftVault();
  try {
    // 去掉排期标记整段（标记外的计划表段照旧留着），也去掉「完成：」记录。
    await chmod(fixture.page, 0o644);
    const page = shiftPage()
      .replace(/<!-- xuegen:schedule:start[\s\S]*?<!-- xuegen:schedule:end -->\n/, "")
      .replace("| 天 | 日期 | 内容 | 材料 | 完成条件 |\n|---|---|---|---|---|\n", "");
    await writeFile(fixture.page, page);
    await chmod(fixture.page, 0o444);
    const { env, jj } = await initJj(fixture.vault, fixture.root);
    const before = await readFile(fixture.page, "utf8");
    const { stdout } = await cli(["shift", fixture.vault, "epp", "--workspace", fixture.ws, "--today", "2026-11-10"], {
      env,
    });
    assert.match(stdout, /这门课没有排期表，不用顺延/);
    assert.equal(await readFile(fixture.page, "utf8"), before, "课程页没动");
    assert.deepEqual(await closeEntries(fixture.ws), [], "没有残留暂存目录");
    assert.equal(descriptionOf(jj), "基线", "jj 没有新提交");
  } finally {
    await cleanup(fixture);
  }
});

test("shift：--today / --end 不是 YYYY-MM-DD → 非 0 退出、中文报错、不建暂存", async () => {
  const fixture = await makeShiftVault();
  try {
    const badToday = await cli(
      ["shift", fixture.vault, "epp", "--workspace", fixture.ws, "--today", "11/10", "--end", "2026/12/24"],
      { expectFail: true },
    );
    assert.notEqual(badToday.code, 0);
    assert.match(badToday.stderr, /--today 要写成 YYYY-MM-DD/);
    assert.equal(existsSync(join(fixture.ws, ".close")), false, "参数不合格时不建暂存目录");

    const badEnd = await cli(
      ["shift", fixture.vault, "epp", "--workspace", fixture.ws, "--today", "2026-11-10", "--end", "2026/12/24"],
      { expectFail: true },
    );
    assert.notEqual(badEnd.code, 0);
    assert.match(badEnd.stderr, /--end 要写成 YYYY-MM-DD/);
    assert.equal(existsSync(join(fixture.ws, ".close")), false, "参数不合格时不建暂存目录");
  } finally {
    await cleanup(fixture);
  }
});

test("shift：已有本课未提交暂存 → 被拒（与 stage 一致），原暂存不动", async () => {
  const fixture = await makeShiftVault();
  try {
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    const staged = await readdir(staging);
    const manifestBefore = await readFile(join(staging, "manifest.json"), "utf8");
    const failed = await cli(
      ["shift", fixture.vault, "epp", "--workspace", fixture.ws, "--today", "2026-11-10"],
      { expectFail: true },
    );
    assert.match(failed.stderr, /这门课已有未提交的暂存/);
    assert.deepEqual(await readdir(staging), staged, "原暂存目录内容不变");
    assert.equal(await readFile(join(staging, "manifest.json"), "utf8"), manifestBefore, "manifest 没被重写");
    assert.equal(existsSync(join(staging, "committed")), false, "仍算未提交暂存");
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jj：shift 之后立刻 stage 同课能成功；收课再 undo 只撤「收课」，顺延提交还在", async () => {
  const fixture = await makeShiftVault();
  try {
    const { env, jj } = await initJj(fixture.vault, fixture.root);
    const shifted = await cliJson(["shift", fixture.vault, "epp", "--workspace", fixture.ws, "--today", "2026-11-10"], {
      env,
    });
    assert.equal(shifted.committed, true);
    const shiftedPage = await readFile(fixture.page, "utf8");
    const shiftId = jj(["log", "-r", 'description(glob:"顺延 epp *")', "--no-graph", "-T", "commit_id", "--limit", "1"]).trim();
    assert.notEqual(shiftId, "");

    // 顺延没留下未提交暂存：当天收课可以正常 stage。
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws], { env });
    await writeFile(join(staging, "wiki", "courses", "epp.md"), withCloseRecord(shiftedPage));
    await writeFile(join(staging, "wiki", "log.md"), `${LOG}- 收课：epp D1\n`);
    const closed = await cliJson(["commit", staging], { env });
    assert.equal(closed.committed, true);
    const closeId = jj(["log", "-r", 'description(glob:"收课 epp *")', "--no-graph", "-T", "commit_id", "--limit", "1"]).trim();
    assert.notEqual(closeId, "");
    assert.notEqual(closeId, shiftId);

    const undone = await cliJson(["undo", fixture.vault, "epp", "--workspace", fixture.ws], { env });
    assert.equal(undone.undone, closeId, "undo 撤的是「收课」提交，不是顺延");
    assert.equal(await readFile(fixture.page, "utf8"), shiftedPage, "课程页回到顺延后、收课前的样子");
    const descriptions = jj(["log", "--no-graph", "-T", 'json(description.first_line()) ++ "\\n"'])
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(descriptions.includes(`顺延 epp ${localDate()}`), "顺延提交还在");
    assert.ok(descriptions.some((text) => text === `撤销收课 epp ${localDate()}`), "多了一条撤销收课");
  } finally {
    await cleanup(fixture);
  }
});

test("shift：排期标记损坏（缺 end 标记）→ 中文报错、不留未提交暂存", async () => {
  const fixture = await makeShiftVault();
  try {
    await chmod(fixture.page, 0o644);
    await writeFile(fixture.page, shiftPage().replace("<!-- xuegen:schedule:end -->\n", ""));
    await chmod(fixture.page, 0o444);
    const failed = await cli(["shift", fixture.vault, "epp", "--workspace", fixture.ws, "--today", "2026-11-10"], {
      expectFail: true,
    });
    assert.match(failed.stderr, /排期标记不完整/);
    assert.deepEqual(await closeEntries(fixture.ws), [], "顺延中断也不留未提交暂存（否则挡住当天 stage）");
    // 残留暂存会挡住 stage：这里必须能正常开暂存。
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    assert.ok(staging.length > 0);
  } finally {
    await cleanup(fixture);
  }
});

jjTest("jj：commitInternal 抽出后提交信息仍是「收课 <slug> <日期>」", async () => {
  const fixture = await makeVault();
  try {
    const { env, jj } = await initJj(fixture.vault, fixture.root);
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws], { env });
    await writeFile(join(staging, "wiki", "courses", "epp.md"), withCloseRecord(coursePage()));
    await cliJson(["commit", staging], { env });
    assert.equal(descriptionOf(jj), `收课 epp ${localDate()}`);
  } finally {
    await cleanup(fixture);
  }
});

test("上锁只限本课：别的课与 wiki/courses 本身不动，records 里旧文件也上锁", async () => {
  const fixture = await makeVault();
  try {
    const otherPage = join(fixture.vault, "wiki", "courses", "algo.md");
    await writeFile(otherPage, coursePage({ subject: "- [[subjects/algorithms|算法]]" }));
    const oldRecord = join(fixture.vault, "wiki", "courses", "epp", "records", "2026-10.md");
    await writeFile(oldRecord, "## 旧记录\n");
    const { staging } = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    await writeFile(join(staging, "wiki", "log.md"), `${LOG}- 收课\n`);
    await cliJson(["commit", staging]);
    assert.equal(await mode(oldRecord), 0o444, "records 里没动的旧文件也上锁");
    assert.equal(await mode(otherPage), 0o644, "别的课不动");
    assert.equal(await mode(join(fixture.vault, "wiki", "courses")), 0o755, "wiki/courses 本身保持原 mode");
    assert.equal(await mode(join(fixture.vault, "wiki", "courses", "algo.md")), 0o644);
  } finally {
    await cleanup(fixture);
  }
});

test("上锁后再次收课：新建 records 目录时临时放开 wiki/courses，结束后恢复原 mode", async () => {
  const fixture = await makeVault();
  try {
    // 先收一次课，让 wiki/courses 与课程目录带上锁
    const first = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    await writeFile(join(first.staging, "wiki", "log.md"), `${LOG}- 第一次收课\n`);
    await cliJson(["commit", first.staging]);
    assert.equal(await mode(join(fixture.vault, "wiki", "courses", "epp")), 0o555);
    // 人为把 wiki/courses 收紧成 0555（模拟更严的库），再新建一个当月 records 页
    await chmod(join(fixture.vault, "wiki", "courses"), 0o555);

    const second = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    const recordRel = `wiki/courses/epp/records/${new Date().toISOString().slice(0, 7)}.md`;
    await mkdir(dirname(join(second.staging, recordRel)), { recursive: true });
    await writeFile(join(second.staging, recordRel), "## 记录\n");
    const result = await cliJson(["commit", second.staging]);
    assert.equal(result.committed, true);
    assert.equal(await mode(join(fixture.vault, "wiki", "courses")), 0o555, "wiki/courses 恢复原 mode");
    assert.equal(await mode(join(fixture.vault, recordRel)), 0o444, "新记录上锁");
  } finally {
    await cleanup(fixture);
  }
});

test("slug 前缀相同的别门课暂存不阻止 stage", async () => {
  const fixture = await makeVault();
  try {
    await writeFile(
      join(fixture.vault, "wiki", "courses", "epp-advanced.md"),
      coursePage({ subject: "- [[subjects/discrete-math|离散]]" }),
    );
    const first = await cliJson(["stage", fixture.vault, "epp", "--workspace", fixture.ws]);
    const second = await cliJson(["stage", fixture.vault, "epp-advanced", "--workspace", fixture.ws]);
    assert.notEqual(first.staging, second.staging);
    // 同一门课第二次仍然拒绝
    const dup = await cli(["stage", fixture.vault, "epp", "--workspace", fixture.ws], { expectFail: true });
    assert.match(dup.stderr, /这门课已有未提交的暂存/);
  } finally {
    await cleanup(fixture);
  }
});

test("提交日志损坏时 recover 报中文原因，不静默丢文件", async () => {
  const fixture = await makeVault();
  try {
    await mkdir(join(fixture.ws, ".close"), { recursive: true });
    await writeFile(join(fixture.ws, ".close", "journal.json"), "{ 这不是 json");
    const failed = await cli(["recover", fixture.vault, "--workspace", fixture.ws], { expectFail: true });
    assert.match(failed.stderr, /提交日志损坏/);
    assert.ok(existsSync(join(fixture.ws, ".close", "journal.json")));
  } finally {
    await cleanup(fixture);
  }
});

test("course-close --help 打印用法并以 0 退出", async () => {
  const { stdout } = await cli(["--help"]);
  assert.match(stdout, /stage/);
  assert.match(stdout, /commit/);
  assert.match(stdout, /undo/);
});
