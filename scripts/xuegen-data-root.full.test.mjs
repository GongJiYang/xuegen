#!/usr/bin/env node
// bin/xuegen-data-root.mjs 端到端测试（全量测试 B7）。
// 放在 scripts/ 而不是 bin/：根 package.json 的 test glob 是
// "scripts/**/*.test.mjs" + "skills/**/*.test.mjs"，不含 bin/，放 bin/ 里 npm test 跑不到。
// 一律在 mkdtemp 里造数据根与 home，--home/--learning 都指过去；
// 绝不碰 ~/.xuegen、~/xuegen-data、~/learning、~/学根。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, stat, lstat, readlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "bin", "xuegen-data-root.mjs");

/** 数据根下的英文子目录名（与脚本的 LAYOUT 一致）。 */
const LAYOUT = ["vault", "sessions", "workspace"];
/** 旧的中文子目录名。 */
const LEGACY = ["库", "会话", "工作区"];

/** 临时数据根、home、learning 的路径（数据根默认已建好三个英文子目录）。 */
async function makeCase({ withLayout = true } = {}) {
  const base = await mkdtemp(join(tmpdir(), "xuegen-data-root-full-"));
  const dataRoot = join(base, "data-root");
  await mkdir(dataRoot, { recursive: true });
  if (withLayout) for (const name of LAYOUT) await mkdir(join(dataRoot, name), { recursive: true });
  return { base, dataRoot, home: join(base, "home"), learning: join(base, "learning") };
}

/** 数据根 + home/learning 参数（永远指临时目录）。 */
function argsFor(c, extra = []) {
  return [c.dataRoot, "--home", c.home, "--learning", c.learning, ...extra];
}

