#!/usr/bin/env node
// feature-steps.mjs 的测试：node:test + node:assert，无第三方依赖。
// 抽取用内联文本；--write 与 lint 集成在 os.tmpdir() 下搭临时仓库，不碰真实 SKILL.md。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  extractSteps,
  stepTitle,
  collectFlows,
  flowsToJson,
  flowsToMarkdown,
  markedSection,
  updateWikiText,
  writeFeatureSteps,
  MARK_START,
  MARK_END,
  WIKI_PATH,
} from "./feature-steps.mjs";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "feature-steps.mjs");
const LINT = join(HERE, "lint-skills.mjs");

const F = { file: "f.md", heading: "## 流程" };

test("抽取：行首加粗取粗体文字（含嵌套反引号），行号是步骤所在行", () => {
  const text = "# t\n\n## 流程\n\n1. **先做甲**：细节。\n2. **再做乙（含 `x`）**：细节。\n";
  const { headingLine, steps } = extractSteps(text, F);
  assert.equal(headingLine, 3);
  assert.deepEqual(steps, [
    { n: 1, title: "先做甲", line: 5 },
    { n: 2, title: "再做乙（含 `x`）", line: 6 },
  ]);
});

test("抽取：无加粗取第一个 。：， 之前、最多 16 个字", () => {
  assert.equal(stepTitle("保留旧计划：已完成的课次不动。"), "保留旧计划");
  assert.equal(stepTitle("前面，切断"), "前面");
  assert.equal(stepTitle("没有标点的一整行"), "没有标点的一整行");
  assert.equal(stepTitle("一二三四五六七八九十一二三四五六七八九十一二三，停"), "一二三四五六七八九十一二三四五六");
});

test("抽取：缩进行、子列表、代码围栏里的编号不算；0 起合法", () => {
  const text = [
    "## 流程",
    "",
    "0. **第零步**：甲。",
    "   1. 缩进的编号不算",
    "  - 2. 子列表不算",
    "1. 第一步：乙。",
    "",
    "```",
    "9. 围栏里的编号不算",
    "```",
  ].join("\n");
  const { steps } = extractSteps(text, F);
  assert.deepEqual(steps.map((s) => s.n), [0, 1]);
});

test("抽取：范围只到下一个同级或更高级标题", () => {
  const text = "## 流程\n\n### 简报\n\n1. 甲。\n2. 乙。\n\n### 下一节\n\n1. 别处的编号。\n\n## 再下一节\n1. 也不算。\n";
  const { headingLine, steps } = extractSteps(text, { file: "f.md", heading: "### 简报" });
  assert.equal(headingLine, 3);
  assert.deepEqual(steps.map((s) => s.n), [1, 2]);
});

test("抽取：编号断档报错，指出文件与标题", () => {
  assert.throws(
    () => extractSteps("## 流程\n\n1. 甲。\n2. 乙。\n4. 丁。\n", F),
    /f\.md「## 流程」：编号不连续/,
  );
  assert.throws(() => extractSteps("## 流程\n\n3. 甲。\n", F), /不是 0 或 1/);
  assert.throws(() => extractSteps("## 流程\n\n只有散文。\n", F), /没有抽到编号步骤/);
});

test("抽取：标题不存在报错，指出文件与标题", () => {
  assert.throws(
    () => extractSteps("# t\n\n## 别的\n\n1. 甲。\n", F),
    /f\.md：找不到标题「## 流程」/,
  );
});

// ---- 临时仓库：5 个流程的最小 fixture（编号各自连续）----

const COURSE_SKILL = `---
name: course
description: fixture 用课程技能
---

# 课程

## 开课顺序

1. **确认会话**：是今天的课。
2. 读课程页，整页一次。
   - 99. 缩进的编号不算。
3. 结尾步。

## 改计划（总控会话）

1. 只在总控会话里做。

## 收课：打勾与抵消

0. **先看有没有上过课**：没讲过就不收。
1. 重读课程页。
`;

const WEEKLY = `# 周核实（整合日）

1. **只对主项课**：辅助不核实。
2. 出题。
`;

const CYCLE_SKILL = `---
name: cycle-plan
description: fixture 用周期技能
---

# 周期

### 每日简报（打开总控、问「今天学什么」）

1. 运行 \`day --json\`。
2. 出简报。
`;

