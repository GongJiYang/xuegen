# batch-check-1-wording-lint（DeepSeek，约 15–20 分钟，先写测试）：用词闸门

背景：`docs/platform/CHECK-PROCESS-1111.md` 第 1 项。用户可见文字里不许出现词表「不要用」的词（`docs/desktop/SKIN-LEDGER.md` 第三节）。现在只靠人看，11-11 漏了好几处。做一个机器检查，接进根 `npm test`。

约束：新建文件 + 改根 `package.json` 的 `test` 脚本（把新测试纳入，已有的 glob `scripts/**/*.test.mjs` 若已覆盖就不用改）；不改产品代码（检查出的问题**不修**，列进报告）；不加依赖；不 commit / push；**自己做完，不要调用 `pi`、`devin` 或别的 agent**。

## 1. 规则文件 `scripts/wording-rules.json`
```json
{
  "banned": [
    { "word": "辅助", "say": "带读" },
    { "word": "核心页", "say": "讲后读 · pp.… · 日期" },
    { "word": "教材通读", "say": "书房" },
    { "word": "通读", "say": "自读" },
    { "word": "深度日", "say": "主攻日" },
    { "word": "由 Obsidian 同步", "say": "直接同步到 Anki" },
    { "word": "留到下个周期", "say": "（不设完结，往后顺延）" },
    { "word": "没刷", "say": "（Anki 只提醒张数）" },
    { "word": "积压", "say": "（Anki 只提醒张数）" },
    { "word": "补刷", "say": "（Anki 只提醒张数）" },
    { "word": "书架", "say": "书房" },
    { "word": "回到这门课", "say": "回到这节课" },
    { "word": "继续学习", "say": "开课 / 回到这节课" },
    { "word": "摘录卡", "say": "摘几句" }
  ],
  "allow": []
}
```
`allow` 每项 `{ "file": "<仓库相对路径>", "word": "…", "why": "…" }`，表示这个文件里这个词是内部用、不对用户显示。

## 2. 检查脚本 `scripts/lint-wording.mjs`
- 用法：`node scripts/lint-wording.mjs [--json]`；有问题退出码 1。导出纯函数 `findBanned(text, rules)`（返回 `[{ line, word, say }]`）供测试。
- 扫三类地方（只扫**用户看得见**的文字）：
  1. `apps/desktop/src/renderer/**/*.{ts,tsx}`（跳过 `*.test.*`）：字符串字面量与模板字面量里的文字；**跳过注释**（`//`、`/* */`、JSX 注释）。
  2. `skills/**/*.mjs`（跳过 `*.test.mjs`）：字符串与模板字面量（跳过注释）。脚本里给模型看的错误信息也算——它们常被原样转述给用户。
  3. `skills/*/SKILL.md` 与 `skills/*/references/*.md`：只扫 ```` ```text ```` 代码块里的行，以及「告诉用户」「对用户说」「回复」「说一句」所在行里「」引号中的文字。
- 输出：`文件:行  「词」→ 用「say」`，按文件分组；最后一行 `lint-wording: N 处`。
- 字面量提取不必做完整解析，用一个小状态机处理 `'…'`、`"…"`、`` `…` ``（含 `${}` 嵌套）和注释即可；写清楚已知局限。

## 3. 测试 `scripts/lint-wording.test.mjs`
- `findBanned`：命中、不命中、同一行多个词、`深度`（不在表里）不命中但 `深度日` 命中。
- 字面量提取：注释里的词不算；模板字面量 `${}` 里外都能正确处理；JSX 文本节点（`<p>辅助</p>`）算用户可见，要命中。
- `allow` 生效。
- 对真实仓库跑一次：**不断言为 0**，只断言脚本能跑完并输出 `lint-wording:` 行（真实结果写进报告）。

## 4. 接进 `npm test`
确认根 `npm test` 会跑到 `scripts/lint-wording.test.mjs`。再在根 `package.json` 加 `"lint:wording": "node scripts/lint-wording.mjs"`。**先不把 lint:wording 本身挂进 npm test**（等现有问题修完、allow 补齐后由 Claude 挂上）。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test scripts/lint-wording.test.mjs 2>&1 | tail -4 && node scripts/lint-wording.mjs | tail -40; npm test 2>&1 | grep -E "^# (tests|pass|fail)"
```

## 结束报告（中文）
脚本怎么提取字面量、已知局限；真实仓库扫出的全部结果（按文件）；你认为哪些是内部用、建议进 `allow` 的（附理由，但**不要自己加进 allow**）。

## 附加（小）：一处取今天
`apps/desktop/src/renderer/skins/bear/progress-panel.tsx` 约 51 行 `const now = new Date()` 改成用 `renderer/core/today.ts` 的 `now()`（XUEGEN_TODAY 统一入口，见 `apps/desktop/AGENTS.md` §12）；并把这个文件从 `renderer/core/today.guard.test.ts` 的跳过名单里去掉（名单里另外 6 个文件里剩下的 `new Date()` 都不是「今天」语义，若守护测试因此变红，就把那几处具体行加白名单并写明原因）。
