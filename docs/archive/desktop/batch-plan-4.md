# 批次 PL-4：周模板的深度日只绑科目，一个科目可以有多门课

用户决定（2026-11-06）：周模板的深度日写科目（`[[subjects/programming-paradigms\|范式]]`），不再写具体的课。这个科目下每份资料可以各自建课、各自排课，每门课自己选上课日，只要都落在该科目的深度日上、同一天不撞车。

现在的格式（深度日链接课程）：`| 周二 | 深度 | [[courses/ctm\|CTM]] |`
新格式：`| 周二 | 深度 | [[subjects/programming-paradigms\|范式]] |`
过渡期库里会写成两个链接都有：`| 周二 | 深度 | [[subjects/programming-paradigms\|范式]]（[[courses/ctm\|CTM]]） |`。**新解析只认 `[[subjects/…]]`，同一格里的 `[[courses/…]]` 一律忽略**。

一门课属于哪个科目、短名叫什么，看科目页 `wiki/subjects/<科目>.md` 里 `## Materials` 与 `## Courses` 两节中的 `[[courses/<slug>]]` 或 `[[courses/<slug>\|短名]]` 链接。本周期的课 = 周模板里各科目链接的课中，**至少有一节新课的日期落在周期内**的那些（像已经学完的旧课不算）。

## 硬约束（先看这里）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。
- 按步骤**逐条照做**，代码照抄；不要重新设计、改名或「顺手优化」。做不通时停下，在报告里写清卡在哪。
- 只准改：`skills/cycle-plan/cycle.mjs`、`skills/cycle-plan/cycle.test.mjs`、`apps/desktop/src/shared/data-protocol.ts`、`apps/desktop/src/renderer/core/board/plan-view.ts`、`apps/desktop/src/renderer/core/board/plan-view.test.ts`、`apps/desktop/src/renderer/gallery/panel-samples.ts`，以及第 6 步因类型报错需要补字段的测试文件。
- **不要改 `skills/cycle-plan/SKILL.md`**（Claude 改）。不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 commit / push，不加依赖，不加 `eslint-disable` / `@ts-ignore`。

---

## 第 1 步：`skills/cycle-plan/cycle.mjs`

### 1a. `parseCycle`

1. 函数上方注释改为：

```js
/**
 * 解析周期页：{ cycle, start, end, title, template: { 0..6: { type, subject } }, subjects: { slug: 短名 } }（0 = 周日）。
 * 深度日必须链接一个科目 [[subjects/slug\|短名]]；同一格里的 [[courses/…]] 忽略（旧格式过渡用）。格式不对就抛错。
 */
```

2. 函数体里 `const names = {};` 改为 `const subjects = {};`。

3. 循环里从 `const link = /\[\[courses\/…/.exec(cells[2] ?? "");` 到 `if (link) names[…] = …;` 这几行整段替换为：

```js
    const link = /\[\[subjects\/([^\]|\\]+)(?:\\?\|([^\]]+))?\]\]/.exec(cells[2] ?? "");
    if (type === "深度" && !link) throw new Error(`${name} 的${cells[0]}是深度日，但没有链接科目（[[subjects/…]]）`);
    if (template[day]) throw new Error(`${name} 的${cells[0]}出现了两次`);
    template[day] = { type, subject: link ? link[1].trim() : null };
    if (link) subjects[link[1].trim()] = (link[2] ?? link[1]).trim();
```

4. return 改为 `return { cycle, start, end, title, template, subjects };`

### 1b. `cycleCourses` → `cycleSubjects`，新增 `subjectCourses`

把整个 `cycleCourses` 函数（连注释）替换为：

