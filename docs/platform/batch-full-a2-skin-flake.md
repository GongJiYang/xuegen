# batch-full-a2-skin-flake（DeepSeek，约 5 分钟）：use-skin 测试负载下超时

全量测试 A2。根因已查清（Claude，systematic-debugging）：

- 现象：`apps/desktop/src/renderer/skins/use-skin.test.ts`「loads a registered skin」偶发失败，`expected null not to be null`（第 17 行 `waitFor`）。
- 复现：CPU 跑满（每核一个 `yes > /dev/null`）时单跑这个文件 6 次失败 2 次。
- 根因：这是文件里第一个动态 import `bare` 皮肤模块 + 样式表的测试，冷加载约 1.0–1.13 秒；`waitFor` 默认超时 1000ms。不跑满时也要约 985ms，刚好贴着线。第二个测试因模块已缓存所以不失败。产品无此超时，不是产品 bug。

## 改法（只改测试）
- 只改 `apps/desktop/src/renderer/skins/use-skin.test.ts`：两个 `waitFor(...)` 都加 `{ timeout: 5000 }`。不改别的文件，不 commit。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**

## 验收命令（必须在负载下跑）
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && N=$(sysctl -n hw.ncpu); for i in $(seq $N); do (yes > /dev/null &); done; f=0; for i in 1 2 3 4 5 6 7 8; do npx vitest run src/renderer/skins/use-skin.test.ts >/dev/null 2>&1 || f=$((f+1)); done; pkill yes; echo "fails=$f"
```
期望 `fails=0`。最后跑一次 `npx vitest run src/renderer/skins` 贴结果。

## 结束报告（中文）
改了哪几行、负载验收的 fails 数。
