# batch-split-panel-app（DeepSeek，约 15 分钟）：拆两个超过 450 行的文件，行为不变

`apps/desktop/src/renderer/skins/bear/control-panel.tsx` 467 行、`apps/desktop/src/renderer/App.tsx` 452 行，都超过约定的 450 行。只搬代码，不改任何行为、文案、类名。

**只改这些文件**：`skins/bear/control-panel.tsx`、新建 `skins/bear/control-shelf.tsx`、`App.tsx`、新建 `core/chat/use-exercise-actions.ts` 和 `core/chat/use-exercise-actions.test.tsx`。不 commit / push、不加依赖。
**自己做完，不要调用 `pi`、`devin` 或任何别的 agent。不读写 `~/.xuegen/`，不碰真实 Obsidian 库，不启动 Electron。** 别人可能同时在改 `core/board/` 下的文件：跑全量测试时如果失败的只是你没碰过的文件，在报告里列出即可，不要去修。

## 1. `control-panel.tsx` → 新文件 `control-shelf.tsx`
- 把书房相关的四个组件原样搬过去：`ShelfList`（约 66 行）、`Unplanned`（约 105 行）、`AddBook`（约 204 行，连同它上面的注释）、`TargetEditor`（约 411 行起到文件尾，连同注释）。
- `control-shelf.tsx` 导出 `ShelfList`、`Unplanned`、`AddBook`（`TargetEditor` 只被 `ShelfList` 用就不导出；如果别处也用，就一并导出）。文件头写一行注释：`Bear 总控 「书房」 block pieces: the reading list, 已登记没排, 加一本书 and 设目标日期.`
- `control-panel.tsx` 改为从 `./control-shelf.js` 引入；删掉不再用到的 import（`ShelfRow`、`UnplannedMaterial` 等，按 typecheck / lint 提示删）。
- 目标：`control-panel.tsx` ≤ 300 行。

## 2. `App.tsx` → 新 hook `use-exercise-actions.ts`（先写测试）
「检查理解」的状态和三个回调（`App.tsx` 约 201 行 `answering` state，234–250 行三个 `handleExercise*`）搬进：
```ts
export function useExerciseActions(controller: Pick<ChatController, "sendCommand">, requestFocus: () => void): {
  answering: number | null;
  cancelAnswer(): void;
  onAnswer(index: number): void;
  onHint(index: number): void;
  onSkip(index: number): void;
}
```
行为和现在完全一样：`onAnswer` 设 `answering` 并调 `requestFocus()`；`onHint` 发 `strings.content.exerciseHintPrompt(index)`；`onSkip` 发 `strings.content.exerciseSkipPrompt(index)`，并且 `answering === index` 时清成 null；`cancelAnswer` 设 null。保留原来的注释（「检查理解」 actions (B10)…）。
- **先写** `use-exercise-actions.test.tsx`（用 `@testing-library/react` 的 `renderHook`，参照同目录其他 hook 测试）：onAnswer(2) → answering 为 2、requestFocus 调过 1 次；onHint(1) → sendCommand 收到 `exerciseHintPrompt(1)`；answering 为 2 时 onSkip(2) → answering 变 null 且 sendCommand 收到 skip 提示；answering 为 2 时 onSkip(3) → answering 仍为 2；cancelAnswer → null。跑一次贴失败输出，再实现。
- `App.tsx` 用 `const exercise = useExerciseActions(controller, () => setFocusRequest((value) => value + 1));`，把用到 `answering` / `setAnswering` / `handleExercise*` 的地方（约 353、359、373、374 行）换成 `exercise.*`。删掉不再用到的 import。
- 目标：`App.tsx` ≤ 430 行。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && wc -l src/renderer/App.tsx src/renderer/skins/bear/control-panel.tsx src/renderer/skins/bear/control-shelf.tsx && npm run -s typecheck && npm run -s lint && npx vitest run 2>&1 | grep -E "Tests|Test Files|FAIL"
```

## 结束报告（中文，写到 `docs/desktop/batch-split-panel-app.report.md`）：第 2 步测试失败输出、两个文件拆后行数、验收输出。
