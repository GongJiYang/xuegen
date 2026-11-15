#!/usr/bin/env node
// shelf-after.mjs 的测试：node:test + node:assert，纯函数不进文件系统、不读时钟。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AFTER_HEADING,
  addAfterRead,
  afterReadPages,
  formatAfterRead,
  markAfterRead,
  parseAfterReads,
} from "./shelf-after.mjs";

// 一份带 `## 排期`（xuegen:shelf 标记）、`## 摘录`、`## 读书记录` 的书页正文；
// `## 课后读` 新节应插在排期之后、摘录之前。
const SAMPLE = [
  "# Epp",
  "",
  "## 分段",
  "1. Ch1 pp.1–36",
  "",
  "## 排期",
  "",
  "<!-- xuegen:shelf:start -->",
  "| 块 | 日期 | 读什么 |",
  "|---|---|---|",
  "| 1 | 2026-11-09 | Ch1 pp.1–9 |",
  "<!-- xuegen:shelf:end -->",
  "",
  "## 摘录",
  "",
  "## 读书记录",
  "",
];

// ---- parseAfterReads ----

test("parseAfterReads：没有 `## 课后读` 一节返回 []；空节也是 []", () => {
  assert.deepEqual(parseAfterReads(SAMPLE), []);
  assert.deepEqual(parseAfterReads([]), []);
  assert.deepEqual(parseAfterReads(["# T", "", "## 课后读", "", "## 摘录"]), []);
});

test("parseAfterReads：一未勾一已勾，字段拆对、index 从 1 起", () => {
  const body = [
    "# Epp",
    "",
    "## 课后读",
    "",
    "- [ ] §1.1–1.4 · pp.1–5、7–12、17–21、24–27、31 · discrete-math-epp · 2026-11-10",
    "- [x] §2.3 · pp.66–75 · discrete-math-epp · 2026-11-12 · 读于 2026-11-17",
    "",
    "## 读书记录",
  ];
  assert.deepEqual(parseAfterReads(body), [
    {
      index: 1,
      label: "§1.1–1.4",
      pages: "1–5、7–12、17–21、24–27、31",
      course: "discrete-math-epp",
      date: "2026-11-10",
      done: false,
      readOn: null,
    },
    {
      index: 2,
      label: "§2.3",
      pages: "66–75",
      course: "discrete-math-epp",
      date: "2026-11-12",
      done: true,
      readOn: "2026-11-17",
    },
  ]);
});

test("parseAfterReads：不认识的行跳过，index 只数匹配行且连续；节外的行不算", () => {
  const body = [
    "## 课后读",
    "- [ ] §1 · pp.1–2 · course-a · 2026-11-10",
    "- 这行不是课后读",
    "- [ ] §1.1 · pp.1 · BadCourse · 2026-11-10",
    "- [x] §2 · pp.3–4 · course-a · 2026-11-11 · 读于 2026-11-12",
    "",
    "## 摘录",
    "- [ ] 这行在别的节 · pp.9 · course-a · 2026-11-10",
  ];
  const rows = parseAfterReads(body);
  assert.deepEqual(
    rows.map((row) => row.index),
    [1, 2],
  );
  assert.equal(rows[0].label, "§1");
  assert.equal(rows[1].label, "§2");
  assert.equal(rows[1].done, true);
});

// ---- formatAfterRead ----

test("formatAfterRead：readOn null 是 [ ]，给了是 [x] 加「读于」；页码规范化", () => {
  assert.equal(
    formatAfterRead({ label: "§1.1", pages: "1–5", course: "dm", date: "2026-11-10" }),
    "- [ ] §1.1 · pp.1–5 · dm · 2026-11-10",
  );
  assert.equal(
    formatAfterRead({
      label: "§1.1",
      pages: "1–5",
      course: "dm",
      date: "2026-11-10",
      readOn: "2026-11-17",
    }),
    "- [x] §1.1 · pp.1–5 · dm · 2026-11-10 · 读于 2026-11-17",
  );
  // 页码进来时连接号/分隔符不规范 → 写出规范串
  assert.equal(
    formatAfterRead({ label: "§1", pages: "1-3, 5", course: "dm", date: "2026-11-10" }),
    "- [ ] §1 · pp.1–3、5 · dm · 2026-11-10",
  );
});

