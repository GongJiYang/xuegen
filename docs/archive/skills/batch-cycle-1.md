# 批次 cycle-1：排期脚本支持「只在指定星期上新课」

> 给 Devin（SWE-2）的**逐步执行清单**。按步骤原样做，不要自行设计；某一步做不到时停下，在报告里写清卡在哪一步、报错原文。

## 本批硬约束（压缩后也要记得）

1. 只改三个文件：`skills/course/course-schedule.mjs`、`skills/course/course-schedule.test.mjs`、`skills/course/SKILL.md`。其他文件一律不动。
2. 脚本保持零依赖（只用 `node:` 内置模块），不加 npm 包。
3. 不读写 `~/.xuegen/`，不碰任何 Obsidian 库（`/Users/gjy/Documents/` 下的东西），不启动 Electron，不 `git commit` / `git push`。
4. 不改已有测试的断言；只在测试文件末尾**追加**新测试，并按第 9 步改 import 行。
5. 不加 `eslint-disable`、`@ts-ignore`。

## 先读

`AGENTS.md`、`docs/skills/AUTHORING.md`、`skills/course/SKILL.md` 的「逐日排期」一节、`skills/course/course-schedule.mjs` 全文、`skills/course/course-schedule.test.mjs` 全文。

## 背景（为什么改）

用户的学习周期是「一天只主攻一个科目」：离散数学只在周一、周三上新课，编程范式只在周二、周四上新课；周五整合、周六低强度，这两天和其他非休息日照样可以做复习；周日休息。现在的 `plan` 只能指定休息日，会把新课排进每一个非休息日。本批加一个 `--days` 参数：

- **上课日 `days`**：只有这些星期排新课次（和「机动」行）。默认为所有非休息日，因此不带 `--days` 时行为与现在完全相同。
- **休息日 `rest`**：什么都不排（不变）。
- **复习**：仍是课次后第 1/3/7/14 天，落在任何非休息日（不变）。
- **顺延 `shift`**：没学的新课次只顺延到**本课程的下一个上课日**；它们没做的复习按新日期重算；已学课次的过期复习挪到今天。

## 步骤

### 第 1 步：文件头注释（`course-schedule.mjs` 第 2–13 行）

把第 4 行
```
//   node course-schedule.mjs plan <course.md> --start YYYY-MM-DD --end YYYY-MM-DD [--rest sun|sat,sun|none] --lessons <lessons.json> [--write] [--json]
```
改成
```
//   node course-schedule.mjs plan <course.md> --start YYYY-MM-DD --end YYYY-MM-DD [--rest sun|sat,sun|none] [--days mon,wed] --lessons <lessons.json> [--write] [--json]
```
把第 9 行
```
//   <!-- xuegen:schedule:start rest=sun -->
```
改成
```
//   <!-- xuegen:schedule:start rest=sun days=mon,wed -->（days 只在不等于「所有非休息日」时写出）
```

### 第 2 步：新增 `parseDays`、`formatDays`、`offDays`、`isDefaultDays`

在 `formatRest` 函数（`export function formatRest(rest) {…}`）**之后**、`function isStudyDay` **之前**，插入下面这段，原样照抄：

```js
/** `mon,wed` → 上新课的星期序号集合；不给（空串 / undefined）时为所有非休息日。 */
export function parseDays(value, rest) {
  if (!value) return new Set([0, 1, 2, 3, 4, 5, 6].filter((day) => !rest.has(day)));
  const days = new Set();
  for (const part of value.split(",").map((item) => item.trim().toLowerCase())) {
    const index = WEEKDAYS.indexOf(part);
    if (index === -1) throw new Error(`未知上课日：${part}（可用 ${WEEKDAYS.join("/")}）`);
    if (rest.has(index)) throw new Error(`上课日 ${part} 同时是休息日`);
    days.add(index);
  }
  return days;
}

export function formatDays(days) {
  return [...days].sort().map((day) => WEEKDAYS[day]).join(",");
}

/** 不上新课的星期（休息日 + 只做复习的日子），用来复用 nextStudyDay / addStudyDays 数上课日。 */
function offDays(days) {
  return new Set([0, 1, 2, 3, 4, 5, 6].filter((day) => !days.has(day)));
}

/** days 是否等于「所有非休息日」（此时排期标记里不写 days=，保持旧格式）。 */
function isDefaultDays(days, rest) {
  return days.size + rest.size === 7;
}
```

