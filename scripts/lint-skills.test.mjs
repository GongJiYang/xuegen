#!/usr/bin/env node
// lint-skills.mjs 的测试：node:test + node:assert，无第三方依赖。
// 每个用例在 os.tmpdir() 下的临时目录构造 skill，不触碰真实仓库。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "lint-skills.mjs");

async function makeSkills() {
  return mkdtemp(join(tmpdir(), "lint-skills-"));
}

// 写一个 skill 目录：name 为目录名，body 为正文，extra 可覆盖 frontmatter 字段。
async function writeSkill(root, name, { body = "# Title\n\nBody.\n", frontmatter, files = {} } = {}) {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  const fm = frontmatter ?? [`name: ${name}`, "description: 做一件事；当用户需要时使用。"].join("\n");
  await writeFile(join(dir, "SKILL.md"), `---\n${fm}\n---\n\n${body}`, "utf8");
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, "utf8");
  }
  return dir;
}

async function lint(dir, { json = false } = {}) {
  const args = [SCRIPT, ...(json ? ["--json"] : []), dir];
  try {
    const { stdout } = await run("node", args, { encoding: "utf8" });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

test("合规 skill 通过：退出码 0、无错误", async () => {
  const root = await makeSkills();
  try {
    await writeSkill(root, "good");
    const { code, stdout } = await lint(root, { json: true });
    assert.equal(code, 0);
    const report = JSON.parse(stdout);
    assert.equal(report.errors.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("缺少 SKILL.md 报错", async () => {
  const root = await makeSkills();
  try {
    await mkdir(join(root, "empty"), { recursive: true });
    const { code, stdout } = await lint(root, { json: true });
    assert.equal(code, 1);
    assert.ok(JSON.parse(stdout).errors.some((e) => e.rule === "skill-md-exists"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("frontmatter 缺失或不可解析报错", async () => {
  const root = await makeSkills();
  try {
    const dir = join(root, "nofm");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SKILL.md"), "# 无 frontmatter\n\n正文。\n", "utf8");
    const { code, stdout } = await lint(root, { json: true });
    assert.equal(code, 1);
    assert.ok(JSON.parse(stdout).errors.some((e) => e.rule === "frontmatter"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("name 格式违规报错（大写、下划线、连续连字符、首尾连字符）", async () => {
  const root = await makeSkills();
  try {
    for (const bad of ["Bad_Name", "bad--name", "-bad", "bad-"]) {
      await writeSkill(root, bad);
    }
    const { code, stdout } = await lint(root, { json: true });
    assert.equal(code, 1);
    const errors = JSON.parse(stdout).errors.filter((e) => e.rule === "name-format");
    assert.equal(errors.length, 4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("name 超过 64 字符报错", async () => {
  const root = await makeSkills();
  try {
    const long = "a".repeat(65);
    await writeSkill(root, long);
    const { code, stdout } = await lint(root, { json: true });
    assert.equal(code, 1);
    assert.ok(JSON.parse(stdout).errors.some((e) => e.rule === "name-length"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("name 与目录名不一致报错", async () => {
  const root = await makeSkills();
  try {
    await writeSkill(root, "dir-name", {
      frontmatter: ["name: other-name", "description: 做一件事；当用户需要时使用。"].join("\n"),
    });
    const { code, stdout } = await lint(root, { json: true });
    assert.equal(code, 1);
    assert.ok(JSON.parse(stdout).errors.some((e) => e.rule === "name-matches-dir"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("description 缺失报错", async () => {
  const root = await makeSkills();
  try {
    await writeSkill(root, "nodesc", { frontmatter: "name: nodesc" });
    const { code, stdout } = await lint(root, { json: true });
    assert.equal(code, 1);
    assert.ok(JSON.parse(stdout).errors.some((e) => e.rule === "description-present"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("description 超 1024 字符报错", async () => {
  const root = await makeSkills();
  try {
    await writeSkill(root, "longdesc", {
      frontmatter: ["name: longdesc", `description: ${"字".repeat(1025)}`].join("\n"),
    });
    const { code, stdout } = await lint(root, { json: true });
    assert.equal(code, 1);
    assert.ok(JSON.parse(stdout).errors.some((e) => e.rule === "description-length"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("正文恰 500 行通过，501 行报错", async () => {
  const root = await makeSkills();
  try {
    const body500 = Array.from({ length: 500 }, (_, i) => `行 ${i + 1}`).join("\n");
    const body501 = Array.from({ length: 501 }, (_, i) => `行 ${i + 1}`).join("\n");
    await writeSkill(root, "ok500", { body: body500 });
    await writeSkill(root, "bad501", { body: body501 });
    const { code, stdout } = await lint(root, { json: true });
    assert.equal(code, 1);
    const report = JSON.parse(stdout);
    assert.ok(!report.errors.some((e) => e.skill === "ok500" && e.rule === "body-lines"));
    assert.ok(report.errors.some((e) => e.skill === "bad501" && e.rule === "body-lines"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("个人绝对路径在 SKILL.md 与脚本中报错，占位符例外", async () => {
  const root = await makeSkills();
  try {
    await writeSkill(root, "leak", {
      body: "路径：/Users/alice/vault\n",
      files: { "tool.mjs": "// /home/bob/x\n" },
    });
    await writeSkill(root, "placeholder", {
      body: "路径：`<库根目录绝对路径>/wiki`\n",
      files: { "tool.mjs": "// <技能实际目录>/x\n", "tool.test.mjs": "// test\n" },
    });
    const { code, stdout } = await lint(root, { json: true });
    assert.equal(code, 1);
    const errors = JSON.parse(stdout).errors.filter((e) => e.rule === "personal-path");
    assert.equal(errors.filter((e) => e.skill === "leak").length, 2);
    assert.equal(errors.filter((e) => e.skill === "placeholder").length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Windows 个人路径 C:\\Users\\ 报错", async () => {
  const root = await makeSkills();
  try {
    await writeSkill(root, "win", { body: "路径：C:\\Users\\alice\\vault\n" });
    const { code, stdout } = await lint(root, { json: true });
    assert.equal(code, 1);
    assert.ok(JSON.parse(stdout).errors.some((e) => e.rule === "personal-path"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("脚本缺同名测试只报警告，退出码仍为 0", async () => {
  const root = await makeSkills();
  try {
    await writeSkill(root, "solo", { files: { "tool.mjs": "// no test\n" } });
    await writeSkill(root, "paired", { files: { "tool.mjs": "// ok\n", "tool.test.mjs": "// test\n" } });
    const { code, stdout } = await lint(root, { json: true });
    assert.equal(code, 0);
    const report = JSON.parse(stdout);
    assert.equal(report.errors.length, 0);
    assert.ok(report.warnings.some((w) => w.skill === "solo" && w.rule === "script-has-test"));
    assert.ok(!report.warnings.some((w) => w.skill === "paired"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("非 --json 输出逐条问题与汇总", async () => {
  const root = await makeSkills();
  try {
    await writeSkill(root, "bad501", { body: Array.from({ length: 501 }, () => "x").join("\n") });
    const { code, stdout } = await lint(root);
    assert.equal(code, 1);
    assert.match(stdout, /\[错误\]/);
    assert.match(stdout, /1 个错误/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("技能脚本主模块判定未用 realpathSync 报错（经符号链接调用会静默不执行）", async () => {
  const root = await makeSkills();
  try {
    // 反例：字面比较 argv[1] 与 import.meta.url。
    await writeSkill(root, "bad", {
      files: {
        "tool.mjs":
          'if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {\n  main();\n}\n',
        "tool.test.mjs": "// test\n",
      },
    });
    // 反例：比 url 但没过 realpathSync。
    await writeSkill(root, "bad-url", {
      files: {
        "tool.mjs": 'if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {\n  main();\n}\n',
        "tool.test.mjs": "// test\n",
      },
    });
    // 正例：两边都取真实路径。
    await writeSkill(root, "good", {
      files: {
        "tool.mjs":
          'function isMain() {\n  try {\n    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");\n  } catch {\n    return false;\n  }\n}\n',
        "tool.test.mjs": "// test\n",
      },
    });
    const { code, stdout } = await lint(root, { json: true });
    assert.equal(code, 1);
    const report = JSON.parse(stdout);
    const errors = report.errors.filter((e) => e.rule === "script-main-check");
    assert.equal(errors.filter((e) => e.skill === "bad").length, 1, JSON.stringify(errors));
    assert.equal(errors.filter((e) => e.skill === "bad-url").length, 1, JSON.stringify(errors));
    assert.equal(errors.filter((e) => e.skill === "good").length, 0, JSON.stringify(errors));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("realpathSync 比较的脚本经符号链接调用仍能进入 CLI", async () => {
  // 防回归：仓库里的脚本必须能在 ~/.xuegen/app 这类符号链接下正常执行。
  const root = await makeSkills();
  try {
    const skillDir = join(root, "linked");
    await mkdir(skillDir, { recursive: true });
    await writeSkill(root, "linked", {
      files: {
        "tool.mjs": [
          'import { realpathSync } from "node:fs";',
          'import { fileURLToPath } from "node:url";',
          "function isMain() {",
          "  try {",
          '    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");',
          "  } catch {",
          "    return false;",
          "  }",
          "}",
          'if (isMain()) process.stdout.write("用法说明\\n");',
          "",
        ].join("\n"),
        "tool.test.mjs": "// test\n",
      },
    });
    const link = join(root, "app");
    await symlink(skillDir, link, "dir");
    const { stdout } = await run("node", [join(link, "tool.mjs")], { encoding: "utf8" });
    assert.match(stdout, /用法说明/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
