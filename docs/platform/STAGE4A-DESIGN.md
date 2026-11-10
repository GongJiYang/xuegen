# 阶段 4a 系统沙盒：定稿设计（2026-11-09，用户已定）

来源：`ARCH-DISCUSSION-1109.md` 第 7.2、10.1 节；阶段 2 的已知缺口（bash 不受角色清单约束）。

## 用户定的三点
1. **写受保护文件的脚本做成专用工具**，在沙盒外由 agent 执行、按角色放行：`course_close`（课程页、概念页，包 `course-close.mjs`）、`calendar_write`（`calendar.mjs`）、`cycle_write`（`cycle.mjs` 的写命令）。bash 里写这些位置一律被沙盒挡住。
2. **bash 网络默认全拒**，只放本机 AnkiConnect `127.0.0.1:8765`；以后要用的站点再加白名单。模型 API 由 agent 进程自己发，不经过沙盒。
3. **依赖 `@anthropic-ai/sandbox-runtime`，锁定精确版本 0.0.81**；升级前跑回归测试（含 issue #8 的 mv 绕过）。

## 做法
- 在 guard 的 `tool_call` 处理器里，对 `bash` 放行后把 `input.command` 改写为 `SandboxManager.wrapWithSandbox(command, …, { commandId: <tool call id>, commandText: command })` 的结果；被沙盒拦下的 stderr 用 `annotateStderrWithSandboxFailures` 补上原因。
- 每个角色一份沙盒配置，**由代码按阶段 2 的同一份规则生成**（不另写一套）：
  - `allowWrite`：工作区、`/private/tmp`、`os.tmpdir()`，加上该角色本来就能写的库内目录（书房、阅读页、摘录、卡片、来源、分析、实体）与文件（`log.md`、`index.md`）。
  - `denyWrite`：库的版本目录、程序目录、`XUEGEN_HOME`、`raw/`、库规则；受保护路径**及其每一层上级目录**都禁止删除与改名（issue #8）。
  - `denyRead`：阶段 2 的凭据清单（同一个函数生成）。
  - `network.allowedDomains`：空；只放 `127.0.0.1:8765`。
- `/tmp` 一律写成 `/private/tmp`；`sandbox-exec` 用绝对路径（库内部已处理，核对）。

## 待定（Claude 11-09 记）
- ~~开课时的 shift 怎么跑~~ **用户 11-09 定：并进 `course_close`，加一个 `shift` 动作**（课程页只有一个写入口；顺延也走暂存→校验→提交，jj 记一笔「顺延」）。作为阶段 3 的 3d 小批，在 4a 接入前做完。

- **用户 11-10 定（4a-1 实测后）**：
  - Anki 端口：沙盒里直连 `127.0.0.1:8765` 会被拦（`NO_PROXY` 含 127.0.0.1，seatbelt 只放行到代理端口）。**不开 `allowLocalBinding`**；anki-sync 连 AnkiConnect 时显式走沙盒代理（`HTTP_PROXY`），其他本机端口照挡。
  - 课程看板 `courses.md`（`coursesBoard`）留在 denyWrite；**看板由 `course_close` 在提交时进程内重画**，不再经 bash 跑 `render-board.mjs`/`course-state.mjs dashboard`。

## 分批（阶段 3 之后）
- **4a-1（Devin）**：沙盒配置生成（纯函数）+ bash 改写 + 三个专用工具的外壳（`course_close` 先接 3a 的脚本）。
- **4a-2（DeepSeek）**：审核 + 回归测试（写受保护路径失败、mv 绕过失败、读凭据失败、Anki 端口可连、外网不通）。
- **4a-3**：技能文字改用专用工具（Claude）+ 真机验收。
