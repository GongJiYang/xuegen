# batch-bear-v1：Bear 统一尺度与配色变量

方案：`docs/desktop/BEAR-VISUAL-PLAN.md`（第二节尺度、设计稿自查）。设计稿 `design/animate/?d=bearv`（用户 2026-11-08 批准）。**只改 Bear**：只动 `src/renderer/skins/bear/skin.css`（必要时 `skins/bear/*.tsx` 里写死的样式），不碰 Chicago、bare、core、App。

## 硬约束（先读，压缩后也照做）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/desktop/BEAR-VISUAL-PLAN.md`。
- 这一批是**机械替换**：按下面的对照表把散值换成变量，不重新设计布局、不改结构、不改任何 `.tsx` 的逻辑。对照表没写到的值保持原样，并在报告里列出来。
- 样式全部限定在 `[data-skin="bear"]` 下。
- 不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint。工作区里已有前几批未提交的改动，不要动与本批无关的文件。

## 1. 在 `skin.css` 的 `[data-skin="bear"] { … }` 变量块里加入（放在现有变量之前）

```css
  /* 灰阶（BEAR-VISUAL-PLAN 二） */
  --gray-1: #fbfbfa; --gray-2: #f5f5f4; --gray-3: #efefee; --gray-4: #e8e8e7; --gray-5: #e1e1e0;
  --gray-6: #e6e6e4; --gray-7: #d9d9d6; --gray-8: #bcbcb8; --gray-11: #63635f; --gray-12: #1f2124;
  --card: #ffffff;
  --accent-3: #e9f4fe; --accent-4: #d6ecfb; --accent-9: #1aa3ff; --accent-11: #0a65a0;
  --warn-9: #c98a12; --warn-11: #8a5a00; --done-11: #2f7a50;
  /* 字号与行高成对 */
  --fs-1: 12px; --lh-1: 16px; --fs-2: 14px; --lh-2: 20px; --fs-3: 16px; --lh-3: 24px;
  --fs-4: 18px; --lh-4: 26px; --fs-6: 24px; --lh-6: 30px;
  /* 间距、圆角 */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 24px; --sp-6: 32px; --sp-7: 48px;
  --r-1: 4px; --r-2: 8px;
```

再把**现有**变量改成指向新变量（名字保留，免得漏改）：

```css
  --paper: var(--gray-1);
  --ink: var(--gray-12);
  --soft: var(--gray-11);
  --rule: var(--gray-7);
  --hairline: var(--gray-6);
  --code-bg: var(--gray-3);
  --accent: var(--accent-9);
  --warn: var(--warn-9);
  --warn-text: var(--warn-11);
  --faint: var(--gray-8);
  --done: var(--done-11);
```
`--danger`、字体变量不变。

## 2. 字号（只换 `px` 值；`em`、`inherit`、`var(--bear-body-size)` 与它的 `calc` 不动——那些跟正文缩放走）

| 现在 | 换成 |
|---|---|
| 9px、10px、10.5px、11px、11.5px、12px、12.5px | `var(--fs-1)` |
| 13px、14px | `var(--fs-2)` |
| 15px、16px | `var(--fs-3)` |
| 22px、24px | `var(--fs-6)` |

同一条规则里：没有 `line-height` 的，补上对应的 `line-height: var(--lh-N)`；已有 `line-height` 且是 px 值的，换成对应的 `var(--lh-N)`；已有的是无单位倍数（如 `1.6`）的，**不动**。

## 3. 字重

`650`、`700`、`bold` → `600`；`normal` → `400`。500、600、400 不动。

## 4. 间距（`padding*`、`margin*`、`gap`、`row-gap`、`column-gap`、`inset`、`top/right/bottom/left` 里的 px 值）

