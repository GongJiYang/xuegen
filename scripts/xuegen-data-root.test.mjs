#!/usr/bin/env node
// bin/xuegen-data-root.mjs 的测试：node:test + node:assert，无第三方依赖。
// 全部在 os.tmpdir() 下构造数据根与 home，用 --home/--learning 指过去，不碰真实 ~/.xuegen 或 ~/learning。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { existsSync, lstatSync, readlinkSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "bin", "xuegen-data-root.mjs");

/** 数据根下的英文子目录名（LAYOUT，与脚本一致）。 */
const LAYOUT = ["vault", "sessions", "workspace"];

/** 临时数据根（默认建好 vault/ sessions/ workspace/）、home、learning 路径。 */
async function makeCase() {
  const base = await mkdtemp(join(tmpdir(), "xuegen-data-root-"));
  const dataRoot = join(base, "数据根");
  for (const name of LAYOUT) await mkdir(join(dataRoot, name), { recursive: true });
  return { base, dataRoot, home: join(base, "home"), learning: join(base, "learning") };
}

/** 把数据根上的英文子目录换成旧的中文子目录。 */
async function toLegacyLayout(testCase) {
  for (const name of LAYOUT) await rm(join(testCase.dataRoot, name), { recursive: true, force: true });
  for (const name of ["库", "会话", "工作区"]) await mkdir(join(testCase.dataRoot, name), { recursive: true });
}

async function wiring(args, { expectFail = false } = {}) {
  try {
    const { stdout } = await run("node", [SCRIPT, ...args], { encoding: "utf8" });
    if (expectFail) assert.fail(`期望失败但成功：${args.join(" ")}\n${stdout}`);
    return stdout;
  } catch (error) {
    if (!expectFail) throw error;
    return error.stderr ?? "";
  }
}

/** 数据根 + home/learning 参数。 */
function argsFor(testCase, extra = []) {
  return [
    testCase.dataRoot,
    "--home",
    testCase.home,
    "--learning",
    testCase.learning,
    ...extra,
  ];
}

const lstatOrNull = (path) => {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
};

const isLinkTo = (link, target) => {
  const stat = lstatOrNull(link);
  return stat !== null && stat.isSymbolicLink() && readlinkSync(link) === target;
};

test("接线：建两条链接并写 wiki.json", async () => {
  const testCase = await makeCase();
  try {
    const stdout = await wiring(argsFor(testCase));
    assert.match(stdout, /vault\/、sessions\/、workspace\/ 都在/);
    assert.ok(isLinkTo(join(testCase.home, "sessions"), join(testCase.dataRoot, "sessions")), stdout);
    assert.ok(isLinkTo(testCase.learning, join(testCase.dataRoot, "workspace")), stdout);
    const wikiJson = JSON.parse(await readFile(join(testCase.home, "wiki.json"), "utf8"));
    assert.deepEqual(wikiJson, { root: join(testCase.dataRoot, "vault") });
    // 原子写入不留临时文件。
    assert.ok((await readdir(testCase.home)).every((name) => !name.includes(".tmp-")));
  } finally {
    await rm(testCase.base, { recursive: true, force: true });
  }
});

test("重复运行：链接与 wiki.json 都已就位，跳过且不改动", async () => {
  const testCase = await makeCase();
  try {
    await wiring(argsFor(testCase));
    const wikiText = await readFile(join(testCase.home, "wiki.json"), "utf8");
    const second = await wiring(argsFor(testCase));
    assert.match(second, /sessions.*跳过/);
    assert.match(second, /learning.*跳过/);
    assert.match(second, /wiki\.json.*跳过/);
    assert.equal(await readFile(join(testCase.home, "wiki.json"), "utf8"), wikiText);
    assert.ok(isLinkTo(join(testCase.home, "sessions"), join(testCase.dataRoot, "sessions")));
  } finally {
    await rm(testCase.base, { recursive: true, force: true });
  }
});

