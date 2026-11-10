# batch-tidy4-steps-gen（Devin）：固定流程的步骤表只写一处——从 SKILL.md 生成，lint 查一致

整理批第 4 条（`docs/platform/TIDY-1110.md` §4，参考 Anthropic Skill 编写最佳实践：同一件事只留一个说法）。固定流程的编号步骤**只写在 SKILL.md 里**；`docs/platform/FEATURE-WIKI.md` 里对应的步骤表由脚本抽出来生成，`lint:skills` 检查两边一致。以后界面「开课 · 第 3/8 步」也读同一份 JSON。

## 硬约束
- 新建 `scripts/feature-steps.mjs`、`scripts/feature-steps.test.mjs`；改 `scripts/lint-skills.mjs`（加一条检查）、`package.json`（加一个 npm script）、`docs/platform/FEATURE-WIKI.md`（只在标记之间放生成内容）。不改任何 `SKILL.md` 的文字。不 commit/push、不加依赖。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent；不要 `git stash` / `reset` / `checkout` 动工作区。**

## 要做的
1. **要抽的流程**（写成脚本里的一张小表，路径 + 二级标题 + 流程名）：
   | 流程 id | 文件 | 标题 | 名字 |
   |---|---|---|---|
   | `course.open` | `skills/course/SKILL.md` | `## 开课顺序` | 开课 |
   | `course.close` | `skills/course/SKILL.md` | `## 收课：打勾与抵消` | 收课 |
   | `course.replan` | `skills/course/SKILL.md` | `## 改计划（总控会话）` | 改计划 |
   | `course.weekly` | `skills/course/references/weekly-check.md` | `# 周核实（整合日）` | 周核实 |
   | `cycle.brief` | `skills/cycle-plan/SKILL.md` | 每日简报那一节（打开文件找到编号 1–4 所在的标题，照实填） | 今日简报 |
2. **抽法**：取该标题到下一个同级或更高级标题之间、**行首**形如 `N. ` 的编号行（N 从 0 或 1 起、连续递增；子列表、缩进行不算）。每步取：编号、**步骤名**（行首加粗 `**…**` 的文字；没有加粗就取第一个中文句号/冒号/逗号之前、最多 16 个字）、所在行号。编号不连续或一个都抽不到就报错（中文，指出文件与标题）。
3. **输出**：
   - `node scripts/feature-steps.mjs --json` → `{ "course.open": { "name": "开课", "file": "...", "steps": [{ "n": 1, "title": "...", "line": 130 }, …] }, … }`。
   - `node scripts/feature-steps.mjs --markdown` → 每个流程一个 `#### 开课（skills/course/SKILL.md:129）` 小标题加编号列表 `N. 步骤名（:行号）`。
   - `node scripts/feature-steps.mjs --write` → 把 markdown 写进 `docs/platform/FEATURE-WIKI.md` 里 `<!-- feature-steps:start -->` 与 `<!-- feature-steps:end -->` 之间（标记不存在就在「## 1. course」标题前插入一节「## 固定流程步骤表（自动生成，勿手改）」并放标记）。
4. **lint**：`scripts/lint-skills.mjs` 加检查 `feature-steps`：生成的 markdown 与 FEATURE-WIKI 标记之间的内容不一致 → **错误**，提示「运行 npm run feature-steps 更新 FEATURE-WIKI」。FEATURE-WIKI 不存在就跳过。
5. `package.json` 加 `"feature-steps": "node scripts/feature-steps.mjs --write"`。跑一次，把生成内容写进 FEATURE-WIKI。
6. 测试：抽取（加粗名 / 无加粗截断 / 子列表忽略 / 编号断档报错 / 标题不存在报错）、markdown 与 json 输出、`--write` 幂等（跑两次文件不变）、lint 在不一致时报错。全部用临时文件，不改真实 SKILL.md。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node scripts/feature-steps.mjs --json | head -40 && npm run feature-steps && git diff --stat docs/platform/FEATURE-WIKI.md && npm test 2>&1 | grep -E '^# (pass|fail)' && npm run lint:skills 2>&1 | tail -2
```
## 结束报告（中文，必须输出）
5 个流程各抽到几步（贴 json 摘要）、测试数、lint 输出、偏离规格之处及原因。
