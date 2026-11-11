# batch-full-b7-misc（DeepSeek，约 15 分钟）：vault-lint / calendar / xuegen-data-root 端到端——只写测试、报告失败

全量测试 B7。只新建 `skills/wiki-save/vault-lint.full.test.mjs`、`skills/calendar/calendar.full.test.mjs`、`bin/xuegen-data-root.full.test.mjs`（若根 `package.json` 的 test glob 不包含 `bin/`，就把第三个放进 `scripts/` 并在报告里说明）。

## 硬约束
- **只写测试，不改产品代码**、`SKILL.md`、`apps/**`、已有测试。不 commit/push、不加依赖。
- 全部在 `mkdtemp` 临时目录。要用库副本 `/tmp/xg-e2e/vault/GJY` 就先 `cp -R` 到临时目录再跑（复制后 `chmod -R u+w`）；**绝不写 `/tmp/xg-e2e/vault/GJY` 本身**。用到库副本的用例加 `{ skip: existsSync(<路径>) ? false : "<路径> 不存在（需要有库副本的机器）" }`，并且**不要断言库副本里会变的具体日期/数量**（只断言不变量）。
- 失败且你认为是产品 bug：改成 `test("…", { todo: "疑似 bug：<一句话>" }, …)`，保留断言，报告列出复现命令与实际/期望。
- 写法参考同目录已有的 `*.test.mjs`。**自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**
- `xuegen-data-root.mjs` 只能对临时目录跑（`--home`、`--learning` 都指向 mkdtemp 里的路径），**绝不碰 `~/.xuegen`、`~/xuegen-data`、`~/learning`、`~/学根`**。先跑 `--dry-run` 看它要做什么。

## 要测的情况
1. vault-lint：库副本复制后跑 `--json` → 问题清单原样写进报告；断言深层 `raw/**/.gitkeep` 不报（11-10 说装 0.9.0 后这类误报消失）；造一个断链、一个缺 frontmatter 的知识页 → 能报出来。
2. calendar：`write` 新日子（目录不存在时自动建）、覆盖已有日子（按实际：覆盖还是追加，写进报告）、`--stdin`、非法日期报错；`get` 不存在的日子；`month` 跨月。
3. xuegen-data-root：全新临时数据根 → 建出 `vault/sessions/workspace` 英文子目录；已有旧中文子目录（库/会话/工作区）时的行为；`--dry-run` 不写任何东西；重复运行幂等。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/wiki-save/vault-lint.full.test.mjs skills/calendar/calendar.full.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|todo)' && npm test 2>&1 | grep -E '^# (pass|fail|todo)' && npm run lint:skills 2>&1 | tail -1
```
## 结束报告（中文，必须输出）
新增测试数；每条实际行为一句话；所有 todo 的复现与实际/期望；验收输出。