test("拒绝：sessions 已是真实目录，exit 1 且不改任何东西", async () => {
  const testCase = await makeCase();
  try {
    await mkdir(join(testCase.home, "sessions"), { recursive: true });
    await writeFile(join(testCase.home, "sessions", "keep.md"), "原有内容", "utf8");
    const stderr = await wiring(argsFor(testCase), { expectFail: true });
    assert.match(stderr, /已存在且不是指向/);
    assert.equal(lstatSync(join(testCase.home, "sessions")).isDirectory(), true);
    assert.equal(await readFile(join(testCase.home, "sessions", "keep.md"), "utf8"), "原有内容");
    assert.equal(lstatOrNull(testCase.learning), null, "拒绝后不应建另一条链接");
    assert.equal(existsSync(join(testCase.home, "wiki.json")), false, "拒绝后不应写 wiki.json");
  } finally {
    await rm(testCase.base, { recursive: true, force: true });
  }
});

test("拒绝：sessions 已是指向别处的链接，不覆盖", async () => {
  const testCase = await makeCase();
  try {
    const elsewhere = join(testCase.base, "别的会话");
    await mkdir(elsewhere, { recursive: true });
    await mkdir(testCase.home, { recursive: true });
    symlinkSync(elsewhere, join(testCase.home, "sessions"), "dir");
    const stderr = await wiring(argsFor(testCase), { expectFail: true });
    assert.match(stderr, /已是指向/);
    assert.ok(isLinkTo(join(testCase.home, "sessions"), elsewhere), "原链接不应被改");
    assert.equal(existsSync(join(testCase.home, "wiki.json")), false);
  } finally {
    await rm(testCase.base, { recursive: true, force: true });
  }
});

test("拒绝：learning 已是真实目录，两条链接都不动", async () => {
  const testCase = await makeCase();
  try {
    await mkdir(testCase.learning, { recursive: true });
    await writeFile(join(testCase.learning, "keep.md"), "原有内容", "utf8");
    const stderr = await wiring(argsFor(testCase), { expectFail: true });
    assert.match(stderr, /已存在且不是指向/);
    assert.equal(await readFile(join(testCase.learning, "keep.md"), "utf8"), "原有内容");
    assert.equal(lstatOrNull(join(testCase.home, "sessions")), null, "预检失败时不应先建另一条链接");
    assert.equal(existsSync(join(testCase.home, "wiki.json")), false);
  } finally {
    await rm(testCase.base, { recursive: true, force: true });
  }
});

