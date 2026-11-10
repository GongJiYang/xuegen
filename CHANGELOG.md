# Changelog

## Unreleased

## v0.9.0 — 2026-11-10

- Vault layout: the old Chinese names are gone (`wiki/知识`, `wiki/书房`, `Clippings`, board at `wiki/courses.md`). Code and skills only know the English layout (`wiki/knowledge`, `wiki/shelf`, `clippings`, `wiki/_generated/courses.{md,html}`, created when missing). Run `rename-vault.mjs` on an old vault before upgrading.
- Scripts: `vault-lint.mjs` no longer reports empty directories deeper than `raw/<d>/<d>/` (structure that came with the material, e.g. a downloaded repository's `.gitkeep` folders).
- Scripts: `bin/xuegen-data-root.mjs` expects `vault/ sessions/ workspace/` under the data root and explains how to rename an old `库/ 会话/ 工作区/` root.
- Scripts: `anki-sync push` links cards that Anki already has but the Markdown lacks an ID for (Anki reports a duplicate, exactly one note with the same front, ID not used elsewhere): the ID is written back and reported as `linked`, so such cards stop showing as pending forever.
- Desktop: `exactOptionalPropertyTypes` is on for both TypeScript projects, as `apps/desktop/AGENTS.md` requires; `App.tsx` is back under 450 lines (document appearance effects moved into `core/settings/use-document-appearance.ts`).

## v0.8.0 — 2026-11-10

- Desktop / skills: **close transaction** (`skills/course/course-close.mjs`, tool `course_close`). A course session writes its course page, concept pages, records, `index.md` and `log.md` into a staging copy under `<workspace>/.close/`; `check` validates ownership, conflicts, append-only log/index, the course page and new concept pages; `commit` writes every file atomically (temp file → fsync → rename, journal for crash recovery), relocks, redraws both course boards and records one jj commit. `undo` restores the files the last 收课 changed (new pages are kept and listed), refusing when they were changed since. `shift` does the start-of-lesson postponement the same way (jj 「顺延」); save points commit as 「存档点」 so undo never takes them; `snapshot` renders the dated PNG outside the sandbox.
- Scripts: postponing never runs past the cycle's end — the schedule marker keeps `end=`, lessons pushed beyond it move to 「留到下个周期」.
- Desktop: **session roles and a tool guard** — 总控 / 课程 / 自由 sessions get fixed write lists (course pages only through the tools, 总控 does not write concept pages, the vault's own rules and `raw/` are read-only, credentials are never readable); every tool call is audited in `guard.log`.
- Desktop: **system sandbox for bash** (`@anthropic-ai/sandbox-runtime` 0.0.81, macOS): bash runs under a per-role seatbelt profile generated from the same rules — protected pages, the board, the calendar and `raw/` cannot be written, renamed or moved; credentials cannot be read; network is closed except AnkiConnect through the sandbox proxy. A refused command reports why and which tool to use; a sandbox that cannot start refuses the command. `XUEGEN_SANDBOX=off` turns it off for emergencies.
- Desktop: dedicated tools `course_plan` (总控: unlock / lock / schedule / board) and `calendar_write` (calendar notes).
- Desktop: the 总控 session's first message after each launch also asks 学根 to re-read its skills, so a cycle-long session does not follow outdated instructions.
- Desktop (Bear): no 「复制 Markdown」 button and no 「（太久了可以点输入框的停止）」 hint.
- Vault layout: code and skills accept both the old Chinese and the new English vault names (`wiki/知识` / `wiki/knowledge` …); `rename-vault.mjs` and `vault-lint.mjs` prepare the rename.
- Scripts / desktop: cards now sync straight into Anki via `wiki-save/anki-sync.mjs push` (AnkiConnect `addNote` with the file's tags, `<!--ID:-->` written back so Obsidian_to_Anki skips them, `书房::*` decks get the 「书房」 preset); the data channel gains `cards.sync` (no UI wired yet).
- Scripts: `bin/xuegen-data-root.mjs <数据根>` wires a new machine to the data root — `sessions`/`learning` symlinks and `wiki.json`, refusing to overwrite existing links or real directories (`--dry-run` to preview).
- Scripts: 书房 — queued books' finish dates in `书房/index.md` and `list` chain after the book being read (they used to count from today); `plan` refuses a book that is not being read instead of writing today as its start.

## v0.7.0 — 2026-11-09

- Desktop / scripts: 书房 — whole books live in `wiki/书房/` (one page per book, `bookshelf.mjs`): every day one block of ≤ 10 pages, one planned book at a time (the next starts automatically), one free book. The 今日卡 shows the block (「第 n / 81 天」, amber with 「晚了 N 天，读完日期顺延到 …」 when behind, 「其中 pp.… 讲后读读过，照读」 on overlap) with 「读完这段」 (10-second undo); a read block shows 「已记下，明天 …」 and 「摘几句」, an inline form that saves one sentence and its page into the book page without a model call. The reading panel gets a 书房 section above the queue: progress, next block, 接下来几天, 核心页已读, 摘录 with 「把 N 句做成卡 →」 (学根 drafts, you approve, cards go to the 「书房::<书>」 deck), the queue with chained finish dates, and the free slot.
- Scripts: dates follow what was actually read — a missed day pushes the finish date, a block read today moves the next one to tomorrow, `plan --write` saves the start date; 「读完了」 on a 讲后读 writes into the 书房 page (读书记录 + 核心页已读) when the course links `[[书房/<书>]]`.
- Desktop: a question with a table shows as a table in the pin rail; Enter while an input method is composing no longer sends; Escape stops an answer even with text in the field, and puts the message just sent back into an empty field; 「起草卡片」 and 「做成卡」 fold to 「制卡」 instead of 「旧指令」.
- Desktop: the 总控 no longer flashes earlier conversation when the window regains focus or an answer ends (resources keep their last value while reloading); 「开课」 on a course whose opening failed today (学根 never answered) sends the opening again instead of only switching.

## v0.6.1 — 2026-11-09

- Desktop (Bear): matches the approved mockups — skills panel in three layers with 「已安装 · N」 and an outlined 「获取」; no progress bars under decks; a disabled solid button reads as disabled; the drawer makes room instead of covering the 今日卡; only the expanded course in 总进度 gets a tint; the calendar's today cell is a tint with an accent number; reading dates read 「11-14 周六」; style choices are one size smaller; 「回到最新」 hangs above the composer and disappears when the bottom is in view after switching sessions; the `/` menu shows a key hint; 总控 with no conversation today says so.

## v0.6.0 — 2026-11-08

- Desktop: 学根 opens on this cycle's 总控 session (once per run, sends nothing; startup's restored session does not block it). A 今日卡 at the top of the 总控 thread lists today from local data — lessons (开课 →), aux, missed lessons, 周核实, 讲后读 (读完了), books due, Anki — in all three skins (`ControlCard`, `ThreadProps.header`). The daily brief is no longer sent automatically: 「让总控说说」 sends it, folded as 「今日简报」. Chicago's 今天 window has 「总控 →」.
- Desktop / scripts: 「读完了」 checks the 讲后读 line in the course page's `Today` without a model call (`course-state.mjs after-read`, `course.afterRead`), notes it in the book's reading page and rebuilds the course board.
- Desktop: the `/` menu is grouped by task (风格 / 上课 / 会话 / 打开 / 技能) with `/默认` and `/收课`; skills show a Chinese name and one line; buttons read 「开课 →」 / 「回到这节课 →」.
- Desktop: commands the UI sends carry an action marker and show as one folded line; course sessions offer 「总结 · 制卡 · 收课」 above the composer.
- Desktop: a session list grouped by day (title ▾, `⋯`, `/会话列表`, all skins) and the calendar's 「这天的会话」.
- Desktop: 「总结 · 制卡 · 收课」 appear only after 学根 has answered something in the course session.
- Skills: `course` writes concept pages at 收课 instead of before the lesson (the lesson starts right after the 今日要点 box), with a filled example in `references/concept-page.md`; 收课 first checks the session actually taught something, does every write inside one unlock, follows `references/record.md` for the record (no reading script source) and checks `week.done` with `list`. `teach` follows.
- Desktop: the answer-in-progress line shows elapsed time and step count (「正在动手：… · 11 秒 · 第 1 步」), amber past 3 minutes.
- Desktop: the 总控 session shows only today's conversation under the 今日卡; earlier days fold into 「▸ 更早的对话 · MM-DD 起 · N 条」 (restored messages now carry their time).
- Desktop: 「读完了」 waits 10 seconds with 「撤销 · N」 before writing; after 收课 the composer offers 「撤销这次收课 · 制卡」; 「收课 ▾」 adds 「收课，不写概念页」 and 「不记录，直接结束」; lesson and 今日卡 buttons say what they will change on hover.
- Desktop: calendar legend adds 「读书 = 读原书」; Bear skill checkboxes match the skin. `instructions.md`: 学根 speaks plainly — no script names, commands or field names unless asked.
- Desktop (Bear): one scale for type (12/14/16/18/24 with paired line heights), weights (400/500/600), spacing (4px base), radii (4/8) and a 12-step gray; secondary text and links darkened to ≥ 4.5:1 on every background step (the faintest gray is no longer used for text). Default UI text 13 → 14px.
- Desktop (Bear): states filled in — a 2px focus ring that is visible on every background, a blue border on the focused composer and panel fields, a zero-specificity hover fallback for buttons, disabled buttons in a muted gray with a not-allowed cursor (no more half transparency), 「正在读取…」 in the 今天 and 日历 panels while loading, and a readable placeholder.
- Desktop (Bear): the 总控 今日卡 uses UI type instead of growing with the body text, and its current row is the one loud thing; selected tabs and styles get a 2px accent underline; panels group by space instead of row lines and nested boxes; calendar cells are taller and the cycle start/end shows as a top line instead of a label over the date.
- Desktop (Bear): course sessions — the folded pin chip no longer covers the first line, the old-session notice is one light row, pre-marker `/skill:` commands fold to 「旧指令 · name」, the composer row keeps styles left and 「总结 · 制卡 · 收课」 right without breaking labels; the `/` menu hides 「上课」 outside a course; menus and the session list use the gray scale (current session on a gray row, wider course column with the full name on hover); the reading panel's 「加入」 is the panel's one solid button.
- Desktop (Bear): dark appearance that follows the macOS setting — the gray scale, accents and danger color have dark values that keep every text step ≥ 4.5:1; buttons with a solid accent flip their text color; the avatar and the window background follow too. When the pin rail folds into its chip, the chip sits on a bar the transcript scrolls under.

## v0.5.0 — 2026-11-08

- Principles: `docs/platform/PRINCIPLES.md` — the vault holds four kinds (原料 / 知识 / 意图 / 进度), one fact lives in one place, teaching preferences are scoped (global `wiki/profile.md` → subject page `## 讲解偏好` → course → session, subjects isolated), sessions are disposable and context has a budget. `AGENTS.md` points every change at it.
- Desktop: the teaching style picked in the UI holds only for that session (in memory, today only); a new 「默认」 choice (the default) sends no `[风格：…]` prefix so 学根 follows the subject's 讲解偏好. `desktop.json` no longer stores `courseStyles` / `sessionStyle`. The new-course request mentions a style only when one is picked.
- Desktop: at 60% context in a course session a notice offers 「先存档 →」 (学根 writes a checkpoint into the course page's Next Session), then 「开新会话接着上 →」 opens a fresh session that continues from it.
- Desktop (Bear) / calendar: 讲后读 lines in a course's `Today` count as reading due on their day; a 低强度 day with reading shows 「读书」 and reading days get a dot.
- Skills: `course` has one ordered 开课顺序 (讲后读 check + recall question replace `teach`'s opening diagnosis), reads the course page whole once per session then by section, reads books ≤ 10 pages at a time, writes preferences only to its own subject after confirmation, archives older closing records past 2, keeps plan changes in `log.md` only, and hands whole-book reading to `reading`; screenshot and weekly-check details moved to `course/references/`. `teach`: default style from the preference layers; formulas and Mermaid render on desktop; aux 要点 2–4. `reading`: textbook reading (a `sources/` page as the source, `--every 14`, `--due <date>`, `note`). `cycle-plan`: 低强度 brief reads the reading queue; no time estimates. `calendar` no longer claims 「今天学什么」.
- Scripts: `reading-queue.mjs` accepts `wiki/(知识/)sources/` pages as sources (links written without the prefix), fixed intervals (`--every`, keeps the rhythm on next/postpone), `--due YYYY-MM-DD` and `note`; `reading-queue.mjs` and `flashcards.mjs` read the knowledge folders from `wiki/知识/` when it exists, else `wiki/`.

## v0.4.1 — 2026-11-08

- Desktop: 检查更新 reads the version from the `releases/latest` redirect (via `net.request`, since `net.fetch` hides the final URL) instead of the rate-limited GitHub API; the zip URL follows the fixed asset name and the notes come from the release's `notes.md` asset (optional). `RELEASE.md` uploads `notes.md` with each release.
- Desktop: a repeated error (e.g. the same 429 rate limit on every retry) shows once, with the latest detail; unrecognised errors are still told apart by their text.
- Desktop: closing a notice closes that notice (skin notices first, then chat errors, then the stale-session notice), not a neighbour.
- Desktop: opening and resuming a course, and 改计划, name the course file by absolute path and the vault root, so 学根 no longer searches for the vault. `course-state.mjs list` reports each course's `file`.

## v0.4.0 — 2026-11-06

- Desktop: a course session from an earlier day (after a relaunch, or left open overnight) shows 「这是 11-04 的「…」会话。开今天的课 →」; the button starts today's lesson in a fresh session. Notices can carry a button (`NoticeItem.action`), implemented in bare, Bear and Chicago.
- Desktop: in a course session, the next prompt carries 「[课程页或技能可能已更新：先重读课程页和要用的技能，以文件为准]」 when the course page changed since the session's last answer, or on the first prompt after a relaunch or update. `course-state.mjs list` reports each course file's `changedAt`.
- Desktop: 改计划 and 周核实 open a fresh session when the course's remembered session is from an earlier day.
- Desktop: the board also reloads when the window regains focus (at most every 5 s) and when the local day changes.
- Skills: no time estimates — lessons say what is studied (chapters, pages, points, done-when), never 「约 N 分钟」 or an expected finish date; 原书通读 assigns one stretch per Saturday. `course`: re-read the course page before opening, continuing, comparing plans or answering progress questions; one session per course per day. `cycle-plan`: the brief lists overdue 讲后读 with 「!」. The 排课 request and form hint say 「按教材章节切课次」.

## v0.3.0 — 2026-11-06

- Desktop: `/总结` asks 学根 to sum up the lesson as a 今日要点 box (`> [!abstract]`, one `- **术语**：定义` line each) plus one `[!question]` callout per missed or unfinished point, so the pin rail fills even in a session that never loaded `teach`.
- Desktop (Bear, Chicago): table cells render inline Markdown (bold, code, math) instead of the raw text.
- Skills: main-subject courses must read the original book. `course` adds 原书「讲后读（错开）」 — the lesson's core pages (about 12–20, chosen when the lesson opens) are read on the other main subject's next lesson day, with a Today checkbox set at closing — and a `## 原书通读` section that reads the whole book in order at a normal pace (about 60 minutes each Saturday), not bound to the cycle end. `cycle-plan`: the 深度 brief lists today's 讲后读 and the 低强度 brief the next 原书通读 stretch.
- Desktop: an unused import in a command test no longer fails `npm run lint`.

## v0.2.1 — 2026-11-06

- Skills: lessons check the course's cycle role at start (aux: ≤ 45 min, overview, no 检查理解, no cards); 周核实 procedure for main courses; 总控 brief lists the aux lesson; reading can clip a URL into `Clippings/`; card drafts are shown before anything is written; concept-page and material-status rules made consistent; calendar hands schedule questions to cycle-plan/course.
- Desktop: answers to a 检查理解 question carry 「第 N 题：」; 让学根起草 / `/制卡` ask for a draft only; the 90-minute label is gone.
- Desktop (Bear): 排课 from the cycle view plans on the cycle — the form shows 「C1 辅助 · 周一 · 周三 · 每节 ≤ 45 分钟 · 排到 12-24」 instead of start/end/rest fields, and the request tells the `course` skill the subject, role, days and cycle end. `course` skill: a 「学习周期里的课」 section (days from the template, aux ≤ 45 min and not assessed, overflow to the next cycle, check afterwards).
- Desktop (Bear): calendar cell labels are cut with an ellipsis instead of spilling out of the cell.
## v0.2.0 — 2026-11-06

- Desktop: packaged as 学根.app (`npm run dist`, unsigned zip; bundled skills found under `Resources/xuegen`). In-app update: the packaged app checks this repository's GitHub releases (quietly 8 s after start, or via 学根 → 检查更新…), shows an update bar (改进条目、稍后、更新并重启), downloads with progress, then swaps the app bundle and relaunches; only this repository's release assets are accepted.
- Desktop (Bear): 总进度 v4 during a cycle — expected end above the 12×7 week grid, a 「C1」 cycle line with range and days left, one block per main subject (its days, cycle courses as compact cards with the next lesson on one line; expanded: next three lessons, all lessons, style pills, 改计划, 开始), materials and finished courses folded at the bottom of each subject, aux rows, and folded 路线外 / 已学专题. `cycle.mjs overview` adds each subject's days and every lesson of each course.
- Desktop (Bear): a pin rail in the margin left of the chat shows the lesson's 今日要点 box (`> [!abstract]`) and the latest round of 检查理解 questions, with jump links back to the source message; when the margin is too narrow it folds into a 「要点 N · 题目 M」 chip. `teach`/`course`: each lesson first writes its core terms to `wiki/concepts/` (one page per term) and opens with the 今日要点 box; every question round uses `[!question]` callouts.
- Study cycles: the weekly template takes an optional 辅助 column — each 深度 day pairs a main subject with an auxiliary one (next cycle's main subject; short, not assessed). `cycle.mjs` marks courses main/aux and checks aux courses against their own days. Bear: calendar cells show the aux line, the day detail and 今天 list the aux lesson, 明天 mentions it, and 总进度 has a 辅助 block (course progress or 排课).
- Desktop: the 新课程 form drops 每天时长 (the `course` skill now estimates each lesson's length from the material's difficulty and length) and adds 原书 — 带读 / 先读后讲 / 边读边讲, with a one-line hint — carried into the create-course request.
- Desktop: the answer-in-progress line is drawn once under the transcript and stays for the whole answer (正在思考 in the gaps between tool steps), so it no longer disappears, jumps between blocks or redraws the avatar; Bear drops the breathing fade under the shimmer. Each course's first lesson of the day opens a fresh session (later clicks that day return to it), so 学根 reads the course file anew instead of answering from an older session.
- `course` skill: each course records 原书：带读 / 先读后讲 / 边读边讲 (reading the original inside the lesson's time, as its own checkbox for 先读后讲), and lessons follow the textbook's table of contents when there is one (`骨架：教材目录` / `骨架：自拟`).
- Study cycles: a 深度 day in the weekly template now links a subject (`[[subjects/<slug>\|短名]]`), not a course. A cycle's courses are the courses linked from those subject pages (`→ [[courses/<slug>|短名]]`, the alias is the short name) with a new lesson inside the cycle, so several materials of one subject can each have their own course and schedule; `check` requires every course's lesson weekdays to be its subject's 深度 days, no two courses of one subject on the same date, and a course for every template subject. Desktop (Bear) 总进度 now shows only the expected end date and the 12 cycles as 7 week cells each, groups the cycle's courses under their subjects, and offers 排课 on unplanned materials (opens the new-course form prefilled).
- Desktop (Bear, design `?d=plan`): 总进度 opens with the two-year route — 「预计结束 2028 年 7 月 20 日」, weeks left and buffer, a 12-segment cycle strip that expands to every cycle's subjects and dates — then the current cycle (start → end, days left, next cycle) and one card per cycle course (lessons done / total, end date, next lesson; a missed one is marked !). The calendar writes each day's use in its cell (the lesson's course short name, 整合, Anki, 恢复, blank on rest days), flags 「C1 起 / C1 完」, shows today as a filled circle and the selected day as a card, and lists the selected day's lessons, 周核实 and Anki. Data comes from the new `cycle.mjs overview` (`cycle.overview` request) and the extended `cycle.mjs month` (lessons, short names, cycle bounds, recovery days); the route is read from the new vault page `wiki/cycles/route.md`, which `check` compares with each cycle page. bare and chicago show the route end line.
- Desktop: the line under an answer in progress now says what 学根 is doing — 正在思考 / 正在查资料：<path> / 正在动手：<command> / 正在写 — with, in Bear, a 24px avatar whose expression matches (thinking / searching / working / writing). Read-only tools and read-only shell commands (cat, ls, grep, wc, …) count as 查资料; JSON tool arguments show only the command or path.
- Desktop: a 总控 session per study cycle, not tied to any course — opened with `/总控` or 「总控 →」 in the 今天 cycle view; the first opening each day asks `cycle-plan` for the daily brief; the title reads 「总控 · C1」. In Bear the title carries a 22px ink avatar (grokbot-web, BSD-3, bundled under `skins/bear/vendor/` from a reviewed commit) whose state follows 学根: thinking, working (tool running), notifying (missed lessons), sleeping (rest day), idle.
- Desktop (Bear): 总进度 groups courses by subject when the vault has a subject skeleton (`wiki/subjects/*.md`, read by the new read-only `skills/cycle-plan/subjects.mjs` via `subjects.list`): the cycle line with a 7-week bar, 主项 by subject (each course marked ✓ / ! / ○ / ● with 「本周 x/y · 总 a/b」, plus each subject's materials grouped by type), 辅助, 路线外 (「上次 MM-DD」; untouched for more than 14 days is marked !), 已学专题, and a legend. Without subjects the plain list stays.
- Desktop (Bear): the body column widens from 34em to 42em (about 40 characters at the default 24px) and scrollbars are hidden; the wheel and trackpad still scroll.
- Desktop (Bear): the 今天 window shows the study cycle on cycle days — 「第 N 周 · 周X · 深度日」, one focus block (today's lesson with 开始 →, a carried-over lesson marked 「顺延到今天」, the 整合 day's 本周 x/y per course with 核实 →, 不上新课, or 休息), other courses' missed lessons, Anki's due count, and tomorrow's line. The calendar labels cycle days 深 / 整 / 低 / 休, fades rest days, and shows 「第 N 周 · X日」 for the selected day. Data comes from `cycle.mjs` through the new `cycle.day` / `cycle.month` requests; bare and chicago show the headline line.
- Add the `cycle-plan` skill: one page per 7-week study cycle in `wiki/cycles/` (frontmatter + a 7-row weekly template of 深度 / 整合 / 低强度 / 休息 days). The read-only `cycle.mjs` answers what a given day or week holds (`day`, `week`) from the template and the courses' schedules, lists overdue lessons, and `check` verifies that each course's lesson weekdays match its 深度 days. The skill covers the daily brief, Friday integration, cycle acceptance and rotation, and registering materials to subjects; teaching and course state stay with `teach` and `course`.
- `course-schedule.mjs plan` gains `--days mon,wed` (new lessons only on those weekdays; reviews still on any non-rest day), `--extra YYYY-MM-DD,…` (one-off lesson days outside the weekly template) and `--reviews anki` (no review rows; Anki does the reviewing). `days=` and `reviews=anki` are kept in the schedule marker so `shift` reuses them; `shift` now moves missed lessons to the course's next lesson day, recomputes their reviews, and moves overdue reviews of finished lessons to today. Courses with `reviews=anki` propose flashcards at session close and write them only after the user confirms.
- Desktop (第 3 轮，按实际使用反馈): 点「开始学习/继续学习」立即显示本地开课卡片（上次学到这里 · 这次从这里开始），开课请求写明课程文件路径；今天已开过课的课程按钮变为「回到这门课」，只切回会话不重发开课消息；「显示 ▸ 正文字体」可切换像素/黑体/楷体/宋体，「正文字号」按字体给档位（像素 12/24px，平滑字体 15–24px），新用户默认 24px，正文行宽约 36 字、行高 1.6，代码与字符图保持 12px 整数倍；生成回答时只滚到回答开头；对话标题栏显示上下文用量（≥80% 提示即将压缩），压缩时在对话里留一行提示，可手动「立即压缩」；阅读窗口说明用途；「今天」窗口新增「明天」；新课程表单增加截止日期与休息日。
- Add `course-schedule.mjs` to the `course` skill: lessons are laid out day by day up to the deadline (rest days skipped), each lesson gets reviews at +1/+3/+7/+14 days, missed days shift the rest of the schedule forward, and dates are only ever computed by the script. The course parser (and so the calendar) now also reads full `YYYY-MM-DD（周X）` plan dates. `teach` answers are organised in short headed blocks with one bolded key sentence and a check every 3–5 paragraphs.
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
