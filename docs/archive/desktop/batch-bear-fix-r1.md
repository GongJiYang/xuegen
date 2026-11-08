# batch-bear-fix-r1（DeepSeek 返修）：「回到最新」状态不刷新 + 总控当天空白提示

来源：`docs/desktop/BEAR-AUDIT-1108.md` 复核表里的两条 ✗（R1、R2）。只动列出的文件。

## 硬约束

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`。
- hook 的 effect 里不同步 setState（观察器、事件回调里可以）；文案只在 `core/strings.ts`；新样式只用 `skins/bear/skin.css` 顶部变量。
- 不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`。

## R1 「回到最新」：内容变化后重新判断是否在底部

现象：在一个往上滚过的长会话里（按钮出现），切到一个一屏放得下的短会话，按钮仍然显示——因为 `atBottom` 只在 `scroll` 事件里重算，换会话后没有滚动事件。

改 `src/renderer/core/chat/use-follow-bottom.ts` 的 `useFollowGrowth`：把 `follow` 改成
```ts
    const follow = (): void => {
      // Content changed (a new session, a folded block, a shorter transcript):
      // if the bottom is now in view, say so — no scroll event will.
      if (distanceFromBottom(element) <= NEAR_BOTTOM_PX) {
        if (!atBottomRef.current) setFollowing(true);
        return;
      }
      if (pinnedRef.current || !atBottomRef.current) return;
      element.scrollTop = element.scrollHeight;
    };
```
并补测试（`use-follow-bottom` 已有测试文件就加在里面，没有就新建 `use-follow-bottom.test.tsx`）：模拟 pane 先「不在底部」（`atBottom` 为 false），再把内容换成高度不超过可视高度的内容并触发 MutationObserver / ResizeObserver 回调，断言 `atBottom` 变回 true。jsdom 里 `scrollHeight`/`clientHeight` 用 `Object.defineProperty` 设定。

## R2 总控当天还没有对话时的提示

现象：总控会话里，今天的对话被折叠后为空，今日卡下面显示通用的「开始学习：描述你想理解的主题，或继续最近一次会话。」，和总控不搭。

1. `core/strings.ts` 的 `control` 加 `emptyToday: "今天还没跟总控说话。点「让总控说说」看今日简报，或直接问怎么安排。",`。
2. `skins/bear/slots.tsx` 第 144 行附近：空列表时，若 `header` 不为 null（总控今日卡在），显示 `strings.control.emptyToday`；否则保持原样（`noModels && modelsReason ? loginHint : empty`）。
3. 对应的 Bear Thread 测试（若有渲染空列表的用例）补一条：有 header 且无消息时显示 `strings.control.emptyToday`。

## 升版本号

Bear 当前版本 + 0.1（`skins/registry.ts`）。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen && git status --short
```

## 结束报告（中文）

R1、R2 各自：改了什么、测试怎么写的、偏离之处；验收输出；未完成项。
