#!/usr/bin/env node
// course-stop.mjs 的测试：停用/恢复走计划暂存事务机的端到端验证。
// 全部在 os.tmpdir() 下建临时库与临时工作区，绝不触碰真实库、真实工作区或 ~/.xuegen。
// jj 用例在临时目录里 `jj git init` 建真仓库；本机没有 jj 时这些用例 skip 并说明。
import { test, skip } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "course-stop.mjs");
const CYCLE = join(HERE, "..", "cycle-plan", "cycle.mjs");

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
  "| D3 | 2026-11-11（周三） | 第 3 课 | — | — |",
  "<!-- xuegen:schedule:end -->",
].join("\n");

const INDEX = "# 索引\n\n## Courses\n\n- [[courses/epp|离散数学]]\n";
const LOG = "# 学习日志\n\n## 2026-11-08\n\n- 读了 §1.1\n";
const SUBJECT = "# 离散数学\n\n## Courses\n\n- [[courses/epp|离散]]\n";
const CYCLE_PAGE = [
  "---",
  "cycle: C1",
  "start: 2026-11-02",
  "end: 2026-12-20",
  "---",
  "",
  "# C1 · 测试周期",
  "",
  "## Weekly Template",
  "",
  "| 星期 | 类型 | 课程 |",
  "|---|---|---|",
  "| 周一 | 深度 | [[subjects/demo\\|离散]] |",
  "| 周二 | 深度 | [[subjects/demo\\|离散]] |",
  "| 周三 | 深度 | [[subjects/demo\\|离散]] |",
  "| 周四 | 深度 | [[subjects/demo\\|离散]] |",
  "| 周五 | 整合 | — |",
  "| 周六 | 低强度 | — |",
  "| 周日 | 休息 | — |",
  "",
].join("\n");

/** 一份带排期的合法课程页（D1 已完成，D2/D3 还没上）。 */
function coursePage() {
  return [
    "<!-- xuegen:course-state -->",
    "",
    "# 离散数学学习计划",
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
    "",
    "## Relationships",
    "",
    "- [[subjects/demo|离散数学]]",
    "",
  ].join("\n");
}

/** 临时根目录：{root, vault, ws}，库里有课程页、index.md、log.md、科目页与周期页。 */
async function makeVault({ withCycle = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "course-stop-"));
  const vault = join(root, "vault");
  const ws = join(root, "ws");
  await mkdir(join(vault, "wiki", "courses"), { recursive: true });
  await mkdir(join(vault, "wiki", "subjects"), { recursive: true });
  await mkdir(ws, { recursive: true });
  const page = join(vault, "wiki", "courses", "epp.md");
  await writeFile(page, coursePage());
  await chmod(page, 0o444);
  await writeFile(join(vault, "wiki", "index.md"), INDEX);
  await writeFile(join(vault, "wiki", "log.md"), LOG);
  await writeFile(join(vault, "wiki", "subjects", "demo.md"), SUBJECT);
  if (withCycle) {
    await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
    await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE_PAGE);
  }
  return { root, vault, ws, page };
}

async function cleanup(fixture) {
  try {
    execFileSync("chmod", ["-R", "u+rwX", fixture.root]);
  } catch {
    /* 已经没了 */
  }
  await rm(fixture.root, { recursive: true, force: true });
}

