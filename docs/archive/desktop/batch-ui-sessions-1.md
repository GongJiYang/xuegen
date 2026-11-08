# batch-ui-sessions-1：会话列表（按天）与日历「这天的会话」

设计稿：`design/animate/?d=fix1` 的标题下拉「会话」列表和「③ 日历：这天的会话」（用户 2026-11-08 批准；标题规则：课程会话「课次 + 内容」，自由会话用第一句话）。前两批 `batch-ui-words-1`、`batch-ui-lesson-1` 已完成（`core/chat/action-marker.ts` 已有 `splitActionMarker`）。

## 硬约束（先读，压缩后也照做）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/desktop/ARCHITECTURE.md`、`docs/platform/PRINCIPLES.md`。
- 主进程读文件的入参必须做目录守卫（照 `src/agent/session-file.ts` 的 `isOwnSessionFile`）；跨进程请求有运行时校验（`isDataRequest`）。
- 决策逻辑是纯函数并有测试（主进程的放 `src/main/data/`，渲染层的放 `src/renderer/core/board/`）；hook 的 effect 里不同步 setState；文案只在 `core/strings.ts`。
- 契约改动 **bare、bear、chicago 都实现**，画廊补样例。`App.tsx` ≤ 450 行（新逻辑放 hook）。
- 不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖（`radix-ui` 已在依赖里，可用其 `Popover`）；不放宽 eslint。

## 要做成什么（可观察）

- Bear 左上角标题变成按钮「<标题> ▾」，点开弹出「会话」列表：按天分组（今天 / 昨天 / `MM-DD 周X`），每行「时间 · 课名或『总控』『自由』 · 标题 · N 条」，当前会话高亮；点一行就打开那个会话（课程会话同时切到那门课）；列表顶部右侧「＋ 新会话」。
- `⋯` 菜单里「继续最近会话」换成「会话列表」，打开同一个列表；`/会话列表` 命令也一样。
- 日历选中某天，详情末尾多一节「这天的会话」，列出那天的会话，点一行打开。
- bare、chicago 用各自现有的列表/窗口样式实现同样的入口与列表（不要求视觉一致）。

## 第 1 步 主进程：读会话摘要

1. `src/shared/data-protocol.ts`：
   - `DataRequest` 加 `| { kind: "sessions.list"; current: string }`（`current` = 当前会话文件的绝对路径）。
   - 新类型：

```ts
/** One session transcript, summarized for the session list (from the transcript file itself). */
export interface SessionMeta {
  /** Absolute path of the `.jsonl` transcript. */
  file: string;
  /** Start time in epoch ms, from the file name's timestamp. */
  startedAt: number;
  /** The first user message's text (raw, may carry `[风格：…]` and an action marker), "" when none. */
  firstUser: string;
  /** The first 「今日要点 · X」 title in an assistant message (「离散 D2」), or null. */
  pin: string | null;
  /** User + assistant text messages. */
  count: number;
}
```

   - `DataResponseMap` 加 `"sessions.list": SessionMeta[];`；`isDataRequest` 加 `case "sessions.list": return typeof value.current === "string" && value.current.endsWith(".jsonl");`。
2. 新文件 `src/main/data/sessions.ts`：
   - 纯函数 `summarizeSession(file: string, text: string): SessionMeta | null`：文件名需匹配 `(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_` （同 `renderer/core/board/session-freshness.ts` 的 `SESSION_STAMP`），不匹配返回 null；`startedAt` 用 `Date.UTC(...)`。逐行 `JSON.parse`（坏行跳过），只看 `type === "message"` 的记录：`message.role` 为 `user`/`assistant` 且有文本（`content` 为字符串，或数组里 `type === "text"` 的 `text` 拼接）时 `count += 1`；第一条有文本的 user 记为 `firstUser`；第一条 assistant 文本里 `/今日要点\s*·\s*([^\n\]]+)/` 的第 1 组（去首尾空白）记为 `pin`。
   - `listSessions(home: string, current: string): SessionMeta[]`：`isOwnSessionFile(home, current)` 不成立返回 `[]`；否则列出 `dirname(current)` 下所有 `.jsonl`，按文件名倒序取前 80 个，逐个 `readFileSync` + `summarizeSession`，去掉 null，按 `startedAt` 倒序返回。读文件出错的跳过。
   - `sessions.test.ts`：用临时目录造 3 个会话文件（含坏行、含 `今日要点 · 离散 D2` 的 assistant、无文本消息），断言字段；`listSessions` 对 `sessions/` 之外的路径返回 `[]`。
