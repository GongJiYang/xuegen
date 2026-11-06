# 批次 PL-1：路线终止日期 + 周期总览数据 + 日历课次（只做数据层，不改界面）

设计稿（用户已批准）：`/Users/gjy/pi-learning/design/animate/src/plan.jsx`（`http://localhost:5181/?d=plan`）。本批只做它需要的**数据和纯函数**；Bear 面板的改动在下一批 PL-2。

## 硬约束（先看这里）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。
- 按下面的步骤**逐条照做**，代码照抄；不要自己重新设计、改名或「顺手优化」。某一步做不通时停下，在报告里写清卡在哪，不要换方案。
- 不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 commit / push，不加任何依赖。
- 不准改的文件：`apps/desktop/src/renderer/App.tsx`、`skins/contract.ts` 里本单没写到的部分、所有 `skins/*/` 下的 `.tsx` 和 `.css`。
- 不加 `eslint-disable`、`@ts-ignore`、`@ts-expect-error`，不放宽 lint 规则。

## 背景

库里新加了 `wiki/cycles/route.md`（两年路线页），格式如下（测试里用同样的格式）：

```markdown
---
route: 计算机知识体系 v19
start: 2026-11-06
end: 2028-07-20
buffer_weeks: 12
---

# 两年学习路线

## Cycles

| 周期 | 开始 | 结束 | 主项 | 辅助（下周期主项） | 状态 |
|---|---|---|---|---|---|
| [[cycles/c1\|C1]] | 2026-11-06 | 2026-12-24 | 离散数学、编程语言与编程范式 | 数据结构与算法、C 与系统编程 | 进行中 |
| C2 | 2026-12-25 | 2027-02-11 | 数据结构与算法、C 与系统编程 | 计算机体系结构、计算理论 | 未开始 |
| 恢复周 | 2027-02-12 | 2027-02-18 | — | — | |
```

`skills/cycle-plan/cycle.mjs` 已改为只读 `cycles/c<数字>.md`（第 175 行，已完成，不要动）。

---

## 第 1 步：`skills/cycle-plan/cycle.mjs`

### 1a. 文件头注释（第 1–7 行）改成：

```js
#!/usr/bin/env node
// Xuegen 学习周期：读 wiki/cycles/<cN>.md 的 frontmatter 与周模板、wiki/cycles/route.md 的两年路线，
// 按天给出类型、当天课次与过期未学的课次，以及总进度顶部的路线 / 本周期 / 每门课进度。
// 只读，不写任何文件。无第三方依赖；排期表的解析复用 course 技能的 course-schedule.mjs。
//   node cycle.mjs day <vault> [--date YYYY-MM-DD] [--json]
//   node cycle.mjs week <vault> [--date YYYY-MM-DD] [--json]
//   node cycle.mjs month <vault> YYYY-MM [--json]
//   node cycle.mjs overview <vault> [--date YYYY-MM-DD] [--json]
//   node cycle.mjs check <vault> [--json]
```

### 1b. `parseCycle` 读出标题

在 `parseCycle` 里，`const lines = text.split("\n");` 这一行**下面**插入：

```js
  const heading = lines.find((line) => /^#\s+/.test(line));
  const title = heading ? heading.replace(/^#\s+/, "").replace(/^C\d+\s*·\s*/, "").trim() : "";
```

并把 `parseCycle` 的 `return { cycle, start, end, template, names };` 改成：

```js
  return { cycle, start, end, title, template, names };
```

函数上方的注释 `/** 解析周期页：{ cycle, start, end, template: …` 里把 `{ cycle, start, end,` 改成 `{ cycle, start, end, title,`。

### 1c. 替换 `monthInfo`

把整个 `monthInfo` 函数（连同上方注释）替换为：

```js
/**
 * 一个月的周期信息：
 * { month, days: { 'YYYY-MM-DD': { cycle, week, type, course } }, lessons: { 'YYYY-MM-DD': [{ course, id, content }] },
 *   names: { slug: 短名 }, cycles: [{ cycle, start, end }], recovery: ['YYYY-MM-DD'] }。
 * days 只含落在周期内的日子；lessons 是这些日子的计划行（新课与机动，不含复习）；recovery 是路线页里恢复周落在本月的日子。
 * extra.courses：Map<周期名, loadCourses 的结果>；extra.route：parseRoute 的结果或 null。
 */
export function monthInfo(cycles, month, { courses = new Map(), route = null } = {}) {
  const days = {};
  const lessons = {};
  const names = {};
  const recovery = [];
  for (let date = `${month}-01`; date.startsWith(month); date = addDays(date, 1)) {
    if (route && route.rows.some((row) => row.recovery && row.start <= date && date <= row.end)) recovery.push(date);
    const cycle = findCycle(cycles, date);
    if (!cycle) continue;
    Object.assign(names, cycle.names);
    const slot = cycle.template[weekday(date)];
    days[date] = { cycle: cycle.cycle, week: weekOf(cycle, date), type: slot.type, course: slot.course };
    const rows = [];
    for (const [slug, info] of courses.get(cycle.cycle) ?? new Map()) {
      for (const row of info.rows) {
        if (row.kind !== "review" && row.date === date) rows.push({ course: slug, id: row.id, content: row.content });
      }
    }
    if (rows.length > 0) lessons[date] = rows;
  }
  return { month, days, lessons, names, cycles: cycles.map(({ cycle, start, end }) => ({ cycle, start, end })), recovery };
}
```

### 1d. 新增路线解析与总览

在 `checkCycle` 函数的注释**上方**插入：

