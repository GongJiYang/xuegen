# batch-ui-fix2：第二轮界面收拢（进度、总控只摊开今天、撤销、说清后果）

设计稿：`design/animate/?d=fix2`（用户 2026-11-08 批准，「撤销这次收课」按规则抵消也已批准）。依据：NN/g 1 状态可见、3 可撤销、6 让用户看见选项；HAX 9 方便纠正、16 说明后果。

## 硬约束（先读，压缩后也照做）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/desktop/SKIN-LEDGER.md`（G1–G9）。
- 决策逻辑是纯函数并有同名测试；hook 的 effect 里不同步 setState（定时器回调里 setState 可以）；文案只在 `core/strings.ts`；契约改动 **bare、bear、chicago 三个皮肤都实现**，画廊补样例；样式限定在 `[data-skin="<id>"]` 下。
- **`App.tsx` 必须 ≤ 450 行**（现在 448）。新逻辑放 hook；按第 7 步压缩。
- 不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`。
- 工作区里已有前几批未提交的改动，不要动与本批无关的文件。

## 1. 等待时显示已用时间和步数

1.1 `core/chat/activity.ts`
- `Activity` 加两个字段：`/** 「3 分 12 秒 · 第 6 步」, or null before the first second. */ meta: string | null;` 和 `/** Past 3 minutes: skins tint the meta amber. */ long: boolean;`。文件里所有构造 `Activity` 的地方（含 `THINKING` 常量）补 `meta: null, long: false`。
- 新增纯函数：
```ts
/** Tool calls made since the learner's last message: the turn's step count. */
export function turnSteps(messages: readonly ChatMessage[]): number
/** Attach elapsed time and step count to the turn's activity line. */
export function withTurnMeta(activity: Activity | null, steps: number, seconds: number): Activity | null
```
  `turnSteps`：从最后一条 `role === "user"` 之后的 assistant 消息里累加 `toolCalls.length`。`withTurnMeta`：activity 为 null 返回 null；`seconds < 1` 时 `meta: null`；否则 `meta = strings.chat.activityMeta(seconds, steps)`，`long = seconds >= 180`。
- 测试：没有 user 消息、两段 assistant 各有工具调用、`seconds` 为 0 / 59 / 192（meta 文本与 long）。

1.2 `core/strings.ts` 的 `chat` 加：
```ts
    activityMeta: (seconds: number, steps: number): string =>
      `${seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`}${steps > 0 ? ` · 第 ${steps} 步` : ""}`,
    activityLong: "（太久了可以点输入框的停止）",
```

1.3 新 hook `core/chat/use-turn-activity.ts`：
```ts
export function useTurnActivity(messages: ChatMessage[], streaming: boolean, thinking: boolean): Activity | null
```
- 内部：`const [seconds, setSeconds] = useState(0);` effect 依赖 `[streaming]`：`if (!streaming) return;` 记 `const start = Date.now();`，`const tick = () => setSeconds(Math.floor((Date.now() - start) / 1000));`，`const first = setTimeout(tick, 0); const id = setInterval(tick, 1000);` 清理时两者都清。
- 返回 `withTurnMeta(turnActivity(messages, streaming, thinking), turnSteps(messages), streaming ? seconds : 0)`。
- 测试（fake timers）：streaming 后 2 秒 meta 为「2 秒」；停止后返回 null。

1.4 皮肤
- Bear `skins/bear/slots.tsx` 的 `ActivityLine`：在 `<Thinking …/>` 后加 `{activity.meta && <span className={activity.long ? "bear-activity-meta is-long" : "bear-activity-meta"}>{activity.meta}{activity.long ? strings.chat.activityLong : ""}</span>}`。CSS：`.bear-activity-meta { color: var(--faint); font-size: 12px; font-variant-numeric: tabular-nums; margin-left: 8px; }`，`.is-long { color: var(--warn-text); }`（限定 `[data-skin="bear"]`）。
- bare `skins/bare/messages.tsx`：`<Thinking label=…/>` 的 label 改为 `activity?.meta ? \`${activity.label} · ${activity.meta}\` : (activity?.label ?? strings.chat.thinking)`。
- Chicago：在它显示思考/活动的位置同样拼上 ` · ${meta}`（找 `activity` 或 `strings.chat.thinking` 的用处；没有显示 activity 就在 thinking 文字后拼）。

## 2. 总控只摊开今天的对话

2.1 `src/shared/protocol.ts` 的 `ChatMessage` 加 `/** ISO time the session file recorded it (restored history only; live messages leave it unset). */ at?: string;`。

2.2 `src/agent/history.ts`：`messageFrom(value, id)` 加第三个参数 `at: string | undefined`，有值时写进返回对象的 `at`；`historyFromEntries` 传 `(entry as { timestamp?: unknown }).timestamp` 是字符串时的值；`historyFromMessages` 传 `undefined`。`history.test.ts` 加一条：带 `timestamp` 的 entry 还原后 `at` 相等。

