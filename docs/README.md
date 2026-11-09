# 文档索引

长期维护的文档按主题保存在 `docs/` 下；一次性任务单（批次说明、修复单、交接单）统一放在 `docs/archive/`，只作历史记录，不再更新。

| 路径 | 用途 |
|---|---|
| `ARCHITECTURE.md` | 全仓六层模型与需求分类卡：新需求先归类再实现。 |
| `AGENTS.md` | 所有 agent 必读的仓库约定（分区规则、提交与凭据限制）。 |
| `instructions.md` | 学根运行时的系统提示词（教学策略与记忆契约）。 |
| `README.md` | 面向用户的安装、命令与使用说明。 |
| `CHANGELOG.md` | 对外可见的行为变更记录。 |
| `PROGRESS.md` | 当前进度、下一步与待用户处理事项。 |
| `docs/desktop/ARCHITECTURE.md` | 桌面版设计边界（六层模型在桌面的落点）。 |
| `docs/desktop/UI-ARCHITECTURE.md` | 可替换皮肤架构、契约、样式隔离与动效原则。 |
| `docs/desktop/SKIN-LEDGER.md` | 皮肤功能台账：每项界面功能的要求、契约、行为要点、各皮肤做到哪；新前端照它做，界面批次收尾时更新。 |
| `docs/reading/SHELF-IR-ANALYSIS.md` | 书房与 Anki / FSRS 渐进阅读：本机 Anki 核实、IR 插件兼容性、为什么 FSRS 不给读书排期、推荐方案与实测步骤。 |
| `docs/desktop/BEAR-VISUAL-PLAN.md` | Bear 视觉规则：字号 / 灰阶 / 间距 / 圆角变量、对比度要求、状态、深色、固定截图对比；Bear 新样式只用这里的变量。 |
| `docs/desktop/FEATURES.md` | 2026-11-03 的初版功能总表（已由 SKIN-LEDGER 取代，只作历史）。 |
| `docs/desktop/ROADMAP.md` | 桌面版批次路线图。 |
| `docs/desktop/RELEASE.md` | 发版步骤：打包、GitHub Release、程序内更新、首次安装。 |
| `docs/desktop/skins/README.md` | 皮肤登记表（id、版本、状态）。 |
| `docs/desktop/skins/chicago.md` | Chicago 皮肤的视觉与交互规范。 |
| `docs/platform/PRINCIPLES.md` | 学根准则：库的四类划分、记忆分层、上下文预算、读原书；所有改动先对照。 |
| `docs/platform/ROADMAP.md` | 平台能力（skill 仓库、RAG）路线。 |
| `docs/skills/AUTHORING.md` | 学习 skill 的编写规范。 |

## 归档

`docs/archive/` 按原分区存放一次性任务单：

- `docs/archive/desktop/`：桌面版批次、问题修复、交接单。
- `docs/archive/reading/`：阅读批次任务单。
- `docs/archive/skills/`：skill 批次任务单与样例 fixture。
- `docs/archive/platform/`：平台批次任务单。

新任务完成后把任务单移入对应归档目录，并在被引用处更新路径。
