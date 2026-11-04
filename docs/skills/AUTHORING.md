# 学习 skill 编写规范

适用于仓库 `skills/` 下的学习 skill（Xuegen 运行时由模型按需加载的能力），也适用于将来从公开仓库分发的 skill。开发用的 skill（写代码的 agent 用的 gsap、shadcn 等）不适用本规范，也不进入 `skills/`。

依据：Pi 文档 `docs/skills.md`（本地路径 `apps/desktop/node_modules/@earendil-works/pi-coding-agent/docs/skills.md`）与 [Agent Skills 规范](https://agentskills.io/specification)。事实分级、六层模型见根目录 `ARCHITECTURE.md`。

## 1. 目录结构

```text
skills/<name>/
├── SKILL.md            # 必需：frontmatter + 正文
├── references/         # 可选：长参考资料（规范、长清单、示例集）
├── <script>.mjs        # 可选：零依赖脚本
└── <script>.test.mjs   # 脚本的同目录测试
```

- 一个 skill 一个目录，目录名即技能名，`SKILL.md` 位于目录根。
- `SKILL.md` 只放"模型每次都要遵守的流程与判断规则"。超过约 200 行能撑住的细节、长表格、大段示例移到 `references/`，正文用相对路径引用（`references/xxx.md`）。
- 脚本与 `SKILL.md` 同目录，方便模型用"技能实际目录"拼出绝对路径调用；不要建额外的 `scripts/`、`bin/` 子目录，除非该 skill 有多个脚本需要分组。
- 参考资料与脚本用相对路径引用，Pi 会把 skill 的绝对路径告诉模型，模型据此解析。

## 2. frontmatter

```yaml
---
name: reading
description: 用户要求把文章/论文加入渐进阅读队列、查看今天该读什么……时使用。阅读状态是 wiki/reading/<slug>.md……普通自由学习不触发。
disable-model-invocation: false
---
```

| 字段 | 必需 | 规则 |
|---|---|---|
| `name` | 是 | 只含小写字母、数字、连字符；不以连字符开头/结尾，不出现连续连字符；≤ 64 字符；**与目录名一致**（Pi 不强制，但可移植的 skill 都这么做，`lint:skills` 会检查）。 |
| `description` | 是 | ≤ 1024 字符；**同时**写明"做什么"和"何时使用"；写明"何时**不**触发"更佳。缺少 description 的 skill 不会被加载。 |
| `disable-model-invocation` | 否 | 设为 `true` 时，该 skill 只能通过 `/skill:<name>` 显式调用，不参与模型的自动选择。 |

其他可移植字段（`license`、`compatibility`、`metadata`、`allowed-tools`）按 Agent Skills 规范书写，Xuegen 的 `lint:skills` 不检查。

`name` 只用连字符分词；description 用中文叙述，但保留必要的英文术语（如 `wiki.json`、slug）。

### description：做什么 + 何时用 + 何时不用

description 是唯一的路由信号：模型只看到 name 和 description，据此决定是否加载。写得含糊会导致 skill 该触发时不被加载，或抢走别人的请求。

**好的示例**

1. `把当天或指定范围的学习内容抽象成文章知识架构，输出精准知识点、层级、关系、机制和边界；用户想整理学习成果但不需要成文细节时使用。`
   —— 说清产出物（知识架构，不是成文）和触发场景（想整理成果又不要细节）。
2. `用户要求绑定书籍/资料、创建或选择课程、安排学习计划、收课时打勾或抵消、生成学习进度截图时使用。每门课一个只读状态文件 wiki/courses/<slug>.md……只读的进度展示交给 course-board；普通自由学习不触发。`
   —— 正例列举具体动作，反例明确划清与 `course-board` 的边界。
3. `用户要求把文章/论文/书摘加入渐进阅读队列、查看今天该读什么、结束一次阅读……摘录是 wiki/extracts/<slug>/，排程只经本技能目录的 reading-queue.mjs 修改；制卡沿用 wiki-save 与库内制卡规则。普通自由学习不触发。`
   —— 写明负责的环节、状态位置、与相邻 skill 的分工。

**坏的示例**

1. `帮助用户学习。`
   —— 只说领域，不说做什么、何时用；会和几乎所有请求竞争。
2. `处理知识。`
   —— 太宽泛，没有可判断的触发条件，也没有边界。
3. `用于课程。`
   —— 没说明具体动作（绑定？查看？打勾？），也没区分 `course` 与 `course-board`，容易抢路由。

写完后自问：一个没读过这个 skill 的人，只看 description，能不能判断"这句话该不该触发它"？不能就重写。

## 3. 正文

正文是模型加载后要执行的指令，写成可照做的流程，不是介绍文章。

- **长度**：≤ 500 行（`lint:skills` 强制）。能更短更好；超出的细节移到 `references/` 或脚本。
- **职责边界**：开头或专门一节写明"负责什么、不负责什么、相邻 skill 是谁"。例如 `course` 写清"教学交给 teach，整理交给 wiki-save，只读展示交给 course-board"。避免多个 skill 都声称处理同类请求。
- **读写边界**：明确哪些路径**只读**（如 `raw/`、`Clippings/`、凭据目录）、哪些**可写**、写入走什么流程（例如"解锁 → 编辑 → 上锁"、"只经脚本修改"）。只读与可写的边界要具体到路径与文件类型。
- **事实分级**：区分"用户提供 / 实际读取 / 实际执行 / 模型推断 / 待核实"（见 `ARCHITECTURE.md` L0）。没有证据时不把模型的讲解写成用户已掌握；检索命中只是候选，引用前要实际读取原文。
- **来源**：引用外部作者或仓库时在"来源"一节列明，说明哪些是独立改写、哪些是原样引用。
- **返回格式**：规定结束时给用户的结构（清单项、字段、单位口径）。例如 `course` 规定收课报告要包含哪些活动完成、证据、下次起点、保存路径。
- 不要留注释掉的代码、调试输出、无主 TODO；TODO 要写明批次（`TODO(batch-2): …`）。

## 4. 脚本

配套脚本用于**确定性**工作：解析、校验、状态迁移、渲染。模型不确定的部分交给模型判断，确定的部分交给脚本。

- **零依赖**：只用 Node 内置模块（`node:fs`、`node:path` 等），不引入 npm 包。零依赖才能被公开仓库、CI 和其他宿主直接运行。
- **可单独运行**：`node <script>.mjs --help` 能给出用法；出错时 `stderr` 写明原因并以非零码退出。
- **支持 `--json`**：所有命令可用 `--json` 输出机器可读结果，供模型解析与后续自动化。
- **原子写入**：写状态文件用"写临时文件再 rename"，避免半截文件（见 `reading-queue.mjs` 的 `writeAtomic`）。
- **测试在临时目录**：测试（`*.test.mjs`，用 `node:test` + `node:assert`）在 `os.tmpdir()` 建临时库构造场景，绝不读写真实 Wiki 或用户目录。
- 脚本修改状态文件时，仍要遵守 skill 的读写边界与锁约定；不要绕过锁用其他命令写文件。

## 5. 公开发布要求

skill 可能从公开仓库 `xuegen-skills` 分发，因此**不得**包含任何个人化内容：

- 不出现个人绝对路径：`/Users/<名字>/`、`/home/<名字>/`、`C:\Users\<名字>\` 一律禁止。示例路径用占位符 `<库根目录绝对路径>`、`<技能实际目录>`、`<验证码>` 等，并放在明确的 `<...>` 中。
- 不出现个人用户名、凭据或其存储路径（`~/.xuegen/auth.json`、API key、token）。凭据位置只能在文档里描述为"从环境变量读取"，不写实际值。
- 个人库位置**只能**通过配置读取（如 `wiki.json` 的 `root`，或 `XUEGEN_HOME` 指向的 `wiki.json`），不写死在脚本或正文里。
- 不假设特定个人库的目录名或结构，除非该约定已写在库规则中、且通过配置定位。例如可以假设"库根目录下有 `wiki/` 子目录"，因为这是 `wiki.json` 的约定；不能假设库叫某个具体名字。
- 许可证头：迁移到公开仓库的 skill 按该仓库的许可证（建议 MIT）标注。

`lint:skills` 会用 `/Users/`、`/home/`、`C:\Users\` 三条规则扫描整个 skill 目录（含脚本），命中即报错；只有写在明确 `<...>` 占位符里的示例路径才允许。

## 6. 完成定义与检查

新增或修改 skill 后，至少运行：

```sh
npm run lint:skills    # frontmatter、name、description、行数、个人路径、脚本测试齐备
npm test               # scripts/ 与 skills/ 下的全部 *.test.mjs
```

- lint 零错误。脚本缺少同名测试只报**警告**，不阻断，但新增脚本应补测试。
- 每个脚本的测试在临时目录通过。
- 提交前 `git status` 只出现本次范围内的文件。
