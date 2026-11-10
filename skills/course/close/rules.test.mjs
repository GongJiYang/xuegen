#!/usr/bin/env node
// close/rules.mjs 的测试：只测纯函数（不起子进程、不建 jj 库）。
// 用例与夹具从 course-close.test.mjs 原样剪切/复制，断言一字未改。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkAppendOnly,
  checkConceptPage,
  checkCoursePage,
  checkNoDeletedLines,
  isOwned,
  isSafeRelPath,
  ownedPrefixes,
  planCheck,
  stagingName,
  subjectOf,
} from "./rules.mjs";

// ---- 夹具 ----

const SCHEDULE = [
  "<!-- xuegen:schedule:start rest=sun -->",
  "| 天 | 日期 | 内容 | 材料 | 完成条件 |",
  "|---|---|---|---|---|",
  "| D1 | 2026-11-09（周一） | 第 1 课 | — | — |",
  "| D2 | 2026-11-10（周二） | 第 2 课 | — | — |",
  "| R1-D1 | 2026-11-10（周二） | 复习：第 1 课 | 笔记 / 检查题 | 不看笔记复述要点 |",
  "<!-- xuegen:schedule:end -->",
].join("\n");

const INDEX = "# 索引\n\n## Courses\n\n- [[courses/epp|离散数学]]\n";
const LOG = "# 学习日志\n\n## 2026-11-08\n\n- 读了 §1.1\n";

/** 一份合法课程页。record 为额外的 Learning Record 段落、subject 为 Relationships 行。 */
function coursePage({ record = "", subject = "- [[subjects/discrete-math|离散数学]]", tail = "" } = {}) {
  return [
    "<!-- xuegen:course-state -->",
    "",
    "# 离散数学（Epp）学习计划",
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
    "## Learning Record",
    "",
    "### 2026-11-09-01",
    "",
    "- 讲了 §1.1。",
    "- 完成：D1",
    record,
    tail,
    "## Relationships",
    "",
    subject,
    "",
  ].join("\n");
}

/** 收课时在课程页里追加一条记录（在 ## Relationships 前插入）。 */
function withCloseRecord(text, id = "D1") {
  return text.replace(
    "## Relationships",
    `### 2026-11-09-02\n\n- 收课：讲了第二节。\n- 完成：${id}\n\n## Relationships`,
  );
}

const CONCEPT = (subject = "discrete-math", name = "truth-table") =>
  `---\ntitle: 真值表\nsources:\n  - [[reading/epp|Epp]] §1.1\n---\n\n# 真值表\n\n定义。\n`;

// ══ 纯函数 ══

test("stagingName：本地时间，月日时分秒都补零", () => {
  assert.equal(stagingName("epp", new Date(2026, 0, 2, 3, 4, 5)), "epp-20260102-030405");
  assert.equal(stagingName("discrete-math-epp", new Date(2026, 10, 9, 23, 59, 59)), "discrete-math-epp-20261109-235959");
  assert.equal(stagingName("a", new Date(2026, 11, 31, 0, 0, 0)), "a-20261231-000000");
});

test("subjectOf：只取 Relationships 节里第一个 [[subjects/<s>]]", () => {
  assert.equal(subjectOf(coursePage()), "discrete-math");
  assert.equal(
    subjectOf(
      coursePage({ subject: "- 次要\n- [[subjects/linear-algebra|线代]]\n- [[subjects/other|x]]" }),
    ),
    "linear-algebra",
  );
  // 别的节里出现 subjects 链接不算。
  assert.equal(subjectOf(coursePage({ subject: "- 无" }).replace("## Today", "## Today\n\n- [[subjects/x]]")), null);
  assert.equal(subjectOf("# 没有 Relationships 的页面\n"), null);
  assert.equal(subjectOf("## Relationships\n\n- [[courses/epp]]\n"), null);
});

test("ownedPrefixes：无科目时不放概念/卡片目录，有科目时新旧两种布局都放", () => {
  const bare = ownedPrefixes("epp", null);
  assert.deepEqual(bare, [
    "wiki/courses/epp.md",
    "wiki/courses/epp/",
    "wiki/index.md",
    "wiki/log.md",
  ]);
  const full = ownedPrefixes("epp", "discrete-math");
  assert.ok(full.includes("wiki/knowledge/concepts/discrete-math/"));
  assert.ok(full.includes("wiki/knowledge/flashcards/discrete-math/"));
  assert.ok(full.includes("wiki/知识/concepts/"));
  assert.ok(full.includes("wiki/知识/flashcards/"));
});

