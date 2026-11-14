// cycle-next.mjs 的测试：accept（上一周期验收材料）与 preview（新周期第一周预览）。
// 纯函数直接测；loadAccept / loadPreview 走 CLI，库一律建在临时目录。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { acceptInfo, parseGoals, previewWeek } from "./cycle-next.mjs";
import { parseCycle } from "./cycle.mjs";
import { parseDays, parseRest, planSchedule, renderTable, readSchedule, completedIds } from "../course/course-schedule.mjs";

const run = promisify(execFile);
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "cycle.mjs");
const SUN = parseRest("sun");

const CYCLE = `---
cycle: C1
start: 2026-11-06
end: 2026-12-24
---

# C1 · 离散 + 范式

## Weekly Template

| 星期 | 类型 | 主项 | 辅助 |
|---|---|---|---|
| 周一 | 深度 | [[subjects/x\\|离散]] | [[subjects/z\\|C]] |
| 周二 | 深度 | [[subjects/y\\|范式]] | — |
| 周三 | 深度 | [[subjects/x\\|离散]] | [[subjects/z\\|C]] |
| 周四 | 深度 | [[subjects/y\\|范式]] | — |
| 周五 | 整合 | — | — |
| 周六 | 低强度 | — | — |
| 周日 | 休息 | — | — |
`;

const ROUTE = `---
route: 测试路线
start: 2026-11-06
end: 2027-04-08
buffer_weeks: 12
---

## Cycles

| 周期 | 开始 | 结束 | 主项 | 辅助（下周期主项） | 状态 |
|---|---|---|---|---|---|
| [[cycles/c1\\|C1]] | 2026-11-06 | 2026-12-24 | 离散、范式 | 数据结构与算法 | 进行中 |
| C2 | 2026-12-25 | 2027-02-11 | 数据结构与算法、C 与系统编程 | — | 未开始 |
`;

const SUBJECTS = {
  "x.md": "# 离散\n\n## Materials\n\n### 书籍\n\n- ● 学习中 · 主线 · [[src-a]] → [[courses/a\\|离散]]\n",
  "y.md": "# 范式\n\n## Courses\n\n- [[courses/b\\|范式]]\n",
  "z.md": "# C\n\n## Courses\n\n- [[courses/d\\|C]]\n",
  "algorithms.md": "# 数据结构与算法\n\n## Materials\n",
  "c-lang.md": "# C 与系统编程\n\n## Materials\n",
};

const SUBJECTS_MD = "# 科目\n\n- [[subjects/algorithms\\|算法]]\n- [[subjects/c-lang\\|C]]\n";

const A_DAYS = parseDays("mon,wed", SUN);
const B_DAYS = parseDays("tue,thu", SUN);
const RANGE = { start: "2026-11-06", end: "2026-12-24", rest: SUN, reviews: "anki" };
const lessons = (n) => Array.from({ length: n }, (_, i) => ({ content: `第 ${i + 1} 课` }));
const aRows = planSchedule(lessons(4), { ...RANGE, days: A_DAYS });
const bRows = planSchedule(lessons(4), { ...RANGE, days: B_DAYS });
const dRows = planSchedule(lessons(3), { ...RANGE, days: A_DAYS });

function courseText(rows, days, { title = "课", goals = "", record = "" } = {}) {
  return [
    `# ${title}`,
    "",
    "## Overall Goals",
    "",
    goals,
    "",
    "## 计划表",
    "",
    renderTable(rows, SUN, days, "anki"),
    "",
    "## Learning Record",
    record,
    "",
  ].join("\n");
}

