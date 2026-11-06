# 批次 cycle-2：排期可不排复习（交给 Anki）、可加额外上课日；收课时提议闪卡

> 给 Devin（SWE-2）的**逐步执行清单**。按步骤原样做，不要自行设计；某一步做不到时停下，在报告里写清卡在哪一步、报错原文。

## 本批硬约束（压缩后也要记得）

1. 只改三个文件：`skills/course/course-schedule.mjs`、`skills/course/course-schedule.test.mjs`、`skills/course/SKILL.md`。其他文件一律不动。
2. 脚本保持零依赖（只用 `node:` 内置模块），不加 npm 包。
3. 不读写 `~/.xuegen/`，不碰任何 Obsidian 库（`/Users/gjy/Documents/` 下的东西），不启动 Electron，不 `git commit` / `git push`。
4. 不改已有测试的断言；只在测试文件末尾**追加**新测试，并按第 8 步改 import 行。
5. 不加 `eslint-disable`、`@ts-ignore`。

## 先读

`AGENTS.md`、`docs/skills/AUTHORING.md`、`skills/course/course-schedule.mjs` 全文（上一批 cycle-1 刚加了 `--days`）、`skills/course/course-schedule.test.mjs` 全文、`skills/course/SKILL.md` 的「逐日排期」与「收课：打勾与抵消」两节。

## 背景

用户决定：(1) 复习全部交给 Anki，计划表里不再排 R1–R4 复习行；(2) 第一周例外，周五 2026-11-06 额外上一节课，之后才按「周一、周三」上新课；(3) 因为 Anki 只复习做成卡的内容，收课时要先提议卡片，用户确认后才写入。旧课程（没有新参数的）行为必须完全不变。

## 步骤

### 第 1 步：文件头注释

把第 4 行改为：
```
//   node course-schedule.mjs plan <course.md> --start YYYY-MM-DD --end YYYY-MM-DD [--rest sun|sat,sun|none] [--days mon,wed] [--extra YYYY-MM-DD,…] [--reviews spaced|anki] --lessons <lessons.json> [--write] [--json]
```
把第 9 行改为：
```
//   <!-- xuegen:schedule:start rest=sun days=mon,wed reviews=anki -->（days 只在不等于「所有非休息日」时写出；reviews 只在为 anki 时写出；extra 不记录）
```

### 第 2 步：新增 `parseReviews`、`parseExtra`

在 `isDefaultDays` 函数之后、`function isStudyDay` 之前插入，原样照抄：

```js
/** 复习方式：spaced（默认，计划表里排 +1/3/7/14 天复习）或 anki（不排复习行，复习交给 Anki）。 */
export function parseReviews(value) {
  if (!value || value === "spaced") return "spaced";
  if (value === "anki") return "anki";
  throw new Error(`未知复习方式：${value}（可用 spaced / anki）`);
}

/** `2026-11-06,2026-11-13` → 周模板之外的额外上课日；须在 start..end 之内且不是休息日。 */
export function parseExtra(value, { start, end, rest }) {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).map((date) => {
    if (!isValidDate(date)) throw new Error(`额外上课日必须是 YYYY-MM-DD：${date}`);
    if (date < start || date > end) throw new Error(`额外上课日 ${date} 不在 ${start} ~ ${end} 之内`);
    if (rest.has(weekday(date))) throw new Error(`额外上课日 ${date} 是休息日`);
    return date;
  });
}
```

### 第 3 步：`planSchedule` 支持 `extra` 与 `reviews`

在 `planSchedule` 里做四处修改（其余不动）：

1. 函数签名
   ```js
   export function planSchedule(lessons, { start, end, rest, days }) {
   ```
   改为
   ```js
   export function planSchedule(lessons, { start, end, rest, days, extra = [], reviews = "spaced" }) {
   ```
2. 这一行
   ```js
     const slots = studyDays(start, end, off);
   ```
   改为
   ```js
     const regular = studyDays(start, end, off);
     const extraOnly = extra.filter((date) => !regular.includes(date));
     const slots = [...regular, ...extraOnly].sort();
   ```
3. 报错段里这一行
   ```js
       const needed = addStudyDays(first, items.length - 1, off);
   ```
   改为
   ```js
       const needed = addStudyDays(first, items.length - extraOnly.length - 1, off);
   ```
4. 把 `REVIEW_OFFSETS.forEach((offset, n) => {` 开头、到对应的 `});` 结束的整段复习代码，用 `if (reviews !== "anki") { … }` 包起来（大括号内原样不动）。

同时把函数上方 JSDoc 的第一行改为：
```js
 * 把课次排进 start..end 的上课日（days，默认所有非休息日；extra 为额外上课日），reviews 为 spaced 时为每个课次插入 D+1/3/7/14 的复习（落在任何非休息日），为 anki 时不排复习行。
```

### 第 4 步：`renderTable` 写出 `reviews=anki`