test("往返：parseAfterReads(formatAfterRead(x)) 字段一致", () => {
  const open = { label: "§1.1–1.4", pages: "1–5、7–12", course: "dm-epp", date: "2026-11-10" };
  const [parsedOpen] = parseAfterReads(["## 课后读", formatAfterRead({ ...open, readOn: null })]);
  assert.deepEqual(parsedOpen, { index: 1, ...open, done: false, readOn: null });

  const done = { ...open, readOn: "2026-11-15" };
  const [parsedDone] = parseAfterReads(["## 课后读", formatAfterRead(done)]);
  assert.deepEqual(parsedDone, { index: 1, ...done, done: true });
});

// ---- addAfterRead ----

test("addAfterRead：节不存在时插在 `## 排期` 之后、`## 摘录` 之前，前后留空行；不改入参", () => {
  const before = SAMPLE.slice();
  const { body, index, updated } = addAfterRead(SAMPLE, {
    label: "§1.1–1.4",
    pages: "1–5、7–12",
    course: "discrete-math-epp",
    date: "2026-11-10",
  });
  assert.equal(index, 1);
  assert.equal(updated, false);
  const heading = body.indexOf(AFTER_HEADING);
  assert.ok(heading !== -1, body.join("\n"));
  assert.ok(body.indexOf("<!-- xuegen:shelf:end -->") < heading, "应在排期之后");
  assert.ok(heading < body.indexOf("## 摘录"), "应在摘录之前");
  assert.equal(body[heading - 1], "");
  assert.equal(body[heading + 1], "");
  assert.equal(
    body[heading + 2],
    "- [ ] §1.1–1.4 · pp.1–5、7–12 · discrete-math-epp · 2026-11-10",
  );
  assert.equal(body[heading + 3], "");
  assert.deepEqual(SAMPLE, before, "入参数组不应被改");
});

test("addAfterRead：没有 `## 排期` 也没有后续节时加在文末", () => {
  const { body } = addAfterRead(["# T", "", "## 分段", "1. Ch1 pp.1–9"], {
    label: "§1",
    pages: "1–5",
    course: "dm",
    date: "2026-11-10",
  });
  const heading = body.indexOf(AFTER_HEADING);
  assert.ok(heading > body.indexOf("## 分段"), body.join("\n"));
  assert.equal(body[body.length - 2], "- [ ] §1 · pp.1–5 · dm · 2026-11-10");
});

test("addAfterRead：节存在时加在节末（末行空行保持在新行之后）；不认识行原样保留", () => {
  const base = [
    "## 课后读",
    "",
    "- [ ] §1 · pp.1–5 · dm · 2026-11-10",
    "- 不认识的一行",
    "",
    "## 摘录",
  ];
  const { body, index, updated } = addAfterRead(base, {
    label: "§2",
    pages: "6–9",
    course: "dm",
    date: "2026-11-11",
  });
  assert.equal(index, 2, "匹配行只有一条，新行是第 2 条");
  assert.equal(updated, false);
  const addedAt = body.indexOf("- [ ] §2 · pp.6–9 · dm · 2026-11-11");
  assert.ok(addedAt > body.indexOf("- 不认识的一行"), "新行在旧行之后");
  assert.ok(addedAt < body.indexOf("## 摘录"), "新行在下一节之前");
  assert.ok(body.includes("- 不认识的一行"));
});

