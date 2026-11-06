# 批次 BE-11a：总控会话（每个周期一个，不属于任何课程）

> 给 Devin（SWE-2）的**逐步执行清单**。按步骤原样做，不要自行设计；某一步做不到时停下，在报告里写清卡在哪一步、报错原文。

## 本批硬约束（压缩后也要记得）

1. 只改 / 新建这些文件：
   - `apps/desktop/src/shared/protocol.ts`（只加第 1 步的字段）
   - `apps/desktop/src/renderer/core/strings.ts`
   - `apps/desktop/src/renderer/core/commands/commands.ts`、`run-command.ts`、`run-command.test.ts`
   - 新建 `apps/desktop/src/renderer/core/board/use-control-session.ts`、`use-control-session.test.ts`
   - `apps/desktop/src/renderer/App.tsx`
   - `apps/desktop/src/renderer/skins/contract.ts`、`core/board/shell-panels.ts`、`gallery/panel-samples.ts`
   - `apps/desktop/src/renderer/skins/bear/cycle-today.tsx`、`today-panel.tsx`、`today-panel.test.tsx`、`skin.css`
   - `apps/desktop/src/renderer/skins/bare/panels.tsx`
   - 第 1 步说明的「补字段」：typecheck 报 `DesktopSettings` 缺 `controlSessions` / `controlBriefOn` 的文件（只在那些文件里补这两个字段，别的不动）
   其他文件一律不动。
2. 不加依赖。文案只写在 `core/strings.ts`。样式限定在 `[data-skin="bear"]` 下。
3. 不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 `git commit` / `git push`。
4. 不加 `eslint-disable`、`@ts-ignore`、`any`；`switch` 穷尽。`App.tsx` ≤ 450 行。

## 先读

`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`；`skills/cycle-plan/SKILL.md`（「每日简报」一节——总控就是在这个会话里用它）；`renderer/core/board/use-course-sessions.ts`（总控照它切会话，但不建课程）、`core/chat/useChat.ts`（`openSession`、`sendCommand`、`sessionFile`）、`core/commands/commands.ts` 与 `run-command.ts`、`App.tsx`、`skins/bear/cycle-today.tsx`。

## 背景

用户要一个「总控」会话把控整体进度：每个学习周期一个，不属于任何课程。打开它时切到这个周期记住的会话（没有就新开一个），并在每天第一次打开时自动发一句「给出今天的简报」（由 `cycle-plan` 技能按每日简报格式回答）。入口：`/总控` 命令，以及 Bear「今天」周期视图右上角的「总控 →」。打开后标题栏显示「总控 · C1」。头像在下一批（BE-11b）。

## 步骤

### 第 1 步：`shared/protocol.ts` 加两个设置字段

1. `DesktopSettings` 接口里，`courseStartedOn: Record<string, string>;`（连同它上方注释）之后加：
   ```ts
     /** The 总控 session file of each study cycle, keyed by cycle id (`C1`). */
     controlSessions: Record<string, string>;
     /** The local day (`YYYY-MM-DD`) the 总控 brief was last asked for, keyed by cycle id. */
     controlBriefOn: Record<string, string>;
   ```
2. `DEFAULT_DESKTOP_SETTINGS` 里 `courseStartedOn: {},` 之后加 `controlSessions: {},` 和 `controlBriefOn: {},`。
3. `normalizeDesktopSettings` 返回对象里 `courseStartedOn: normalizeCourseStartedOn(record.courseStartedOn),` 之后加：
   ```ts
       controlSessions: normalizeCourseSessions(record.controlSessions),
       controlBriefOn: normalizeCourseStartedOn(record.controlBriefOn),
   ```
4. 跑 `npm run typecheck`：凡是报某个 `DesktopSettings` 字面量缺这两个字段的地方（测试、样例等），在该字面量的 `courseStartedOn` 那一项之后补 `controlSessions: {}, controlBriefOn: {},`。只做这一种补法。

### 第 2 步：`core/strings.ts`

1. 在 `cycle: { … },` 整块之后加：

```ts
  control: {
    title: (cycle: string): string => `总控 · ${cycle}`,
    open: "总控 →",
    briefPrompt: "/skill:cycle-plan 给出今天的简报（按每日简报格式），只安排、不讲课。",
  },
```

2. 在 `commands: { … }` 对象里，`continueSession: "继续当前目录的最近会话",` 之后加：
   ```ts
       control: "打开总控：今天的安排与周期进度",
   ```

### 第 3 步：`/总控` 命令

1. `core/commands/commands.ts`：在 `BUILTIN_COMMANDS` 里 `{ command: "/继续", group: "学习", description: strings.commands.resume },` 之后加：
   ```ts
     { command: "/总控", group: "学习", description: strings.commands.control },
   ```
