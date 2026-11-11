# batch-full-b6-anki（DeepSeek，约 15 分钟）：anki-sync.mjs + flashcards.mjs 端到端——只写测试、报告失败

全量测试 B6。只新建 `skills/wiki-save/anki.full.test.mjs`。**绝不连真实 Anki**：AnkiConnect 一律用测试里起的假 HTTP 服务（照 `skills/wiki-save/anki-sync.test.mjs` 的写法），`--url` 指向它；**绝不打开任何 collection.anki2**。

## 硬约束
- **只写测试，不改产品代码**、`SKILL.md`、`apps/**`、已有测试。不 commit/push、不加依赖。
- 全部在 `mkdtemp` 临时目录。要用库副本 `/tmp/xg-e2e/vault/GJY` 就先 `cp -R` 到临时目录再跑（复制后 `chmod -R u+w`）；**绝不写 `/tmp/xg-e2e/vault/GJY` 本身**。用到库副本的用例加 `{ skip: existsSync(<路径>) ? false : "<路径> 不存在（需要有库副本的机器）" }`，并且**不要断言库副本里会变的具体日期/数量**（只断言不变量）。
- 失败且你认为是产品 bug：改成 `test("…", { todo: "疑似 bug：<一句话>" }, …)`，保留断言，报告列出复现命令与实际/期望。
- 写法参考同目录已有的 `*.test.mjs`。**自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**

## 要测的情况
1. push 新增：两块新卡（无 ID）→ 假服务收到 addNotes，ID 回填进 Markdown，再 push 一次不再新增（幂等）。
2. 重复：假服务对 addNote 回「cannot create note because it is a duplicate」→ 按现有逻辑查到已有 note 并回填 ID（照 anki-sync 里「重复卡回填 ID」的实现断言）。
3. 多块同正面（同一文件或不同文件）→ 行为按实际断言并写进报告；若两块被合成一张或互相覆盖 ID，标 todo。
4. 缺 END 的块、ID 错位（ID 行在 END 之后）→ 报出问题、不发请求、文件不变。
5. `--dry-run --json`：不发写请求（假服务只收到只读请求或什么都没收到）、文件字节不变，输出里有将要新增的数量。
6. 假服务不可达（端口没开）→ 中文报错、非 0 退出、文件不变。
7. flashcards `stats`、`add`（deck 不存在的目录、正面重复）；库副本冒烟：副本复制后 `stats --json` 与 `push --dry-run --json`（假服务）不崩，结果写进报告。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/wiki-save/anki.full.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|todo)' && npm test 2>&1 | grep -E '^# (pass|fail|todo)' && npm run lint:skills 2>&1 | tail -1
```
## 结束报告（中文，必须输出）
新增测试数；每条实际行为一句话；所有 todo 的复现与实际/期望；验收输出。
