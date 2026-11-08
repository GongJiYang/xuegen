# batch-bear-v3b：Bear 拉开主次（课程会话、/ 菜单、会话列表、阅读面板按钮）

方案：`docs/desktop/BEAR-VISUAL-PLAN.md` 第三节；设计稿 `design/animate/?d=bearv3`（用户已批准）。**只做 Bear 的视觉**；为此需要的两处小逻辑放在 core（第 3、4 节），对所有皮肤生效、但只需 Bear 验收。不改 Chicago、bare 的文件。

## 硬约束（先读，压缩后也照做）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/desktop/BEAR-VISUAL-PLAN.md`。
- 新样式只用 `skin.css` 顶部变量（`--gray-N`、`--accent-11`、`--sp-N`、`--fs-N`/`--lh-N`、`--r-N`、`--font-ui`、`--card`）；不写新散值（width/height/grid 列宽除外）。样式限定在 `[data-skin="bear"]` 下。
- 决策逻辑是纯函数并有测试；文案只在 `core/strings.ts`；`App.tsx` ≤ 450 行。
- 不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint。工作区有前几批未提交改动，不要动无关文件。

## 1. 「要点 · 题目」按钮不再压住正文

`skin.css` 加（放在 `.bear-pin-chipwrap` 规则之后）：
```css
/* When the pin rail folds into the chip, the transcript starts below it. */
[data-skin="bear"] .bear-thread-wrap:has(.bear-pin-chipwrap) .bear-pane {
  padding-top: calc(var(--sp-6) + var(--sp-2));
}
```
`.bear-pin-chip` 的 `padding: 2px var(--sp-3)` 改成 `padding: var(--sp-1) var(--sp-3)`。

## 2. 旧会话提示条：一行浅底提示

`.bear-notice` 规则改成：
```css
[data-skin="bear"] .bear-notice {
  display: flex;
  gap: var(--sp-3);
  align-items: baseline;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-2);
  background: var(--gray-3);
  font-family: var(--font-ui);
  font-size: var(--fs-2);
  line-height: var(--lh-2);
  color: var(--gray-12);
}
```
`.bear-notice .bear-notice-dismiss` 的 `color: var(--soft)` 改成 `color: var(--gray-11)`；`.bear-notice-action` 的 `margin-left: var(--sp-2)` 改成 `margin-left: auto`。`[data-tone="error"]` 规则不动。`.bear-notices .bear-notice { margin: 0.3em 0; }` 改成 `margin: 0 0 var(--sp-2);`。

## 3. 旧版没有动作标记的长指令折成一行（core）

3.1 `core/chat/action-marker.ts` 加纯函数（+ 测试：`/skill:course 新建课程…` → `"旧指令 · course"`；普通文字 → null；`/skill:` 后为空 → `"旧指令"`）：
```ts
/** A pre-marker command the UI sent before action markers existed (`/skill:<name> …`): fold it too. */
export function legacyCommandLabel(body: string): string | null {
  const match = /^\/skill:([a-z0-9-]*)/.exec(body.trimStart());
  if (!match) return null;
  return match[1] ? `${strings.actions.legacy} · ${match[1]}` : strings.actions.legacy;
}
```
`strings.actions` 加 `legacy: "旧指令",`（如果 `actions` 的类型是 `Record<ActionKind, string>`，就把 `legacy` 放到 `strings.chat.legacyCommand` 并相应改函数）。

3.2 `core/chat/message-renderer.tsx` 用户消息分支：
`const label = marked.action ? actionLabel(marked.action, marked.courseTitle) : null;`
改成
`const label = marked.action ? actionLabel(marked.action, marked.courseTitle) : legacyCommandLabel(marked.body);`

## 4. `/` 菜单：不在课程会话里时不显示「上课」组（core）

4.1 `core/commands/commands.ts` 的 `allCommands(agentCommands, disabledSkills = [])` 加第三个参数 `inCourse = true`：为 false 时过滤掉 `group === "上课"` 的条目。测试补：`inCourse` 为 false 时没有 `/总结 /制卡 /收课`。
4.2 `core/commands/use-slash.ts` 的 `useSlash(agentCommands, disabledSkills = [], inCourse = true)`，把 `inCourse` 传给 `allCommands`，并加进 `useMemo` 依赖。
4.3 `App.tsx`：`useSlash(controller.commands, settings.disabledSkills)` 改成 `useSlash(controller.commands, settings.disabledSkills, activeCourse !== null)`（`activeCourse` 在它上面已定义）。

