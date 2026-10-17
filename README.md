# Xuegen · 学根

一个在终端里陪你理解、推导和练习的学习 agent。目标是让你能独立运用知识。

告诉它你想学什么、已经会什么、准备花多少时间。Xuegen 会诊断起点、给出短路线、逐步建立理解，再用新的问题检查迁移能力。默认中文，也可以要求使用其他语言。

```text
我想理解大模型的上下文窗口与长期记忆。
我用过 AI 编程工具，但不了解底层实现，今天有 30 分钟。
目标是能判断哪些信息应该放进上下文、文件或技能。
```

## 安装

需要 Node.js 22.19.0 或更新版本、npm，以及一个受支持的模型账号或 API key。项目当前为私有仓库，克隆需要 GitHub 访问权限。

```bash
git clone https://github.com/GongJiYang/xuegen.git
cd xuegen
npm ci --ignore-scripts
npm link --ignore-scripts
```

在独立的学习目录启动，避免把笔记写进源码目录：

```bash
mkdir -p ~/learning
cd ~/learning
xuegen
```

第一次使用时，在会话内执行 `/login` 连接你自己的提供商，然后用 `/model` 选择可用模型。仓库不附带 API key，也不强制某一家模型。模型调用遵循提供商的计费方式。

无法使用全局 npm 命令时，也可以从任意工作目录运行 `node /path/to/xuegen/bin/xuegen.mjs`。

## 日常用法

| 操作 | 命令 |
| --- | --- |
| 开始学习 | `xuegen` 或 `xuegen "我想理解递归"` |
| 继续当前目录最近一次会话 | `xuegen -c` |
| 选择历史会话 | `xuegen -r` |
| 开始新主题 | 会话内 `/new` |
| 选择模型 | 会话内 `/model` |
| 显式使用教学技能 | 会话内 `/skill:teach` |
| 保存笔记 | 直接要求“把关键推导、错题和待核实问题保存到 notes/主题.md” |
| 整理到 Wiki / 制作闪卡 | 直接提出要求，或 `/skill:wiki-save 本次需要整理的内容` |
| 绑定教材 / 安排计划 / 查看进度 | 直接提出要求，或 `/skill:course 本次课程操作` |
| 检查 MCP 工具连接 | `xuegen mcp list` 或会话内 `/mcp` |
| 查看帮助 | `xuegen --help` |
| 查看底层运行时选项 | `xuegen --runtime-help` |

学习模式默认开启，不需要先输入 `/skill:teach`。你可以要求直接讲解、减少提问或完成具体任务。

## 当前能力与边界

- 默认 `teach` 教学；按需用 `course` 管理课程与进度，用 `wiki-save` 查询 Wiki、整理笔记关系和 Anki 闪卡。
- 独立的配置和会话目录；保留原生会话恢复、模型选择与文件工具。
- 独立命令、学习身份和终端标题。底层仍使用上游终端界面，部分帮助、状态和错误消息会保留上游名称。
- 不确定的内容必须标明；来源和实验结果必须来自实际读取或执行。
- 联网检索与阅读通过配置的 MCP 服务提供；尚无复习调度、子代理或图形生成。
- 第一性原理指从明确的定义、假设和已知事实推导；不把经验规律或近似强行称为普遍真理。

## 数据与配置

默认个人目录是 `~/.xuegen/`，可通过 `XUEGEN_HOME` 指定其他目录。相对路径以启动目录为基准，启动器会将其规范化为绝对路径，供后续工具使用。首次启动只创建缺失的默认设置，不覆盖已有设置，不读取或复制其他 agent 的账号。

