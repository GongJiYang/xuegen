# batch-full-fix4-afterread-note（DeepSeek 返修，约 10 分钟，TDD）：讲后读打勾后旧备注「仍待读」留着

## 现象与根因（Claude 已查清）
- 现象：离散课程页 Today 有一行
  `- [ ] 讲后读 §1.1–1.4 核心页 · 2026-11-10 读（核心页已定：pp.1–5、…；完成条件：…）——今天开课时问过，用户没有说已读，仍待读`
  用户在界面点「读完了」后变成 `- [x] … ——今天开课时问过，用户没有说已读，仍待读（用户自报，未检查，2026-11-10）`。第二天总控简报据此报「讲后读存疑：那条勾着，但记录里写着仍待读」——误报。
- 根因：`skills/course/course-state.mjs` 的 `afterRead`（约 106–140 行，第 134 行）只把 `- [ ]` 换成 `- [x]` 再在行尾加「（用户自报，未检查，日期）」，行尾 AI 写的「——…」状态备注原样保留。

## 改法（先写失败测试，再改）
只改 `skills/course/course-state.mjs` 与 `skills/course/course-state.test.mjs`。不改 `SKILL.md`、别的文件。不 commit/push、不加依赖。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**
1. 先写测试（照 course-state.test.mjs 里已有 after-read 测试的写法），确认失败：
   - 带「——…仍待读」尾注的讲后读行 → after-read 后整行 = `- [x] 讲后读 <标签> · <日期> 读（核心页已定：…；完成条件：…）（用户自报，未检查，<date>）`，不再含「——」及其后的旧备注。
   - 没有「——」的行 → 结果与现在完全一样（回归）。
   - 「（…）」括号里本身含「——」的情形（如 `（完成条件：读完——能说出一个要点）`）：只去掉**最后一个右括号之后**的「——…」，括号内不动。
   - 返回的 pages（核心页页码）仍正确。
2. 实现：打勾前先把行尾「——」开头的备注去掉——从最后一个「）」之后第一次出现的「——」起到行尾删掉（行里没有「）」时，从第一个「——」起删），再去掉行尾空白，然后照旧加「（用户自报，未检查，日期）」。
3. 文件头注释第 10 行与 100 行附近补一句「行尾旧的 —— 备注去掉」。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/course-state.test.mjs 2>&1 | grep -E '^# (tests|pass|fail)' && npm test 2>&1 | grep -E '^# (pass|fail|todo)' && npm run lint:skills 2>&1 | tail -1
```

## 结束报告（中文）
第 1 步失败输出、改动、验收输出。

## 附带一条（上一单 fix2 的遗漏，1 行）
`apps/desktop/src/agent/guard/bash.ts`：`deny(TOO_MANY_PAGES)` 两处没带角色名，理由以「：」开头。改成 `deny(\`${label}${TOO_MANY_PAGES}\`)`。先在 `apps/desktop/src/agent/guard/roles.test.ts` 里 pdftotext 拒绝那条加断言：`reason` 以角色名开头（照同文件 chmod 那条的 reason 断言写法），确认失败再改。验收另跑：
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npx vitest run src/agent/guard 2>&1 | tail -3 && npm run -s typecheck && npm run -s lint
```
