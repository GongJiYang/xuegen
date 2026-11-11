# batch-full-fix9-pref-subject（DeepSeek 返修，约 15–20 分钟，TDD）：课程会话没有任何办法记「以后讲<科目>都…」

## 现象与根因（Claude 已查清）
- 用户要求（11-08，`skills/course/SKILL.md` 第 124 行）：课上说「以后讲离散都…」→ 提议一行，确认后写进**本科目页** `## 讲解偏好`。
- 11-11 测试窗口离散课里说「以后讲离散都先给证明策略」→ 模型回答「我是课程会话，写不了科目页，只有总控能改」，什么都没写。
- 根因：没有写入通道。① guard（`apps/desktop/src/agent/guard/roles.ts` 第 300–303 行）拒绝课程会话写任何科目页——它的拒绝理由本身写着「讲解偏好只写本科目页的「讲解偏好」一节」，说明本意是留这一节的通道；② `course_close` 收课暂存的归属（`skills/course/close/rules.mjs` `ownedPrefixes`，约 40–58 行）只有计划暂存（kind plan）才含 `wiki/subjects/<subject>.md`，收课暂存没有。

## 改法：收课暂存也能带本科目页，但只许改「## 讲解偏好」一节；新提交标签「偏好」
只改：`skills/course/close/rules.mjs`、`skills/course/course-close.mjs`、`skills/course/course-close.test.mjs`（或 `skills/course/close/rules.test.mjs`）、`apps/desktop/src/agent/tools/course-close-tool.ts` 及其测试。不改 `SKILL.md`（Claude 改）、guard、别的文件。不 commit/push、不加依赖。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**

1. 先写测试（照 course-close.test.mjs 现有 jj 用例 / rules 单测写法），确认失败：
   - 收课暂存 `stage` 后 `add wiki/subjects/<本科目>.md`（或 stage 时已复制——按你实现选一种，测试照实际）→ 只在 `## 讲解偏好` 节里加一行 → `check` ok → `commit --label 偏好` → 库里科目页改了、jj 描述「偏好 <slug> <日期>」。
   - 同一暂存改了科目页 `## 讲解偏好` 以外的任何一行（如 `## Materials`）→ `check` 报 problem（kind 自定，如 `subject-scope`，中文：「收课只能改本科目页的「讲解偏好」一节」）。
   - `## 讲解偏好` 节改完超过 15 行（不含标题与空行）→ problem（「讲解偏好不超过 15 行」）。
   - 别的科目页（非本课科目）→ 照旧报 owner。
   - 计划暂存（kind plan）对科目页的规则**不变**（总控可以改整页）。
   - `commit --label 偏好` 之后 `undo` 不撤它（找不到收课提交或只找更早的收课）——照 存档点 那条测试的写法。
   - 工具层：`course-close-tool.ts` 的 `label` 允许 `偏好`，参数 schema 与说明文字同步；其测试断言转成 `--label 偏好`。
2. 实现：`ownedPrefixes` 收课暂存也放 `wiki/subjects/<subject>.md`；`check` 对收课暂存里的科目页做「只改讲解偏好节」的 diff 校验（与基线逐行比：`## 讲解偏好` 标题行到下一个 `## ` 之间以外的行必须完全相同；节不存在时允许在文末新建这一节）；`COMMIT_LABELS` 加「偏好」；用法注释同步。
3. 文件头注释写清这条规则与原因（用户 11-08 要求课上记偏好）。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/course-close.test.mjs skills/course/close/*.test.mjs 2>&1 | grep -E '^# (tests|pass|fail)' && npm test 2>&1 | grep -E '^# (pass|fail|todo)' && npm run lint:skills 2>&1 | tail -1 && cd apps/desktop && npx vitest run src/agent/tools 2>&1 | tail -3 && npm run -s typecheck && npm run -s lint
```

## 结束报告（中文）
第 1 步失败输出、改动、验收输出、科目页 diff 校验怎么判的一句话。
