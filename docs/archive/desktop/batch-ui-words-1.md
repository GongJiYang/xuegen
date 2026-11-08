# batch-ui-words-1：统一用词、/ 菜单按任务分组、技能一句话说明

设计稿：`design/animate/?d=fix1`（用户 2026-11-08 批准）的「④ 统一用词」「/ 菜单」「② 技能面板」三部分。

## 硬约束（先读，压缩后也照做）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/platform/PRINCIPLES.md`。
- 文案只在 `src/renderer/core/strings.ts`；决策逻辑是 `core/` 的纯函数并有测试；bare、bear、chicago 三个皮肤都要改到。
- 不改 `skins/contract.ts`、`shared/`、`main/`、`App.tsx`。不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖；不放宽 eslint。
- 只做下面列出的改动。

## 第 1 步 `src/renderer/core/strings.ts`

1. `commands` 对象：
   - 加 `styleDefault: "按科目的讲解偏好",`（放在 `stylePlain` 前）。
   - `stylePlain` 改 `"以理解概念为主"`，`styleDetailed` 改 `"一次一个点"`，`styleDeep` 改 `"讲到机制与边界"`。
   - `newSession` 改 `"开一个空白会话"`；`control` 改 `"今天的安排与周期进度"`。
   - `endToday` 改 `"打勾、记录、更新下次起点"`；`summarize` 改 `"把讲过的整理成今日要点和题目"`；`makeCards` 改 `"起草卡片，确认后才写"`。
   - `progress` 改 `"总进度"`；`calendar` 改 `"日历"`；`skills` 改 `"全部技能"`；`addReading` 改 `"把文章加入阅读队列"`。
   - 加 `readingOpen: "阅读队列",`。
   - 删掉 `continueSession`、`resume`、`readingToday` 三项（第 2 步后不再被引用；若 `tsc` 报还有引用，按报错处一并删）。
2. `today.resume`（`"继续学习"`）改 `"开课 →"`；`today.backToCourse` 改 `"回到这节课 →"`。
3. `cycle.start` 改 `"开课 →"`；`cycle.study`（`"开始学习"`）改 `"开课 →"`；`cycle.backToCourse` 改 `"回到这节课 →"`。若别处还有值为 `"回到这门课"` 的键，同样改成 `"回到这节课 →"`。
4. `plan.ankiItem` 改 `"Anki"`。
5. `reading.scopeHint` 改 `"文章、论文、书摘放这里；主项教材的整本通读也在这里，每 14 天一段。"`。
6. `skills` 对象加：

```ts
    rawToggle: "给学根看的说明",
    /** Chinese name and one line for the built-in skills; others fall back to their own name and first sentence. */
    known: {
      teach: ["讲课", "按诊断、推导、检验讲一个主题，管今日要点和检查理解题"],
      course: ["课程", "建课、排期、开课、收课，按证据打勾"],
      "cycle-plan": ["学习周期", "今天学什么、周五整合、周期轮换"],
      reading: ["阅读", "阅读队列、教材通读、摘录"],
      calendar: ["日历", "某天做了什么、写日历笔记"],
      diagram: ["画图", "把讲解画成字符图"],
      "course-board": ["课程看板", "只看课程进度，不改任何东西"],
      "wiki-save": ["存进 Wiki", "查询或整理进 Wiki、制作闪卡"],
      article: ["文章架构", "把学过的内容整理成知识架构"],
    } as Record<string, [string, string]>,
```

## 第 2 步 `src/renderer/core/board/skills-description.ts`

追加：

```ts
import { strings } from "../strings.js";

/** The name and one line a skill shows: the Chinese pair for a known skill, else its own name and first sentence. */
export function skillLabel(name: string, description: string): { title: string; line: string } {
  const known = strings.skills.known[name];
  if (known) return { title: known[0], line: known[1] };
  return { title: name, line: firstSentence(description) };
}
```

（`import` 放文件顶部。）`skills-description.test.ts`（没有就新建）加：`skillLabel("teach", "…")` 返回 `{ title: "讲课", … }`；`skillLabel("my-skill", "做 A；然后 B。")` 返回 `{ title: "my-skill", line: "做 A" }`。

## 第 3 步 `src/renderer/core/commands/commands.ts`

1. `COMMAND_GROUPS` 改为 `["风格", "上课", "会话", "打开", "技能"] as const;`，文件头注释里的分组列表同步改。
2. `BUILTIN_COMMANDS` 整个替换为：

