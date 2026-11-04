# 平台路线：Skill 仓库与 RAG

本文件规划两项平台能力如何融入 Xuegen。先按根目录 `ARCHITECTURE.md` 六层模型归类，再定实现方式与批次。它们与桌面版路线（`docs/desktop/ROADMAP.md`）并行推进，交汇点在 L5 界面。

## 0. 定位

| 能力 | 解决的问题 | 层 | 不做什么 |
|---|---|---|---|
| Skill 仓库 | 学习能力越来越多（teach、course、reading、学科技能、第三方技能），需要统一的来源、版本、启用与审查 | L2 策略 + L3 能力（分发） | 不自建运行时插件系统；不绕过 Pi 的 package 机制 |
| RAG | 你的 Wiki、原文、论文、摘录越来越多，`index.md` + 定向搜索不够用；讲解与整理需要基于「你自己的资料」 | L1 记忆（派生索引）+ L3 工具（检索） | 索引不是真相源；不把检索结果当作已读事实；不新建第二套笔记存储 |

两条原则贯穿全程：

1. **Markdown 仍是唯一真相源**。RAG 索引是可随时删除重建的派生物；skill 的启用状态记录在可读的配置文件里。
2. **事实分级不变**（`ARCHITECTURE.md` L0）：检索命中只是「候选」；引用前必须实际读取原文片段，回答中标注路径与标题位置。

## 1. Skill 仓库

### 1.1 区分两类 skill

| 类别 | 给谁用 | 例子 | 存放 |
|---|---|---|---|
| 学习 skill | Xuegen 运行时（学习时由模型调用） | teach、course、reading、wiki-save、article，未来的学科技能（证明训练、论文精读、编程练习） | 内置：仓库 `skills/`；扩展：Skill 仓库 |
| 开发 skill | 写 Xuegen 代码的 agent（cmd、Claude） | gsap-skills、shadcn 规范、mira-code-gate 一类 | `~/.commandcode/skills/`、项目 `.claude/skills/`，**不进入 Xuegen 运行时** |

两者混装会让学习时的技能列表被无关描述占满，降低路由准确率，所以严格分开。

### 1.2 来源与信任分级

| 级别 | 来源 | 默认状态 | 说明 |
|---|---|---|---|
| 内置 | 仓库 `skills/` | 启用 | 随版本发布，经测试与审查 |
| 个人 | `~/.xuegen/skills/` | 启用 | 你自己写的学习 skill，不进仓库 |
| 第三方 | Pi package（npm / git，**锁定版本**） | 安装后**停用**，审查后启用 | skill 可以指示模型运行程序，等同于执行代码 |

第三方 skill 一律通过 Pi package 机制安装（`docs/packages.md`：npm/git 源、版本与 git ref 锁定），Xuegen 只在其上加一层「清单 + 审查 + 启用」管理，不自建下载器。

### 1.3 组成

- **清单文件** `~/.xuegen/skills.json`：每个 skill 的来源、锁定版本、启用状态、审查记录（日期、审查人、内容哈希）。启动器按清单拼出加载路径，取代当前写死的 `--skill <repo>/skills`。
- **命令** `xuegen skills list | add <source> | review <name> | enable | disable | update | remove`。`add` 只下载并记录哈希；`review` 展示 SKILL.md 全文与附带脚本清单，确认后写入审查记录；`update` 发现哈希变化时自动回到「待审查」。
- **编写规范与检查** `npm run lint:skills`：frontmatter 合法（名称规则、description ≤ 1024 字且说明「做什么 + 何时用」）、SKILL.md ≤ 500 行、长内容放 `references/`、脚本零依赖且有测试、不得读取凭据目录。
- **路由评测** `evals/routing/*.jsonl`：「用户说法 → 期望触发的 skill（或不触发）」。每次新增或修改 skill 时跑一遍，防止抢路由（例如 reading 与 course 都想处理「今天学到这里」）。
- **桌面面板**：技能列表（来源、版本、信任级别、启用开关、审查状态）、查看 SKILL.md、一键审查。

### 1.4 批次

