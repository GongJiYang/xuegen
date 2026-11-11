# batch-full-fix2-pdf-pages（DeepSeek 返修，约 15 分钟，TDD）：原书一次读超过 10 页

## 现象与根因（Claude 已查清）
- 用户 11-08 定的规矩：课上读原书**一次导出不超过 10 页**（`skills/course/SKILL.md` 第 50、138 行；`reading/SKILL.md` 第 55 行「按页读」）。
- 11-10 全量测试，测试窗口开 CTM D1（会话 `/tmp/xg-e2e/home/sessions/--tmp-xg-e2e-workspace--/2026-11-10T15-52-24-761Z_*.jsonl`）：模型跑了 `pdftotext -f 1 -l 20`（20 页）、`-f 40 -l 58`（19 页）、`-f 60 -l 76`（17 页）。
- 根因：规矩只写在技能文字里，没有任何地方强制；模型直接用 bash 跑 `pdftotext`，页数随它定。修法：在 bash 护栏里写死。

## 改法（先写失败测试，再改代码）
只改 `apps/desktop/src/agent/guard/bash.ts` 与 `apps/desktop/src/agent/guard/roles.test.ts`（或新建 `bash.test.ts`）。不改 `SKILL.md`、别的文件。不 commit/push、不加依赖。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**

1. 先写测试（`decide(…, "bash", { command }, …)` 照 roles.test.ts 第 432 行附近 chmod 那条的写法；三种角色都测一遍），确认失败：
   - 拒绝：`pdftotext -f 40 -l 58 raw/books/x.pdf -`；`pdftotext -f 1 -l 11 x.pdf -`（11 页）；`cd /v && pdftotext -layout -f 60 -l 76 raw/x.pdf - | grep foo`；`pdftotext raw/x.pdf -`（没有 -f/-l，整本）；`pdftotext -f 5 raw/x.pdf -`（只有 -f）。
   - 放行：`pdftotext -f 45 -l 48 x.pdf -`；`pdftotext -f 1 -l 10 -layout x.pdf -`（正好 10 页）；`pdftotext -f 74 -l 79 x.pdf - | sed -n '1,200p'`；`pdftotext -f $A -l $B x.pdf -`（非数字，判断不了，放行）；`node bookshelf.mjs today …`；`echo pdftotext`（不是命令位置——只认分段后第一个词或 `/…/pdftotext` 的情形，分段规则照 `rmTargets` 的 `&&|\|\||[;|\n]`）。
2. 实现：`decideBash` 里，在 chmod 检查之后加：对每个命令分段，第一个词是 `pdftotext`（或以 `/pdftotext` 结尾）时，读 `-f N`、`-l M`；缺任何一个 → 拒绝；都是数字且 `M - N + 1 > 10` → 拒绝；否则放行。拒绝理由（中文，给模型看）：`${label}：原书一次最多读 10 页（pdftotext -f <起> -l <止>，止 − 起 + 1 ≤ 10）；要看更多就分几次读，找章节先看 PDF 书签或目录页。`
3. 文件头注释的「Three things」改成四条，补一句这条。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npx vitest run src/agent/guard 2>&1 | tail -4 && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests|Test Files"
```

## 结束报告（中文）
第 1 步失败测试输出、改了哪几行、验收输出。