/** 在临时库里建 jj 仓库并把当前文件提交成基线（同 course-close.test.mjs 的写法）。 */
async function initJj(vault, root) {
  const config = join(root, "jj-config.toml");
  await writeFile(config, 'user.name = "停用测试"\nuser.email = "test@example.com"\n');
  const env = { JJ_CONFIG: config };
  const jj = (args) => execFileSync("jj", args, { cwd: vault, encoding: "utf8", env: { ...process.env, ...env } });
  jj(["git", "init"]);
  jj(["commit", "-m", "基线"]);
  return { env, jj };
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

/** 跑 cycle.mjs day --json（另一个技能的脚本，只读）。 */
async function cycleDay(vault, date) {
  const { stdout } = await run(process.execPath, [CYCLE, "day", vault, "--date", date, "--json"], { encoding: "utf8" });
  return JSON.parse(stdout);
}

const mode = async (path) => (await stat(path)).mode & 0o777;

function localDate() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 课程页 ## Key Facts 一节里有没有「- 状态：停用」行。 */
function hasStopLine(text) {
  return /^-\s*状态：停用（\d{4}-\d{2}-\d{2}/m.test(text);
}

// ══ 停用 ══

jjTest("jj：stop 写停用行、课程页仍 444、jj 记「停用 epp <日期>」；重复 stop 报错且库不变", async () => {
  const fixture = await makeVault();
  try {
    const { env, jj } = await initJj(fixture.vault, fixture.root);
    const today = localDate();
    const out = await cliJson(["stop", fixture.vault, "epp", "--workspace", fixture.ws, "--reason", "改成书房导读"], { env });
    assert.deepEqual(out, { slug: "epp", action: "stop", date: today, jj: "ok", firstLesson: null });

    const text = await readFile(fixture.page, "utf8");
    assert.ok(hasStopLine(text), "课程页应有停用行");
    assert.match(text, /- 状态：停用（\d{4}-\d{2}-\d{2}，改成书房导读）/);
    assert.equal(await mode(fixture.page), 0o444, "课程页应重新上锁 0444");
    assert.equal(jj(["log", "-r", "@-", "--no-graph", "-T", "description.first_line()"]), `停用 epp ${today}`);

    // 重复停用：报错退出、课程页与 jj 都不变。
    const before = await readFile(fixture.page, "utf8");
    const failed = await cli(["stop", fixture.vault, "epp", "--workspace", fixture.ws], { expectFail: true, env });
    assert.equal(failed.code, 1);
    assert.match(failed.stderr, /这门课已经停用了/);
    assert.equal(await readFile(fixture.page, "utf8"), before, "课程页不动");
    assert.equal(jj(["log", "-r", "@-", "--no-graph", "-T", "description.first_line()"]), `停用 epp ${today}`);
  } finally {
    await cleanup(fixture);
  }
});

test("stop：不带 jj 也能停用（jj 字段是 skipped），停用行进 Key Facts", async () => {
  const fixture = await makeVault();
  try {
    const out = await cliJson(["stop", fixture.vault, "epp", "--workspace", fixture.ws]);
    assert.equal(out.jj, "skipped");
    assert.equal(out.action, "stop");
    const text = await readFile(fixture.page, "utf8");
    assert.ok(hasStopLine(text));
    assert.match(text, /- 状态：停用（\d{4}-\d{2}-\d{2}，用户在总进度里停用）/, "默认原因");
  } finally {
    await cleanup(fixture);
  }
});

test("stop：课程页没有 ## Key Facts 时报原错、清掉暂存；再 stop 还是同一个错", async () => {
  const fixture = await makeVault();
  try {
    const noFacts = coursePage().replace(/## Key Facts\n[\s\S]*?(?=## This Week)/, "");
    await chmod(fixture.page, 0o644);
    await writeFile(fixture.page, noFacts);
    await chmod(fixture.page, 0o444);
    const args = ["stop", fixture.vault, "epp", "--workspace", fixture.ws];

    const first = await cli(args, { expectFail: true });
    assert.equal(first.code, 1);
    assert.match(first.stderr, /没有 ## Key Facts/);
    // 失败不能留未提交暂存：.close/ 下没有这门课的 epp-* 目录。
    const closeDir = join(fixture.ws, ".close");
    const names = existsSync(closeDir) ? readdirSync(closeDir) : [];
    assert.deepEqual(
      names.filter((name) => name.startsWith("epp-")),
      [],
      `暂存应被清掉：${names.join("、")}`,
    );

    // 再 stop：报同一个原因，不是「已有未提交的暂存」。
    const second = await cli(args, { expectFail: true });
    assert.equal(second.code, 1);
    assert.match(second.stderr, /没有 ## Key Facts/);
    assert.doesNotMatch(second.stderr, /未提交的暂存/);
  } finally {
    await cleanup(fixture);
  }
});

test("stop：值参数后面跟 -- 开头的东西报「缺少值」，不把它当值吞掉", async () => {
  const fixture = await makeVault();
  try {
    const missing = await cli(["stop", fixture.vault, "epp", "--workspace", "--json"], { expectFail: true });
    assert.equal(missing.code, 1);
    assert.match(missing.stderr, /--workspace 缺少值/);
    // 值参数在最后、后面什么都没有同样报缺少值。
    const atEnd = await cli(["stop", fixture.vault, "epp", "--reason"], { expectFail: true });
    assert.match(atEnd.stderr, /--reason 缺少值/);
  } finally {
    await cleanup(fixture);
  }
});

test("stop：--reason 空串按没给处理，停用行写默认原因", async () => {
  const fixture = await makeVault();
  try {
    await cli(["stop", fixture.vault, "epp", "--workspace", fixture.ws, "--reason", ""]);
    const text = await readFile(fixture.page, "utf8");
    assert.match(text, /- 状态：停用（\d{4}-\d{2}-\d{2}，用户在总进度里停用）/);
  } finally {
    await cleanup(fixture);
  }
});

// ══ 恢复 ══

jjTest("jj：resume 去掉停用行、jj 记「恢复 epp <日期>」、没上的课次顺延到 today 起", async () => {
  const fixture = await makeVault();
  try {
    const { env, jj } = await initJj(fixture.vault, fixture.root);
    const today = "2026-11-16";
    await cliJson(["stop", fixture.vault, "epp", "--workspace", fixture.ws], { env });
    const out = await cliJson(["resume", fixture.vault, "epp", "--workspace", fixture.ws, "--today", today], { env });
    assert.equal(out.action, "resume");
    assert.equal(out.date, today);
    assert.equal(out.jj, "ok");

    const text = await readFile(fixture.page, "utf8");
    assert.ok(!hasStopLine(text), "停用行应被删掉");
    assert.equal(await mode(fixture.page), 0o444, "课程页重新上锁 0444");
    assert.equal(jj(["log", "-r", "@-", "--no-graph", "-T", "description.first_line()"]), `恢复 epp ${localDate()}`);

    // 顺延：过去没上的课次（D2、D3）都挪到 today 起；已完成的 D1 不动。
    assert.ok(out.firstLesson !== null && out.firstLesson >= today, `第一节没上的课次应在 ${today} 或之后：${out.firstLesson}`);
    const rows = [...text.matchAll(/^\| (D\d+) \| (\d{4}-\d{2}-\d{2})/gm)].map((m) => ({ id: m[1], date: m[2] }));
    const d1 = rows.find((row) => row.id === "D1");
    assert.equal(d1.date, "2026-11-09", "已完成的 D1 日期不动");
    for (const row of rows.filter((item) => item.id !== "D1")) {
      assert.ok(row.date >= today, `${row.id} 应在 ${today} 或之后：${row.date}`);
    }

    // 没停用的课不能恢复。
    const active = await makeVault();
    try {
      const failed = await cli(["resume", active.vault, "epp", "--workspace", active.ws], { expectFail: true, env });
      assert.match(failed.stderr, /这门课没有停用/);
      assert.ok(existsSync(active.page));
    } finally {
      await cleanup(active);
    }
  } finally {
    await cleanup(fixture);
  }
});

// ══ 周期联动 ══

test("cycle.mjs day --json 对停用课不再列课次；恢复后回到当天课表", async () => {
  const fixture = await makeVault({ withCycle: true });
  try {
    // D2 排在 2026-11-10（周二，深度日）：停用前列在 lessons 里。
    const before = await cycleDay(fixture.vault, "2026-11-10");
    assert.ok(
      before.lessons.some((lesson) => lesson.course === "epp" && lesson.id === "D2"),
      `停用前 lessons 里应有 epp D2：${JSON.stringify(before.lessons)}`,
    );

    await cliJson(["stop", fixture.vault, "epp", "--workspace", fixture.ws]);
    const stopped = await cycleDay(fixture.vault, "2026-11-10");
    assert.ok(
      !stopped.lessons.some((lesson) => lesson.course === "epp"),
      `停用后 lessons 里不应有 epp：${JSON.stringify(stopped.lessons)}`,
    );
    assert.equal(stopped.course, null, "停用后深度日不指这门课");

    // 恢复后：D2 顺延到 2026-11-16 起的上课日（rest=sun，2026-11-16 是周一）。
    await cliJson(["resume", fixture.vault, "epp", "--workspace", fixture.ws, "--today", "2026-11-16"]);
    const resumed = await cycleDay(fixture.vault, "2026-11-16");
    assert.ok(
      resumed.lessons.some((lesson) => lesson.course === "epp"),
      `恢复后 lessons 里应再有 epp：${JSON.stringify(resumed.lessons)}`,
    );
  } finally {
    await cleanup(fixture);
  }
});
