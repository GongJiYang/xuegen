# guard — 工具层权限拦截（路线阶段 2）

按会话角色（总控 / 课程 / 自由）在 Pi 的 `tool_call` 钩子里检查 read / grep / find / ls / write / edit / bash / course_close / course_plan / cycle_open / calendar_write，清单写死在代码里（AuthBench：权限不交给模型生成）。被拦时把中文原因返回给模型并写一行审计；不弹框（界面讨论后再做）。

模块：

- `path.ts`：纯函数 `canonical` / `within` / `resolvedInput` / `expandTilde`。`realpath`（文件不存在时解析最深一层已存在的上级、拼回剩余段）→ NFC → 卷不区分大小写时转小写 → 分段比前缀。放行时 `input.path` 被改写成同一解析结果的未转小写形式，检查与执行同一条路径（Mind the Gap）。
- `vault-paths.ts`：规则路径。库用英文布局（`docs/platform/VAULT-NAMING.md`），每条规则只有一个路径（`wiki/knowledge`、`wiki/shelf`、`clippings`、`wiki/_generated/courses.md` 等）。读取侧的四个纯函数也都在这里：`isCredentialName`（文件名像不像凭据）、`deniedReadPaths`（凭据路径清单）、`isDeniedReadPath`（单个路径是否凭据）、`containedCredential`（递归搜索根里是否含凭据目录）。
- `facts.ts`：真实 `PathFacts`（`realpathSync.native`；按 `dev` 缓存的大小写翻转 `statSync` 探针）、`existsOnDisk`、`readVaultRoot`（`<home>/wiki.json`，与 `main/data/vault.ts` 同逻辑、因依赖方向在这里另写一份）、`guardRoots`。
- `roles.ts`：纯函数 `decide(role, tool, input, roots, canon, exists)`。
  - 读：**除凭据外一律放行**（用户 2026-11-09 定，模型可以读库外文件如 `~/Downloads/某篇.pdf`、`/etc/hosts`）。只有一条拒绝清单：`<home>` 下的 `auth.json`、`mcp-auth.json`、`models-store.json`，以及 `<home>` 下任何名字含 `auth` / `token` / `secret` / `key` 的文件（不区分大小写）；系统凭据位置 `~/.ssh`、`~/.aws`、`~/.gnupg`、`~/.config/gh`、`~/.netrc`、`~/.npmrc`、`~/.docker/config.json`、`~/Library/Keychains`。`<home>` 目录本身也拒（`ls <home>` 会把凭据文件名列出来）；`<home>` 的非凭据文件（`wiki.json`、`guard.log`、`desktop.json`）放行。`~` 写法与符号链接都先规范化再比对。
  - 读：**递归工具（`grep` / `find`）多一条祖先拒绝**。它们会走遍 path 下的整个子树，所以搜索根落在某个凭据目录（或 `<home>`）的祖先里时也拒（`grep ~`、`find /`、`grep ~/.config`、`grep ~/Library`），原因写明这个目录里含凭据目录 X、请缩小搜索范围。`read` 与不递归的 `ls`（Pi 的 `ls` 只列一层，没有递归参数）不受此限，`ls ~` 放行。
  - 写：先过硬性拒绝（`.git`、`.jj`、程序目录、`<home>`、`wiki/prompts/**` 与库根 `AGENTS.md`、库根本身、`raw/`）；然后剪藏目录只许新增（`write` 到不存在的路径放行，覆盖与 `edit` 一律拒绝）；最后按角色清单。
  - **库优先于「临时目录 / 工作区可写」**（11-09 真机验收返修）：目标在库内（`within(target, roots.vault)`）时只按库的规则判，工作区与临时目录的放行只适用于库外；工作区落在库里时同理。库可能整个放在临时目录下（测试库、备份、`~/.xuegen` 之外的自选位置），若先看 `rules.tmp`，库里的每一条规则都会被一句「临时目录可写」盖掉。判定函数在 `vault-paths.ts`：`isInVault` / `isOutsideVaultScratch`；`roles.ts` 与 `bash.ts` 共用同一对谓词，不各写一份。
  - 角色清单：总控写意图页（`profile.md`、`subjects*`、`cycles/`），课程页与看板只经 `course_plan` 计划事务（整理批 1）；课程写本科目页（讲解偏好），课程页与概念页只经 `course_close` 收课写入（阶段 3，见「专用工具」）；自由写 `knowledge/`。所有角色都能写工作区、`/private/tmp`、`log.md`、`index.md`、书房、阅读队列、摘录、闪卡、来源登记、分析与实体页（这些出自任何会话都能跑的工作流）。
  - 日历笔记 `wiki/calendar/**` 任何角色都不直接写（只经 `calendar.mjs`，原子写入且正文为空时删文件）。
  - bash：只拦能在命令文本上确定的三类——命令里出现凭据路径、递归删除（`rm -r` / `-rf` / `-fr` / `-Rf` / `--recursive`）的目标不在工作区或 `/private/tmp`（同样库优先：目标在库内时即使也在临时目录里也拒）、非 `course-state.mjs` 的 `chmod`/`chflags` 课程页。其余放行并审计；放行后命令改写进阶段 4a 的系统沙盒（`../sandbox/`）执行——写受保护位置、读凭据、连外网由操作系统拦下。