test("addAfterRead：同 course 同 label 的未勾行 → 只改页码与日期，不新增", () => {
  const base = [
    "## 课后读",
    "- [ ] §1 · pp.1–5 · dm · 2026-11-10",
    "- [ ] §2 · pp.6–9 · dm · 2026-11-11",
  ];
  const { body, index, updated } = addAfterRead(base, {
    label: "§1",
    pages: "13–15",
    course: "dm",
    date: "2026-11-14",
  });
  assert.equal(updated, true);
  assert.equal(index, 1);
  assert.equal(body.filter((line) => /^- \[/.test(line)).length, 2, "行数不变");
  assert.equal(body[1], "- [ ] §1 · pp.13–15 · dm · 2026-11-14");
  assert.equal(body[2], "- [ ] §2 · pp.6–9 · dm · 2026-11-11", "别行不动");
});

test("addAfterRead：同标签但已勾 → 新增一行；同标签不同课程 → 也新增", () => {
  const base = [
    "## 课后读",
    "- [x] §1 · pp.1–5 · dm · 2026-11-10 · 读于 2026-11-12",
  ];
  const done = addAfterRead(base, {
    label: "§1",
    pages: "6–8",
    course: "dm",
    date: "2026-11-13",
  });
  assert.equal(done.updated, false);
  assert.equal(done.index, 2);
  assert.ok(done.body.includes("- [x] §1 · pp.1–5 · dm · 2026-11-10 · 读于 2026-11-12"));
  assert.ok(done.body.includes("- [ ] §1 · pp.6–8 · dm · 2026-11-13"));

  const other = addAfterRead(base, {
    label: "§1",
    pages: "1–5",
    course: "other",
    date: "2026-11-13",
  });
  assert.equal(other.updated, false);
  assert.equal(other.index, 2);
});

// ---- 校验 ----

test("addAfterRead / formatAfterRead：label、pages、course、date 非法都抛中文错", () => {
  const body = ["## 课后读", ""];
  const bad = [
    { label: "含 · 中点", pages: "1", course: "dm", date: "2026-11-10" },
    { label: "", pages: "1", course: "dm", date: "2026-11-10" },
    { label: "换\n行", pages: "1", course: "dm", date: "2026-11-10" },
    { label: "x".repeat(61), pages: "1", course: "dm", date: "2026-11-10" },
    { label: "§1", pages: "附录、pp.3", course: "dm", date: "2026-11-10" },
    { label: "§1", pages: "", course: "dm", date: "2026-11-10" },
    { label: "§1", pages: "1–2", course: "Bad_Course", date: "2026-11-10" },
    { label: "§1", pages: "1–2", course: "", date: "2026-11-10" },
    { label: "§1", pages: "1–2", course: "dm", date: "2026-13-40" },
    { label: "§1", pages: "1–2", course: "dm", date: "11-10" },
  ];
  for (const input of bad) {
    assert.throws(() => addAfterRead(body, input), /非法/, JSON.stringify(input));
    assert.throws(() => formatAfterRead(input), /非法/, JSON.stringify(input));
  }
  assert.deepEqual(body, ["## 课后读", ""], "报错不应改入参");
  assert.throws(
    () => formatAfterRead({ label: "§1", pages: "1", course: "dm", date: "2026-11-10", readOn: "x" }),
    /非法/,
  );
});

// ---- markAfterRead ----

test("markAfterRead：第 N 行变 [x] 加「读于」，别的行不动，入参不改", () => {
  const base = [
    "## 课后读",
    "- [ ] §1 · pp.1–5 · dm · 2026-11-10",
    "- 不认识的行",
    "- [ ] §2 · pp.6–9 · dm · 2026-11-11",
    "",
    "## 摘录",
  ];
  const next = markAfterRead(base, 2, "2026-11-15");
  assert.equal(next[3], "- [x] §2 · pp.6–9 · dm · 2026-11-11 · 读于 2026-11-15");
  for (let line = 0; line < next.length; line += 1) {
    if (line !== 3) assert.equal(next[line], base[line], `第 ${line + 1} 行不应变`);
  }
  assert.equal(base[3], "- [ ] §2 · pp.6–9 · dm · 2026-11-11", "入参数组不改");
});

test("markAfterRead：已勾过报错「已经记过」；越界报错「没有第 N 条课后读」", () => {
  const base = [
    "## 课后读",
    "- [x] §1 · pp.1–5 · dm · 2026-11-10 · 读于 2026-11-12",
    "- [ ] §2 · pp.6–9 · dm · 2026-11-11",
  ];
  assert.throws(() => markAfterRead(base, 1, "2026-11-15"), /已经记过/);
  assert.throws(() => markAfterRead(base, 3, "2026-11-15"), /没有第 3 条课后读/);
  assert.throws(() => markAfterRead(base, 0, "2026-11-15"), /没有第 0 条课后读/);
  assert.throws(() => markAfterRead([], 1, "2026-11-15"), /没有第 1 条课后读/);
});

// ---- afterReadPages ----

test("afterReadPages：只算已勾行的页码，展开、去重、升序", () => {
  const body = [
    "## 课后读",
    "- [ ] §1 · pp.1–5 · dm · 2026-11-10",
    "- [x] §2 · pp.6–9、12 · dm · 2026-11-11 · 读于 2026-11-12",
    "- [x] §3 · pp.9–11 · dm · 2026-11-12 · 读于 2026-11-13",
  ];
  assert.deepEqual(afterReadPages(body), [6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(afterReadPages([]), []);
  assert.deepEqual(afterReadPages(["## 课后读", "- [ ] §1 · pp.1–5 · dm · 2026-11-10"]), []);
});