```js
/** 周模板深度日链接到的科目 slug（去重，按出现顺序）。 */
export function cycleSubjects(cycle) {
  return [...new Set(Object.values(cycle.template).map((slot) => slot.subject).filter(Boolean))];
}

/** 科目页里 ## Materials 与 ## Courses 两节链接的课程：[{ slug, name }]；name 取链接别名，没有别名就是 slug。 */
export function subjectCourses(text) {
  const found = new Map();
  let section = "";
  for (const line of text.split("\n")) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      section = h2[1];
      continue;
    }
    if (section !== "Materials" && section !== "Courses") continue;
    for (const match of line.matchAll(/\[\[courses\/([^\]|\\]+)(?:\\?\|([^\]]+))?\]\]/g)) {
      const slug = match[1].trim();
      const alias = match[2] ? match[2].trim() : null;
      if (!found.has(slug) || (alias && !found.get(slug))) found.set(slug, alias);
    }
  }
  return [...found].map(([slug, alias]) => ({ slug, name: alias ?? slug }));
}
```

### 1c. `dayInfo`

1. 注释第一行改为 `* 某天的情况。courses：loadCourses 的结果 Map<slug, { subject, name, rows, done, days }>。`
2. 没有周期时的 return 改为：

```js
  if (!cycle) {
    return { ...base, cycle: null, week: null, type: null, subject: null, course: null, names: {}, subjects: {}, lessons: [], overdue: [] };
  }
```

3. 最后的 `return { ...base, cycle: cycle.cycle, …, course: slot.course, names: cycle.names, lessons, overdue };` 替换为：

```js
  const own = slot.subject ? [...courses].filter(([, info]) => info.subject === slot.subject).map(([slug]) => slug) : [];
  const course =
    lessons.find((item) => own.includes(item.course))?.course ??
    overdue.find((item) => own.includes(item.course))?.course ??
    own[0] ??
    null;
  const names = Object.fromEntries([...courses].map(([slug, info]) => [slug, info.name]));
  return {
    ...base,
    cycle: cycle.cycle,
    week: weekOf(cycle, date),
    type: slot.type,
    subject: slot.subject,
    course,
    names,
    subjects: cycle.subjects,
    lessons,
    overdue,
  };
```

（`course`：深度日这个科目当天有课的那门；没有就是该科目最早过期没学的那门；再没有就是该科目本周期的第一门；非深度日为 null。）

### 1d. `monthInfo`

1. 注释里 `days: { 'YYYY-MM-DD': { cycle, week, type, course } }` 改为 `days: { 'YYYY-MM-DD': { cycle, week, type, subject, course } }`，`names: { slug: 短名 }` 后面加 `, subjects: { 科目 slug: 短名 }`。
2. 函数体：`const names = {};` 下面加 `const subjects = {};`。
3. 循环体里从 `Object.assign(names, cycle.names);` 到 `if (rows.length > 0) lessons[date] = rows;` 整段替换为：

```js
    Object.assign(subjects, cycle.subjects);
    const cycleCourseMap = courses.get(cycle.cycle) ?? new Map();
    for (const [slug, info] of cycleCourseMap) names[slug] = info.name;
    const slot = cycle.template[weekday(date)];
    const rows = [];
    for (const [slug, info] of cycleCourseMap) {
      for (const row of info.rows) {
        if (row.kind !== "review" && row.date === date) rows.push({ course: slug, id: row.id, content: row.content });
      }
    }
    const own = slot.subject ? rows.find((row) => cycleCourseMap.get(row.course)?.subject === slot.subject) : null;
    days[date] = { cycle: cycle.cycle, week: weekOf(cycle, date), type: slot.type, subject: slot.subject, course: own ? own.course : null };
    if (rows.length > 0) lessons[date] = rows;
```

4. return 改为 `return { month, days, lessons, names, subjects, cycles: cycles.map(({ cycle, start, end }) => ({ cycle, start, end })), recovery };`

### 1e. `planInfo`

1. 注释里 `courses：周模板链接的每门课 { slug, name, total, done, end, next: … }` 改为 `courses：本周期的每门课（loadCourses 的顺序）{ slug, subject, name, total, done, end, next: … }`。
2. `const list = cycleCourses(cycle).map((slug) => { … });` 整段替换为：

