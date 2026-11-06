# 批次 BE-9d：Bear 正文加宽到约 40 字、隐藏滚动条

> 给 Devin（SWE-2）的**逐步执行清单**。按步骤原样做，不要自行设计。

## 本批硬约束

1. 只改两个文件：`apps/desktop/src/renderer/skins/bear/skin.css`、`docs/desktop/skins/bear.md`。其他文件一律不动。
2. 不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 `git commit` / `git push`。

## 背景

用户反馈（2026-11-05）：默认 24px 字号下正文一栏太窄（约 34 字），1920 宽的窗口两边空得多；正文右侧的滚动条不想要。决定：正文最大宽度改为约 40 字；Bear 里的滚动条全部隐藏，滚轮和触控板照常滚动。

## 步骤

### 第 1 步：`skin.css` 正文宽度

1. 把注释
   ```css
   /* The column: 34em of body text, centred; notices sit on top of the thread. */
   ```
   改为
   ```css
   /* The column: about 40 characters of body text (42em minus padding), centred; notices sit on top of the thread. */
   ```
2. 在 `[data-skin="bear"] .bear-column { … }` 里，把注释 `/* The 34em measure is in body ems, not the 13px chrome size. */` 改为 `/* The 42em measure is in body ems, not the 13px chrome size. */`，把 `max-width: 34em;` 改为 `max-width: 42em;`。其余属性不动。

### 第 2 步：`skin.css` 隐藏滚动条

把从注释 `/* Scrollbars: invisible until the pointer is over the scrolling area, then a` 开始、到 `[data-skin="bear"] ::-webkit-scrollbar-thumb:hover { … }` 这一条结束的整段（共 5 条规则加注释），替换为：

```css
/* Scrollbars: hidden everywhere in Bear (user, 2026-11-05). The wheel and the
   trackpad still scroll; the page stays a sheet of paper. */
[data-skin="bear"] ::-webkit-scrollbar {
  display: none;
}
[data-skin="bear"] * {
  scrollbar-width: none;
}
```

### 第 3 步：`docs/desktop/skins/bear.md`

1. `- 行高 1.75；段间距 0.7em；正文行宽 \`max-width: 34em\`（约 34 个汉字），居中。` 改为 `- 行高 1.75；段间距 0.7em；正文行宽 \`max-width: 42em\`（扣掉两侧内边距约 40 个汉字），居中。滚动条全部隐藏，滚轮与触控板照常滚动。`
2. 示意图里的 `正文（34em，居中）……` 改为 `正文（42em，居中）……`（保持该行其余字符与对齐不变，必要时补或删空格让右侧 `│` 对齐）。
3. 槽位表里 `Thread` 那一行开头的 `34em 居中一栏` 改为 `42em 居中一栏`。

## 完成标准

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && grep -n "34em" apps/desktop/src/renderer/skins/bear/skin.css docs/desktop/skins/bear.md
cd /Users/gjy/pi-learning/xuegen && grep -n "scrollbar" apps/desktop/src/renderer/skins/bear/skin.css
```

- 前一条全部通过；第二条没有输出；第三条只出现第 2 步新写的那几行。贴出每条输出的最后 15 行。

## 结束报告

列出改了哪些文件、每一步是否照做、偏离之处（没有就写「无」）。