test("拒绝：数据根缺 vault/ 子目录，exit 1 且不新建库", async () => {
  const testCase = await makeCase();
  try {
    await rm(join(testCase.dataRoot, "vault"), { recursive: true, force: true });
    const stderr = await wiring(argsFor(testCase), { expectFail: true });
    assert.match(stderr, /数据根缺少 vault\//);
    assert.equal(existsSync(join(testCase.dataRoot, "vault")), false, "不应新建库目录");
    assert.equal(existsSync(join(testCase.home, "wiki.json")), false);
    assert.equal(lstatOrNull(join(testCase.home, "sessions")), null);
  } finally {
    await rm(testCase.base, { recursive: true, force: true });
  }
});

test("拒绝：数据根缺 workspace/ 子目录，同样 exit 1", async () => {
  const testCase = await makeCase();
  try {
    await rm(join(testCase.dataRoot, "workspace"), { recursive: true, force: true });
    const stderr = await wiring(argsFor(testCase), { expectFail: true });
    assert.match(stderr, /数据根缺少 workspace\//);
    assert.equal(existsSync(join(testCase.dataRoot, "workspace")), false);
  } finally {
    await rm(testCase.base, { recursive: true, force: true });
  }
});

test("--dry-run：只打印将要做的事，不建 home、不建链接、不写 wiki.json", async () => {
  const testCase = await makeCase();
  try {
    const stdout = await wiring(argsFor(testCase, ["--dry-run"]));
    assert.match(stdout, /将创建/);
    assert.match(stdout, /将写入/);
    assert.equal(existsSync(testCase.home), false, "dry-run 不应创建 home");
    assert.equal(existsSync(testCase.learning), false, "dry-run 不应创建链接");
    assert.equal(existsSync(join(testCase.home, "wiki.json")), false, "dry-run 不应写 wiki.json");
  } finally {
    await rm(testCase.base, { recursive: true, force: true });
  }
});

test("--dry-run 在已接线的机器上同样不改文件", async () => {
  const testCase = await makeCase();
  try {
    await wiring(argsFor(testCase));
    const wikiText = await readFile(join(testCase.home, "wiki.json"), "utf8");
    await wiring(argsFor(testCase, ["--dry-run"]));
    assert.equal(await readFile(join(testCase.home, "wiki.json"), "utf8"), wikiText);
    assert.ok(isLinkTo(join(testCase.home, "sessions"), join(testCase.dataRoot, "sessions")));
  } finally {
    await rm(testCase.base, { recursive: true, force: true });
  }
});

test("英文目录与指向它们的中文链接并存（真实机器现状）：照常接线，指向英文路径", async () => {
  const testCase = await makeCase();
  try {
    // 库 → vault、会话 → sessions、工作区 → workspace：改名当天留下的中文链接。
    symlinkSync(join(testCase.dataRoot, "vault"), join(testCase.dataRoot, "库"), "dir");
    symlinkSync(join(testCase.dataRoot, "sessions"), join(testCase.dataRoot, "会话"), "dir");
    symlinkSync(join(testCase.dataRoot, "workspace"), join(testCase.dataRoot, "工作区"), "dir");
    const stdout = await wiring(argsFor(testCase));
    assert.equal(
      readlinkSync(join(testCase.home, "sessions")),
      join(testCase.dataRoot, "sessions"),
      `sessions 应指向英文目录，而不是中文链接：${stdout}`,
    );
    assert.equal(readlinkSync(testCase.learning), join(testCase.dataRoot, "workspace"));
    const wikiJson = JSON.parse(await readFile(join(testCase.home, "wiki.json"), "utf8"));
    assert.deepEqual(wikiJson, { root: join(testCase.dataRoot, "vault") });
    // 原有的中文链接不被改动。
    assert.equal(readlinkSync(join(testCase.dataRoot, "会话")), join(testCase.dataRoot, "sessions"));
  } finally {
    await rm(testCase.base, { recursive: true, force: true });
  }
});

test("拒绝：数据根只有旧的中文子目录，exit 1 并提示旧布局怎么改", async () => {
  const testCase = await makeCase();
  try {
    await toLegacyLayout(testCase);
    const stderr = await wiring(argsFor(testCase), { expectFail: true });
    assert.match(stderr, /旧布局/);
    for (const name of LAYOUT) {
      assert.ok(stderr.includes(name), `stderr 应说出新名字 ${name}：${stderr}`);
    }
    // 不建任何链接、不写 wiki.json、不动旧目录。
    assert.equal(lstatOrNull(join(testCase.home, "sessions")), null);
    assert.equal(lstatOrNull(testCase.learning), null);
    assert.equal(existsSync(join(testCase.home, "wiki.json")), false);
    for (const name of ["库", "会话", "工作区"]) {
      assert.equal(existsSync(join(testCase.dataRoot, name)), true, `不应动旧目录 ${name}/`);
    }
    for (const name of LAYOUT) {
      assert.equal(existsSync(join(testCase.dataRoot, name)), false, `不应新建 ${name}/`);
    }
  } finally {
    await rm(testCase.base, { recursive: true, force: true });
  }
});

test("已就位：<home>/sessions 经旧路径解析后与新目标是同一个真实目录，跳过", async () => {
  const testCase = await makeCase();
  try {
    // 模拟 ~/.xuegen/sessions → ~/学根/会话，~/学根 → ~/xuegen-data。
    const legacyRoot = join(testCase.base, "学根");
    symlinkSync(testCase.dataRoot, legacyRoot, "dir");
    symlinkSync(join(testCase.dataRoot, "sessions"), join(testCase.dataRoot, "会话"), "dir");
    await mkdir(testCase.home, { recursive: true });
    symlinkSync(join(legacyRoot, "会话"), join(testCase.home, "sessions"), "dir");
    const stdout = await wiring(argsFor(testCase));
    assert.match(stdout, /sessions.*跳过/);
    // 原链接保持旧写法，脚本不去重写它。
    assert.equal(readlinkSync(join(testCase.home, "sessions")), join(legacyRoot, "会话"));
    assert.ok(isLinkTo(testCase.learning, join(testCase.dataRoot, "workspace")));
    const wikiJson = JSON.parse(await readFile(join(testCase.home, "wiki.json"), "utf8"));
    assert.deepEqual(wikiJson, { root: join(testCase.dataRoot, "vault") });
  } finally {
    await rm(testCase.base, { recursive: true, force: true });
  }
});
