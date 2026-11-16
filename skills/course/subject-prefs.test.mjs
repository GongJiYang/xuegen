#!/usr/bin/env node
// subject-prefs.mjs 的测试：list 找「## 讲解偏好」节、remove 精确删一行并记 jj。
// 全部在 os.tmpdir() 下建临时库，绝不触碰真实库或 ~/.xuegen。
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "subject-prefs.mjs");

const MATH = [
  "# 离散数学",
  "",
  "## Materials",
  "",
  "- [[courses/epp|离散]]",
  "",
  "## 讲解偏好",
  "",
  "- 默认风格：细讲",
  "- 别用比喻",
  "",
  "## 其他",
  "",
  "- 不动的行",
  "",
].join("\n");

const NO_SECTION = "# 算法\n\n## Materials\n\n- 一本书\n";

/** 临时库：{root, vault}，wiki/subjects 下 math.md 有两行偏好、empty.md 没有这一节。 */
async function makeVault() {
  const root = await mkdtemp(join(tmpdir(), "subject-prefs-"));
  const vault = join(root, "vault");
  const dir = join(vault, "wiki", "subjects");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "math.md"), MATH);
  await writeFile(join(dir, "empty.md"), NO_SECTION);
  return { root, vault, mathFile: join(dir, "math.md") };
}

async function cli(args, { expectFail = false } = {}) {
  try {
    const { stdout, stderr } = await run(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
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

test("list：只输出有「## 讲解偏好」且有行的科目，text 去掉 - 前缀、style 认出默认风格行", async () => {
  const fixture = await makeVault();
  try {
    const out = await cliJson(["list", fixture.vault]);
    assert.deepEqual(out, [
      {
        subject: "math",
        title: "离散数学",
        lines: [
          { text: "默认风格：细讲", style: true },
          { text: "别用比喻", style: false },
        ],
      },
    ]);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("remove：删掉完全相同的一行，其他行与节不动；不是 jj 库时 jj 为 skipped", async () => {
  const fixture = await makeVault();
  try {
    const out = await cliJson(["remove", fixture.vault, "math", "--text", "别用比喻"]);
    assert.deepEqual(out, { subject: "math", removed: "别用比喻", jj: "skipped" });
    const text = await readFile(fixture.mathFile, "utf8");
    assert.equal(text, MATH.replace("- 别用比喻\n", ""), "只少了那一行");
    assert.match(text, /- 默认风格：细讲/, "另一条还在");
    assert.match(text, /## 其他[\s\S]*- 不动的行/, "别的节不动");

    // list 现在只剩一行。
    const after = await cliJson(["list", fixture.vault]);
    assert.equal(after[0].lines.length, 1);
    assert.equal(after[0].lines[0].text, "默认风格：细讲");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("remove：找不到完全相同的行时报「这条偏好已经不在了」，文件不变", async () => {
  const fixture = await makeVault();
  try {
    for (const text of ["不存在的偏好", " 别用比喻", "别用比喻 "]) {
      const failed = await cli(["remove", fixture.vault, "math", "--text", text], { expectFail: true });
      assert.equal(failed.code, 1);
      assert.match(failed.stderr, /这条偏好已经不在了/, `--text ${JSON.stringify(text)}`);
      assert.equal(await readFile(fixture.mathFile, "utf8"), MATH, "文件不变");
    }
    // 没有讲解偏好节的科目同样报这条。
    const empty = await cli(["remove", fixture.vault, "empty", "--text", "别用比喻"], { expectFail: true });
    assert.match(empty.stderr, /这条偏好已经不在了/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