| 批次 | 交付 | 验收 |
|---|---|---|
| S1 规范与检查 | `docs/skills/AUTHORING.md`、`lint:skills`、现有 6 个 skill 全部通过 | lint 零错误；README 链接规范 |
| S2 路由评测 | 评测格式 + 运行脚本 + 每个内置 skill ≥ 10 条正例、≥ 5 条反例 | 报告各 skill 命中率；后续改动不得降低 |
| S3 清单与个人 skill | `skills.json`、启动器读取清单、`~/.xuegen/skills/` 支持、`xuegen skills list/enable/disable` | CLI 与桌面加载结果一致；停用的 skill 不出现在技能列表 |
| S4 第三方安装与审查 | `add/review/update/remove`，基于 Pi package，哈希变化自动回到待审查 | 未审查的第三方 skill 不会被加载；更新后需重新审查 |
| S5 桌面技能面板 | 列表、开关、审查视图 | 与 `xuegen skills list` 一致 |
| S6 学科技能（内容建设） | 按你的实际学习需求逐个新增学习 skill | 每个新 skill 必须过 S1 检查与 S2 评测 |

## 2. RAG

### 2.1 语料与边界

| 语料 | 位置 | 默认 |
|---|---|---|
| Wiki 页面 | `<库>/wiki/`（concepts、sources、synthesis、entities） | 纳入 |
| 摘录与阅读状态 | `<库>/wiki/extracts/`、`wiki/reading/` | 纳入 |
| 课程状态 | `<库>/wiki/courses/` | 纳入 |
| 原文 | `<库>/raw/`、`Clippings/` | 纳入（只读） |
| 论文缓存 | `~/.xuegen/papers/`（arXiv MCP 下载） | 纳入 |
| 闪卡 | `<库>/wiki/flashcards/` | 纳入，便于查重 |
| 会话记录 | `~/.xuegen/sessions/` | **默认不纳入**，单独开关（含隐私） |

`.obsidian/`、凭据、`auth.json` 永不进入索引。

### 2.2 架构

```text
Markdown / PDF 文件（真相源）
      │  监听变化、按内容哈希增量更新
      ▼
索引器（解析 → 按标题切块 → 关键词索引 + 向量）
      │
      ▼
~/.xuegen/index/rag.sqlite   ← 派生物，可删除重建
      │
      ▼
xuegen-rag（MCP 服务）：search / read_chunk / related / index_status
      │
      ├── Xuegen 运行时（teach、wiki-save、reading、course 调用）
      ├── 桌面版「来源」面板
      └── 其他 agent（cmd、Claude、Obsidian 内 AI）可复用
```

- **存储**：单个 SQLite 文件，关键词检索用 FTS5（trigram 分词，可处理中文），向量用 sqlite-vec。无需常驻数据库服务。
- **切块**：按 Markdown 标题层级切分，保留「文件路径 + 标题路径 + 行号范围」作为引用锚点；frontmatter 的标签、来源链接作为元数据，可过滤。
- **检索**：关键词 + 向量混合检索，结果融合排序；可选重排。按语料类型、标签、课程过滤。
- **嵌入模型**：与对话模型一样**不绑定提供商**，配置在 `~/.xuegen/rag.json`：本地（Ollama 运行的多语言嵌入模型，零费用、不出本机）或任意 OpenAI 兼容的嵌入接口。更换模型时整库重建。
- **以 MCP 服务提供**：与已配置的 arxiv、fetch、tavily 同一机制注册到 `~/.xuegen/mcp.json`，独立进程、崩溃不影响会话，也能被其他 agent 复用。

### 2.3 与现有能力的结合点

| 能力 | 如何使用 RAG |
|---|---|
| teach | 讲解前检索你已有的笔记与卡片，从「你上次在 X 里写过……」接续，避免重复讲、发现旧理解中的矛盾 |
| wiki-save | 新建页面前查找相似概念页，优先补充现有页面；制卡前查重 |
| reading | 摘录时推荐相关的已有摘录与概念页并建议链接；每月回顾时按主题聚类 |
| course | 针对已绑定教材的问答，回答附章节位置 |
| article | 抽象知识架构时检索相关概念的既有定义 |
| 桌面版 | 「来源」面板：显示每条回答引用的片段，点击在 Obsidian 中打开对应位置 |

所有引用都要在回复中给出路径和标题位置。检索未命中时如实说明，不编造来源。

### 2.4 批次

