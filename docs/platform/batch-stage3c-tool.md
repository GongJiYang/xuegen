# batch-stage3c-tool（Devin 写基础代码）：专用工具 `course_close` + 课程会话写权限收紧

设计：`docs/platform/STAGE3-DESIGN.md`（「与 4a 的关系」一节）、`docs/platform/STAGE4A-DESIGN.md` 第 1 点。脚本 `skills/course/course-close.mjs` 的命令行接口以 `docs/archive/platform/batch-stage3a-close.md` 第 2 节为准（**另一个审核正在改这个脚本，你不要改它，也不要改它的测试和 `references/close.md`**）。不做界面。

## 硬约束（压缩后也要记得）

- 先读 `apps/desktop/AGENTS.md`、`apps/desktop/src/agent/README.md`、`apps/desktop/src/agent/guard/README.md`、Pi 文档 `node_modules/@earendil-works/pi-coding-agent/docs/extensions.md` 的「Tools」一节与 `examples/extensions/hello.ts`。
- **Pi 的值导入保持动态**（见 `agent/session.ts` 文件头）：工具文件只能 `import type`，`Type`/`defineTool` 在工厂函数里经 `await import(...)` 取，或由 `session.ts` 传入。
- 只改/新建：`apps/desktop/src/agent/tools/course-close-tool.ts`（新）、`apps/desktop/src/agent/session.ts`（注册）、`apps/desktop/src/agent/guard/{roles,extension,vault-paths}.ts`、`apps/desktop/src/agent/guard/README.md`、`apps/desktop/src/agent/README.md`。现有测试必须全部通过（因收紧而失效的旧断言按新规则更新，报告里列出）；**不写新测试**（DeepSeek 补）。
- 不读写真实 `~/.xuegen/`、真实库、真实工作区；不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`/`@ts-ignore`。单文件 ≤ 300 行、单函数 ≤ 50 行。

## 1. 工具 `course_close`（`agent/tools/course-close-tool.ts`）

1.1 导出 `createCourseCloseExtension(options: { repo: string; home: string; cwd: string }): ExtensionFactory`，工厂里 `pi.registerTool(...)` 注册一个工具：
- `name: "course_close"`，`label: "收课"`，`description`（中文，给模型看）：「收课事务：stage 开始暂存 → 在暂存目录里改文件 → check 校验 → commit 一次提交；add 把已有页复制进暂存；abort 放弃；undo 撤销最近一次收课。课程页和概念页只能经这个工具写。」
- `parameters`：`action`（`"stage"|"add"|"check"|"commit"|"abort"|"undo"` 的字面量联合）、`slug?: string`、`staging?: string`、`path?: string`。
1.2 `execute`：
- 库根：用 `guard/facts.ts` 的 `readVaultRoot(home)`（已存在）；工作区：`options.cwd`。
- 按 action 拼参数（全部带 `--json`）：stage → `stage <vault> <slug> --workspace <cwd>`；add → `add <staging> <path>`；check/commit → `<action> <staging>`；abort → `abort <staging>`；undo → `undo <vault> <slug> --workspace <cwd>`。缺必需参数时直接 `throw new Error("<中文：缺少 slug/staging/path>")`。
- 用 `node:child_process` 的 `execFile(process.execPath, [<repo>/skills/course/course-close.mjs, ...args], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, timeout: 120_000, maxBuffer: 4 MB })`（照 `main/data/scripts.ts` 的做法，核对它怎么在 Electron 里跑 node 脚本，用同一种方式）。
- 退出码 0：返回 `{ content: [{ type: "text", text: stdout }], details: undefined }`；退出码非 0：返回 `{ content: [{ type: "text", text: stdout || stderr }], details: undefined, isError: true }`（`check` 不通过时 stdout 里有 problems，要让模型看到）。
1.3 `session.ts`：`extensionFactories` 里在 `guard` **之后**、`tool-search` 之前加 `{ name: "course-close", factory: createCourseCloseExtension({ repo: repoRoot, home, cwd }) }`（`repoRoot` 从 `environment.ts` 取，照现有写法）。

## 2. guard：`course_close` 按角色放行

2.1 `extension.ts`：`GUARDED_TOOLS` 加 `"course_close"`（否则它会被当成「不在清单里的工具」直接放行）。
2.2 `roles.ts` 的 `decide` 加一个分支 `if (tool === "course_close") return decideCourseClose(role, input, roots, canon);`，新函数规则：
- 只有 `course` 角色可用；其它角色拒：「<角色>不能收课；收课请在那门课的会话里做。」
- 带 `slug` 的（stage、undo）：`slug` 必须等于 `role.slug`，否则拒：「课程会话（<slug>）只能收自己这门课。」
- 带 `staging` 的（add、check、commit、abort）：`canon(staging)` 必须在 `canon(<workspace>/.close)` 之内，且最后一段以 `<role.slug>-` 开头，否则拒：「暂存目录不属于这门课。」
- `add` 的 `path` 不在这里判（脚本的 `isOwned` 判），但必须是相对路径、不含 `..`，否则拒。
2.3 **收紧课程会话的直接写**（`roles.ts` `writeAllowed` 的 `case "course"`）：去掉 `withinAny(target, rules.knowledge)`、`<courses>/<slug>.md`、`<courses>/<slug>/`、`<slug>-*.png` 四项；保留 `withinAny(target, rules.subjects)`。在 `writeDenyReason` 里加一条（放在现有课程页那条之前）：课程会话写库里的课程页或概念页 → 「课程页和概念页只能经 course_close 收课写入：先 stage，在暂存目录里改，再 check、commit。」
  - 「任何会话都能写」的那组（书房、阅读页、摘录、卡片、来源、分析、实体、log、index）**不变**；自由会话写知识页**不变**；总控**不变**。
  - 暂存目录在工作区里，工作区本来就可写，不用加规则。
2.4 `guard/README.md`：角色表与「课程会话」一节按上面改；加一节「专用工具」说明 `course_close` 的规则。

## 3. 文档
`agent/README.md` 加一段「专用工具」：`course_close` 在 agent 进程里调用 `course-close.mjs`，不经 bash；以后 `calendar_write`、`cycle_write` 照同一模式加（阶段 4a）。

## 验收命令（贴出最后几行）
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -4 && npm run build 2>&1 | tail -2 && npm run smoke 2>&1 | tail -3
```
（smoke 的 extensions 那一行里要出现 `<inline:course-close>`。）

## 结束报告（中文）
每节是否照做；偏离之处及原因；更新了哪些旧断言；未完成项。
