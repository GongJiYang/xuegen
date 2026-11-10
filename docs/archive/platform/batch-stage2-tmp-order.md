# batch-stage2-tmp-order（DeepSeek 返修）：库的规则要优先于「临时目录可写」

Claude 真机验收（11-09 21:02）发现：测试库在 `/private/tmp/xg-e2e/vault/GJY`，总控会话 `write wiki/知识/concepts/x.md` 被**放行**（应拒）。原因：`roles.ts` 的 `writeAllowed` 第一步 `withinAny(target, rules.tmp)` 就返回 true，库在临时目录下时库的全部规则失效。真实库不在 /tmp，但顺序本身是错的：更具体的位置（库）必须先判。

## 硬约束
- 只改 `apps/desktop/src/agent/guard/{roles,bash,vault-paths}.ts`、它们的测试、`guard/README.md`。不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`。

## 要做的
1. `decideWrite` / `writeAllowed`：目标在库内（`within(target, roots.vault)`）时**只按库的规则判**，临时目录与工作区的放行不适用；不在库内时才看工作区与临时目录。工作区若在库内（不常见）同理：库优先。
2. `bash.ts` 的递归删除检查：目标在库内时即使也在临时目录里，按「不在工作区」拒绝（同样库优先）。
3. 测试：库根放在 `/private/tmp/...` 下时，总控写 `wiki/知识/concepts/x.md` 拒、写 `wiki/知识/extracts/x.md` 放行、课程会话写自己的课程页放行、写别人的课程页拒、库外的 `/private/tmp/scratch.json` 放行、`rm -rf <库>/wiki` 拒。用 `mkdtemp`（落在 tmpdir 下）建库根就能自然覆盖。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 src/agent 2>&1 | tail -4
```
## 结束报告（中文，必须输出）
改了什么、新增测试数。