| 批次 | 交付 | 验收 |
|---|---|---|
| R0 基线评测 | 建立检索评测集：≥ 50 条「问题 → 应命中的页面/片段」，覆盖中英文、概念、定义、跨页关系；测量现有 `index.md` + grep 方式的命中率 | 得到基线数字，后续每批对比 |
| R1 关键词索引 | 索引器（切块、增量、哈希）+ FTS5 + `xuegen index build/status` + MCP `search/read_chunk` | 命中率高于基线；删除索引后可完整重建；不写入库内任何文件 |
| R2 向量混合 | 嵌入配置、sqlite-vec、混合检索与融合排序 | 评测集命中率（前 5 条）相对 R1 有提升；嵌入不可用时自动退回关键词检索 |
| R3 接入 skill | teach、wiki-save、reading 在 SKILL.md 中加入检索步骤与引用规范 | 路由评测与检索评测均不下降；回答中的引用都能打开原文验证 |
| R4 桌面来源面板 | 引用片段展示、在 Obsidian 中打开（`obsidian://` 链接）、索引状态 | 与 MCP 返回一致 |
| R5 会话记录（可选） | 会话记录纳入检索的开关、脱敏规则 | 默认关闭；开启需明确确认 |

## 3. 总体顺序

```text
桌面：第1批 ✔ → 动效批 → 第2批 课程看板 → 3 笔记 → 3.5 阅读队列 → …
Skill：            S1 规范 → S2 路由评测 → S3 清单 → S4 第三方 → S5 面板
RAG：              R0 基线 → R1 关键词 → R2 向量 → R3 接入 skill → R4 来源面板
```

- S1、S2、R0 只涉及文档、脚本与评测集，可与桌面批次并行，最先做。
- R1 早于 S3：检索能立刻提升日常学习体验；Skill 清单在 skill 数量增长后才是刚需。
- 每批沿用现有流程：Claude 写任务说明 → cmd 实现 → Claude 按真实场景审查验收 → 汇报。

## 4. 已定决策（2026-11-03）

1. **嵌入模型用 API**。通过 OpenAI 兼容的嵌入接口接入，提供商与模型写在 `~/.xuegen/rag.json`，密钥只从环境变量读取，不写入任何文件。影响：
   - 被索引的文本会发送给嵌入服务商。`rag.json` 支持按目录排除（例如私人日记目录），首次建索引前列出将发送的文件数量与总字数，经确认后执行。
   - 记录每次嵌入的 token 用量；增量更新只发送变化的切块，避免重复计费。
   - 嵌入接口不可用或额度不足时退回关键词检索并明确提示，不静默降级。
2. **会话记录不纳入 RAG**。R5 取消。
3. **Skill 仓库公开**。影响：
   - 新建独立公开仓库（暂定 `xuegen-skills`），只放学习 skill；Xuegen 主仓库保持私有，内置 skill 中可公开的部分迁移或同步过去。
   - 需要开源许可证（建议 MIT，待你确认）、`CONTRIBUTING.md`、提交要求（必须通过 lint 与路由评测）、CI 自动检查。
   - 公开 skill 中禁止出现个人路径、个人库结构假设和凭据；与个人库相关的约定（如 `wiki.json`、库规则）通过配置读取。
   - S4 的第三方审查机制同样适用于从公开仓库安装的 skill（固定版本 + 哈希）。

4. **许可证**：公开仓库 `xuegen-skills` 使用 MIT。
5. **评测集与模型无关**：检索评测集（R0）与路由评测集（S2）都是纯数据文件，由用户编写或审定，可用任意 AI 起草但不依赖任何特定 agent 生成；评测脚本只读数据文件，检索器/模型可替换。
6. **RAG 暂缓**（2026-11-03）：R0–R4 推迟，当前优先桌面 UI 与 Anki 结合。

### 批次调整

| 批次 | 调整 |
|---|---|
| S1 | 规范中加入「公开发布要求」：无个人路径、无私有假设、许可证头 |
| S2 | 评测集同时作为公开仓库 CI 的回归测试 |
| S3.5（新增） | 建立公开仓库 `xuegen-skills`：许可证、贡献指南、CI（lint + 路由评测）、首批发布可公开的 skill |
| R2 | 嵌入接入走 API；增加用量记录、发送前确认、排除目录 |
| R5 | 取消 |