async function writeVault(vault) {
  await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
  await mkdir(join(vault, "wiki", "subjects"), { recursive: true });
  await mkdir(join(vault, "wiki", "courses"), { recursive: true });
  await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE);
  await writeFile(join(vault, "wiki", "cycles", "route.md"), ROUTE);
  await writeFile(join(vault, "wiki", "subjects.md"), SUBJECTS_MD);
  for (const [name, text] of Object.entries(SUBJECTS)) {
    await writeFile(join(vault, "wiki", "subjects", name), text);
  }
  await writeFile(
    join(vault, "wiki", "courses", "a.md"),
    courseText(aRows, A_DAYS, {
      title: "离散数学（Epp）",
      goals: "- [x] 最低：不查书写出真值表\n- [ ] 标准：会做前两章习题\n- [ ] 没有级别的行",
      record: "### 2026-11-06-01\n完成：D1",
    }),
  );
  await writeFile(
    join(vault, "wiki", "courses", "b.md"),
    courseText(bRows, B_DAYS, { title: "CTM", goals: "- [ ] 最低：跑通求值器" }),
  );
  await writeFile(join(vault, "wiki", "courses", "d.md"), courseText(dRows, A_DAYS, { title: "C 导读" }));
}

test("parseGoals：级别取全角冒号前的词，勾选状态与无级别行", () => {
  const goals = parseGoals("## Overall Goals\n\n- [x] 最低：不查书写出真值表\n- [ ] 标准：会做习题\n- [X] 没有级别的行\n- 普通行不算\n\n## 下一节\n- [ ] 别节的也不算\n");
  assert.deepEqual(goals, [
    { level: "最低", text: "不查书写出真值表", done: true },
    { level: "标准", text: "会做习题", done: false },
    { level: "", text: "没有级别的行", done: true },
  ]);
  assert.deepEqual(parseGoals("# 没有这一节\n"), []);
});

test("previewWeek：主项按顺序替换、names 给短名、辅助不变、缺省主项标 unchanged", () => {
  const cycle = parseCycle(CYCLE);
  const names = { algorithms: "算法", "c-lang": "C", z: "C 导读" };
  const two = previewWeek(cycle, ["algorithms", "c-lang"], names, "2026-12-25");
  assert.equal(two.days.length, 7);
  // start 2026-12-25（周五）起 7 天；周一周三 x → algorithms，周二周四 y → c-lang。
  assert.deepEqual(two.days.map((day) => day.type), ["整合", "低强度", "休息", "深度", "深度", "深度", "深度"]);
  assert.deepEqual(two.days[3], {
    date: "2026-12-28",
    weekday: "周一",
    type: "深度",
    subject: "algorithms",
    name: "算法",
    aux: "z",
    auxName: "C 导读",
  });
  assert.equal(two.days[4].subject, "c-lang");
  assert.equal(two.days[4].name, "C");
  assert.equal(two.days[0].subject, null);

  // 只给一个主项：第二个主项（y）照旧并标 unchanged。
  const one = previewWeek(cycle, ["algorithms"], names, "2026-12-25");
  assert.equal(one.days[3].subject, "algorithms");
  assert.equal(one.days[3].unchanged, undefined);
  assert.equal(one.days[4].subject, "y");
  assert.equal(one.days[4].name, "y"); // names 里没有 y 就用 slug
  assert.equal(one.days[4].unchanged, true);
  assert.equal(one.days[6].unchanged, true);

  // 新主项与原来是同一科目也不标 unchanged。
  const same = previewWeek(cycle, ["x", "y"], names, "2026-12-25");
  assert.equal(same.days[3].subject, "x");
  assert.equal(same.days[3].unchanged, undefined);
});

test("acceptInfo：只算新课次，remaining 是没写进「完成：」的", () => {
  const cycle = parseCycle(CYCLE);
  const text = courseText(aRows, A_DAYS, { record: "完成：D1、D2" });
  const schedule = readSchedule(text);
  const courses = new Map([
    ["a", { subject: "x", rows: schedule.rows, done: completedIds(text), title: "离散数学（Epp）", goals: [{ level: "最低", text: "g", done: false }] }],
  ]);
  const info = acceptInfo(cycle, courses, { cycle: "C2", start: "2026-12-25", end: "2027-02-11", mains: ["algorithms"], status: "未开始" });
  assert.equal(info.cycle, "C1");
  assert.equal(info.start, "2026-11-06");
  assert.equal(info.end, "2026-12-24");
  assert.deepEqual(info.courses[0].slug, "a");
  assert.deepEqual(info.courses[0].lessons, { done: 2, total: 4, remaining: ["D3", "D4"] });
  assert.equal(info.next.cycle, "C2");
  assert.deepEqual(acceptInfo(cycle, new Map(), null).next, null);
});

