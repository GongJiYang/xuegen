# batch-split-panel-app 报告（DeepSeek）

拆两个超过 450 行的文件，行为不变。只改任务单点名的文件；未 commit / push，未加依赖，未调用任何别的 agent，未读写 `~/.xuegen/`，未启动 Electron。

## 1. 第 2 步测试先失败的输出

先写 `src/renderer/core/chat/use-exercise-actions.test.tsx`，此时 `use-exercise-actions.ts` 还不存在：

```
$ npx vitest run src/renderer/core/chat/use-exercise-actions.test.tsx
 FAIL  src/renderer/core/chat/use-exercise-actions.test.tsx [ src/renderer/core/chat/use-exercise-actions.test.tsx ]
Error: Failed to resolve import "./use-exercise-actions.js" from "src/renderer/core/chat/use-exercise-actions.test.tsx". Does the file exist?
  Plugin: vite:import-analysis
 ...
 Test Files  1 failed (1)
      Tests  no tests
```

实现 `use-exercise-actions.ts` 后同一测试：

```
$ npx vitest run src/renderer/core/chat/use-exercise-actions.test.tsx
 ✓ src/renderer/core/chat/use-exercise-actions.test.tsx (5 tests) 15ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

5 个用例对应任务单要求的五点：`onAnswer(2)` → `answering === 2` 且 `requestFocus` 只调一次；`onHint(1)` → `sendCommand` 收到 `exerciseHintPrompt(1)`；`answering === 2` 时 `onSkip(2)` → 变 null 且收到 skip 提示；`answering === 2` 时 `onSkip(3)` → 仍为 2；`cancelAnswer` → null。

## 2. 拆后行数

| 文件 | 拆前 | 拆后 |
|---|---|---|
| `src/renderer/skins/bear/control-panel.tsx` | 467 | **263** |
| `src/renderer/skins/bear/control-shelf.tsx`（新） | — | **218** |
| `src/renderer/App.tsx` | 452 | **427** |
| `src/renderer/core/chat/use-exercise-actions.ts`（新） | — | 46 |
| `src/renderer/core/chat/use-exercise-actions.test.tsx`（新） | — | 68 |

- `control-panel.tsx` 目标 ≤ 300 行 → 263 行；`App.tsx` 目标 ≤ 430 行 → 427 行。
- `control-shelf.tsx` 文件头注释按任务单原文写入；导出 `ShelfList`、`Unplanned`、`AddBook`，`TargetEditor` 只被 `ShelfList` 用，所以不导出。
- 四个组件原样搬移，只把 `AddBook` 从 `function` 改为 `export function`；用脚本逐块比对过原文，`ShelfList` / `Unplanned` / `AddBook`（正文）/ `TargetEditor` 与搬移前逐字节一致。
- `control-panel.tsx` 删掉搬走后才不用的 import（`useState`、`ShelfRow`、`UnplannedMaterial`、`control-prompts` 的五个函数），改为从 `./control-shelf.js` 引入。
- `App.tsx` 用 `const exercise = useExerciseActions(controller, () => setFocusRequest((value) => value + 1));`，`answering` / `setAnswering` / 三个 `handleExercise*` 全部删除，四处在用点（`Thread` 的三个回调用 `exercise.*`、`Composer` 的 `onSend` 用 `exercise.answering`、`answering` prop、`onCancelAnswer={exercise.cancelAnswer}`）替换。`strings` 与 `useCallback` 仍有其他用处，保留。

### 偏离规格 / 需要说明的改动

1. **`weekFocus` 滚动（`control-panel.tsx`）**：仓库当前工作区里 `contract.ts` 新增了可选字段 `ControlPanelProps.weekFocus`（「在周表格里看」把本周块滚进视野，别人正在做的改动），而 `control-panel.tsx` 里的对应实现被我第一版「按行号整块切除并恢复」的操作误删过，已按工作区原样补回（`useRef` + `useEffect` + `matchMedia` 减少动效判断，`ref` 落在 `.bear-cp-col` 上），与任务单的搬移无关。补回后 typecheck / lint 均通过。
2. **`App.tsx` 有两处纯换行调整**：`useSessionFreshness(...)` 与 `if (!skin) return null;`。这是为了把 `App.tsx` 压到 430 行以内必需的行数；原文件本身不符合 prettier 格式（HEAD 版本的 `App.tsx` 跑 `prettier --check` 就是 `warn`），所以没有对整份文件跑格式化，避免制造大片无关 diff。语义与参数顺序未变。

## 3. 验收输出

```
$ cd /Users/gjy/pi-learning/xuegen/apps/desktop && wc -l src/renderer/App.tsx src/renderer/skins/bear/control-panel.tsx src/renderer/skins/bear/control-shelf.tsx && npm run -s typecheck && npm run -s lint && npx vitest run 2>&1 | grep -E "Tests|Test Files|FAIL"
     427 src/renderer/App.tsx
     263 src/renderer/skins/bear/control-panel.tsx
     218 src/renderer/skins/bear/control-shelf.tsx
     908 total
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/renderer/core/board/panel.test.ts > panelTiles: six tiles, normal / loading > today: 完成 / 总项，第一个未完成主课写「先上 …」；都做完写「都做完了」
 Test Files  1 failed | 150 passed (151)
      Tests  1 failed | 1431 passed | 1 skipped (1433)
```

`npm run -s typecheck` 与 `npm run -s lint` 都静默通过（零输出即零错误、零警告），单独确认退出码：

```
$ npm run -s typecheck; echo "typecheck exit=$?"
typecheck exit=0
$ npm run -s lint; echo "lint exit=$?"
lint exit=0
```

### 全量测试里唯一失败的那条与我无关

`src/renderer/core/board/panel.test.ts:132` 期望「今天」tile 是 `2 / 4 项`，实际 `2 / 5 项`：

```
AssertionError: expected { Object (key, value, ...) } to deeply equal { Object (key, value, ...) }
  Object {
    "key": "today",
    "sub": "主攻日 · 先上 离散 D5",
-   "value": "2 / 4 项",
+   "value": "2 / 5 项",
    "warn": false,
  }
 ❯ src/renderer/core/board/panel.test.ts:132:20
```

这条测试与 `panel.ts` 时间戳同为 `11月 14 18:52`（我开工前），而现在 `planbook.ts`（今天计划项的来源，`11月 14 19:16` 被改过）是 `M` 状态——是 `core/board/` 那边并行改动导致的多出一项，属于任务单里「别人同时在改、失败的只是你没碰过的文件」的情形，按要求列出、不修。本批没有任何一行代码涉及 `core/board/panel*` 或 `planbook*`。

## 4. 未完成项

无。
