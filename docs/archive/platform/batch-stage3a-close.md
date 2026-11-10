# batch-stage3a-close（Devin 写基础代码）：收课事务脚本 `course-close.mjs`

设计定稿：`docs/platform/STAGE3-DESIGN.md`（先读，本单是它的逐条落地）。**只写脚本**，不改 guard、不改技能文字、不做界面。

## 硬约束（压缩后也要记得）

- 先读 `AGENTS.md`、`docs/skills/AUTHORING.md`、`docs/platform/STAGE3-DESIGN.md`、`skills/course/course-state.mjs`（锁的写法照它）、`skills/course/course-parse.mjs`、`skills/course/course-schedule.mjs`（`readSchedule`、`completedIds`）、`skills/wiki-save/rename-vault.mjs`（`writeAtomic`、权限恢复的写法可参考）。
- 新文件只有 `skills/course/course-close.mjs`。零依赖（只用 `node:` 内置模块）；ESM；顶部用法注释照 `course-state.mjs` 的风格。
- **判断「是否直接运行」必须用** `realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "")`（照 `course-schedule.mjs:509`；`lint:skills` 会查）。
- 不碰真实库 `~/学根/库`、真实工作区 `~/学根/工作区`、真实 `~/.xuegen/`；自测用 `mkdtemp`。不 commit/push、不加依赖、不放宽 eslint。**不写新测试**（DeepSeek 补），但现有 `npm test`、`npm run lint:skills` 必须通过（`lint:skills` 要求同名测试文件时，建一个只含一条 `node:test` 冒烟用例的 `course-close.test.mjs`：`--help` 有输出、exit 0）。
- 所有面向用户的报错用中文，经 `fail(message)` 打到 stderr 并 exit 1；`--json` 时成功结果打 JSON 到 stdout。

## 1. 结构：纯函数在上、IO 在下

纯函数（`export`，不读写文件、不调子进程）：

```js
export function stagingName(slug, now)              // → "<slug>-YYYYMMDD-HHMMSS"（本地时间）
export function subjectOf(courseText)               // Relationships 节里第一个 [[subjects/<s>]] 的 <s>，没有返回 null
export function ownedPrefixes(slug, subject)        // → 允许的库内路径前缀/文件数组（见设计「校验 1」；新旧两种布局都列）
export function isOwned(path, slug, subject)        // path 是库内相对路径（posix）
export function checkAppendOnly(baseText, newText)  // log.md：newText.startsWith(baseText) → null，否则返回中文原因
export function checkNoDeletedLines(baseText, newText) // index.md：基线里每一行（去掉行尾空白，跳过空行）在新文本里都还在 → null，否则原因（点名第一条被删的行）
export function checkCoursePage(text, slug)         // parseCourse 能解析且 marked；completedIds 里每个 id 都在 readSchedule(text).rows 的 id 里；行数 ≤ 200；返回问题数组
export function checkConceptPage(text)              // 以 "---\n" 开头、frontmatter 内有 "sources:" 行 → null，否则原因
export function planCheck(manifest, staged, current) // 汇总校验，见第 3 节；返回 { ok, problems: [{ path, kind, detail }] }
```

IO（不 export，或 export 供测试但不在文档里承诺）：`sha256(path)`、`cloneInto(src, dst)`（`copyFile(src, dst, constants.COPYFILE_FICLONE)`，`EXDEV`/`ENOTSUP` 时退回 `copyFile(src, dst)`；目标父目录先 `mkdir -p`）、`writeAtomic(path, data, mode)`（同目录临时文件 → `fd.sync()` → close → `rename`）、`withWritable(dir, fn)`（临时 `chmod u+w`，`finally` 恢复原 mode）、`jj(args, cwd)`（`execFileSync("jj", args)`；库根下没有 `.jj` 时整个 jj 步骤跳过并在结果里写 `jj: "skipped"`）。

## 2. 命令

```
node course-close.mjs stage   <vault> <slug> --workspace <ws> [--json]
node course-close.mjs add     <staging> <vault-relative-path> [--json]
node course-close.mjs check   <staging> [--json]
node course-close.mjs commit  <staging> [--json]
node course-close.mjs abort   <staging>
node course-close.mjs undo    <vault> <slug> --workspace <ws> [--json]
node course-close.mjs recover <vault> --workspace <ws> [--json]
```

2.1 **stage**：`<ws>/.close/<stagingName>/` 建目录；暂存目录里放 `manifest.json` 与镜像文件（按库内相对路径，例如 `<staging>/wiki/courses/<slug>.md`）。复制：`wiki/courses/<slug>.md`（不存在就 fail「没有这门课」）、`wiki/index.md`、`wiki/log.md`、`wiki/courses/<slug>/records/<当月 YYYY-MM>.md`（存在才复制）。复制后把镜像文件 chmod 0644（源文件是 0444）。manifest：
```json
{ "version": 1, "vault": "<绝对路径>", "slug": "...", "subject": "<subjectOf 结果或 null>",
  "createdAt": "<ISO>", "base": { "<库内路径>": "<sha256>" } }
```
同一门课已有未提交的暂存目录（`.close/<slug>-*` 且无 `committed` 标记）时 fail，提示先 commit 或 abort。输出暂存目录路径（`--json` 时 `{ staging }`）。

2.2 **add**：库内路径必须 `isOwned`，文件必须存在且还不在 manifest.base 里；复制进镜像、chmod 0644、把 sha256 写进 manifest.base（manifest 本身用 writeAtomic 写）。

