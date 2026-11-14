#!/usr/bin/env node
// lint-wording.mjs 的测试：node:test + node:assert，无第三方依赖。
// 对真实仓库的那条只断言脚本能跑完并打印收尾行，不断言 0 处（现有问题由人按报告修）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  extractMarkdownVisibleText,
  extractVisibleText,
  findBanned,
  lintSource,
  normalizeRules,
} from "./lint-wording.mjs";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(HERE);
const SCRIPT = join(HERE, "lint-wording.mjs");

const RULES = normalizeRules({
  banned: [
    { word: "辅助", say: "带读" },
    { word: "核心页", say: "讲后读 · pp.… · 日期" },
    { word: "教材通读", say: "书房" },
    { word: "通读", say: "自读" },
    { word: "深度日", say: "主攻日" },
    { word: "书架", say: "书房" },
  ],
  allow: [],
});

// visible text → 命中的词（顺序与 findBanned 一致）
function words(text, rules = RULES) {
  return findBanned(text, rules).map((hit) => hit.word);
}

test("findBanned：命中一个词，带上行号与建议说法", () => {
  const hits = findBanned("第一行\n今天用辅助课", RULES);
  assert.deepEqual(hits, [{ line: 2, word: "辅助", say: "带读" }]);
});

test("findBanned：干净文字不命中", () => {
  assert.deepEqual(findBanned("讲后读 · pp.56–63 · 11-13", RULES), []);
  assert.deepEqual(findBanned("", RULES), []);
});

test("findBanned：同一行多个词都报，按出现位置排序", () => {
  const hits = findBanned("书架里的辅助课", RULES);
  assert.deepEqual(hits.map((hit) => hit.word), ["书架", "辅助"]);
  assert.ok(hits.every((hit) => hit.line === 1));
});

test("findBanned：深度不在表里不报，深度日报", () => {
  assert.deepEqual(words("讲解风格选深度"), []);
  assert.deepEqual(words("明天是深度日"), ["深度日"]);
});

test("findBanned：长词优先，教材通读不重复报通读", () => {
  assert.deepEqual(words("教材通读队列"), ["教材通读"]);
  assert.deepEqual(words("原书通读"), ["通读"]);
});

test("findBanned：同一行同一个词出现两次只算一处", () => {
  assert.deepEqual(words("辅助 与 辅助"), ["辅助"]);
});

test("findBanned：allow 里的文件放行该词，其他文件照报", () => {
  const rules = normalizeRules({
    banned: [{ word: "辅助", say: "带读" }],
    allow: [{ file: "apps/desktop/src/renderer/core/strings.ts", word: "辅助", why: "科目页原文" }],
  });
  assert.deepEqual(findBanned("辅助", rules, { file: "apps/desktop/src/renderer/core/strings.ts" }), []);
  assert.deepEqual(words("辅助", rules), ["辅助"]);
  assert.deepEqual(findBanned("辅助", rules, { file: "skills/x/y.mjs" }), [
    { line: 1, word: "辅助", say: "带读" },
  ]);
});

test("extractVisibleText：注释里的词不算，字符串里的算", () => {
  const text = extractVisibleText(
    [
      "// 辅助课在这里只是注释",
      "/* 书架也不该算 */",
      'const a = "今天的辅助课";',
    ].join("\n"),
    { jsx: false },
  );
  assert.ok(!text.includes("注释"));
  assert.deepEqual(findBanned(text, RULES).map((hit) => hit.line), [3]);
});

test("extractVisibleText：模板字面量里外都能取到，${} 里的代码不算", () => {
  const source = 'const a = `前${flag ? "辅助" : ""}后`;\nconst b = count;';
  const text = extractVisibleText(source, { jsx: false });
  assert.ok(text.includes("前"));
  assert.ok(text.includes("后"));
  assert.ok(text.includes("辅助"));
  assert.ok(text.includes("count") === false, "模板字面量外的代码不该算作可见文字");
});

test("extractVisibleText：嵌套模板字面量（模板里再套模板）", () => {
  const source = "const a = `外层${`内层书架`}完`;";
  const text = extractVisibleText(source, { jsx: false });
  assert.ok(text.includes("外层"));
  assert.ok(text.includes("内层书架"));
  assert.ok(text.includes("完"));
  assert.deepEqual(words(text), ["书架"]);
});

test("extractVisibleText：行号与源码一致（换行保留）", () => {
  const source = ['const a = 1;', "// 注释一行", 'const b = "核心页";'].join("\n");
  const text = extractVisibleText(source, { jsx: false });
  assert.equal(text.split("\n").length, source.split("\n").length);
  assert.deepEqual(findBanned(text, RULES).map((hit) => hit.line), [3]);
});