3. `src/main/data/handler.ts`：`handleDataRequest` 的 switch 里（不需要库的那一组，和 `anki.status` 并列）加 `case "sessions.list": return { ok: true, data: listSessions(resolveHome(), request.current) };`（`resolveHome` 从 `../../agent/environment.js` 引入，`vault.ts` 已有同样引用），并把 `"sessions.list"` 加进 `handleScriptRequest` 参数类型里被排除的 kind 列表。

## 第 2 步 渲染层：把摘要变成列表（纯函数）

新文件 `src/renderer/core/board/session-list.ts` + 测试：

```ts
export interface SessionRow {
  file: string;
  /** 「09:12」 local time. */
  time: string;
  kind: "course" | "control" | "free";
  /** Course slug when known (opening it switches to that course), else null. */
  slug: string | null;
  /** 「离散」 for a course, 「总控」 / 「自由」 otherwise. */
  tag: string;
  title: string;
  count: number;
  current: boolean;
}
export interface SessionGroup { date: string; label: string; rows: SessionRow[] }

export interface SessionListContext {
  current: string | null;
  today: string;               // YYYY-MM-DD local
  tzOffsetMinutes: number;     // new Date().getTimezoneOffset()
  controlFiles: string[];      // Object.values(settings.controlSessions)
  courseSessions: Record<string, string>; // settings.courseSessions (slug → file)
  courseNames: Record<string, string>;    // slug → 短名（cycle month 的 names；没有时用课程标题）
  lessons: Record<string, { course: string; id: string; content: string }[]>; // cycle month 的 lessons（可空对象）
}

export function sessionGroups(metas: SessionMeta[], ctx: SessionListContext): SessionGroup[]
```

规则（逐条照做）：
1. 日期：`startedAt` 按本地时区换成 `YYYY-MM-DD`（用 `ctx.tzOffsetMinutes`，同 `session-freshness.ts` 的 `sessionDay` 算法）；`time` 为本地 `HH:MM`。
2. 文本：`splitStyleTag(meta.firstUser).body` → `splitActionMarker(...)` 得到 `marker` 与正文 `body`。
3. 种类与 slug：`ctx.controlFiles` 含此文件 → `control`；否则 slug = `marker.slug` ?? 在 `ctx.courseSessions` 里值等于此文件的那个键 ?? null；slug 不为 null 或 `meta.pin` 不为 null → `course`；否则 `free`。
4. tag：control →「总控」（strings）；course → slug 有则 `ctx.courseNames[slug]`，否则取 `pin` 的第一个空格前的部分（「离散 D2」→「离散」）；free →「自由」（strings）。
5. 标题：
   - control → strings 里的「今日简报」。
   - course：`pin` 存在时取 `pin` 去掉开头的 tag 与空格后的部分（「离散 D2」→「D2」），再在 `ctx.lessons[该日]` 里找 `course === slug && id === 该课次` 的项，找到就是「D2 <content>」，否则「D2」；`pin` 不存在时用 `body` 第一行（去掉开头的 `/skill:xxx `），最多 30 字，超出加「…」。
   - free：`body` 第一行，最多 30 字，超出加「…」；为空用 strings 的「（空会话）」。
6. `current` = `file === ctx.current`。
7. 分组：按日期倒序；组内按 `startedAt` 倒序；`label`：今天 →「今天 · MM-DD 周X」，昨天 →「昨天 · MM-DD 周X」，其他「MM-DD 周X」（周几用项目里已有的工具或 strings 里已有的周几表，不要另写一份）。
8. 测试覆盖：总控、带 marker 的课程会话、只有 pin 的旧课程会话（courseSessions 里没有）、自由会话、空会话、跨天分组与标签、课次内容补全。

## 第 3 步 hook `src/renderer/core/board/use-session-list.ts`

- 参数：`controller`（取 `sessionFile`、`openSession`）、`settings`、`activeCourse` 相关的 `setActiveCourse`、`cycle`（取当月 `names`/`lessons`，没有就空对象）、`courses`（课程标题兜底）。
- 状态：`open: boolean`；数据用 `client.data({ kind: "sessions.list", current })`，在 `open` 变为 true、或当前会话文件变化且 `open` 为 true 时取一次；日历详情需要时也要有数据——所以另外在首次挂载与 `sessionFile` 变化时取一次（不管 open）。没有 `sessionFile` 时为空列表。
- 返回 `SessionsView`（见第 4 步）。`onPick(row)`：`setActiveCourse(row.slug)`（null 也设），`controller.openSession(row.file)`，然后 `open = false`。`onNew`：调用 App 已有的新会话处理（作为参数传入），然后 `open = false`。
- `requestOpen()`：设 `open = true`（给 `/会话列表` 和 `⋯` 菜单用）。

## 第 4 步 契约 `skins/contract.ts`

1. 新类型：

