# batch-check-3-today（Devin，约 1 小时）：`XUEGEN_TODAY` 指定「今天」

背景：`docs/platform/CHECK-PROCESS-1111.md` 第 3 项。场景走查要让测试窗口停在任意一天（收课后、讲后读过期、周期最后一周…）。现在渲染进程 20 多处直接 `new Date()` 取今天，脚本不带 `--today` 时用本机日期。做一个统一入口：设了环境变量 `XUEGEN_TODAY=YYYY-MM-DD` 就用它当「今天」（时刻仍用本机当前时刻），不设时行为与现在**完全一样**。

约束：不改界面外观与文案；不加依赖；不 commit / push；**自己做完，不要调用别的 agent**。另一个 agent 可能同时在改 `renderer/core/strings.ts`、`renderer/core/board/control-card.ts`、`skills/calendar/calendar.mjs`、`skins/bear/today-panel.tsx`、`skins/bear/cycle-today.tsx`、`skins/bear/progress-panel.tsx`、`renderer/core/board/plan-view.ts`：**这几个文件不要碰**；其中有 `new Date()` 的，列进报告，Claude 之后补。

## 1. 主进程：读环境变量
1. 新文件 `apps/desktop/src/main/today.ts`：`export function todayOverride(env = process.env): string | null`——`XUEGEN_TODAY` 是合法日期（`/^\d{4}-\d{2}-\d{2}$/` 且能被 `new Date(y, m-1, d)` 还原成同一天）返回它，否则 null（不合法时 `console.warn` 一行）。配测试 `today.test.ts`（合法、空、乱写、2026-02-30）。
2. `DesktopSettings`（`shared/protocol.ts`）加只读字段 `todayOverride?: string | null`；主进程处理 `SETTINGS_CHANNEL` 的 `get` 时把 `todayOverride()` 的结果放进返回值（**不写进设置文件**，`set` 时忽略这个字段）。找到处理 SETTINGS_CHANNEL 的文件照现有写法改，补测试。
3. `main/data/handler.ts`：对**没带 `--today` / `--date` 的**脚本调用（逐个 `case` 看：`courses.list`、`reading.stats`、`reading.queue`、`calendar.month`、`cycle.overview`、`subjects.list` 等，以实际为准），`todayOverride()` 不为 null 时补上 `--today <日期>`（先确认该脚本支持 `--today`；不支持的列进报告，不改脚本）。已带日期的请求不动（日期来自渲染进程，渲染进程那边会用覆盖后的今天）。补测试：设了覆盖时参数里有 `--today`，没设时参数与现在一模一样。

## 2. 渲染进程：统一取今天
4. 新文件 `apps/desktop/src/renderer/core/today.ts`：
   - `setTodayOverride(day: string | null): void`；
   - `now(): Date`——无覆盖时 `new Date()`；有覆盖时返回「覆盖那一天 + 本机当前的时、分、秒、毫秒」的本地时间 Date；
   - `todayKey(): string`——等于 `dateKey(now())`（`dateKey` 在 `renderer/core/board/use-calendar.ts`，直接 import 复用）。
   - 测试 `today.test.ts`：无覆盖等于 `dateKey(new Date())`；有覆盖时日期是覆盖值、时刻跟着本机走。
5. 启动时设置覆盖：在 `renderer/App.tsx` 读取设置的地方（或最早拿到 `getSettings()` 结果的 hook），拿到 `todayOverride` 后调 `setTodayOverride`，**并且在它设置之前不要发出依赖日期的数据请求**——最简单的做法：App 首次渲染前 await 一次 `getSettings()`（看 `renderer/main.tsx` / `index.tsx` 入口怎么挂载，在挂载前完成），覆盖为 null 时零影响。
6. 把下面这些「取今天」的地方改成 `now()` / `todayKey()`（**只改表示「今天 / 现在的日期」的；`Date.now()` 用于计时、倒计时、生成 id、审计时间戳的都不改**）：
   - `renderer/App.tsx` 60、80、81、103、309 行附近；
   - `renderer/core/chat/use-session-style.ts` 23–30；
   - `renderer/core/board/use-calendar.ts` 118；`use-course-sessions.ts` 109、137、204；`use-reload-on-answer.ts` 41、43（这里是「跨日自动刷新」，用 `now().toDateString()`）；`use-control-card.ts` 61；`use-control-fold.ts` 25；`shell-panels.ts` 152；`use-session-freshness.ts` 44；`use-shelf.ts` 29、44、49；`use-session-list.ts` 74；
   - `skins/bear/reading-panel.tsx` 103、`skins/bear/calendar-panel.tsx` 193、`skins/bare/progress-panel.tsx` 26、`skins/chicago/panel-shared.tsx` 51、`skins/chicago/menubar.tsx` 325。
   - `getTimezoneOffset()` 的调用保持用 `new Date()`（时区与日期无关）。
7. 加一条守护测试 `renderer/core/today.guard.test.ts`：扫 `src/renderer/**/*.{ts,tsx}`（跳过测试文件、`core/today.ts` 本身、以及上面「不要碰」的 7 个文件），断言不再出现 `dateKey(new Date())` 这种写法。以后有人新写就会红。

## 3. 文档
8. `apps/desktop/AGENTS.md`（或 `docs/desktop/UI-ARCHITECTURE.md` 里讲约定的地方）加一条：「取今天用 `renderer/core/today.ts` 的 `now()` / `todayKey()`，不直接 `new Date()`；测试窗口可设 `XUEGEN_TODAY`。」

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests |Test Files" && npm run -s build 2>&1 | tail -2
```

## 结束报告（中文）
每步改了哪些文件；第 3 步每个 `case` 的处理（补了 / 本来就带日期 / 脚本不支持）；「不要碰」的文件里剩下的 `new Date()` 清单；验收输出。
