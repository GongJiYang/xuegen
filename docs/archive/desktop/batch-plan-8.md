# 批次 PL-8：周模板每天「一个主项 + 一个辅助」（脚本与数据层）

用户决定（2026-11-06）：每个深度日 = 一个主项科目 + 一个辅助科目。两个辅助轮流（周一三 离散 + C 与系统编程，周二四 范式 + 数据结构与算法）；辅助单次不超过约 45 分钟、不考核、只记读到哪。

周模板从 3 列变 4 列（第 4 列可省略，旧的 3 列表仍然有效）：

```
| 星期 | 类型 | 主项 | 辅助 |
|---|---|---|---|
| 周一 | 深度 | [[subjects/discrete-math\|离散]] | [[subjects/c-systems-programming\|C]] |
| 周五 | 整合 | — | — |
```

一门课是主项课还是辅助课，看它的科目在模板里出现在哪一列（`role: "main" | "aux"`）。本批只做脚本、协议和纯函数；界面在下一批。

## 硬约束（先看这里）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。
- 按步骤**逐条照做**，代码照抄；不要重新设计。做不通时停下报告；测试期望与实际不符时**不要改实现去凑**，写出实际值。
- 只准改：`skills/cycle-plan/cycle.mjs`、`skills/cycle-plan/cycle.test.mjs`、`apps/desktop/src/shared/data-protocol.ts`、`apps/desktop/src/renderer/core/board/plan-view.ts`、`plan-view.test.ts`、`cycle-today.ts`、`cycle-today.test.ts`、`apps/desktop/src/renderer/gallery/panel-samples.ts`，以及类型报错需要补字段的测试文件。不改任何皮肤渲染代码，不改 SKILL.md。
- 不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 commit / push，不加依赖，不加 `eslint-disable` / `@ts-ignore`。

## 第 1 步：`skills/cycle-plan/cycle.mjs`

### 1a. `parseCycle`

1. 注释里 `template: { 0..6: { type, subject } }` 改为 `template: { 0..6: { type, subject, aux } }`；`深度日必须链接一个科目` 那句后面加 `；第 4 列（可省略）是辅助科目，只能出现在深度日`。
2. 循环里从 `const link = /\[\[subjects\/…/.exec(cells[2] ?? "");` 到 `if (link) subjects[…] = …;` 整段替换为：

```js
    const SUBJECT_LINK = /\[\[subjects\/([^\]|\\]+)(?:\\?\|([^\]]+))?\]\]/;
    const link = SUBJECT_LINK.exec(cells[2] ?? "");
    const auxLink = SUBJECT_LINK.exec(cells[3] ?? "");
    if (type === "深度" && !link) throw new Error(`${name} 的${cells[0]}是深度日，但没有链接科目（[[subjects/…]]）`);
    if (auxLink && type !== "深度") throw new Error(`${name} 的${cells[0]}是${type}日，不能排辅助`);
    if (link && auxLink && link[1].trim() === auxLink[1].trim()) throw new Error(`${name} 的${cells[0]}主项和辅助是同一个科目`);
    if (template[day]) throw new Error(`${name} 的${cells[0]}出现了两次`);
    template[day] = { type, subject: link ? link[1].trim() : null, aux: auxLink ? auxLink[1].trim() : null };
    for (const item of [link, auxLink]) if (item) subjects[item[1].trim()] = (item[2] ?? item[1]).trim();
```

3. 在 `const missing = …` 那一行**上面**加：

```js
  const mains = new Set(Object.values(template).map((slot) => slot.subject).filter(Boolean));
  const both = Object.values(template).find((slot) => slot.aux && mains.has(slot.aux));
  if (both) throw new Error(`${name} 的 subjects/${both.aux} 既是主项又是辅助`);
```

### 1b. 新函数

在 `cycleSubjects` 下面加：

```js
/** 周模板辅助列链接到的科目 slug（去重，按出现顺序）。 */
export function cycleAuxSubjects(cycle) {
  return [...new Set(Object.values(cycle.template).map((slot) => slot.aux).filter(Boolean))];
}
```

### 1c. `loadCourses`

1. 注释改为：本周期的课：周模板主项列与辅助列各科目的科目页链接的课程中，至少有一节新课落在周期内的那些。返回 `Map<slug, { subject, role, name, rows, done, days }>`（role 为 "main" 或 "aux"），先主项后辅助。……（其余照旧）
2. 外层循环 `for (const subject of cycleSubjects(cycle)) {` 改为两层：

