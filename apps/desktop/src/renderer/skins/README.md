# skins — 可替换皮肤

一套界面 = 一个皮肤目录，实现 `contract.ts` 的全部插槽。规则见 `docs/desktop/UI-ARCHITECTURE.md`。

- `contract.ts`：皮肤契约的类型定义（唯一真相源）：`SkinDefinition`、`SkinModule`、`SkinSlots`、各 `*Props`、`ContentRenderers`。
- `registry.ts`：登记表，`id → 懒加载函数`；样式与组件只在选中时加载。新皮肤只在这里加一项。
- `use-skin.ts`：按 id 加载皮肤，未知 id 或加载失败回退 `bare` 并给提示。
- `use-appearance.ts`：外观设置（皮肤列表、当前皮肤选项、正文字体与字号、窗口背景）及其写入；`App` 与画廊共用。
- `bare/`：参照皮肤，无样式语义 HTML，实现全部插槽，含「外观」切换入口（`<select>`）；契约测试与兜底用。
- `chicago/`：第一套设计皮肤（经典 Mac OS 黑白像素），见其 `README.md` 与 `docs/desktop/skins/chicago.md`。

约束：皮肤不得 import 其他皮肤，不得自带文案（用 `core/strings.ts`），样式限定在 `[data-skin="<id>"]` 下。新增插槽或视图模型字段时 `bare` 必须同步实现，否则契约测试失败。