| 现在 | 换成 |
|---|---|
| 3px、5px | `var(--sp-1)` |
| 6px、7px | `var(--sp-2)` |
| 10px | `var(--sp-3)` |
| 14px、15px、18px | `var(--sp-4)` |
| 20px | `var(--sp-5)` |
| 28px | `var(--sp-6)` |
| 4px、8px、12px、16px、24px、32px、48px | 对应的 `var(--sp-N)` |

**例外，保持原样**：`0`、`1px`、`2px`（细微对齐）；负值（把对应变量包进 `calc(-1 * …)`）；百分比、`em`、`vh/vw`；`width/height/min-*/max-*`（尺寸不是间距，不改）。

## 5. 圆角

| 现在 | 换成 |
|---|---|
| 2px、3px、4px | `var(--r-1)` |
| 6px、7px、8px、10px | `var(--r-2)` |
| `2px 0 0 2px` | `var(--r-1) 0 0 var(--r-1)` |

`50%`、`999px` 不动。

## 6. 写死的颜色

| 现在 | 换成 |
|---|---|
| `#fff`、`#ffffff`（作背景时） | `var(--card)`；作文字色（在实底色按钮上）时保留 `#fff` |
| `#fbfbfa` | `var(--gray-1)` |
| `#f4f5f6` | `var(--gray-2)` |
| `#f1f2f3` | `var(--gray-3)` |
| `#e3e5e8` | `var(--gray-7)` |
| `#eceef0` | `var(--gray-6)` |
| `#c4c8cc`、`#b3b8be`、`#b8bcc2` | `var(--gray-8)` |
| `#8b9096` | `var(--gray-11)` |
| `#4a4f55`、`#1f2124` | `var(--gray-12)` |
| `#e9f4fe` | `var(--accent-3)` |
| `#d6ecfb` | `var(--accent-4)` |
| `#1aa3ff` | `var(--accent-9)` |
| `#c98a12` | `var(--warn-9)` |
| `#a86b00` | `var(--warn-11)` |
| `#3a8a5c` | `var(--done-11)` |

`rgb(… / 0.x)` 阴影与遮罩、`#b3261e`（danger）不动。

## 7. 文字色的三条规则（对比度）

1. `color: var(--faint)` **作文字色**的 14 处，全部改成 `color: var(--gray-11)`（faint 只留给背景、边框和装饰记号）。用 `grep -n "color: var(--faint)" skin.css` 找；`background`/`border` 里的 faint 不动。
2. `color: var(--accent)` 与 `caret-color: var(--accent)` 改成 `var(--accent-11)`——**除了**选择器以 `-mark` 结尾的三处（`.bear-cy-mark`、`.bear-pg-mark`、`.bear-cc-mark`），它们是圆点记号，保持 `var(--accent-9)`。
3. 背景是 `var(--accent)` 且文字是 `#fff` 的按钮（如 `.bear-btn-accent`），背景改成 `var(--accent-11)`（白字在 accent-9 上只有 2.6:1）；它的 `:hover` 背景用 `var(--gray-12)`。

## 8. 升版本号

Bear 皮肤的版本号（上一批升到 0.2 的那处）升到 0.3。

## 9. 自查（报告里贴结果）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop/src/renderer/skins/bear
grep -oE "font-size:\s*[0-9.]+px" skin.css | sort | uniq -c      # 应为空
grep -oE "font-weight:\s*(650|700|bold)" skin.css | wc -l         # 应为 0
grep -oE "#[0-9a-fA-F]{3,8}\b" skin.css | sort | uniq -c          # 只剩变量定义块里的值和按钮白字 #fff
grep -oE "border-radius:\s*[0-9]+px" skin.css | sort | uniq -c    # 只剩 999px
grep -n "color: var(--faint)" skin.css                             # 应为空
```

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：全部通过（若有快照或样式断言测试因数值变化失败，按新值更新测试并在报告里列出）；第 9 步自查符合预期；`git status` 只多 Bear 的文件。

## 结束报告（中文）

改了哪些文件、每张对照表是否照做、对照表外保留原样的值（逐条列出位置）、未完成项，附验收输出与自查输出。
