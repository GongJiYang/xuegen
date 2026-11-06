# 批次 BE-9a：周期数据接入数据通道（不改界面）

> 给 Devin（SWE-2）的**逐步执行清单**。按步骤原样做，不要自行设计；某一步做不到时停下，在报告里写清卡在哪一步、报错原文。

## 本批硬约束（压缩后也要记得）

1. 只改这些文件：
   - `skills/cycle-plan/cycle.mjs`、`skills/cycle-plan/cycle.test.mjs`
   - `apps/desktop/src/shared/data-protocol.ts`、`apps/desktop/src/shared/data-protocol.test.ts`
   - `apps/desktop/src/main/data/handler.ts`、`apps/desktop/src/main/data/handler.test.ts`
   - `apps/desktop/src/shared/README.md`、`apps/desktop/src/main/data/README.md`（各加一行说明）
   其他文件一律不动，尤其不动 `renderer/`、`skins/`、`App.tsx`、`skills/cycle-plan/SKILL.md`。
2. 不加依赖；脚本保持零依赖。
3. 不读写 `~/.xuegen/`，不碰任何 Obsidian 库（`/Users/gjy/Documents/` 下的东西），不启动 Electron，不 `git commit` / `git push`。测试只用临时目录。
4. 不加 `eslint-disable`、`@ts-ignore`、`any`；`switch` 保持穷尽（`assertNever`）。

## 先读

`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`，再读：`skills/cycle-plan/SKILL.md`（「脚本」一节已写好 `month` 的输出结构）、`skills/cycle-plan/cycle.mjs`、`apps/desktop/src/shared/data-protocol.ts`、`apps/desktop/src/main/data/handler.ts` 与它们的测试。

## 背景

桌面版的「今天」和「日历」要显示学习周期（第几周、深度/整合/低强度/休息）。本批只把数据接通：脚本加 `month` 命令，数据通道加 `cycle.day`、`cycle.month` 两个请求，主进程转给 `cycle.mjs`。界面在下一批（BE-9b）。

## 步骤

### 第 1 步：`cycle.mjs` 加 `monthInfo`

在 `weekInfo` 函数之后插入，原样照抄：

```js
/** 一个月里落在周期内的每一天：{ month, days: { 'YYYY-MM-DD': { cycle, week, type, course } } }。 */
export function monthInfo(cycles, month) {
  const days = {};
  for (let date = `${month}-01`; date.startsWith(month); date = addDays(date, 1)) {
    const cycle = findCycle(cycles, date);
    if (!cycle) continue;
    const slot = cycle.template[weekday(date)];
    days[date] = { cycle: cycle.cycle, week: weekOf(cycle, date), type: slot.type, course: slot.course };
  }
  return { month, days };
}
```

### 第 2 步：`cycle.mjs` 的 CLI 加 `month`

1. 文件头注释里 `//   node cycle.mjs week …` 那一行之后加一行：
   ```
   //   node cycle.mjs month <vault> YYYY-MM [--json]
   ```
2. `usage()` 里 week 那一行之后加：
   ```js
    "  node cycle.mjs month <vault> YYYY-MM [--json]",
   ```
3. 在 `main()` 里，紧接在 `check` 分支（`if (command === "check") { … }` 整块）之后、`if (command !== "day" && command !== "week")` 之前插入：

```js
  if (command === "month") {
    const month = positional[2];
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? "")) fail(`month 需要 YYYY-MM，收到 ${month ?? "（空）"}`);
    let cycles;
    try {
      cycles = await loadCycles(vault);
    } catch (error) {
      fail(error.message);
    }
    const info = monthInfo(cycles, month);
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(info)}\n`);
      return;
    }
    const lines = Object.entries(info.days).map(
      ([date, slot]) => `${date.slice(5)} ${WEEKDAY_ZH[weekday(date)]} ${slot.type}${slot.course ? ` ${slot.course}` : ""}`,
    );
    process.stdout.write(`${lines.length > 0 ? lines.join("\n") : `${month} 不在任何周期内`}\n`);
    return;
  }