```js
  const list = [...courses].map(([slug, info]) => {
    const lessons = info.rows.filter((row) => row.kind === "new");
    const open = lessons.filter((row) => !info.done.has(row.id));
    const first = open[0] ?? null;
    return {
      slug,
      subject: info.subject,
      name: info.name,
      total: lessons.length,
      done: lessons.length - open.length,
      end: lessons.length > 0 ? lessons[lessons.length - 1].date : null,
      next: first ? { id: first.id, date: first.date, content: first.content } : null,
    };
  });
```

### 1f. `checkCycle`

整个函数（连注释）替换为：

```js
/**
 * 检查一个周期：长度、休息日、模板里每个科目本周期有课、每门课的上课日都是它科目的深度日、
 * 同一科目同一天不排两门课、新课次都在周期内。courses：loadCourses 的结果。返回问题清单（空数组 = 通过）。
 */
export function checkCycle(cycle, courses) {
  const problems = [];
  const span = daysBetween(cycle.start, cycle.end) + 1;
  if (span !== CYCLE_DAYS) problems.push(`${cycle.cycle}：start ~ end 共 ${span} 天，应为 ${CYCLE_DAYS} 天（7 周）`);
  if (!Object.values(cycle.template).some((slot) => slot.type === "休息")) problems.push(`${cycle.cycle}：周模板没有休息日`);
  const names = (list) => list.map((day) => WEEKDAY_ZH[day]).join("、");
  const deepDays = (subject) =>
    Object.entries(cycle.template)
      .filter(([, slot]) => slot.subject === subject)
      .map(([day]) => Number(day))
      .sort((a, b) => a - b);
  for (const subject of cycleSubjects(cycle)) {
    if (![...courses.values()].some((info) => info.subject === subject)) {
      problems.push(`${cycle.cycle}：周模板里的 subjects/${subject} 本周期没有排课的课程`);
    }
  }
  const taken = new Map();
  for (const [slug, info] of courses) {
    const deep = deepDays(info.subject);
    const outside = [...info.days].filter((day) => !deep.includes(day)).sort((a, b) => a - b);
    if (outside.length > 0) {
      problems.push(`${cycle.cycle}：courses/${slug} 的上课日（${names(outside)}）不是 subjects/${info.subject} 的深度日（${names(deep)}）`);
    }
    for (const row of info.rows) {
      if (row.kind !== "new") continue;
      if (row.date < cycle.start || row.date > cycle.end) {
        problems.push(`${cycle.cycle}：courses/${slug} 的 ${row.id}（${row.date}）在周期之外`);
      }
      const key = `${info.subject} ${row.date}`;
      const other = taken.get(key);
      if (other && other !== slug) {
        problems.push(`${cycle.cycle}：subjects/${info.subject} 在 ${row.date} 同时排了 courses/${other} 与 courses/${slug}`);
      } else {
        taken.set(key, slug);
      }
    }
  }
  return problems;
}
```

### 1g. `loadCourses`

整个函数替换为：

```js
/**
 * 本周期的课：周模板各科目的科目页链接的课程中，至少有一节新课落在周期内的那些。
 * 返回 Map<slug, { subject, name, rows, done, days }>，按科目在模板里的顺序、科目页里的链接顺序。
 * 科目页不存在就抛错；科目页链接的课程页不存在或没有排期就跳过。
 */
export async function loadCourses(vault, cycle) {
  const courses = new Map();
  for (const subject of cycleSubjects(cycle)) {
    let subjectText;
    try {
      subjectText = await readFile(join(vault, "wiki", "subjects", `${subject}.md`), "utf8");
    } catch {
      throw new Error(`周期 ${cycle.cycle} 链接的科目页不存在：subjects/${subject}.md`);
    }
    for (const { slug, name } of subjectCourses(subjectText)) {
      if (courses.has(slug)) continue;
      let text;
      try {
        text = await readFile(join(vault, "wiki", "courses", `${slug}.md`), "utf8");
      } catch {
        continue;
      }
      const schedule = readSchedule(text);
      if (!schedule) continue;
      if (!schedule.rows.some((row) => row.kind === "new" && cycle.start <= row.date && row.date <= cycle.end)) continue;
      courses.set(slug, { subject, name, rows: schedule.rows, done: completedIds(text), days: schedule.days });
    }
  }
  return courses;
}
```

