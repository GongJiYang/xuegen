# Bear 皮肤（`skins/bear/`）

iA Writer / Bear 方向：只有一栏正文，侧栏收进右侧抽屉。设计依据是
`docs/desktop/skins/bear.md`；文档没写的行为照 Chicago。

- `index.ts`：`bearSkin` 模块（懒加载 `skin.css`），登记在 `skins/registry.ts`。
- `skin.css`：token 与全部样式，作用域 `[data-skin="bear"]`。
- `motion.ts`：`MotionPreset`，用 `motion` 的 `animate()`。
- `body-scale.ts`：字号档位 `[0.875, 1, 1.125, 1.25, 1.5]`（基准 16px）与最近档吸附。
- `content.tsx` / `hast-react.ts`：内容节点渲染（HAST → React）。
- `slots.tsx`：消息级插槽。`shell.tsx` / `menu.tsx`：标题栏、「⋯」菜单与右侧抽屉。
- `composer.tsx` / `slash-menu.tsx` / `tool-dock.tsx`：输入区、`/` 菜单、抽屉标签条。
- `today-panel.tsx` 等 `*-panel.tsx` 与 `day-editor.tsx`：BE-2 完善前的最小可用版。
- `assets/`：`bear-diagram-mono.woff2`（代码与字符图的半宽等宽字体，Iosevka 子集，SIL OFL 1.1，许可见 `OFL-Iosevka.txt`；由 `apps/desktop/scripts/make-bear-diagram-font.py` 生成）。