```js
// ---- 两年路线（wiki/cycles/route.md）----

/**
 * 解析路线页：{ start, end, bufferWeeks, rows: [{ id, start, end, main, aux, status, recovery }] }。
 * rows 来自 ## Cycles 表：周期（C1… 或 [[cycles/c1\|C1]] 或 恢复周）| 开始 | 结束 | 主项 | 辅助 | 状态。格式不对就抛错。
 */
export function parseRoute(text, name = "cycles/route.md") {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!fm) throw new Error(`${name} 缺少 frontmatter`);
  const field = (key) => {
    const match = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(fm[1]);
    return match ? match[1].trim() : "";
  };
  const start = field("start");
  const end = field("end");
  if (!isValidDate(start) || !isValidDate(end)) throw new Error(`${name} 的 start / end 必须是 YYYY-MM-DD`);
  const bufferWeeks = Number(field("buffer_weeks") || "0");
  if (!Number.isInteger(bufferWeeks) || bufferWeeks < 0) throw new Error(`${name} 的 buffer_weeks 必须是非负整数`);
  const lines = text.split("\n");
  const head = lines.findIndex((line) => /^##\s+Cycles\s*$/.test(line));
  if (head === -1) throw new Error(`${name} 缺少 ## Cycles`);
  const list = (cell) => (cell && cell !== "—" ? cell.split("、").map((item) => item.trim()).filter(Boolean) : []);
  const rows = [];
  for (const line of lines.slice(head + 1)) {
    if (/^##\s/.test(line)) break;
    if (!/^\|/.test(line.trim())) continue;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((cell) => cell.trim());
    if (!isValidDate(cells[1] ?? "")) continue; // 表头与分隔行
    const alias = /\[\[[^\]|\\]+\\?\|([^\]]+)\]\]/.exec(cells[0]);
    const plain = /^\[\[cycles\/(c\d+)\]\]$/.exec(cells[0]);
    const id = alias ? alias[1].trim() : plain ? plain[1].toUpperCase() : cells[0];
    const recovery = id === "恢复周";
    if (!recovery && !/^C\d+$/.test(id)) throw new Error(`${name} 的周期「${cells[0]}」不认识（应为 C1… 或 恢复周）`);
    if (!isValidDate(cells[2] ?? "") || cells[2] < cells[1]) throw new Error(`${name} 的 ${id}（${cells[1]}）结束日期不对`);
    rows.push({ id, start: cells[1], end: cells[2], main: list(cells[3]), aux: list(cells[4]), status: cells[5] ?? "", recovery });
  }
  if (rows.length === 0) throw new Error(`${name} 的 ## Cycles 没有行`);
  return { start, end, bufferWeeks, rows };
}

/**
 * 总进度顶部：{ date, route, cycle, courses }。
 * route（没有路线页时为 null）：{ start, end, bufferWeeks, weeksLeft, cycles: [{ id, start, end, main, aux, status }], recovery: [{ start, end }] }。
 * cycle（不在周期内时为 null）：{ cycle, title, start, end, week, weeks, daysLeft, next: { cycle, start } | null }。
 * courses：周模板链接的每门课 { slug, name, total, done, end, next: { id, date, content } | null }，只算新课次。
 */
export function planInfo(route, cycle, courses, date) {
  const routeInfo = route
    ? {
        start: route.start,
        end: route.end,
        bufferWeeks: route.bufferWeeks,
        weeksLeft: Math.max(0, Math.ceil(daysBetween(date, route.end) / 7)),
        cycles: route.rows
          .filter((row) => !row.recovery)
          .map(({ id, start, end, main, aux, status }) => ({ id, start, end, main, aux, status })),
        recovery: route.rows.filter((row) => row.recovery).map(({ start, end }) => ({ start, end })),
      }
    : null;
  if (!cycle) return { date, route: routeInfo, cycle: null, courses: [] };
  const next = route ? (route.rows.find((row) => !row.recovery && row.start > cycle.end) ?? null) : null;
  const cycleInfo = {
    cycle: cycle.cycle,
    title: cycle.title,
    start: cycle.start,
    end: cycle.end,
    week: weekOf(cycle, date),
    weeks: Math.ceil((daysBetween(cycle.start, cycle.end) + 1) / 7),
    daysLeft: Math.max(0, daysBetween(date, cycle.end)),
    next: next ? { cycle: next.id, start: next.start } : null,
  };
  const list = cycleCourses(cycle).map((slug) => {
    const info = courses.get(slug);
    const lessons = (info ? info.rows : []).filter((row) => row.kind === "new");
    const open = lessons.filter((row) => !info.done.has(row.id));
    const first = open[0] ?? null;
    return {
      slug,
      name: cycle.names[slug] ?? slug,
      total: lessons.length,
      done: lessons.length - open.length,
      end: lessons.length > 0 ? lessons[lessons.length - 1].date : null,
      next: first ? { id: first.id, date: first.date, content: first.content } : null,
    };
  });
  return { date, route: routeInfo, cycle: cycleInfo, courses: list };
}

```

### 1e. 读路线页

在 `loadCycles` 函数**下面**插入：

```js
/** 读 wiki/cycles/route.md；没有这页返回 null，格式不对抛错。 */
export async function loadRoute(vault) {
  let text;
  try {
    text = await readFile(join(vault, "wiki", "cycles", "route.md"), "utf8");
  } catch {
    return null;
  }
  return parseRoute(text);
}
```

### 1f. CLI

1. `usage()` 里 `"  node cycle.mjs month <vault> YYYY-MM [--json]",` 下面加一行 `"  node cycle.mjs overview <vault> [--date YYYY-MM-DD] [--json]",`。

2. `check` 分支：在 `problems.push(...checkOverlap(cycles));` **下面**插入：

```js
    try {
      const route = await loadRoute(vault);
      for (const cycle of route ? cycles : []) {
        const row = route.rows.find((item) => item.id === cycle.cycle);
        if (!row) problems.push(`route.md 没有 ${cycle.cycle} 这一行`);
        else if (row.start !== cycle.start || row.end !== cycle.end) {
          problems.push(
            `route.md 的 ${cycle.cycle}（${row.start} ~ ${row.end}）与 cycles/${cycle.cycle.toLowerCase()}.md（${cycle.start} ~ ${cycle.end}）不一致`,
          );
        }
      }
    } catch (error) {
      problems.push(error.message);
    }
```

3. `month` 分支：把

```js
    let cycles;
    try {
      cycles = await loadCycles(vault);
    } catch (error) {
      fail(error.message);
    }
    const info = monthInfo(cycles, month);
```

替换为

```js
    let cycles;
    let route;
    const courses = new Map();
    try {
      cycles = await loadCycles(vault);
      route = await loadRoute(vault);
      for (const cycle of cycles) {
        if (cycle.start.slice(0, 7) <= month && month <= cycle.end.slice(0, 7)) {
          courses.set(cycle.cycle, await loadCourses(vault, cycle));
        }
      }
    } catch (error) {
      fail(error.message);
    }
    const info = monthInfo(cycles, month, { courses, route });
