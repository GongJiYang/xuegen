#!/usr/bin/env node
// rename-vault.mjs 的测试：node:test + node:assert，无第三方依赖。
// 全部用 os.tmpdir() 下的小型假库，不读真实库、不碰真实 ~/.xuegen/；
// jj 与进程检查用临时 PATH 里的假命令注入，测试机不需要装 jj。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, chmod, symlink } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildLinkContext, isIgnored, rewriteGitignore, rewriteLinks } from "./rename-vault.mjs";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "rename-vault.mjs");

// ---- 夹具 ----

// 小型旧布局库：两页概念/卡片、一个由目录改名带走的页面、旧剪藏目录。
const BASE_FILES = {
  "wiki/index.md": "# 索引\n",
  "wiki/知识/concepts/link/210-symbol-handling.md": "# 符号处理\n",
  "wiki/知识/flashcards/link/210-symbol-handling.md": "TARGET DECK\n离散数学::Epp\n",
  "wiki/知识/synthesis/000-overview.md": "# 总览\n",
  "Clippings/clip-1.md": "# 剪藏\n",
};

const MAP = {
  dirs: [
    { from: "wiki/知识", to: "wiki/knowledge" },
    { from: "Clippings", to: "clippings" },
  ],
  files: [
    {
      from: "wiki/知识/concepts/link/210-symbol-handling.md",
      to: "wiki/knowledge/concepts/c-systems-programming/210-symbol-handling.md",
      title: "符号处理",
    },
    {
      from: "wiki/知识/flashcards/link/210-symbol-handling.md",
      to: "wiki/knowledge/flashcards/c-systems-programming/210-symbol-handling.md",
    },
  ],
  removeEmptyDirs: ["wiki/知识/concepts/link", "wiki/知识/flashcards/link"],
};

const NEW_CONCEPT = "wiki/knowledge/concepts/c-systems-programming/210-symbol-handling.md";
const NEW_CARD = "wiki/knowledge/flashcards/c-systems-programming/210-symbol-handling.md";

async function makeVault(files = BASE_FILES) {
  const vault = await mkdtemp(join(tmpdir(), "rename-vault-test-"));
  for (const [rel, text] of Object.entries(files)) {
    const file = join(vault, rel);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text, "utf8");
  }
  return vault;
}

async function writeMap(vault, map) {
  const file = join(vault, "..", `${vault.split("/").pop()}-map.json`);
  await writeFile(file, JSON.stringify(map), "utf8");
  return file;
}

