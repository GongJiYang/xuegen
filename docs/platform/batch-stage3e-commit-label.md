# batch-stage3e-commit-label（DeepSeek 返修，小单约 15 分钟）：存档点的提交不叫「收课」

11-10 真机验收发现：`course_close commit` 的 jj 提交名一律是「收课 <slug> <日期>」。存档点（长会话中途 stage → 改 Next Session → commit）也叫「收课」，于是用户之后点「撤销这次收课」时，`undo` 找到的「最近一次收课」是存档点，撤错了。**先写测试再改。**

## 硬约束
- 只改 `skills/course/course-close.mjs`、`skills/course/course-close.test.mjs`、`skills/course/references/close.md`、`apps/desktop/src/agent/tools/course-close-tool.ts`、`apps/desktop/src/agent/tools/course-close-tool.test.ts`。别碰 `SKILL.md`（Claude 改）、`guard/**`、`sandbox/**`。不 commit/push、不加依赖。

## 要做的
1. `course-close.mjs commit <暂存目录> [--label 收课|存档点] [--json]`：`--label` 只允许这两个值，不给就是「收课」，别的值 `fail("--label 只能是 收课 或 存档点")` 且什么都不写。`cmdCommit` 把它传给 `commitInternal(staging, label)`（已有参数）。`main()` 把 `flags.label` 传进去；`usage()` 和文件头注释同步。
2. `undo` 不改：仍只认「收课 <slug> <日期>」，所以存档点提交不会被撤；但 `guardLaterChanges` 照旧——收课之后又有存档点改了课程页，撤销会被拒（这是对的：存档点之后的内容不能被盖掉）。
3. 工具：`courseCloseArgs` 的 params 加 `label?: "收课" | "存档点" | undefined`；`commit` 时有 label 就在 `--json` 前加 `["--label", label]`。schema 加 `label: Type.Optional(Type.Union([Type.Literal("收课"), Type.Literal("存档点")], { description: "commit 用：存档点（长会话中途保存）填「存档点」；收课不填" }))`。
4. `references/close.md`：`commit` 那行用法加 `[--label 收课|存档点]`，说明加一句「存档点用 `--label 存档点`，jj 记「存档点 <slug> <日期>」，`undo` 不会撤它」。

## 测试
- `course-close.test.mjs`（jj 用例）：`commit --label 存档点` → jj 最新描述「存档点 <slug> <今天>」；之后 `undo` → 报「没有找到这门课的收课提交」（只有存档点时）。再：收课 → 存档点（改课程页 Next Session）→ `undo` → 被拒（之后又被改过），库不动。`--label 别的` → 非 0、中文报错、库和 jj 都不动、暂存仍未提交。
- `course-close-tool.test.ts`：commit 带 label 的 argv、不带 label 的 argv 不变。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/course-close.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|skipped)' && npm test 2>&1 | grep -E '^# (pass|fail)' && npm run lint:skills 2>&1 | tail -1
cd apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 src/agent/tools 2>&1 | tail -4
```
## 结束报告（中文，必须输出）
新增测试数、改了什么、验收输出。
