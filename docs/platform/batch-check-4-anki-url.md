# batch-check-4-anki-url（Devin，约 20 分钟）：测试窗口可改连假 AnkiConnect

背景：`docs/platform/SCENARIOS.md` 的 S7 / S8 要在测试窗口里模拟「Anki 开着（今日 42 张）」和「Anki 没开」。现在 `apps/desktop/src/main/data/anki.ts:14` 把地址写死成 `http://127.0.0.1:8765`，测试窗口会直接读用户真实的 Anki。加一个环境变量，**不设时行为完全不变**。

约束：只改下面列的文件和测试；不加依赖；不 commit / push；**自己做完，不要调用别的 agent**。别的 agent 可能在改 `scripts/`、`apps/desktop/src/renderer/skins/bear/progress-panel.tsx`、`apps/desktop/src/renderer/core/today.guard.test.ts`，不要碰。

1. `apps/desktop/src/main/data/anki.ts`：`ANKI_ENDPOINT` 改为函数 `ankiEndpoint(env = process.env)`：`XUEGEN_ANKI_URL` 是 `http://127.0.0.1:<端口>` 或 `http://localhost:<端口>` 形式时用它，否则（含不设、乱写、非本机地址）用 `http://127.0.0.1:8765`；乱写时 `console.warn` 一行。原来用 `ANKI_ENDPOINT` 的地方改调这个函数。保留 `ANKI_ENDPOINT` 常量导出（值不变）以免别处引用断掉，或全部改掉——二选一，报告里说。
2. 主进程起的脚本（`main/data/handler.ts` 里 `cards.sync` 调 `anki-sync.mjs push`）：设了 `XUEGEN_ANKI_URL` 且合法时，参数补 `--url <它>`（`anki-sync.mjs` 已支持 `--url`）。不设时参数不变。
3. 测试：`anki.test.ts` 加 合法 / 不设 / 乱写 / 非本机（`http://example.com:8765` → 回落默认）四条；`handler` 测试加一条 `cards.sync` 带 `--url`。
4. 沙盒：`agent/sandbox/config.ts` 的 `allowedDomains: ["127.0.0.1:8765"]` **不改**（模型在测试窗口里跑 anki-sync 不在本次范围；在报告里说明这一点）。
5. `apps/desktop/AGENTS.md` §12 那条「测试窗口可设 XUEGEN_TODAY」后面补「、XUEGEN_ANKI_URL（假 AnkiConnect）」。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests |Test Files"
```

## 结束报告（中文）
改了哪些行；第 1 步二选一的选择；验收输出。