2.3 **check**：遍历暂存目录里除 `manifest.json` 外的所有文件 → 对每个文件：库内路径、是否在 base（改已有页）还是新增。调用 `planCheck`，规则：
  1. 不 `isOwned` → `kind: "owner"`。
  2. 在 base 里：库里当前 sha256 ≠ base → `kind: "conflict"`；不在 base 里：库里已存在该文件 → `kind: "conflict"`（「库里已有这个文件，先用 add 复制进来再改」）。
  3. `wiki/log.md` → `checkAppendOnly(库里基线内容, 新内容)`；`wiki/index.md` → `checkNoDeletedLines`。基线内容从库里读（冲突检查已保证它等于基线）。
  4. `wiki/courses/<slug>.md` → `checkCoursePage`。
  5. 新增的、路径在 `concepts/` 下的 `.md` → `checkConceptPage`。
  6. 镜像文件内容与库里完全相同的，算「未改动」，不进提交清单（不报错）。
  输出 `{ ok, problems, changes: [{ path, action: "create"|"update" }] }`；`ok=false` 时 exit 1（但仍输出 JSON）。

2.4 **commit**：
  1. 先跑一遍 check，不 ok 就 fail（什么都不写）。
  2. 对每个 change：在**库里目标文件的同目录**写临时文件 `.<name>.close-tmp-<pid>`（`withWritable(父目录)`），fsync。
  3. 写 `<ws>/.close/journal.json`（writeAtomic）：`{ staging, vault, slug, files: [{ path, tmp }], startedAt }`。
  4. 逐个 `rename(tmp, 目标)`（同样在 `withWritable(父目录)` 里）。
  5. 上锁：`wiki/courses/<slug>.md` 与 `wiki/courses/<slug>/` 下本次写入的文件 0444，`wiki/courses/<slug>/` 及其子目录（records、snapshots）0555，`wiki/courses/` 本身恢复原 mode；其它文件保持 0644。
  6. 删 journal；在暂存目录写一个空文件 `committed`。
  7. jj：`jj commit -m "收课 <slug> <YYYY-MM-DD>"`（库根执行）。jj 失败只在结果里写 `jj: "failed: <stderr 第一行>"`，不回滚文件（文件已经原子落盘）。
  8. 输出 `{ committed: true, changes, jj }`。
  任何一步抛错：若 journal 已写，fail 信息里写「提交中断，下次运行任何 course-close 命令会自动补完」；若 journal 还没写，删掉已写的临时文件后 fail。

2.5 **abort**：暂存目录存在且没有 `committed` → 删除整个目录。

2.6 **recover**（所有命令开头都先调用它的内部函数；单独的 `recover` 命令只是显式触发）：`<ws>/.close/journal.json` 存在 → 对每个 file：tmp 存在就 rename 到 path；然后按 2.4 第 5 步上锁、第 6–7 步收尾。结果写到 stderr 一行「已补完上次中断的收课：<slug>」。

2.7 **undo**：`jj log -r 'description(glob:"收课 <slug> *")' --no-graph -T 'commit_id ++ "\n"' --limit 1` 找最近一次；没有就 fail。取那次提交改过的文件列表（`jj diff -r <id> --name-only`），对每个文件 `jj restore --from <id>- --to @ <path>`（先 `withWritable` 放开课程目录），然后按 2.4 第 5 步重新上锁，`jj commit -m "撤销收课 <slug> <原提交日期>"`。输出 `{ undone: <id>, files, newCards: [那次新增的 flashcards 路径] }`。库不是 jj 仓库时 fail「撤销需要库在 jj 下」。

## 3. F_FULLFSYNC
在文件头注释写一段：Node 的 `fsync`/`FileHandle.sync()` 在 macOS 上由 libuv `uv__fs_fsync` 先尝试 `fcntl(F_FULLFSYNC)`——**去核实**：在 `node_modules` 或网上的 libuv 源码（`src/unix/fs.c`）找到那几行，在结束报告里引用文件与行；核实不了就如实写「未核实」。

## 4. 文档
`skills/course/SKILL.md` **不改**（3c 由 Claude 改）。只在 `skills/course/` 下新建 `references/close.md`：命令用法、暂存目录结构、校验规则一览、失败与恢复说明（中文，≤ 80 行）。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && npm run lint:skills 2>&1 | tail -2
# 自测（临时目录，从真实库只读复制一份最小样本）：
T=$(mktemp -d) && mkdir -p $T/vault/wiki/courses $T/ws && cp ~/学根/库/wiki/courses/discrete-math-epp.md ~/学根/库/wiki/index.md ~/学根/库/wiki/log.md $T/vault/wiki/ 2>/dev/null; mv $T/vault/wiki/discrete-math-epp.md $T/vault/wiki/courses/ && chmod 0444 $T/vault/wiki/courses/discrete-math-epp.md
S=$(node skills/course/course-close.mjs stage $T/vault discrete-math-epp --workspace $T/ws) && echo "staging=$S"
echo "- 测试追加" >> $S/wiki/log.md && node skills/course/course-close.mjs check $S --json && node skills/course/course-close.mjs commit $S --json && tail -1 $T/vault/wiki/log.md && ls -l $T/vault/wiki/courses/
```

## 结束报告（中文）
每节是否照做；偏离之处及原因；F_FULLFSYNC 核实结果（引用）；自测输出；未完成项。