```

4. 在 `if (command !== "day" && command !== "week") fail(...)` 这一行**上面**插入：

```js
  if (command === "overview") {
    const date = flags.date ?? localToday();
    if (!isValidDate(date)) fail(`--date 必须是 YYYY-MM-DD，收到 ${date}`);
    let info;
    try {
      const cycle = findCycle(await loadCycles(vault), date);
      info = planInfo(await loadRoute(vault), cycle, cycle ? await loadCourses(vault, cycle) : new Map(), date);
    } catch (error) {
      fail(error.message);
    }
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(info)}\n`);
      return;
    }
    const lines = [];
    if (info.route) {
      lines.push(`路线 ${info.route.start} ~ ${info.route.end} · 还有 ${info.route.weeksLeft} 周 · 缓冲 ${info.route.bufferWeeks} 周`);
    }
    if (info.cycle) {
      const { cycle, start, end, week, weeks, daysLeft } = info.cycle;
      lines.push(`${cycle} · ${start} ~ ${end} · 第 ${week} / ${weeks} 周 · 还剩 ${daysLeft} 天`);
    }
    for (const course of info.courses) {
      const next = course.next ? ` · 下一节 ${course.next.id} ${course.next.date}` : "";
      lines.push(`${course.name} ${course.done}/${course.total} 节 · 结课 ${course.end ?? "—"}${next}`);
    }
    process.stdout.write(`${lines.length > 0 ? lines.join("\n") : `${date} 没有路线页，也不在任何周期内`}\n`);
    return;
  }

```

## 第 2 步：`skills/cycle-plan/cycle.test.mjs`

1. 第 10 行 import 改成：

```js
import { checkCycle, cycleCourses, dayInfo, findCycle, monthInfo, parseCycle, parseRoute, planInfo, weekInfo, weekOf } from "./cycle.mjs";
```

2. 在 `const bRows = …` 那一行下面加：

```js
const ROUTE = `---
route: 测试路线
start: 2026-11-06
end: 2027-04-08
buffer_weeks: 12
---

# 两年学习路线

## Cycles

| 周期 | 开始 | 结束 | 主项 | 辅助（下周期主项） | 状态 |
|---|---|---|---|---|---|
| [[cycles/c1\\|C1]] | 2026-11-06 | 2026-12-24 | 离散数学、编程范式 | 数据结构与算法、C 与系统编程 | 进行中 |
| C2 | 2026-12-25 | 2027-02-11 | 数据结构与算法、C 与系统编程 | 体系结构、计算理论 | 未开始 |
| 恢复周 | 2027-02-12 | 2027-02-18 | — | — | |
| C3 | 2027-02-19 | 2027-04-08 | 体系结构、计算理论 | — | 未开始 |

## Log
- 2026-11-06: 建立
`;
```

3. 在文件末尾追加：

```js
test("parseCycle reads the title after 「C1 · 」", () => {
  assert.equal(parseCycle(CYCLE).title, "离散 + 范式");
  assert.equal(parseCycle(CYCLE.replace("# C1 · 离散 + 范式\n", "")).title, "");
});

test("parseRoute reads frontmatter, cycle rows and recovery weeks", () => {
  const route = parseRoute(ROUTE);
  assert.equal(route.start, "2026-11-06");
  assert.equal(route.end, "2027-04-08");
  assert.equal(route.bufferWeeks, 12);
  assert.deepEqual(route.rows.map((row) => row.id), ["C1", "C2", "恢复周", "C3"]);
  assert.deepEqual(route.rows[0], {
    id: "C1",
    start: "2026-11-06",
    end: "2026-12-24",
    main: ["离散数学", "编程范式"],
    aux: ["数据结构与算法", "C 与系统编程"],
    status: "进行中",
    recovery: false,
  });
  assert.deepEqual(route.rows[2], { id: "恢复周", start: "2027-02-12", end: "2027-02-18", main: [], aux: [], status: "", recovery: true });
  assert.deepEqual(route.rows[3].aux, []);
  assert.equal(parseRoute(ROUTE.replace("[[cycles/c1\\|C1]]", "[[cycles/c1]]")).rows[0].id, "C1");
  assert.equal(parseRoute(ROUTE.replace("buffer_weeks: 12\n", "")).bufferWeeks, 0);
});

test("parseRoute rejects broken pages", () => {
  assert.throws(() => parseRoute("# 没有 frontmatter"), /frontmatter/);
  assert.throws(() => parseRoute(ROUTE.replace("end: 2027-04-08", "end: 2027-4-8")), /start \/ end/);
  assert.throws(() => parseRoute(ROUTE.replace("## Cycles", "## 周期")), /## Cycles/);
  assert.throws(() => parseRoute(ROUTE.replace("| C2 |", "| 第二周期 |")), /不认识/);
  assert.throws(() => parseRoute(ROUTE.replace("| 2027-02-11 |", "| 2026-12-01 |")), /结束日期/);
  assert.throws(() => parseRoute(ROUTE.replace("buffer_weeks: 12", "buffer_weeks: -1")), /buffer_weeks/);
});

test("planInfo gives the route, the cycle and each course's lesson counts", () => {
  const cycle = parseCycle(CYCLE);
  const courses = coursesFrom({ a: courseText(aRows, A_DAYS), b: courseText(bRows, B_DAYS) });
  courses.get("a").done = new Set(["D1"]);
  const info = planInfo(parseRoute(ROUTE), cycle, courses, "2026-11-10");
  assert.equal(info.route.end, "2027-04-08");
  assert.equal(info.route.weeksLeft, 22);
  assert.deepEqual(info.route.cycles.map((item) => item.id), ["C1", "C2", "C3"]);
  assert.deepEqual(info.route.recovery, [{ start: "2027-02-12", end: "2027-02-18" }]);
  assert.deepEqual(info.cycle, {
    cycle: "C1",
    title: "离散 + 范式",
    start: "2026-11-06",
    end: "2026-12-24",
    week: 1,
    weeks: 7,
    daysLeft: 44,
    next: { cycle: "C2", start: "2026-12-25" },
  });
  assert.deepEqual(info.courses[0], {
    slug: "a",
    name: "离散",
    total: 4,
    done: 1,
    end: aRows.filter((row) => row.kind === "new").at(-1).date,
    next: { id: "D2", date: "2026-11-09", content: "第 2 课" },
  });
  assert.equal(info.courses[1].done, 0);
  assert.equal(info.courses[1].next.id, "D1");
});

test("planInfo without a route page or outside every cycle", () => {
  const cycle = parseCycle(CYCLE);
  const info = planInfo(null, cycle, new Map(), "2026-11-06");
  assert.equal(info.route, null);
  assert.equal(info.cycle.next, null);
  assert.deepEqual(info.courses.map((item) => [item.slug, item.total, item.next]), [["a", 0, null], ["b", 0, null]]);
  assert.deepEqual(planInfo(parseRoute(ROUTE), null, new Map(), "2027-02-14").courses, []);
  assert.equal(planInfo(parseRoute(ROUTE), null, new Map(), "2027-02-14").cycle, null);
});

test("monthInfo adds each day's lessons, the short names, cycle bounds and recovery days", () => {
  const cycle = parseCycle(CYCLE);
  const courses = coursesFrom({ a: courseText(aRows, A_DAYS), b: courseText(bRows, B_DAYS) });
  const info = monthInfo([cycle], "2026-11", { courses: new Map([["C1", courses]]), route: parseRoute(ROUTE) });
  assert.deepEqual(info.lessons["2026-11-06"], [{ course: "a", id: "D1", content: "第 1 课" }]);
  assert.deepEqual(info.lessons["2026-11-10"], [{ course: "b", id: "D1", content: "第 1 课" }]);
  assert.equal(info.lessons["2026-11-08"], undefined);
  assert.deepEqual(info.names, { a: "离散", b: "范式" });
  assert.deepEqual(info.cycles, [{ cycle: "C1", start: "2026-11-06", end: "2026-12-24" }]);
  assert.deepEqual(info.recovery, []);
  const feb = monthInfo([cycle], "2027-02", { route: parseRoute(ROUTE) });
  assert.equal(feb.recovery.length, 7);
  assert.equal(feb.recovery[0], "2027-02-12");
  assert.deepEqual(monthInfo([cycle], "2026-11").lessons, {});
});

test("CLI: overview reads route.md and the cycle; check compares route.md with the cycle page", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cycle-overview-"));
  try {
    await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
    await mkdir(join(vault, "wiki", "courses"), { recursive: true });
    await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE);
    await writeFile(join(vault, "wiki", "courses", "a.md"), courseText(aRows, A_DAYS));
    await writeFile(join(vault, "wiki", "courses", "b.md"), courseText(bRows, B_DAYS));
    const noRoute = JSON.parse((await run("node", [SCRIPT, "overview", vault, "--date", "2026-11-06", "--json"])).stdout);
    assert.equal(noRoute.route, null);
    assert.equal(noRoute.cycle.cycle, "C1");
    await writeFile(join(vault, "wiki", "cycles", "route.md"), ROUTE);
    const info = JSON.parse((await run("node", [SCRIPT, "overview", vault, "--date", "2026-11-06", "--json"])).stdout);
    assert.equal(info.route.end, "2027-04-08");
    assert.deepEqual(info.courses.map((item) => [item.name, item.total]), [["离散", 4], ["范式", 4]]);
    const text = (await run("node", [SCRIPT, "overview", vault, "--date", "2026-11-06"])).stdout;
    assert.match(text, /路线 2026-11-06 ~ 2027-04-08/);
    const month = JSON.parse((await run("node", [SCRIPT, "month", vault, "2026-11", "--json"])).stdout);
    assert.equal(month.lessons["2026-11-06"][0].id, "D1");
    assert.match((await run("node", [SCRIPT, "check", vault])).stdout, /OK/);
    await writeFile(join(vault, "wiki", "cycles", "route.md"), ROUTE.replace("| 2026-12-24 | 离散数学", "| 2026-12-31 | 离散数学"));
    await assert.rejects(run("node", [SCRIPT, "check", vault]), (error) => /不一致/.test(error.stdout));
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});
```