```

### 第 3 步：`cycle.test.mjs`

1. 第一行 import 改为：
   ```js
   import { checkCycle, cycleCourses, dayInfo, findCycle, monthInfo, parseCycle, weekInfo, weekOf } from "./cycle.mjs";
   ```
2. 在文件**末尾**追加：

```js
test("monthInfo lists only the days inside a cycle", () => {
  const cycle = parseCycle(CYCLE);
  const info = monthInfo([cycle], "2026-11");
  assert.equal(info.month, "2026-11");
  assert.equal(Object.keys(info.days).length, 25);
  assert.equal(info.days["2026-11-05"], undefined);
  assert.deepEqual(info.days["2026-11-06"], { cycle: "C1", week: 1, type: "整合", course: null });
  assert.deepEqual(info.days["2026-11-09"], { cycle: "C1", week: 1, type: "深度", course: "a" });
  assert.deepEqual(info.days["2026-11-30"], { cycle: "C1", week: 4, type: "深度", course: "a" });
  assert.equal(Object.keys(monthInfo([cycle], "2027-01").days).length, 0);
});

test("CLI: month prints the cycle days of a month and rejects a bad month", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cycle-month-"));
  try {
    await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
    await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE);
    const info = JSON.parse((await run("node", [SCRIPT, "month", vault, "2026-12", "--json"])).stdout);
    assert.equal(Object.keys(info.days).length, 24);
    assert.deepEqual(info.days["2026-12-24"], { cycle: "C1", week: 7, type: "深度", course: "b" });
    assert.equal(info.days["2026-12-25"], undefined);
    await assert.rejects(run("node", [SCRIPT, "month", vault, "2026-13", "--json"]), (error) => /YYYY-MM/.test(error.stderr));
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});
```

### 第 4 步：`shared/data-protocol.ts` 加类型

在 `CalendarMonth` 接口之后插入，原样照抄：

```ts
/** The four kinds of day in a study cycle's weekly template (`cycle.mjs`). */
export type CycleDayType = "深度" | "整合" | "低强度" | "休息";

/** One lesson row from a course schedule, as `cycle.mjs` reports it. */
export interface CycleLesson {
  course: string;
  id: string;
  content: string;
}

/** A day's place in its cycle, from `cycle.mjs day --json`. `cycle` is null outside every cycle. */
export interface CycleDay {
  date: string;
  /** 周一 … 周日. */
  weekday: string;
  cycle: string | null;
  week: number | null;
  type: CycleDayType | null;
  /** The course a 深度 day belongs to; null for other day types. */
  course: string | null;
  /** That day's lesson rows across the cycle's courses (new lessons and 机动, no reviews). */
  lessons: CycleLesson[];
  /** Earlier new lessons not yet listed in a course's 「完成：」 line. */
  overdue: (CycleLesson & { date: string })[];
}

/** One in-cycle day of a month, from `cycle.mjs month --json`. */
export interface CycleSlot {
  cycle: string;
  week: number;
  type: CycleDayType;
  course: string | null;
}

/** The in-cycle days of a month, keyed by `YYYY-MM-DD`; days outside every cycle are absent. */
export interface CycleMonth {
  month: string;
  days: Record<string, CycleSlot>;
}
```

### 第 5 步：`shared/data-protocol.ts` 加请求

1. `DataRequest` 联合里，`| { kind: "calendar.write"; date: string; text: string }` 之后加两行：
   ```ts
     | { kind: "cycle.day"; date: string }
     | { kind: "cycle.month"; month: string }
   ```
2. `DataResponseMap` 里，`"calendar.write": …;` 之后加两行：
   ```ts
     "cycle.day": CycleDay;
     "cycle.month": CycleMonth;
   ```
3. `isDataRequest` 里，`case "calendar.write": …` 那一条之后加：
   ```ts
       case "cycle.day":
         return typeof value.date === "string" && isIsoDate(value.date);
       case "cycle.month":
         return typeof value.month === "string" && isIsoMonth(value.month);
   ```

### 第 6 步：`shared/data-protocol.test.ts`

1. 「accepts every valid request shape」的 `valid` 数组里，`{ kind: "calendar.write", … }` 之后加：
   ```ts
         { kind: "cycle.day", date: "2026-11-06" },
         { kind: "cycle.month", month: "2026-11" },
   ```
2. 「rejects malformed and unknown requests」的 `invalid` 数组里，`{ kind: "calendar.write", date: "2026-13-40", text: "x" },` 之后加：
   ```ts
         { kind: "cycle.day", date: "11-06" },
         { kind: "cycle.day" },
         { kind: "cycle.month", month: "2026-13" },
   ```

### 第 7 步：`main/data/handler.ts`

在 `handleScriptRequest` 的 `switch` 里，`case "calendar.write": …` 那一条（到它的 `]);` 结束）之后、`default:` 之前插入：

```ts
    case "cycle.day":
      return runScript("cycle-plan/cycle.mjs", ["day", vault.vault, "--date", request.date, "--json"]);
    case "cycle.month":
      return runScript("cycle-plan/cycle.mjs", ["month", vault.vault, request.month, "--json"]);