/** 跑脚本并原样返回 { ok, code, stdout, stderr }。 */
async function wiring(args) {
  try {
    const { stdout } = await run("node", [SCRIPT, ...args], { encoding: "utf8" });
    return { ok: true, code: 0, stdout, stderr: "" };
  } catch (error) {
    return { ok: false, code: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

const statOrNull = async (path) => {
  try {
    return await lstat(path);
  } catch {
    return null;
  }
};

/** 是不是指向 target 的符号链接（比较链接字面目标）。 */
async function isLinkTo(link, target) {
  const info = await statOrNull(link);
  return info !== null && info.isSymbolicLink() && (await readlink(link)) === target;
}

/** 整棵树的相对路径（目录带 /），用来断言「一个字节都没多出来」。 */
async function tree(dir) {
  if (!existsSync(dir)) return [];
  return (await readdir(dir, { recursive: true })).map(String).sort();
}

async function cleanup(c) {
  // 脚本建的链接指回数据根，先放开再整棵删。
  await rm(c.base, { recursive: true, force: true });
}

// ---------------------------------------------------------------- 1. 全新数据根

test("全新临时数据根：建出两条链向英文子目录的链接并写 wiki.json，不动数据根本身", async () => {
  const c = await makeCase();
  try {
    const before = await tree(c.dataRoot);
    const result = await wiring(argsFor(c));
    assert.equal(result.ok, true, result.stderr);
    assert.match(result.stdout, /vault\/、sessions\/、workspace\/ 都在/);

    assert.equal(await isLinkTo(join(c.home, "sessions"), join(c.dataRoot, "sessions")), true, result.stdout);
    assert.equal(await isLinkTo(c.learning, join(c.dataRoot, "workspace")), true, result.stdout);
    assert.deepEqual(JSON.parse(await readFile(join(c.home, "wiki.json"), "utf8")), {
      root: join(c.dataRoot, "vault"),
    });
    // 数据根只多了「有人写过文件」之外的东西：目录集合不变。
    assert.deepEqual(await tree(c.dataRoot), before, "脚本不应在数据根里新建或删除任何东西");
    // home 是 0700（脚本 mkdir 时指定），且没有残留临时文件。
    assert.equal((await stat(c.home)).mode & 0o777, 0o700);
    assert.ok((await readdir(c.home)).every((name) => !name.includes(".tmp-")), "不应残留临时文件");
  } finally {
    await cleanup(c);
  }
});

test("链接可用：经 <home>/sessions 与 <learning> 写文件，落到数据根对应子目录", async () => {
  const c = await makeCase();
  try {
    assert.equal((await wiring(argsFor(c))).ok, true);
    await writeFile(join(c.home, "sessions", "s1.jsonl"), "会话\n", "utf8");
    await writeFile(join(c.learning, "scratch.txt"), "工作区\n", "utf8");
    assert.equal(await readFile(join(c.dataRoot, "sessions", "s1.jsonl"), "utf8"), "会话\n");
    assert.equal(await readFile(join(c.dataRoot, "workspace", "scratch.txt"), "utf8"), "工作区\n");
  } finally {
    await cleanup(c);
  }
});

test("home 已存在（例如已登录过）：只加链接与 wiki.json，原有文件按原样保留", async () => {
  const c = await makeCase();
  try {
    await mkdir(c.home, { recursive: true });
    await writeFile(join(c.home, "auth.json"), '{"token":"keep"}\n', "utf8");
    const result = await wiring(argsFor(c));
    assert.equal(result.ok, true, result.stderr);
    assert.equal(await readFile(join(c.home, "auth.json"), "utf8"), '{"token":"keep"}\n');
    assert.equal(await isLinkTo(join(c.home, "sessions"), join(c.dataRoot, "sessions")), true);
  } finally {
    await cleanup(c);
  }
});

test("已有 wiki.json 指向别处：改写成新数据根；损坏的 wiki.json 也照样重写", async () => {
  const c = await makeCase();
  try {
    await mkdir(c.home, { recursive: true });
    await writeFile(join(c.home, "wiki.json"), '{\n  "root": "/old/place/vault"\n}\n', "utf8");
    assert.equal((await wiring(argsFor(c))).ok, true);
    assert.deepEqual(JSON.parse(await readFile(join(c.home, "wiki.json"), "utf8")), {
      root: join(c.dataRoot, "vault"),
    });

    await writeFile(join(c.home, "wiki.json"), "not json", "utf8");
    const second = await wiring(argsFor(c));
    assert.equal(second.ok, true, second.stderr);
    assert.deepEqual(JSON.parse(await readFile(join(c.home, "wiki.json"), "utf8")), {
      root: join(c.dataRoot, "vault"),
    });
  } finally {
    await cleanup(c);
  }
});

// ---------------------------------------------------------------- 2. 旧中文子目录

test("数据根只有旧中文子目录（库/会话/工作区）：exit 1，说清旧布局与三个新名字，什么都不建", async () => {
  const c = await makeCase({ withLayout: false });
  try {
    for (const name of LEGACY) await mkdir(join(c.dataRoot, name), { recursive: true });
    const result = await wiring(argsFor(c));
    assert.equal(result.ok, false, `应失败：${result.stdout}`);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /旧布局/);
    for (const name of LAYOUT) assert.ok(result.stderr.includes(name), `stderr 应说出新名字 ${name}：${result.stderr}`);
    // 不建链接、不写 wiki.json、不动旧目录、不建新目录。
    assert.equal(await statOrNull(join(c.home, "sessions")), null);
    assert.equal(await statOrNull(c.learning), null);
    assert.equal(existsSync(join(c.home, "wiki.json")), false);
    for (const name of LEGACY) assert.equal(existsSync(join(c.dataRoot, name)), true, `不该动旧目录 ${name}/`);
    for (const name of LAYOUT) assert.equal(existsSync(join(c.dataRoot, name)), false, `不该新建 ${name}/`);
  } finally {
    await cleanup(c);
  }
});

test("英文目录与指向它们的中文链接并存（真实机器现状）：照常接线，链接指英文目录，中文链接不动", async () => {
  const c = await makeCase();
  try {
    const { symlink } = await import("node:fs/promises");
    for (const [cn, en] of [["库", "vault"], ["会话", "sessions"], ["工作区", "workspace"]]) {
      await symlink(join(c.dataRoot, en), join(c.dataRoot, cn), "dir");
    }
    const result = await wiring(argsFor(c));
    assert.equal(result.ok, true, result.stderr);
    assert.equal(await readlink(join(c.home, "sessions")), join(c.dataRoot, "sessions"));
    assert.equal(await readlink(c.learning), join(c.dataRoot, "workspace"));
    assert.deepEqual(JSON.parse(await readFile(join(c.home, "wiki.json"), "utf8")), {
      root: join(c.dataRoot, "vault"),
    });
    // 原有的中文链接一字不改。
    for (const [cn, en] of [["库", "vault"], ["会话", "sessions"], ["工作区", "workspace"]]) {
      assert.equal(await readlink(join(c.dataRoot, cn)), join(c.dataRoot, en), `中文链接 ${cn} 不该被改`);
    }
  } finally {
    await cleanup(c);
  }
});

test("旧中文链接与英文目录混在一起但缺英文目录：exit 1 报缺 sessions/，不建链接", async () => {
  const c = await makeCase({ withLayout: false });
  try {
    const { symlink } = await import("node:fs/promises");
    await mkdir(join(c.dataRoot, "vault"), { recursive: true });
    await mkdir(join(c.dataRoot, "workspace"), { recursive: true });
    await mkdir(join(c.dataRoot, "会话"), { recursive: true });
    await mkdir(join(c.dataRoot, "工作区"), { recursive: true });
    await symlink(join(c.dataRoot, "vault"), join(c.dataRoot, "库"), "dir");

    const result = await wiring(argsFor(c));
    assert.equal(result.ok, false);
    assert.match(result.stderr, /数据根缺少 sessions\//);
    assert.equal(await statOrNull(join(c.home, "sessions")), null);
    assert.equal(await statOrNull(c.learning), null);
    assert.equal(existsSync(join(c.home, "wiki.json")), false);
  } finally {
    await cleanup(c);
  }
});

// ---------------------------------------------------------------- 3. --dry-run

test("--dry-run：全新机器上一个文件都不建（不建 home、不建链接、不写 wiki.json）", async () => {
  const c = await makeCase();
  try {
    const before = { root: await tree(c.dataRoot), base: await tree(c.base) };
    const result = await wiring(argsFor(c, ["--dry-run"]));
    assert.equal(result.ok, true, result.stderr);
    assert.match(result.stdout, /将创建/);
    assert.match(result.stdout, /将写入/);
    // 打印的是「将要做什么」，不是「已做」。
    assert.ok(!/已创建|已写入/.test(result.stdout), `dry-run 不应说「已…」：${result.stdout}`);
    assert.deepEqual(await tree(c.base), before.base, "dry-run 后整棵树应完全没变");
    assert.equal(existsSync(c.home), false, "dry-run 不应创建 home");
    assert.equal(existsSync(c.learning), false, "dry-run 不应创建 learning 链接");
    assert.equal(existsSync(join(c.home, "wiki.json")), false, "dry-run 不应写 wiki.json");
    assert.deepEqual(await tree(c.dataRoot), before.root);
  } finally {
    await cleanup(c);
  }
});

test("--dry-run 在已接线的机器上也不改任何东西", async () => {
  const c = await makeCase();
  try {
    assert.equal((await wiring(argsFor(c))).ok, true);
    const wikiText = await readFile(join(c.home, "wiki.json"), "utf8");
    const before = await tree(c.base);
    const result = await wiring(argsFor(c, ["--dry-run"]));
    assert.equal(result.ok, true, result.stderr);
    assert.match(result.stdout, /跳过/);
    assert.deepEqual(await tree(c.base), before);
    assert.equal(await readFile(join(c.home, "wiki.json"), "utf8"), wikiText);
    assert.equal(await readlink(join(c.home, "sessions")), join(c.dataRoot, "sessions"));
  } finally {
    await cleanup(c);
  }
});

test("--dry-run 在旧中文布局上同样先报错，不写任何东西", async () => {
  const c = await makeCase({ withLayout: false });
  try {
    for (const name of LEGACY) await mkdir(join(c.dataRoot, name), { recursive: true });
    const before = await tree(c.base);
    const result = await wiring(argsFor(c, ["--dry-run"]));
    assert.equal(result.ok, false);
    assert.match(result.stderr, /旧布局/);
    assert.deepEqual(await tree(c.base), before);
  } finally {
    await cleanup(c);
  }
});

// ---------------------------------------------------------------- 4. 重复运行幂等

test("重复运行幂等：第二次全是「跳过」，文件内容与链接一字不改", async () => {
  const c = await makeCase();
  try {
    const first = await wiring(argsFor(c));
    assert.equal(first.ok, true, first.stderr);
    const wikiText = await readFile(join(c.home, "wiki.json"), "utf8");
    const homeTree = await tree(c.home);

    const second = await wiring(argsFor(c));
    assert.equal(second.ok, true, second.stderr);
    assert.match(second.stdout, /sessions.*跳过/);
    assert.match(second.stdout, /learning.*跳过/);
    assert.match(second.stdout, /wiki\.json.*跳过/);
    assert.equal(await readFile(join(c.home, "wiki.json"), "utf8"), wikiText, "wiki.json 不该被重写");
    assert.equal(await readlink(join(c.home, "sessions")), join(c.dataRoot, "sessions"));
    assert.equal(await readlink(c.learning), join(c.dataRoot, "workspace"));
    assert.deepEqual(await tree(c.home), homeTree, "home 里不该多出文件");
    assert.ok((await readdir(c.home)).every((name) => !name.includes(".tmp-")));

    // 第三次仍然幂等（不是只有第二次特判）。
    const third = await wiring(argsFor(c));
    assert.equal(third.ok, true, third.stderr);
    assert.match(third.stdout, /wiki\.json.*跳过/);
  } finally {
    await cleanup(c);
  }
});

test("重复运行：只补缺的那一条（learning 已就位、sessions 没有）", async () => {
  const c = await makeCase();
  try {
    const { symlink } = await import("node:fs/promises");
    await mkdir(c.home, { recursive: true });
    await symlink(join(c.dataRoot, "workspace"), c.learning, "dir");
    await writeFile(join(c.home, "wiki.json"), `{\n  "root": ${JSON.stringify(join(c.dataRoot, "vault"))}\n}\n`, "utf8");

    const result = await wiring(argsFor(c));
    assert.equal(result.ok, true, result.stderr);
    assert.match(result.stdout, /已创建 .*sessions/);
    assert.match(result.stdout, /learning.*跳过/);
    assert.match(result.stdout, /wiki\.json.*跳过/);
    assert.equal(await readlink(join(c.home, "sessions")), join(c.dataRoot, "sessions"));
  } finally {
    await cleanup(c);
  }
});

// ---------------------------------------------------------------- 5. 拒绝冲突（不留半套接线）

test("拒绝：sessions 已是真实目录 → exit 1，learning 与 wiki.json 都不动", async () => {
  const c = await makeCase();
  try {
    await mkdir(join(c.home, "sessions"), { recursive: true });
    await writeFile(join(c.home, "sessions", "keep.md"), "原有内容\n", "utf8");
    const result = await wiring(argsFor(c));
    assert.equal(result.ok, false);
    assert.match(result.stderr, /已存在且不是指向/);
    assert.equal(await readFile(join(c.home, "sessions", "keep.md"), "utf8"), "原有内容\n");
    assert.equal(await statOrNull(c.learning), null, "预检失败时不应先建另一条链接");
    assert.equal(existsSync(join(c.home, "wiki.json")), false);
  } finally {
    await cleanup(c);
  }
});

test("拒绝：learning 已是真实目录 → exit 1，sessions 也不建（两条链接先全部预检）", async () => {
  const c = await makeCase();
  try {
    await mkdir(c.learning, { recursive: true });
    await writeFile(join(c.learning, "keep.md"), "原有内容\n", "utf8");
    const result = await wiring(argsFor(c));
    assert.equal(result.ok, false);
    assert.match(result.stderr, /已存在且不是指向/);
    assert.equal(await readFile(join(c.learning, "keep.md"), "utf8"), "原有内容\n");
    assert.equal(await statOrNull(join(c.home, "sessions")), null);
    assert.equal(existsSync(join(c.home, "wiki.json")), false);
  } finally {
    await cleanup(c);
  }
});

test("拒绝：sessions 已是指向别处的链接 → exit 1，原链接不改", async () => {
  const c = await makeCase();
  try {
    const { symlink } = await import("node:fs/promises");
    const elsewhere = join(c.base, "elsewhere");
    await mkdir(elsewhere, { recursive: true });
    await mkdir(c.home, { recursive: true });
    await symlink(elsewhere, join(c.home, "sessions"), "dir");

    const result = await wiring(argsFor(c));
    assert.equal(result.ok, false);
    assert.match(result.stderr, /已是指向/);
    assert.equal(await readlink(join(c.home, "sessions")), elsewhere, "原链接不该被改");
    assert.equal(existsSync(join(c.home, "wiki.json")), false);
  } finally {
    await cleanup(c);
  }
});

test("拒绝：数据根缺 vault/ → exit 1 且不新建库目录", async () => {
  const c = await makeCase();
  try {
    await rm(join(c.dataRoot, "vault"), { recursive: true, force: true });
    const result = await wiring(argsFor(c));
    assert.equal(result.ok, false);
    assert.match(result.stderr, /数据根缺少 vault\//);
    assert.equal(existsSync(join(c.dataRoot, "vault")), false, "不应新建库目录");
    assert.equal(existsSync(join(c.home, "wiki.json")), false);
    assert.equal(await statOrNull(join(c.home, "sessions")), null);
  } finally {
    await cleanup(c);
  }
});

test("没有参数或 --help：打印用法、exit 0、不做任何改动", async () => {
  const c = await makeCase();
  try {
    const before = await tree(c.base);
    for (const args of [[], ["--help"]]) {
      const result = await wiring(args);
      assert.equal(result.ok, true, result.stderr);
      assert.match(result.stdout, /xuegen-data-root/);
      assert.match(result.stdout, /--dry-run/);
    }
    assert.deepEqual(await tree(c.base), before);
  } finally {
    await cleanup(c);
  }
});
