# batch-panel-b-markers（DeepSeek，约 15 分钟，先写测试）：代发给模型的指令一律折叠成中文动作名

来源：场景走查发现（`docs/platform/PLANBOOK-1111.md`「场景走查发现」第 3 条）+ 总控面板计划 `docs/desktop/PANEL-PLAN.md`「顺手认领」。现象：建课、周核实、起草卡片、剪藏这几个按钮发给模型的长指令（含 `/skill:`、路径、「辅助」「核心页」等内部词）原样显示成用户消息。已有机制：`renderer/core/chat/action-marker.ts` 的 `withActionMarker` / `splitActionMarker`，带标记的消息在对话里显示成 `strings.actions[...]` 的动作名（点开才看原文）。
约束：只改下面提到的文件及其测试；文案只进 `strings.ts`；不 commit / push；**自己做完，不要调用 `pi`、`devin` 或别的 agent**。`npm test` 末尾 `lint-wording` 0 处。

1. **先写测试**（`core/chat/action-marker.test.ts` 及下面各调用处的测试）：每个按钮发出的文字 `splitActionMarker` 后 `action` 不是 null，`actionLabel` 是预期的中文。先跑一次确认失败。
2. `action-marker.ts`：`ACTION_KINDS` 加 `"new-course"`、`"verify"`、`"clip"`、`"ask"`；`strings.actions` 加 `"new-course": "建课"`、`verify: "周核实"`、`clip: "剪藏"`、`ask: "交给总控"`。
3. 给这些调用处套上标记（带课程的传 `{ slug, title }`，这样显示「周核实 · CTM」）：
   - `core/board/course-prompts.ts` 的 `newCoursePrompt` → `"new-course"`（课程还没有 slug：只传 title 的写法——`withActionMarker` 第三个参数要 slug，用 `request.title` 的 slug 化结果或改成允许只给 title；选一种并在报告里说明）。
   - `strings.cycle.verifyPrompt(slug)` 的两个发出处（`core/board/use-control-planbook.ts:64`、`core/board/use-shell-panels.ts:108`）→ `"verify"`，课程标题从已有的课程列表取（取不到就不带课程）。
   - `core/board/use-shell-panels.ts:101` 起草卡片 `onDraftCards` → `"cards"`（`prompt` 是面板传来的自定义文字时也套）。
   - `App.tsx:214` 的 `clipPrompt(...)` → `"clip"`（标记加在 `clipPrompt` 函数里，`use-reading.ts`）。
4. 新文件 `core/board/control-prompts.ts`（+ 测试）：总控面板书房按钮发给总控的话，每个都用 `"ask"` 标记、带 `{ slug: book.slug, title: book.short }`，正文要求总控**先在聊天里给看改动、用户说可以才写**（规则 9）：
   - `addBookPrompt({ title, slug, subject, mode: "guide" | "self", days: string[], target: string | null })`：按 `reading` 技能「书房」把这本书排进书房（读法、带读的星期几、可选目标日期）；带读同一天只排一本。
   - `changeModePrompt(book)`：问用户想换成哪种读法，再按技能改。
   - `setTargetPrompt(book, date | null)`：用 `bookshelf.mjs target` 设 / 清目标日期。
   - `pausePrompt(book)` / `resumePrompt(book)`：用 `bookshelf.mjs pause` / `resume`（带读的书是辅助课：说明要停 / 接着排那门课的带读，按 `course` 技能改计划）。
   正文里不写用户看不懂也无妨（会被折叠），但必须含 `/skill:reading` 或 `/skill:course` 指明技能。测试：每个函数 `splitActionMarker` 后 action 为 `ask`、标题是书的短名、正文含「说可以才写」这一层意思的固定句（放 `strings.panel.askConfirm`）。
5. 文档：`docs/desktop/SKIN-LEDGER.md` 第二节「上课按钮」或「总控」行补一句「建课 / 周核实 / 起草卡片 / 剪藏 / 面板书房按钮发出的指令都折叠成动作名」；`docs/platform/PLANBOOK-1111.md` 场景走查发现第 3 条末尾加「（11-12 batch-panel-b 已修）」。

## 这段文字还在哪些地方显示
`grep -rn "sendCommand(\|controller.send(\|startSession(" apps/desktop/src/renderer --include=*.ts --include=*.tsx | grep -v test` 的每一处都核对：发的是不是带标记的文字；不带的在报告里列出并说明为什么不需要（如练习题「提示 / 跳过」、用户自己输入）。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests |Test Files" && npm run -s build 2>&1 | tail -1
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -1
```

## 结束报告（中文）
每条改了哪几行；先失败的测试；上面 grep 的核对表；验收输出。