改完运行 `cd /Users/gjy/pi-learning/xuegen && npm test`，必须全绿。若 `planInfo` 测试里的 `daysLeft: 44` 或 `weeksLeft: 22` 不符，**不要改代码去凑**，在报告里写出实际值，Claude 核对。

## 第 3 步：`apps/desktop/src/shared/data-protocol.ts`

1. 把 `CycleMonth` 接口替换为：

```ts
/**
 * A month of study-cycle data, from `cycle.mjs month --json`.
 *
 * `days` holds only in-cycle days; `lessons` the lesson rows planned on a day;
 * `names` the courses' short names; `cycles` every cycle's bounds (for the
 * 「C1 起 / C1 完」 flags); `recovery` the route's recovery days in this month.
 */
export interface CycleMonth {
  month: string;
  days: Record<string, CycleSlot>;
  lessons: Record<string, CycleLesson[]>;
  names: Record<string, string>;
  cycles: { cycle: string; start: string; end: string }[];
  recovery: string[];
}
```

2. 在 `CycleMonth` 下面加：

```ts
/** One cycle row of the two-year route (`wiki/cycles/route.md`). */
export interface RouteCycle {
  id: string;
  start: string;
  end: string;
  main: string[];
  aux: string[];
  /** 进行中 / 未开始 / 完成. */
  status: string;
}

/** The two-year route; `end` is the last day of the last cycle. */
export interface RouteInfo {
  start: string;
  end: string;
  bufferWeeks: number;
  weeksLeft: number;
  cycles: RouteCycle[];
  recovery: { start: string; end: string }[];
}

/** One course of the current cycle: new lessons only. */
export interface CycleCourseProgress {
  slug: string;
  /** The short name the weekly template links it with. */
  name: string;
  total: number;
  done: number;
  /** Date of the last lesson, or null without a schedule. */
  end: string | null;
  /** The first lesson not yet done (may be in the past). */
  next: { id: string; date: string; content: string } | null;
}

/** The top of 总进度, from `cycle.mjs overview --json`. */
export interface CycleOverview {
  date: string;
  route: RouteInfo | null;
  cycle: {
    cycle: string;
    /** The cycle page's title without 「C1 · 」. */
    title: string;
    start: string;
    end: string;
    week: number;
    weeks: number;
    daysLeft: number;
    next: { cycle: string; start: string } | null;
  } | null;
  courses: CycleCourseProgress[];
}
```

3. `DataRequest` 里 `| { kind: "cycle.month"; month: string }` 下面加 `| { kind: "cycle.overview"; date: string }`。
4. `DataResponseMap` 里 `"cycle.month": CycleMonth;` 下面加 `"cycle.overview": CycleOverview;`。
5. 校验函数里把 `case "cycle.day":` 改成两行 `case "cycle.day":` `case "cycle.overview":`（共用同一个 return）。

## 第 4 步：`apps/desktop/src/shared/data-protocol.test.ts`

