# batch-bear-v2：Bear 状态补齐（焦点、悬停、禁用、加载、占位文字）

方案：`docs/desktop/BEAR-VISUAL-PLAN.md` 第四节；设计稿 `design/animate/?d=bearv`（「回答中 / 加载中」开关，按 Tab 看焦点环），用户已批准。**只改 Bear**：`skins/bear/skin.css`、`skins/bear/today-panel.tsx`、`skins/bear/calendar-panel.tsx` 与 Bear 皮肤版本号；不碰 Chicago、bare、core、App。

## 硬约束（先读，压缩后也照做）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/BEAR-VISUAL-PLAN.md`。
- 新样式只用 `skin.css` 顶部已有的变量（`--gray-N`、`--accent-11`、`--sp-N`、`--fs-N`/`--lh-N`、`--r-N`），不写新的散值。样式限定在 `[data-skin="bear"]` 下。
- 不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint。工作区里有前几批未提交改动，不要动无关文件。

## 1. 键盘焦点

1.1 找到注释 `/* Keyboard focus: a thin accent outline instead of the browser's default ring. */` 下面那条 `[data-skin="bear"] :focus-visible { … }`，改成：
```css
/* Keyboard focus: a 2px accent-11 ring (≥ 3:1 on every background step). */
[data-skin="bear"] :focus-visible {
  outline: 2px solid var(--accent-11);
  outline-offset: 2px;
  border-radius: var(--r-1);
}
```
紧随其后的 `:focus:not(:focus-visible) { outline: none; }` 保留。

1.2 输入框：
- `[data-skin="bear"] .bear-ccard:focus-within { border-color: var(--gray-8); }` 改成 `border-color: var(--accent-11);`，并在它前面加 `[data-skin="bear"] .bear-ccard:hover { border-color: var(--gray-8); }`。`.bear-cinput:focus-visible { outline: none; }` 保留（外框已经显示焦点）。
- `[data-skin="bear"] .bear-tabpanels input:focus, [data-skin="bear"] .bear-tabpanels textarea:focus { outline: none; … }` 这条规则里，在 `outline: none;` 后加 `box-shadow: 0 0 0 2px var(--accent-11);`。
- `[data-skin="bear"] .bear-daydlg textarea:focus { outline: none; … }` 同样加 `box-shadow: 0 0 0 2px var(--accent-11);`。
- `.bear-menu .bear-subtrigger` 与 `.bear-drawer` 的 `outline: none` 不动（菜单项靠高亮底色，抽屉是容器）。

## 2. 悬停

2.1 在 `[data-skin="bear"] button:disabled { … }` 规则**之前**加一条兜底（选择器特异性低，已有的具体 hover 规则仍然生效）：
```css
/* Every enabled button reacts to the pointer: text to ink unless a rule says otherwise. */
[data-skin="bear"] button:not(:disabled):hover {
  color: var(--gray-12);
}
```
2.2 `[data-skin="bear"] .bear-btn-accent:hover { color: var(--accent-11); opacity: 0.75; }` 改成 `{ color: var(--accent-11); text-decoration: underline; }`（链接式按钮悬停加下划线，不靠透明度）。

## 3. 禁用

`[data-skin="bear"] button:disabled { cursor: default; opacity: 0.5; }` 改成：
```css
[data-skin="bear"] button:disabled {
  cursor: not-allowed;
  opacity: 1;
  color: var(--gray-8);
}
```
`.bear-clesson:disabled` 里的 `color: var(--rule)` 改成 `color: var(--gray-8)`。`.bear-csend:disabled` 与 `.bear-pop button:disabled` 保持原样。

## 4. 加载中

4.1 `today-panel.tsx` 的 `TodayPanel`：在 `const cycleDay = …` 之前加：
```tsx
  if (cycleToday.status === "loading") {
    return (
      <section className="bear-today" aria-label={strings.today.title}>
        <p className="bear-muted">{strings.today.loading}</p>
      </section>
    );
  }
```
4.2 `calendar-panel.tsx` 的 `CalendarPanel`：在 `{month.status === "error" && <p role="alert">{month.message}</p>}` 那一行**之前**加 `{month.status === "loading" && <p className="bear-muted">{strings.today.loading}</p>}`。
4.3 若这两个面板有测试文件，补一条「loading 时显示 `strings.today.loading`」。

## 5. 占位文字

`[data-skin="bear"] .bear-cinput::placeholder { color: var(--gray-8); }` 改成 `color: var(--gray-11);`。`skin.css` 里其他 `::placeholder` 的颜色若是 `--gray-8`/`--faint`，同样改成 `--gray-11`。

## 6. 升版本号

Bear 皮肤版本号 0.3 → 0.4（`skins/registry.ts`）。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen/apps/desktop/src/renderer/skins/bear && grep -n "opacity: 0.5\|opacity: 0.75" skin.css; grep -n "::placeholder" -A1 skin.css
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：全部通过；`opacity: 0.5/0.75` 不再用于按钮；`git status` 只多本批文件。

## 结束报告（中文）

改了哪些文件、每一步是否照做、偏离之处及原因、未完成项，附验收输出。