### 1h. 其他

- 文件里不能再有 `cycleCourses`、`cycle.names`、`slot.course`、`hasSchedule` 的引用（`grep -n "cycleCourses\|cycle\.names\|slot\.course\|hasSchedule" skills/cycle-plan/cycle.mjs` 应为空）。
- `dayLine` 函数里如果用了 `info.course`，保持不动（`course` 字段仍然存在）。

## 第 2 步：`skills/cycle-plan/cycle.test.mjs`

1. import 行里 `cycleCourses` 改为 `cycleSubjects, subjectCourses`。

2. 常量 `CYCLE` 的周模板四个深度行改为：

```
| 周一 | 深度 | [[subjects/x\\|离散]] |
| 周二 | 深度 | [[subjects/y\\|范式]] |
| 周三 | 深度 | [[subjects/x\\|离散]] |
| 周四 | 深度 | [[subjects/y\\|范式]] |
```

3. 在 `CYCLE` 常量下面加：

```js
const SUBJECT_X = "# 离散\n\n## Materials\n\n### 书籍\n\n- ● 学习中 · 主线 · [[src-a]] → [[courses/a\\|离散]]\n\n## Courses\n- [[courses/old]] - 旧课\n";
const SUBJECT_Y = "# 范式\n\n## Materials\n\n### 书籍\n\n- ● 学习中 · 主线 · [[src-b]] → [[courses/b\\|范式]]\n- ◌ 未制定计划 · 主线 · [[src-c]]\n";

async function writeSubjects(vault) {
  await mkdir(join(vault, "wiki", "subjects"), { recursive: true });
  await writeFile(join(vault, "wiki", "subjects", "x.md"), SUBJECT_X);
  await writeFile(join(vault, "wiki", "subjects", "y.md"), SUBJECT_Y);
}
```

4. `coursesFrom` 改为（科目与短名固定：a → x「离散」，b → y「范式」，c → y「C」）：

```js
const SUBJECT_OF = { a: "x", b: "y", c: "y" };
const NAME_OF = { a: "离散", b: "范式", c: "C" };

function coursesFrom(texts) {
  const map = new Map();
  for (const [slug, text] of Object.entries(texts)) {
    const schedule = readSchedule(text);
    map.set(slug, { subject: SUBJECT_OF[slug], name: NAME_OF[slug], rows: schedule.rows, done: new Set(), days: schedule.days });
  }
  return map;
}
```

5. 测试 `parseCycle reads frontmatter and the 7-row weekly template`：四个断言改为

```js
  assert.deepEqual(cycle.template[1], { type: "深度", subject: "x" });
  assert.deepEqual(cycle.template[5], { type: "整合", subject: null });
  assert.deepEqual(cycle.template[0], { type: "休息", subject: null });
  assert.deepEqual(cycleSubjects(cycle), ["x", "y"]);
  assert.deepEqual(cycle.subjects, { x: "离散", y: "范式" });
```

6. 测试 `parseCycle rejects broken pages`：`"| 周一 | 深度 | [[courses/a\\|离散]] |"` 改为 `"| 周一 | 深度 | [[subjects/x\\|离散]] |"`，`/没有链接课程/` 改为 `/没有链接科目/`。在该测试末尾加：

```js
  assert.throws(() => parseCycle(CYCLE.replace("[[subjects/x\\|离散]] |\n| 周二", "[[courses/a\\|离散]] |\n| 周二")), /没有链接科目/);
  const both = parseCycle(CYCLE.replaceAll("[[subjects/x\\|离散]]", "[[subjects/x\\|离散]]（[[courses/a\\|离散]]）"));
  assert.deepEqual(both.template[1], { type: "深度", subject: "x" });
```