/** 跑脚本；返回退出码与输出（不抛错）。env 可注入假 jj / pgrep。 */
async function vault(scriptArgs, { env } = {}) {
  try {
    const { stdout, stderr } = await run("node", [SCRIPT, ...scriptArgs], {
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

// 前置检查里 jj 与进程两项在测试机上跳过；要测这两项时单独用假命令。
const SKIP = ["--skip-jj-check", "--skip-process-check"];

async function readText(vaultDir, rel) {
  return readFile(join(vaultDir, rel), "utf8");
}

/** 临时 PATH 里放一个假命令（jj / pgrep）。 */
async function fakeCommand(name, script) {
  const dir = await mkdtemp(join(tmpdir(), `rename-vault-bin-${name}-`));
  const file = join(dir, name);
  await writeFile(file, script, "utf8");
  await chmod(file, 0o755);
  return dir;
}

// ---- 1. 试运行 / apply ----

test("试运行：只打印计划，不改任何文件", async () => {
  const vaultDir = await makeVault();
  const mapFile = await writeMap(vaultDir, MAP);
  const before = await readText(vaultDir, "wiki/index.md");
  try {
    const result = await vault([vaultDir, mapFile, ...SKIP]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /试运行（未写文件）/);
    assert.match(result.stdout, /目录 wiki\/知识 → wiki\/knowledge/);
    assert.equal(await readText(vaultDir, "wiki/index.md"), before);
    assert.ok(existsSync(join(vaultDir, "wiki/知识/concepts/link/210-symbol-handling.md")));
    assert.ok(!existsSync(join(vaultDir, "wiki/knowledge")));
  } finally {
    await rm(vaultDir, { recursive: true, force: true });
  }
});

test("--apply：目录与文件就位，删空目录，大小写改名，无残留", async () => {
  const vaultDir = await makeVault();
  const mapFile = await writeMap(vaultDir, MAP);
  try {
    const result = await vault([vaultDir, mapFile, "--apply", ...SKIP]);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /完成：/);
    assert.match(result.stdout, /残留：0 条/);
    assert.ok(existsSync(join(vaultDir, NEW_CONCEPT)));
    assert.ok(existsSync(join(vaultDir, NEW_CARD)));
    assert.ok(existsSync(join(vaultDir, "wiki/knowledge/synthesis/000-overview.md")));
    assert.ok(!existsSync(join(vaultDir, "wiki/知识")));
    // 只差大小写的改名在小写不敏感的盘上也要落地。
    const top = await readdir(vaultDir);
    assert.ok(top.includes("clippings"), top.join(","));
    assert.ok(!top.includes("Clippings"));
    assert.ok(!existsSync(join(vaultDir, "wiki/knowledge/concepts/link")));
  } finally {
    await rm(vaultDir, { recursive: true, force: true });
  }
});

// ---- 2. 链接改写 ----

const LINK_FIXTURE = {
  ...BASE_FILES,
  "wiki/index.md": [
    "# 索引",
    "",
    "- 完整路径 [[知识/concepts/link/210-symbol-handling]]",
    "- 带显示 [[知识/concepts/link/210-symbol-handling|符号处理详解]]",
    "- 锚点 [[知识/concepts/link/210-symbol-handling#定义]]",
    "- 嵌入 ![[知识/concepts/link/210-symbol-handling]]",
    "- 短路径 [[link/210-symbol-handling]]",
    "- 裸名 [[000-overview]]",
    "- 表格 | [[知识/concepts/link/210-symbol-handling\\|符号]] |",
    "- 代码块",
    "```",
    "[[知识/concepts/link/210-symbol-handling]]",
    "```",
    "- 行内 `[[知识/concepts/link/210-symbol-handling]]`",
    "",
  ].join("\n"),
};

test("链接改写：补显示文字、保留显示文字/锚点/嵌入/表格转义竖线，代码区不动", async () => {
  const vaultDir = await makeVault(LINK_FIXTURE);
  const mapFile = await writeMap(vaultDir, MAP);
  const concept = "knowledge/concepts/c-systems-programming/210-symbol-handling";
  try {
    const result = await vault([vaultDir, mapFile, "--apply", ...SKIP]);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    const text = await readText(vaultDir, "wiki/index.md");
    assert.match(text, new RegExp(`- 完整路径 \\[\\[${concept.replace(/\//g, "\\/")}\\|符号处理\\]\\]`));
    assert.match(text, /- 带显示 \[\[knowledge\/concepts\/c-systems-programming\/210-symbol-handling\|符号处理详解\]\]/);
    assert.match(text, /- 锚点 \[\[knowledge\/concepts\/c-systems-programming\/210-symbol-handling#定义\|符号处理\]\]/);
    assert.match(text, /- 嵌入 !\[\[knowledge\/concepts\/c-systems-programming\/210-symbol-handling\]\]/);
    // 短路径：概念页与同名卡片页都命中，默认指向概念页。
    assert.match(text, /- 短路径 \[\[knowledge\/concepts\/c-systems-programming\/210-symbol-handling\|符号处理\]\]/);
    // 裸名唯一命中：目录改名换算出新路径，没有标题可补。
    assert.match(text, /- 裸名 \[\[knowledge\/synthesis\/000-overview\]\]/);
    // 表格里的转义竖线保留。
    assert.match(text, /- 表格 \| \[\[knowledge\/concepts\/c-systems-programming\/210-symbol-handling\\\|符号\]\] \|/);
    // 代码块与行内代码里的字面量不改。
    assert.match(text, /```\n\[\[知识\/concepts\/link\/210-symbol-handling\]\]\n```/);
    assert.match(text, /- 行内 `\[\[知识\/concepts\/link\/210-symbol-handling\]\]`/);
    assert.ok(!text.includes("knowledge/flashcards"), "链接应指向概念页而不是卡片页");
  } finally {
    await rm(vaultDir, { recursive: true, force: true });
  }
});

test("后缀解析：同名的两个概念页仍算歧义，不改并记进 ambiguous", async () => {
  const vaultDir = await makeVault({
    "wiki/index.md": "# 索引\n",
    "wiki/知识/concepts/math/010-x.md": "# 一\n",
    "wiki/知识/concepts/link/010-x.md": "# 二\n",
  });
  try {
    const table = buildLinkContext(vaultDir, MAP);
    const result = rewriteLinks("[[010-x]] 和 [[知识/concepts/math/010-x]]", table);
    assert.equal(result.count, 1);
    assert.deepEqual([...result.ambiguous], ["010-x"]);
    assert.equal(result.text, "[[010-x]] 和 [[knowledge/concepts/math/010-x]]");
  } finally {
    await rm(vaultDir, { recursive: true, force: true });
  }
});

// ---- 3. 只读锁 ----

test("只读目录：apply 后权限原样恢复", async () => {
  const vaultDir = await makeVault({
    ...BASE_FILES,
    "wiki/courses/note.md": "[[知识/concepts/link/210-symbol-handling]]\n",
  });
  const mapFile = await writeMap(vaultDir, MAP);
  const courses = join(vaultDir, "wiki/courses");
  try {
    await chmod(courses, 0o555);
    const result = await vault([vaultDir, mapFile, "--apply", ...SKIP]);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(statSync(courses).mode & 0o777, 0o555);
    assert.match(await readText(vaultDir, "wiki/courses/note.md"), /\[\[knowledge\/concepts/);
  } finally {
    await chmod(courses, 0o755);
    await rm(vaultDir, { recursive: true, force: true });
  }
});

test("只读目录：改名中途失败也把权限恢复回去", async () => {
  const vaultDir = await makeVault({
    ...BASE_FILES,
    "wiki/courses/note.md": "[[知识/concepts/link/210-symbol-handling]]\n",
    "wiki/blocked": "这不是目录\n",
  });
  // 第二个目录改名要建 wiki/blocked/clippings，但 wiki/blocked 是普通文件 → 失败。
  const map = { ...MAP, dirs: [MAP.dirs[0], { from: "Clippings", to: "wiki/blocked/clippings" }] };
  const mapFile = await writeMap(vaultDir, map);
  const courses = join(vaultDir, "wiki/courses");
  try {
    await chmod(courses, 0o555);
    const result = await vault([vaultDir, mapFile, "--apply", ...SKIP]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /「目录改名」失败/);
    assert.match(result.stderr, /已做到：/);
    assert.equal(statSync(courses).mode & 0o777, 0o555);
  } finally {
    await chmod(courses, 0o755);
    await rm(vaultDir, { recursive: true, force: true });
  }
});

// ---- 4. 前置检查 ----

async function expectPrecheckFailure(files, map, pattern, { env } = {}) {
  const vaultDir = await makeVault(files);
  const mapFile = await writeMap(vaultDir, map);
  const before = await readText(vaultDir, "wiki/index.md");
  try {
    const result = await vault([vaultDir, mapFile, "--apply", ...(env ? [] : SKIP)], { env });
    assert.equal(result.code, 1);
    assert.match(result.stderr, pattern);
    // 一字不改。
    assert.equal(await readText(vaultDir, "wiki/index.md"), before);
    assert.ok(existsSync(join(vaultDir, "wiki/知识")));
  } finally {
    await rm(vaultDir, { recursive: true, force: true });
  }
}

test("前置检查：from 缺失 exit 1 且不动文件", async () => {
  await expectPrecheckFailure(BASE_FILES, { ...MAP, dirs: [...MAP.dirs, { from: "raw/missing", to: "raw/x" }] }, /目录不存在/);
});

test("前置检查：to 已存在 exit 1 且不动文件", async () => {
  const files = { ...BASE_FILES, "wiki/knowledge/concepts/c-systems-programming/210-symbol-handling.md": "# 已有\n" };
  await expectPrecheckFailure(files, MAP, /目标已存在/);
});

test("前置检查：jj 工作区不干净 exit 1", async () => {
  const bin = await fakeCommand("jj", "#!/bin/sh\necho 'working copy changes:'\nexit 0\n");
  try {
    await expectPrecheckFailure(BASE_FILES, MAP, /jj 工作区不干净/, {
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
  } finally {
    await rm(bin, { recursive: true, force: true });
  }
});

test("前置检查：jj 不可用/报错 exit 1", async () => {
  const bin = await fakeCommand("jj", "#!/bin/sh\necho 'no jj here' >&2\nexit 1\n");
  try {
    await expectPrecheckFailure(BASE_FILES, MAP, /jj st 失败/, {
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
  } finally {
    await rm(bin, { recursive: true, force: true });
  }
});

test("前置检查：学根或 Obsidian 在跑 exit 1", async () => {
  // 先让 jj 检查通过，才能轮到进程检查报错。
  const jjBin = await fakeCommand("jj", "#!/bin/sh\necho 'no changes'\nexit 0\n");
  const pgrepBin = await fakeCommand("pgrep", "#!/bin/sh\necho 4321\nexit 0\n");
  try {
    await expectPrecheckFailure(BASE_FILES, MAP, /学根或 Obsidian 正在运行/, {
      env: { PATH: `${pgrepBin}:${jjBin}:${process.env.PATH}` },
    });
  } finally {
    await rm(jjBin, { recursive: true, force: true });
    await rm(pgrepBin, { recursive: true, force: true });
  }
});

// ---- 5. .gitignore ----

const GITIGNORE_MAP = { dirs: [{ from: "raw/old", to: "raw/new" }], files: [], removeEmptyDirs: [] };
const GITIGNORE_FILES = {
  "wiki/index.md": "# 索引\n",
  "raw/old/textbook.pdf": "pdf\n",
  ".gitignore": ["# 教材", "raw/old/", "raw/old/sub/", "*.tmp", "node_modules/", ""].join("\n"),
};

test(".gitignore：改名时把旧前缀行改成新前缀，其它行原样（原子写）", async () => {
  const vaultDir = await makeVault(GITIGNORE_FILES);
  const mapFile = await writeMap(vaultDir, GITIGNORE_MAP);
  try {
    const dry = await vault([vaultDir, mapFile, ...SKIP]);
    assert.equal(dry.code, 0, dry.stderr);
    assert.match(dry.stdout, /\.gitignore 第 2 行 raw\/old\/ → raw\/new\//);
    assert.equal(await readText(vaultDir, ".gitignore"), GITIGNORE_FILES[".gitignore"]);

    const result = await vault([vaultDir, mapFile, "--apply", ...SKIP]);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(
      await readText(vaultDir, ".gitignore"),
      ["# 教材", "raw/new/", "raw/new/sub/", "*.tmp", "node_modules/", ""].join("\n"),
    );
    assert.ok(existsSync(join(vaultDir, "raw/new/textbook.pdf")));
  } finally {
    await rm(vaultDir, { recursive: true, force: true });
  }
});

test(".gitignore：改名前被忽略、改名后不被忽略就 fail（例：通配规则改不到）", async () => {
  const files = { ...GITIGNORE_FILES, ".gitignore": "raw/o*/\n" };
  const vaultDir = await makeVault(files);
  const mapFile = await writeMap(vaultDir, GITIGNORE_MAP);
  try {
    const result = await vault([vaultDir, mapFile, "--apply", ...SKIP]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /改名成 raw\/new 后不会被忽略/);
    assert.equal(await readText(vaultDir, ".gitignore"), "raw/o*/\n");
    assert.ok(existsSync(join(vaultDir, "raw/old/textbook.pdf")));
  } finally {
    await rm(vaultDir, { recursive: true, force: true });
  }
});

test("rewriteGitignore / isIgnored：只换路径前缀，注释与通配规则不误判", () => {
  const text = ["# 注释", "raw/学习路径/", "raw/学习路径/books/", "*.tmp", ""].join("\n");
  const rewritten = rewriteGitignore(text, [{ from: "raw/学习路径", to: "raw/library" }]);
  assert.equal(rewritten.text, ["# 注释", "raw/library/", "raw/library/books/", "*.tmp", ""].join("\n"));
  assert.deepEqual(
    rewritten.lines.map((line) => [line.index, line.before, line.after]),
    [
      [1, "raw/学习路径/", "raw/library/"],
      [2, "raw/学习路径/books/", "raw/library/books/"],
    ],
  );
  assert.equal(isIgnored("raw/library", rewritten.text), true);
  assert.equal(isIgnored("raw/other", rewritten.text), false);
  assert.equal(isIgnored("a.tmp", rewritten.text), true);
  assert.equal(isIgnored("raw/library", null), false);
});

// ---- 6. 经符号链接调用 ----

test("经符号链接调用 --help 有输出（realpath 比较主模块）", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rename-vault-link-"));
  try {
    const link = join(dir, "app");
    await symlink(HERE, link, "dir");
    const { stdout } = await run("node", [join(link, "rename-vault.mjs"), "--help"], { encoding: "utf8" });
    assert.match(stdout, /库一次性改名（rename-vault）/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("链接改写：图片嵌入 ![[图.png]] 换目录前缀且不加别名，非 .md 文件名保留", async () => {
  const vaultDir = await makeVault({
    "wiki/index.md": "# 索引\n\n![[assets/old/diagram.png]]\n",
    "wiki/assets/old/diagram.png": "png\n",
  });
  const map = { dirs: [{ from: "wiki/assets/old", to: "wiki/assets/new" }], files: [], removeEmptyDirs: [] };
  const mapFile = await writeMap(vaultDir, map);
  try {
    const result = await vault([vaultDir, mapFile, "--apply", ...SKIP]);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    const text = await readText(vaultDir, "wiki/index.md");
    assert.match(text, /!\[\[assets\/new\/diagram\.png\]\]/);
    assert.ok(existsSync(join(vaultDir, "wiki/assets/new/diagram.png")));
  } finally {
    await rm(vaultDir, { recursive: true, force: true });
  }
});
