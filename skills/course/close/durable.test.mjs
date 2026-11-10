#!/usr/bin/env node
// close/durable.mjs 的测试：原子写、临时放开只读锁、只锁本课、journal 补完。
// 全部在 mkdtemp 里，不碰真实库/工作区/~/.xuegen。recoverInternal 会重画看板（子进程），
// 所以库里的课程页要段落齐全；库不是 jj 仓库时 jj 步骤自动 skipped。
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  journalPath,
  lockCourse,
  recoverInternal,
  writeAtomic,
  withWritable,
} from "./durable.mjs";

const SCHEDULE = [
  "<!-- xuegen:schedule:start rest=sun -->",
  "| 天 | 日期 | 内容 | 材料 | 完成条件 |",
  "|---|---|---|---|---|",
  "| D1 | 2026-11-09（周一） | 第 1 课 | — | — |",
  "<!-- xuegen:schedule:end -->",
].join("\n");

function coursePage(title = "离散数学") {
  return [
    "<!-- xuegen:course-state -->",
    "",
    `# ${title}学习计划`,
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

/** 库 + 工作区：两门课（epp 有 records 与概念页），index/log 都是 0644。 */
async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), "close-durable-"));
  const vault = join(root, "vault");
  const ws = join(root, "ws");
  await mkdir(join(vault, "wiki", "courses", "epp", "records"), { recursive: true });
  await mkdir(join(vault, "wiki", "courses", "other"), { recursive: true });
  await mkdir(join(vault, "wiki", "knowledge", "concepts", "discrete-math"), { recursive: true });
  await mkdir(ws, { recursive: true });
  await writeFile(join(vault, "wiki", "courses", "epp.md"), coursePage("离散数学"));
  await writeFile(join(vault, "wiki", "courses", "other.md"), coursePage("线性代数"));
  await writeFile(join(vault, "wiki", "courses", "epp", "records", "2026-11.md"), "- 记录了 §1.1\n");
  await writeFile(join(vault, "wiki", "courses", "other", "other.txt"), "别的课\n");
  await writeFile(join(vault, "wiki", "knowledge", "concepts", "discrete-math", "truth-table.md"), "# 真值表\n");
  await writeFile(join(vault, "wiki", "index.md"), "# 索引\n");
  await writeFile(join(vault, "wiki", "log.md"), "# 学习日志\n");
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
/** 同步读 mode：断言在 withWritable 的回调里用（那里不能 await，否则恢复时机被推迟）。 */
const syncMode = (path) => statSync(path).mode & 0o777;

// ---- 原子写 ----

