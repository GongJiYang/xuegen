# 阶段 3 收课事务：定稿设计（2026-11-09，用户已定）

来源：`ARCH-DISCUSSION-1109.md` 第 8、10.3 节；11-09 晚讨论改为「暂存目录」而不是 JSON 收课包。

## 用户定的三点
1. 暂存目录放在工作区：`<工作区>/.close/<slug>-<YYYYMMDD-HHMMSS>/`（库外，Obsidian 与 jj 看不到；与库同卷，可写时复制）。
2. 课程会话对**课程页和概念页**都只能写暂存目录，不能直接写库；摘录、书房、阅读页、日志这类「任何会话都能写」的照旧。
3. 校验通过后直接提交，不再等用户确认；不满意用「撤销这次收课」（jj 可恢复）。

## 流程（全部由 `skills/course/course-close.mjs` 完成）

| 命令 | 作用 |
|---|---|
| `stage <库> <slug> --workspace <工作区>` | 建暂存目录；按库内相对路径写时复制（`COPYFILE_FICLONE`，跨卷退回普通复制）课程页、当月 records、`wiki/index.md`、`wiki/log.md`；写 `manifest.json`（每个文件的库内路径 + 内容 sha256）。输出暂存目录路径 |
| `add <暂存> <库内路径>` | 把一个已存在的页（例如要补充的概念页）复制进暂存并记基线指纹。改已有页之前必须先 add |
| `check <暂存> [--json]` | 校验（见下）；不改任何文件 |
| `commit <暂存> [--json]` | 再校验一次 → 写提交日志 → 逐文件「临时文件 → fsync → rename」→ 上锁 → 删日志 → `jj commit`（库是 jj 仓库时）→ 输出改了哪些文件 |
| `abort <暂存>` | 删除暂存目录，库不动 |
| `undo <库> <slug>` | 找到这门课最近一次「收课」提交，把它改过的已有文件恢复到提交前（jj），再提交「撤销收课」；那次新建的页面保留并列出，问用户后再删（用户 11-10 定） |
| `recover <库> --workspace <工作区>` | 发现残留提交日志就把剩下的文件补完、上锁、提交；任何命令开头都先自动跑一次 |

## 校验（check 与 commit 都跑）
1. **归属**：暂存里每个文件的库内路径必须属于这门课：`wiki/courses/<slug>.md`、`wiki/courses/<slug>/**`（records、snapshots）、本科目的概念与卡片目录（科目取课程页 Relationships 里的 `[[subjects/<科目>]]`；新库 `wiki/knowledge/{concepts,flashcards}/<科目>/**`，旧库 `wiki/知识/{concepts,flashcards}/**`）、`wiki/index.md`、`wiki/log.md`。
2. **课程页格式**：`course-parse.mjs` 能解析；新增记录里的 `完成：` 课次 id 都在排期表里；页面不超过 200 行。
3. **只追加**：`log.md` 新内容必须以基线全文开头；`index.md` 不得删除基线里的行。
4. **冲突**：manifest 里每个基线文件，库里现在的 sha256 必须与基线相同；新文件在库里必须仍不存在。
5. **概念页**：新增概念页必须有 frontmatter 且含 `sources:`。

## 提交与恢复
- 提交日志放在 `<工作区>/.close/journal.json`：`{ staging, files: [{ path, tmp }], startedAt }`。先把所有新内容写成库内同目录的临时文件并 fsync，再写日志（fsync），然后逐个 rename，上锁，删日志。
- 崩溃后 `recover`：日志里的临时文件还在的就 rename，已 rename 的跳过，然后上锁、提交、删日志。
- 落盘：Node 在 macOS 上 `fsync` 由 libuv 走 `F_FULLFSYNC`（Devin 核实 libuv `uv__fs_fsync` 源码并在报告里引用）。
- 锁：课程页与 `wiki/courses/<slug>/` 下文件 0444、目录 0555；提交时临时放开父目录，`finally` 恢复。

## 之后（不在事务里）
- 刷新两个看板（`render-board.mjs`、`course-state.mjs dashboard`）；失败只报，不回滚。
- 卡片同步照旧（`anki-sync.mjs`），可重试、可删卡。
- 截图：模型在 commit 之前用 `render-snapshot.mjs` 把图片生成到暂存目录里，随事务一起提交。
- 「已收课后会话只读」等界面讨论。

## 与 4a 的关系（用户 11-09 定）
`course-close.mjs` 仍是核心脚本；3c 起由专用工具 `course_close` 在沙盒外调用它（见 `STAGE4A-DESIGN.md`），模型不再经 bash 调用。

## 3d（用户 11-09 定）
`course_close` 加 `shift` 动作：stage 课程页 → 在暂存副本上跑 `course-schedule.mjs shift --today <今天> [--end <周期结束日>] --write` → check → commit（提交信息「顺延 <slug> <日期>」）。开课第 3 步改用它。依赖「顺延不越过周期结束日」那一单先修好。

## 分批
- **3a（Devin）**：`course-close.mjs` 全部命令 + 纯函数（不写测试，DeepSeek 补）。
- **3b（DeepSeek）**：审核 + 测试（假库、崩溃恢复模拟、冲突、只读锁）。
- **3c**：专用工具 `course_close`（包 3a 脚本）+ guard 收紧（课程会话对课程页、概念页只能写 `.close/`）+ `course` 技能收课一节改写（Claude 写技能文字）+ 真机验收。
