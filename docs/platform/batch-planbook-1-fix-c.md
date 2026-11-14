# batch-planbook-1-fix-c（DeepSeek，约 15 分钟，先写测试）：书页小标题「核心页已读」→「讲后读已读」

背景：用户 2026-11-11 定「核心页」只作技能内部词，对用户说「讲后读」。书房书页（`wiki/shelf/<书>.md`）里有一节 `## 核心页已读`，用户在 Obsidian 和书房面板里看得见，要改成 `## 讲后读已读`。真实库目前没有书页用过这一节（Claude 已查），但老书页仍要能读。

约束：只改 `skills/reading/bookshelf.mjs`、`skills/reading/bookshelf.test.mjs`、`skills/reading/SKILL.md` 第 59 行那一句的标题名；不 commit / push；**自己做完，不要调用 `pi`、`devin` 或别的 agent**。

## 改法
1. 新写入一律用 `## 讲后读已读`（约 885 行 `lecture` 建节处、约 679 行节顺序表、文件头注释 18 行、用法文字 1071 行）。
2. 读取兼容旧标题：`parseCoreRead`（约 356 行）和「这次 lecture 是否已经记过」（约 832 行）先找 `## 讲后读已读`，找不到再找 `## 核心页已读`。
3. 旧书页里已经有 `## 核心页已读`、再记一笔 lecture 时：**把旧标题改名为新标题**再往里追加（不要新开第二节、不要丢旧行）。节顺序表同时认两个标题。
4. `SKILL.md` 第 59 行「进「## 核心页已读」」改成「进「## 讲后读已读」」；其余文字不动。

## 测试（先写，看它失败）
- 新书页 `lecture --pages` 后：正文有 `## 讲后读已读`、没有 `## 核心页已读`。
- 旧书页（手写一节 `## 核心页已读` 带一行）：`list --json` 的 `coreRead` 能读出那一行；`today` 的 `coreOverlap` 照常算。
- 旧书页再 `lecture --pages`（不同页码）：只剩一节 `## 讲后读已读`，旧行和新行都在、顺序不乱。
- 旧书页同课同页再记：仍判定「已记过」不重复写。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/reading/bookshelf.test.mjs 2>&1 | tail -5 && npm test 2>&1 | grep -E "^# (tests|pass|fail|todo)" && node scripts/lint-skills.mjs | tail -1 && cd apps/desktop && npm test 2>&1 | grep -E "Tests |Test Files"
```

## 结束报告（中文）
改了哪些行；先失败的测试输出；验收输出。