- 合法请求列表里 `{ kind: "cycle.month", month: "2026-11" },` 下面加 `{ kind: "cycle.overview", date: "2026-11-06" },`。
- 非法请求列表里 `{ kind: "cycle.day" },` 下面加 `{ kind: "cycle.overview", date: "2026-11" },`。

## 第 5 步：`apps/desktop/src/main/data/handler.ts`

在 `case "cycle.month":` 那两行下面加：

```ts
    case "cycle.overview":
      return runScript("cycle-plan/cycle.mjs", ["overview", vault.vault, "--date", request.date, "--json"]);
```

`handler.test.ts` 第 97 行那个测试的末尾（`it` 结束前）加：

```ts
    const overview = await handleDataRequest({ kind: "cycle.overview", date: "2026-11-09" });
    expect(overview.ok).toBe(true);
    if (overview.ok) expect(overview.data).toMatchObject({ route: null, cycle: { cycle: "C1" } });
```

（照该测试里 `day` 的写法；若它用的不是 `.ok` / `.data`，照它的写法改，并在报告里说明。）

## 第 6 步：`apps/desktop/src/renderer/core/board/use-cycle.ts`

- import 改为 `import type { CycleDay, CycleMonth, CycleOverview } from "@shared/data-protocol.js";`
- 接口 `CycleResource` 里 `month` 下面加 `overview: BoardResource<CycleOverview>;`
- 函数体里 `monthResource` 下面加 `const overviewResource = useBoardResource(() => client.data({ kind: "cycle.overview", date: today }), [today]);`
- 返回值加 `overview: overviewResource,`，`reload` 里加 `overviewResource.reload();`
- 文件头注释第 2–4 行改为：`Study-cycle view model: today's and tomorrow's place in the cycle (for 今天), the displayed month's day types and lessons (for 日历), and the route / cycle / course overview (for 总进度), loaded from \`cycle.mjs\` through the data channel.`

## 第 7 步：`apps/desktop/src/renderer/core/strings.ts`

在 `progress: {` 这一块**上面**（`control: { … },` 之后）插入：

```ts
  plan: {
    routeLabel: "两年路线",
    routeEndLabel: "预计结束",
    routeEnd: (year: number, month: number, day: number): string => `${year} 年 ${month} 月 ${day} 日`,
    routeSub: (start: string, weeksLeft: number, bufferWeeks: number): string =>
      `${start} 开始 · 还有 ${weeksLeft} 周${bufferWeeks > 0 ? ` · 另留约 ${bufferWeeks} 周缓冲` : ""}`,
    showCycles: (count: number): string => `看 ${count} 个周期 ▸`,
    hideCycles: (count: number): string => `收起 ${count} 个周期`,
    cycleLabel: "本周期",
    week: (week: number, weeks: number): string => `第 ${week} / ${weeks} 周`,
    cycleEnd: (day: string): string => `${day} 结束`,
    cycleSub: (daysLeft: number, next: { cycle: string; start: string } | null): string =>
      `还剩 ${daysLeft} 天${next ? ` · 下个周期 ${next.cycle} 从 ${next.start.slice(5)} 开始` : ""}`,
    auxEmpty: "辅助位空着",
    auxPlanned: (list: string): string => `原定 ${list}`,
    lessonTotal: (total: number): string => ` / ${total} 节`,
    courseEnd: (day: string): string => `结课 ${day}`,
    nextLabel: "下一节",
    today: "今天",
    overdue: (day: string): string => `${day} 没学`,
    otherWarn: (count: number): string => `${count} 门超 14 天没学`,
    sectionDone: "已学完",
    tag: { 深度: "", 整合: "整合", 低强度: "Anki", 休息: "" } as Record<CycleDayType, string>,
    tagRecovery: "恢复",
    flagStart: (cycle: string): string => `${cycle} 起`,
    flagEnd: (cycle: string): string => `${cycle} 完`,
    slotLine: (cycle: string, week: number, type: CycleDayType, last: boolean): string =>
      `${cycle} 第 ${week} 周 · ${CYCLE_DAY_TYPE[type]}${last ? ` · ${cycle} 最后一天` : ""}`,
    recoveryLine: "恢复周 · 不排新课",
    verifyItem: "两科周核实 · 汇总本周问题",
    ankiItem: "Anki 20–30 分钟",
    restItem: "休息，不排任务",
    legend: (names: string[]): string =>
      `${names.length > 0 ? `${names.join(" / ")} = 深度课　` : ""}整合 = 周核实　Anki = 低强度　空白 = 休息`,
  },
```

## 第 8 步：新文件 `apps/desktop/src/renderer/core/board/plan-view.ts`