```ts
export interface SessionsView {
  open: boolean;
  onOpenChange(open: boolean): void;
  status: "loading" | "ready" | "error";
  groups: SessionGroup[];
  onPick(file: string): void;
  onNew(): void;
}
```

（`SessionGroup`/`SessionRow` 从 `core/board/session-list.ts` 引入类型，或在 contract 里重新声明同形状——照 contract 现有做法。）
2. `ShellProps` 加 `sessions: SessionsView;`；把 `onContinueSession(): void;` 换成 `/** Open the session list (⋯ menu 「会话列表」). */ onOpenSessions(): void;`。
3. `CalendarPanelProps` 加 `/** That day's sessions; empty when none or not loaded. */ daySessions(date: string): SessionRow[];` 与 `onOpenSession(file: string): void;`。

## 第 5 步 App 与面板组装

- `App.tsx`：用 `useSessionList(...)`；`ShellProps` 的 `sessions` 传它的 view，`onOpenSessions` 传 `requestOpen`；原来传 `onContinueSession` 的地方删掉（`handleContinueSession` 若不再被用，从 `use-course-sessions.ts` 的返回与接口里删掉）。`runCommand` 里新增命令效果（第 6 步）调用 `requestOpen`。
- `core/board/shell-panels.ts` 的 `calendar` 面板加 `daySessions: (date) => groups.find((g) => g.date === date)?.rows ?? []` 与 `onOpenSession`（调用 hook 的 `onPick` 对应行）。需要的输入从 `shell-panels` 的参数传入（加一个参数），不要在面板里取数据。

## 第 6 步 命令与文案

- `core/commands/commands.ts`：「会话」组在 `/新会话` 后加 `{ command: "/会话列表", group: "会话", description: strings.commands.sessionList }`。
- `core/commands/run-command.ts`：`CommandEffect` 加 `| { kind: "sessions" }`；`case "/会话列表": return { kind: "sessions" };`。测试同步。
- `core/strings.ts`：`commands.sessionList: "按天找回以前的会话"`；`topBar.continueSession` 改名为 `topBar.sessionList: "会话列表"`（引用处同步）；新增

```ts
  sessions: {
    title: "会话",
    newSession: "＋ 新会话",
    today: "今天",
    yesterday: "昨天",
    control: "总控",
    free: "自由",
    controlTitle: "今日简报",
    empty: "（空会话）",
    count: (n: number): string => `${n} 条`,
    dayHeading: "这天的会话",
    loading: "正在读取会话…",
    failed: "读不到会话列表。",
    none: "还没有会话。",
  },
```

## 第 7 步 皮肤

- **Bear**：
  - `shell.tsx` 标题 `<span className="bear-title">` 改为 `radix-ui` 的 `Popover`：触发按钮内容是原标题文字（保留 `ControlBot`）加一个小 `▾`；内容区宽 420px、最高 460px 可滚动，顶部一行「会话」与右侧「＋ 新会话」按钮；下面按组渲染：组标题小号灰字，行为四列（时间 / tag / 标题 / N 条），当前行浅蓝底、标题蓝色（`var(--accent)` 或该皮肤表示「现在」的变量），悬停浅灰底。`open`/`onOpenChange` 用 `props.sessions` 的。`status` 为 loading/error/空 时显示对应 strings。
  - `menu.tsx`：「继续最近会话」项换成 `strings.topBar.sessionList`，`onSelect` 调 `onOpenSessions`。
  - `calendar-panel.tsx` 的 `DayDetail`：末尾加一节，`daySessions(date)` 非空时显示 `<h4>{strings.sessions.dayHeading}</h4>` 与同样四列的行（用按钮，点击 `onOpenSession(row.file)`）。
  - 样式写在 `skins/bear/skin.css`，选择器限定 `[data-skin="bear"]`；行的四列用 `grid-template-columns: 44px 54px 1fr auto`。
- **bare**：标题旁加一个「会话 ▾」按钮切换 `sessions.open`，打开时在标题下方渲染同样的分组列表（无样式要求）；菜单里的「继续最近会话」换成「会话列表」；日历详情加「这天的会话」列表。
- **chicago**：菜单「文件」里的继续项换成「会话列表」（`onOpenSessions`）；`sessions.open` 时用它现有的窗口样式（如 `chicago-win`）显示一个「会话」窗口，内容为分组列表，有关闭框；日历详情加「这天的会话」列表。
- 画廊补 `sessions` 与 `daySessions` 的样例数据。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen/apps/desktop && wc -l src/renderer/App.tsx
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：全部通过（高负载下 `contract.test.tsx` 偶发皮肤加载超时，单独重跑通过即可并注明）；`App.tsx` ≤ 450；`git status` 只多本批文件。

## 结束报告（中文）

改了哪些文件、每一步是否照做、偏离之处及原因、未完成项，附验收输出。
