# batch-control-home-1：总控做主入口（本地今日卡、按需简报）

设计稿：`design/animate/?d=control`（用户 2026-11-08 批准）。依据：NN/g 1/8、HAX 3/7（不在用户没问时调模型）、PRINCIPLES §4「以文件为准」。

## 硬约束（先读，压缩后也照做）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/desktop/SKIN-LEDGER.md`（第一节 G1–G9）、`docs/platform/PRINCIPLES.md`。
- 决策逻辑是纯函数并有测试；hook 的 effect 里不同步 setState；文案只在 `core/strings.ts`；契约改动 **bare、bear、chicago 都实现**，画廊补样例；`App.tsx` ≤ 450 行（逻辑放 hook）。
- 技能脚本零依赖、有同目录测试；主进程请求有运行时校验；课程文件只经脚本写（解锁 → 写 → 上锁）。
- 不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖；不放宽 eslint。

## 要做成什么（可观察）

- 打开学根（本次运行第一次就绪时），自动落在本周期的总控会话；**不发任何消息**。
- 总控会话的对话顶部是一张「今日卡」（本地数据，立刻出现）：标题行「C1 · 第 2 周 · 周一 · 深度日」+ 右侧「让总控说说」；下面逐行列出今天的事，每行一个按钮。
- 不再每天自动发 `/skill:cycle-plan 给出今天的简报…`；只在点「让总控说说」时发，而且对话里折叠成一行「今日简报」。
- 「读完了」把课程页 `Today` 里那行讲后读打勾（记「用户自报，未检查，日期」），并在该书阅读页记一行，不调模型。
- Chicago 的「今天」窗口也有「总控 →」入口。

## 第一部分：「读完了」的确定性写入

### 1.1 `skills/course/course-state.mjs` 新命令 `after-read`

```
node course-state.mjs after-read <课程文件> <标签> [--date YYYY-MM-DD]
```

- `<标签>` 是讲后读行里「讲后读 」之后、「 · 」之前的文字，如 `§1.1–1.4 核心页`。
- 只在 `## Today` 一节里找**第一条**以 `- [ ] 讲后读 ` 开头、且标签完全相等的行；找不到就 `fail("没有找到未打勾的讲后读：<标签>")`。
- 把该行开头的 `- [ ]` 换成 `- [x]`，行尾追加 `（用户自报，未检查，<date>）`（`--date` 缺省用 `localDate()`）。其他行一个字节都不改。
- 写入：记下文件原权限 → `chmod 0644` → 写 → `chmod 0444`（原来就是 0444 的情况；不改目录权限）。写失败时恢复原权限再 `fail`。
- 成功时 stdout 输出一行 JSON：`{"file": "<绝对路径>", "label": "<标签>", "reading": "<阅读页 slug 或 null>"}`，`reading` 取课程文件里第一个 `[[reading/<slug>` 或 `[[reading/<slug>|` 的 slug。
- 文件头用法注释加这一行；`fail("用法：…")` 的命令列表加 `after-read`。
- 新建 `skills/course/course-state.test.mjs`（沿用其他技能测试的 `node:test` 写法，临时目录）：成功打勾并追加文字、权限仍为 0444；标签不匹配时失败且文件不变；已打勾的不再匹配；`reading` 字段解析出 `epp`；`## Today` 之外的同名行不被改。

### 1.2 主进程

1. `src/shared/data-protocol.ts`：
   - `DataRequest` 加 `| { kind: "course.afterRead"; slug: string; label: string; date: string }`。
   - `DataResponseMap` 加 `"course.afterRead": { label: string; reading: string | null };`。
   - `isDataRequest` 加校验：`slug` 匹配 `/^[a-z0-9-]+$/`；`label` 是非空字符串、不含换行、长度 ≤ 200；`date` 用已有的 `isIsoDate`。
2. `src/main/data/handler.ts` 的 `handleScriptRequest` 加分支（需要库）：
   1. `runScript("course/course-state.mjs", ["after-read", join(vault, "wiki", "courses", `${slug}.md`), label, "--date", date])`，失败直接返回它的失败响应；
   2. 成功且 `reading` 不为 null：`runScript("reading/reading-queue.mjs", ["note", vault, reading, "--text", `讲后读 ${label} 已读（用户自报）`, "--today", date, "--json"])`，失败也直接返回；
   3. 依次 `course-state.mjs dashboard <courses> <wiki/courses.md>` 与 `render-board.mjs <courses> <wiki/courses.html>`（照 `courses.list` 等现有分支的路径写法）；
   4. 返回 `{ ok: true, data: { label, reading } }`。
   - 照 `runScript` 现有返回结构取第 1 步的 JSON；若 `runScript` 只为单次调用设计，就在 `handler.ts` 里写一个小的顺序执行辅助函数，不改 `runScript` 本身。
   - `handler.test.ts` 加：校验失败的请求被拒绝；（若现有测试有脚本替身机制）成功路径按顺序调用四个脚本。

