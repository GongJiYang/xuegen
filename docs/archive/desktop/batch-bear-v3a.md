# batch-bear-v3a：Bear 拉开主次与分组（总控今日卡、右侧面板、总进度、日历）

方案：`docs/desktop/BEAR-VISUAL-PLAN.md` 第三节；设计稿 `design/animate/?d=bearv` 的「改后」（用户已批准）。**只改 Bear**：`skins/bear/skin.css`、`skins/bear/calendar-panel.tsx`、`core/strings.ts` 里日历图例两条文案、Bear 版本号。不碰 Chicago、bare、App 与其他 core 文件。

## 硬约束（先读，压缩后也照做）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/BEAR-VISUAL-PLAN.md`。
- 新样式只用 `skin.css` 顶部变量（`--gray-N`、`--accent-9/11`、`--warn-11`、`--done-11`、`--sp-N`、`--fs-N`/`--lh-N`、`--r-N`、`--font-ui`）；不写新散值（尺寸类 width/height 除外）。样式限定在 `[data-skin="bear"]` 下。
- 不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint。工作区有前几批未提交改动，不要动无关文件。

## 1. 总控今日卡：整段替换

把 `skin.css` 里从 `[data-skin="bear"] .bear-cc {` 开始、到 `[data-skin="bear"] .bear-cc-error { … }` 结束的所有 `.bear-cc*` 规则（含 `.bear-cc-older`）**整段替换**为：

```css
/* 总控 今日卡 (BEAR-VISUAL-PLAN 三): UI type, not the body scale; the 「now」 row is the one loud thing. */
[data-skin="bear"] .bear-cc {
  font-family: var(--font-ui);
  font-size: var(--fs-2);
  line-height: var(--lh-2);
  border: 1px solid var(--gray-6);
  border-radius: var(--r-2);
  padding: var(--sp-3) var(--sp-4);
  margin: 0 0 var(--sp-2);
  background: var(--card);
}
[data-skin="bear"] .bear-cc-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-3);
  margin-bottom: var(--sp-2);
}
[data-skin="bear"] .bear-cc-title {
  font-size: var(--fs-1);
  line-height: var(--lh-1);
  color: var(--gray-11);
}
[data-skin="bear"] .bear-cc-ask {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-weight: 500;
  color: var(--accent-11);
  cursor: pointer;
}
[data-skin="bear"] .bear-cc-ask:not(:disabled):hover {
  color: var(--accent-11);
  text-decoration: underline;
}
[data-skin="bear"] .bear-cc-rows {
  list-style: none;
  margin: 0;
  padding: 0;
}
[data-skin="bear"] .bear-cc-rows li {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  gap: var(--sp-3);
  align-items: baseline;
  padding: var(--sp-2) 0;
  color: var(--gray-11);
}
[data-skin="bear"] .bear-cc-mark {
  text-align: center;
}
[data-skin="bear"] .bear-cc-rows li[data-mark="now"] {
  color: var(--gray-12);
  font-size: var(--fs-3);
  line-height: var(--lh-3);
  font-weight: 500;
}
[data-skin="bear"] .bear-cc-rows li[data-mark="now"] .bear-cc-mark {
  color: var(--accent-9);
}
[data-skin="bear"] .bear-cc-rows li[data-mark="warn"] {
  color: var(--warn-11);
}
[data-skin="bear"] .bear-cc-rows li[data-mark="done"] .bear-cc-mark {
  color: var(--done-11);
}
[data-skin="bear"] .bear-cc-rows li[data-mark="done"] .bear-cc-text {
  text-decoration: line-through;
}
[data-skin="bear"] .bear-cc-btn {
  background: none;
  border: none;
  border-radius: var(--r-1);
  padding: var(--sp-1) var(--sp-2);
  font: inherit;
  font-size: var(--fs-2);
  line-height: var(--lh-2);
  font-weight: 400;
  color: var(--gray-11);
  cursor: pointer;
}
[data-skin="bear"] .bear-cc-btn:not(:disabled):hover {
  background: var(--gray-4);
  color: var(--gray-12);
}
[data-skin="bear"] .bear-cc-rows li[data-mark="now"] .bear-cc-btn {
  background: var(--gray-3);
  color: var(--gray-12);
  font-weight: 500;
}
[data-skin="bear"] .bear-cc-foot {
  margin: var(--sp-2) 0 0;
  font-size: var(--fs-1);
  line-height: var(--lh-1);
  color: var(--gray-11);
}
[data-skin="bear"] .bear-cc-error {
  margin: var(--sp-2) 0 0;
  color: var(--warn-11);
}
/* The 「更早的对话」 fold row under the card. */
[data-skin="bear"] .bear-cc-older {
  display: block;
  background: none;
  border: none;
  padding: 0;
  margin: var(--sp-5) 0 var(--sp-2);
  font-family: var(--font-ui);
  font-size: var(--fs-1);
  line-height: var(--lh-1);
  color: var(--gray-11);
  cursor: pointer;
}
[data-skin="bear"] .bear-cc-older:hover {
  color: var(--gray-12);
}
```
（`data-mark="plan"`/`"faint"` 不再单独设色：行默认就是 11 级灰。`control-card.tsx` 不改。）