test("CLI: accept 读主课的总目标与课次完成度，next 是路线上的下一周期（mains 是 slug）", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cycle-accept-"));
  try {
    await writeVault(vault);
    const info = JSON.parse((await run("node", [SCRIPT, "accept", vault, "C1", "--json"])).stdout);
    assert.equal(info.cycle, "C1");
    assert.equal(info.start, "2026-11-06");
    assert.equal(info.end, "2026-12-24");
    assert.deepEqual(
      info.courses.map((course) => course.slug),
      ["a", "b"],
      "只含主项课，辅助 d 不算",
    );
    const a = info.courses[0];
    assert.equal(a.title, "离散数学（Epp）");
    assert.equal(a.subject, "x");
    assert.deepEqual(a.goals, [
      { level: "最低", text: "不查书写出真值表", done: true },
      { level: "标准", text: "会做前两章习题", done: false },
      { level: "", text: "没有级别的行", done: false },
    ]);
    assert.deepEqual(a.lessons, { done: 1, total: 4, remaining: ["D2", "D3", "D4"] });
    assert.deepEqual(info.next, { cycle: "C2", start: "2026-12-25", end: "2027-02-11", mains: ["algorithms", "c-lang"], status: "未开始" });

    const text = (await run("node", [SCRIPT, "accept", vault, "C1"])).stdout;
    assert.match(text, /C1 · 2026-11-06 ~ 2026-12-24/);
    assert.match(text, /下一周期：C2/);
    await assert.rejects(run("node", [SCRIPT, "accept", vault, "C9", "--json"]), (error) => /没有这个周期/.test(error.stderr));
    await assert.rejects(run("node", [SCRIPT, "accept", vault, "不是周期", "--json"]));
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("CLI: preview 换主项出新周期第一周；参数校验报错", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cycle-preview-"));
  try {
    await writeVault(vault);
    const info = JSON.parse(
      (await run("node", [SCRIPT, "preview", vault, "--from", "C1", "--start", "2026-12-25", "--main", "algorithms,c-lang", "--json"])).stdout,
    );
    assert.equal(info.days.length, 7);
    assert.equal(info.days[0].date, "2026-12-25");
    assert.equal(info.days[0].type, "整合");
    assert.equal(info.days[3].subject, "algorithms");
    assert.equal(info.days[3].name, "算法"); // subjects.md 链接的别名
    assert.equal(info.days[3].aux, "z");
    assert.equal(info.days[3].auxName, "C"); // z 的科目页 H1
    assert.equal(info.days[4].subject, "c-lang");
    assert.equal(info.days[4].name, "C");

    const one = JSON.parse(
      (await run("node", [SCRIPT, "preview", vault, "--from", "C1", "--start", "2026-12-25", "--main", "algorithms", "--json"])).stdout,
    );
    assert.equal(one.days[4].subject, "y");
    assert.equal(one.days[4].unchanged, true);

    const text = (await run("node", [SCRIPT, "preview", vault, "--from", "C1", "--start", "2026-12-25", "--main", "algorithms,c-lang"])).stdout;
    assert.match(text, /周一 12-28  深度  算法  导读 C/);
    await assert.rejects(run("node", [SCRIPT, "preview", vault, "--from", "C9", "--start", "2026-12-25", "--main", "algorithms", "--json"]), (error) => /没有这个周期/.test(error.stderr));
    await assert.rejects(run("node", [SCRIPT, "preview", vault, "--from", "C1", "--main", "algorithms", "--json"]), (error) => /--start/.test(error.stderr));
    await assert.rejects(run("node", [SCRIPT, "preview", vault, "--from", "C1", "--start", "2026-12-25", "--json"]), (error) => /--main/.test(error.stderr));
    await assert.rejects(run("node", [SCRIPT, "preview", vault, "--from", "C1", "--start", "2026-12-25", "--main", "a,b,c", "--json"]), (error) => /1–2/.test(error.stderr));
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});
