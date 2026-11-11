# batch-full-fix15-path（DeepSeek 返修，约 15 分钟，TDD）：装好的学根找不到 jj——收课/计划/顺延从没进过 jj

## 现象与根因（Claude 已查清，读真实会话文件只读）
- 真实库 `~/xuegen-data/vault` 的 jj 操作记录停在 11-10 20:10；之后真实学根（v0.10.0）里总控 23:49–23:55 做了 5 次 course_plan 提交（顺延 + 改计划），文件都写了，但会话文件里 5 次结果全是 `"jj": "failed: Error: spawnSync jj ENOENT"`。旧会话里还有 `node: command not found`、`pdftotext: command not found`。
- 根因：从访达 / 程序坞打开的 macOS 应用拿不到 shell 的 PATH（只有 `/usr/bin:/bin:/usr/sbin:/sbin`），`jj`、`pdftotext`、`node` 在 `/opt/homebrew/bin`。`skills/course/close/jj.mjs` 第 16 行 `execFileSync("jj", …)` 依赖 PATH；`jjCommit` 把失败吞成 `failed: …` 字符串，提交照样算成功。测试窗口从终端启动，PATH 完整，所以以前的验收都没发现。
- 后果：装好的学根里「撤销这次收课」不可能成功（undo 要 jj），收课历史没有记录。

## 改法（先写失败测试，再改）
只改 `apps/desktop/src/agent/environment.ts` 与 `apps/desktop/src/agent/environment.test.ts`。不 commit/push、不加依赖。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**
1. 先写测试，确认失败：导出一个纯函数 `withToolPath(path: string | undefined, exists: (dir: string) => boolean, platform: string): string`：
   - darwin、PATH=`/usr/bin:/bin:/usr/sbin:/sbin`、`/opt/homebrew/bin` 与 `/usr/local/bin` 都存在 → 结果以 `/opt/homebrew/bin:/usr/local/bin:` 开头，后面原样保留原 PATH。
   - 已含 `/opt/homebrew/bin` → 不重复加、顺序不变。
   - 目录不存在的不加；PATH 为 undefined 时只给存在的那几个加 `/usr/bin:/bin:/usr/sbin:/sbin`。
   - 非 darwin → 原样返回。
2. `applyXuegenEnvironment` 里（在设置其它 env 的地方）调用：`process.env.PATH = withToolPath(process.env.PATH, existsSync, process.platform)`，注释写清原因（访达启动的应用没有 shell PATH，jj/pdftotext/node 在 Homebrew 目录；11-11 全量测试在真实会话里看到 `spawnSync jj ENOENT`）。
3. 现有测试全部照旧通过。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npx vitest run src/agent/environment.test.ts 2>&1 | tail -3 && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests|Test Files"
```
## 结束报告（中文）：第 1 步失败输出、改动、验收输出。
