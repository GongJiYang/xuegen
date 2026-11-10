# batch-stage2-read-fix（DeepSeek 返修）：读取放宽为「除凭据外都能读」

用户 11-09 定：模型可以读库以外的文件（例如 `~/Downloads/某篇.pdf`），只有凭据与密钥不能读。写入规则一概不变。

## 硬约束

- 先读 `apps/desktop/AGENTS.md`、`apps/desktop/src/agent/guard/README.md`。
- 只改 `apps/desktop/src/agent/guard/roles.ts`（`decideRead`）、`guard/vault-paths.ts`（如需）、`guard/README.md`、`guard/roles.test.ts`、`guard/extension.test.ts`。别碰 `skills/**`、`main/data/**`（另一个审核在改）。
- 不加依赖、不放宽 eslint、不加 `eslint-disable`、不 commit/push、不读写真实 `~/.xuegen/`。

## 要做的

1. `decideRead`：先查 `deniedReadPaths`（不变，命中就拒），**其余一律放行**；删掉「只能读库、工作区、程序目录和 /private/tmp」那条拒绝及 `readableHomeFiles` 的特殊放行（如果它因此不再被用到，就删掉，别留死代码）。
2. **`XUEGEN_HOME` 本身**：除凭据文件外，`<home>/` 下的其它文件（`wiki.json`、`guard.log`、`desktop.json` 等）现在可读——这是用户同意的。但核对 `deniedReadPaths` 覆盖了 `<home>` 下所有凭据类文件：`auth.json`、`mcp-auth.json`、`models-store.json`，以及 `<home>` 里任何名字含 `auth`、`token`、`secret`、`key`（不区分大小写）的文件；`~/.ssh`、`~/.aws`、`~/.gnupg`、`~/.config/gh`、`~/.netrc`、`~/.npmrc`、`~/.docker/config.json`、macOS 钥匙串 `~/Library/Keychains`。缺的补上（名字匹配写成纯函数 + 测试）。
3. 拒绝原因保持中文、点名是哪个凭据路径（现有文案可沿用）。
4. 测试：`~/Downloads/x.pdf`、`/Users/<任意>/Desktop/a.md`、`/etc/hosts` 三种角色都放行；上面每个凭据路径（含经符号链接、大小写不同、`~` 写法）都拒绝；`<home>/wiki.json`、`<home>/guard.log` 放行；`<home>/github-token.txt` 拒绝。删掉与新规则冲突的旧断言（在报告里列出删了哪些）。
5. `guard/README.md` 的读取规则一节同步改写。

## 验收命令（贴出最后几行）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 src/agent 2>&1 | tail -6
```

## 结束报告（中文）

改了哪些文件；凭据清单最终版；删改了哪些旧测试断言；新增测试数。

## 补充（Claude 审第一次交回后，19:45）

第一次执行没写结束报告，且留下问题。接着做，不要推翻已改的 `isDeniedReadPath` / `isCredentialName`：

6. **修编译**：`roles.test.ts` 第 217 行用了 `homedir` 没 import（typecheck 报 TS2304，测试「resolves symlinks before the check on the real filesystem」失败）。
7. **递归搜索的祖先漏洞**：`grep`、`find`（以及 `ls` 若带递归参数）的 `path` 若是某个凭据路径的**祖先目录**（例如 `~`、`/Users`、`/`、`~/.config`、`~/Library`），会递归走进凭据目录。规则：对 `grep`/`find`，若任何 `deniedReadPaths` 条目或 `<home>` 在 target 之内（`within(entry, target)`），拒绝，原因写明「这个目录里含凭据目录 X，请缩小搜索范围」；`read` 和不递归的 `ls` 不受影响。写成纯函数 + 测试（`grep ~` 拒、`find /` 拒、`grep ~/Documents` 放行、`grep <vault>` 放行、`ls ~` 放行）。
8. bash 里同理不追加（阶段 4 沙盒管），只在 `guard/README.md`「已知缺口」写一句。
9. 最后**必须输出结束报告**（按上面「结束报告」一节）。
