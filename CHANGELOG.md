# Changelog

## Unreleased

- Desktop (第 2 轮): 每门课使用独立会话（重启后可恢复，窗口标题显示课程名）；总进度新增「新课程」「改计划」；学根答完后自动刷新侧边面板；锁定页面缩放，⌘+/⌘-/⌘0 改为按皮肤档位放大正文；修复 `/skill:` 前缀与折回显示；新增 CI 与依赖方向 lint 规则。
- Desktop (第 1 轮修复): 对话正文与输入区在窗口内居中；侧窗关闭后可从图标列（新增「今天」图标）、「学习」「显示 ▸ 显示全部侧窗」重新打开；模型菜单只列有凭据的模型、切换模型与思考强度写回默认并在菜单栏显示模型短名；`/` 菜单按完全匹配 > 前缀 > 包含 > 说明排序，新增 `/新会话`、`/继续会话`，未知斜杠命令不再发给模型；`teach` 用 `> [!question] 检查理解` callout 输出检验题，「我来回答 / 给点提示 / 跳过」在界面内可用；阅读「下次接着读」记录位置、「加入阅读」加「今天就读」勾选；日历详情显示课程名、日志去掉 `log` 前缀、标记放大；「今天」窗口以「今天计划」列出当天具体项；`/加入阅读` 聚焦输入框、`/制卡` 发送起草指令。
- Add the opt-in `reading` skill for incremental reading: one Wiki state file per source in `wiki/reading/`, excerpts in `wiki/extracts/`, scheduling changed only through `reading-queue.mjs`, raw sources kept read-only, and cards made through the existing `wiki-save` rules (at most 10 per excerpt).

- Add the `article` skill for abstracting learning material into precise knowledge hierarchies without drafting prose.
- Default new profiles, and profiles without an explicit `tuiMode`, to Pi's regular terminal mode so the input editor follows terminal scrollback instead of staying in the fullscreen dock.
- Apply retrieval-first, chunking, transfer, spacing, and interleaving guidance by learning depth without adding a review database.
- Document raw Markdown copying with `/copy` and strengthen course-board verification reporting.
- Enable native MCP and deferred tool discovery in the isolated Xuegen profile.
- Forward `xuegen mcp` management commands and document pinned arXiv/PDF and Fetch installations.
- Store Python MCP environments in `mcp-tools/` to avoid the runtime's legacy `tools/` migration warning.
- Add opt-in `wiki-save` for existing Wiki relationships and Anki cards, with a private `wiki.json` vault binding.
- Keep teaching independent of Wiki access; reuse vault rules and preserve existing card IDs during requested saves.
- Add opt-in `course` with one Wiki page per course for materials, plans, evidence-linked activity checkboxes, and concise learning records.
- Keep course selection per conversation; preserve manual edits and avoid duplicate closing records when nothing changed.
- Route Wiki queries through a read-only workflow without updating pages or logs.
- Normalize and export `XUEGEN_HOME` so tool-side Wiki lookup matches the runtime profile, including relative paths.
- Render dated course PNG snapshots with weekly goals, overall milestones, learning evidence, and next steps using local Chrome without new dependencies.
- Preserve Markdown as the source of truth; reject invalid completion flags and avoid overwriting existing snapshots.
- Move course state to `wiki/courses/<slug>.md` and keep it read-only (0444 with a 0555 directory) so it can only change through the unlock-edit-relock workflow.
- Generate a `wiki/courses.md` dashboard from the per-course state files, and add a read-only `course-board` skill that displays courses and verifies locks and dashboard consistency.
- Support checking off and reverting activities at the end of a day, keeping an audit line instead of deleting the earlier checkmark.
- Render a self-contained read-only `wiki/courses.html` board from the same course Markdown: no server, scripts, CDN, or edit controls; opens offline and follows the system light/dark theme.
- Define the standard plan output (position, next step, week, today, milestones, full plan, records) in `skills/course/PLAN-STANDARD.md`, illustrated with the mech-interp course.

## 0.1.0

- Add the `xuegen` command with an independent local profile and learning identity.
- Include the `teach` workflow: diagnose, plan, derive, check, and review.
- Load bundled skills explicitly while disabling automatic discovery of unrelated configuration.
- Pin the upstream terminal runtime; keep credentials, sessions, and notes outside the distributable project.