test("writeAtomic：内容与 mode 都按参数落盘，不留下 tmp 文件", async () => {
  const root = await mkdtemp(join(tmpdir(), "close-atomic-"));
  try {
    const file = join(root, "board.md");
    writeAtomic(file, "# 看板\n", 0o444);
    assert.equal(await readFile(file, "utf8"), "# 看板\n");
    assert.equal(await mode(file), 0o444, "给的 mode 生效（看板只读）");
    // 再写一次（覆盖）：内容换掉、mode 重设，目录里只剩这一个文件
    writeAtomic(file, Buffer.from("# 新看板\n"), 0o644);
    assert.equal(await readFile(file, "utf8"), "# 新看板\n");
    assert.equal(await mode(file), 0o644);
    assert.deepEqual(await readdir(root), ["board.md"], "没有 .board.md.tmp-<pid> 残留");
    // 不给 mode 时沿用默认权限，不抛
    const plain = join(root, "plain.json");
    writeAtomic(plain, "{}\n");
    assert.equal(await readFile(plain, "utf8"), "{}\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---- 临时放开只读锁 ----

test("withWritable：同步与异步回调结束后都恢复原权限，回调抛错也恢复", async () => {
  const root = await mkdtemp(join(tmpdir(), "close-writable-"));
  try {
    const dir = join(root, "locked");
    await mkdir(dir);
    await chmod(dir, 0o555);

    const syncValue = withWritable(dir, () => {
      assert.equal(syncMode(dir), 0o755, "进去时临时放开写");
      return "同步结果";
    });
    assert.equal(syncValue, "同步结果");
    assert.equal(await mode(dir), 0o555, "同步成功返回后恢复 0o555");

    const asyncValue = await withWritable(dir, async () => {
      assert.equal(await mode(dir), 0o755, "异步回调里也临时放开写");
      return 42;
    });
    assert.equal(asyncValue, 42);
    assert.equal(await mode(dir), 0o555, "异步成功返回后恢复 0o555");

    assert.throws(
      () =>
        withWritable(dir, () => {
          throw new Error("同步炸");
        }),
      /同步炸/,
    );
    assert.equal(await mode(dir), 0o555, "同步抛错也恢复");

    await assert.rejects(
      withWritable(dir, async () => {
        throw new Error("异步炸");
      }),
      /异步炸/,
    );
    assert.equal(await mode(dir), 0o555, "异步失败也恢复");

    // 本来就可写的目录不动：不改成 0755，也不在返回后乱 chmod
    const open = join(root, "open");
    await mkdir(open);
    await chmod(open, 0o700);
    withWritable(open, () => {
      assert.equal(syncMode(open), 0o700, "可写目录保持原样");
    });
    assert.equal(await mode(open), 0o700);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---- 上锁范围 ----

test("lockCourse：只锁本课的课程页与目录，别的课、概念页、index/log 保持 0644", async () => {
  const fixture = await makeFixture();
  try {
    const { vault } = fixture;
    const eppDirFiles = ["wiki/courses/epp.md", "wiki/courses/epp/records/2026-11.md"];
    lockCourse(vault, "epp", [
      ...eppDirFiles,
      "wiki/index.md",
      "wiki/log.md",
      "wiki/knowledge/concepts/discrete-math/truth-table.md",
    ]);
    assert.equal(await mode(join(vault, "wiki", "courses", "epp.md")), 0o444, "本课课程页上锁");
    assert.equal(await mode(join(vault, "wiki", "courses", "epp")), 0o555, "本课目录 0555");
    assert.equal(await mode(join(vault, "wiki", "courses", "epp", "records")), 0o555, "子目录也 0555");
    assert.equal(await mode(join(vault, "wiki", "courses", "epp", "records", "2026-11.md")), 0o444, "本课记录页 0444");

    assert.equal(await mode(join(vault, "wiki", "courses")), 0o755, "wiki/courses 本身不动");
    assert.equal(await mode(join(vault, "wiki", "courses", "other.md")), 0o644, "别的课程页不动");
    assert.equal(await mode(join(vault, "wiki", "courses", "other")), 0o755, "别的课目录不动");
    assert.equal(await mode(join(vault, "wiki", "courses", "other", "other.txt")), 0o644);
    assert.equal(await mode(join(vault, "wiki", "index.md")), 0o644, "index 不动");
    assert.equal(await mode(join(vault, "wiki", "log.md")), 0o644, "log 不动");
    assert.equal(
      await mode(join(vault, "wiki", "knowledge", "concepts", "discrete-math", "truth-table.md")),
      0o644,
      "概念页不动（继续可编辑）",
    );
  } finally {
    await cleanup(fixture);
  }
});

// ---- 崩溃补完 ----

test("recoverInternal：没有 journal 返回 null，什么都不做", async () => {
  const fixture = await makeFixture();
  try {
    assert.equal(recoverInternal(fixture.ws), null);
    assert.equal(recoverInternal(fixture.ws), null, "可重复调用");
    assert.equal(await mode(join(fixture.vault, "wiki", "courses", "epp.md")), 0o644, "没上锁，因为没收课");
    assert.equal(existsSync(journalPath(fixture.ws)), false);
  } finally {
    await cleanup(fixture);
  }
});

test("recoverInternal：有 journal 时把 tmp rename 到位、上锁、删 journal、标 committed", async () => {
  const fixture = await makeFixture();
  try {
    const { vault, ws } = fixture;
    const staging = join(ws, ".close", "epp-20261110-170000");
    await mkdir(staging, { recursive: true });
    const tmpPage = join(ws, ".close", "page.tmp");
    const tmpConcept = join(ws, ".close", "concept.tmp");
    await writeFile(tmpPage, coursePage("离散数学"));
    await writeFile(tmpConcept, "# 真值表（补完）\n");
    const files = [
      { path: "wiki/courses/epp.md", tmp: tmpPage },
      { path: "wiki/knowledge/concepts/discrete-math/truth-table.md", tmp: tmpConcept },
    ];
    await writeFile(
      journalPath(ws),
      `${JSON.stringify({ staging, vault, slug: "epp", files, startedAt: new Date().toISOString() }, null, 2)}\n`,
    );

    assert.equal(recoverInternal(ws), "epp");

    assert.equal(await readFile(join(vault, "wiki", "courses", "epp.md"), "utf8"), coursePage("离散数学"));
    assert.equal(
      await readFile(join(vault, "wiki", "knowledge", "concepts", "discrete-math", "truth-table.md"), "utf8"),
      "# 真值表（补完）\n",
      "新建的概念页也补完（父目录已存在）",
    );
    assert.equal(existsSync(journalPath(ws)), false, "journal 已删");
    assert.equal(await readFile(join(staging, "committed"), "utf8"), "", "暂存标 committed");
    // 补完也上锁：本课页 0444、本课目录 0555；概念页仍 0644
    assert.equal(await mode(join(vault, "wiki", "courses", "epp.md")), 0o444);
    assert.equal(await mode(join(vault, "wiki", "courses", "epp")), 0o555);
    assert.equal(
      await mode(join(vault, "wiki", "knowledge", "concepts", "discrete-math", "truth-table.md")),
      0o644,
    );
    assert.equal(recoverInternal(ws), null, "补完后再跑是空操作");
  } finally {
    await cleanup(fixture);
  }
});
