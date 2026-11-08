# batch-bear-v3d（DeepSeek）：审核 V3c + 补齐设计稿不一致的 9 处

你是审核与返修方。核对清单：`docs/desktop/BEAR-AUDIT-1108.md`（设计稿 ↔ 实际逐项表）。**只改 Bear**（`src/renderer/skins/bear/` 与本单列出的 core 文件），不碰 Chicago、bare。

## 硬约束

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/BEAR-VISUAL-PLAN.md`。
- 新样式只用 `skin.css` 顶部变量（`--gray-N`、`--accent-11`、`--sp-N`、`--fs-N`/`--lh-N`、`--r-N`、`--card`）；尺寸（width/height/grid 列宽）除外。样式限定在 `[data-skin="bear"]` 下；文案只在 `core/strings.ts`。
- 不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`。
- 每步改完就跑一次 `cd apps/desktop && npm run typecheck`，有错先修。

## A. 审核 V3c（Devin 刚写完，未提交）

1. `git diff` 看改动，逐条对照 `docs/desktop/batch-bear-v3c.md` 的第 1–4 步：是否照做、有没有多改或漏改。
2. 跑 `cd apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000`。
3. 发现偏离或错误就直接修；在报告的「审核」一节逐条写：步骤 · 是否照做 · 问题 · 你的修改。

## B. 补齐（逐条照做）

**B1 右侧面板打开时不再盖住对话**（`skins/bear/shell.tsx` + `skin.css`）
- `shell.tsx` 里 `<div className="bear-root" …>` 加属性 `data-drawer={open ? "open" : undefined}`（`open` 是同一组件里控制抽屉的变量）。
- `skin.css` 加：
```css
/* With the drawer open on a wide window, the column makes room instead of sitting under it. */
@media (min-width: 1000px) {
  [data-skin="bear"] .bear-root[data-drawer="open"] .bear-col {
    padding-right: 380px;
  }
}
```

**B2 「今天」面板标题下的线**：`.bear-cy-focus` 删掉 `border-top: 2px solid var(--accent);`，`padding: 0.7em 0 0.8em` 改成 `padding: var(--sp-2) 0`。

**B3 总进度只给展开的那门课浅底**：`.bear-p4-card` 的 `background: var(--card)` 改成 `background: none`；加
```css
[data-skin="bear"] .bear-p4-card.is-open {
  background: var(--gray-3);
  padding: var(--sp-2) var(--sp-3);
  margin-left: calc(-1 * var(--sp-3));
  margin-right: calc(-1 * var(--sp-3));
}
```

**B4 日历「今天」格**：`.bear-mcal-day.is-today .bear-mcal-num` 改成 `background: none; color: var(--accent-11); font-weight: 600;`，并加 `[data-skin="bear"] .bear-tabpanels .bear-mcal-day.is-today { background: var(--gray-3); }`。

**B5 阅读日期写成「11-14 周六」**（`core/board/reading-due.ts`）：`dueLabel` 最后一行 `return \`${Number(month)}月${Number(day)}日\`;` 改成返回 `${month}-${day} ${weekday}`，其中 `weekday` 用 `["周日","周一","周二","周三","周四","周五","周六"][new Date(\`${due}T00:00:00\`).getDay()]`。同步更新 `reading-due.test.ts` 里对应断言（例：`2026-11-14` → `11-14 周六`）。

**B6 风格档位用小一号字**：`.bear-cstyle` 加 `font-size: var(--fs-1); line-height: var(--lh-1);`。

**B7 「回到最新」不压正文**：`.bear-back` 改成
```css
[data-skin="bear"] .bear-back {
  position: absolute;
  right: 0;
  bottom: calc(100% + var(--sp-2));
  padding: var(--sp-1) var(--sp-2);
  background: var(--card);
  border: 1px solid var(--gray-6);
  border-radius: var(--r-1);
  font-size: var(--fs-1);
  line-height: var(--lh-1);
  color: var(--gray-11);
  z-index: 2;
}
```
然后找到渲染 `bear-back` 的元素：若它不在输入框外层容器（`.bear-composer`）里，把它移到 `.bear-composer` 内部第一个子元素，并给 `.bear-composer` 加 `position: relative;`（这样它挂在输入框上沿）。在报告里写清它原来在哪、移到哪。

**B8 `/` 菜单底部键盘提示**：`core/strings.ts` 的 `input` 加 `slashKeys: "↑↓ 选择 · Enter 执行 · Esc 关闭",`；`skins/bear/slash-menu.tsx` 在最外层 `div.bear-slash` 内、列表之后加 `<p className="bear-slash-keys">{strings.input.slashKeys}</p>`；`skin.css` 加
```css
[data-skin="bear"] .bear-slash-keys {
  position: sticky;
  bottom: 0;
  margin: 0;
  padding: var(--sp-2) var(--sp-4);
  border-top: 1px solid var(--gray-6);
  background: var(--card);
  font-size: var(--fs-1);
  line-height: var(--lh-1);
  color: var(--gray-11);
}
```

**B9 会话列表课名栏**：`.bear-sessions-row` 的 `grid-template-columns: 44px 88px 1fr auto` 改成 `44px minmax(56px, 120px) 1fr auto`；`.bear-sessions-time` 加 `font-variant-numeric: tabular-nums;`（若已有就跳过）。

## C. 升版本号与检查

Bear 0.8 → 0.9（`skins/registry.ts`；若 V3c 没升到 0.8，就从当前值加 0.1）。

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen && git status --short
```

## 结束报告（中文，最后输出）

1. 审核：V3c 每步的结论与你的修改。
2. B1–B9 每条：照做 / 偏离（原因）。
3. 验收命令最后几行输出。
4. 未完成项。
