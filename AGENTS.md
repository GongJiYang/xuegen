# Xuegen 仓库约定（所有 agent 必读）

- 先读 `ARCHITECTURE.md`（六层模型）。新需求先归类到层，再决定实现位置。
- 不 fork、不修改 Pi 运行时；只通过 Extension / SDK / 上游 API 扩展。
- Markdown 是学习状态的唯一真相源；不新增数据库或第二套状态。
- 不修改 `~/.xuegen`、用户的 Wiki 或仓库以外的任何目录。不写入凭据、会话内容。
- 不 `git commit`、不 push，除非任务说明明确要求。
- 依赖精确锁定版本；新增依赖必须在报告中说明用途与替代方案。
- 只做任务说明里的范围。发现范围外的问题，写进报告，不顺手修改。
- 报告用中文：做了什么、偏离规格之处及原因、未完成项、需要人执行的命令。所有「通过」都要附实际命令输出。

## 分区规则

| 目录 | 额外必读 |
|---|---|
| `apps/desktop/` | `apps/desktop/AGENTS.md`（工程规范）、`docs/desktop/ARCHITECTURE.md` |
| `skills/` | 对应 `SKILL.md`；脚本保持零依赖、可单独运行 |
| `bin/` | CLI 行为变化须同步 `README.md` 与 `CHANGELOG.md` |