test("extractVisibleText：JSX 文本节点算用户可见（同一条检查字符串与文本）", () => {
  const source = [
    "export function Panel() {",
    "  // 辅助（注释，不算）",
    '  const label = "核心页";',
    "  return (",
    "    <p>辅助</p>",
    "  );",
    "}",
  ].join("\n");

  const tsx = extractVisibleText(source, { jsx: true });
  assert.deepEqual(findBanned(tsx, RULES), [
    { line: 3, word: "核心页", say: "讲后读 · pp.… · 日期" },
    { line: 5, word: "辅助", say: "带读" },
  ]);

  // .ts 不认 JSX 文本：`<p>辅助</p>` 在 .ts 里只是比较运算的样子。
  const ts = extractVisibleText(source, { jsx: false });
  assert.deepEqual(findBanned(ts, RULES).map((hit) => hit.line), [3]);
});

test("extractVisibleText：JSX 注释（大括号里的注释）里的词不算", () => {
  const source = [
    "const x = (",
    "  <p>",
    "    {/* 辅助课还在做 */}",
    "    书架",
    "  </p>",
    ");",
  ].join("\n");
  const text = extractVisibleText(source, { jsx: true });
  assert.ok(!text.includes("辅助课还在做"));
  assert.deepEqual(words(text), ["书架"]);
});

test("extractVisibleText：JSX 文本里的 {表达式} 里的字符串也算", () => {
  const source = 'const x = (<p>{flag ? "书架" : ""}还没放到书房</p>);';
  const text = extractVisibleText(source, { jsx: true });
  assert.deepEqual(words(text), ["书架"]);
  assert.ok(text.includes("还没放到书房"));
});

test("extractVisibleText：JSX 文本里的撇号不会吞掉后面的文字", () => {
  const source = "const x = (<p>don't 辅助 书架</p>);";
  const text = extractVisibleText(source, { jsx: true });
  assert.deepEqual(words(text), ["辅助", "书架"]);
});

test("extractMarkdownVisibleText：只看 ```text 块，散文不算", () => {
  const markdown = [
    "# 标题",
    "",
    "散文里提到辅助也不算，因为不是给用户看的句子。",
    "",
    "```text",
    "● 辅助 离散 D4",
    "```",
    "",
    "别的代码块不算：",
    "",
    "```js",
    'const s = "书架";',
    "```",
  ].join("\n");
  const text = extractMarkdownVisibleText(markdown);
  assert.deepEqual(findBanned(text, RULES).map((hit) => hit.line), [6]);
});

test("extractMarkdownVisibleText：「告诉用户 / 对用户说 / 回复 / 说一句」行的「」引号算", () => {
  const markdown = [
    "- 不要对用户说「核心页」。",
    "- 收课时回复一句「书架上的书读完了」。",
    "- 别的行说「辅助」但那一行没有触发词。",
  ].join("\n");
  const text = extractMarkdownVisibleText(markdown);
  assert.deepEqual(findBanned(text, RULES).map((hit) => hit.line), [1, 2]);
});

test("lintSource：按文件类型选提取方式，allow 生效", () => {
  const rules = normalizeRules({
    banned: [{ word: "辅助", say: "带读" }],
    allow: [{ file: "skills/demo/x.mjs", word: "辅助", why: "内部字段名" }],
  });
  assert.equal(lintSource("js", 'const a = "辅助";', rules, "skills/demo/x.mjs").length, 0);
  assert.equal(lintSource("js", 'const a = "辅助";', rules, "skills/demo/y.mjs").length, 1);
  assert.equal(lintSource("jsx", "const a = <p>辅助</p>;", rules, "a.tsx").length, 1);
});

test("normalizeRules：缺字段当空数组，坏条目丢掉", () => {
  assert.deepEqual(normalizeRules({}), { banned: [], allow: [] });
  const rules = normalizeRules({ banned: [{ word: "" }, { say: "x" }, { word: "书架", say: "书房" }] });
  assert.deepEqual(rules.banned, [{ word: "书架", say: "书房" }]);
});