test("isSafeRelPath：拒绝绝对路径、反斜杠、NUL、非规范形式、空串", () => {
  for (const bad of [
    "",
    "/etc/passwd",
    "C:/" + "Users/x",
    "wiki\\courses\\epp.md",
    "wiki/courses/epp.md\0.txt",
    "wiki//index.md",
    "wiki/./index.md",
    "wiki/courses/epp/../profile.md",
    "wiki/courses/../profile.md",
    "..",
    "../x.md",
    "./x.md",
    "wiki/courses/",
    ".",
  ]) {
    assert.equal(isSafeRelPath(bad), false, `应判为不安全：${JSON.stringify(bad)}`);
  }
  for (const good of ["wiki/index.md", "wiki/courses/epp.md", "wiki/courses/epp/records/2026-11.md"]) {
    assert.equal(isSafeRelPath(good), true, `应判为安全：${good}`);
  }
});

test("isOwned：本课路径通过，越界、大小写变体、别课、无科目时的概念页都拒绝", () => {
  assert.equal(isOwned("wiki/courses/epp.md", "epp", "discrete-math"), true);
  assert.equal(isOwned("wiki/courses/epp/records/2026-11.md", "epp", "discrete-math"), true);
  assert.equal(isOwned("wiki/index.md", "epp", "discrete-math"), true);
  assert.equal(isOwned("wiki/log.md", "epp", null), true);
  assert.equal(isOwned("wiki/knowledge/concepts/discrete-math/a.md", "epp", "discrete-math"), true);
  assert.equal(isOwned("wiki/knowledge/flashcards/discrete-math/a.md", "epp", "discrete-math"), true);
  assert.equal(isOwned("wiki/知识/concepts/math/a.md", "epp", "discrete-math"), true);
  // 越界与变体
  assert.equal(isOwned("wiki/courses/epp/../profile.md", "epp", "discrete-math"), false);
  assert.equal(isOwned("wiki/courses/../profile.md", "epp", "discrete-math"), false);
  assert.equal(isOwned("/wiki/courses/epp.md", "epp", "discrete-math"), false);
  assert.equal(isOwned("wiki/courses/EPP.md", "epp", "discrete-math"), false);
  assert.equal(isOwned("wiki/courses/epp.md.bak", "epp", "discrete-math"), false);
  assert.equal(isOwned("wiki/courses/epp2.md", "epp", "discrete-math"), false);
  assert.equal(isOwned("wiki/courses/epp-other/records/x.md", "epp", "discrete-math"), false);
  assert.equal(isOwned("wiki/profile.md", "epp", "discrete-math"), false);
  assert.equal(isOwned("raw/clip.md", "epp", "discrete-math"), false);
  // 科目取不到时，概念页不算本课
  assert.equal(isOwned("wiki/knowledge/concepts/discrete-math/a.md", "epp", null), false);
  assert.equal(isOwned("wiki/knowledge/concepts/other/a.md", "epp", "discrete-math"), false);
});

test("checkAppendOnly：纯追加通过，改动/删除报出第一处不同的行号", () => {
  assert.equal(checkAppendOnly("a\n", "a\nb\n"), null);
  assert.equal(checkAppendOnly("a\nb\n", "a\nb\n"), null);
  const reason = checkAppendOnly("a\nb\n", "a\nX\n");
  assert.match(reason, /不是纯追加/);
  assert.match(reason, /第 2 行/);
  assert.match(checkAppendOnly("a\nb\n", "a\n"), /第 2 行/);
});

test("checkNoDeletedLines：不删行通过，删行点名那条，空行不算", () => {
  assert.equal(checkNoDeletedLines("a\n\nb\n", "a\nb\nc\n"), null);
  assert.equal(checkNoDeletedLines("a\n", "a\n"), null);
  assert.equal(checkNoDeletedLines("a\nb\n", "a\n").includes("被删除或改动：b"), true);
  const reason = checkNoDeletedLines("a\nb\n", "a\n");
  assert.match(reason, /被删除或改动：b/);
  assert.equal(checkNoDeletedLines("a  \nb\n", "a\nb\n"), null, "行尾空白不算改动");
});

test("checkCoursePage：合法通过；缺标记、超 200 行、完成 id 不在排期、排期表坏掉都报", () => {
  assert.deepEqual(checkCoursePage(coursePage(), "epp"), []);
  assert.match(checkCoursePage(coursePage().replace("<!-- xuegen:course-state -->", "---\n---"), "epp").join("\n"), /标记/);
  const tooLong = `${coursePage()}\n${"## 附注\n\n".repeat(120)}`;
  assert.match(checkCoursePage(tooLong, "epp").join("\n"), /超过 200 行上限/);
  assert.match(checkCoursePage(withCloseRecord(coursePage(), "D9"), "epp").join("\n"), /不在排期表：D9/);
  const brokenSchedule = coursePage().replace("<!-- xuegen:schedule:end -->", "");
  assert.match(checkCoursePage(brokenSchedule, "epp").join("\n"), /排期表无法解析/);
});

