# Xuegen 仓库约定（所有 agent 必读）

- 改动前先读 `docs/platform/PRINCIPLES.md`（四类划分、一件事一个地方、记忆分层、上下文预算）；与之冲突的改动不做，先报告。
- 先读 `ARCHITECTURE.md`（六层模型）。新需求先归类到层，再决定实现位置。
- 不 fork、不修改 Pi 运行时；只通过 Extension / SDK / 上游 API 扩展。
- Markdown 是学习状态的唯一真相源；不新增数据库或第二套状态。
- 不修改 `~/.xuegen`、用户的 Wiki 或仓库以外的任何目录。不写入凭据、会话内容。
- 不 `git commit`、不 push，除非任务说明明确要求。
- 依赖精确锁定版本；新增依赖必须在报告中说明用途与替代方案。
- 根目录与 `apps/desktop` 的 `@earendil-works/pi-coding-agent` 版本必须一致；升级时两处同时修改，并同步两个 lock 文件。
- 只做任务说明里的范围。发现范围外的问题，写进报告，不顺手修改。
- 报告用中文：做了什么、偏离规格之处及原因、未完成项、需要人执行的命令。所有「通过」都要附实际命令输出。

## 分区规则

| 目录 | 额外必读 |
|---|---|
| `apps/desktop/` | `apps/desktop/AGENTS.md`（工程规范）、`docs/desktop/ARCHITECTURE.md` |
| `skills/` | 对应 `SKILL.md`；脚本保持零依赖、可单独运行 |
| `bin/` | CLI 行为变化须同步 `README.md` 与 `CHANGELOG.md` |

## 规矩与守卫

每条规矩配上守它的东西。被纠正一次就补一条，能用结构、类型、lint、测试守住的就不写成文字（方法见 `/correct`）。「只有文字」的规矩没有东西拦，最容易再犯。本地和 CI 跑同一套命令：`apps/desktop` 下 `npm run typecheck && npm run lint && npm test`，仓库根 `npm test && npm run lint:skills`。

| 规矩 | 守卫 | 起因 |
|---|---|---|
| 依赖方向：core 不引皮肤，皮肤之间不互引，renderer 不跨 IPC | eslint `no-restricted-imports`（`apps/desktop/eslint.config.mjs`） | 架构约定 |
| 排序不随本机语言：桌面用 `compareText`（`src/shared/text-order.ts`），技能脚本写 `localeCompare(x, "zh-Hans-CN")` | eslint `no-restricted-syntax` 禁 `localeCompare`；`lint:skills` 规则 `locale-compare`；测试固定 `LC_ALL=en_US.UTF-8`，和 CI 一致 | 11-15 领域分组不稳定；11-16 CI 红了三版（本地中文环境绿） |
| 源文件 ≤ 300 行代码（不算空行、注释）；已超的按 11-16 的行数封顶，只许变短 | eslint `max-lines` + `apps/desktop/max-lines-baseline.json`（拆完把数字改小，不许改大） | `App.tsx`、`control-panel.tsx`、`control-card.ts` 反复超长，靠人提醒 |
| CI 不绿不发版 | `node scripts/ci-green.mjs`（`docs/desktop/RELEASE.md` 第 5 步） | v0.12.x、v0.14.0–v0.16.0 带红 CI 发布 |
| 任务单、报告、`docs/platform/`、返修截图不进公开仓库 | `.gitignore` | v0.13.x 两次把任务单和 PROGRESS 提交进公开仓库 |
| 界面用词按词表（导读 / 课后读 / 主课 …），不出现脚本名、路径、内部词 | `scripts/lint-wording.mjs`（根 `npm test`） | 旧叫法多次漏网 |
| Bear 文字 ≥ 12px、可读灰字 ≥ 4.5:1、字号行高成对 | `skins/bear/scale-css.test.ts` | 11-15 总控返修（10px 小字、2.7:1 灰字） |
| 技能脚本主模块判定用 `realpathSync`；技能里不写个人绝对路径 | `lint:skills` 规则 `script-main-check`、`personal-path` | 经符号链接调用时脚本静默不执行 |
| 界面先出设计稿给用户批，返修也一样 | 只有文字 | 11-12、11-15 两次没给稿就派返修 |
| 组装处（App / use-*-planbook 拼 props）要有接线测试，不只测组件 | 只有文字 | 11-13 `panelProps.month` 写死 null，本月空白 |
| 点了发异步的按钮要防连点 | 只有文字（`use-course-sessions` 的 `opening` 锁是样例） | 开课连点、书房 done 连点、阅读队列连点 |
