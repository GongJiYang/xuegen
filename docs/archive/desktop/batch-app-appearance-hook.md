# 任务单：App.tsx 降回 450 行以内——把文档外观的两个 effect 搬进 hook（DeepSeek，约 10 分钟，先写测试）

背景：`apps/desktop/src/renderer/App.tsx` 现在 459 行，超过 `xuegen-arch-gate` / `apps/desktop/AGENTS.md` 规定的 450 行上限（`70070c1` 加了 11 行时漏审）。App.tsx 只做组装，新逻辑放 core 的 hook。本批**只搬代码，不改任何行为**；界面工作暂停中，不许改样式、文案、组件。

只改：`apps/desktop/src/renderer/App.tsx`，新建 `apps/desktop/src/renderer/core/settings/use-document-appearance.ts` 与同名 `.test.tsx`。不碰 `~/.xuegen`、不启动 Electron、不提交。

## 先写测试 `core/settings/use-document-appearance.test.tsx`
仿照同目录 `use-body-scale-shortcuts.test.tsx` 的写法（`@testing-library/react` 的 `renderHook`）：
1. 传入 `windowBackground: "#123456"` → `document.documentElement.style.backgroundColor` 被设上；传 `undefined`/空 → 不设置（保持原值）。
2. `skinLoaded: true` 时 `dataset.skin`、`dataset.bodyFont`、`dataset.bodyScale` 被设成传入值（`bodyScale` 经 `coerceBodyScaleForFont` 处理，照 App.tsx 现有调用写断言）；`unmount()` 后三个 dataset 字段被删除。
3. `skinLoaded: false` 时不设置 dataset。

## 再搬代码
1. 新文件 `use-document-appearance.ts`，导出
   ```ts
   export function useDocumentAppearance(options: {
     windowBackground: string | undefined;
     skinLoaded: boolean;
     skinId: string;
     bodyFont: <与 settings.bodyFont 同类型>;
     bodyScale: <与 settings.bodyScale 同类型>;
   }): void
   ```
   函数体 = App.tsx 里现在这两个 `useEffect`（`settings.windowBackground` 那个，和 `if (!skin) return; document.documentElement.dataset.skin = loadedId; …` 那个）原样搬过来，`skin` 改判 `options.skinLoaded`，`loadedId` 改用 `options.skinId`，依赖数组对应替换。`coerceBodyScaleForFont` 的 import 跟着搬。
2. App.tsx：删掉这两个 `useEffect`，在原位置写一行
   `useDocumentAppearance({ windowBackground: settings.windowBackground, skinLoaded: Boolean(skin), skinId: loadedId, bodyFont: settings.bodyFont, bodyScale: settings.bodyScale });`
   删掉 App.tsx 里因此不再用到的 import（如 `coerceBodyScaleForFont`）。
3. `wc -l apps/desktop/src/renderer/App.tsx` 必须 ≤ 450。

## 验收
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build && wc -l src/renderer/App.tsx
```
贴出最后几行。报告：App.tsx 前后行数、新文件行数、测试条数。
