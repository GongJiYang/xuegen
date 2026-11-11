# batch-full-fix13-card-end（DeepSeek 返修，约 15 分钟，TDD）：卡片块缺 END——末尾的静默丢、中间的和下一块粘成一张错卡

## 现象与根因（B6 报告 + Claude 读代码）
`skills/wiki-save/anki-sync.mjs` `parseCardPage`（约 120–160 行）找块结尾用 `lines.findIndex((later, j) => j > i && END_RE.test(later.trim()))`：
- **末尾一块缺 END** → `end === -1` → `break`：这块与之后的一切静默消失，push 和 `flashcards stats` 都当它不存在、不报错（B6 测试 `anki.full.test.mjs` 里的 todo）。
- **中间一块缺 END**（Claude 读代码发现，B6 没测）→ 找到的是**下一块的 END**，两块被合成一块：正面/背面里混进下一块的 `START`、类型行和内容，push 会往 Anki 写一张错卡，下一块本身也丢了。11-10 卡片对齐时真实库里修过 3 处「缺 END/错位 ID」，这种情况真实发生过。

## 改法（先写失败测试，再改）
只改 `skills/wiki-save/anki-sync.mjs`、`skills/wiki-save/anki.full.test.mjs`（去 todo）、`skills/wiki-save/anki-sync.test.mjs`、必要时 `skills/wiki-save/flashcards.mjs` 与其测试。不 commit/push、不加依赖。**绝不连真实 Anki、绝不打开 collection.anki2**（假 AnkiConnect 照现有测试写法）。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**
1. 先写 / 去 todo，确认失败：
   - 末尾块缺 END：push（dry-run 与真跑）结果 `failed` 里有这一块，`error` 为「缺少 END」，退出码按现有「有 failed」时的约定；文件不变。前面完整的块照常同步。
   - 中间块缺 END（A 缺 END，B 完整）：A 进 `failed`（「缺少 END」），**B 照常作为独立一块同步**，A 的内容不出现在任何发给假服务的字段里。
   - `flashcards stats`：缺 END 的块计入一个新数字（如 `broken`，或沿用现有字段——按实现选，测试照实际），不计入 total/unsynced；人类可读摘要里提一句「N 块缺 END」。
2. 实现：找 END 时遇到下一个 `START` 先停——`START` 之前没有 `END` 就把当前块记成 broken（`{ start: i, error: "缺少 END" }`），从那个 `START` 继续解析；文件结尾仍没 END 同样记 broken。`parseCardPage` 返回值加 `broken` 数组；push 把它们放进 `failed`；`flashcards.mjs` 用到 `parseCardPage` 的地方同步。
3. 已有测试全部照旧通过。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/wiki-save/*.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|todo)' && npm test 2>&1 | grep -E '^# (pass|fail|todo)' && npm run lint:skills 2>&1 | tail -1
```
## 结束报告（中文）：第 1 步失败输出、改动、验收输出。
