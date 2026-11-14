# batch-verified-on（Devin，约 30 分钟，先写测试）：记下每门课哪天发起过周核实

## 先读
`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。

## 为什么
总控「今天」的周核实行做过以后样子不变（用户 11-13 因此重复点了 4 次）。界面（Claude 另做）要显示「✓ 回到核实 →」，需要知道「这门课今天已经发起过周核实」。照现有 `courseStartedOn`（开课日）的写法加一个兄弟字段 `verifiedOn`。

## 范围（只改这些文件）
`apps/desktop/src/shared/protocol.ts`、`apps/desktop/src/shared/protocol.test.ts`、`apps/desktop/src/renderer/core/board/use-course-sessions.ts`、`apps/desktop/src/renderer/core/board/use-course-sessions.test.tsx`，以及 typecheck 报缺字段的测试夹具（只补 `verifiedOn: {}`）。**不准动**：`skins/`、`core/board/control-card.ts`、`core/board/use-control-card.ts`、`core/strings.ts`、`App.tsx`（Claude 同时在改）。

## 逐步
1. `shared/protocol.ts` 的 `DesktopSettings`（`courseStartedOn` 下面，约 301 行）加：
   ```ts
   /**
    * The day each course last had its 周核实 started (slug → YYYY-MM-DD).
    * The 今日卡 shows a verified course's row as done (「回到核实 →」), and
    * a second click only switches back.
    */
   verifiedOn: Record<string, string>;
   ```
   `DEFAULT_DESKTOP_SETTINGS`（约 370 行）加 `verifiedOn: {}`；`normalizeDesktopSettings`（约 571 行）加 `verifiedOn: normalizeCourseStartedOn(record.verifiedOn)`（同样只留真实日期，复用该函数，不新写）。若有 `isDesktopSettings` 之类的结构校验也照 `courseStartedOn` 补。
2. `use-course-sessions.ts` 的 `startSession`：在**真正 `deliver(text)` 之前**（两处：`activeCourse === slug` 分支、`.then` 里），若 `splitActionMarker(text).action === "verify"`，把 `verifiedOn: { ...settings.verifiedOn, [slug]: todayKey() }` 一起写进 `update(...)`（`.then` 分支并进已有的 `patch`；另一分支单独 `update`）。`alreadyAsked` 为真、不 deliver 时不写。
3. 不改其它行为（开课锁、`alreadyAsked`、`openedHistory` 都不动）。

## 测试（先写，先跑确认失败）
- `protocol.test.ts`：默认值 `verifiedOn` 为 `{}`；`normalizeDesktopSettings` 只保留真实日期（照 `keeps only real dates in courseStartedOn` 那条写一条 `verifiedOn` 的）。
- `use-course-sessions.test.tsx`：发核实（`verifyMessage`）后 `update` 收到 `verifiedOn: { [slug]: <今天> }`；发普通开课消息不写 `verifiedOn`；会话里已有同一核实（`alreadyAsked` 为真）时不写。

## 验收命令（贴最后几行）
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests |Test Files" && npm run -s build 2>&1 | tail -1
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | grep -E "^# (pass|fail)|lint-wording"
```

## 禁止
不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit / push、不加依赖；**自己做完，不要调用别的 agent**。

## 结束报告（中文）
改了哪些文件；先失败的测试；验收输出；偏离之处及原因。