```js
  const groups = [
    ["main", cycleSubjects(cycle)],
    ["aux", cycleAuxSubjects(cycle)],
  ];
  for (const [role, subjectList] of groups) {
    for (const subject of subjectList) {
```

   相应在循环末尾多一个 `}`；`courses.set(slug, { subject, name, rows: … })` 改为 `courses.set(slug, { subject, role, name, rows: schedule.rows, done: completedIds(text), days: schedule.days });`。

### 1d. `dayInfo`

1. 没有周期时的 return 里，在 `course: null,` 后面加 `aux: null, auxCourse: null,`，在 `subjects: {},` 后面加 `roles: {},`。
2. 把 1c 之前（PL-4）写的 `const own = …` 与 `const course = …` 两段替换为：

```js
  const pick = (subject) => {
    if (!subject) return null;
    const own = [...courses].filter(([, info]) => info.subject === subject).map(([slug]) => slug);
    return (
      lessons.find((item) => own.includes(item.course))?.course ??
      overdue.find((item) => own.includes(item.course))?.course ??
      own[0] ??
      null
    );
  };
  const course = pick(slot.subject);
  const auxCourse = pick(slot.aux);
  const roles = Object.fromEntries([...courses].map(([slug, info]) => [slug, info.role]));
```

3. return 对象里 `course,` 后面加 `aux: slot.aux, auxCourse,`；`subjects: cycle.subjects,` 后面加 `roles,`。

### 1e. `monthInfo`

1. 注释 `days: { … { cycle, week, type, subject, course } }` 改为 `{ cycle, week, type, subject, course, aux, auxCourse }`，`subjects: { … }` 后面加 `, roles: { 课程 slug: "main" | "aux" }`。
2. `const subjects = {};` 下面加 `const roles = {};`。
3. `for (const [slug, info] of cycleCourseMap) names[slug] = info.name;` 改为：

```js
    for (const [slug, info] of cycleCourseMap) {
      names[slug] = info.name;
      roles[slug] = info.role;
    }
```

4. `const own = slot.subject ? rows.find(…) : null;` 与 `days[date] = { … };` 两行替换为：

```js
    const ofSubject = (subject) =>
      subject ? (rows.find((row) => cycleCourseMap.get(row.course)?.subject === subject)?.course ?? null) : null;
    days[date] = {
      cycle: cycle.cycle,
      week: weekOf(cycle, date),
      type: slot.type,
      subject: slot.subject,
      course: ofSubject(slot.subject),
      aux: slot.aux,
      auxCourse: ofSubject(slot.aux),
    };
```

5. return 里 `subjects,` 后面加 `roles,`。

### 1f. `planInfo`

1. `cycleInfo` 对象里 `next: …` 后面加：

```js
    subjects: cycle.subjects,
    auxSubjects: cycleAuxSubjects(cycle),
```

2. `list` 每项里 `subject: info.subject,` 后面加 `role: info.role,`。
3. 注释里 cycle 的字段列表加 `subjects, auxSubjects`，courses 的字段加 `role`。

### 1g. `checkCycle`

1. `deepDays` 的过滤条件 `slot.subject === subject` 改为 `slot.subject === subject || slot.aux === subject`。
2. 「本周期没有排课的课程」那段循环保持只遍历 `cycleSubjects(cycle)`（辅助科目可以暂时没有课，不报）。注释第一行加一句：`辅助科目可以暂时没有课。`

## 第 2 步：`skills/cycle-plan/cycle.test.mjs`

1. import 加 `cycleAuxSubjects`。
2. 在 `SUBJECT_Y` 下面加：

```js
const SUBJECT_Z = "# C\n\n## Materials\n\n### 书籍\n\n- ● 学习中 · 主线 · [[src-d]] → [[courses/d\\|C]]\n";
const CYCLE_AUX = CYCLE.replace("| 星期 | 类型 | 科目 |", "| 星期 | 类型 | 主项 | 辅助 |")
  .replace("| 周一 | 深度 | [[subjects/x\\|离散]] |", "| 周一 | 深度 | [[subjects/x\\|离散]] | [[subjects/z\\|C]] |")
  .replace("| 周三 | 深度 | [[subjects/x\\|离散]] |", "| 周三 | 深度 | [[subjects/x\\|离散]] | [[subjects/z\\|C]] |");
```

   （若 `CYCLE` 的表头不是 `| 星期 | 类型 | 科目 |` 而是 `| 星期 | 类型 | 课程 |`，照实际表头替换。）`writeSubjects` 里再写一页 `z.md`（内容 `SUBJECT_Z`）。
