# S1：学习 skill 编写规范与检查

先读：根目录 `AGENTS.md`、`ARCHITECTURE.md`、`docs/platform/ROADMAP.md`（第 1 节与第 4 节）、`skills/` 下全部 `SKILL.md`。

## 交付

### 1. `docs/skills/AUTHORING.md`（中文）

学习 skill 的编写规范，至少包含：

- 目录结构：`skills/<name>/SKILL.md`，可选 `references/`（长参考资料）、脚本（零依赖 `.mjs`，同目录测试 `*.test.mjs`）。
- frontmatter：`name`（小写字母、数字、连字符，≤ 64 字符，与目录名一致，不得以连字符开头/结尾或连续连字符）、`description`（≤ 1024 字符，必须同时写明「做什么」和「何时使用」，写明「何时不触发」更佳）、可选 `disable-model-invocation`。依据 Pi 文档 `docs/skills.md`（本地路径：`apps/desktop/node_modules/@earendil-works/pi-coding-agent/docs/skills.md`）。
- 正文：≤ 500 行；职责边界（与哪些 skill 分工）；读写边界（哪些文件只读、哪些可写、写入流程）；事实分级要求；返回格式。
- 脚本：零依赖、可单独运行、支持 `--json`、写入用原子替换、测试在临时目录进行。
- **公开发布要求**：不得出现个人绝对路径（如 `/Users/<名字>/`）、个人用户名、凭据或凭据路径；个人库位置只能通过 `wiki.json` 等配置读取；不得假设特定个人库的目录名，除非该约定已写在库规则中并通过配置定位。
- 好/坏 description 示例各三条。

### 2. `scripts/lint-skills.mjs` + 根 `package.json` 脚本 `lint:skills`

零依赖 Node 脚本，检查 `skills/*/`：

- `SKILL.md` 存在；frontmatter 可解析；`name` 规则；`name` 与目录名一致；`description` 存在且 ≤ 1024 字符。
- 正文 ≤ 500 行。
- 全目录（含脚本）不含个人绝对路径：匹配 `/Users/`、`/home/`、`C:\\Users\\`（允许出现在明确标注的示例占位符 `<...>` 中）。
- 目录下每个 `.mjs` 脚本（测试文件除外）有同名 `.test.mjs`；没有时给出警告（不是错误）。
- 输出逐条问题，存在错误时退出码 1；支持 `--json`。

### 3. 测试

`scripts/lint-skills.test.mjs`（`node:test`），在临时目录构造合规与违规的 skill 覆盖每条规则。根 `package.json` 的 `test` 脚本同时覆盖 `scripts/` 与 `skills/` 下的测试。

### 4. 让现有 skill 通过

运行 `npm run lint:skills`。如现有 skill 有违规：**只修改违规点本身**（例如 description 超长就精简、正文出现个人路径就改为占位符），每处修改在报告中列出原文与修改后内容；不改动工作流语义。

## 验收（实际运行并贴输出）

```sh
npm test
npm run lint:skills
node bin/xuegen.mjs --version
git status --short
```

不碰 `apps/desktop/`（另一任务在并行修改），不 git commit。中文报告。
