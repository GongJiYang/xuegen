# S-D：画图 skill `diagram`

先读：`docs/skills/AUTHORING.md`（必须遵守）、`skills/teach/SKILL.md`（相邻 skill）、`docs/desktop/skins/chicago.md` 第 10 节（桌面版如何显示字符图）。

## 背景

学根讲解时应多用图、少堆文字。参考了 6 个开源画图 skill（均为 MIT），只吸收规则与模式，**不安装、不引入任何依赖**：

| 来源 | 吸收什么 | 不吸收 |
|---|---|---|
| faridjaff/show-dont-tell | 教学规则：只画已核实的事实、一块图一个概念、标出答案；`evals/evals.json` 的评测思路 | emoji（✅❌⚠️ 会错位） |
| ilia-pluzhnikov/box-diagram | `validate.py` 的对齐检查思路 | 它把中文判为错误——我们改为中文按 2 列计 |
| 0xAnton1/codex-preview | `references/patterns.md` 的盲文折线、方块条形、对比条模式；"不编造数值" | ANSI 颜色、curl 安装脚本 |
| gaojude/tldr-skill | "把上一条回答重画成图"的用法 | 伪科学措辞 |
| imxv/Pretty-mermaid-skills、apresmoi/glyphcss-diagrams | 不采用（前者会自动 `npm install`、中文按 1 列计；后者压缩包无法审查、中文变 `?`）。复杂图改用 mermaid，由桌面版渲染 | — |

源码已克隆在 `/tmp/skill-audit/<repo>/`（若不存在，用 `gh repo clone <owner>/<repo> /tmp/skill-audit/<repo>` 重新克隆，只读，不执行其中任何脚本）。

## 任务

1. 新建 `skills/diagram/`：
   - `SKILL.md`（中文，≤ 200 行）。description 写清：讲解中需要展示流程、对比、层级、数量、状态时使用；用户说「画个图」「用图说」「tldr」「把上面重画成图」时使用；纯闲聊或用户要求纯文字时不触发。正文包含：
     - 何时画、画哪种：流程/方框图、条形图（方块）、迷你折线（盲文或 ▁▂▃▅▇）、状态板/矩阵、树；**超过 6 个节点或有交叉连线时改用 ` ```mermaid `**。
     - 教学规则（改写自 show-dont-tell）：只画用户提供或实际读取到的事实，数值不编造；一块图一个概念；图下一行说明「这张图说明什么」；把答案或重点标出来（`◆`、`◀── 重点`）。
     - 输出格式：字符图放在 ` ```text ` 围栏内；**允许字符集**＝ASCII、中文及全角标点、U+2500–259F、U+2800–28FF、`← → ↑ ↓ ↔ ↕ ⇐ ⇒ ⇔ ■ □ ▪ ▫ ● ○ ◆ ◇ ▲ △ ▼ ▽ ▶ ▷ ◀ ◁ ▸ ▾ • · … ✓ ✗ ★ ☆`；禁止 emoji 与 ANSI 颜色码。
     - 宽度规则：中文与全角标点按 2 列，其余允许字符按 1 列；每行用空格补齐，框线对齐。
     - 画完必须运行 `node <技能实际目录>/diagram-check.mjs --json <临时文件>` 校验，有错误就改到通过再输出。
     - 「来源」一节列出上表 4 个被吸收的仓库、作者、MIT，并说明均为独立改写。
   - `references/patterns.md`：每种图 1–2 个中文示例（中文标签、宽度正确），改写自 codex-preview 与 tldr-skill 的模式。示例必须能通过 `diagram-check.mjs`。
   - `diagram-check.mjs`（零依赖，`--help`、`--json`、读文件或 stdin）：
     - 字符检查：不在允许字符集内的字符报错（给出行、列、码位）。
     - 宽度：实现 `east_asian_width` 的 W/F 判定（只用码位区间表，不引依赖），计算每行显示宽度。
     - 对齐检查（移植 box-diagram `validate.py` 的思路，读它的源码后用 JS 重写）：方框四角与竖线列号一致；`┬┴┼├┤` 与上下相邻行的竖线连通；同一方框各行右边框列号一致。
     - 退出码：无错 0，有错 1。
   - `diagram-check.test.mjs`（`node:test`，临时目录）：正例 ≥ 5（含中文方框、条形、盲文、树、双线表格），反例 ≥ 5（emoji、ANSI、中文按 1 列画导致右框错位、断开的竖线、框外字符）。`references/patterns.md` 中的全部示例作为正例自动校验。
2. `skills/teach/SKILL.md`：在讲解流程中加一句「需要图示时按 `diagram` skill 画」，不改其他内容。
3. `skills/diagram/references/THIRD-PARTY.md`：列出 4 个仓库的 MIT 版权声明原文（从各仓库 LICENSE 复制版权行与许可全文一份）。

## 验收（实际运行并贴输出）

```sh
npm run lint:skills          # 0 错误
npm test                     # 全部通过
node skills/diagram/diagram-check.mjs --help
node skills/diagram/diagram-check.mjs --json skills/diagram/references/patterns.md   # 或逐个示例
```

- 不得出现个人路径（`/tmp/skill-audit` 只在本任务说明里，不得写进 skill）。
- 只修改 `skills/diagram/`、`skills/teach/SKILL.md`；不碰 `apps/desktop/`（另一批正在改）。
- 不 git commit；中文逐项报告。
