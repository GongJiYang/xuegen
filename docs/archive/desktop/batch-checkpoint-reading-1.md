# batch-checkpoint-reading-1：上下文 60% 存档提示 + 日历显示读书

## 硬约束（先读，压缩后也照做）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/platform/PRINCIPLES.md`（第 6 条上下文预算、第 7 条读原书）。
- 决策逻辑放 `src/renderer/core/` 的纯函数并配同名测试；hook 的 effect 里不同步 setState（照文件里已有的 `Promise.resolve().then(...)` / `.then(...)` 写法）；界面文案只在 `core/strings.ts`。
- `App.tsx` 改完必须 ≤ 450 行。
- 技能脚本保持零依赖；`skills/calendar/calendar.test.mjs` 沿用现有写法。
- 不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖；不放宽 eslint，不加 `eslint-disable` / `@ts-ignore`。
- 只做下面三部分。

## 第一部分：日历把「讲后读」算进读书

讲后读写在课程页 `## Today` 里，格式固定：`- [ ] 讲后读 §1.1–1.4 核心页 · 2026-11-10 读（……）`。

### 1.1 `skills/calendar/calendar.mjs`

1. `loadCourses` 里把 `courses.push(parseCourse(text, basename(name, ".md")));` 改成 `courses.push({ ...parseCourse(text, basename(name, ".md")), text });`。
2. 在 `collectCoursePlans` 后面加纯函数：

```js
// 课程页 `## Today` 里没打勾的「讲后读 … · YYYY-MM-DD 读」→ 当天的 readingDue。
function collectAfterReads(course) {
  const lines = course.text.split("\n");
  const start = lines.findIndex((line) => /^##\s+Today\s*$/.test(line));
  if (start === -1) return [];
  const found = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const match = line.match(/^- \[ \] 讲后读 (.+?) · (\d{4}-\d{2}-\d{2}) 读/);
    if (!match || !isDate(match[2])) continue;
    found.push({ date: match[2], slug: `${course.slug}#讲后读-${found.length + 1}`, title: `讲后读 ${match[1].trim()}（${course.title}）` });
  }
  return found;
}
```

3. 找到把 `collectReadingDue` 的结果放进 `days[date].readingDue` 的地方，用同样的方式把每门课 `collectAfterReads(course)` 的结果也放进去（阅读页的在前，讲后读在后）。`month` 和 `get` 两个命令都要有。
4. 文件头注释里「聚合」那一行补上「课程页 Today 里的讲后读」。

### 1.2 `skills/calendar/calendar.test.mjs`

加测试 `讲后读：Today 里未勾选的讲后读进当天 readingDue`：课程页 `## Today` 有一行 `- [ ] 讲后读 §1.1–1.4 核心页 · 2026-11-10 读（核心页已定：pp.1–5）` 和一行已勾选的 `- [x] 讲后读 §0 · 2026-11-09 读`；`get … 2026-11-10 --json` 的 `readingDue` 含 `{ slug: "<课程slug>#讲后读-1", title: "讲后读 §1.1–1.4 核心页（<课程标题>）" }`；`2026-11-09` 没有讲后读。

## 第二部分：Bear 日历格子显示读书

### 2.1 `src/renderer/core/strings.ts`

在 `plan` 对象里 `tagRecovery: "恢复",` 后面加 `tagRead: "读书",`。

### 2.2 `src/renderer/core/board/plan-view.ts`

在 `cellTag` 后面加纯函数：

```ts
/** A 低强度 day with reading due and no main lesson says 「读书」 instead of its type tag; else null. */
export function cellReadingTag(month: CycleMonth | null, date: string, readingCount: number): string | null {
  if (!month || readingCount <= 0) return null;
  if (month.days[date]?.type !== "低强度") return null;
  const main = (month.lessons[date] ?? []).some((item) => month.roles[item.course] !== "aux");
  return main ? null : strings.plan.tagRead;
}
```

