# batch-fix-composer-keys（DeepSeek 返修）：输入框的回车与 Esc

用户 11-09 报三件事：
1. 用中文输入法时，选字按回车会**直接发送**，只好频繁切换输入法。
2. 学根回答中，输入框里有字时按 **Esc 停不下来**。
3. 希望按 Esc 停止后，**刚发出的那条消息回到输入框**（可能是误触发送）。

## 原因（Claude 已查明）

- `skins/bear/composer.tsx` 的 `onKeyDown`（chicago、bare 同理）判断 `event.key === "Enter" && !event.shiftKey` 就发送，没排除输入法组字中的回车（组字时 `event.nativeEvent.isComposing === true`，Safari/Chromium 上 `keyCode === 229`）。
- 同一函数里 Esc 停止的条件是 `streaming && !hasText`（文件注释写明「只在输入框空时停止」），框里有字就不停。
- `core/chat/useChat.ts` 的 `stop` 只发 `{ type: "abort" }`，不知道刚发的是什么。

## 改法

1. **组字中的回车不算数**（三个皮肤的 composer，以及 `/` 菜单里的 Enter 分支）：`onKeyDown` 开头加
   ```ts
   if (event.nativeEvent.isComposing || event.keyCode === 229) return;
   ```
   （放在所有按键判断之前；Esc 在组字时由输入法自己处理，同样直接 return。）
2. **回答中按 Esc 一律停止**（`/` 菜单打开时 Esc 仍先关菜单，这条不变）：条件改为 `event.key === "Escape" && streaming`，去掉 `!hasText`。同步改文件头注释与那两行注释。停止按钮的显示规则（有字显示发送、无字显示 ■）**不变**。
3. **停止后把刚发的消息放回输入框**：
   - `core/chat/useChat.ts`：加 `const lastSentRef = useRef<string | null>(null)`；`send(text)` 里在发出前记 `lastSentRef.current = trimmed`（**用户原文**，不带风格前缀与 refresh note）；`sendCommand` 不记（命令不放回）。`stop` 改成：发 abort，取出 `lastSentRef.current`，置 null，返回它。返回类型 `string | null`，更新 `ChatController`（或该 hook 返回值的接口）里 `stop` 的类型与 JSDoc。
   - 每轮回答正常结束（`streaming` 从 true 变 false 且不是 abort）时把 `lastSentRef.current` 置 null，避免停下一轮时放回更早的消息——在现有处理 agent 结束事件的地方加一行即可。
   - `skins/contract.ts` 的 `ComposerProps.onStop` 改为 `onStop(): string | null;`，JSDoc：返回刚发出的消息原文，皮肤在输入框为空时把它放回。
   - 三个皮肤：Esc 停止与 ■ 按钮都调用 `const back = onStop();`，`if (back && !hasText) { setValue(back); onInput(back); }`，并把光标放到文末（Bear 用现有的 textarea ref）。输入框已经有字时不覆盖。
   - `App.tsx` 那行 `onStop={controller.stop}` 不用改（签名兼容）。若其它地方调用 `controller.stop()` 忽略返回值，不用改。
4. 测试：
   - 三个皮肤的 composer 测试：组字中回车不发送（`fireEvent.keyDown(field, { key: "Enter", isComposing: true })` 和 `keyCode: 229` 两种）；回答中有字按 Esc 调 `onStop`；`onStop` 返回 "hello" 且框空时框里变成 "hello"；框里有字时不覆盖；`/` 菜单开着时 Esc 只关菜单（已有测试保持通过，chicago 那条「only when the field is empty」按新行为改名改断言）。
   - `useChat` 的测试（没有就照 `core/chat` 现有 hook 测试写法新建）：`send("你好")` 后 `stop()` 返回 "你好"；再 `stop()` 返回 null；`sendCommand` 后 `stop()` 返回 null。

## 硬约束

不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`/`@ts-ignore`。只改：三个皮肤的 `composer.tsx` 及其测试、`core/chat/useChat.ts` 及其测试、`skins/contract.ts`（只改 `ComposerProps.onStop`）、需要时 `gallery/*` 里 `onStop` 的样例。`App.tsx` 不加行。工作区其它未提交改动不是你的，别动；Devin 正在改阅读面板相关文件（`reading-panel.tsx`、`shell-panels.ts`、`shelf-view.ts`、`skin.css` 的 `.bear-shelf-*`），**不要碰这些文件**。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6
cd /Users/gjy/pi-learning/xuegen && git status --short
```

## 结束报告（中文）

改了什么（逐条对应上面 1–4）、测试清单、验收输出、未完成项。