把 `renderTable` 的签名和前两行
```js
export function renderTable(rows, rest, days) {
  const daysAttr = days && !isDefaultDays(days, rest) ? ` days=${formatDays(days)}` : "";
```
改为
```js
export function renderTable(rows, rest, days, reviews = "spaced") {
  const daysAttr = days && !isDefaultDays(days, rest) ? ` days=${formatDays(days)}` : "";
  const reviewsAttr = reviews === "anki" ? " reviews=anki" : "";
```
并把标记行
```js
    `<!-- xuegen:schedule:start rest=${formatRest(rest)}${daysAttr} -->`,
```
改为
```js
    `<!-- xuegen:schedule:start rest=${formatRest(rest)}${daysAttr}${reviewsAttr} -->`,
```

### 第 5 步：`readSchedule` 读回 `reviews`

在 `readSchedule` 里，紧接着 `const days = parseDays(daysMatch ? daysMatch[1] : "", rest);` 之后插入：
```js
  const reviewsMatch = attrs.match(/reviews=([a-z]+)/);
  const reviews = parseReviews(reviewsMatch ? reviewsMatch[1] : undefined);
```
把 `return { rows, rest, days, startIndex, endIndex };` 改为 `return { rows, rest, days, reviews, startIndex, endIndex };`，上方注释里的返回结构同步加上 `reviews`。

### 第 6 步：CLI `plan` 读 `--extra`、`--reviews`

在 `plan` 分支里：

1. `let days;` 之后加两行：`let extra;`、`let reviews;`。
2. 把
   ```js
      days = parseDays(flags.days, rest);
      rows = planSchedule(lessons, { start, end, rest, days });
   ```
   改为
   ```js
      days = parseDays(flags.days, rest);
      extra = parseExtra(flags.extra, { start, end, rest });
      reviews = parseReviews(flags.reviews);
      rows = planSchedule(lessons, { start, end, rest, days, extra, reviews });
   ```
3. 把 `const table = renderTable(rows, rest, days);` 改为 `const table = renderTable(rows, rest, days, reviews);`。

### 第 7 步：CLI `shift` 保留 `reviews`，并更新用法

1. `shift` 分支里把 `renderTable(rows, schedule.rest, schedule.days)` 改为 `renderTable(rows, schedule.rest, schedule.days, schedule.reviews)`。
2. `usage()` 里 plan 那一行改为：
   ```js
    "  node course-schedule.mjs plan <course.md> --start YYYY-MM-DD --end YYYY-MM-DD [--rest sun|sat,sun|none] [--days mon,wed] [--extra YYYY-MM-DD,…] [--reviews spaced|anki] --lessons <lessons.json> [--write] [--json]",
   ```

### 第 8 步：测试（`course-schedule.test.mjs`）

1. import 列表按字母序加入 `parseExtra`、`parseReviews`（放在 `parseDays` 之后、`parseRest` 之前：`parseDays, parseExtra, parseRest, parseReviews` —— 注意 `parseReviews` 排在 `parseRest` 之后）。
2. 在文件**末尾**追加，原样照抄：