```

文件头注释第一段里「routes one `DataRequest` to a skill script」不用改。

### 第 8 步：`main/data/handler.test.ts`

在 `it("calendar.write then calendar.month round-trips the note", …)` 这个测试之后插入：

```ts
  it("cycle.day and cycle.month read the cycle page", async () => {
    touch(
      join(vault, "wiki", "cycles", "c1.md"),
      [
        "---",
        "cycle: C1",
        "start: 2026-11-06",
        "end: 2026-12-24",
        "---",
        "",
        "## Weekly Template",
        "",
        "| 星期 | 类型 | 课程 |",
        "|---|---|---|",
        "| 周一 | 深度 | [[courses/demo\\|Demo]] |",
        "| 周二 | 深度 | [[courses/demo\\|Demo]] |",
        "| 周三 | 深度 | [[courses/demo\\|Demo]] |",
        "| 周四 | 深度 | [[courses/demo\\|Demo]] |",
        "| 周五 | 整合 | — |",
        "| 周六 | 低强度 | — |",
        "| 周日 | 休息 | — |",
        "",
      ].join("\n"),
    );
    const day = await handleDataRequest({ kind: "cycle.day", date: "2026-11-09" });
    expect(day.ok).toBe(true);
    if (day.ok) {
      expect(day.data).toMatchObject({ cycle: "C1", week: 1, type: "深度", course: "demo", lessons: [], overdue: [] });
    }
    const month = await handleDataRequest({ kind: "cycle.month", month: "2026-11" });
    expect(month.ok).toBe(true);
    if (month.ok) {
      const data = month.data as { days: Record<string, { type: string }> };
      expect(data.days["2026-11-06"]?.type).toBe("整合");
      expect(data.days["2026-11-05"]).toBeUndefined();
    }
  });
```

（`demo` 课程页在 `beforeEach` 里已经建好，它没有排期标记，所以 `lessons` 与 `overdue` 是空数组。）

### 第 9 步：两个 README 各加一行

- `apps/desktop/src/shared/README.md`：在描述 `data-protocol.ts` 的那一条末尾加一句：`含学习周期的 cycle.day / cycle.month（CycleDay、CycleMonth）。`
- `apps/desktop/src/main/data/README.md`：在列出 handler 路由到哪些脚本的地方加一行：`- cycle.day / cycle.month → skills/cycle-plan/cycle.mjs（day / month，只读）`。若该 README 没有这样的列表，就在文件末尾加这一行。

## 完成标准（可观察）

下面的命令全部通过，贴出每条输出的最后 15 行：

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && npm test && npm run lint:skills
cd /Users/gjy/pi-learning/xuegen && git status --short apps/desktop/src skills/cycle-plan
```

- 新增的 2 个脚本测试、1 个 handler 测试通过，协议测试的新增样例通过；原有测试全部仍通过。
- `git status` 只出现硬约束第 1 条列出的文件（`skills/cycle-plan/` 整个目录此前未提交，显示为 `??` 正常）。
- 若某个断言与实际行为不符：先不要改测试或代码去迁就，在报告里写出失败的断言、实际值和你判断的原因，停下。

## 结束报告

列出：改了哪些文件；每一步是否照做；偏离清单之处及原因（没有就写「无」）；未完成项。
