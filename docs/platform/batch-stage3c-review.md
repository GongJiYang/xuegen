# batch-stage3c-review（DeepSeek，小单约 15 分钟）：course_close 工具与权限收紧——补测试 + 一处审计

Devin 按 `docs/platform/batch-stage3c-tool.md` 写完，报告 `/Users/gjy/pi-learning/devin-stage3c-tool.log`。**先写测试并跑通，再改代码。**

## 硬约束
- 只改 `apps/desktop/src/agent/tools/course-close-tool.ts`、`agent/guard/{roles,extension,vault-paths}.ts` 及它们的测试（新建 `tools/course-close-tool.test.ts`）。别碰 `skills/**`。不 commit/push、不加依赖、不放宽 eslint。

## 1. 测试
1. `decideCourseClose`（`roles.test.ts`）：总控/自由调用拒；课程会话 stage 本课放行、slug=别的课拒；staging 在 `<工作区>/.close/<slug>-x` 放行、在 `.close/ctm-x` 拒、在工作区外拒、用 `..` 跳出拒、经符号链接指到别处拒；add 的 path 是绝对路径或含 `..` 拒。
2. 课程会话直接 write/edit 本课课程页、别的课程页、`wiki/知识/concepts/x.md`、`wiki/knowledge/concepts/x.md` 都拒且原因含 `course_close`；写 `wiki/subjects/x.md`、摘录、书房、log 仍放行；自由会话写概念页仍放行。
3. `course-close-tool.test.ts`：参数拼接（纯函数 `courseCloseArgs`）六个 action 各一例 + 缺参数抛中文错；`execute` 用假的 execFile（注入）验证退出码 0 → 普通结果、非 0 → `isError: true` 且内容是 stdout（check 的 problems）。

## 2. 审计
`extension.ts` 的 `auditTarget`：`course_close` 记 `"<action> <slug 或 staging>"`（例如 `commit /…/.close/discrete-math-epp-20261109-2300`），不再是空串。加一条测试。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 src/agent 2>&1 | tail -4
```
## 结束报告（中文，必须输出）
新增测试数；审计改了什么；发现的问题。