## 2. 选中态：2px 强调色下划线（用 accent-11：非文字指示要对背景 ≥ 3:1，accent-9 只有 2.6:1）

- `.bear-tab[data-state="active"]`：`box-shadow: inset 0 -2px 0 var(--accent-11);`，并加 `font-weight: 500;`。`.bear-tab` 的 `padding: 0.3em 0` 改成 `padding: var(--sp-1) 0`。
- `.bear-cstyle[data-state="checked"]` 与 `.bear-tabpanels .bear-seg-item[data-state="checked"]`：`box-shadow: inset 0 -2px 0 var(--accent-11);`。

## 3. 面板：去掉行线和框，用空白分组

逐条修改（只改列出的属性）：

| 选择器 | 改动 |
|---|---|
| `.bear-tabpanels ul li` | 删 `border-bottom`；padding 设为 `var(--sp-1) 0` |
| `.bear-tabpanels .bear-read-list li.bear-read-item` | 删 `border-bottom`；`margin-bottom: var(--sp-3)` |
| `.bear-tabpanels .bear-decks li.bear-deck` | 删 `border-bottom`；`margin-bottom: var(--sp-3)` |
| `.bear-cy-focus` | 删 `border-bottom`；`margin-bottom: var(--sp-5)` |
| `.bear-cy-list li` | 删 `border-bottom` |
| `.bear-tabpanels .bear-pg-section-head` | 删 `border-bottom`；`margin-top: var(--sp-5)`；`font-size: var(--fs-1)`；`line-height: var(--lh-1)`；`color: var(--gray-11)` |
| `.bear-pg-list li` | 删 `border-bottom` |
| `.bear-plan-route` | 删 `border-bottom`；`margin-bottom: var(--sp-5)` |
| `.bear-tabpanels .bear-p4-rest .bear-pg-section-head` | 删 `border-bottom` |
| `.bear-course` | 删 `border-bottom`；`margin-bottom: var(--sp-4)` |
| `.bear-course.is-card` | 删 `border`；`padding: 0` |
| `.bear-p4-card` | `border` 改成 `none`；`padding: var(--sp-2) 0` |

`.bear-box`（虚线框提示）、`.bear-table td`、弹出层（`.bear-slash`、`.bear-submenu`、`.bear-pin-pop`、`.bear-sessions`、`.bear-daydlg`）的边框不动。

## 4. 日历

4.1 格子高度：`.bear-tabpanels .bear-mcal-day` 的 `height: 52px` 改成 `height: 60px`。
4.2 「C1 起 / C1 完」标签不再压在日期数字上：`.bear-mcal-flag` 整条规则替换为
```css
/* Cycle start/end: a 2px accent line along the top of the cell; the words stay for screen readers. */
[data-skin="bear"] .bear-mcal-flag {
  position: absolute;
  top: 0;
  left: var(--sp-1);
  right: var(--sp-1);
  height: 2px;
  overflow: hidden;
  border-radius: var(--r-1);
  background: var(--accent-11);
  color: transparent;
  font-size: var(--fs-1);
  line-height: 2px;
}
```
并在 `calendar-panel.tsx` 的 `<span className="bear-mcal-flag">{flag}</span>` 上加 `title={flag}`。
4.3 图例：`core/strings.ts` 第 343–345 行附近的 `legend(...)` 与 `legendAux` 两条，在「空白 = 休息」之前加 `顶部蓝线 = 周期起止　`。`.bear-mcal-cyclegend` 的 `margin: 0.3em 0 0` 改成 `margin: var(--sp-3) 0 0`，`color: var(--soft)` 改成 `color: var(--gray-11)`。

## 5. 小修

`.bear-pin-chip` 的 `border-radius: 12px` 改成 `border-radius: 999px`。

## 6. 升版本号

Bear 0.4 → 0.5（`skins/registry.ts`）。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen/apps/desktop/src/renderer/skins/bear && grep -n "border-bottom: 1px solid" skin.css
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：全部通过（样式断言或文案测试因本批改动失败的，按新值更新并在报告里列出）；第 3 节列出的选择器不再有 `border-bottom`。

## 结束报告（中文）

改了哪些文件、每一步是否照做、偏离之处及原因、未完成项，附验收输出。
