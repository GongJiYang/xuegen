# batch-full-fix8-lecture-dedupe（DeepSeek 返修，约 15 分钟，TDD）：讲后读在书房里记两次、标签「讲后读 讲后读 D1」

## 现象与根因（Claude 已查清）
测试库 `wiki/shelf/epp.md`：
```
## 核心页已读
- pp.1–5、7–12、17–21、24–27、31 · discrete-math-epp · §1.1–1.4 核心页 · 2026-11-10   ← 界面「读完了」
- pp.1–5、7–12、17–21、24–27、31 · discrete-math-epp · 讲后读 D1 · 2026-11-11       ← 第二天开课时模型又记
## 读书记录
- 2026-11-10: 讲后读 §1.1–1.4 核心页 已读（discrete-math-epp，用户自报）
- 2026-11-11: 讲后读 讲后读 D1 已读（discrete-math-epp，用户自报）
```
- 根因 1（重复）：`skills/reading/bookshelf.mjs` 的 `lecture`（约 777–812 行）每次都追加，不查是否已记过；技能要模型「界面已记过就不再记」，模型做不到可靠判断（两边标签还不一样）。
- 根因 2（标签）：`lecture` 第 798、810 行固定加前缀「讲后读 」，而 `skills/course/SKILL.md` 第 50 行示例让模型传 `--label "讲后读 D1"`。

## 改法（先写失败测试，再改）
只改 `skills/reading/bookshelf.mjs` 与 `skills/reading/bookshelf.test.mjs`。不改 `SKILL.md`、别的文件。不 commit/push、不加依赖。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**
1. 先写测试（照 bookshelf.test.mjs 里已有 lecture 测试的写法），确认失败：
   - `--label "讲后读 D1"` → 读书记录一行是「讲后读 D1 已读（…）」，不是「讲后读 讲后读 D1」；`--label "D1"` 结果相同。
   - 同一书、同一 `--course`、同一 `--pages`（页码串规范化后相同：去空白，`-`/`–` 视为同一）已在「## 核心页已读」里 → 第二次 `lecture` 不追加任何行（两节都不动、文件字节不变），`--json` 返回里有 `already: true`；文字输出说「已记过，不再记」。不同 course 或不同 pages → 照常追加。
   - 没给 `--pages` 时：读书记录里已有同 course、同规范化标签的「讲后读 … 已读」行 → 同样不再记；否则照常。
2. 实现：标签规范化 = 去掉开头的「讲后读」及其后空白；查重按上面的键；输出字段加 `already`（布尔）。
3. 文件头用法注释补一句「同课同页已记过时不再记」。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/reading/bookshelf.test.mjs 2>&1 | grep -E '^# (tests|pass|fail)' && npm test 2>&1 | grep -E '^# (pass|fail|todo)' && npm run lint:skills 2>&1 | tail -1
```

## 结束报告（中文）
第 1 步失败输出、改动、验收输出。
