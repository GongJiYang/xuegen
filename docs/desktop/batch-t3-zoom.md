# 批次 T3：⌘+ 放大模糊 → 锁页面缩放，改为正文放大

先读：`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/desktop/HANDOFF-2026-11-04.md` 的 T3 一节、`docs/desktop/skins/chicago.md`。

## 原因
Electron 默认菜单的放大是页面缩放（1.1、1.2…倍）。Chicago 的像素字体只有在 12px 的整数倍下才清晰，非整数缩放必然模糊。

## 要做
1. 主进程 `apps/desktop/src/main/index.ts`：
   - 窗口加载后 `webContents.setZoomFactor(1)`、`setVisualZoomLevelLimits(1, 1)`；监听 `zoom-changed` 复位到 1。
   - 自建应用菜单（macOS 保留 app/编辑/窗口等常用项，复制粘贴撤销必须照常可用），**去掉** zoomIn / zoomOut / resetZoom，避免菜单快捷键改页面缩放。
2. 渲染进程：⌘+ / ⌘= / ⌘- / ⌘0（Windows/Linux 用 Ctrl）改成「正文放大」，修改设置 `bodyScale`：
   - 放大的步进规则做成纯函数放在 core（例如 `core/settings/` 下 `stepBodyScale(current, direction: "in" | "out" | "reset", skinSteps)`），并写测试。
   - 每个皮肤声明自己允许的档位：Chicago 只有 `[1, 2]`（见 `skins/chicago/body-scale.ts`），bare 用现有 0.75–2 的档位。若契约里还没有这个字段，在 `skins/contract.ts` 的皮肤模块上加一个可选的 `bodyScaleSteps`，缺省时用 bare 的档位。
   - 按键监听放在 `App.tsx`（与现有 ⌘⇧K 监听同处，但这个不限于 DEV），`preventDefault`。
   - 输入框里聚焦时也要生效（⌘ 组合键不影响打字）。
3. 不允许整个页面非整数缩放；不新增字号。

## 验收（你必须自己跑，全部通过才算完成）
在 `apps/desktop` 下：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。在仓库根：`npm test`、`npm run lint:skills`。

## 禁止
- 不要读写 `~/.xuegen/`，不要碰 Obsidian 库。不要 git commit/push。不要启动 Electron。
- 不要改与本批无关的文件；不要动 T1/T2 刚加的新课程/改计划、刷新面板的代码。

## 结束时
输出：改了哪些文件、每项怎么实现的、六条检查命令的结果（贴最后几行）。