| 位置 | 内容 | 是否进入仓库 |
| --- | --- | --- |
| `bin/xuegen.mjs` | 启动器与终端身份 | 是 |
| `instructions.md` | 学习 agent 的默认职责 | 是 |
| `skills/` | 可版本管理的学习能力 | 是 |
| `defaults/settings.json` | 不含账号和模型绑定的初始设置 | 是 |
| `package.json`、`package-lock.json` | 精确依赖与安装锁文件 | 是 |
| `~/.xuegen/auth.json` | 个人登录凭据 | 否 |
| `~/.xuegen/settings.json` | 个人模型与界面设置 | 否 |
| `~/.xuegen/wiki.json` | 可选 Wiki 路径绑定；仅 Wiki 查询、整理或课程操作时读取 | 否 |
| `~/.xuegen/mcp.json` | 个人 MCP 服务配置 | 否 |
| `~/.xuegen/mcp-tools/`、`~/.xuegen/bin/` | 本地安装的 MCP 服务及其入口 | 否 |
| `~/.xuegen/papers/` | 下载的论文与 LaTeX 缓存 | 否 |
| `~/.xuegen/sessions/` | 学习会话 | 否 |
| 目标 Wiki 中的课程页 | 绑定材料、计划、进度与简短作答记录 | 否 |
| 启动命令时所在的学习目录 | 用户要求保存的笔记或实验 | 否，除非自行提交 |

默认关闭共享 skills、扩展、提示模板、主题和项目指令的自动发现，并忽略项目级设置。显式加载项目自带的 skills、学习指令，以及内置 MCP 和工具发现扩展；MCP 服务从个人配置加载，项目 MCP 配置遵循运行时的项目信任规则。这个边界隔离配置与会话，不是文件系统沙箱；模型仍可使用当前用户权限执行文件操作和命令。

需要特定项目指令时显式传入：

```bash
xuegen --append-system-prompt ./AGENTS.md
```

## 按需整理到 Wiki

日常自由学习继续使用 `teach`。启动不会自动读取 Wiki 配置、索引或规则，也不会自动归档、制卡或建立课程。`wiki-save` 和 `course` 出现在技能列表中表示可用，不表示正在执行。

在个人目录 `~/.xuegen/wiki.json` 配置目标库；使用 `XUEGEN_HOME` 时，把文件放在该目录。路径必须是本机已有知识库的绝对路径：

```json
{
  "root": "/absolute/path/to/your/vault"
}
```

在任意学习目录启动 `xuegen` 即可，不需要切换到库目录或在启动时追加 Wiki 的 `AGENTS.md`。个人路径不进入应用源码。

学习后可以说：

```text
把今天关于 infilling 的讨论整理进 Wiki，并生成闪卡。
把这些内容和已有的音频处理笔记关联起来，先不做卡片。
/skill:wiki-save 将本次讨论整理到已有概念页，保留来源和未验证问题。
```

工作流按需读取目标库现有规则与相关页面，优先更新已有内容、维护链接和索引，并按原有制卡规范写入卡片。它不修改库内原有 skills、规则或 Obsidian 配置，尊重 `raw/` 只读要求，保留已有 Anki 卡片 ID。请求范围与库规则冲突时会说明具体冲突。

普通“保存笔记”仍写到当前学习目录，不自动转存 Wiki；只要求参考 Wiki 时仅查询。卡片由现有 Obsidian-to-Anki 插件同步，写入卡片文件不代表已经同步。该工作流不依赖终端操作，可由未来的 Obsidian 聊天界面复用；本项目尚未实现该界面。

## 课程计划与进度

课程与 `wiki-save` 共用上述 `wiki.json` 绑定。每门课一份状态文件 `wiki/courses/<course-slug>.md`；库里已有别的课程组织方式时沿用现状，不另建一套。不另建每日文件、数据库或网页状态。Markdown 可直接在 Obsidian 中阅读和编辑。

状态文件默认只读（0444，目录 0555）：Obsidian 和手工编辑都改不了、也删不掉，状态变更只走「解锁 → 编辑 → 上锁」流程，收课后重新生成 `wiki/courses.md` 看板并重新渲染 `wiki/courses.html` 网页看板。这是一层防误改，不是权限边界——AI 与用户是同一个系统账号，解锁后用户仍能手工修改，看板校验只能发现并报告不一致。

课程页包含教材及版本、当前位置、总目标里程碑、本周目标、今天的 2–3 项活动、下一步，以及收课时追加的简短作答记录。沿用原有实体页结构，新课程登记到索引，实际变更按库规则追加日志，不修改原有规则或 skills。