- `session-role.ts`：纯函数 `roleFromHints` + `inferSessionRole`。从会话文件开头的 `⟦xuegen:open|slug|…⟧` 标记、`desktop.json` 的记忆映射、旧式开课文本推出角色，推不出按 `free`。
- `audit.ts`：`<home>/guard.log` 一行一条 JSONL（时间、会话 id、角色、工具、规范化路径或命令前 200 字、放行与否、原因），超过 5 MB 轮转为 `guard.log.1`；写失败或轮转失败只打 stderr（主进程转成 `[agent]` 前缀），判定照旧生效。
- `extension.ts`：`createGuardExtension(options)` → `ExtensionFactory`，在 `session.ts` 的 `extensionFactories` 里排第一。角色、`sessionId` 都是每次调用现读，所以会话绑定后落定的角色也生效。

## 专用工具

`course_close`（`../tools/course-close-tool.ts`，阶段 3c）在 agent 进程里调用 `skills/course/course-close.mjs`，模型不再经 bash 收课。判定规则（`roles.ts` 的 `decideCourseClose`）：

- 只有课程会话能用；其它角色调用被拒（「收课请在那门课的会话里做」）。
- `slug` 参数（stage、undo 带）必须等于本会话的课程 slug。
- `staging` 参数（add、check、commit、abort 带）规范化后必须在 `<工作区>/.close/` 里，且目录名以 `<slug>-` 开头。
- `add` 的 `path` 只做形状检查：必须是库内相对路径、不含 `..`；这个页归不归这门课由脚本的 `isOwned` 判。
- 缺参数不在 guard 拒：工具自己抛出中文错误让模型补齐。

另两个专用工具：`course_plan`（`../tools/course-plan-tool.ts`，4a-i1）只给总控：建课、改计划、刷新看板；`calendar_write`（`../tools/calendar-write-tool.ts`，4a-i2）任何会话都能写日历笔记。批 5a 加的 `cycle_open`（`../tools/cycle-open-tool.ts`）也只给总控：开下一周期走 `skills/cycle-plan/cycle-open.mjs` 周期事务，`staging` 必须在 `<工作区>/.cycle/` 里，其它角色拒（「建周期在总控会话里做」）。

## 已知缺口（要 Claude 定）

- **`mcp__*` 与其它自定义工具（`toolName` 不在 read/grep/find/ls/write/edit/bash/powershell/course_close 里）默认放行**，只记一条审计（`reason` 写明「默认放行（待界面阶段收紧）」）。guard 看不到它们的参数语义（MCP 各服务器自定义 schema），按路径清单判不了；风险是 MCP 里的写文件/执行类工具绕过了上面所有规则。收紧方式待定：要么按 `mcp__<server>__` 前缀维护白名单，要么在界面阶段给每个 MCP 服务器一个角色。
- 系统提示里给的技能脚本（`skills/**`）本身由 bash 调用，guard 只按命令文本做上面三类检查；脚本内部写什么由阶段 4a 沙盒按角色限制（4a-i2 已接入）。
- **bash 里的递归搜索（`grep -r ~`、`find /`）没有祖先拒绝**：bash 只按命令文本拦「命令里出现凭据路径」这一条，而 `grep -r ~`、`find /` 并不点名凭据，判定不了它们会走进哪里。这一层由阶段 4a 沙盒的 denyRead 兜住（4a-i2 已接入；`<home>` 下按名字匹配的凭据沙盒表达不了，仍是缺口）；`grep` / `find` 工具的祖先拒绝只覆盖工具调用，不是 bash 的等价物。
