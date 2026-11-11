#!/usr/bin/env node
// vault-lint.mjs 端到端测试（全量测试 B7）：node:test + node:assert，无第三方依赖。
// 一律在 mkdtemp 临时目录里造库；需要真实库副本的用例先 cp -R 到临时目录再跑，
// 绝不写 /tmp/xg-e2e/vault/GJY 本身。库副本用例只断言不变量（不写死问题条数）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "vault-lint.mjs");
// 需要库副本的机器才有；没有就跳过相关用例（可用 XUEGEN_VAULT_COPY 覆盖）。
const VAULT_COPY = process.env.XUEGEN_VAULT_COPY ?? "/tmp/xg-e2e/vault/GJY";
// 真实库里带着深层 .gitkeep 的那棵原料子树：0.9.0 修掉的正是这里的误报。
const GITKEEP_SUBTREE = "raw/library/ai-ml/合成数据相关/sdg_hub-main";

// ---------------------------------------------------------------- 辅助

async function makeVault() {
  const dir = await mkdtemp(join(tmpdir(), "vault-lint-full-"));
  await mkdir(join(dir, "wiki"), { recursive: true });
  return dir;
}

async function writeAt(vault, rel, text) {
  const file = join(vault, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
  return file;
}

/** 跑 vault-lint；返回 { code, stdout, stderr, problems }（--json 能解析时带上 problems）。 */
async function lint(args) {
  try {
    const { stdout } = await run("node", [SCRIPT, ...args], { encoding: "utf8" });
    return { code: 0, stdout, stderr: "", problems: parseProblems(stdout) };
  } catch (error) {
    return { code: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "", problems: parseProblems(error.stdout ?? "") };
  }
}

function parseProblems(stdout) {
  try {
    return JSON.parse(stdout).problems;
  } catch {
    return null;
  }
}

/** 目录树里所有 .gitkeep 的相对路径（用 readdir 递归，不额外起进程）。 */
async function findGitkeeps(dir) {
  const found = [];
  for (const rel of await readdir(dir, { recursive: true })) {
    if (rel.split(/[\\/]/).pop() === ".gitkeep") found.push(rel);
  }
  return found;
}

// ---------------------------------------------------------------- 1. 真实库副本冒烟

test(
  "库副本复制后 --json：问题清单原样报告，raw/ 深层 .gitkeep 与更深的空目录不报",
  { skip: existsSync(join(VAULT_COPY, GITKEEP_SUBTREE)) ? false : `${join(VAULT_COPY, GITKEEP_SUBTREE)} 不存在（需要有库副本的机器）` },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "vault-lint-vault-"));
    try {
      // 先复制再跑：绝不写库副本本身。只复制 lint 真正读的东西（wiki/、根 .md、带
      // .gitkeep 的那棵 raw 子树）；raw/ 其余 700MB 是 PDF，复制它只会把测试拖慢。
      const copy = join(dir, "GJY");
      await mkdir(copy, { recursive: true });
      await run("cp", ["-R", join(VAULT_COPY, "wiki"), join(copy, "wiki")]);
      for (const name of await readdir(VAULT_COPY)) {
        if (name.endsWith(".md")) await run("cp", [join(VAULT_COPY, name), join(copy, name)]);
      }
      const subtreeTarget = join(copy, "raw", "library", "ai-ml", "合成数据相关");
      await mkdir(subtreeTarget, { recursive: true });
      await run("cp", ["-R", join(VAULT_COPY, GITKEEP_SUBTREE), subtreeTarget]);
      await run("chmod", ["-R", "u+w", copy]);

      const gitkeeps = await findGitkeeps(copy);
      assert.ok(gitkeeps.length >= 1, `副本里应至少有深层 .gitkeep 可查（实际 ${gitkeeps.length}）`);

      const result = await lint([copy, "--json"]);
      assert.notEqual(result.problems, null, `--json 输出应能解析：${result.stdout}${result.stderr}`);
      // 问题清单原样进报告（不写死条数：库会变，只记现状）。
      t.diagnostic(`库副本 vault-lint 问题（${result.problems.length} 条）：${JSON.stringify(result.problems, null, 2)}`);

      // 不变量 1：raw/ 深层 .gitkeep 目录不再误报（0.9.0 的修复）。
      const gitkeepProblems = result.problems.filter((item) => gitkeepProblem(item, gitkeeps));
      assert.deepEqual(gitkeepProblems, [], `深层 .gitkeep 被误报：${JSON.stringify(gitkeepProblems, null, 2)}`);

      // 不变量 2：raw/ 上的问题只能出在第一、二层分区目录（raw/<d>/、raw/<d>/<d>/）。
      const deepRaw = result.problems.filter((item) => {
        const parts = item.path.replace(/\/$/, "").split("/");
        return parts[0] === "raw" && parts.length > 3;
      });
      assert.deepEqual(deepRaw, [], `raw/ 第二层以下不应报问题：${JSON.stringify(deepRaw, null, 2)}`);

      // 退出码与问题数一致。
      assert.equal(result.code, result.problems.length === 0 ? 0 : 1, `退出码应与问题数一致：${result.stdout}`);
    } finally {
      await run("chmod", ["-R", "u+w", dir]).catch(() => {});
      await rm(dir, { recursive: true, force: true });
    }
  },
);

/** 这条问题是不是冲着某个深层 .gitkeep（或它所在目录）来的。 */
function gitkeepProblem(problem, gitkeeps) {
  const path = problem.path.replace(/\/$/, "");
  return gitkeeps.some((rel) => {
    const normalized = rel.split(/[\\/]/).join("/");
    const owner = normalized.slice(0, normalized.length - ".gitkeep".length - 1); // 去掉 /.gitkeep
    return path === `raw/${owner}` || path === `raw/${normalized}` || path.includes(owner);
  });
}