```text
为这本书创建 EPP 课程，绑定我提供的教材路径，保存今天的两项学习计划。
/skill:course 查看 EPP 的当前位置和下一步，先不要开始讲解。
继续 EPP，先做今天的第一项。
今天学到这里，更新 EPP 的进度。
```

选定课程后仍由 `teach` 教学。收课时，`course` 根据实际作答核对任务的原完成条件，满足才打勾并链接到证据记录。“提示后完成订正”可以完成订正任务，但不能完成“无提示独立证明”。活动完成数与独立理解分开，不输出掌握百分比；重复收课且无新内容时不重复记账。编辑前读取最新页面，保留用户手改。

有新内容的收课还会生成带日期的 PNG，展示本周与全程计划项的完成数、作答证据和下次起点，并嵌入本条学习记录。默认图片与课程页同目录，命名如 `ctm-2026-10-16-01.png`；已有可写附件目录时沿用。重复收课复用原图，不覆盖已有图片。截图可独立分享，Markdown 仍是原始记录；不持久保存额外 JSON 或数据库，唯一额外的网页文件是可从 Markdown 随时重建的只读看板 `wiki/courses.html`。

截图由技能内的 `render-snapshot.mjs` 使用本机 Chrome/Chromium 生成，不新增 npm 依赖。可通过 `CHROME_PATH` 指定浏览器可执行文件。截图失败会明确报告，已保存的进度不丢失；不会自动安装浏览器。也可以要求“依据现有计划生成截图演示，不修改进度”。

### 课程看板与只读展示

`wiki/courses.md` 由技能内的 `course-state.mjs` 从各课程状态文件生成，一屏列出所有课程、当前周、本周活动与总目标进度、上次记录和下次起点，可直接在 Obsidian 里阅读。它是生成物，不手工编辑；要更新时改状态源再重新生成。

`wiki/courses.html` 是同一份状态的网页版，由技能内的 `render-board.mjs` 渲染：单个自包含文件，不依赖服务器、CDN 或 npm 包，可离线用 `file://` 打开，随亮/暗色主题自动配色。页面按标准计划输出排列——下次起点、本周、今日、总目标、完整计划、学习记录，并显示本周/总目标的完成数、生成时间与只读锁校验结果。页面里没有输入框、按钮或任何编辑入口，也没有脚本；数字来自 Markdown，不在这里修改。

```sh
# 状态变更后，两个看板一起刷新（前者生成 Markdown，后者渲染网页）
node "<技能目录>/course-state.mjs" dashboard "<Wiki 路径>/wiki/courses" "<Wiki 路径>/wiki/courses.md"
node "<技能目录>/render-board.mjs" "<Wiki 路径>/wiki/courses" "<Wiki 路径>/wiki/courses.html"
```

标准计划输出的段落顺序与打勾规则写在 `skills/course/PLAN-STANDARD.md`，以 `wiki/courses/mech-interp.md` 为例。网页看板把该文件作为唯一状态源；删掉 `wiki/courses.html` 不影响任何数据，重新渲染即可。

只看进度不必写任何文件：

```text
我现在在学什么？
显示课程看板。
打开网页看板。
课程状态有没有被人改过？
```

这类请求由只读的 `course-board` 技能回答：展示同一份 Markdown，并用 `course-state.mjs verify` 校验只读锁、状态文件标记和看板一致性；要看网页版就给出 `wiki/courses.html` 路径和 `open` 命令。它不写文件，也不提供人工修改入口；要打勾、抵消、收课、出图或重新生成看板时，说明这属于 `course` 的写入流程。

Xuegen 的默认教学和会话存储不依赖 Wiki。Wiki 只是按需启用的课程与知识整理存储；无需升级 Wiki 项目、修改其规则或安装插件。已有库外计划不会自动迁移；截图流程也可依据既有计划生成图片。

只查询或预览时不写文件。新会话按课程名称或路径恢复状态；多门课程不按最近修改时间自动切换。没有选课程的自由聊天不自动建立进度档案，课程收课也不自动制卡。

需要明确说“今天学到这里”或“更新进度”来触发收课。直接关闭终端不会自动保存课程进度。这是模型依据 skill 执行的文件工作流，不是强制打勾校验器；本项目尚未实现 Obsidian 聊天插件。

## 增加能力