```ts
/**
 * 总进度 top and 日历 cell labels (design `?d=plan`).
 *
 * `cycle.mjs overview` gives the two-year route, the current cycle and its
 * courses' lesson counts; `cycle.mjs month` gives each day's lessons. These
 * pure functions turn them into the lines the panels show. Today is an
 * argument; no clock.
 */

import type { CycleMonth, CycleOverview } from "@shared/data-protocol.js";
import { strings } from "../strings.js";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / 86_400_000;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** 「11-06 周五」. */
export function shortDay(date: string): string {
  return `${date.slice(5)} 周${WEEKDAYS[new Date(dayNumber(date) * 86_400_000).getUTCDay()] ?? ""}`;
}

export type SegmentState = "done" | "now" | "plan";

export interface RouteView {
  /** 「2028 年 7 月 20 日」. */
  end: string;
  /** 「2026-11-06 开始 · 还有 89 周 · 另留约 12 周缓冲」. */
  sub: string;
  /** One per cycle; `restAfter` when a recovery week follows it. */
  segments: { id: string; label: string; state: SegmentState; restAfter: boolean }[];
  /** The expanded list: 「C1  离散数学 + 编程语言与编程范式  26.11.06 – 12.24」. */
  cycles: { id: string; subjects: string; range: string; now: boolean }[];
}

export interface CycleView {
  /** 「C1 · 离散数学 + 编程语言与编程范式」. */
  title: string;
  /** 「第 1 / 7 周」. */
  week: string;
  /** 「11-06 周五」. */
  start: string;
  /** 「12-24 周四 结束」. */
  end: string;
  /** Share of the cycle's days reached by today, 0–100 (today counts). */
  percent: number;
  /** 「还剩 48 天 · 下个周期 C2 从 12-25 开始」. */
  sub: string;
  /** 「原定 数据结构与算法、C 与系统编程」 from the route row, or null. */
  aux: string | null;
}

export interface CourseCard {
  slug: string;
  name: string;
  done: number;
  total: number;
  percent: number;
  /** ✓ all done, ! the next lesson is in the past, else ●. */
  mark: "now" | "warn" | "done";
  /** 「结课 12-23」, or null without a schedule. */
  end: string | null;
  /** `when` is 「今天」 / 「11-10 周二」 / 「11-03 没学」; `text` is 「D1 Ch1 …」. */
  next: { when: string; text: string } | null;
}

function isNow(start: string, end: string, today: string): boolean {
  return start <= today && today <= end;
}

export function routeView(overview: CycleOverview, today: string): RouteView | null {
  const route = overview.route;
  if (!route) return null;
  const [year, month, day] = route.end.split("-").map(Number);
  return {
    end: strings.plan.routeEnd(year ?? 0, month ?? 0, day ?? 0),
    sub: strings.plan.routeSub(route.start, route.weeksLeft, route.bufferWeeks),
    segments: route.cycles.map((cycle) => ({
      id: cycle.id,
      label: cycle.id.replace(/^C/, ""),
      state: cycle.status === "完成" ? "done" : isNow(cycle.start, cycle.end, today) ? "now" : "plan",
      restAfter: route.recovery.some((rest) => daysBetween(cycle.end, rest.start) === 1),
    })),
    cycles: route.cycles.map((cycle) => ({
      id: cycle.id,
      subjects: cycle.main.join(" + "),
      range: `${cycle.start.slice(2).split("-").join(".")} – ${cycle.end.slice(5).split("-").join(".")}`,
      now: isNow(cycle.start, cycle.end, today),
    })),
  };
}

export function cycleView(overview: CycleOverview, today: string): CycleView | null {
  const cycle = overview.cycle;
  if (!cycle) return null;
  const span = daysBetween(cycle.start, cycle.end) + 1;
  const reached = Math.round(((daysBetween(cycle.start, today) + 1) / span) * 100);
  const row = overview.route?.cycles.find((item) => item.id === cycle.cycle);
  return {
    title: cycle.title ? `${cycle.cycle} · ${cycle.title}` : cycle.cycle,
    week: strings.plan.week(cycle.week, cycle.weeks),
    start: shortDay(cycle.start),
    end: strings.plan.cycleEnd(shortDay(cycle.end)),
    percent: Math.min(100, Math.max(0, reached)),
    sub: strings.plan.cycleSub(cycle.daysLeft, cycle.next),
    aux: row && row.aux.length > 0 ? strings.plan.auxPlanned(row.aux.join("、")) : null,
  };
}

export function courseCards(overview: CycleOverview, today: string): CourseCard[] {
  return overview.courses.map((course) => {
    const next = course.next;
    const mark: CourseCard["mark"] =
      course.total > 0 && course.done === course.total ? "done" : next && next.date < today ? "warn" : "now";
    const when = !next
      ? ""
      : next.date === today
        ? strings.plan.today
        : next.date < today
          ? strings.plan.overdue(next.date.slice(5))
          : shortDay(next.date);
    return {
      slug: course.slug,
      name: course.name,
      done: course.done,
      total: course.total,
      percent: course.total > 0 ? Math.round((course.done / course.total) * 100) : 0,
      mark,
      end: course.end ? strings.plan.courseEnd(course.end.slice(5)) : null,
      next: next ? { when, text: `${next.id} ${next.content}` } : null,
    };
  });
}

/** What a calendar cell says: the lesson's short course name, else 恢复 / 整合 / Anki / the 深度 day's course, else "". */
export function cellTag(month: CycleMonth | null, date: string): string {
  if (!month) return "";
  const lesson = month.lessons[date]?.[0];
  if (lesson) return month.names[lesson.course] ?? lesson.course;
  if (month.recovery.includes(date)) return strings.plan.tagRecovery;
  const slot = month.days[date];
  if (!slot) return "";
  if (slot.type === "深度") return slot.course ? (month.names[slot.course] ?? slot.course) : "";
  return strings.plan.tag[slot.type];
}

/** 「C1 起」 on a cycle's first day, 「C1 完」 on its last, else null. */
export function cellFlag(month: CycleMonth | null, date: string): string | null {
  const cycle = month?.cycles.find((item) => item.start === date || item.end === date);
  if (!cycle) return null;
  return cycle.end === date ? strings.plan.flagEnd(cycle.cycle) : strings.plan.flagStart(cycle.cycle);
}

/** The line under the selected date: 「C1 第 1 周 · 整合日」 (+「 · C1 最后一天」), 「恢复周 · 不排新课」, or null. */
export function daySlotLine(month: CycleMonth | null, date: string): string | null {
  if (!month) return null;
  const slot = month.days[date];
  if (slot) {
    const last = month.cycles.some((item) => item.cycle === slot.cycle && item.end === date);
    return strings.plan.slotLine(slot.cycle, slot.week, slot.type, last);
  }
  return month.recovery.includes(date) ? strings.plan.recoveryLine : null;
}

/** The selected day's lessons with short course names. */
export function dayLessons(month: CycleMonth | null, date: string): { name: string; id: string; content: string }[] {
  if (!month) return [];
  return (month.lessons[date] ?? []).map((lesson) => ({
    name: month.names[lesson.course] ?? lesson.course,
    id: lesson.id,
    content: lesson.content,
  }));
}

/** The short names for the legend, in first-seen order. */
export function legendNames(month: CycleMonth | null): string[] {
  return month ? [...new Set(Object.values(month.names))] : [];
}
```

## 第 9 步：新文件 `apps/desktop/src/renderer/core/board/plan-view.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { CycleMonth, CycleOverview } from "@shared/data-protocol.js";
import {
  cellFlag,
  cellTag,
  courseCards,
  cycleView,
  dayLessons,
  daySlotLine,
  daysBetween,
  legendNames,
  routeView,
  shortDay,
} from "./plan-view.js";