`plan-view.test.ts` 加：低强度日有阅读 → 「读书」；低强度日无阅读 → null；深度日有阅读 → null；`month` 为 null → null。

### 2.3 `src/renderer/skins/bear/calendar-panel.tsx`

1. import 里加 `cellReadingTag`。
2. 格子里 `const tag = cell.out ? "" : cellTag(cycle, cell.date);` 改成：

```tsx
          const readCount = days[cell.date]?.readingDue.length ?? 0;
          const tag = cell.out ? "" : (cellReadingTag(cycle, cell.date, readCount) ?? cellTag(cycle, cell.date));
```

3. 在 `{(slot || tag) && days[cell.date]?.note && <i className="bear-mcal-notedot" aria-hidden="true" />}` 后面加：

```tsx
              {(slot || tag) && readCount > 0 && <i className="bear-mcal-readdot" aria-hidden="true" />}
```

4. `skins/bear/skin.css`：在 `.bear-mcal-notedot` 规则后面加（左下角一个强调色小点，与右下的笔记点区分；先看 notedot 是怎么定位 left/right 的，readdot 放另一侧）：

```css
[data-skin="bear"] .bear-mcal-readdot {
  position: absolute;
  bottom: 4px;
  left: 6px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--accent);
}
```

（如果 notedot 已经在左侧，就把 readdot 放 `right: 6px`。若 `--accent` 在 bear 里不存在，用该文件里表示「蓝 / 学习中」的那个变量。）

bare 与 chicago 的日历详情已经列出 `readingDue`，不改。

## 第三部分：上下文 60% 时提示「先存档」

学根技能 `course` 已规定：上下文快满时先把存档点写进课程页 `Next Session`，再开新会话接着上。这一部分只做界面提示与两个按钮。

### 3.1 `src/renderer/core/board/session-freshness.ts`（追加纯函数）

```ts
/** At or above this context percent a course session offers 「先存档」. */
export const CHECKPOINT_PERCENT = 60;

export type CheckpointPhase = "none" | "offer" | "saving" | "saved";

/**
 * Where the open course session stands on the 存档 → 新会话 path. `sentFor` is
 * the session file the 存档 prompt went to; `doneFor` the file whose 存档 answer
 * has ended.
 */
export function checkpointPhase(
  activeCourse: string | null,
  sessionFile: string | null,
  percent: number | null,
  sentFor: string | null,
  doneFor: string | null,
): CheckpointPhase {
  if (!activeCourse || !sessionFile) return "none";
  if (doneFor === sessionFile) return "saved";
  if (sentFor === sessionFile) return "saving";
  return percent !== null && percent >= CHECKPOINT_PERCENT ? "offer" : "none";
}
```

`session-freshness.test.ts` 加：无课程 → none；59 → none；60 → offer；已发送 → saving；已答完 → saved；换了会话文件（sentFor 是旧文件）→ 按百分比重新判断。

### 3.2 `src/renderer/core/strings.ts`

`notice` 对象里（`staleSessionAction` 后面）加：

```ts
    checkpoint: (percent: number): string => `这节课的上下文已用 ${percent}%。先把当前进度存档，再开新会话接着上。`,
    checkpointAction: "先存档 →",
    checkpointSaved: "存档好了：开一个新会话，从存档点接着上。",
    checkpointSavedAction: "开新会话接着上 →",
```

`chat` 对象里（`refreshNote` 后面）加：

```ts
    checkpointPrompt: "[上下文快满：按 course「长会话先存档」把存档点写进课程页 Next Session（当前题目原文、我答到哪、下一步讲什么），写好后用一句话告诉我]",
    checkpointResume: "[接着上一个会话的存档点继续：先读课程页 Next Session 里的存档点，从那里接着上，不重新开课]",
```

### 3.3 `src/renderer/core/board/use-course-sessions.ts`

1. `CourseSessionActions` 接口加：

```ts
  /** Continue a course in a fresh session today (after a 存档), sending `text`. */
  handleContinueFresh(slug: string, text: string): void;
```