## 第二部分：今日卡与总控入口

### 2.1 动作标记与文案

- `core/chat/action-marker.ts`：`ACTION_KINDS` 加 `"brief"`。
- `core/strings.ts`：
  - `actions` 加 `brief: "今日简报",`。
  - `control` 对象加：

```ts
    card: {
      askBrief: "让总控说说",
      foot: "来自周期页与课程页 · 改计划在下面直接跟总控说",
      study: "开课 →",
      verify: "核实 →",
      read: "开始读 →",
      anki: "打开 →",
      afterRead: "读完了",
      afterReadDue: (date: string): string => ` · ${date.slice(5)} 该读`,
      verifyRow: (name: string): string => `${name} 周核实`,
      auxPrefix: "辅助 · ",
      readRow: (title: string, position: string): string => `读书：${title}${position ? ` · 从 ${position}` : ""}`,
      missedRow: (name: string, id: string, date: string): string => `${name} ${id} 没学（原定 ${date.slice(5)}）`,
      afterReadFailed: "没能写进课程页，请在课程会话里说「讲后读读完了」。",
    },
```

### 2.2 纯函数 `core/board/control-card.ts`（+ 测试）

```ts
export type ControlCardMark = "now" | "warn" | "plan" | "faint";
export type ControlCardAction =
  | { kind: "study"; slug: string }
  | { kind: "verify"; slug: string }
  | { kind: "read" }
  | { kind: "anki" }
  | { kind: "afterRead"; slug: string; label: string };
export interface ControlCardRow { mark: ControlCardMark; text: string; button: string | null; action: ControlCardAction | null }
export interface ControlCardView { headline: string; rows: ControlCardRow[] }

export function controlCard(input: {
  today: string;                    // YYYY-MM-DD
  day: CycleDay | null;
  calendar: CalendarMonth | null;   // 当月（含今天）
  queue: ReadingQueueItem[];        // reading.queue
}): ControlCardView | null
```

规则（按这个顺序出行）：
1. `day` 为 null 或 `day.cycle === null` → 返回 null。`headline` = `${day.cycle} · ` + `cycleHeadline(day)`（`cycle-today.ts` 已有）。
2. `day.type === "休息"` 且没有课次：只出一行 `{ mark: "faint", text: tomorrowLine(day) ?? strings.plan.restItem, button: null, action: null }`，结束。
3. 主项课次：`day.lessons` 里 `roles[course] !== "aux"` 的每一项 → `{ mark: "now", text: \`${cycleName(day, course)} ${id} · ${content}\`, button: strings.control.card.study, action: { kind: "study", slug: course } }`。
4. 辅助课次：`roles[course] === "aux"` → `mark: "plan"`，`text` 前加 `auxPrefix`，按钮同上。
5. 整合日：`day.type === "整合"` 时，对 `day.roles` 里值为 `"main"` 的每门课 → `{ mark: "now", text: verifyRow(cycleName(day, slug)), button: verify, action: { kind: "verify", slug } }`。
6. 逾期课次：`day.overdue` 每项 → `{ mark: "warn", text: missedRow(name, id, date), button: study, action: study }`。
7. 讲后读：`calendar.days` 里日期 ≤ `today` 的每一天，`readingDue` 中 `slug` 含 `#讲后读-` 的项。`title` 形如「讲后读 §1.1–1.4 核心页（离散数学（Epp, 5th ed））」：`label` 取「讲后读 」之后到最后一个「（」之前的文字，课程 slug 取 `#` 之前。日期 < today → `mark: "warn"`，`text = title + afterReadDue(date)`；= today → `mark: "plan"`，`text = title`。按钮 `afterRead`，`action: { kind: "afterRead", slug, label }`。
8. 读书：`queue` 里 `due` ≤ today 的每项 → `mark` 为 `day.type === "低强度" ? "now" : "plan"`，`text = readRow(title, position)`，按钮 `read`，`action: { kind: "read" }`。
9. 非休息日最后一行 Anki：`{ mark: "plan", text: "Anki", button: anki, action: { kind: "anki" } }`。

测试覆盖：周期外 → null；休息日一行；深度日（主项 + 辅助 + 逾期 + 讲后读今天 + 讲后读逾期 + Anki 的顺序）；整合日两行核实；低强度日读书为 now；标签解析。

### 2.3 契约 `skins/contract.ts`

```ts
export interface ControlCardProps {
  view: ControlCardView;
  /** Run a row's button. */
  onAction(row: ControlCardRow): void;
  /** 「让总控说说」: ask the model for the brief (folded as 今日简报). */
  onAskBrief(): void;
  /** True while an answer streams or a 「读完了」 write runs: buttons disabled. */
  busy: boolean;
  /** A one-line error after a failed 「读完了」, else null. */
  error: string | null;
}
```