const OVERVIEW: CycleOverview = {
  date: "2026-11-06",
  route: {
    start: "2026-11-06",
    end: "2028-07-20",
    bufferWeeks: 12,
    weeksLeft: 89,
    cycles: [
      { id: "C1", start: "2026-11-06", end: "2026-12-24", main: ["离散数学", "编程语言与编程范式"], aux: ["数据结构与算法", "C 与系统编程"], status: "进行中" },
      { id: "C2", start: "2026-12-25", end: "2027-02-11", main: ["数据结构与算法", "C 与系统编程"], aux: [], status: "未开始" },
      { id: "C3", start: "2027-02-19", end: "2027-04-08", main: ["计算机体系结构", "计算理论"], aux: [], status: "未开始" },
    ],
    recovery: [{ start: "2027-02-12", end: "2027-02-18" }],
  },
  cycle: {
    cycle: "C1",
    title: "离散数学 + 编程语言与编程范式",
    start: "2026-11-06",
    end: "2026-12-24",
    week: 1,
    weeks: 7,
    daysLeft: 48,
    next: { cycle: "C2", start: "2026-12-25" },
  },
  courses: [
    { slug: "epp", name: "离散", total: 15, done: 0, end: "2026-12-23", next: { id: "D1", date: "2026-11-06", content: "Ch1 全章" } },
    { slug: "ctm", name: "CTM", total: 14, done: 0, end: "2026-12-24", next: { id: "D1", date: "2026-11-10", content: "概念阶梯" } },
  ],
};

const MONTH: CycleMonth = {
  month: "2026-12",
  days: {
    "2026-12-21": { cycle: "C1", week: 7, type: "深度", course: "epp" },
    "2026-12-22": { cycle: "C1", week: 7, type: "深度", course: "ctm" },
    "2026-12-24": { cycle: "C1", week: 7, type: "深度", course: "ctm" },
    "2026-12-18": { cycle: "C1", week: 7, type: "整合", course: null },
    "2026-12-19": { cycle: "C1", week: 7, type: "低强度", course: null },
    "2026-12-20": { cycle: "C1", week: 7, type: "休息", course: null },
  },
  lessons: { "2026-12-21": [{ course: "epp", id: "D14", content: "组合数" }] },
  names: { epp: "离散", ctm: "CTM" },
  cycles: [
    { cycle: "C1", start: "2026-11-06", end: "2026-12-24" },
    { cycle: "C2", start: "2026-12-25", end: "2027-02-11" },
  ],
  recovery: ["2026-12-30"],
};

describe("plan-view dates", () => {
  it("shortDay and daysBetween", () => {
    expect(shortDay("2026-11-06")).toBe("11-06 周五");
    expect(shortDay("2026-12-24")).toBe("12-24 周四");
    expect(daysBetween("2026-11-06", "2026-12-24")).toBe(48);
    expect(daysBetween("2026-12-24", "2026-11-06")).toBe(-48);
  });
});

describe("routeView", () => {
  it("shows the end date, the weeks left and one segment per cycle", () => {
    const view = routeView(OVERVIEW, "2026-11-06");
    expect(view?.end).toBe("2028 年 7 月 20 日");
    expect(view?.sub).toBe("2026-11-06 开始 · 还有 89 周 · 另留约 12 周缓冲");
    expect(view?.segments).toEqual([
      { id: "C1", label: "1", state: "now", restAfter: false },
      { id: "C2", label: "2", state: "plan", restAfter: true },
      { id: "C3", label: "3", state: "plan", restAfter: false },
    ]);
    expect(view?.cycles[0]).toEqual({ id: "C1", subjects: "离散数学 + 编程语言与编程范式", range: "26.11.06 – 12.24", now: true });
  });
  it("marks 完成 cycles done and returns null without a route", () => {
    const done = { ...OVERVIEW, route: { ...OVERVIEW.route!, cycles: OVERVIEW.route!.cycles.map((c) => (c.id === "C1" ? { ...c, status: "完成" } : c)) } };
    expect(routeView(done, "2026-12-26")?.segments.map((s) => s.state)).toEqual(["done", "now", "plan"]);
    expect(routeView({ ...OVERVIEW, route: null }, "2026-11-06")).toBeNull();
  });
});

describe("cycleView", () => {
  it("shows the cycle's dates, days left, next cycle and the planned aux subjects", () => {
    expect(cycleView(OVERVIEW, "2026-11-06")).toEqual({
      title: "C1 · 离散数学 + 编程语言与编程范式",
      week: "第 1 / 7 周",
      start: "11-06 周五",
      end: "12-24 周四 结束",
      percent: 2,
      sub: "还剩 48 天 · 下个周期 C2 从 12-25 开始",
      aux: "原定 数据结构与算法、C 与系统编程",
    });
  });
  it("handles no title, no next cycle, no route and no cycle", () => {
    const bare = { ...OVERVIEW, route: null, cycle: { ...OVERVIEW.cycle!, title: "", next: null } };
    const view = cycleView(bare, "2026-12-24");
    expect(view?.title).toBe("C1");
    expect(view?.sub).toBe("还剩 48 天");
    expect(view?.aux).toBeNull();
    expect(view?.percent).toBe(100);
    expect(cycleView({ ...OVERVIEW, cycle: null }, "2026-11-06")).toBeNull();
  });
});

describe("courseCards", () => {
  it("says when the next lesson is: today, a later day, or missed", () => {
    const [epp, ctm] = courseCards(OVERVIEW, "2026-11-06");
    expect(epp).toEqual({
      slug: "epp",
      name: "离散",
      done: 0,
      total: 15,
      percent: 0,
      mark: "now",
      end: "结课 12-23",
      next: { when: "今天", text: "D1 Ch1 全章" },
    });
    expect(ctm?.next?.when).toBe("11-10 周二");
    const late = courseCards(OVERVIEW, "2026-11-08")[0];
    expect(late?.mark).toBe("warn");
    expect(late?.next?.when).toBe("11-06 没学");
  });
  it("marks a finished course done and copes with no schedule", () => {
    const finished = { ...OVERVIEW, courses: [{ ...OVERVIEW.courses[0]!, done: 15, next: null }] };
    expect(courseCards(finished, "2026-12-24")[0]).toMatchObject({ mark: "done", percent: 100, next: null });
    const empty = { ...OVERVIEW, courses: [{ slug: "x", name: "x", total: 0, done: 0, end: null, next: null }] };
    expect(courseCards(empty, "2026-11-06")[0]).toMatchObject({ mark: "now", percent: 0, end: null, next: null });
  });
});