3. `SUBJECT_OF` 加 `d: "z"`，`NAME_OF` 加 `d: "C"`，新增 `const ROLE_OF = { a: "main", b: "main", c: "main", d: "aux" };`，`coursesFrom` 里 `map.set(slug, { subject: SUBJECT_OF[slug], …` 加 `role: ROLE_OF[slug],`。
4. 所有对 `cycle.template[n]` 的 `deepEqual` 期望加 `aux: null`（如 `{ type: "深度", subject: "x", aux: null }`）。
5. 所有对 `info.days[...]` / `monthInfo(...).days[...]` 的 `deepEqual` 期望在 `course` 后加 `aux: null, auxCourse: null`。
6. `planInfo gives …` 测试：`info.cycle` 的期望对象加 `subjects: { x: "离散", y: "范式" }, auxSubjects: []`；`info.courses[0]` 期望加 `role: "main"`。
7. 文件末尾追加：

```js
test("parseCycle reads the 辅助 column; dayInfo, monthInfo and checkCycle handle aux courses", () => {
  const cycle = parseCycle(CYCLE_AUX);
  assert.deepEqual(cycle.template[1], { type: "深度", subject: "x", aux: "z" });
  assert.deepEqual(cycle.template[2], { type: "深度", subject: "y", aux: null });
  assert.deepEqual(cycleAuxSubjects(cycle), ["z"]);
  assert.equal(cycle.subjects.z, "C");
  assert.throws(() => parseCycle(CYCLE_AUX.replace("| 周五 | 整合 | — |", "| 周五 | 整合 | — | [[subjects/z\\|C]] |")), /不能排辅助/);
  assert.throws(() => parseCycle(CYCLE_AUX.replace("| 周一 | 深度 | [[subjects/x\\|离散]] | [[subjects/z\\|C]] |", "| 周一 | 深度 | [[subjects/x\\|离散]] | [[subjects/x\\|离散]] |")), /同一个科目/);
  assert.throws(() => parseCycle(CYCLE_AUX.replace("| 周三 | 深度 | [[subjects/x\\|离散]] | [[subjects/z\\|C]] |", "| 周三 | 深度 | [[subjects/x\\|离散]] | [[subjects/y\\|范式]] |")), /既是主项又是辅助/);

  const D_DAYS = parseDays("mon,wed", SUN);
  const dRows = planSchedule(lessons(3), { ...RANGE, days: D_DAYS });
  const courses = coursesFrom({ a: courseText(aRows, A_DAYS), b: courseText(bRows, B_DAYS), d: courseText(dRows, D_DAYS) });
  const mon = dayInfo(cycle, courses, "2026-11-09");
  assert.equal(mon.course, "a");
  assert.equal(mon.aux, "z");
  assert.equal(mon.auxCourse, "d");
  assert.deepEqual(mon.roles, { a: "main", b: "main", d: "aux" });
  assert.deepEqual(mon.lessons.map((item) => item.course).sort(), ["a", "d"]);
  const tue = dayInfo(cycle, courses, "2026-11-10");
  assert.equal(tue.aux, null);
  assert.equal(tue.auxCourse, null);

  const month = monthInfo([cycle], "2026-11", { courses: new Map([["C1", courses]]) });
  assert.deepEqual(month.days["2026-11-09"], { cycle: "C1", week: 1, type: "深度", subject: "x", course: "a", aux: "z", auxCourse: "d" });
  assert.equal(month.roles.d, "aux");

  assert.deepEqual(checkCycle(cycle, courses), []);
  const TUE = parseDays("tue", SUN);
  const wrong = coursesFrom({ a: courseText(aRows, A_DAYS), b: courseText(bRows, B_DAYS), d: courseText(planSchedule(lessons(2), { ...RANGE, days: TUE }), TUE) });
  assert.ok(checkCycle(cycle, wrong).some((problem) => /courses\/d 的上课日（周二）不是 subjects\/z 的深度日/.test(problem)));
  assert.deepEqual(checkCycle(cycle, coursesFrom({ a: courseText(aRows, A_DAYS), b: courseText(bRows, B_DAYS) })), []);
});

test("CLI: overview marks aux courses", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cycle-aux-"));
  try {
    await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
    await mkdir(join(vault, "wiki", "courses"), { recursive: true });
    await writeSubjects(vault);
    await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE_AUX);
    await writeFile(join(vault, "wiki", "courses", "a.md"), courseText(aRows, A_DAYS));
    await writeFile(join(vault, "wiki", "courses", "b.md"), courseText(bRows, B_DAYS));
    const D_DAYS = parseDays("mon,wed", SUN);
    await writeFile(join(vault, "wiki", "courses", "d.md"), courseText(planSchedule(lessons(3), { ...RANGE, days: D_DAYS }), D_DAYS));
    const info = JSON.parse((await run("node", [SCRIPT, "overview", vault, "--date", "2026-11-06", "--json"])).stdout);
    assert.deepEqual(info.courses.map((item) => [item.slug, item.role]), [["a", "main"], ["b", "main"], ["d", "aux"]]);
    assert.deepEqual(info.cycle.auxSubjects, ["z"]);
    assert.deepEqual(JSON.parse((await run("node", [SCRIPT, "check", vault, "--json"])).stdout), { ok: true, problems: [] });
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});
```