- `SkinSlots` 加 `ControlCard: ComponentType<ControlCardProps>;`。
- `ThreadProps` 加 `/** Rendered above the messages (the 总控 今日卡), or null. */ header: React.ReactNode | null;`——三个皮肤的 `Thread` 在消息列表之前渲染它。

### 2.4 皮肤 `ControlCard`

- **Bear**：照设计稿：白底细边框圆角卡（`var(--rule)` 边、10px 圆角、内边距 14px 16px）；标题行左灰字 `headline`、右「让总控说说」文字按钮；每行四列 `18px 1fr auto`：记号（now 蓝 `var(--accent)`、warn 琥珀 `var(--warn-text)`、plan 灰、faint 浅灰）、文字、按钮（now 行的按钮用正文墨色加粗，其他灰，悬停变墨色）；底部一行浅灰 `foot`；`error` 时在底部显示一行琥珀字。记号文字：now「●」、warn「!」、plan「○」、faint「◌」。样式限定 `[data-skin="bear"]`。
- **Chicago**：用它现有的窗口 / 列表 / 按钮样式（`chicago-btn` 等），黑白；记号同上。
- **bare**：语义 HTML 列表与按钮。
- 画廊加深度日与低强度日两个样例。

### 2.5 hook `core/board/use-control-card.ts`

- 输入：`cycle`（取 `cycle.today.state`）、`calendar`（当月资源）、阅读队列资源（`reading.queue`，找 App 里已有的阅读 hook；没有现成的 queue 资源就用 `useBoardResource(() => client.data({ kind: "reading.queue" }), [today])`）、`courses`、`controller`（`streaming`）、动作回调：`onStudy(slug)`、`onVerify(slug)`、`onOpenTool(tool)`、`askBrief()`，以及刷新课程与日历的函数。
- 返回 `ControlCardProps | null`（`controlCard(...)` 为 null 时返回 null）。
- `onAction`：study → `onStudy(slug)`；verify → `onVerify(slug)`；read → `onOpenTool("reading")`；anki → `onOpenTool("cards")`；afterRead → 设 busy，`client.data({ kind: "course.afterRead", slug, label, date: today })`，成功后刷新课程与日历资源，失败设 `error = strings.control.card.afterReadFailed`；结束清 busy。
- `onStudy`/`onVerify` 用 App 里给「今天」面板的同一组处理（`onStudyCourse`/`onVerifyCourse` 背后的函数），不要另写。

### 2.6 `core/board/use-control-session.ts`

1. `openControl` 里删掉自动简报：不再算 `briefDue`、不再写 `controlBriefOn`、不再 `sendCommand(briefPrompt)`。文件头注释同步。
2. 新增返回 `askBrief(): void` = `controller.sendCommand(withActionMarker(strings.control.briefPrompt, "brief"))`（总控会话里才可用；不在总控会话时先 `openControl()` 再发——用 `openSession(...).then` 的同样写法）。
3. 新增参数 `ready: boolean`（App 传 `controller.agentStatus === "ready" && !controller.disabled`）。加一个 effect：本次运行**只一次**（用 `useRef` 记），当 `ready && cycleId !== null && !controller.streaming` 时调用 `openControl()`。不发任何消息。若用户在就绪前已经点了别的课（`controller.messages.length > 0` 或 `activeCourse` 不为 null），则不跳转。
4. `use-control-session` 的测试（若有）同步：不再断言自动简报；加「就绪后只跳一次」「已有消息不跳」。

### 2.7 `App.tsx`

- `<Thread … header={control.isControl ? (controlCardProps ? <ControlCard {...controlCardProps} /> : null) : null} />`（`ControlCard` 从 `skin.slots` 取）。
- `useControlSession(...)` 加 `ready` 参数；`useControlCard(...)` 接上（放在 `useControlSession` 之后）。
- `wc -l` ≤ 450。

### 2.8 Chicago「今天」窗口的总控入口

`skins/chicago/today-panel.tsx`：`onOpenControl` 不为 null 时，在窗口顶部加一个「总控 →」按钮（文案用 bear/bare 已用的同一个 strings 键）。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && npm run lint:skills 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen/apps/desktop && wc -l src/renderer/App.tsx
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：全部通过（高负载下 `use-skin`/`contract` 偶发超时，单独重跑通过即可并注明）；`App.tsx` ≤ 450；`git status` 只多本批文件（工作区里已有前几批未提交的改动，不要动它们）。

## 结束报告（中文）

改了哪些文件、每一步是否照做、偏离之处及原因、未完成项，附验收输出。