2. `core/commands/run-command.ts`：
   - 效果联合类型里 `| { kind: "continue-session" }` 之后加 `| { kind: "control" }`；
   - `switch` 里 `case "/继续会话": return { kind: "continue-session" };` 之后加：
     ```ts
         case "/总控":
           return { kind: "control" };
     ```
3. `core/commands/run-command.test.ts`：在第一个 `it(...)` 里最后一个 `expect` 之后加一行：
   ```ts
       expect(commandEffect("/总控")).toEqual({ kind: "control" });
   ```

### 第 4 步：新建 `core/board/use-control-session.ts`，原样如下

```ts
/**
 * The 总控 session: one session per study cycle, not tied to any course.
 *
 * Opening it switches to the cycle's remembered session (or a fresh one) and,
 * the first time each day, asks `cycle-plan` for the daily brief. Whether the
 * open session *is* the 总控 session is derived from the session file, so it is
 * never out of sync with what the agent actually has open.
 */

import { useCallback } from "react";
import type { DesktopSettings } from "@shared/protocol.js";
import type { ChatController } from "../chat/useChat.js";
import { strings } from "../strings.js";
import { dateKey } from "./use-calendar.js";

export interface ControlSession {
  /** True while the open session is this cycle's 总控 session. */
  isControl: boolean;
  /** Open the 总控 session, or focus the composer when it is already open. Does nothing outside a cycle. */
  openControl(): void;
}

/** Whether `sessionFile` is the 总控 session of `cycleId`. */
export function isControlSession(
  settings: Pick<DesktopSettings, "controlSessions">,
  cycleId: string | null,
  sessionFile: string | null,
): boolean {
  return cycleId !== null && sessionFile !== null && settings.controlSessions[cycleId] === sessionFile;
}

export function useControlSession(
  controller: ChatController,
  settings: DesktopSettings,
  update: (patch: Partial<DesktopSettings>) => void,
  cycleId: string | null,
  setActiveCourse: (slug: string | null) => void,
  requestFocus: () => void,
): ControlSession {
  const isControl = isControlSession(settings, cycleId, controller.sessionFile);

  const openControl = useCallback(() => {
    if (cycleId === null) return;
    if (isControl) {
      requestFocus();
      return;
    }
    const known = settings.controlSessions[cycleId] ?? null;
    const today = dateKey(new Date());
    setActiveCourse(null);
    void controller.openSession(known).then((opened) => {
      const patch: Partial<DesktopSettings> = {};
      if (opened && opened !== known) patch.controlSessions = { ...settings.controlSessions, [cycleId]: opened };
      const briefDue = settings.controlBriefOn[cycleId] !== today;
      if (briefDue) patch.controlBriefOn = { ...settings.controlBriefOn, [cycleId]: today };
      if (Object.keys(patch).length > 0) update(patch);
      // A brief is an instruction, not a lesson: no style prefix.
      if (briefDue) controller.sendCommand(strings.control.briefPrompt);
    });
  }, [
    controller,
    cycleId,
    isControl,
    requestFocus,
    setActiveCourse,
    settings.controlBriefOn,
    settings.controlSessions,
    update,
  ]);

  return { isControl, openControl };
}
```

### 第 5 步：新建 `core/board/use-control-session.test.ts`，原样如下

```ts
import { describe, expect, it } from "vitest";
import { isControlSession } from "./use-control-session.js";

describe("isControlSession", () => {
  const settings = { controlSessions: { C1: "/sessions/c1.jsonl" } };

  it("is true only for the cycle's own 总控 session file", () => {
    expect(isControlSession(settings, "C1", "/sessions/c1.jsonl")).toBe(true);
    expect(isControlSession(settings, "C1", "/sessions/course.jsonl")).toBe(false);
  });

  it("is false outside a cycle or before any session is open", () => {
    expect(isControlSession(settings, null, "/sessions/c1.jsonl")).toBe(false);
    expect(isControlSession(settings, "C1", null)).toBe(false);
    expect(isControlSession(settings, "C2", "/sessions/c1.jsonl")).toBe(false);
  });
});
```

### 第 6 步：契约、组装、样例

1. `skins/contract.ts`：`TodayPanelProps` 里 `onVerifyCourse(slug: string): void;` 之后加：
   ```ts
     /** Open the 总控 session, or null outside a study cycle. */
     onOpenControl: (() => void) | null;
   ```