async function makeRepo({ wiki = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), "feature-steps-"));
  await mkdir(join(root, "skills/course/references"), { recursive: true });
  await mkdir(join(root, "skills/cycle-plan"), { recursive: true });
  await mkdir(join(root, "docs/platform"), { recursive: true });
  await writeFile(join(root, "skills/course/SKILL.md"), COURSE_SKILL, "utf8");
  await writeFile(join(root, "skills/course/references/weekly-check.md"), WEEKLY, "utf8");
  await writeFile(join(root, "skills/cycle-plan/SKILL.md"), CYCLE_SKILL, "utf8");
  if (wiki) await writeFile(join(root, WIKI_PATH), "# wiki\n\n## 1. course（5 行）\n", "utf8");
  return root;
}

async function runLint(skillsDir) {
  try {
    const { stdout } = await run("node", [LINT, skillsDir], { encoding: "utf8" });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

test("markdown：每流程一个 #### 名（file:标题行）加 N. 名（:行号）；json 形状符合约定", async () => {
  const root = await makeRepo();
  try {
    const flows = await collectFlows(root);
    const md = flowsToMarkdown(flows);
    assert.match(md, /^#### 开课（skills\/course\/SKILL\.md:8）\n1\. 确认会话（:10）/);
    assert.match(md, /\n\n#### 今日简报（skills\/cycle-plan\/SKILL\.md:8）\n1\. 运行 `day --json`（:10）/);
    const json = flowsToJson(flows);
    assert.equal(json["course.open"].name, "开课");
    assert.equal(json["course.open"].file, "skills/course/SKILL.md");
    assert.deepEqual(Object.keys(json["course.open"].steps[0]), ["n", "title", "line"]);
    assert.ok(!("headingLine" in json["course.open"]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("真实仓库 --json：5 个流程步数正确", async () => {
  const { stdout } = await run("node", [SCRIPT, "--json"], { encoding: "utf8" });
  const json = JSON.parse(stdout);
  assert.equal(json["course.open"].steps.length, 8);
  assert.equal(json["course.close"].steps.length, 11);
  assert.equal(json["course.replan"].steps.length, 5);
  assert.equal(json["course.weekly"].steps.length, 4);
  assert.equal(json["cycle.brief"].steps.length, 4);
});

test("--write：无标记时在「## 1. course」前插节；跑两次文件不变（幂等）", async () => {
  const root = await makeRepo();
  try {
    const wikiPath = join(root, WIKI_PATH);
    const first = await writeFeatureSteps(root);
    assert.equal(first.changed, true);
    const text1 = await readFile(wikiPath, "utf8");
    assert.match(text1, /## 固定流程步骤表（自动生成，勿手改）\n\n<!-- feature-steps:start -->\n#### 开课/);
    assert.match(text1, /<!-- feature-steps:end -->\n\n## 1\. course/);
    const second = await writeFeatureSteps(root);
    const text2 = await readFile(wikiPath, "utf8");
    assert.equal(second.changed, false);
    assert.equal(text2, text1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--write：标记之间内容过期就替换", async () => {
  const root = await makeRepo();
  try {
    const wikiPath = join(root, WIKI_PATH);
    await writeFile(wikiPath, `# wiki\n\n${MARK_START}\n旧内容\n${MARK_END}\n\n## 1. course（5 行）\n`, "utf8");
    await writeFeatureSteps(root);
    const next = await readFile(wikiPath, "utf8");
    assert.ok(!next.includes("旧内容"));
    assert.equal(markedSection(next), flowsToMarkdown(await collectFlows(root)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--write：标记与「## 1. course」都没有时报中文错误", async () => {
  const root = await makeRepo();
  try {
    await writeFile(join(root, WIKI_PATH), "# wiki\n\n## 别的\n", "utf8");
    await assert.rejects(() => writeFeatureSteps(root), /找不到「## 1\. course」标题/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lint：标记间内容与 SKILL.md 不一致时报 feature-steps 错误，一致时通过", async () => {
  const root = await makeRepo();
  try {
    await writeFeatureSteps(root);
    let res = await runLint(join(root, "skills"));
    assert.equal(res.code, 0, res.stdout + res.stderr);
    const wikiPath = join(root, WIKI_PATH);
    const wiki = await readFile(wikiPath, "utf8");
    await writeFile(wikiPath, wiki.replace("1. 确认会话", "1. 手动改过的"), "utf8");
    res = await runLint(join(root, "skills"));
    assert.equal(res.code, 1);
    assert.match(res.stdout, /feature-steps/);
    assert.match(res.stdout, /npm run feature-steps 更新 FEATURE-WIKI/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lint：FEATURE-WIKI 不存在就跳过 feature-steps", async () => {
  const root = await makeRepo({ wiki: false });
  try {
    const res = await runLint(join(root, "skills"));
    assert.equal(res.code, 0, res.stdout + res.stderr);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