test("改名三词：临时仓库里讲后读 / 带读 / 主项课被报出，allow 里的文件不报", async () => {
  // 词表与 allow 都写在临时目录里，不依赖真实仓库当前是否已经改干净。
  const root = await mkdtemp(join(tmpdir(), "lint-wording-rename-"));
  try {
    await mkdir(join(root, "apps/desktop/src/renderer"), { recursive: true });
    await mkdir(join(root, "apps/desktop/src/renderer/core"), { recursive: true });
    await writeFile(
      join(root, "apps/desktop/src/renderer/x.ts"),
      [
        'const a = "课后读还没读";',
        'const b = "讲后读 · pp.1–5 · 11-13";',
        'const c = "带读 C 语言";',
        'const d = "这是 C1 主项课";',
      ].join("\n"),
      "utf8",
    );
    // 数据格式：课程页那行的标题常量，用 allow 放行。
    await writeFile(
      join(root, "apps/desktop/src/renderer/core/allowed.ts"),
      'export const PREFIX = "讲后读 · ";\nexport const MARK = "#讲后读-";\n',
      "utf8",
    );
    const rulesPath = join(root, "rules.json");
    await writeFile(
      rulesPath,
      JSON.stringify({
        banned: [
          { word: "讲后读", say: "课后读" },
          { word: "带读", say: "导读课" },
          { word: "主项课", say: "主课" },
        ],
        allow: [
          { file: "apps/desktop/src/renderer/core/allowed.ts", word: "讲后读", why: "数据格式：课程页行前缀" },
        ],
      }),
      "utf8",
    );

    let code = 0;
    let stdout = "";
    try {
      ({ stdout } = await run("node", [SCRIPT, "--root", root, "--rules", rulesPath], {
        encoding: "utf8",
      }));
    } catch (error) {
      code = error.code ?? 1;
      stdout = error.stdout ?? "";
    }

    // 第 1 行是干净的新说法，不报；2/3/4 行各一处。
    assert.match(stdout, /apps\/desktop\/src\/renderer\/x\.ts:2 {2}「讲后读」→ 用「课后读」/);
    assert.match(stdout, /apps\/desktop\/src\/renderer\/x\.ts:3 {2}「带读」→ 用「导读课」/);
    assert.match(stdout, /apps\/desktop\/src\/renderer\/x\.ts:4 {2}「主项课」→ 用「主课」/);
    assert.doesNotMatch(stdout, /x\.ts:1 /);
    assert.doesNotMatch(stdout, /allowed\.ts/, "allow 里的文件不该报");
    assert.match(stdout, /^lint-wording: 3 处$/m);
    assert.equal(code, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("真实仓库：脚本能跑完并打印 lint-wording 收尾行（不断言 0 处）", async () => {
  let code = 0;
  let stdout = "";
  try {
    ({ stdout } = await run("node", [SCRIPT], { encoding: "utf8", cwd: REPO, maxBuffer: 8 * 1024 * 1024 }));
  } catch (error) {
    code = error.code ?? 1;
    stdout = error.stdout ?? "";
  }
  assert.match(stdout, /^lint-wording: \d+ 处$/m, "收尾行必须打印处数");
  assert.ok(code === 0 || code === 1, `退出码只应是 0（无命中）或 1（有命中），实际 ${code}`);
});

// 技能对用户说的话要用新名字（主项课→主课、带读→导读课、讲后读→课后读）；
// 数据格式行（`- [ ] 讲后读 …`、`## 讲后读已读`、周模板「辅助」列）不在此列，
// 所以只查 extractMarkdownVisibleText 取出的、真正说给用户听的那部分。
test("真实仓库：skills/course/SKILL.md 对用户说的话不再用旧名字", async () => {
  const source = await readFile(join(REPO, "skills", "course", "SKILL.md"), "utf8");
  const visible = extractMarkdownVisibleText(source);
  const rules = normalizeRules({
    banned: [{ word: "讲后读" }, { word: "带读" }, { word: "主项课" }],
    allow: [],
  });
  const hits = findBanned(visible, rules);
  assert.deepEqual(
    hits,
    [],
    `对用户说的旧词（讲后读 / 带读 / 主项课）应改成课后读 / 导读课 / 主课：${JSON.stringify(hits)}`,
  );
});

// 用户 2026-11-14 定：开课只讲课，不核验课后读读没读。
test("真实仓库：skills/course/SKILL.md 开课不再问课后读读了没有", async () => {
  const source = await readFile(join(REPO, "skills", "course", "SKILL.md"), "utf8");
  assert.equal(source.includes("读了没有"), false, "开课不再核验课后读，不该再出现「读了没有」");
});

test("真实仓库：--json 输出与文本输出处数一致", async () => {
  const text = await run("node", [SCRIPT], { encoding: "utf8", cwd: REPO }).catch((error) => ({
    stdout: error.stdout ?? "",
  }));
  const json = await run("node", [SCRIPT, "--json"], { encoding: "utf8", cwd: REPO }).catch((error) => ({
    stdout: error.stdout ?? "",
  }));
  const total = Number(/lint-wording: (\d+) 处/.exec(text.stdout)?.[1]);
  const payload = JSON.parse(json.stdout);
  assert.equal(payload.total, total);
  assert.equal(typeof payload.files, "object");
});