改完 `cd /Users/gjy/pi-learning/xuegen && npm test` 必须全绿。

## 第 3 步：`apps/desktop/src/shared/data-protocol.ts`

1. 新类型（放在 `CycleDayType` 下面）：

```ts
/** A cycle course's role: a main subject's course, or an auxiliary (preview, not assessed) one. */
export type CourseRole = "main" | "aux";
```

2. `CycleDay`：`course` 后面加

```ts
  /** The auxiliary subject of a 深度 day, or null. */
  aux: string | null;
  /** The auxiliary subject's course for that day (same rule as `course`), or null. */
  auxCourse: string | null;
```

   `subjects` 后面加 `/** Course slug → main or aux. */ roles: Record<string, CourseRole>;`（分两行写）。
3. `CycleSlot`：`course` 后面加 `aux: string | null;` 与 `auxCourse: string | null;`。
4. `CycleMonth`：`subjects` 后面加 `roles: Record<string, CourseRole>;`。
5. `CycleCourseProgress`：`subject` 后面加 `role: CourseRole;`。
6. `CycleOverview.cycle`：`next` 后面加

```ts
    /** Subject slug → short name (main and aux columns). */
    subjects: Record<string, string>;
    /** The auxiliary column's subjects, in template order. */
    auxSubjects: string[];
```

## 第 4 步：`renderer/core/board/plan-view.ts` 与测试

1. `CourseCard` 接口加 `role: CourseRole;`（import `CourseRole`）；`courseCards` 返回对象里 `slug` 后面加 `role: course.role,`。
2. `cellTag` 里 `const lesson = month.lessons[date]?.[0];` 改为 `const lesson = (month.lessons[date] ?? []).find((item) => month.roles[item.course] !== "aux");`。
3. 在 `cellTag` 下面加：

```ts
/** The cell's second line: the aux lesson's short course name, else the day's aux subject short name, else "". */
export function cellAuxTag(month: CycleMonth | null, date: string): string {
  if (!month) return "";
  const lesson = (month.lessons[date] ?? []).find((item) => month.roles[item.course] === "aux");
  if (lesson) return month.names[lesson.course] ?? lesson.course;
  const slot = month.days[date];
  return slot?.aux ? (month.subjects[slot.aux] ?? slot.aux) : "";
}
```

4. `dayLessons` 返回类型改为 `{ name: string; id: string; content: string; aux: boolean }[]`，map 里加 `aux: month.roles[lesson.course] === "aux",`。
5. `plan-view.test.ts`：`OVERVIEW.courses` 两项加 `role: "main",`；`OVERVIEW.cycle` 加 `subjects: { "discrete-math": "离散", "programming-paradigms": "范式" }, auxSubjects: []`；`courseCards` 第二个测试里手写的课程加 `role: "main",`；`MONTH.days` 每项加 `aux: null, auxCourse: null`，`MONTH` 加 `roles: { epp: "main", ctm: "main" }`；`dayLessons` 的期望加 `aux: false`；`courseCards` 第一个测试的 `toEqual` 期望加 `role: "main"`。追加：