### 第 3 步：`planSchedule` 只把新课排在上课日

把整个 `planSchedule` 函数（含上方 JSDoc 注释）替换为：

```js
/**
 * 把课次排进 start..end 的上课日（days，默认所有非休息日），并为每个课次插入 D+1/3/7/14 的复习（落在任何非休息日）。
 * 返回按日期排序的行：{ id, date, kind: "new"|"review"|"flex", content, material, doneWhen }。
 */
export function planSchedule(lessons, { start, end, rest, days }) {
  if (!isValidDate(start) || !isValidDate(end)) throw new Error("start / end 必须是 YYYY-MM-DD");
  if (end < start) throw new Error("截止日期早于开始日期");
  const items = normalizeLessons(lessons);
  const off = offDays(days ?? parseDays("", rest));
  const slots = studyDays(start, end, off);
  if (items.length > slots.length) {
    const first = nextStudyDay(start, off);
    const needed = addStudyDays(first, items.length - 1, off);
    const error = new Error(
      `${items.length} 个课次只有 ${slots.length} 个上课日：至少需要 ${items.length} 个上课日，建议截止日期 ${needed}`,
    );
    error.suggestedEnd = needed;
    throw error;
  }
  const rows = [];
  items.forEach((lesson, index) => {
    const date = slots[index];
    rows.push({ id: lesson.id, date, kind: "new", content: lesson.content, material: lesson.material, doneWhen: lesson.doneWhen });
    REVIEW_OFFSETS.forEach((offset, n) => {
      const reviewDate = nextStudyDay(addDays(date, offset), rest);
      const after = reviewDate > end ? "（课后复习）" : "";
      rows.push({
        id: `R${n + 1}-${lesson.id}`,
        date: reviewDate,
        kind: "review",
        content: `复习：${shortName(lesson.content)}${after}`,
        material: "笔记 / 检查题",
        doneWhen: REVIEW_DONE_WHEN,
      });
    });
  });
  for (const day of slots.slice(items.length)) {
    rows.push({ id: "机动", date: day, kind: "flex", content: "机动：补进度或提前复习", material: "—", doneWhen: "—" });
  }
  return sortRows(rows);
}
```

（与原函数的区别只有：`off` / `slots` 代替 `days`，报错文案里「学习日」改为「上课日」。复习那一段一字不改，仍用 `rest`。）

### 第 4 步：`renderTable` 写出 `days=`

把 `renderTable` 函数替换为：

```js
export function renderTable(rows, rest, days) {
  const daysAttr = days && !isDefaultDays(days, rest) ? ` days=${formatDays(days)}` : "";
  const lines = [
    `<!-- xuegen:schedule:start rest=${formatRest(rest)}${daysAttr} -->`,
    "| 天 | 日期 | 内容 | 材料 | 完成条件 |",
    "|---|---|---|---|---|",
  ];
  for (const row of rows) {
    lines.push(`| ${cell(row.id)} | ${dateLabel(row.date)} | ${cell(row.content)} | ${cell(row.material)} | ${cell(row.doneWhen)} |`);
  }
  lines.push(MARK_END);
  return lines.join("\n");
}
```

### 第 5 步：`readSchedule` 读回 `days`

在 `readSchedule` 里，紧接着这一行
```js
  const rest = parseRest(restMatch ? restMatch[1] : "none");
```
之后插入两行：
```js
  const daysMatch = attrs.match(/days=([a-z,]+)/);
  const days = parseDays(daysMatch ? daysMatch[1] : "", rest);
```
并把该函数的 `return { rows, rest, startIndex, endIndex };` 改为 `return { rows, rest, days, startIndex, endIndex };`，函数上方注释 `{ rows, rest, start, end }` 改为 `{ rows, rest, days, startIndex, endIndex }`。

### 第 6 步：重写 `shiftSchedule`

把整个 `shiftSchedule` 函数（含上方 JSDoc 注释）替换为：