```ts
export const BUILTIN_COMMANDS: SlashCommand[] = [
  { command: "/默认", group: "风格", description: strings.commands.styleDefault },
  { command: "/大白话", group: "风格", description: strings.commands.stylePlain },
  { command: "/细讲", group: "风格", description: strings.commands.styleDetailed },
  { command: "/深度", group: "风格", description: strings.commands.styleDeep },
  { command: "/总结", group: "上课", description: strings.commands.summarize },
  { command: "/制卡", group: "上课", description: strings.commands.makeCards },
  { command: "/收课", group: "上课", description: strings.commands.endToday },
  { command: "/新会话", group: "会话", description: strings.commands.newSession },
  { command: "/总控", group: "会话", description: strings.commands.control },
  { command: "/进度", group: "打开", description: strings.commands.progress },
  { command: "/日历", group: "打开", description: strings.commands.calendar },
  { command: "/阅读", group: "打开", description: strings.commands.readingOpen },
  { command: "/加入阅读", group: "打开", description: strings.commands.addReading },
  { command: "/技能", group: "打开", description: strings.commands.skills },
];
```

3. `styleOfCommand` 加 `case "/默认": return "default";`。
4. `allCommands` 里技能项的 `description` 改为：

```ts
      description: (() => {
        const label = skillLabel(entry.name, entry.description || strings.commands.skillFallback);
        return `${label.title} · ${label.line}`;
      })(),
```

（从 `../board/skills-description.js` 引入 `skillLabel`。）
5. `rankCommands`：空查询时不显示技能项（技能在「/技能」里看全部，输入文字时照样能搜到）——把 `if (!needle) return commands;` 改成 `if (!needle) return commands.filter((entry) => entry.group !== "技能");`，并在函数注释里写明。`filterCommands` 同样处理空查询。
6. `commands.test.ts`：按新分组与新列表改断言；加：空查询的结果里没有 `技能` 组；查询「讲课」能搜到 `/skill:teach`；`styleOfCommand("/默认") === "default"`。

## 第 4 步 `src/renderer/core/commands/run-command.ts`

1. 加 `case "/默认": return { kind: "style", style: "default" };`。
2. 加 `case "/收课": return { kind: "prompt", text: "今天学到这里，写进 wiki，更新计划" };`（与原 `/今天学到这里` 同一句提示词）。
3. 删掉 `case "/继续会话"`、`case "/继续"`、`case "/今天学到这里"`、`case "/今天读什么"` 四个分支（菜单已不列出；`CommandEffect` 的联合类型不动）。
4. `run-command.test.ts` 相应改：删掉对这四个命令的断言，加 `/默认`、`/收课` 的断言。

## 第 5 步 技能面板（三个皮肤）

每个技能行：勾选框（或待审核按钮）后面显示 `title`（加粗），下一行显示 `line`，再下一行是一个原生 `<details>`：`<summary>{strings.skills.rawToggle}</summary>` 里放原来的 `/skill:{name} · {description}`（Bear 保留来源「内置/个人/待审核」在这一行末尾）。`title`/`line` 都来自 `skillLabel(skill.name, skill.description)`。

- `skins/bear/skills-panel.tsx`：`<label>` 里的 `{skill.name}` 换成 `<b>{label.title}</b>`；原 `<p className="bear-muted">/skill:… · 来源</p>` 换成 `<p className="bear-muted">{label.line}</p>` 加上述 `<details className="bear-muted">`。
- `skins/bare/panels-more.tsx`（约 218–231 行）：同样处理。
- `skins/chicago/skills-panel.tsx`：技能名按钮显示 `label.title`；原来「第一句 / 展开全文」的地方：收起时显示 `label.line`，展开时显示 `/skill:{name} · {description}` 全文（沿用它现有的展开状态与按钮，不另加 `<details>`）。`CheckBox` 的 `ariaLabel` 用 `label.title`。
- 三个皮肤的 `<details>` 不需要新样式；Bear 若显示过大，只在 `skins/bear/skin.css` 里给 `[data-skin="bear"] .bear-skills details { font-size: 12px; }` 这一类限定选择器（看该面板实际的类名）。

## 第 6 步 其他引用

`tsc`/测试里若还有对已删字符串键或命令的引用（如 Gallery、`use-slash.ts`、`core/commands/README.md`），按新名称改；`core/commands/README.md` 的分组说明同步。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：全部通过（本机高负载时 `contract.test.tsx` 偶发皮肤加载超时，单独重跑通过即可，报告里注明）；`git status` 只出现本批文件。

## 结束报告（中文）

改了哪些文件、每一步是否照做、偏离之处及原因、未完成项，附验收输出。
