# R0：检索基线评测

先读：根目录 `AGENTS.md`、`docs/platform/ROADMAP.md`（第 2 节与第 4 节）、`skills/wiki-save/SKILL.md`（「入口与配置」「只读查询」）。

## 目标

建立一套可重复运行的检索评测，测出**当前方式**（`wiki/index.md` + 关键词搜索）的命中率，作为 R1/R2 的对比基线。本批不建任何索引，不调用嵌入接口。

## 库的位置与布局

库根目录从 `~/.xuegen/wiki.json` 的 `root` 读取（不要把这个路径写进仓库文件）。布局：

```text
<库根>/
├── raw/            原文（只读）
├── Clippings/      剪藏（只读）
└── wiki/
    ├── index.md
    ├── concepts/  sources/  synthesis/  entities/
    ├── flashcards/  courses/  reading/  extracts/
    └── prompts/
```

**整个库只读**：本批不得在库内创建、修改、删除任何文件。

## 交付

### 1. 评测集 `evals/retrieval/questions.jsonl`

每行一条：

```json
{"id": "q001", "question": "……", "expected": ["wiki/concepts/xxx/yyy.md"], "type": "definition|mechanism|relation|comparison|fact", "lang": "zh|en"}
```

- 不少于 50 条，覆盖：定义、机制、跨页关系、对比、具体事实；中文为主，至少 10 条英文或中英混合；至少 10 条「换一种说法提问」（问题中不出现页面标题的原词）。
- `expected` 用相对库根的路径；必须是实际存在的文件。每条至少 1 个期望页面。
- 问题从真实页面内容出发编写，答案必须能在期望页面中找到。
- **评测集包含个人笔记的主题信息，放在仓库的 `evals/retrieval/` 下但加入 `.gitignore`**，并在同目录放一个 `questions.example.jsonl`（3 条虚构示例）与 `README.md` 说明格式和生成方式，以便公开仓库复用格式而不泄露内容。

### 2. 评测脚本 `evals/retrieval/run.mjs`

零依赖。读取评测集，对每个问题调用一个「检索器」得到排序后的文件列表，计算 Recall@1、Recall@5、MRR，并按 `type`、`lang` 分组输出；支持 `--json`。检索器做成可插拔接口（输入问题与库根，返回路径数组），本批实现：

- `baseline`：模拟现有方式——先在 `wiki/index.md` 中按问题关键词匹配条目，再对 `wiki/` 下 Markdown 做关键词计数排序（中文按 2-3 字滑动片段匹配，英文按词），合并去重取前 10。

### 3. 测试 `evals/retrieval/run.test.mjs`

在临时目录构造小型假库与假评测集，验证指标计算正确（含 Recall@k、MRR 的边界情况）和 baseline 检索器的基本行为。

## 验收（实际运行并贴输出）

```sh
npm test
node evals/retrieval/run.mjs --retriever baseline
git status --short   # 不应出现 questions.jsonl
```

报告中给出基线指标表，并列出 baseline 失败最多的 5 类问题，分析原因（供 R1 改进）。不碰 `apps/desktop/`，不修改库内任何文件，不 git commit。中文报告。