4.4 Bear 菜单样式：
- `.bear-slash` 的 `border: 1px solid var(--rule)` 改成 `var(--gray-6)`，加 `padding: var(--sp-1) 0;` 和 `box-shadow: 0 8px 24px rgb(0 0 0 / 0.08);`。
- `.bear-slash-group` 改成 `padding: var(--sp-3) var(--sp-4) var(--sp-1); font-size: var(--fs-1); line-height: var(--lh-1); color: var(--gray-11);`。
- `.bear-slash-item` 改成 `padding: var(--sp-2) var(--sp-4); gap: var(--sp-3);`，加 `font-weight: 500;`；`.bear-slash-item .bear-slash-desc` 加 `font-weight: 400;` 并把 `color: var(--soft)` 改成 `var(--gray-11)`。
- `.bear-slash-item[data-selected="true"], .bear-slash-item:hover` 的背景 `var(--code-bg)` 改成 `var(--gray-4)`。

## 5. 收课下拉菜单与其他下拉菜单

- `.bear-pop, .bear-menu, .bear-submenu` 那条共用规则：`background: var(--paper)` 改成 `var(--card)`，`border: 1px solid var(--rule)` 改成 `var(--gray-6)`，`border-radius: var(--r-1)` 改成 `var(--r-2)`，加 `box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);`。
- `.bear-menu, .bear-submenu { padding: 0.3em 0; … }` 的 padding 改成 `var(--sp-1) 0`。
- 菜单项那条（`.bear-menu [role="menuitem"]` 等）`padding: 0.35em 1em` 改成 `var(--sp-2) var(--sp-3)`，`gap: 0.6em` 改成 `var(--sp-2)`，`color: var(--ink)` 改成 `var(--gray-12)`。
- `[data-highlighted]` 背景 `var(--code-bg)` 改成 `var(--gray-4)`；`[data-disabled]` 的 `color: var(--soft)` 改成 `var(--gray-8)`。

## 6. 输入框底行

- `.bear-cfoot` 的 `line-height: 1` 改成 `var(--lh-2)`。
- `.bear-clessons` 加 `margin-left: auto;`（三个按钮靠右，风格档位留在左边）、`gap` 改成 `var(--sp-2)`。
- `.bear-clesson` 改成：
```css
[data-skin="bear"] .bear-clesson {
  padding: var(--sp-1) var(--sp-2);
  border: 1px solid var(--gray-7);
  border-radius: var(--r-1);
  font-size: var(--fs-1);
  line-height: var(--lh-1);
  color: var(--gray-12);
  transition: background 120ms ease-out, border-color 120ms ease-out;
}
[data-skin="bear"] .bear-clesson:not(:disabled):hover {
  background: var(--gray-4);
  border-color: var(--gray-8);
}
```
  删掉原来的 `.bear-clesson:hover` 与 `.bear-clesson:last-child` 两条规则；`.bear-clesson:disabled` 保留并加 `border-color: var(--gray-6);`。
- `.bear-clesson-hint`：`padding: 0 2px var(--sp-2)` 改成 `padding: var(--sp-1) 0 0`，加 `text-align: right;`，`color: var(--soft)` 改成 `var(--gray-11)`。
- `.bear-chint` 删掉重复的 `font-size`/`line-height` 两行，`color: var(--soft)` 改成 `var(--gray-11)`。

## 7. 会话列表

- `.bear-sessions-row` 的 `grid-template-columns: 44px 54px 1fr auto` 改成 `44px 88px 1fr auto`；`gap: 0.5em` 改成 `var(--sp-2)`；`padding: 0.3em 0.7em` 改成 `var(--sp-1) var(--sp-2)`。
- `.bear-sessions-row:hover` 背景改成 `var(--gray-4)`。
- `.bear-sessions-row.is-current, .bear-sessions-row.is-current:hover` 背景 `var(--accent-3)` 改成 `var(--gray-5)`；删掉 `.bear-sessions-row.is-current .bear-sessions-name { color: var(--accent-11); }` 规则。
- `.bear-sessions` 的边框 `var(--rule)` 改成 `var(--gray-6)`，加 `box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);`。

## 8. 阅读面板「加入」

`reading-panel.tsx` 里 `bear-read-add` 区块中提交新材料的那个按钮（文字是「加入」的那个，不是来源列表里的按钮）加 `className="bear-btn-primary"`。`skin.css` 加：
```css
/* The one solid button in a panel. Text uses --card so it flips to dark on the dark theme's light blue. */
[data-skin="bear"] .bear-btn-primary {
  padding: var(--sp-1) var(--sp-3);
  border-radius: var(--r-1);
  background: var(--accent-11);
  color: var(--card);
  font-weight: 500;
}
[data-skin="bear"] .bear-btn-primary:not(:disabled):hover {
  background: var(--gray-12);
  color: var(--card);
}
```

## 9. 升版本号

Bear 0.5 → 0.6（`skins/registry.ts`）。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen/apps/desktop && wc -l src/renderer/App.tsx
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：全部通过；`App.tsx` ≤ 450；`git status` 只多本批文件。

## 结束报告（中文）

改了哪些文件、每一步是否照做、偏离之处及原因、未完成项，附验收输出。
