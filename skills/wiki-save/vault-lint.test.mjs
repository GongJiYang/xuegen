#!/usr/bin/env node
// vault-lint.mjs 的测试：node:test + node:assert，无第三方依赖。
// 用小型假库（os.tmpdir() 临时目录）覆盖命名、结构、链接检查与退出码，不读真实库。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  allowedLinkRoots,
  brokenLinksInText,
  checkConceptFrontmatter,
  checkName,
  collectEntries,
  isLinkExemptPath,
  linkProblemsInText,
  linkUsesSuffixResolution,
  lintBrokenLinks,
  lintConceptFrontmatter,
  lintLinks,
  lintTree,
} from "./vault-lint.mjs";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "vault-lint.mjs");

/** 跑 CLI；返回退出码与输出（不抛错）。 */
async function lint(args) {
  try {
    const { stdout } = await run("node", [SCRIPT, ...args], { encoding: "utf8" });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

/** 临时假库：<vault>/wiki 必建，其余目录按需要写。 */
async function makeVault() {
  const dir = await mkdtemp(join(tmpdir(), "vault-lint-test-"));
  await mkdir(join(dir, "wiki"), { recursive: true });
  return dir;
}

async function writeFileAt(vault, rel, text = "") {
  const file = join(vault, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
  return file;
}

/** 断言问题清单只含给定的 [kind, path]，顺序不限。 */
function expectProblems(problems, expected) {
  const actual = problems.map((item) => [item.kind, item.path]).sort();
  const want = [...expected].sort();
  assert.deepEqual(actual, want, `实际：${JSON.stringify(problems, null, 2)}`);
}

test("checkName：总则正则的合法与非法样例", () => {
  for (const name of ["knowledge", "010-variables-and-statements", "2026-11-05-epp", "epp.md", "_generated"]) {
    assert.equal(checkName(name), true, `${name} 应合规`);
  }
  for (const name of ["知识", "Clippings", "a b", "a_b", "010.md.md", "-lead", "trail-", "", "_generated2"]) {
    assert.equal(checkName(name), false, `${name} 应不合规`);
  }
});

test("lintTree：wiki/ 与 clippings/ 下的名字不合规才报；顶层 Clippings/ 按普通目录处理", () => {
  const entries = [
    "wiki/",
    "wiki/index.md",
    "wiki/knowledge/",
    "wiki/knowledge/sources/",
    "wiki/knowledge/sources/2026-11-05-epp.md",
    "clippings/",
    "clippings/clip.md",
    "Clippings/",
    "Clippings/网页剪藏.md",
    "raw/",
    "raw/books/",
    "raw/books/epp.pdf",
    "wiki/知识/",
    "wiki/知识/concepts/",
    "wiki/知识/concepts/discrete-math/",
    "wiki/知识/concepts/discrete-math/010-变量.md",
  ];
  expectProblems(lintTree(entries), [
    ["name", "wiki/知识/"],
    ["name", "wiki/知识/concepts/discrete-math/010-变量.md"],
  ]);
});

test("lintTree：raw/ 只查第一、二层分区目录名，不查原料文件名与更深层", () => {
  const entries = [
    "wiki/",
    "wiki/index.md",
    "raw/",
    "raw/books/",
    "raw/books/数学 教材.pdf",
    "raw/books/deep/最深层.png",
    "raw/学习路径/",
    "raw/学习路径/教材.pdf",
    "raw/articles/",
    "raw/articles/clip.md",
  ];
  expectProblems(lintTree(entries), [["name", "raw/学习路径/"]]);
});

test("lintTree：生成物不在规定位置", () => {
  const entries = [
    "wiki/",
    "wiki/index.md",
    "wiki/courses.md",
    "wiki/courses.html",
    "wiki/paradigms.html",
    "wiki/_generated/",
    "wiki/_generated/courses.md",
    "wiki/_generated/courses.html",
    "wiki/courses/",
    "wiki/courses/demo.md",
    "wiki/courses/demo/",
    "wiki/courses/demo/snapshots/",
    "wiki/courses/demo/snapshots/2026-11-09-01.png",
    "wiki/courses/demo-2026-11-09-01.png",
  ];
  expectProblems(lintTree(entries), [
    ["generated", "wiki/courses.md"],
    ["generated", "wiki/courses.html"],
    ["generated", "wiki/paradigms.html"],
    ["generated", "wiki/courses/demo-2026-11-09-01.png"],
  ]);
});

test("lintTree：空目录（搬空了就该删）", () => {
  const entries = ["wiki/", "wiki/index.md", "wiki/knowledge/", "wiki/knowledge/concepts/"];
  expectProblems(lintTree(entries), [["empty-dir", "wiki/knowledge/concepts"]]);
});

test("lintTree：raw/ 第二层以下的空目录不报（原料自带结构），raw/<d> 空目录仍报", () => {
  const entries = [
    "wiki/",
    "wiki/index.md",
    "raw/",
    "raw/library/",
    "raw/library/x/",
    "raw/library/x/y/",
    "raw/library/x/y/z/",
    "raw/library/x/y/z/.gitkeep",
    "raw/empty-section/",
    "clippings/",
    "clippings/a.md",
  ];
  expectProblems(lintTree(entries), [["empty-dir", "raw/empty-section"]]);
});

test("lintTree：概念页缺编号、卡片页找不到同名概念页", () => {
  const entries = [
    "wiki/",
    "wiki/index.md",
    "wiki/knowledge/",
    "wiki/knowledge/concepts/",
    "wiki/knowledge/concepts/discrete-math/",
    "wiki/knowledge/concepts/discrete-math/010-variables.md",
    "wiki/knowledge/concepts/discrete-math/variables.md",
    "wiki/knowledge/flashcards/",
    "wiki/knowledge/flashcards/discrete-math/",
    "wiki/knowledge/flashcards/discrete-math/010-variables.md",
    "wiki/knowledge/flashcards/discrete-math/020-orphan.md",
    "wiki/knowledge/flashcards/discrete-math/inbox.md",
  ];
  expectProblems(lintTree(entries), [
    ["concept-number", "wiki/knowledge/concepts/discrete-math/variables.md"],
    ["card-concept", "wiki/knowledge/flashcards/discrete-math/020-orphan.md"],
  ]);
});

test("lintTree：卡片页收件箱 inbox(-牌组).md 不参与同名对应检查", () => {
  const entries = [
    "wiki/",
    "wiki/index.md",
    "wiki/knowledge/",
    "wiki/knowledge/flashcards/",
    "wiki/knowledge/flashcards/discrete-math/",
    "wiki/knowledge/flashcards/discrete-math/inbox.md",
    "wiki/knowledge/flashcards/discrete-math/inbox-link-x.md",
  ];
  expectProblems(lintTree(entries), []);
});

test("linkUsesSuffixResolution：只认 wiki/ 一级目录与库一级目录开头的写法", () => {
  const allowed = allowedLinkRoots([
    "wiki/",
    "wiki/knowledge/",
    "wiki/knowledge/concepts/",
    "wiki/shelf/",
    "wiki/courses/",
    "raw/",
    "clippings/",
  ]);
  assert.equal(linkUsesSuffixResolution("knowledge/concepts/discrete-math/010-variables", allowed), false);
  assert.equal(linkUsesSuffixResolution("shelf/epp", allowed), false);
  assert.equal(linkUsesSuffixResolution("raw/articles/x", allowed), false);
  assert.equal(linkUsesSuffixResolution("knowledge/concepts/x|变量", allowed), false);
  assert.equal(linkUsesSuffixResolution("knowledge/concepts/x#定义", allowed), false);
  // 后缀解析的写法：不带 wiki/ 一级目录，或只剩裸名。
  assert.equal(linkUsesSuffixResolution("concepts/discrete-math/010-variables", allowed), true);
  assert.equal(linkUsesSuffixResolution("discrete-math/010-variables", allowed), true);
  assert.equal(linkUsesSuffixResolution("010-variables", allowed), true);
  assert.equal(linkUsesSuffixResolution("knowledge\\concepts\\x", allowed), true);
  // 占位符与相对路径不算。
  assert.equal(linkUsesSuffixResolution("<concept-1>", { has: () => true }), false);
  assert.equal(linkUsesSuffixResolution("", allowed), false);
});

test("linkProblemsInText：报行号，且跳过代码块与行内代码", () => {
  const allowed = allowedLinkRoots(["wiki/knowledge/", "wiki/shelf/"]);
  const text = [
    "第一行 [[knowledge/concepts/a|A]]",
    "第二行 [[concepts/a]]",
    "```",
    "[[concepts/a]]",
    "```",
    "行内 `[[concepts/a]]` 不算",
    "[[shelf/epp]]",
  ].join("\n");
  assert.deepEqual(linkProblemsInText(text, allowed), [{ target: "concepts/a", line: 2 }]);
});

test("brokenLinksInText：能解析到文件的不报，解析不到的报断链（带行号，代码里的不算）", () => {
  const files = new Set([
    "wiki/index.md",
    "wiki/knowledge/concepts/discrete-math/010-variables.md",
    "wiki/knowledge/concepts/discrete-math/010-a.md",
    "raw/articles/pic.png",
  ]);
  const text = [
    "[[wiki/knowledge/concepts/discrete-math/010-variables]]", // 1 全路径存在
    "[[concepts/discrete-math/010-a]]", // 2 后缀解析，但文件存在
    "![[raw/articles/pic.png]]", // 3 嵌入式图片存在
    "[[concepts/discrete-math/999-not-there|断链]]", // 4 断链
    "```",
    "[[concepts/discrete-math/888-in-code]]", // 代码块里的不报
    "```",
    "行内 `[[concepts/discrete-math/777-inline]]` 不报",
    "[[010-variables#定义|显示文字]]", // 9 只取锚点前的 010-variables
    "[[999-nope#定义|显示文字]]", // 10 断链（带锚点与显示文字）
  ].join("\n");
  assert.deepEqual(brokenLinksInText(text, files), [
    { target: "concepts/discrete-math/999-not-there", line: 4 },
    { target: "999-nope", line: 10 },
  ]);
  // 空目标与 . 开头（相对路径之类）跳过。
  assert.deepEqual(brokenLinksInText("[[#锚点]]\n[[../x]]\n", files), []);
});

test("checkConceptFrontmatter：缺 frontmatter、缺 sources: 都报，sources: [] 算有", () => {
  assert.equal(checkConceptFrontmatter("# 无 frontmatter\n"), "概念页缺少 frontmatter（须以 --- 开头）");
  assert.equal(checkConceptFrontmatter(""), "概念页缺少 frontmatter（须以 --- 开头）");
  assert.equal(checkConceptFrontmatter("---\ntitle: x\n---\n\n# 页\n"), "概念页 frontmatter 缺少 sources:");
  assert.equal(checkConceptFrontmatter("---\nsources: []\n---\n\n# 页\n"), null);
  assert.equal(checkConceptFrontmatter("---\nsources:\n  - raw/books/epp.pdf\n---\n# 页\n"), null);
});

test("lintBrokenLinks / lintConceptFrontmatter：断链按查链接的文件范围报，frontmatter 只查概念页", async () => {
  const vault = await makeVault();
  try {
    await writeFileAt(vault, "wiki/index.md", "[[knowledge/concepts/x/010-a]]\n[[knowledge/concepts/x/010-z]]\n");
    await writeFileAt(vault, "wiki/knowledge/concepts/x/010-a.md", "---\nsources: []\n---\n\n# A\n");
    await writeFileAt(vault, "wiki/knowledge/concepts/x/010-b.md", "# B 缺 frontmatter\n");
    await writeFileAt(vault, "wiki/knowledge/concepts/x/010-c.md", "---\ntitle: C\n---\n\n# C 缺 sources\n");
    await writeFileAt(vault, "wiki/knowledge/shelf/epp.md", "# 不是概念页\n");
    await writeFileAt(vault, "raw/notes.md", "[[nowhere]]\n");
    const entries = await collectEntries(vault);
    assert.deepEqual(await lintBrokenLinks(vault, entries), [
      {
        kind: "broken-link",
        path: "wiki/index.md",
        detail: "断链：[[knowledge/concepts/x/010-z]]（第 2 行）",
      },
    ]);
    assert.deepEqual(await lintConceptFrontmatter(vault, entries), [
      {
        kind: "frontmatter",
        path: "wiki/knowledge/concepts/x/010-b.md",
        detail: "概念页缺少 frontmatter（须以 --- 开头）",
      },
      {
        kind: "frontmatter",
        path: "wiki/knowledge/concepts/x/010-c.md",
        detail: "概念页 frontmatter 缺少 sources:",
      },
    ]);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("lintLinks：规则文档（AGENTS.md、README.md、wiki/prompts/）的占位链接豁免", async () => {
  const vault = await makeVault();
  const entries = [
    "wiki/",
    "AGENTS.md",
    "README.md",
    "wiki/README.md",
    "wiki/prompts/",
    "wiki/prompts/card-rules.md",
    "wiki/shelf/",
    "wiki/shelf/epp.md",
    "wiki/index.md",
  ];
  const placeholder = "示例：[[concepts/math/010-x]]、[[other-entity]]、[[courses/course-slug]]\n";
  await writeFileAt(vault, "AGENTS.md", placeholder);
  await writeFileAt(vault, "README.md", placeholder);
  await writeFileAt(vault, "wiki/README.md", placeholder);
  await writeFileAt(vault, "wiki/prompts/card-rules.md", placeholder);
  await writeFileAt(vault, "wiki/index.md", "[[shelf/epp]]\n");
  try {
    assert.equal(isLinkExemptPath("AGENTS.md"), true);
    assert.equal(isLinkExemptPath("README.md"), true);
    assert.equal(isLinkExemptPath("wiki/README.md"), true);
    assert.equal(isLinkExemptPath("wiki/prompts/card-rules.md"), true);
    assert.equal(isLinkExemptPath("wiki/index.md"), false);
    const problems = await lintLinks(vault, entries, allowedLinkRoots(entries));
    assert.deepEqual(problems, []);
    // 同样的链接写进普通页面就要报。
    await writeFileAt(vault, "wiki/index.md", placeholder);
    const reported = await lintLinks(vault, entries, allowedLinkRoots(entries));
    assert.equal(reported.length, 3);
    assert.ok(reported.every((item) => item.kind === "link" && item.path === "wiki/index.md"));
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("退出码：无问题的库 exit 0，有问题的库 exit 1 且 --json 给出 problems", async () => {
  const clean = await makeVault();
  try {
    await writeFileAt(clean, "wiki/index.md", "# 索引\n\n[[knowledge/concepts/discrete-math/010-variables|变量]]\n");
    await writeFileAt(clean, "wiki/knowledge/concepts/discrete-math/010-variables.md", "---\nsources: []\n---\n\n# 变量\n");
    await writeFileAt(
      clean,
      "wiki/knowledge/flashcards/discrete-math/010-variables.md",
      "TARGET DECK\n离散数学::Epp\n",
    );
    await writeFileAt(clean, "wiki/_generated/courses.md", "<!-- xuegen:courses-dashboard -->\n");
    await writeFileAt(clean, "AGENTS.md", "占位：[[concept-1]]、[[courses/course-slug]]\n");
    const ok = await lint([clean, "--json"]);
    assert.equal(ok.code, 0, ok.stderr);
    assert.deepEqual(JSON.parse(ok.stdout), { problems: [] });
    const human = await lint([clean]);
    assert.equal(human.code, 0, human.stderr);
    assert.match(human.stdout, /vault-lint: OK/);

    const bad = await makeVault();
    try {
      await writeFileAt(bad, "wiki/index.md", "[[concepts/discrete-math/010-variables|变量]]\n");
      await writeFileAt(bad, "wiki/Bad Dir/concepts/discrete-math/010-variables.md", "# 变量\n");
      const failed = await lint([bad, "--json"]);
      assert.equal(failed.code, 1);
      const parsed = JSON.parse(failed.stdout);
      const kinds = parsed.problems.map((item) => item.kind);
      assert.ok(kinds.includes("link"), JSON.stringify(parsed.problems));
      assert.ok(kinds.includes("name"), JSON.stringify(parsed.problems));
      const text = await lint([bad]);
      assert.equal(text.code, 1);
      assert.match(text.stdout, /wiki\/Bad Dir\/: \[name\]/);
      assert.match(text.stdout, /wiki\/index\.md: \[link\]/);
    } finally {
      await rm(bad, { recursive: true, force: true });
    }
  } finally {
    await rm(clean, { recursive: true, force: true });
  }
});

test("collectEntries：跳过 . 开头的目录，目录以 / 结尾", async () => {
  const vault = await makeVault();
  try {
    await writeFileAt(vault, "wiki/index.md", "# 索引\n");
    await writeFileAt(vault, ".obsidian/app.json", "{}\n");
    await writeFileAt(vault, "raw/books/epp.pdf", "pdf\n");
    const entries = await collectEntries(vault);
    assert.deepEqual(
      entries.sort(),
      ["raw/", "raw/books/", "raw/books/epp.pdf", "wiki/", "wiki/index.md"].sort(),
    );
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("CLI：库不存在时 exit 1 并写明原因", async () => {
  const result = await lint([join(tmpdir(), "vault-lint-missing-does-not-exist")]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /库不存在/);
});

test("allowedLinkRoots：wiki/ 顶层页面名（去 .md）也算合法根，[[index]] 等不误报", () => {
  const entries = [
    "wiki/",
    "wiki/index.md",
    "wiki/subjects.md",
    "wiki/log.md",
    "wiki/profile.md",
    "wiki/knowledge/",
    "wiki/knowledge/concepts/",
    "wiki/knowledge/concepts/x/010-a.md",
  ];
  const allowed = allowedLinkRoots(entries);
  for (const name of ["index", "subjects", "log", "profile"]) {
    assert.equal(linkUsesSuffixResolution(name, allowed), false, `${name} 是完整路径`);
  }
  // 目录里的页面仍然要走完整路径（后缀解析要报）。
  assert.equal(linkUsesSuffixResolution("concepts/x/010-a", allowed), true);
  assert.equal(linkUsesSuffixResolution("010-a", allowed), true);

  const text = ["[[index]]", "[[subjects]]", "[[log|日志]]", "![[profile]]", "[[010-a]]"].join("\n");
  assert.deepEqual(linkProblemsInText(text, allowed), [{ target: "010-a", line: 5 }]);
});

test("lintLinks：wiki/ 顶层文件的短链接不报，目录里的短链接照报", async () => {
  const vault = await makeVault();
  try {
    await writeFileAt(vault, "wiki/index.md", "[[subjects]]、[[log]]、[[profile]]\n");
    await writeFileAt(vault, "wiki/subjects.md", "# 科目\n");
    await writeFileAt(vault, "wiki/log.md", "# 日志\n");
    await writeFileAt(vault, "wiki/profile.md", "# 画像\n");
    await writeFileAt(vault, "wiki/knowledge/concepts/x/010-a.md", "[[010-b]]\n");
    await writeFileAt(vault, "wiki/knowledge/concepts/x/010-b.md", "# B\n");
    const entries = await collectEntries(vault);
    const problems = await lintLinks(vault, entries, allowedLinkRoots(entries));
    assert.deepEqual(problems, [
      {
        kind: "link",
        path: "wiki/knowledge/concepts/x/010-a.md",
        detail: "链接走了后缀解析：[[010-b]]（第 1 行）",
      },
    ]);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("经符号链接调用 --help 有输出（主模块判定比真实路径）", async () => {
  // ~/.xuegen/app 这类符号链接下，argv[1] 与 import.meta.url 字面不同；只比字面会静默 exit 0。
  const dir = await mkdtemp(join(tmpdir(), "vault-lint-link-"));
  try {
    const link = join(dir, "app");
    await symlink(HERE, link, "dir");
    const { stdout } = await run("node", [join(link, "vault-lint.mjs"), "--help"], { encoding: "utf8" });
    assert.match(stdout, /库命名检查（vault-lint）/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