```js
/**
 * 没学的补上（已完成的行不动，机动行丢弃）：
 * - 今天之前没学的新课次：从最早的那一个起，所有没学的新课次后移同样多的「上课日」（只落在 days 里的星期）；
 *   这些课次没做的复习按新日期重算（+1/3/7/14 天，落在非休息日）。
 * - 其余过期未做的复习（所属课次已学或没有后移）：挪到今天（今天是休息日则挪到之后第一个非休息日）。
 * 返回 { rows, shiftedDays（新课后移的上课日数）, movedReviews（挪到今天的复习条数）}。
 */
export function shiftSchedule(rows, done, today, rest, days = parseDays("", rest)) {
  const off = offDays(days);
  const kept = rows.filter((row) => row.kind !== "flex");
  const overdueNew = kept.filter((row) => row.kind === "new" && !done.has(row.id) && row.date < today);
  const first = overdueNew.reduce((min, row) => (row.date < min ? row.date : min), today);
  const shiftedDays = overdueNew.length === 0 ? 0 : studyDaysBetween(first, today, off);
  const lessons = new Map();
  for (const row of kept) {
    if (row.kind !== "new") continue;
    const moved = shiftedDays > 0 && !done.has(row.id) && row.date >= first;
    lessons.set(row.id, { date: moved ? addStudyDays(row.date, shiftedDays, off) : row.date, moved });
  }
  const dueNow = nextStudyDay(today, rest);
  let movedReviews = 0;
  const result = kept.map((row) => {
    if (done.has(row.id)) return row;
    if (row.kind === "new") return { ...row, date: lessons.get(row.id).date };
    const match = /^R(\d+)-(.+)$/.exec(row.id);
    const lesson = match ? lessons.get(match[2]) : undefined;
    const offset = match ? REVIEW_OFFSETS[Number(match[1]) - 1] : undefined;
    if (lesson && lesson.moved && offset !== undefined) {
      return { ...row, date: nextStudyDay(addDays(lesson.date, offset), rest) };
    }
    if (row.date < today) {
      movedReviews += 1;
      return { ...row, date: dueNow };
    }
    return row;
  });
  if (shiftedDays === 0 && movedReviews === 0) return { rows, shiftedDays: 0, movedReviews: 0 };
  return { rows: sortRows(result), shiftedDays, movedReviews };
}
```

### 第 7 步：CLI 的 `plan` 读 `--days`

在 `main()` 的 `plan` 分支里：

1. `let rows;` 之后加一行 `let days;`。
2. 把
   ```js
      rest = parseRest(flags.rest ?? "sun");
      rows = planSchedule(lessons, { start, end, rest });
   ```
   改为
   ```js
      rest = parseRest(flags.rest ?? "sun");
      days = parseDays(flags.days, rest);
      rows = planSchedule(lessons, { start, end, rest, days });
   ```
3. 把 `const table = renderTable(rows, rest);` 改为 `const table = renderTable(rows, rest, days);`。

### 第 8 步：CLI 的 `shift` 用 `days` 并报告挪动的复习

把 `if (command === "shift") { … }` 整个分支替换为：

```js
  if (command === "shift") {
    const today = flags.today ? requireDate(flags.today, "--today") : localToday();
    const done = completedIds(text);
    const { rows, shiftedDays, movedReviews } = shiftSchedule(schedule.rows, done, today, schedule.rest, schedule.days);
    const changed = shiftedDays > 0 || movedReviews > 0;
    const result = { ok: true, shiftedDays, movedReviews, lastLesson: lastNewLessonDate(rows), written: false };
    if (changed && flags.write) {
      await save(file, writeSchedule(text, renderTable(rows, schedule.rest, schedule.days)));
      result.written = true;
    }
    process.stdout.write(
      flags.json
        ? `${JSON.stringify(result)}\n`
        : !changed
          ? "没有需要顺延的安排\n"
          : `没学的新课顺延 ${shiftedDays} 个上课日（最后一节 ${result.lastLesson}），${movedReviews} 条过期复习挪到今天${result.written ? "（已写入）" : "（未写入，加 --write）"}\n`,
    );
    return;
  }
```

并把 `usage()` 里 plan 那一行改为：
```js
    "  node course-schedule.mjs plan <course.md> --start YYYY-MM-DD --end YYYY-MM-DD [--rest sun|sat,sun|none] [--days mon,wed] --lessons <lessons.json> [--write] [--json]",
```

### 第 9 步：测试（`course-schedule.test.mjs`）

1. import 列表里按字母序加入 `parseDays`（放在 `nextStudyDay` 与 `parseRest` 之间）。
2. 在文件**末尾**追加以下测试，原样照抄：

