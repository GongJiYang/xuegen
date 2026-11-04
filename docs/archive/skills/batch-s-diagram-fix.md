# S-D 修复：diagram-check 对齐算法

Claude 用真实场景复验 `skills/diagram/diagram-check.mjs`，发现对齐检查按「整行宽度」分组，导致误报和漏报。样例在 `docs/skills/fixtures-s-diagram/`（文件名 `good-*`/`*-ok` 应通过，其余应报错）：

| 样例 | 现状 | 应为 |
|---|---|---|
| `good-stacked.txt`（方框图 + 双线表 + 条形 + 树 + 盲文 上下相邻） | 误报「方框宽度不一致」「竖线不连通」 | 通过 |
| `broken.txt`（方框中间一行缺右框） | 漏报，通过 | 报错，指出 `┐` 下方断开 |
| `corner.txt`（第二个框底边短一格） | 报错但原因错（与上一个框混为一组） | 报错，指出 `┘` 上方没有竖线 |
| `cjk1col.txt`、`cjk-narrow.txt`（中文按 1 列画） | 报错 | 报错，指出具体断开的角/竖线 |
| `drift.txt`（无框两栏，第 2、3 行右栏错位 1–2 列） | 漏报 | 报错「疑似列错位」 |
| `columns-ok.txt` | — | 通过 |
| `emoji.txt`、`ansi.txt` | 报错 | 保持 |

## 改法

1. **删除「方框宽度一致」的整行分组规则**，改为按笔画连通检查：
   - 建一张码位 → 四向笔画表（上/下/左/右），覆盖 U+2500–257F（按 Unicode 名称中的 UP/DOWN/LEFT/RIGHT/HORIZONTAL/VERTICAL 推出，LIGHT/HEAVY/DOUBLE/ARC 都算有笔画；生成后作为常量写进脚本，不在运行时依赖名称库）。
   - **角与交叉点**（有笔画且不是纯直线 `─ │ ━ ┃ ═ ║` 及虚线）：每个笔画方向上的相邻格必须有相反方向的笔画；箭头 `▶ ▸ → ◀ ← ▼ ▾ ↓ ▲ ↑` 视为可接的端点。
   - **纯直线**两端可以开放（树的 `└─ 文字`、条形图的轴线、分隔线）。
   - 列号按显示宽度计算（中文 2 列）。报错写明行、列、字符、哪个方向断开。
2. **列错位检查**（无框多栏）：同一代码块内，若 ≥ 2 行在「≥ 2 个空格之后」开始的文字块起始列彼此相差 1–2 列，报「疑似列错位」，列出各行起始列。差 0 或 ≥ 3 不报。
3. 测试：`docs/skills/fixtures-s-diagram/` 全部样例拷进测试（内联为字符串，测试不得依赖 docs 路径），断言上表结果；原有测试保留，期望随新规则调整。
4. `references/patterns.md`：「二选一对比」示例右栏错位 1 列，修正；所有示例重新通过。
5. `SKILL.md`：删除对 `docs/desktop/skins/chicago.md` 的引用（公开 skill 不引用宿主内部文档），改为「由宿主渲染」；校验项描述随新规则更新。

## 验收（实际运行并贴输出）

```sh
npm run lint:skills && npm test
for f in docs/skills/fixtures-s-diagram/*.txt; do echo "== $f"; node skills/diagram/diagram-check.mjs "$f"; done
```

只修改 `skills/diagram/`；不碰 `apps/desktop/`；不 git commit；中文逐项报告。
