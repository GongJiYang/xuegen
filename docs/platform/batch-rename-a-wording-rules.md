# batch-rename-a-wording-rules（DeepSeek，约 15 分钟）：词表与 lint 跟上新名字

## 背景
用户 11-13 批准改名，只改**给人看的字**：主项课→主课、带读→导读课、讲后读→课后读。界面（`apps/desktop/src/renderer/core/strings.ts`）已经改完。现在把用词闸门跟上：以后谁再在界面或技能的对用户文字里写旧词，`npm test` 里的 lint-wording 就报出来。

**数据格式不改**：课程页里的「讲后读 · pp.… · 日期」行、标记 `#讲后读-`、周期页周模板第 4 列「辅助」、课程字段 `aux` / `main` 这些都是数据，模型写、脚本读，照旧。这类出现在代码字符串里的旧词用 `allow` 白名单放行，并写清 why。

## 先写测试
在 `scripts/lint-wording.test.mjs` 加一条用例：用临时目录 + 临时规则文件，断言 `讲后读`、`带读`、`主项课` 写进 `apps/desktop/src/renderer/x.ts` 的字符串字面量会被报出，写在 allow 里的文件不报。照文件里已有用例的写法来。

## 要做
1. `scripts/wording-rules.json`：
   - 改已有条目的 `say`：`辅助` → 说「导读课」；`核心页` → 说「课后读 · pp.… · 日期」。
   - 新增 banned：`讲后读`（说「课后读」）、`带读`（说「导读课」）、`主项课`（说「主课」）。
   - 跑 `node scripts/lint-wording.mjs`，看新报出来的每一处：
     - 是数据格式（课程页行、`#讲后读-` 标记、发给模型的指令里要求按数据格式写的地方）→ 加 `allow`，`file` 精确到文件，`why` 一句话说明是哪种数据。
     - `apps/desktop/src/renderer/core/strings.ts` 里 `readingOptions.guided` 的「带读」是新课表单的读法选项（不是导读课），也加 allow，why 写清。
     - 是真给用户看的旧说法（脚本报错信息、界面文字）→ 直接改成新名字。拿不准就加 allow 并在报告里列出来，不要硬改。
2. `docs/desktop/SKIN-LEDGER.md` 第三节词表（大约 63–69 行）和 G7 行：把「讲后读 / 带读 / 主项课 / 主项」改成「课后读 / 导读课 / 主课」，「不要用」那一列补上三个旧词。第 1 条的 `say` 与词表要一致（脚本头注释说两处一起改）。历史记录（「- 2026-11-xx …」开头的变更日志行）**不改**。

## 不准动
- `skills/*/SKILL.md` 和 `references/*.md` 的正文（下一张单子做）；`*.test.*` 以外的 `apps/desktop` 代码只许改真给用户看的字符串。
- 不改数据格式、不改函数名 / 字段名。

## 验收（在仓库根目录跑，贴最后几行输出）
```
node scripts/lint-wording.mjs          # 0 处
npm test                               # 全过
cd apps/desktop && npx vitest run      # 全过
```
不要 commit、不要 push、不要启动 Electron。

## 报告
写在 `docs/platform/batch-rename-a-wording-rules.report.md`：改了哪些文件；新加的每条 allow（文件 · 词 · 为什么）；拿不准、加了 allow 等人看的地方。