7. 测试 `dayInfo gives …`：在 `assert.equal(mon.course, "a");` 下面加 `assert.equal(mon.subject, "x");`。在 `const outside = …` 之前加：

```js
  const wed = dayInfo(cycle, coursesFrom({ b: courseText(bRows, B_DAYS) }), "2026-11-11");
  assert.equal(wed.subject, "x");
  assert.equal(wed.course, null);
  assert.deepEqual(mon.names, { a: "离散", b: "范式" });
  assert.deepEqual(mon.subjects, { x: "离散", y: "范式" });
```

8. 测试 `checkCycle passes …` 整个替换为：

```js
test("checkCycle: lesson days within the subject's deep days, no same-day clash, every subject has a course", () => {
  const cycle = parseCycle(CYCLE);
  const good = coursesFrom({ a: courseText(aRows, A_DAYS), b: courseText(bRows, B_DAYS) });
  assert.deepEqual(checkCycle(cycle, good), []);

  const wrongDays = parseDays("mon,thu", SUN);
  const bad = coursesFrom({
    a: courseText(aRows, A_DAYS),
    b: courseText(planSchedule(lessons(2), { ...RANGE, days: wrongDays }), wrongDays),
  });
  assert.ok(checkCycle(cycle, bad).some((problem) => /周一）不是 subjects\/y 的深度日/.test(problem)));

  const short = parseCycle(CYCLE.replace("end: 2026-12-24", "end: 2026-12-17"));
  assert.ok(checkCycle(short, good).some((problem) => /42 天/.test(problem)));

  const onlyA = coursesFrom({ a: courseText(aRows, A_DAYS) });
  assert.ok(checkCycle(cycle, onlyA).some((problem) => /subjects\/y 本周期没有排课的课程/.test(problem)));

  const THU = parseDays("thu", SUN);
  const TUE = parseDays("tue", SUN);
  const split = coursesFrom({
    a: courseText(aRows, A_DAYS),
    b: courseText(planSchedule(lessons(3), { ...RANGE, days: TUE }), TUE),
    c: courseText(planSchedule(lessons(3), { ...RANGE, days: THU }), THU),
  });
  assert.deepEqual(checkCycle(cycle, split), []);
  const clash = coursesFrom({
    a: courseText(aRows, A_DAYS),
    b: courseText(planSchedule(lessons(3), { ...RANGE, days: TUE }), TUE),
    c: courseText(planSchedule(lessons(3), { ...RANGE, days: TUE }), TUE),
  });
  assert.ok(checkCycle(cycle, clash).some((problem) => /subjects\/y 在 2026-11-10 同时排了 courses\/b 与 courses\/c/.test(problem)));
});
```

9. 所有 CLI 测试（`CLI: day, week and check …`、`CLI: month …`、`CLI: overview …`）：在 `await mkdir(join(vault, "wiki", "cycles"), …)` 之后加一行 `await writeSubjects(vault);`。

10. 测试 `monthInfo lists only the days inside a cycle`：期望值加 `subject`，并且没传课程时深度日的 `course` 是 `null`：

```js
  assert.deepEqual(info.days["2026-11-06"], { cycle: "C1", week: 1, type: "整合", subject: null, course: null });
  assert.deepEqual(info.days["2026-11-09"], { cycle: "C1", week: 1, type: "深度", subject: "x", course: null });
  assert.deepEqual(info.days["2026-11-30"], { cycle: "C1", week: 4, type: "深度", subject: "x", course: null });
```

11. 测试 `CLI: month …`：`assert.deepEqual(info.days["2026-12-24"], { cycle: "C1", week: 7, type: "深度", course: "b" });` 改为 `assert.deepEqual(info.days["2026-12-24"], { cycle: "C1", week: 7, type: "深度", subject: "y", course: null });`，下面加 `assert.equal(info.days["2026-11-10"].course, "b");`（该测试已有课程文件；若没有，照 overview 测试写入 `courses/a.md`、`b.md`）。

