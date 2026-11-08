# batch-bear-v3c：Bear 补齐 V3 漏掉的面板（技能、卡片）+ 禁用实底按钮

设计稿 `design/animate/?d=bearv3` 的「卡片」「技能」两屏（用户已批准，V3b 漏做）。**只改 Bear**：`skins/bear/skin.css`、`skins/bear/skills-panel.tsx`、`skins/bear/cards-panel.tsx`、`core/strings.ts`（加一条文案）、Bear 版本号。

## 硬约束（先读，压缩后也照做）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/BEAR-VISUAL-PLAN.md`。
- 新样式只用 `skin.css` 顶部变量；样式限定在 `[data-skin="bear"]` 下；文案只在 `core/strings.ts`。
- 不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint。工作区干净（上一版已提交），只动本批文件。

## 1. 禁用的实底按钮（bug：阅读面板「加入」在输入框为空时是蓝底灰字，几乎看不见）

在 `.bear-btn-primary:not(:disabled):hover { … }` 规则之后加：
```css
[data-skin="bear"] .bear-btn-primary:disabled {
  background: var(--gray-4);
  color: var(--gray-8);
}
```

## 2. 技能面板（照设计稿：标题 / 一句话 / 展开说明三层，项之间用空白分组）

2.1 `core/strings.ts` 的 `skills` 加 `installed: (count: number): string => \`已安装 · ${count}\`,`。

2.2 `skills-panel.tsx`：
- 安装区的 `<button …>{strings.skills.fetch}</button>` 加 `className="bear-btn-secondary"`。
- 在 `skills.status === "ready" && (…)` 分支里、`<ul>` 之前加 `<h3>{strings.skills.installed(skills.value.length)}</h3>`（列表为空时不加）。用 Fragment 包住 `h3` 与 `ul`。
- `<ul>` 加 `className="bear-skill-list"`。

2.3 `skin.css` 加：
```css
/* Skills panel (design ?d=bearv3): install row, then 「已安装 · N」, each skill in three layers. */
[data-skin="bear"] [data-slot="skills"] h3 {
  margin: var(--sp-5) 0 var(--sp-2);
  font-size: var(--fs-1);
  line-height: var(--lh-1);
  font-weight: 400;
  color: var(--gray-11);
}
[data-skin="bear"] [data-slot="skills-install"] h3 {
  margin-top: 0;
}
[data-skin="bear"] [data-slot="skills-install"] p {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  margin: 0;
}
[data-skin="bear"] [data-slot="skills-install"] input {
  flex: 1 1 auto;
  min-width: 0;
}
[data-skin="bear"] .bear-btn-secondary {
  flex: none;
  padding: var(--sp-1) var(--sp-3);
  border: 1px solid var(--gray-7);
  border-radius: var(--r-1);
  color: var(--gray-12);
}
[data-skin="bear"] .bear-btn-secondary:not(:disabled):hover {
  background: var(--gray-4);
  border-color: var(--gray-8);
  color: var(--gray-12);
}
[data-skin="bear"] .bear-tabpanels .bear-skill-list li {
  padding: 0;
  margin-bottom: var(--sp-4);
}
[data-skin="bear"] .bear-skill-list label {
  gap: var(--sp-2);
  margin-right: 0;
}
[data-skin="bear"] .bear-skill-list label b {
  font-weight: 500;
}
/* Line and disclosure sit under the title, past the checkbox. */
[data-skin="bear"] .bear-skill-list li > p,
[data-skin="bear"] .bear-skill-list li > details {
  margin: var(--sp-1) 0 0 calc(13px + var(--sp-2));
  color: var(--gray-11);
}
```
（`13px` 是勾选框宽度，属于尺寸，允许。）`[data-slot="skills"] details { … }` 原规则保留。

## 3. 卡片面板：去掉每个牌组下的进度条

设计稿：牌组之间只用空白，不画线、不画进度条（同步情况已在下面一行文字里）。`cards-panel.tsx` 删掉牌组里的
```tsx
<div className="bear-meter" aria-hidden="true">
  <div className="bear-meter-fill" style={{ width: `${synced}%` }} />
</div>
```
若 `synced` 因此不再被使用，一并删掉它的计算。`.bear-meter` 的 CSS 若别处还用就保留，否则删除。

## 4. 升版本号

Bear 0.7 → 0.8（`skins/registry.ts`）。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：全部通过（若卡片面板测试断言了进度条，按新结构更新并在报告里列出）；`git status` 只有本批文件。

## 结束报告（中文）

改了哪些文件、每一步是否照做、偏离之处及原因、未完成项，附验收输出。