```ts
describe("aux cells", () => {
  const AUX: CycleMonth = {
    ...MONTH,
    days: { ...MONTH.days, "2026-12-21": { cycle: "C1", week: 7, type: "深度", subject: "discrete-math", course: "epp", aux: "c-systems", auxCourse: "effc" } },
    lessons: { "2026-12-21": [{ course: "effc", id: "D2", content: "指针" }, { course: "epp", id: "D14", content: "组合数" }] },
    names: { epp: "离散", ctm: "CTM", effc: "Effective C" },
    subjects: { "discrete-math": "离散", "programming-paradigms": "范式", "c-systems": "C" },
    roles: { epp: "main", ctm: "main", effc: "aux" },
  };
  it("the main tag skips aux lessons; the aux tag shows the aux course, else the aux subject", () => {
    expect(cellTag(AUX, "2026-12-21")).toBe("离散");
    expect(cellAuxTag(AUX, "2026-12-21")).toBe("Effective C");
    const noLesson = { ...AUX, lessons: {} };
    expect(cellAuxTag(noLesson, "2026-12-21")).toBe("C");
    expect(cellAuxTag(AUX, "2026-12-22")).toBe("");
    expect(cellAuxTag(null, "2026-12-21")).toBe("");
    expect(dayLessons(AUX, "2026-12-21").map((item) => item.aux)).toEqual([true, false]);
  });
});
```

（import 里加 `cellAuxTag`。）

## 第 5 步：`renderer/core/board/cycle-today.ts` 与测试

1. `CycleTodayView` 接口加：

```ts
  /** The day's auxiliary lesson (a short preview, not assessed), or null. */
  aux: { lesson: CycleLesson; name: string } | null;
```

2. `cycleTodayView` 里：
   - `const focusCourse = day.lessons[0]?.course ?? day.course;` 改为：

```ts
  const isAux = (slug: string): boolean => day.roles[slug] === "aux";
  const mainLessons = day.lessons.filter((item) => !isAux(item.course));
  const focusCourse = mainLessons[0]?.course ?? day.course;
```

   - `const lesson = carried ?? day.lessons[0] ?? null;` 改为 `const lesson = carried ?? mainLessons[0] ?? null;`
   - `missed` 的 `.filter((row) => row !== carried)` 改为 `.filter((row) => row !== carried && !isAux(row.course))`
   - return 对象里 `missed,` 后面加：

```ts
    aux: (() => {
      const auxLesson =
        day.lessons.find((item) => isAux(item.course)) ??
        day.overdue.find((item) => item.course === day.auxCourse) ??
        null;
      return auxLesson
        ? { lesson: { course: auxLesson.course, id: auxLesson.id, content: auxLesson.content }, name: cycleName(day, auxLesson.course) }
        : null;
    })(),
```

3. `weekChecks`：`Object.keys(day.names).flatMap((slug) => {` 改为 `Object.keys(day.names).filter((slug) => day.roles[slug] !== "aux").flatMap((slug) => {`。
4. `cycle-today.test.ts`：已有的 `CycleDay` 构造补 `aux: null, auxCourse: null, roles: {}`（有课程的写对应 `"main"`）；已有 `cycleTodayView` 结果用 `toEqual` 比较的，期望加 `aux: null`。追加一个测试：周一 `lessons` 里有 `{ course: "effc", id: "D1", content: "指针" }`（`roles.effc = "aux"`）和 `{ course: "discrete-math-epp", id: "D2", content: "真值表" }`，`overdue` 有一条 `effc` 的过期课：断言 `focus.lesson.course` 是 `discrete-math-epp`，`aux.lesson.id` 是 `D1`，`missed` 里没有 `effc`；`weekChecks` 结果不含 `effc`。

## 第 6 步：`renderer/gallery/panel-samples.ts` 与其他补字段

- `SAMPLE_CYCLE_OUTSIDE` 补 `aux: null, auxCourse: null, roles: {}`；`SAMPLE_CYCLE_DAY` 补 `aux: null, auxCourse: null, roles: { "discrete-math-epp": "main", ctm: "main" }`。
- `SAMPLE_CYCLE_MONTH.days` 每项补 `aux: null, auxCourse: null`，加 `roles: { "discrete-math-epp": "main", ctm: "main" }`。
- `SAMPLE_OVERVIEW.cycle` 补 `subjects: { "discrete-math": "离散", "programming-paradigms": "范式" }, auxSubjects: []`；`courses` 每项补 `role: "main"`。
- 跑 `npm run typecheck`，其他测试里手写的这些类型缺字段的，照上面补（`aux: null, auxCourse: null, roles: {}` / `role: "main"`），在报告里列出。

## 验收命令（全部贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && npm test && npm run lint:skills
cd /Users/gjy/pi-learning/xuegen && git status --short
```

## 结束报告

改了哪些文件；每一步是否照做；偏离之处（尤其测试期望与实际不符时的实际值）；补字段的测试文件；未完成项。