2.3 新纯函数 `core/board/control-fold.ts`（+ 测试）：
```ts
export interface ControlFold {
  messages: ChatMessage[];
  systemNotes: ThreadNote[];
  /** The 「更早的对话」 row, or null when nothing is earlier than today. */
  older: { count: number; since: string } | null;
}
export function foldEarlier(input: {
  messages: ChatMessage[];
  systemNotes: ThreadNote[];
  today: string;                       // YYYY-MM-DD
  localDay(iso: string): string;       // ISO → 本地 YYYY-MM-DD
  open: boolean;
}): ControlFold
```
- `k` = 第一个满足「没有 `at`」或「`localDay(at) >= today`」的下标；都不满足则 `k = messages.length`。
- `k === 0` → 原样返回，`older: null`。
- 否则 `older = { count: k, since: localDay(messages[0].at!) }`；`open` 为 true 时 messages/notes 原样；为 false 时 `messages.slice(k)`，notes 只留 `beforeIndex >= k` 的并把 `beforeIndex` 减 `k`。
- 测试：全是今天；前 3 条是昨天（折叠、notes 平移）；open 为 true；全是昨天（messages 为空、older.count 等于总数）。

2.4 新 hook `core/board/use-control-fold.ts`：
```ts
export function useControlFold(isControl: boolean, messages: ChatMessage[], systemNotes: ThreadNote[]): ControlFold & { open: boolean; toggle(): void }
```
`isControl` 为 false 时直接返回 `{ messages, systemNotes, older: null, open: false, toggle }`；否则 `foldEarlier({ …, today: dateKey(new Date()), localDay: (iso) => dateKey(new Date(iso)), open })`。`open` 用 `useState(false)`。

2.5 契约 `ControlCardProps` 加：
```ts
  /** The 「更早的对话」 row under the card, or null. */
  older: { label: string; onToggle(): void } | null;
```
`strings.control.card` 加 `older: (count: number, since: string, open: boolean): string => \`${open ? "▾" : "▸"} 更早的对话 · ${since.slice(5)} 起 · ${count} 条\``。三个皮肤的 `ControlCard` 在卡片**下方**渲染一个文字按钮（Bear：灰字 12.5px、上下 margin 12px/4px；Chicago：`chicago-btn`；bare：`<button>`）。画廊样例传 `older: { label: strings.control.card.older(38, "2026-11-05", false), onToggle: () => {} }`。

2.6 `App.tsx`：`const fold = useControlFold(control.isControl, controller.messages, controller.systemNotes);`；Thread 的 `messages={fold.messages}`、`systemNotes={fold.systemNotes}`；header 改为 `<ControlCard {...controlCard} older={fold.older ? { label: strings.control.card.older(fold.older.count, fold.older.since, fold.open), onToggle: fold.toggle } : null} />`。`pin={pinBoard(controller.messages)}` 不变。

## 3. 「读完了」10 秒内可撤销（先等 10 秒再写）

3.1 `core/board/control-card.ts`：`ControlCardMark` 加 `"done"`；`ControlCardAction` 加 `| { kind: "undoRead" }`；`ControlCardRow` 加 `hint: string | null`（见第 5 步）。新纯函数（+ 测试）：
```ts
/** The row whose 「读完了」 is waiting out its undo window: ✓ and 「撤销 · N」. */
export function withPendingRead(view: ControlCardView, pending: { slug: string; label: string; left: number } | null): ControlCardView
```
找 `action.kind === "afterRead"` 且 slug、label 相同的行，换成 `{ mark: "done", text: 原文, button: strings.control.card.undo(left), action: { kind: "undoRead" }, hint: null }`；pending 为 null 原样返回。`strings.control.card` 加 `undo: (left: number): string => \`撤销 · ${left}\``。

3.2 `core/board/use-control-card.ts`：
- 新状态 `const [pending, setPending] = useState<{ slug: string; label: string; deadline: number } | null>(null);` 与 `const [now, setNow] = useState(() => Date.now());`。
- 点 `afterRead`：不再立刻写，改为 `setPending({ slug, label, deadline: Date.now() + 10_000 }); setNow(Date.now());`。点 `undoRead`：`setPending(null)`。
- effect 依赖 `[pending]`：`if (!pending) return;` 设 `setInterval(() => setNow(Date.now()), 250)` 和 `setTimeout(() => { setPending(null); write(pending); }, pending.deadline - Date.now())`，清理时都清。`write` 就是原来 afterRead 分支里的那段（设 writing、`client.data({ kind: "course.afterRead", … })`、成功刷新、失败设 error）。
- 返回的 view 用 `withPendingRead(view, pending ? { slug: pending.slug, label: pending.label, left: Math.max(1, Math.ceil((pending.deadline - now) / 1000)) } : null)`。
- hook 测试（fake timers）：点读完了后 10 秒内不调用 `client.data`、点撤销后永不调用；10 秒后调用一次。

3.3 三个皮肤的 `ControlCard`：`mark === "done"` 显示「✓」，Bear 用 `var(--done)` 色；文字加删除线（Bear）或不加（Chicago/bare）。

## 4. 收课后：「撤销这次收课」

4.1 `core/chat/action-marker.ts`：`ACTION_KINDS` 加 `"undo-close"`；`strings.actions` 加 `"undo-close": "撤销收课"`（照现有 actions 的键写法）。