12. 测试 `parseCycle reads each course's short name …` 整个替换为：

```js
test("subjectCourses reads course links and aliases from Materials and Courses; dayInfo names come from them", () => {
  assert.deepEqual(subjectCourses(SUBJECT_X), [{ slug: "a", name: "离散" }, { slug: "old", name: "old" }]);
  assert.deepEqual(subjectCourses(SUBJECT_Y), [{ slug: "b", name: "范式" }]);
  assert.deepEqual(subjectCourses("## Overview\n[[courses/z]]\n"), []);
  assert.deepEqual(parseCycle(CYCLE.replaceAll("\\|离散", "").replaceAll("\\|范式", "")).subjects, { x: "x", y: "y" });
  assert.deepEqual(dayInfo(null, new Map(), "2026-11-09").names, {});
});
```

13. 测试 `planInfo gives …`：`assert.deepEqual(info.courses[0], { slug: "a", name: "离散", … })` 的期望对象里在 `slug: "a",` 后面加 `subject: "x",`。

14. 测试 `planInfo without a route page …`：`assert.deepEqual(info.courses.map(…), [["a", 0, null], ["b", 0, null]]);` 改为 `assert.deepEqual(info.courses, []);`。

15. 测试 `monthInfo adds each day's lessons …`：在 `assert.deepEqual(info.names, { a: "离散", b: "范式" });` 下面加 `assert.deepEqual(info.subjects, { x: "离散", y: "范式" });` 和 `assert.equal(info.days["2026-11-10"].course, "b");`。

16. 在文件末尾追加：

```js
test("CLI: loadCourses keeps only courses with a lesson inside the cycle and skips missing pages", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cycle-subjects-"));
  try {
    await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
    await mkdir(join(vault, "wiki", "courses"), { recursive: true });
    await writeSubjects(vault);
    await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE);
    await writeFile(join(vault, "wiki", "courses", "a.md"), courseText(aRows, A_DAYS));
    await writeFile(join(vault, "wiki", "courses", "b.md"), courseText(bRows, B_DAYS));
    const oldRows = planSchedule(lessons(2), { start: "2026-10-01", end: "2026-10-20", rest: SUN, days: A_DAYS, reviews: "anki" });
    await writeFile(join(vault, "wiki", "courses", "old.md"), courseText(oldRows, A_DAYS));
    const info = JSON.parse((await run("node", [SCRIPT, "overview", vault, "--date", "2026-11-06", "--json"])).stdout);
    assert.deepEqual(info.courses.map((item) => [item.slug, item.subject, item.name]), [["a", "x", "离散"], ["b", "y", "范式"]]);
    assert.deepEqual(JSON.parse((await run("node", [SCRIPT, "check", vault, "--json"])).stdout), { ok: true, problems: [] });
    await rm(join(vault, "wiki", "subjects", "y.md"));
    await assert.rejects(run("node", [SCRIPT, "check", vault, "--json"]), (error) => /subjects\/y\.md/.test(error.stdout));
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});
```

改完 `cd /Users/gjy/pi-learning/xuegen && npm test` 必须全绿。期望值与实际不符时**不要改实现去凑**，在报告里写出实际值。

## 第 3 步：`apps/desktop/src/shared/data-protocol.ts`

1. `CycleDay`：`course` 字段的注释改为 `/** On a 深度 day: the subject's course with a lesson that day, else its earliest overdue one, else its first course this cycle; null on other days. */`，并在 `course` 上面加：

```ts
  /** The subject a 深度 day belongs to; null for other day types. */
  subject: string | null;
```

   在 `names` 下面加：

```ts
  /** Subject slug → the short name the weekly template links it with. */
  subjects: Record<string, string>;
```

   `names` 的注释改为 `/** Course slug → its short name (the alias of its link on the subject page). */`。

