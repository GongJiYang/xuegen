# batch-tidy2-split-close（Devin）：按隐藏的信息把 `course-close.mjs` 拆成 5 个模块——只搬代码，不改行为

整理批第 2 条（`docs/platform/TIDY-1110.md` §2，用户 11-10 同意）。`skills/course/course-close.mjs` 现在 1218 行。按 Ousterhout「深模块」的原则拆：每个模块独占一条知识，对外接口尽量小。**纯搬家：函数体、注释、报错文字一个字不改**，行为完全不变。

## 硬约束
- 只新建 `skills/course/close/{rules,staging,durable,jj,board}.mjs`，改 `skills/course/course-close.mjs`。另外**只允许**把 `skills/course/course-close.test.mjs` 里测纯函数的用例**原样剪切**到 `skills/course/close/rules.test.mjs`（见第 7 条）；其余测试文件、`SKILL.md`、`references/*`、`apps/**` 一律不动。
- 不 commit/push、不加依赖。新文件都用 ESM、`node:` 前缀导入，风格照原文件。
- 每个新模块文件头写 3–5 行注释：**它独占什么知识、对外接口是什么、谁调用它**。

## 拆法（函数名见原文件行号，11-10 版）
1. **`close/rules.mjs`（纯函数，不读文件、不起子进程）**：常量 `COURSE_PAGE_MAX_LINES`；`stagingName`、`subjectOf`、`ownedPrefixes`、`isSafeRelPath`、`isOwned`、`checkAppendOnly`、`checkNoDeletedLines`、`checkCoursePage`、`checkConceptPage`、`planCheck`（原第 53–237 行一段）。它需要的 `parseCourse`、`completedIds`、`readSchedule` 从 `../course-parse.mjs`、`../course-schedule.mjs` 导入。
2. **`close/jj.mjs`（jj 的一切）**：`isJjRepo`、`jj`、`filesetLiteral`、`DIFF_TEMPLATE`、`jjCommit`、`STATUS_LETTER`、`parseDiffEntries`、`diffEntries`、`guardLaterChanges`。
3. **`close/durable.mjs`（磁盘持久化：原子写、只读锁、提交日志与恢复）**：`READONLY_FILE`、`WRITABLE_FILE`、`READONLY_DIR`、`hashBuffer`、`sha256`、`cloneInto`、`writeAtomic`、`withWritable`、`nearestExistingDir`、`walkDirs`、`walkFiles`、`lockCourse`、`journalPath`、`recoverInternal`。`recoverInternal` 里用到的 `jjCommit`、`refreshBoard` 从 `./jj.mjs`、`./board.mjs` 导入。
4. **`close/board.mjs`（课程看板）**：`BOARD_RELS`、`boardPaths`、`refreshBoard`。脚本路径（`course-state.mjs`、`render-board.mjs`）改用 `join(dirname(fileURLToPath(import.meta.url)), "..", "<脚本>")`，指向的文件不变。
5. **`close/staging.mjs`（暂存目录布局与 manifest）**：`loadManifest`、`saveManifest`、`walkStaged`、`workspaceOf`、`gatherCheck`、`uniqueStagingDir`、`stageInternal`、`commitInternal`、`shiftStaged`。
6. **`course-close.mjs` 只留**：`fail`、`localDate`、`localMonth`、`escapeRegExp`、所有 `cmd*`、`COMMIT_LABELS`、`commitLabel`、`SNAPSHOT_SCRIPT`、`snapshotReason`、CLI（`parseArgs`、`usage`、`main`、`isMain`）。为了**现有测试一行不改**：原来 `export` 的名字（`stagingName`、`subjectOf`、`ownedPrefixes`、`isSafeRelPath`、`isOwned`、`checkAppendOnly`、`checkNoDeletedLines`、`checkCoursePage`、`checkConceptPage`、`planCheck`、`withWritable`、`parseDiffEntries` 等，以 `course-close.test.mjs` 实际 import 的为准）在 `course-close.mjs` 里 `export { … } from "./close/…mjs"` 转出。
   - `fail`（打印后 `process.exit(1)`）被多个模块用到：放进 `close/rules.mjs` 以外的一个模块会造成循环依赖的话，就新建 `close/fail.mjs` 只放它，各模块从那里导入。**不要**改成抛异常（行为会变）。
   - 模块之间只许单向依赖：`rules` ← `jj` / `board` ← `durable` ← `staging` ← `course-close.mjs`（`fail.mjs` 谁都能用）。出现循环就在报告里说明怎么解的。
7. **测试**：`course-close.test.mjs` 里**只测上面 rules.mjs 纯函数**的用例（不起子进程、不建 jj 库的那些，原文件开头一段），原样剪切到新文件 `close/rules.test.mjs`，import 改成 `./rules.mjs`；断言一字不改。其余用例留在原文件。这样 `lint:skills` 对 `close/rules.mjs` 不再报「缺少同名测试」；其余 4 个新模块的同名测试由下一单 DeepSeek 补，本单报告里列出 lint 警告即可。
8. 拆完后 `course-close.mjs` 应在 300 行左右；各模块都 < 300 行。超了在报告里说明。

## 验收命令（报告里贴输出）
```sh
cd /Users/gjy/pi-learning/xuegen && wc -l skills/course/course-close.mjs skills/course/close/*.mjs && node --test skills/course/course-close.test.mjs skills/course/close/rules.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|skipped)' && npm test 2>&1 | grep -E '^# (pass|fail)' && npm run lint:skills 2>&1 | tail -6
cd apps/desktop && npx vitest run --testTimeout=60000 src/agent/tools 2>&1 | tail -4
git diff --stat -- skills/course/course-close.test.mjs
```
拆之前先记下 `node --test skills/course/course-close.test.mjs` 的测试总数；拆之后两个测试文件加起来的总数必须**相等**，全部通过。

## 结束报告（中文，必须输出）
每个模块的行数和对外接口、依赖方向、测试总数前后对比、lint 输出、偏离规格之处及原因。