2. 在 `handleStartSession` 后面加：

```ts
  const handleContinueFresh = useCallback(
    (slug: string, text: string) => startSession(slug, text, null, null, false, true),
    [startSession],
  );
```

3. 返回对象里加 `handleContinueFresh`。

### 3.4 `src/renderer/core/board/use-session-freshness.ts`

1. 函数参数在 `onStudy` 后面加 `onContinueFresh: (slug: string, text: string) => void`。
2. 加状态：`const [sentFor, setSentFor] = useState<string | null>(null);`、`const [doneFor, setDoneFor] = useState<string | null>(null);`。
3. 在现有「answer ended」那个 effect 里（`const ended = …` 那个），`ended` 为真且 `sentFor === openSessionFile` 时，用 `void Promise.resolve().then(() => setDoneFor(file));` 记下（不要同步 setState）；依赖数组补上 `sentFor`。注意 `file` 变量在该 effect 里已有（`const file = openSessionFile;`），把这段判断放在 `client.data(...)` 调用之前，且不要被前面的 `return` 跳过（`ended` 为真、有 `openSessionFile` 和 `activeCourse` 时才会走到）。
4. 计算：

```ts
  const percent = controller.contextUsage?.percent ?? null;
  const phase = checkpointPhase(activeCourse, openSessionFile, percent, sentFor, doneFor);
```

5. 把原来的 `dismissed` 逻辑改成按「种类 + 会话文件」记：

```ts
  const key = stale ? `stale:${openSessionFile}` : phase === "offer" || phase === "saved" ? `${phase}:${openSessionFile}` : null;
  const dismiss = useCallback(() => setDismissed(key), [key]);
```

6. `notice` 的计算改成：stale 的那个照旧（条件里 `dismissed !== openSessionFile` 改成 `dismissed !== key`）；否则：

```ts
  phase === "offer" && course && dismissed !== key
    ? {
        tone: "info",
        text: strings.notice.checkpoint(Math.round(percent ?? 0)),
        action: {
          label: strings.notice.checkpointAction,
          run: () => {
            controller.sendCommand(strings.chat.checkpointPrompt);
            setSentFor(openSessionFile);
          },
        },
      }
    : phase === "saved" && course && dismissed !== key
      ? {
          tone: "info",
          text: strings.notice.checkpointSaved,
          action: { label: strings.notice.checkpointSavedAction, run: () => onContinueFresh(course.slug, strings.chat.checkpointResume) },
        }
      : null
```

（stale 优先：两者同时成立时只显示 stale 那条。）文件头注释补一条「- 上下文到 60%：提示先存档，存档答完后提示开新会话接着上」。

### 3.5 `src/renderer/App.tsx`

1. 从 `useCourseSessions(...)` 的解构里多取 `handleContinueFresh`。
2. `useSessionFreshness(controller, courses, activeCourse, openSessionFile, settings, handleStudy)` 末尾加参数 `handleContinueFresh`。
3. 若 `useSessionFreshness` 的调用在 `useCourseSessions` 之前、拿不到 `handleContinueFresh`，就把 `useSessionFreshness` 那一行挪到 `useCourseSessions` 之后（只挪位置，不改别的）。
4. `wc -l` ≤ 450。

### 3.6 测试

`use-session-freshness` 若有测试文件，补一条：`contextUsage.percent = 65` 的课程会话出现「先存档 →」通知，点了之后调用 `sendCommand(strings.chat.checkpointPrompt)`。没有测试文件就只靠 3.1 的纯函数测试。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test 2>&1 | tail -6 && npm run build 2>&1 | tail -3
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -6 && npm run lint:skills 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen/apps/desktop && wc -l src/renderer/App.tsx
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：上面命令全部通过；`App.tsx` ≤ 450；`git status` 只多出本批文件（其余改动是之前批次和 Claude 的，不要动）。

## 结束报告（中文）

改了哪些文件、每一步是否照做、偏离之处及原因、未完成项，附验收命令输出。
