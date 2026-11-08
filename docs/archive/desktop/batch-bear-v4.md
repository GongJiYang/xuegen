# batch-bear-v4：Bear 深色（跟随系统外观）

方案：`docs/desktop/BEAR-VISUAL-PLAN.md`（V4）；设计稿 `design/animate/?d=bearv` 与 `?d=bearv3` 的「深色」开关（用户已批准）。**只改 Bear**：`skins/bear/skin.css`、`skins/bear/control-bot.tsx`、`skins/bear/shell.tsx`、新 hook 文件与测试、Bear 版本号。不碰 Chicago、bare、App、main。

深色**跟随 macOS 系统外观**（Electron 渲染进程的 `prefers-color-scheme` 默认跟随系统），不加设置项。

## 硬约束（先读，压缩后也照做）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/desktop/BEAR-VISUAL-PLAN.md`。
- 深色只靠重定义变量实现，不为单个组件写深色专用规则（第 3 节列出的除外）。
- hook 的 effect 里不同步 setState；新 hook 有测试。
- 不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint。工作区有前几批未提交改动，不要动无关文件。

## 1. 深色变量

在 `skin.css` 的 `[data-skin="bear"] { … }` 变量块**之后**加：

```css
/* Dark (follows the system appearance). Text steps stay ≥ 4.5:1 on gray-1…gray-5. */
@media (prefers-color-scheme: dark) {
  [data-skin="bear"] {
    --gray-1: #161615; --gray-2: #1c1c1b; --gray-3: #232322; --gray-4: #2a2a29; --gray-5: #313130;
    --gray-6: #2e2e2c; --gray-7: #3e3e3b; --gray-8: #62625f; --gray-11: #a9a9a3; --gray-12: #ededeb;
    --card: #1c1c1b;
    --accent-3: #0f2a3d; --accent-4: #133a55; --accent-9: #1aa3ff; --accent-11: #6cc3ff;
    --warn-9: #d99a2b; --warn-11: #e8b45a; --done-11: #6cc092;
    --danger: #f2766b;
    color-scheme: dark;
  }
}
```

## 2. 写死的白色与遮罩

- `skin.css` 里 `color: #fff;` 的 4 处（实底色按钮上的白字、今日日期数字）全部改成 `color: var(--card);`（浅色下 `--card` 是白，深色下是深色，与浅蓝底对比 8.8:1）。
- `.bear-daydlg-scrim` 的 `background: rgb(250 250 249 / 0.6);` 改成 `background: color-mix(in srgb, var(--gray-1) 60%, transparent);`。
- 阴影 `rgb(0 0 0 / …)` 不动。

## 3. 用 JS 画的颜色：跟随外观

3.1 新文件 `skins/bear/use-dark.ts`：
```ts
/**
 * Whether the system appearance is dark, live (follows the macOS setting).
 * Bear's CSS switches by itself through `prefers-color-scheme`; this hook is for
 * the few colours drawn from JS (the canvas avatar, the window background).
 */
import { useSyncExternalStore } from "react";

const QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function snapshot(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(QUERY).matches;
}

export function useDark(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
```
测试 `use-dark.test.ts`：mock `window.matchMedia` 返回 matches true/false；触发 change 后值更新。

3.2 `control-bot.tsx`：在 `INK` 旁加
```ts
const INK_DARK = { bodyColor: "#ededeb", eyeColor: "#161615", badgeColor: "#ededeb", particleColor: "#1aa3ff" };
```
`MiniBot` 里 `const dark = useDark();`，`theme={dark ? INK_DARK : INK}`。

3.3 `shell.tsx`：`const BEAR_PAPER = "#fbfbfa";` 旁加 `const BEAR_PAPER_DARK = "#161615";`；组件里 `const dark = useDark();`，把
```ts
  useEffect(() => {
    onWindowBackground(BEAR_PAPER);
  }, [onWindowBackground]);
```
改成
```ts
  useEffect(() => {
    onWindowBackground(dark ? BEAR_PAPER_DARK : BEAR_PAPER);
  }, [onWindowBackground, dark]);
```
（只是把值传给已有回调，不是同步 setState。若 lint 报 effect 内 setState，改为在 `useDark` 变化时由事件回调调用——在报告里说明。）

## 4. 自查

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop/src/renderer/skins/bear
grep -n "#fff\b" skin.css                       # 应为空
grep -n "rgb(250" skin.css                      # 应为空
grep -oE "#[0-9a-fA-F]{6}" skin.css | sort -u | wc -l   # 只剩浅色、深色两组变量定义里的值与 danger
```

## 5. 升版本号

Bear 0.6 → 0.7（`skins/registry.ts`）。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：全部通过；第 4 节自查符合；`git status` 只多本批文件。

## 结束报告（中文）

改了哪些文件、每一步是否照做、偏离之处及原因、未完成项，附验收与自查输出。