```js
const EXTRA_RANGE = { start: "2026-11-06", end: "2026-11-18", rest: SUN };

test("parseReviews and parseExtra validate their input", () => {
  assert.equal(parseReviews(undefined), "spaced");
  assert.equal(parseReviews("anki"), "anki");
  assert.throws(() => parseReviews("weekly"), /未知复习方式/);
  assert.deepEqual(parseExtra("2026-11-06", EXTRA_RANGE), ["2026-11-06"]);
  assert.deepEqual(parseExtra("", EXTRA_RANGE), []);
  assert.throws(() => parseExtra("2026-11-08", EXTRA_RANGE), /休息日/);
  assert.throws(() => parseExtra("2026-11-30", EXTRA_RANGE), /不在/);
  assert.throws(() => parseExtra("11-06", EXTRA_RANGE), /YYYY-MM-DD/);
});

test("reviews=anki leaves out review rows; extra adds a lesson day outside the weekly template", () => {
  const rows = planSchedule(lessons(4), { ...EXTRA_RANGE, days: MW, extra: ["2026-11-06"], reviews: "anki" });
  assert.deepEqual(
    rows.filter((row) => row.kind === "new").map((row) => [row.id, row.date]),
    [
      ["D1", "2026-11-06"],
      ["D2", "2026-11-09"],
      ["D3", "2026-11-11"],
      ["D4", "2026-11-16"],
    ],
  );
  assert.equal(rows.filter((row) => row.kind === "review").length, 0);
  assert.deepEqual(rows.filter((row) => row.kind === "flex").map((row) => row.date), ["2026-11-18"]);
  assert.throws(
    () => planSchedule(lessons(6), { ...EXTRA_RANGE, days: MW, extra: ["2026-11-06"], reviews: "anki" }),
    (error) => error.suggestedEnd === "2026-11-23",
  );
});

test("reviews=anki round-trips through the marker; default keeps the old marker", () => {
  const rows = planSchedule(lessons(2), { ...EXTRA_RANGE, days: MW, reviews: "anki" });
  const table = renderTable(rows, SUN, MW, "anki");
  assert.match(table, /xuegen:schedule:start rest=sun days=mon,wed reviews=anki -->/);
  assert.equal(readSchedule(course(table + "\n")).reviews, "anki");
  assert.doesNotMatch(renderTable(rows, SUN, MW), /reviews=/);
  assert.equal(readSchedule(course(renderTable(rows, SUN) + "\n")).reviews, "spaced");
});

test("CLI: plan --extra --reviews anki writes no review rows; shift keeps reviews=anki", async () => {
  const dir = await mkdtemp(join(tmpdir(), "course-schedule-anki-"));
  try {
    const file = join(dir, "c.md");
    const lessonsFile = join(dir, "lessons.json");
    await writeFile(file, course(""));
    await writeFile(lessonsFile, JSON.stringify(lessons(4)));

    const planned = await run("node", [SCRIPT, "plan", file, "--start", "2026-11-06", "--end", "2026-11-18", "--rest", "sun", "--days", "mon,wed", "--extra", "2026-11-06", "--reviews", "anki", "--lessons", lessonsFile, "--write", "--json"]);
    assert.equal(JSON.parse(planned.stdout).lastLesson, "2026-11-16");
    const text = await readFile(file, "utf8");
    assert.match(text, /rest=sun days=mon,wed reviews=anki/);
    assert.doesNotMatch(text, /\| R1-/);

    // The fixture's Learning Record marks D1 done. D2 (Mon 11-09) missed; today Tue 11-10.
    const shifted = await run("node", [SCRIPT, "shift", file, "--today", "2026-11-10", "--write", "--json"]);
    const result = JSON.parse(shifted.stdout);
    assert.equal(result.shiftedDays, 1);
    assert.equal(result.movedReviews, 0);
    const after = readSchedule(await readFile(file, "utf8"));
    assert.equal(after.reviews, "anki");
    assert.deepEqual([...after.days].sort(), [1, 3]);
    const byId = Object.fromEntries(after.rows.map((row) => [row.id, row.date]));
    assert.equal(byId.D2, "2026-11-11");
    assert.equal(byId.D4, "2026-11-18");

    await assert.rejects(
      run("node", [SCRIPT, "plan", file, "--start", "2026-11-06", "--end", "2026-11-18", "--extra", "2026-11-08", "--lessons", lessonsFile]),
      (error) => /休息日/.test(error.stderr),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

（`MW`、`SUN`、`lessons`、`course`、`run`、`SCRIPT` 都是文件里已有的常量/函数，直接用。）

### 第 9 步：`skills/course/SKILL.md`

1. 第 8 行里的「不自动制卡、」改为「不自动制卡（排期标记含 `reviews=anki` 的课程在收课时先提议卡片，用户确认后才写入，见「收课」第 10 步）、」。
2. 「逐日排期」代码块里，在 `--days mon,wed` 那一行之后插入一行：
   ```
   node "$S" plan "$F" --start 2026-11-06 --end 2026-12-24 --rest sun --days mon,wed --extra 2026-11-06 --reviews anki --lessons <临时文件> [--write]   # 复习交给 Anki；11-06 额外上一课
   ```
3. 在以「- `--days` 指定上新课的星期」开头的那一条**之后**插入新的一条：
   ```
   - `--reviews anki`：计划表不排复习行，复习全部交给 Anki（卡片在收课时提议，见「收课」第 10 步）；默认 `spaced` 才排 +1/3/7/14 天复习。`--extra` 给出周模板之外的额外上课日（逗号分隔，须在起止日期内、不是休息日），只影响这一次排期。`reviews=anki` 记在排期标记里，之后的 shift 自动沿用；extra 不记录。
   ```
4. 在「收课：打勾与抵消」一节第 9 条（以「9. 完成有新内容的收课后」开头）**之后**新增第 10 条：
   ```
   10. **提议闪卡（仅限排期标记含 `reviews=anki` 的课程）**：第 8 步核对保存成功后，从本次记录里**用户已作答并核实**的知识点列出建议卡片（每张写正面、背面、牌组），默认 3–8 张，只在回复里展示，不写文件。用户确认（可删改）后，按 `../wiki-save/SKILL.md`「制作闪卡」与库内 `wiki/prompts/wiki/flashcard-rules.md` 写入；用户说不要就跳过，并说明这次没有制卡、Anki 不会复习今天的内容。没核实过的内容不提议、不制卡；不因为制卡改课程页的勾选。
   ```

## 完成标准（可观察）

- 下面三条命令全部通过，贴出每条输出的最后 15 行：
  ```sh
  cd /Users/gjy/pi-learning/xuegen && npm test
  cd /Users/gjy/pi-learning/xuegen && npm run lint:skills
  cd /Users/gjy/pi-learning/xuegen && git status --short skills/ docs/
  ```
- 原有测试与 cycle-1 加的测试全部仍通过；本批新增 4 个测试通过。
- 本批只改了上面三个文件（`course-schedule.mjs` 与其测试此前未提交，显示为 `??` 是正常的）。

## 结束报告

列出：改了哪些文件；每一步是否照做；偏离清单之处及原因（没有就写「无」）；未完成项。