2. `core/board/shell-panels.ts`：`ShellPanelsInput` 里 `onVerifyCourse(slug: string): void;` 之后加 `onOpenControl: (() => void) | null;`；`today: { … }` 里 `onVerifyCourse: input.onVerifyCourse,` 之后加 `onOpenControl: input.onOpenControl,`。
3. `gallery/panel-samples.ts`：`SAMPLE_PANELS.today` 里 `onVerifyCourse: noop,` 之后加 `onOpenControl: null,`。

### 第 7 步：`App.tsx`

1. import 区 `import { useSubjects } from "./core/board/use-subjects.js";` 之后加：
   ```ts
   import { useControlSession } from "./core/board/use-control-session.js";
   ```
2. 在 `useCourseSessions(...)` 那条语句（到它的 `);` 结束）之后加：
   ```ts
     const cycleId = cycle.today.state.status === "ready" ? cycle.today.state.value.cycle : null;
     const control = useControlSession(controller, settings, update, cycleId, setActiveCourse, () =>
       setFocusRequest((value) => value + 1),
     );
   ```
3. `runCommand` 的 `switch` 里 `case "continue-session": return handleContinueSession();` 之后加：
   ```ts
           case "control":
             return control.openControl();
   ```
   并在它的依赖数组末尾加 `control`。
4. `shellPanels({ … })` 参数里 `onVerifyCourse: …,` 之后加：
   ```ts
       onOpenControl: cycleId ? control.openControl : null,
   ```
5. `shellProps` 里把
   ```ts
       sessionTitle: activeCourse ? (courseTitles[activeCourse] ?? activeCourse) : null,
   ```
   改为
   ```ts
       sessionTitle:
         control.isControl && cycleId
           ? strings.control.title(cycleId)
           : activeCourse
             ? (courseTitles[activeCourse] ?? activeCourse)
             : null,
   ```
6. `wc -l App.tsx` ≤ 450。

### 第 8 步：Bear「今天」周期视图右上角的「总控 →」

1. `skins/bear/cycle-today.tsx`：
   - `CycleTodayProps` 接口里 `anki: AsyncState<AnkiStatus>;` 之后加 `onOpenControl: (() => void) | null;`
   - `CycleToday` 的参数解构里加 `onOpenControl,`
   - 把 `<p className="bear-cy-head">{view.headline}</p>` 替换为：
     ```tsx
           <div className="bear-cy-headrow">
             <p className="bear-cy-head">{view.headline}</p>
             {onOpenControl && (
               <button type="button" className="bear-link" onClick={onOpenControl}>
                 {strings.control.open}
               </button>
             )}
           </div>
     ```
2. `skins/bear/today-panel.tsx`：参数解构里 `onVerifyCourse,` 之后加 `onOpenControl,`；`<CycleToday … />` 上加属性 `onOpenControl={onOpenControl}`。
3. `skins/bear/skin.css` 末尾追加：
   ```css
   [data-skin="bear"] .bear-cy-headrow {
     display: flex;
     justify-content: space-between;
     align-items: baseline;
     gap: 1em;
   }
   ```
4. `skins/bear/today-panel.test.tsx`：在 `describe` 块内最后一个 `it(...)` 之后追加：
   ```tsx
     it("opens 总控 from the cycle view", async () => {
       const onOpenControl = vi.fn();
       render(<TodayPanel {...baseProps({ cycleToday: { status: "ready", value: SAMPLE_CYCLE_DAY }, onOpenControl })} />);
       await userEvent.click(screen.getByRole("button", { name: strings.control.open }));
       expect(onOpenControl).toHaveBeenCalledTimes(1);
     });
   ```

### 第 9 步：bare 的「今天」也给入口

`skins/bare/panels.tsx` 的 `TodayPanel`：参数解构里 `cycleToday,` 之后加 `onOpenControl,`；在 `{cycleLine && <p data-slot="cycle-headline">{cycleLine}</p>}` 之后加：
```tsx
      {onOpenControl && (
        <button type="button" onClick={onOpenControl}>
          {strings.control.open}
        </button>
      )}
```

## 完成标准（可观察）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && wc -l apps/desktop/src/renderer/App.tsx
cd /Users/gjy/pi-learning/xuegen && git status --short apps/desktop/src
```

- 贴出每条输出的最后 15 行。新测试（`use-control-session.test.ts` 2 个、`run-command` 新断言、Bear 今天新用例）通过，原有测试全部仍通过；`App.tsx` ≤ 450。
- 若某个断言与实际行为不符：先不要改测试或代码去迁就，在报告里写出失败的断言、实际值和你判断的原因，停下。

## 结束报告

列出：改了 / 新建了哪些文件（第 1 步第 4 点补字段的文件单独列出）；每一步是否照做；偏离之处及原因；未完成项；`App.tsx` 行数。
