# batch-stage2-review（DeepSeek）：审核 + 误拦排查 + 补测试（会话角色与工具层拦截）

Devin 按 `docs/platform/batch-stage2-guard.md` 写完了（未提交）。你负责 A 审核（问题直接修）、B 误拦排查（结论写进报告，能确定的直接改清单）、C 补测试。不做界面。

## 硬约束

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`apps/desktop/src/agent/README.md`（含 guard 一节）、规格 `docs/platform/batch-stage2-guard.md`、`docs/platform/ARCH-DISCUSSION-1109.md` 第 7、10 节、`docs/platform/VAULT-NAMING.md`（库目录将改英文：`wiki/知识`→`wiki/knowledge`、`wiki/书房`→`wiki/shelf`、`Clippings`→`clippings`，清单要两种都认）。
- 测试只用临时目录；不读写真实 `~/.xuegen/`、不碰真实库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`/`@ts-ignore`。`App.tsx` 不加行。
- 只改 `apps/desktop/src/agent/guard/**`、`agent/session.ts`、`agent/index.ts`、`shared/protocol.ts` 及它们的测试、`renderer/core/**` 中本批改过的 hook 与测试。另一个审核在改 `skills/wiki-save/anki-sync*`、`bin/`、`shared/data-protocol*`、`main/data/**`，别碰。

## A. 审核

1. `canonical`：相对路径、`..`、不存在的深层路径（解析最深已存在祖先）、符号链接（库根本身就是 `~/Documents/Obsdian-gjy/GJY → ~/学根/库` 这类链接）、NFD/NFC、不区分大小写的卷；`within` 的分段比较。
2. 放行时改写 `input.path` 的确是检查用的那一份解析结果（TOCTOU）；`grep`/`find`/`ls` 的路径参数名与 `read` 不同时也被检查（看 Pi 的工具输入类型）。
3. 审计日志：每次判定一行、轮转、写失败不影响工具执行。
4. 角色传递：总控 / 开课 / 回到这节课 / 会话列表打开 / 启动恢复 / 新课程，各自得到的 role 正确；`isHostToAgentMessage` 拒绝非法 role。
5. MCP 工具与其它自定义工具（`toolName` 不在已知列表）：现在怎么处理？若默认放行，写进报告（这是缺口，要 Claude 定）。

## B. 误拦排查（最重要）

逐个读 `skills/*/SKILL.md`（及 `references/`）与 `instructions.md`，列出**模型会用 write / edit 工具直接写的文件**（不是经脚本写的），按「在哪类会话里会发生」对照 `roles.ts`，找出会被误拦的正常操作。至少核对：
- 讲解偏好（「以后讲离散都…」）写 `wiki/subjects/<科>.md` 或 `wiki/profile.md`：在总控、自由提问里说时；
- 日历笔记 `wiki/calendar/**`；剪藏到 `Clippings/`（`clippings/`）；阅读队列 `wiki/reading/**`；书房 `wiki/书房/**`（`wiki/shelf/**`）里人写的部分（分段、不读）；摘录 `wiki/知识/extracts/**`；来源登记 `wiki/知识/sources/**`；`raw/` 新增原料（剪藏、下载论文、登记教材时复制进 `raw/books/`）；`index.md`；新建课程时写 `wiki/courses/<新课>.md`；周期计划 `wiki/cycles/**`、`wiki/subjects.md`。
- 输出一张表：操作 | 技能 | 会话角色 | 写的路径 | 现在判定 | 应该 | 建议的清单修改。能确定是误拦的（正常流程必须写）直接改 `roles.ts` 并加测试；拿不准的（比如自由提问该不该能写 `raw/`）列出来给 Claude 定。
- 规则：**原料 `raw/` 只许新增、不许改已有文件**——若技能确实要往 `raw/` 新增，改成「`write` 到 `raw/` 下不存在的路径允许、覆盖已有文件拒绝、`edit` 拒绝」，并写测试。

## C. 补测试

`guard/path.test.ts`、`guard/roles.test.ts`（每个角色 × 每类路径的允许 / 拒绝表，新旧目录名都测）、`guard/extension.test.ts`（block 与改写 input）、`guard/audit.test.ts`（轮转）、`guard/session-role.test.ts`（推断）、协议校验样例。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen && git status --short
```

## 结束报告（中文）

审核结论与修改；B 的对照表（含已改与待定）；新增测试清单；验收输出；未完成项。