// ---------------------------------------------------------------- 2. raw/ 空目录的边界（不依赖库副本）

test("raw/ 分区：深层空目录与 .gitkeep 目录不报，第一二层分区空目录照报", async () => {
  const vault = await makeVault();
  try {
    // 第一层分区 raw/library/ 与第二层分区 raw/books/epp/ 空着 → 报（4.2 不留空目录）。
    await mkdir(join(vault, "raw", "empty-partition"), { recursive: true });
    await mkdir(join(vault, "raw", "books", "epp"), { recursive: true });
    // 第二层以下：下载来的仓库结构，空的也照旧不报（0.9.0）。
    await mkdir(join(vault, "raw", "library", "ai-ml", "sdg-hub", "eval", "data"), { recursive: true });
    await writeAt(vault, "raw/library/ai-ml/sdg-hub/eval/data/.gitkeep", "");
    await writeAt(vault, "wiki/index.md", "# 索引\n");

    const result = await lint([vault, "--json"]);
    assert.equal(result.code, 1, `有问题的库应 exit 1：${result.stdout}${result.stderr}`);
    const paths = result.problems.map((item) => `${item.kind} ${item.path}`);
    assert.ok(paths.includes("empty-dir raw/empty-partition"), `raw/<d>/ 空目录要报：${JSON.stringify(paths)}`);
    assert.ok(paths.includes("empty-dir raw/books/epp"), `raw/<d>/<d>/ 空目录要报：${JSON.stringify(paths)}`);
    const deep = result.problems.filter((item) => item.path.startsWith("raw/library/ai-ml"));
    assert.deepEqual(deep, [], `raw/ 第三层以下不该报：${JSON.stringify(deep)}`);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- 3. 断链

test(
  "断链：指向不存在页面的 [[…]] 要报出来",
  async (t) => {
    const vault = await makeVault();
    try {
      await writeAt(
        vault,
        "wiki/index.md",
        ["# 索引", "", "- [[knowledge/concepts/discrete-math/010-variables|变量]]", "- [[knowledge/concepts/discrete-math/999-not-there|断链]]", ""].join("\n"),
      );
      await writeAt(vault, "wiki/knowledge/concepts/discrete-math/010-variables.md", "---\nsources: x\n---\n\n# 变量\n");

      const result = await lint([vault, "--json"]);
      t.diagnostic(`实际输出：code=${result.code} problems=${JSON.stringify(result.problems)}`);
      const broken = (result.problems ?? []).filter((item) => item.detail.includes("999-not-there"));
      assert.deepEqual(
        broken.map((item) => item.path),
        ["wiki/index.md"],
        `期望报出 wiki/index.md 的断链 999-not-there，实际：${JSON.stringify(result.problems)}`,
      );
    } finally {
      await rm(vault, { recursive: true, force: true });
    }
  },
);

// ---------------------------------------------------------------- 4. 缺 frontmatter 的知识页

test(
  "缺 frontmatter：知识页（概念页）没有 frontmatter 要报出来",
  async (t) => {
    const vault = await makeVault();
    try {
      // 编号齐全、卡片页同名对应齐全，只缺 frontmatter：现状什么问题都不报。
      await writeAt(vault, "wiki/knowledge/concepts/discrete-math/010-truth-table.md", "# 真值表\n\n正文。\n");
      await writeAt(vault, "wiki/knowledge/flashcards/discrete-math/010-truth-table.md", "TARGET DECK\n离散数学::Epp\n");
      await writeAt(vault, "wiki/index.md", "# 索引\n");

      const result = await lint([vault, "--json"]);
      t.diagnostic(`实际输出：code=${result.code} problems=${JSON.stringify(result.problems)}`);
      const frontmatterHit = (result.problems ?? []).filter((item) =>
        item.path.includes("010-truth-table") && /frontmatter/.test(item.detail),
      );
      assert.equal(
        frontmatterHit.length,
        1,
        `期望报出 010-truth-table.md 缺 frontmatter，实际：${JSON.stringify(result.problems)}`,
      );
    } finally {
      await rm(vault, { recursive: true, force: true });
    }
  },
);

// ---------------------------------------------------------------- 5. 同时有真问题时有问题的库仍全报

test("--json 与人类可读输出一致：真问题（名字不合规、后缀链接）都列出且 exit 1", async () => {
  const vault = await makeVault();
  try {
    await writeAt(vault, "wiki/index.md", "[[concepts/discrete-math/010-variables|后缀写法]]\n");
    await writeAt(vault, "wiki/knowledge/concepts/discrete-math/010-variables.md", "---\nsources: x\n---\n\n# 变量\n");
    await writeAt(vault, "wiki/Bad Dir/note.md", "# 名字不合规\n");

    const json = await lint([vault, "--json"]);
    assert.equal(json.code, 1);
    const kinds = json.problems.map((item) => item.kind);
    assert.ok(kinds.includes("name"), JSON.stringify(json.problems));
    assert.ok(kinds.includes("link"), JSON.stringify(json.problems));

    const human = await lint([vault]);
    assert.equal(human.code, 1);
    assert.match(human.stdout, /\[name\]/);
    assert.match(human.stdout, /\[link\]/);
    assert.equal(`${json.problems.length}`, human.stdout.match(/vault-lint: (\d+) 个问题/)[1]);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});
