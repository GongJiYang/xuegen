# 书房与 Anki / FSRS 渐进阅读：核实与方案（2026-11-09）

用户要求：①书房的书与课程区分，跟课程有关的书多一层「核心页已读」参考；②书的排期依赖 Anki 的 FSRS 做渐进阅读。用户附了三份材料（December 的 Obsidian→Anki 流程、Thoughts Memo 译文、一份配置要求清单）。

## 一、本机事实（只读核查，未改任何东西）

| 项 | 值 | 来源 |
|---|---|---|
| Anki | 25.09，macOS 26.5.1 | `/Applications/Anki.app` Info.plist、`sw_vers` |
| 插件 | AnkiConnect、FSRS Helper（Postpone/Advance/Load Balance/Easy Days/Disperse Siblings） | `addons21/*/meta.json` |
| 渐进阅读插件 | **未安装** | 同上 |
| FSRS | **整库已开**（`fsrs=true`）；负载均衡开 | collection `config` 表（只读打开） |
| 预设 | 只有 1 个「系统默认」，15 个牌组共用；期望保留率 0.9；**参数从未优化**（为空，用默认参数） | AnkiConnect `getDeckConfig`、`deck_config` 表 |
| 规模 | 545 张卡（复习中 57、新卡 471），复习记录 220 条 | `cards`、`revlog` 表 |

## 二、外部核实

| 结论 | 依据级别 | 来源 |
|---|---|---|
| FSRS 只能整库开关，不能部分牌组 FSRS、部分 SM-2 | **官方** | Anki 手册 deck-options：“FSRS can only be enabled globally” |
| 参数与期望保留率按**预设**分开；优化默认只用本预设牌组的复习记录 | **官方** | 同上：“Parameters and desired retention are preset-specific”；“calculated from the review history of all decks using the current preset” |
| 难度差别大的牌组建议分预设 | **官方** | 同上 |
| IR 插件（tvhong 分支）最新 4.13.0（2025-04-23）；变更记录最后一次写明的兼容修复是「Fix compatibility with 23.10」；**没写支持 25.x，没提 FSRS** | 仓库变更记录 | `tvhong/incremental-reading` CHANGELOG |
| 「Priorities 模式更好用、与 FSRS 一起用没问题」 | **用户经验**（论坛 vhong 2024-04-25，v4.11.9，当时 Anki 23.x/24.x） | Anki 论坛 21331/27 |
| AnkiWeb 插件页 | 无法读取（需 JS），版本支持范围未核实 | — |
| fsrs4anki 对 IR 插件兼容性标「Unsure」 | 第三方说明（用户材料转述，未直接核） | fsrs4anki README |

结论：IR 插件在 **Anki 25.09 上是否可用，没有任何来源证实**，必须在测试 profile 里实测才能下结论。

## 三、关键判断：FSRS 不该给「读书」排期

- FSRS 是**记忆模型**：根据你对一张卡「想起来没有」的评分（Again/Hard/Good/Easy）估计遗忘，安排下次复习。读一段书没有「想起来没有」这个动作，评不了分；硬把阅读当卡片评分，会把假数据喂给 FSRS，**还会污染同一预设里正式卡片的参数优化**。用户附的材料本身也这么说：「不能把整篇文章当回忆卡，指望 FSRS 自动决定什么时候读」。
- SuperMemo 的渐进阅读里，阅读材料（topic）用的是**优先级 + 间隔逐渐拉长**，不是记忆模型；只有从阅读里摘出来的问答 / 挖空卡（item）才进记忆模型。
- 所以正确的分工是：**读什么、什么时候读 → 阅读调度（优先级、位置、间隔）**；**读完记住什么 → 摘录 → 制卡 → FSRS**。

## 四、方案（推荐）

### A. 书与课程分开，课程相关的书多一层「核心页已读」
- 书房只放书；课程只放课。书页 frontmatter 加 `course: <课程 slug>`（可多门）表示「与课程有关」。
- 有 `course` 的书：脚本从课程页 `Today` 里**打过勾的讲后读行**收集核心页，在书页生成「## 核心页已读」一节，并在每天那段旁标出「其中 pp.40、43–46 讲后读读过」——**照读不跳**（用户 11-08 定），只作参考。
- 没有 `course` 的书：没有这一层。

### B. 渐进阅读：书房负责阅读调度，Anki/FSRS 只管从书里做出的卡
- 阅读调度留在书房（Obsidian 为中心，与 December 的流程一致：Obsidian 是材料中转站，Anki 是复习手段）：每天一段 ≤ 10 页、优先级、没读顺延。
- 读的时候摘录（`wiki/知识/extracts/<书>/`），摘录按 `wiki-save` 的制卡规则做成问答 / 挖空卡，经 Obsidian_to_Anki 进 Anki，由 FSRS 复习。
- 读完一本写「读后总结」（Thoughts Memo 的做法：评论 / 摘要 / 引用 / 问题 / 我的想法），落在书页末尾；从总结里补卡。

### C. Anki 侧最小改动（全部等用户确认后、先备份再做）
1. **不装 IR 插件**（25.09 未证实可用；书房已承担阅读调度）。若用户坚持要在 Anki 里读，按第五节在测试 profile 实测。
2. FSRS 保持整库开启（已经是）——**不改**。
3. 新建一个预设「书房」，只给从书里做的卡的牌组（如 `书房::Epp`）用，让读书卡与课程卡的参数分开优化（官方建议难度不同的牌组分预设）。课程卡留在「系统默认」。
4. 不批量改期、不重排旧卡、不装其他调度插件。参数优化等复习记录多了以后再做（现在 220 条）。

## 五、如果要实测 IR 插件（用户要求的 7 步，照做）

1. 完整备份：Anki「文件 → 导出 → 收藏集（含调度信息）」+ 复制 `~/Library/Application Support/Anki2/` 整个目录。
2. 新建测试 profile（Anki「切换配置文件 → 添加」），只在测试 profile 里装 IR 4.13.0。
3. 在测试 profile：设置里确认 FSRS 开着；给 IR 牌组单独一个预设；IR 插件 Scheduling Mode 选 Priorities（只有维护者经验）。
4. 一篇短文章走完：导入 → 阅读 → 摘录 → 制卡 → 「Soon/Later」再次阅读 → 重启 Anki 看状态是否保留 → 打开 FSRS 优化看 IR 牌组是否被排除。
5. 任一步报错或状态丢失：删测试 profile 即恢复，主 profile 不受影响。
6. 验证通过前，主 profile 不装插件、不改设置。

依据级别：第 1、3（预设分离、FSRS 全局）官方；Priorities 模式与 FSRS 共存只有维护者 / 用户经验；在 25.09 上能否运行需本机测试。
