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
| 查看帮助 | `xuegen --help` |
| 查看底层运行时选项 | `xuegen --runtime-help` |

学习模式默认开启，不需要先输入 `/skill:teach`。你可以要求直接讲解、减少提问或完成具体任务。

## 当前能力与边界

- 一个教学 skill：诊断 → 计划 → 推导 → 检验 → 收束与复习。
- 独立的配置和会话目录；保留原生会话恢复、模型选择与文件工具。
- 独立命令、学习身份和终端标题。底层仍使用上游终端界面，部分帮助、状态和错误消息会保留上游名称。
- 不确定的内容必须标明；来源和实验结果必须来自实际读取或执行。
- 当前没有自动联网研究、复习调度、子代理或图形生成。遇到资料缺口时需使用已有工具核实，或由用户提供材料。
- 第一性原理指从明确的定义、假设和已知事实推导；不把经验规律或近似强行称为普遍真理。

## 数据与配置

默认个人目录是 `~/.xuegen/`，可通过 `XUEGEN_HOME` 指定另一个绝对路径。首次启动只创建缺失的默认设置，不覆盖已有设置，不读取或复制其他 agent 的账号。

| 位置 | 内容 | 是否进入仓库 |
| --- | --- | --- |
| `bin/xuegen.mjs` | 启动器与终端身份 | 是 |
| `instructions.md` | 学习 agent 的默认职责 | 是 |
| `skills/` | 可版本管理的学习能力 | 是 |
| `defaults/settings.json` | 不含账号和模型绑定的初始设置 | 是 |
| `package.json`、`package-lock.json` | 精确依赖与安装锁文件 | 是 |
| `~/.xuegen/auth.json` | 个人登录凭据 | 否 |
| `~/.xuegen/settings.json` | 个人模型与界面设置 | 否 |
| `~/.xuegen/sessions/` | 学习会话 | 否 |
| 启动命令时所在的学习目录 | 用户要求保存的笔记或实验 | 否，除非自行提交 |

默认关闭共享 skills、扩展、提示模板、主题和项目指令的自动发现，并忽略项目级设置。只显式加载项目自带的 skills 和学习指令。这个边界隔离配置与会话，不是文件系统沙箱；模型仍可使用当前用户权限执行文件操作和命令。

需要特定项目指令时显式传入：

```bash
xuegen --append-system-prompt ./AGENTS.md
```

## 增加能力

新建 `skills/<技能名>/SKILL.md`，使用标准 frontmatter 声明 `name` 和 `description`。下次启动时会发现该 skill，模型按需读取，也可通过 `/skill:<技能名>` 调用。新增目录无需修改启动器。

只有能力确实需要工具或交互界面时才增加扩展。可先用 `xuegen -e /absolute/path/to/extension.ts` 显式加载；确认有效后，再在启动器中加入明确的加载路径。自动扩展发现默认关闭，所以仅运行底层 `install` 命令不会自动启用扩展。

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
