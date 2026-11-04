# 渐进阅读 · 任务 1：排程脚本

## 背景

新增 `skills/reading/` 技能（工作流见 `skills/reading/SKILL.md`，已写好，不要修改）。本任务只实现其中的确定性部分：`skills/reading/reading-queue.mjs` 及测试。

先读：根目录 `AGENTS.md`、`ARCHITECTURE.md`、`skills/reading/SKILL.md`、`skills/course/course-state.mjs`（风格参照）。Wiki 库规则中的 Reading Page 结构如下（脚本必须严格按此读写）：

```markdown
---
source: "[[raw/articles/2026-11-03-source-name]]"
priority: high | medium | low
status: queued | active | paused | done
due: YYYY-MM-DD
interval_days: 1
last_read: YYYY-MM-DD
position: "Section or paragraph where reading stopped"
---

# [Source Title]

## Reading Log
- YYYY-MM-DD: [What was read, outcome: next | postpone | done]

## Extracts
- [[extracts/source-slug/YYYY-MM-DD-extract-title]]
```

## 硬约束

- 零第三方依赖，Node ≥ 22.19，ES module，与 `course-state.mjs` 同风格（中文用法注释、`fail()` 报错退出码 1）。
- **绝不写入 `raw/`、`Clippings/`**，只读它们以取标题、校验存在。
- 只改 frontmatter 的已知字段与「Reading Log」段；保留正文其余内容（含用户手写和 Extracts 链接）原样。
- 写文件用「写临时文件 → rename」原子替换。
- 日期可注入：所有命令接受 `--today YYYY-MM-DD`（测试用），默认本地日期。
- 每个命令支持 `--json` 输出机器可读结果；默认输出简短中文。

## 命令

| 命令 | 行为 |
|---|---|
| `add <wiki> <原文相对路径> [--priority high\|medium\|low] [--slug s]` | 原文必须位于 `raw/` 或 `Clippings/` 下且存在。slug 由文件名生成：去扩展名、空白→`-`、ASCII 转小写、去掉 `/\:*?"<>\|#^[]`，保留中文。已存在同 slug 拒绝（提示用 `--slug`）。标题取原文第一个 `# ` 标题，没有则用文件名。初始：`status: queued`、`interval_days: 1`、`last_read` 为空、`position` 为空；`due` = 今天（high）或明天（medium/low）。创建 `wiki/reading/` 目录（如不存在）。向 `wiki/log.md` 追加 `## [日期] reading \| 标题` + `Added to queue (priority: x).` |
| `today <wiki> [--limit 3]` | 列出 `status ∈ {queued, active}` 且 `due ≤ 今天` 的条目；排序：优先级（high > medium > low）→ `due` 升序（越逾期越前）→ slug。默认 3 条。 |
| `review <wiki> <slug> --outcome next\|postpone\|done [--position "..."] [--note "..."]` | **next**：`status: active`，`last_read` = 今天，`interval_days` = max(1, round(interval × 系数))，系数 high 1.5 / medium 2 / low 3，`due` = 今天 + 新间隔，`--position` 有值则更新。**postpone**：间隔不变，`due` = 今天 + 间隔，`last_read` 不变。**done**：`status: done`，`last_read` = 今天，`due` 置空；向 `log.md` 追加 `Finished; extracts: N.`（N = Extracts 段链接数）。三种都在「Reading Log」追加 `- 日期: 结果[, 位置][, 备注]`。对 `done` 或 `paused` 条目执行 review 报错。 |
| `pause <wiki> <slug>` / `resume <wiki> <slug>` | pause：`status: paused`。resume：恢复为 `active`（有 `last_read`）或 `queued`，`due` = 今天。 |
| `stats <wiki>` | 各状态数量、今天到期数、逾期数、近 7 天 review 次数（从 Reading Log 统计）、`cards: pending` 的摘录数（扫描 `wiki/extracts/**/*.md` frontmatter）。 |
| `verify <wiki>` | 校验每个阅读页：frontmatter 字段齐全且取值合法、日期格式正确、`source` 指向的文件存在、Extracts 段链接的文件存在、`status: done` 时 `due` 为空。只报告不修改；有问题退出码 1。 |

## frontmatter 读写

- 手写最小解析器，只支持上面这些键的 `key: value` 单行形式（值可带双引号）；遇到未知键保留原样，遇到无法解析的结构报错，不猜测。
- 输出保持字段顺序固定（按上面模板顺序），空值写成 `""`。

## 测试

- 用 Node 内置 `node:test` + `node:assert`（不加依赖），文件 `skills/reading/reading-queue.test.mjs`。在根 `package.json` 增加 `"test": "node --test skills/"`（仅此一处改动）。
- 每个测试在 `os.tmpdir()` 下建临时库，不触碰真实 Wiki。
- 至少覆盖：slug 生成（中文、空格、非法字符）；add 的各优先级 due；重复 add 拒绝；原文不在 raw/Clippings 拒绝；today 排序与 limit；next 的间隔增长（三种优先级）；postpone；done 写 log 与清空 due；对 done 条目 review 报错；pause/resume；正文与未知键保留；verify 发现缺失原文与非法日期；stats 计数；原子写入后无残留临时文件。

## 验收（实际运行并贴输出）

```sh
npm test
node skills/reading/reading-queue.mjs --help
node bin/xuegen.mjs --version
git status --short
```

另在临时目录手动演示一遍：add → today → review next → review done → verify → stats，贴出输出。

不改动 `skills/reading/SKILL.md`、其他技能和 `apps/desktop/`；不 git commit。中文报告：做了什么、偏离之处与原因、未完成项。
