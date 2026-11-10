# batch-stage4a-fix1（DeepSeek 返修，约 15 分钟）：沙盒里临时目录不存在 + 拦截时提示该用哪个工具

11-10 4a 真机验收发现：
1. **sandbox-runtime 给沙盒里的命令设 `TMPDIR=/tmp/claude`**（`node_modules/@anthropic-ai/sandbox-runtime/dist/sandbox/sandbox-utils.js` 约 684 行；`/tmp/claude`、`/private/tmp/claude` 在它自己的可写清单里），**但不创建这个目录**。本机没有 `/tmp/claude`，于是沙盒里 bash 的 here-doc（`cannot create temp file for here document: Operation not permitted`）、脚本里的 `mkdtemp(os.tmpdir())`（`ENOENT … mkdtemp '/tmp/claude/…'`）全部失败。
2. 模型用 bash 写课程页 / 看板 / 日历被沙盒拦下时，只看到 `Operation not permitted`，不知道该换哪个工具（老会话凭旧技能做事时尤其如此）。

**先写测试再改。**

## 硬约束
- 只改 `apps/desktop/src/agent/sandbox/runner.ts`、`apps/desktop/src/agent/sandbox/sandbox.e2e.test.ts`、新建或改 `apps/desktop/src/agent/sandbox/runner.test.ts`；需要时改 `guard/extension.ts` 的 `tool_result` 一处。不 commit/push、不加依赖。

## 要做的
1. `runner.ts`：第一次 `wrap` 初始化时（`SandboxManager.initialize` 之前），`mkdirSync("/private/tmp/claude", { recursive: true, mode: 0o700 })`；已存在就不动。若环境变量 `CLAUDE_CODE_TMPDIR` / `CLAUDE_TMPDIR` 设了，就创建那个目录（与 sandbox-runtime 的取值顺序一致）。创建失败要抛（让 guard fail closed），错误信息中文说明「沙盒临时目录建不了」。
2. `annotate` 之后追加一句**工具提示**（纯函数 `toolHint(stderrAfterAnnotate, rules)`，放 runner.ts 或单独小文件）：违规记录里出现的路径落在 `courses` 或 `coursesBoard` 下 → 追加「课程页和看板不能用 bash 写：课程会话用 course_close，总控用 course_plan。」；落在 `calendar` 下 → 「日历用 calendar_write 写。」；落在 `raw` 下 → 「原料只读。」。没有命中就不追加。规则路径用 `rulePaths`（与沙盒配置同一份），不手写。

## 测试
- `sandbox.e2e.test.ts`（真 seatbelt，darwin 才跑）：先 `rm -rf /private/tmp/claude`（测试前后都别留别的东西），`wrap` 后跑 `cat <<EOF > <workspace>/h.txt\nhi\nEOF` 成功、内容是 `hi`；跑 `node -e "require('fs').mkdtempSync(require('os').tmpdir()+'/x')"` 成功。
- `runner.test.ts`：`toolHint` 三类命中各一例、无命中不追加、两类同时命中都追加。
- 现有用例全过。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 src/agent 2>&1 | tail -4
```
## 结束报告（中文，必须输出）
新增测试数、改了什么、验收输出。