新建 `skills/<技能名>/SKILL.md`，使用标准 frontmatter 声明 `name` 和 `description`。下次启动时会发现该 skill，模型按需读取，也可通过 `/skill:<技能名>` 调用。新增目录无需修改启动器。

只有能力确实需要工具或交互界面时才增加扩展。可先用 `xuegen -e /absolute/path/to/extension.ts` 显式加载；确认有效后，再在启动器中加入明确的加载路径。自动扩展发现默认关闭，所以仅运行底层 `install` 命令不会自动启用扩展。

### 论文与网页阅读

Xuegen 默认启用原生 MCP 接入。安装 [uv](https://docs.astral.sh/uv/) 后，可把以下两个服务及其 Python 依赖安装到个人目录的 `mcp-tools/` 中。`tools/` 是运行时保留的旧版自定义工具目录，用它存放 Python 环境会触发迁移警告。

```bash
export XUEGEN_HOME="${XUEGEN_HOME:-$HOME/.xuegen}"
UV_TOOL_DIR="$XUEGEN_HOME/mcp-tools" UV_TOOL_BIN_DIR="$XUEGEN_HOME/bin" \
  uv tool install --python 3.11 'arxiv-mcp-server[pdf]==0.8.2'
UV_TOOL_DIR="$XUEGEN_HOME/mcp-tools" UV_TOOL_BIN_DIR="$XUEGEN_HOME/bin" \
  uv tool install --python 3.11 mcp-server-fetch==2026.10.10

xuegen mcp add arxiv --exposure deferred -- \
  "$XUEGEN_HOME/bin/arxiv-mcp-server" --storage-path "$XUEGEN_HOME/papers"
xuegen mcp add fetch --exposure direct -- "$XUEGEN_HOME/bin/mcp-server-fetch"
xuegen mcp list
```

- [arxiv-mcp-server](https://github.com/blazickjp/arxiv-mcp-server)：检索、下载论文，按章节阅读 Markdown 和作者的 LaTeX，导出引用。`[pdf]` 提供 PDF 转换；这是 PyPI 包。未安装 `[pro]` 时，语义索引不可用，可在 `mcp.json` 的 `arxiv.toolExposure` 中将 `semantic_search` 和 `reindex` 设为 `"hidden"`。
- [Fetch MCP](https://github.com/modelcontextprotocol/servers/tree/main/src/fetch)：按 URL 读取官方文档及其他公开网页，可分段获取长页面。

arXiv 工具通过 `tool_search` 按需发现，Fetch 直接提供给模型。基础功能无需额外 API key。配置保存在 `$XUEGEN_HOME/mcp.json`，不会写进应用源码；已有同名服务时，`mcp add` 会替换该条配置。

重新启动 Xuegen 后可直接提出阅读目标，例如：

```text
带我读论文 2610.18010v2 的附录 B 图 14。
先实际读取原文，再解释 infilling 的输入输出顺序。
区分作者明确陈述、推导和待查代码的问题，并用一个问题检查我的理解。
```

在现有会话中修改服务配置后，执行 `/reload`；用 `/mcp` 检查状态，或用 `xuegen --no-mcp` 临时关闭连接。

## 更新

在源码目录运行：

```bash
git pull --ff-only
npm ci --ignore-scripts
```

上游运行时固定为 `@earendil-works/pi-coding-agent@1.2.0`，所有实际依赖由 `package-lock.json` 锁定。升级运行时应修改依赖、验证启动和学习行为，再提交锁文件；不通过运行时自更新改变已发布版本。

## 来源与许可

学习流程参考 Eero Alvar 的视频 [How I Use AI to Learn Things](https://www.youtube.com/watch?v=kzcI5F4tGiU) 和配套仓库 [amosblomqvist/learn](https://github.com/amosblomqvist/learn)。教学内容为独立精简改写。

底层采用 [Pi](https://github.com/earendil-works/pi) 的公开入口与扩展 API，负责终端、会话、模型接入和基础工具。Xuegen 是建立在该运行时上的学习应用，没有复制或维护运行时分叉。

本仓库目前未授予开源许可（`UNLICENSED`），也不发布到 npm。上游依赖保留各自许可证。