4.2 `core/strings.ts` 的 `lesson` 加：
```ts
    undoClose: "撤销这次收课",
    undoClosePrompt:
      "撤销这次收课：按 course 技能收课第 3 步「抵消」，把本次收课打的勾退回 [ ]，在那条记录里注明按用户要求撤销（记录不删）；本次新建的概念页和卡片不删，列出来问我要不要删。",
```

4.3 `core/chat/lesson-actions.ts` 的 `lessonActions(activeCourse, messages)`：在已有判断之后，找最后一条 `role === "user"` 的消息，`splitActionMarker(markdown).action === "close"` 且它后面有 `markdown.trim() !== ""` 的 assistant 消息时，返回 `[undoClose, cards]` 两个按钮（undoClose 的 text 为 `withActionMarker(strings.lesson.undoClosePrompt, "undo-close")`，cards 同现有制卡），不再返回总结/收课。测试补这一种。

## 5. 按钮说明会改什么 + 「收课 ▾」小菜单

5.1 `LessonAction` 改为 `{ label: string; hint: string; text: string; options: { label: string; text: string }[] }`。`strings.lesson` 加：
```ts
    summaryHint: "把这节讲过的整理成今日要点和题目，钉在左边；不改任何文件",
    cardsHint: "按这节答对的内容起草卡片，先给你看，确认后才写",
    closeHint: "给这节打勾、写学习记录和概念页，定讲后读；会改课程页，要几分钟",
    undoCloseHint: "把这次收课打的勾退回去，记录保留并注明撤销",
    closePlain: "收课",
    closeNoWiki: "收课，不写概念页",
    closeNoRecord: "不记录，直接结束",
    closeNoWikiSuffix: "（今天不写库：这次不写概念页）",
    noRecordPrompt: "本次不记录：不写任何文件，直接结束这节课。",
```
收课按钮 `options`：`[{ label: closePlain, text: 原收课 text }, { label: closeNoWiki, text: withActionMarker(strings.commands.endTodayPrompt + strings.lesson.closeNoWikiSuffix, "close") }, { label: closeNoRecord, text: withActionMarker(strings.lesson.noRecordPrompt, "close") }]`；其余按钮 `options: []`。测试同步。

5.2 契约 `ComposerProps.lessonActions` 改为 `{ label: string; hint: string; run(): void; options: { label: string; run(): void }[] }[]`。

5.3 新 hook `core/chat/use-lesson-actions.ts`：`useLessonActions(activeCourse, controller)` 返回上面的契约数组（`run: () => controller.send(text)`，options 同理）。App 里 `lessonActions={…}` 那一行改成用它（`const lessonButtons = useLessonActions(activeCourse, controller);`）。

5.4 皮肤
- Bear `composer.tsx`：每个按钮 `title={action.hint}`；`onMouseEnter` 记下 hint，在按钮行**下方**一行显示（`.bear-clesson-hint`，灰 12px，没有 hover 时不占位用 `min-height`）。`options.length > 0` 的按钮文字后加「 ▾」，点击打开一个小菜单（用 Radix `DropdownMenu`，项目里已有就用；没有就用一个绝对定位的 `<div role="menu">`），菜单项点击调用对应 `run`。
- Chicago：按钮 `title={action.hint}`；有 options 的按钮点击打开它现有的菜单样式（或把 options 渲染成并排的 `chicago-btn`）。
- bare：`title={action.hint}`；options 渲染成按钮后面并排的 `<button>`。

5.5 今日卡的说明：`ControlCardRow.hint`。`controlCard` 里：study 行 `hint = strings.control.card.studyHint`（「打开这门课今天的会话，开始讲」），verify 行 `verifyHint`（「打开这门课，逐项核实本周任务」），afterRead 行 `afterReadHint`（「在课程页把这行打勾（记『用户自报』），并在阅读页记一行；10 秒内可撤销」），其余 null。三个皮肤的行按钮加 `title={row.hint ?? undefined}`。

## 6. 两个小问题

- `core/strings.ts`：日历图例两处 `Anki = 低强度` 后面加 `　读书 = 读原书`（第 315、316 行附近的 `legend` 与 `legendAux`）。
- Bear `skills-panel.tsx` 的勾选框：`skin.css` 加 `[data-skin="bear"] .bear-skills input[type="checkbox"] { accent-color: var(--ink); }`（选择器按该面板实际的根 class 写）。

## 7. App.tsx 行数

改完 `wc -l src/renderer/App.tsx`；超过 450 时，把 `renderMessage` 里 `<MessageRenderer …/>` 的 props 合并成 2–3 行（不改逻辑）。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && npm run lint:skills 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen/apps/desktop && wc -l src/renderer/App.tsx
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：全部通过（高负载下 `use-skin`/`contract` 偶发超时，单独重跑通过即可并注明）；`App.tsx` ≤ 450；画廊有「更早的对话」与 done 行样例；`SKIN-LEDGER.md` 补本批各项并在变更记录加一行。

## 结束报告（中文）

改了哪些文件、每一步是否照做、偏离之处及原因、未完成项，附验收输出。