test("checkConceptPage：要有 frontmatter 与 sources:", () => {
  assert.equal(checkConceptPage(CONCEPT()), null);
  assert.match(checkConceptPage("# 真值表\n"), /frontmatter/);
  assert.match(checkConceptPage("---\ntitle: x\n---\n"), /sources/);
});

test("planCheck：归属、符号链接、冲突、只追加、课程页、概念页、" + "变更清单一次算清", () => {
  const page = "wiki/courses/epp.md";
  const manifest = { slug: "epp", subject: "discrete-math", base: { [page]: "sha-page", "wiki/log.md": "sha-log" } };
  const current = new Map([
    [page, { sha: "sha-page", text: coursePage() }],
    ["wiki/log.md", { sha: "sha-log", text: LOG }],
  ]);
  const staged = [
    { path: page, sha: "sha-page", text: coursePage(), symlink: false },
    { path: "wiki/log.md", sha: "sha-log", text: LOG, symlink: false },
  ];
  const clean = planCheck(manifest, staged, current);
  assert.equal(clean.ok, true);
  assert.deepEqual(clean.problems, []);
  assert.deepEqual(clean.changes, [], "内容与库里相同的文件不算变更");

  // 归属：越界路径
  const foreign = planCheck(manifest, [...staged, { path: "wiki/courses/epp/../profile.md", sha: "x", text: null, symlink: false }], current);
  assert.equal(foreign.ok, false);
  assert.deepEqual(foreign.problems.map((p) => [p.path, p.kind]), [["wiki/courses/epp/../profile.md", "owner"]]);
  assert.ok(!foreign.changes.some((change) => change.path.includes("profile")));

  // 符号链接：不跟随，报 owner
  const link = planCheck(manifest, [{ path: "wiki/courses/epp/records/x.md", sha: null, text: null, symlink: true }], current);
  assert.deepEqual(link.problems.map((p) => p.kind), ["owner"]);
  assert.match(link.problems[0].detail, /符号链接/);

  // 冲突：库里基线已变；新文件已存在
  const changed = new Map(current);
  changed.set("wiki/log.md", { sha: "sha-other", text: LOG });
  changed.set("wiki/knowledge/concepts/discrete-math/new.md", { sha: "sha-x", text: "x" });
  const conflict = planCheck(
    manifest,
    [...staged, { path: "wiki/knowledge/concepts/discrete-math/new.md", sha: "sha-new", text: CONCEPT(), symlink: false }],
    changed,
  );
  assert.deepEqual(
    conflict.problems.map((p) => [p.path, p.kind]).sort(),
    [
      ["wiki/knowledge/concepts/discrete-math/new.md", "conflict"],
      ["wiki/log.md", "conflict"],
    ],
  );

  // 只追加 / 不删行 / 课程页 / 概念页
  const appended = new Map([
    [page, { sha: "sha-page", text: coursePage() }],
    ["wiki/log.md", { sha: "sha-log", text: LOG }],
    ["wiki/index.md", { sha: "sha-index", text: INDEX }],
  ]);
  const bad = planCheck(
    { ...manifest, base: { ...manifest.base, "wiki/index.md": "sha-index" } },
    [
      { path: "wiki/log.md", sha: "s1", text: `${LOG}- 追加\n`.replace("- 读了", "- 读了改"), symlink: false },
      { path: "wiki/index.md", sha: "s2", text: "# 索引\n", symlink: false },
      { path: page, sha: "s3", text: withCloseRecord(coursePage(), "D9"), symlink: false },
      { path: "wiki/knowledge/concepts/discrete-math/t.md", sha: "s4", text: "# 无 frontmatter\n", symlink: false },
    ],
    appended,
  );
  assert.deepEqual(
    bad.problems.map((p) => p.kind).sort(),
    ["append-only", "concept-page", "course-page", "deleted-lines"],
  );
  assert.deepEqual(
    bad.changes.map((change) => [change.path, change.action]).sort(),
    [
      ["wiki/courses/epp.md", "update"],
      ["wiki/index.md", "update"],
      ["wiki/knowledge/concepts/discrete-math/t.md", "create"],
      ["wiki/log.md", "update"],
    ],
  );
});