2. `CycleSlot`：在 `type` 下面加 `subject: string | null;`，`course` 上面加注释 `/** The subject's course with a lesson that day, or null. */`。
3. `CycleMonth`：在 `names` 下面加 `subjects: Record<string, string>;`，接口注释里 `` `names` the courses' short names; `` 改为 `` `names` the courses' and `subjects` the subjects' short names; ``。
4. `CycleCourseProgress`：在 `slug` 下面加 `/** Its subject's slug. */ subject: string;`（分两行写）。

## 第 4 步：`apps/desktop/src/renderer/core/board/plan-view.ts` 与测试

1. `cellTag` 里 `if (slot.type === "深度") return slot.course ? (month.names[slot.course] ?? slot.course) : "";` 改为：

```ts
  if (slot.type === "深度") return slot.subject ? (month.subjects[slot.subject] ?? slot.subject) : "";
```

   函数注释改为 `/** What a calendar cell says: the lesson's short course name, else 恢复 / 整合 / Anki / the 深度 day's subject short name, else "". */`

2. `plan-view.test.ts`：
   - `OVERVIEW.courses` 两项各加 `subject`：epp 加 `subject: "discrete-math",`，ctm 加 `subject: "programming-paradigms",`；`courseCards` 第二个测试里 `{ slug: "x", name: "x", … }` 加 `subject: "s",`。
   - `MONTH.days` 每项加 `subject`：12-21 → `"discrete-math"`，12-22 与 12-24 → `"programming-paradigms"`，其余 → `null`；12-21 的 `course` 保持 `"epp"`，12-22 与 12-24 的 `course` 改为 `null`。
   - `MONTH` 加 `subjects: { "discrete-math": "离散", "programming-paradigms": "范式" },`。
   - `cellTag` 测试里 `expect(cellTag(MONTH, "2026-12-22")).toBe("CTM");` 改为 `.toBe("范式")`。

## 第 5 步：`apps/desktop/src/renderer/gallery/panel-samples.ts`

- `SAMPLE_CYCLE_OUTSIDE`：`course: null,` 上面加 `subject: null,`，`names: {},` 下面加 `subjects: {},`。
- `SAMPLE_CYCLE_DAY`：`course: …` 上面加 `subject: "discrete-math",`，`names: …` 下面加 `subjects: { "discrete-math": "离散", "programming-paradigms": "范式" },`。
- `SAMPLE_CYCLE_MONTH.days` 每一项加 `subject`：深度日里 `course: "discrete-math-epp"` 的加 `subject: "discrete-math"`，`course: "ctm"` 的加 `subject: "programming-paradigms"`，其他类型加 `subject: null`（字段放在 `type` 后面）；`names` 下面加 `subjects: { "discrete-math": "离散", "programming-paradigms": "范式" },`。
- `SAMPLE_OVERVIEW.courses`：离散那项加 `subject: "discrete-math",`，CTM 那项加 `subject: "programming-paradigms",`。

## 第 6 步：类型检查

跑 `npm run typecheck`。其他地方（如 `cycle-today.test.ts`、`bot-state.test.ts`）手写的 `CycleDay` / `CycleSlot` / `CycleMonth` / `CycleCourseProgress` 报缺字段时，只补字段：`CycleDay` 补 `subject: null, subjects: {}`（深度日且已知科目就写那个科目 slug）；`CycleSlot` 补 `subject: null`；`CycleMonth` 补 `subjects: {}`；`CycleCourseProgress` 补 `subject: "s"`。**不要改任何非测试的渲染代码。**

## 验收命令（全部贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && npm test && npm run lint:skills
grep -n "cycleCourses\|cycle\.names\|slot\.course\|hasSchedule" /Users/gjy/pi-learning/xuegen/skills/cycle-plan/cycle.mjs
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：全绿；grep 为空；新增改动只在「只准改」的文件和第 6 步补字段的测试文件里。

## 结束报告

改了哪些文件；每一步是否照做；偏离之处与原因（尤其测试期望值与实际不符时的实际值）；未完成项。
