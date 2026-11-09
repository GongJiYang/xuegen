# 库的命名规则（2026-11-09 用户定：全英文；7 条细则用户 11-09「都按建议」）

由 `vault-lint`（待写）检查；不符合的名字学根不写、收课前报出来。准则见 `PRINCIPLES.md`，本文件只管「叫什么名字、放在哪」。

## 1. 总则

1. **目录名、文件名一律英文**：小写 ASCII 字母、数字、连字符 `-`；不用空格、下划线、大写、中文、全角符号。正则：`^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+)?$`。
2. **页面里面照旧用中文**：一级标题 `# …`、frontmatter 的 `title`、正文都可以是中文。Obsidian 的文件列表显示英文名，打开后看到中文标题。
3. **原料不改名**：`raw/` 下面**用户放进来的原始文件**保持原名（它们来自外界，准则第 1 条「原料不变」）。只有 `raw/` 的分区目录用英文。
4. **一个东西只有一个标识**（slug）：在一个地方定义，其它地方全部引用它，不另起缩写。

## 2. 数据根

```
~/xuegen-data/
├── vault/        ← 库（jj + git，私有远端 GongJiYang/xuegen-vault）
├── sessions/     ← 会话（~/.xuegen/sessions 指过来）
└── workspace/    ← agent 工作区（~/learning 指过来）
```

## 3. 库的结构

```
vault/
├── AGENTS.md  README.md
├── clippings/                  ← 网页剪藏（原 Clippings）
├── raw/                        ← 原料，只读
│   ├── books/<subject>/        ← 教材（原 raw/books 与 raw/学习路径 按科目归入；文件保持原名）
│   ├── library/                ← 原 raw/学习路径 中暂时归不进科目的部分（原样）
│   ├── papers/  articles/  notes/  assets/  plans/  materials/
└── wiki/
    ├── profile.md  subjects.md  index.md  log.md
    ├── subjects/<subject>.md           ← 科目：定义 subject slug 的地方
    ├── cycles/c1.md  route.md
    ├── courses/<course>.md             ← 课程页
    ├── courses/<course>/               ← 这门课的附属物：records/、snapshots/（截图）
    ├── shelf/<book>.md  index.md       ← 书房（原 书房/）
    ├── reading/<slug>.md               ← 文章、论文队列
    ├── calendar/
    ├── knowledge/                      ← 知识（原 知识/）
    │   ├── concepts/<subject>/[<topic>/]<nnn>-<name>.md
    │   ├── flashcards/<subject>/[<topic>/]<nnn>-<name>.md   ← 与对应概念页同路径同名
    │   ├── sources/<yyyy-mm-dd>-<slug>.md
    │   ├── entities/<subject>/<slug>.md
    │   ├── synthesis/<slug>.md         ← 不分子目录
    │   └── extracts/<source-slug>/<yyyy-mm-dd>-<slug>.md
    ├── prompts/
    └── _generated/                     ← 可重建的生成物：courses.md、courses.html、paradigms.html 等，不手改
```

## 4. 各类标识

| 东西 | 规则 | 例子 |
|---|---|---|
| subject（科目） | `subjects/<subject>.md` 的文件名就是标识；所有地方都用它 | `discrete-math`、`c-systems-programming` |
| course（课程） | **新建**课程用 `<subject>-<书或材料短名>`；已有的 8 门课保留原标识（会话与代码把它当课程 id） | `discrete-math-epp` |
| concepts / flashcards 目录 | 第一层就是 subject 标识，**不另起缩写**；一个科目里有几套各自成体系的内容时，再分一层主题目录（topic），编号在主题内各自连续 | `concepts/discrete-math/`、`concepts/ai-ml/deepinfer/`、`concepts/c-systems-programming/linking/` |
| 概念页文件 | `<三位编号>-<英文名>`，每页都有编号；编号 = 在所在科目（或主题）知识地图里的顺序，按 10 递增，插入时用中间数 | `010-variables-and-statements.md` |
| 来源页 | `<登记日期>-<英文短名>` | `2026-11-05-epp-discrete-mathematics.md` |
| 书房书页 | 书的短名 | `epp.md`、`ctm.md` |
| 收课截图 | `courses/<course>/snapshots/<yyyy-mm-dd>-<nn>.png` | |
| Anki 牌组 | `<科目中文名>::<课程或书短名>`（牌组名给人看，可以中文；由 subject 页的中文名生成） | `离散数学::Epp`、`书房::Epp` |

## 4.1 不开新科目的内容
零星内容（比如只有一两页的「效率」）放进最接近的科目下的主题目录（`software-engineering/productivity/`），等用户要系统学时再开新科目（`subjects.md`：用户要求时再开科目）。

## 4.2 空目录
不留空目录；搬空了就删。

## 5. 链接

- 一律写**从 `wiki/` 起的完整路径**，不靠 Obsidian 的后缀解析：`[[knowledge/concepts/discrete-math/010-variables-and-statements|变量与三类陈述]]`。
- 链接的显示文字（`|` 后面）用中文。

## 6. 迁移顺序（一次做完）

1. 代码先支持新名字（目录常量、脚本路径），并带上 `vault-lint` 与一次性改名脚本 `rename-vault.mjs`（按映射表改名并改写全部链接，可试运行）。
2. Claude 生成「旧名 → 新名」映射表给用户过目。
3. 发新版；用户退出学根与 Obsidian；运行改名脚本（jj 一个提交，可 `jj undo`）；装新版；Obsidian 打开 `~/xuegen-data/vault`。
4. 旧位置留链接（`~/学根 → ~/xuegen-data` 等），旧会话照常能用。
