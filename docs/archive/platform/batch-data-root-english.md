# 任务单：数据根接线脚本改认英文子目录（DeepSeek，约 10 分钟）

背景：2026-11-10 数据根已从 `~/学根/{库,会话,工作区}` 改名为 `~/xuegen-data/{vault,sessions,workspace}`（RENAME-DAY 第 5 步）。`bin/xuegen-data-root.mjs` 还只认中文子目录，`docs/platform/NEW-MACHINE.md` 第 3 步照新名字写了，脚本得跟上。

只改两个文件：`bin/xuegen-data-root.mjs`、`scripts/xuegen-data-root.test.mjs`。不碰真实 `~/.xuegen`、`~/learning`、`~/xuegen-data`（测试全部用 `--home`/`--learning` 指到临时目录，现有测试已经这样做）。

## 先写测试（`scripts/xuegen-data-root.test.mjs`）

1. `makeCase()` 默认改建英文子目录 `vault/ sessions/ workspace/`；现有 9 条测试的断言跟着改成英文目标（`<数据根>/sessions`、`<数据根>/workspace`、`wiki.json` 的 `root` = `<数据根>/vault`）。缺子目录的两条拒绝测试改成缺 `vault/`、缺 `workspace/`，并断言 stderr 里出现英文目录名。
2. 新增 1 条：数据根下**同时**有英文目录和指向它们的中文链接（`库 → vault`、`会话 → sessions`、`工作区 → workspace`，就是现在真实机器的样子）→ 接线结果指向英文路径（`readlink` 等于 `<数据根>/sessions` 等，不是中文链接）。
3. 新增 1 条：只有旧的中文子目录 `库/ 会话/ 工作区/`（没有英文的）→ exit 1，stderr 提示「旧布局」并给出改名做法（说出 `vault/ sessions/ workspace/` 三个名字）；不建任何链接、不写 `wiki.json`。
4. 新增 1 条：机器上已有 `<home>/sessions` 指向**旧路径**，且旧路径经链接解析后与新目标是同一个真实目录（模拟 `~/.xuegen/sessions → ~/学根/会话`，`~/学根 → ~/xuegen-data`）→ 视为已就位、跳过（现有 `planLink` 按 realpath 比较，这条只是锁住这个行为）。

先跑一次，确认新增/改动的测试失败（第 4 条可能直接通过，正常）。

## 再改脚本（`bin/xuegen-data-root.mjs`）

1. 子目录名改为常量 `const LAYOUT = { vault: "vault", sessions: "sessions", workspace: "workspace" };`，所有 `join(dataRoot, "库"|"会话"|"工作区")` 改用它。
2. 子目录检查：三个英文目录缺任何一个 → 若三个中文目录都存在且不是链接，报旧布局（测试 3 的提示）；否则报 `数据根缺少 <英文名>/：<路径>（不新建库，先按换电脑清单拷数据）`。
3. 文件头注释、`usage()` 文字里的 `库/ 会话/ 工作区` 改成 `vault/ sessions/ workspace/`。
4. 其余行为（预检后才动手、不覆盖、`--dry-run`、原子写 `wiki.json`）不变。

## 验收

- `node --test scripts/xuegen-data-root.test.mjs` 全过（原 9 条 + 新 3 条 = 12 条）。
- `node bin/xuegen-data-root.mjs --help` 显示英文目录名。
- 不要对真实 home 运行脚本（连 `--dry-run` 也不要）。
- 报告：改了哪些行、测试条数、跑测输出最后几行。不提交。
