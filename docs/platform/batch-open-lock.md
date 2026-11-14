# batch-open-lock（Devin，约 40 分钟，先写测试）：开课按钮连点不得重复开会话

## 现象（用户 11-12 报）
侧边栏点「开课」，连点两次（或在会话打开的几百毫秒内再点），会开出两个同一门课的会话。

## 根因（已查，见 `use-course-sessions.ts`）
- `openCourse` 用 `openingAction(slug, today, settings.courseStartedOn, activeCourse)` 判断。
- 「今天还没开」时返回 `send-opening`，进入 `startSession`。
- `startSession` 里 `courseStartedOn[slug] = today` 要等 `controller.openSession(...).then(...)` 完成后才通过 `update` 写入。
- 所以打开中途第二次点击，`courseStartedOn[slug]` 仍不是今天，又走一遍 `send-opening`，`openSession` 被调用两次。
- `setActiveCourse(slug)` 是状态更新，同一渲染周期内第二次点击读到的仍是旧值。

## 前置状态（11-12 Devin 上一轮遗留，保留勿还原）
`use-course-sessions.ts` 已有一处改动：`dateKey(new Date())` 换成 `todayKey()`（import 从 `./use-calendar.js` 改为 `../today.js`）。这是合理的日期统一（`todayKey` 能被 `XUEGEN_TODAY` 覆盖，结果与 `dateKey(new Date())` 相同），**保留，不要还原**。本单只在它之上叠加锁。

## 要改（只改下面列出的文件）
文件：`apps/desktop/src/renderer/core/board/use-course-sessions.ts` 与其测试 `use-course-sessions.test.tsx`。

1. 在 `useCourseSessions` 内新增 `const opening = useRef<Set<string>>(new Set())`（同步、不依赖渲染）。
2. `startSession` 开头：若 `opening.current.has(slug)` 为真，**直接 return**（不发消息、不 setIntro、不 openSession）。
3. 调用 `controller.openSession` 前 `opening.current.add(slug)`；`.then` 与 `.catch` 两条路径都 `opening.current.delete(slug)`（失败也必须释放，否则这门课再也点不开）。
4. `openCourse` 在 `action === "send-opening"` 且 `opening.current.has(slug)` 为真时，改为 `requestFocus()` 后 return（与「已开过」一致的行为，不新发起）。
5. 不改 `openingAction` 的纯函数逻辑，不改 `opening-action.ts`。

## 测试（先写，先跑确认失败，再实现）
在 `use-course-sessions.test.tsx` 增加：
- A：同一门课连续调用 `openCourse` 两次（同一个 act 内），`controller.openSession` 只被调用 **1 次**。
- B：`openSession` 返回 rejected 时，锁被释放：之后再点能再次调用 `openSession`（共 2 次）。
- C：`openSession` 进行中点击另一门课，不被锁挡住（两门课各 1 次）。
- D：`openSession` 完成后（resolve），再点同一门课：走 `openingAction` 原逻辑（不被锁挡）。

## 不许做
- 不加依赖；不改 `chat-controller`、`useChat` 的 `openSession` 签名；不改 UI 组件；不 commit / push。
- 不用 `setTimeout` 防抖（用同步锁）。
- 不放宽 eslint，不加 `eslint-disable`。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run -s typecheck && npm run -s lint && npx vitest run src/renderer/core/board/use-course-sessions.test.tsx 2>&1 | grep -E "Tests |FAIL"
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm test 2>&1 | grep -E "Tests |Test Files"
```

## 结束报告（中文）
- 改了哪几行；先失败的测试输出（A、B 应先红）；
- 验收输出；
- 偏离本单之处与原因。
