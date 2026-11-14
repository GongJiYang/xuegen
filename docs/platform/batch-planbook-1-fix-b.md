# batch-planbook-1-fix-b（DeepSeek，约 15 分钟）：界面文案按新叫法改

背景：`docs/platform/WORDING-AUDIT-1111.md` 与 `docs/desktop/SKIN-LEDGER.md` 第三节（11-11 更新）。用户 2026-11-11 定：辅助课对用户叫「带读」；日子类型「深度日」对用户叫「主攻日」（数据里仍是 `深度`，类型键不改）；「核心页」不对用户说；Anki 直连、不经 Obsidian；「结课」只给主项课。

约束：只改 `apps/desktop/src/renderer/core/strings.ts`，以及因期望值变化而失败的测试文件（只改期望字符串）；**`CycleDayType` 的键（`深度` 等）和任何数据值都不改**，只改显示文字；不 commit / push；**自己做完，不要调用 `pi`、`devin` 或别的 agent**。

## 改动（行号是大概位置）
1. 13 行 `深度: "深度日"` → `"主攻日"`；235 行 `typeShort` 的 `深: "深"` 显示值 → `"主"`（键 `深度` 不改）。
2. 252 行 `+ 辅助 ${aux}` → `+ 带读 ${aux}`；253 `auxTag: "辅助"` → `"带读"`；310 `auxPrefix: "辅助 · "` → `"带读 · "`；382 `auxTitle` → `"带读"`；443 `sectionAux` → `"带读"`。
3. 358 `auxEmpty: "辅助位空着"` → `"没排带读"`。
4. 380 / 381 图例：`= 深度课` → `= 主攻课`；`下行辅助` → `下行带读`；`读书 = 读原书` → `读书 = 书房自读`。
5. 506 `shelfCore` → `"讲后读已读"`；509 `shelfCoreNote` 里「通读」→「自读」。
6. 524 `newHint` → `"写进卡片页，直接同步到 Anki"`；545 `syncNote` → `"写进卡片页后直接同步到 Anki（Anki 要开着）。"`。
7. 626 `reading` 的说明 → `"阅读队列、书房、摘录"`。
8. 361 `courseEnd`：找出所有调用点（`grep -rn "courseEnd" apps/desktop/src`）。签名改成 `courseEnd: (day: string, role: "main" | "aux" = "main"): string => role === "aux" ? \`预计 ${day} 学完\` : \`结课 ${day}\``，调用点能拿到课程角色（`CourseRole`）的就传进去；拿不到的不改并在报告里列出。
9. **不要改** 708 行 `deep: "深度"`（那是讲解风格）。

## 测试
- 先跑一遍桌面测试记下基线；改完后因期望字符串失败的测试，只把期望改成新文字（不改断言逻辑），逐个在报告里列出。
- 给第 8 条加一条测试（放在已有的 strings 测试或 `strings.placement.test.ts` 里）：aux → 「预计 12-28 学完」，main / 不传 → 「结课 12-23」。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests|Test Files" && grep -n "辅助\|Obsidian\|核心页\|教材通读" src/renderer/core/strings.ts
```
（最后的 grep 应只剩不对用户显示的注释，或为空；有剩的在报告里逐条说明为什么留。）

## 结束报告（中文）
每条改了哪行；改了期望的测试清单；第 8 条调用点处理情况；验收输出。
