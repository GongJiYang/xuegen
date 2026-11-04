# 批次 R-1：结构整改（审计 2026-11-04）

先读：`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。按下面顺序做，每做完一项跑一次 `apps/desktop` 的 `npm test`，保持全绿再做下一项。**只做重构，不改任何用户可见行为、文案、样式。**

## 1. 会话文件路径守卫（`apps/desktop/src/agent/session.ts` 的 `isOwnSessionFile`）
- 改为按真实路径判断：`realpathSync` 解析 `<home>/sessions` 与目标文件后再比较前缀（防止符号链接逃逸）；文件不存在、不是 `.jsonl`、解析失败都返回 false。
- 把它导出（或移到独立小模块 `agent/session-file.ts`），写测试 `session-file.test.ts`：合法文件、目录外文件、`../` 穿越、指向目录外的符号链接、非 `.jsonl`、不存在的文件。测试用 `os.tmpdir()` 下的临时目录。

## 2. 拆分 `apps/desktop/src/renderer/App.tsx`（当前 627 行）
抽出 3 个 hook 到 `renderer/core/`（依赖只能是 core / shared，不能 import 任何皮肤实现）：
- `core/board/use-course-sessions.ts`：`activeCourse` 推导、`handleStartSession`、`handleNewCourse`（含 `pendingNewCourse` 与认领新 slug 的 effect）、`handleEditPlan`、`handleNewSession`、`handleContinueSession`。入参是 `controller`、`settings`、`update`、`courses`；返回这些处理函数与 `activeCourse`。注意 `style` 依赖 `activeCourse`、`controller` 依赖 `style` 的循环：保持现有的求值顺序（可以让 hook 只接收 controller，`activeCourse` 推导单独拆成纯函数 `resolveActiveCourse(chosen, courseSessions, openSessionFile)` 放在 hook 文件中并测试）。
- `core/board/use-reload-on-answer.ts`：streaming true→false 时 reload 各面板。
- `core/settings/use-body-scale-shortcuts.ts`：⌘/Ctrl +/=/-/0 键盘监听。
- 行为必须与现状完全一致；现有 lint 规则（effect 内不同步 setState 等）照旧遵守。目标：`App.tsx` 降到 450 行以内，只做组装。

## 3. 用 eslint 固化依赖方向（`apps/desktop/eslint.config.mjs`）
用 `no-restricted-imports`（patterns）：
- `src/renderer/core/**`：禁止 import `**/skins/bare/**`、`**/skins/chicago/**`、`**/skins/registry*`（允许 `skins/contract`，它是契约）。
- `src/renderer/skins/bare/**` 禁止 import `**/skins/chicago/**`；`skins/chicago/**` 禁止 import `**/skins/bare/**`。
- `src/renderer/**` 禁止 import `**/main/**`、`**/agent/**`；`src/main/**` 与 `src/agent/**` 禁止 import `**/renderer/**`。
- 跑 `npm run lint` 确认现有代码 0 违规；若有违规，改代码而不是放宽规则（并在结束报告里列出）。

## 4. 补测试
- `useChat.openSession`：发出 `open-session`，收到同 `requestId` 的 `session-opened` 后 resolve 为该文件；收到别的 requestId 不 resolve。参考现有 hook 测试的 mock 方式（`src/test/setup.ts`、`window.xuegen` mock）。
- 第 2 项抽出的纯函数与 hook 各至少覆盖主路径。

## 5. 文档归档（只移动，不改内容）
- 新建 `docs/archive/`，用 `git mv` 移入一次性任务单：`docs/desktop/batch-*.md`、`docs/desktop/bugs-round*.md`、`docs/desktop/HANDOFF-*.md` → `docs/archive/desktop/`；`docs/reading/task-*.md` → `docs/archive/reading/`；`docs/skills/batch-*.md` 与 `docs/skills/fixtures-s-diagram/` → `docs/archive/skills/`；`docs/platform/R0-*.md`、`S1-*.md` → `docs/archive/platform/`。
- 本文件 `docs/desktop/batch-refactor-1.md` 最后也移到 `docs/archive/desktop/`。
- 全仓 grep 旧路径，更新所有引用（AGENTS.md、PROGRESS.md、README、各 skill、`scripts/lint-skills.mjs`、测试里的 fixture 路径等）。确认根目录 `npm test` 与 `npm run lint:skills` 仍通过。
- 新建 `docs/README.md`：一张表列出长期文档（路径 + 一句话用途），并说明「一次性任务单放 `docs/archive/`」。

## 6. CI
新建 `.github/workflows/ci.yml`：push 与 pull_request 触发；Node 22；两个 job——根目录（`npm ci`、`npm test`、`npm run lint:skills`）与 `apps/desktop`（`npm ci`、`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`），macOS 或 ubuntu 均可（选 ubuntu，若 build 需要 electron 二进制可设 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`，前提是 build 不依赖它）。

## 7. CHANGELOG 与依赖约定
- `CHANGELOG.md` 的 Unreleased 补一条：每门课独立会话（重启恢复、标题显示课程名）、总进度「新课程」「改计划」、学根答完后刷新侧边面板、页面缩放锁定且 ⌘+/⌘-/⌘0 改为按皮肤档位放大正文、`/skill:` 前缀修复与折回显示、CI 与依赖方向 lint。
- `AGENTS.md` 加一条：根目录与 `apps/desktop` 的 `@earendil-works/pi-coding-agent` 版本必须一致，升级时两处同改。

## 验收（你必须自己跑，全部通过才算完成）
`apps/desktop`：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。仓库根：`npm test`、`npm run lint:skills`。

## 禁止
- 不要读写 `~/.xuegen/`，不要碰 Obsidian 库，不要启动 Electron，不要 git commit/push（`git mv` 可以用）。
- 不改用户可见行为；不新增运行时依赖。

## 结束时
输出：每项改了哪些文件、`App.tsx` 前后行数、新增测试数、eslint 是否发现违规及处理、六条检查命令结果（贴最后几行）。