```js
const MW = parseDays("mon,wed", SUN);

test("parseDays defaults to every non-rest day and rejects rest or unknown days", () => {
  assert.deepEqual([...parseDays("", SUN)].sort(), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...MW].sort(), [1, 3]);
  assert.throws(() => parseDays("sun", SUN), /休息日/);
  assert.throws(() => parseDays("xyz", SUN), /未知上课日/);
});

test("plan with --days puts new lessons only on those weekdays; reviews still land on any non-rest day", () => {
  const rows = planSchedule(lessons(4), { start: "2026-11-05", end: "2026-11-18", rest: SUN, days: MW });
  assert.deepEqual(
    rows.filter((row) => row.kind === "new").map((row) => [row.id, row.date]),
    [
      ["D1", "2026-11-09"],
      ["D2", "2026-11-11"],
      ["D3", "2026-11-16"],
      ["D4", "2026-11-18"],
    ],
  );
  assert.deepEqual(
    rows.filter((row) => row.id.endsWith("-D1")).map((row) => [row.id, row.date]),
    [
      ["R1-D1", "2026-11-10"],
      ["R2-D1", "2026-11-12"],
      ["R3-D1", "2026-11-16"],
      ["R4-D1", "2026-11-23"],
    ],
  );
  assert.equal(rows.filter((row) => row.kind === "flex").length, 0);
  assert.ok(rows.every((row) => weekday(row.date) !== 0), "no row on a Sunday");
  assert.throws(
    () => planSchedule(lessons(5), { start: "2026-11-05", end: "2026-11-18", rest: SUN, days: MW }),
    (error) => error.suggestedEnd === "2026-11-23",
  );
});

test("days round-trip through the schedule marker; default days keep the old marker", () => {
  const rows = planSchedule(lessons(2), { start: "2026-11-05", end: "2026-11-18", rest: SUN, days: MW });
  const table = renderTable(rows, SUN, MW);
  assert.match(table, /xuegen:schedule:start rest=sun days=mon,wed -->/);
  assert.deepEqual([...readSchedule(course(table + "\n")).days].sort(), [1, 3]);
  assert.match(renderTable(rows, SUN), /xuegen:schedule:start rest=sun -->/);
  assert.match(renderTable(rows, SUN, parseDays("", SUN)), /xuegen:schedule:start rest=sun -->/);
  assert.equal(readSchedule(course(renderTable(rows, SUN) + "\n")).days.size, 6);
});

test("shift with days moves missed lessons to the next lesson day and recomputes their reviews", () => {
  const rows = planSchedule(lessons(4), { start: "2026-11-05", end: "2026-11-18", rest: SUN, days: MW });
  // D1 (Mon 11-09) missed; today is Tue 11-10.
  const { rows: moved, shiftedDays, movedReviews } = shiftSchedule(rows, new Set(), "2026-11-10", SUN, MW);
  assert.equal(shiftedDays, 1);
  assert.equal(movedReviews, 0);
  const byId = Object.fromEntries(moved.map((row) => [row.id, row.date]));
  assert.equal(byId.D1, "2026-11-11");
  assert.equal(byId.D2, "2026-11-16");
  assert.equal(byId.D3, "2026-11-18");
  assert.equal(byId.D4, "2026-11-23");
  assert.equal(byId["R1-D1"], "2026-11-12");
  assert.equal(byId["R2-D1"], "2026-11-14");
  assert.equal(byId["R4-D4"], "2026-12-07");
});

test("shift moves an overdue review of a finished lesson to today without moving lessons", () => {
  const rows = planSchedule(lessons(4), { start: "2026-11-05", end: "2026-11-18", rest: SUN, days: MW });
  // D1, D2 done; R1-D1 (Tue 11-10) missed; today is Thu 11-12.
  const result = shiftSchedule(rows, new Set(["D1", "D2"]), "2026-11-12", SUN, MW);
  assert.equal(result.shiftedDays, 0);
  assert.equal(result.movedReviews, 1);
  const byId = Object.fromEntries(result.rows.map((row) => [row.id, row.date]));
  assert.equal(byId["R1-D1"], "2026-11-12");
  assert.equal(byId["R2-D1"], "2026-11-12");
  assert.equal(byId.D3, "2026-11-16");
});

test("CLI: plan --days writes the marker; shift keeps it and reports moved reviews", async () => {
  const dir = await mkdtemp(join(tmpdir(), "course-schedule-days-"));
  try {
    const file = join(dir, "c.md");
    const lessonsFile = join(dir, "lessons.json");
    await writeFile(file, course(""));
    await writeFile(lessonsFile, JSON.stringify(lessons(4)));

    const planned = await run("node", [SCRIPT, "plan", file, "--start", "2026-11-05", "--end", "2026-11-18", "--rest", "sun", "--days", "mon,wed", "--lessons", lessonsFile, "--write", "--json"]);
    assert.equal(JSON.parse(planned.stdout).lastLesson, "2026-11-18");
    assert.match(await readFile(file, "utf8"), /rest=sun days=mon,wed/);

    // The fixture's Learning Record marks D1 done. D2 (Wed 11-11) missed and R1-D1 (Tue 11-10) missed; today Thu 11-12.
    const shifted = await run("node", [SCRIPT, "shift", file, "--today", "2026-11-12", "--write", "--json"]);
    const result = JSON.parse(shifted.stdout);
    assert.equal(result.shiftedDays, 1);
    assert.equal(result.movedReviews, 1);
    assert.equal(result.written, true);
    const after = readSchedule(await readFile(file, "utf8"));
    assert.deepEqual([...after.days].sort(), [1, 3]);
    const byId = Object.fromEntries(after.rows.map((row) => [row.id, row.date]));
    assert.equal(byId.D2, "2026-11-16");
    assert.equal(byId["R1-D1"], "2026-11-12");

    await assert.rejects(
      run("node", [SCRIPT, "plan", file, "--start", "2026-11-05", "--end", "2026-11-18", "--rest", "sun", "--days", "sun", "--lessons", lessonsFile]),
      (error) => /休息日/.test(error.stderr),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

### 第 10 步：`skills/course/SKILL.md` 的「逐日排期」一节

1. 把代码块里这一行
   ```
   node "$S" plan "$F" --start 2026-11-04 --end 2026-12-01 --rest sun --lessons <临时文件> [--write]
   ```
   改为两行：
   ```
   node "$S" plan "$F" --start 2026-11-04 --end 2026-12-01 --rest sun --lessons <临时文件> [--write]
   node "$S" plan "$F" --start 2026-11-05 --end 2026-12-23 --rest sun --days mon,wed --lessons <临时文件> [--write]   # 只在周一、周三上新课
   ```
2. 把这一行
   ```
   node "$S" shift "$F" --today <本机今天> [--write]     # 没学的天整体顺延
   ```
   改为
   ```
   node "$S" shift "$F" --today <本机今天> [--write]     # 没学的新课顺延到下一个上课日，过期复习挪到今天
   ```
3. 把以「- 每个学习日一个新课次；」开头的那一条整条替换为：
   ```
   - `--days` 指定上新课的星期（默认所有非休息日；不能包含休息日）：每个上课日一个新课次，空出的上课日是「机动」。每个课次在学完后第 1、3、7、14 天各有一次简短复习，复习可落在任何非休息日（落在休息日顺延到下一天，超过截止日期的标「课后复习」）。`--days` 记在排期标记里（`days=mon,wed`），之后的 shift 自动沿用。学习周期规定了本科目的深度日时，`--days` 就用那几天。
   ```
4. 把「- 课次多于学习日时」开头那一条里的「学习日」改为「上课日」（两处）。
5. 把「**开始今天的学习时**」那一条里的
   ```
   有顺延就用一句话告诉用户「之前没学的 N 个学习日已整体顺延，新课最后一天是 X」
   ```
   改为
   ```
   有变化就用一句话告诉用户「没学的新课顺延了 N 个上课日（最后一节 X），M 条过期复习挪到今天」
   ```

## 完成标准（可观察）

- 下面三条命令全部通过，贴出每条命令输出的最后 15 行：
  ```sh
  cd /Users/gjy/pi-learning/xuegen && npm test
  cd /Users/gjy/pi-learning/xuegen && npm run lint:skills
  cd /Users/gjy/pi-learning/xuegen && git status --short skills/ docs/
  ```
- `npm test` 里原有的 course-schedule 测试和新增的 6 个测试都通过（新测试名见第 9 步）。
- `git status` 只出现本批三个文件被修改（`docs/skills/batch-cycle-1.md` 是任务单本身，会显示为未跟踪，正常）。

## 结束报告

列出：改了哪些文件；每一步是否照做；偏离清单之处及原因（没有就写「无」）；未完成项。
