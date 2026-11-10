# batch-stage4a-fix2（DeepSeek 返修，约 15 分钟）：收课截图改由 `course_close snapshot` 在沙盒外生成

11-10 4a 真机验收：收课第 9 步截图用 bash 跑 `render-snapshot.mjs`，它要起本机 Chrome（headless），**Chrome 在系统沙盒里起不来**（`Snapshot failed: Chrome exited before becoming ready`）。截图是派生输出、写进暂存目录，交给 `course_close`（沙盒外运行）来跑最合适。**先写测试再改。**

## 硬约束
- 只改 `skills/course/course-close.mjs`、`skills/course/course-close.test.mjs`、`skills/course/references/close.md`、`apps/desktop/src/agent/tools/course-close-tool.ts`、`apps/desktop/src/agent/tools/course-close-tool.test.ts`。别碰 `render-snapshot.mjs`、`SKILL.md`、`references/snapshot.md`（Claude 改）。不 commit/push、不加依赖。

## 要做的
1. `course-close.mjs snapshot <暂存目录> <report 相对路径> <png 相对路径> [--json]`：
   - `report`、`png` 都是**暂存目录内**的相对路径（`isSafeRelPath` 校验，不许绝对路径、`..`）；`report` 必须存在且是普通文件。
   - `png` 必须以 `.png` 结尾，且 `isOwned(png, manifest.slug, manifest.subject)` 为真、路径在 `wiki/courses/<slug>/snapshots/` 下；否则中文报错，什么都不写。
   - 建好 png 的父目录，用 `execFileSync(process.execPath, [<本目录>/render-snapshot.mjs, <staging>/<png>], { input: readFileSync(<staging>/<report>), env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["pipe", "pipe", "pipe"], timeout: 60000 })`。
   - 成功输出 `{ snapshot: <png 相对路径> }`；失败：退出码非 0，输出中文原因（取 stderr 里第一行有用的信息），暂存目录不留半张图。
   - 截图之后照常 `check`/`commit`，png 作为新文件随事务提交（现有 planCheck 已支持暂存里的新文件，核对一下）。
2. 工具：`CloseAction` 加 `"snapshot"`；`courseCloseArgs` 加 `case "snapshot"`：缺 `staging`、`report`、`out` 任一个抛中文错；返回 `["snapshot", staging, report, out, "--json"]`。schema 加 `report?`、`out?`（中文说明：「snapshot 用：暂存目录里的报告 JSON 相对路径」「snapshot 用：暂存目录里的 PNG 相对路径，wiki/courses/<slug>/snapshots/YYYY-MM-DD-NN.png」）；action description 加「snapshot 在暂存里生成收课截图（沙盒外跑，bash 起不了 Chrome）」。
3. `references/close.md` 用法块加 snapshot 一行和一句说明。
4. 顺手（4a-fix1 遗留）：`apps/desktop/src/agent/sandbox/runner.ts` 的 `ensureSandboxTmpDir` 现在只在第一次 `wrap` 调一次；macOS 会清 `/tmp`，长时间运行后目录可能没了。改成**每次 `wrap` 都调**（`mkdirSync recursive` 已存在时开销可忽略），并在 `runner.test.ts` 或 e2e 里加一条：第一次 wrap 后删掉目录，第二次 wrap 后 here-doc 仍成功。（这一条允许改 `runner.ts` 和它的测试。）

## 测试
- `course-close.test.mjs`：路径校验（绝对、`..`、不是 .png、不属于本课、不在 snapshots 下、report 不存在）都拒且不建文件；用 `CHROME_PATH` 指向一个**假的可执行脚本**（测试里写一个 sh/node 小脚本，按 render-snapshot 的启动协议不好伪造的话，就改测「Chrome 不存在 → 中文报错、不留文件」并在报告里说明）；真 Chrome 在本机存在时加一条真渲染用例（`/Applications/Google Chrome.app` 不存在就 skip），stage → 写 report → snapshot → check → commit，jj 提交里有这张 png。
- `course-close-tool.test.ts`：snapshot argv 逐字、缺参数各抛中文错。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/course-close.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|skipped)' && npm test 2>&1 | grep -E '^# (pass|fail)'
cd apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 src/agent/tools 2>&1 | tail -4
```
## 结束报告（中文，必须输出）
新增测试数（真 Chrome 用例是否真跑）、改了什么、验收输出。
