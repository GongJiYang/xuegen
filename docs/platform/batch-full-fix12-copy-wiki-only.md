# batch-full-fix12-copy-wiki-only（DeepSeek，约 10 分钟）：新测试整库复制 816MB，拖慢 npm test

`skills/course/course-close.real.test.mjs`（B3，每个用例复制一次）与 `skills/reading/reading.full.test.mjs`（B5 库副本用例）把 `/tmp/xg-e2e/vault/GJY` **整个** `cp -R`（816MB，其中 `raw/` 723MB 是 PDF、`.git` 35MB），根 `npm test` 从约 20 秒涨到 52 秒，每跑一次写几 GB 临时文件。这些用例只用得到 `wiki/`（2.7MB）。

## 改法（只改这两个测试文件）
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。** 不 commit/push。
1. 两个文件里复制库副本的地方改成只复制 `wiki/`（和用到的话 `AGENTS.md`）到临时库根；`.jj`/`.git` 不复制（B3 本来就删掉重新 `jj git init`）；权限照旧按原样设回（课程目录 0555、课程页 0444）。
2. 用例断言不变；跑通过。
3. 量一下：`/usr/bin/time -p npm test 2>&1 | grep -E '^# (pass|fail|todo)|^real'`，贴出前后时间。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/course-close.real.test.mjs skills/reading/reading.full.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|todo)' && /usr/bin/time -p npm test 2>&1 | grep -E '^# (pass|fail|todo)|^real'
```
## 结束报告（中文）：改动、前后耗时、验收输出。