describe("calendar cells", () => {
  it("cellTag: lesson name, then recovery, then the day type", () => {
    expect(cellTag(MONTH, "2026-12-21")).toBe("离散");
    expect(cellTag(MONTH, "2026-12-22")).toBe("CTM");
    expect(cellTag(MONTH, "2026-12-18")).toBe("整合");
    expect(cellTag(MONTH, "2026-12-19")).toBe("Anki");
    expect(cellTag(MONTH, "2026-12-20")).toBe("");
    expect(cellTag(MONTH, "2026-12-30")).toBe("恢复");
    expect(cellTag(MONTH, "2026-12-31")).toBe("");
    expect(cellTag(null, "2026-12-21")).toBe("");
  });
  it("cellFlag marks a cycle's first and last day", () => {
    expect(cellFlag(MONTH, "2026-12-24")).toBe("C1 完");
    expect(cellFlag(MONTH, "2026-12-25")).toBe("C2 起");
    expect(cellFlag(MONTH, "2026-12-23")).toBeNull();
    expect(cellFlag(null, "2026-12-24")).toBeNull();
  });
  it("daySlotLine, dayLessons and legendNames", () => {
    expect(daySlotLine(MONTH, "2026-12-18")).toBe("C1 第 7 周 · 整合日");
    expect(daySlotLine(MONTH, "2026-12-24")).toBe("C1 第 7 周 · 深度日 · C1 最后一天");
    expect(daySlotLine(MONTH, "2026-12-30")).toBe("恢复周 · 不排新课");
    expect(daySlotLine(MONTH, "2026-12-31")).toBeNull();
    expect(dayLessons(MONTH, "2026-12-21")).toEqual([{ name: "离散", id: "D14", content: "组合数" }]);
    expect(dayLessons(MONTH, "2026-12-22")).toEqual([]);
    expect(legendNames(MONTH)).toEqual(["离散", "CTM"]);
    expect(legendNames(null)).toEqual([]);
  });
});
```

`CYCLE_DAY_TYPE` 里 `整合` 的文字若不是「整合日」、`深度` 不是「深度日」，按实际值改测试期望，并在报告里写出。

## 第 10 步：契约与组装（只加一个字段）

1. `apps/desktop/src/renderer/skins/contract.ts`：import 里加 `CycleOverview`（和 `CycleMonth` 同一处 import）；`ProgressPanelProps` 里 `groups: ProgressGroups | null;` 下面加：

```ts
  /** The two-year route, the current cycle and its courses' lesson counts (cycle.mjs overview). */
  overview: AsyncState<CycleOverview>;
```

2. `apps/desktop/src/renderer/core/board/shell-panels.ts`：`progress: {` 里 `groups: …` 之后加 `overview: input.cycle.overview.state,`。

3. `apps/desktop/src/renderer/gallery/panel-samples.ts`：
   - import 里加 `CycleOverview`。
   - `SAMPLE_CYCLE_MONTH` 在 `days: { … },` 之后加：

```ts
  lessons: {
    "2026-11-06": [{ course: "discrete-math-epp", id: "D1", content: "Ch1 全章：变量、三类陈述、集合、关系与函数" }],
    "2026-11-09": [{ course: "discrete-math-epp", id: "D2", content: "Ch2 §2.1–2.2：真值表、逻辑等价" }],
    "2026-11-10": [{ course: "ctm", id: "D1", content: "Ch1 概念阶梯 + Ch2 §2.2–2.3" }],
  },
  names: { "discrete-math-epp": "离散", ctm: "CTM" },
  cycles: [{ cycle: "C1", start: "2026-11-06", end: "2026-12-24" }],
  recovery: [],
```

   - 在 `SAMPLE_CYCLE_MONTH` 下面加：

```ts
/** 总进度 top: the route, C1 and its two courses. */
export const SAMPLE_OVERVIEW: CycleOverview = {
  date: "2026-11-06",
  route: {
    start: "2026-11-06",
    end: "2028-07-20",
    bufferWeeks: 12,
    weeksLeft: 89,
    cycles: [
      { id: "C1", start: "2026-11-06", end: "2026-12-24", main: ["离散数学", "编程语言与编程范式"], aux: ["数据结构与算法", "C 与系统编程"], status: "进行中" },
      { id: "C2", start: "2026-12-25", end: "2027-02-11", main: ["数据结构与算法", "C 与系统编程"], aux: ["计算机体系结构", "计算理论"], status: "未开始" },
      { id: "C3", start: "2027-02-19", end: "2027-04-08", main: ["计算机体系结构", "计算理论"], aux: ["操作系统", "并发编程"], status: "未开始" },
    ],
    recovery: [{ start: "2027-02-12", end: "2027-02-18" }],
  },
  cycle: {
    cycle: "C1",
    title: "离散数学 + 编程语言与编程范式",
    start: "2026-11-06",
    end: "2026-12-24",
    week: 1,
    weeks: 7,
    daysLeft: 48,
    next: { cycle: "C2", start: "2026-12-25" },
  },
  courses: [
    { slug: "discrete-math-epp", name: "离散", total: 15, done: 0, end: "2026-12-23", next: { id: "D1", date: "2026-11-06", content: "Ch1 全章：变量、三类陈述、集合、关系与函数" } },
    { slug: "ctm", name: "CTM", total: 14, done: 0, end: "2026-12-24", next: { id: "D1", date: "2026-11-10", content: "Ch1 概念阶梯 + Ch2 §2.2–2.3" } },
  ],
};
```

   - `progress: {` 样例里 `groups: null,` 下面加 `overview: { status: "ready", value: SAMPLE_OVERVIEW },`。

4. 跑 `npm run typecheck`。如果还有别的地方因为 `CycleMonth` 新字段或 `overview` 必填而报错（例如测试里手写的 `CycleMonth` / `ProgressPanelProps`），只给它补上字段：`CycleMonth` 补 `lessons: {}, names: {}, cycles: [], recovery: []`；`ProgressPanelProps` 补 `overview: { status: "loading" }`（若 `AsyncState` 的 loading 写法不同，照 `contract.ts` 里的定义）。**不要改任何皮肤的渲染代码。**

## 验收命令（全部贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && npm test && npm run lint:skills
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：以上全绿；`git status` 只出现本单列出的文件（`cycle.mjs`、`cycle.test.mjs`、`data-protocol.ts`、`data-protocol.test.ts`、`handler.ts`、`handler.test.ts`、`use-cycle.ts`、`strings.ts`、`plan-view.ts`、`plan-view.test.ts`、`contract.ts`、`shell-panels.ts`、`panel-samples.ts`，以及第 10.4 步补字段的测试文件）在原有改动之外新增变化。

## 结束报告

列出：改了哪些文件；每一步是否照做；偏离之处与原因（尤其测试期望值不符时的实际值）；未完成项。
