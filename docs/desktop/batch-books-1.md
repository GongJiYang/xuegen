# batch-books-1：总进度与日历显示读原书（讲后读 + 原书通读）

## 硬约束（先看这里，压缩后也要遵守）

- 只改下面「步骤」里点名的文件；新文件只建步骤里写的那几个。
- 纯函数必须有同名测试（`skills/` 下是 `xxx.test.mjs`，用 `node:test`；桌面版是 `xxx.test.ts`）。纯函数不读时钟、环境、全局。
- `skills/` 下的脚本零依赖（只用 Node 内置模块）。
- 界面文案只写在 `apps/desktop/src/renderer/core/strings.ts`；皮肤里不写中文。
- 不估任何时间：界面上不出现「约 N 分钟」「预计读完」之类。
- 不加 `eslint-disable`、`@ts-ignore`、`@ts-expect-error`；lint 拦住就改代码。
- `App.tsx` 不用改；如果改了，最终必须 ≤ 450 行。
- 禁止：读写 `~/.xuegen/`、碰 Obsidian 库、启动 Electron、git commit / push、加依赖。

先读：`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`skills/course/SKILL.md` 的「原书方式与课程骨架」一节。设计稿：`/Users/gjy/pi-learning/design/animate/src/books.jsx` 与 `books.css`（只看，不改）。

## 背景

主项课读原书分两部分，都写在课程页里（`wiki/courses/<slug>.md`）：

1. **讲后读**：`## Today` 段里的行，格式固定：
   ```
   - [ ] 讲后读 §1.1–1.4 核心页 · 2026-11-10 读（D2 开课时补定页码；完成条件：……）
   - [x] 讲后读 §2.1–2.2 pp.37–44、52–58 · 2026-11-10 读
   ```
   即 `- [ ]` 或 `- [x]`，空格，`讲后读`，空格，内容，` · `，`YYYY-MM-DD 读`，后面可以有任意文字。
2. **原书通读**：`## 原书通读` 段的列表，格式固定：
   ```
   - Ch1 §1.1–1.4 pp.1–36 · 2026-11-07 读 · 未读
   - Ch2 §2.4–2.5 pp.79–107 · 2026-12-05 读 · 未读（课上略读）
   - Ch3 §3.1–3.2 pp.108–130 · 2026-12-12 读 · 读到 p.120
   - Ch1 §1.1–1.4 pp.1–36 · 2026-11-07 读 · 已读（11-07）
   - Ch11 pp.760–828 · 后续周期（C2 数据结构与算法）
   - Ch12 pp.829 起 · 后续周期（C3 计算理论）
   ```
   即 `- `，标签，空格，`pp.` 开头的页码（到下一个 ` · ` 为止），然后要么 ` · YYYY-MM-DD 读 · 状态`，要么直接 ` · 状态`（只有「后续周期」行没有日期）。状态以 `已读` 开头算读完；以 `后续周期` 开头算后续周期。

本批把这两样从脚本一路送到 Bear 的总进度课程卡和日历（设计稿 `?d=books`）。bare 和 chicago 不显示（契约不变）。

## 步骤

### 1. 解析函数 `skills/course/course-book.mjs`（新建）

```js
// 课程页里的读原书：`## Today` 的「讲后读」行与 `## 原书通读` 的分段。只读，纯函数，零依赖。
// 行格式见 skills/course/SKILL.md「原书方式与课程骨架」。

const AFTER = /^- \[( |x|X)\] 讲后读 (.+?) · (\d{4}-\d{2}-\d{2}) 读/;
const SEGMENT = /^- (.+?) (pp\.[^·]+?) · (?:(\d{4}-\d{2}-\d{2}) 读 · )?(.+)$/;

function sectionLines(text, name) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${name}\\s*$`).test(line));
  if (start === -1) return [];
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    out.push(line);
  }
  return out;
}

/**
 * 读原书的计划：{ segments, after }；两样都没有时返回 null。
 * segments：[{ label, pages, date, status, done, later }]（原书通读的每一行，按页面顺序；date 为 YYYY-MM-DD 或 null）。
 * after：[{ date, text, done }]（Today 里的讲后读行）。
 */
export function readBook(text) {
  const segments = [];
  for (const line of sectionLines(text, "原书通读")) {
    const match = SEGMENT.exec(line.trim());
    if (!match) continue;
    const status = match[4].trim();
    segments.push({
      label: match[1].trim(),
      pages: match[2].trim(),
      date: match[3] ?? null,
      status,
      done: status.startsWith("已读"),
      later: status.startsWith("后续周期"),
    });
  }
  const after = [];
  for (const line of sectionLines(text, "Today")) {
    const match = AFTER.exec(line.trim());
    if (match) after.push({ date: match[3], text: match[2].trim(), done: match[1] !== " " });
  }
  return segments.length === 0 && after.length === 0 ? null : { segments, after };
}
```

新建 `skills/course/course-book.test.mjs`（照 `skills/course/course-parse.test.mjs` 的 `node:test` 写法），覆盖：上面「背景」里的 6 行通读样例逐行解析结果（含 `读到 p.120` 不算 done、`已读（11-07）` 算 done、两条后续周期行 `date` 为 null 且 `later` 为 true、`pp.829 起` 的 pages 为 `"pp.829 起"`）；两条讲后读样例（`text` 分别为 `"§1.1–1.4 核心页"`、`"§2.1–2.2 pp.37–44、52–58"`，`done` 为 false / true）；`## 原书通读` 段在下一个 `## ` 处结束；没有这两段时返回 null。

### 2. `skills/cycle-plan/cycle.mjs`

a. 导入：`import { readBook } from "../course/course-book.mjs";`

b. `loadCourses` 里 `courses.set(slug, { subject, role, name, rows: schedule.rows, done: completedIds(text), days: schedule.days });` 改为在对象里加 `book: readBook(text)`。同时更新该函数上方注释里的返回结构（加 `book`）。

c. `planInfo` 里 `const list = [...courses].map(...)` 返回的对象，在 `lessons: …` 之后加 `book: info.book ?? null,`，并在函数上方注释的 courses 结构里加 `book`。

d. `monthInfo`：参数解构改为 `{ courses = new Map(), route = null, books = new Map() } = {}`；`books` 是 `Map<slug, { name, book }>`。函数里新建 `const reading = {};`，在日期循环**之外**（循环结束后）加：

```js
  for (const [slug, { name, book }] of books) {
    if (!book) continue;
    const add = (date, entry) => {
      if (!date.startsWith(month)) return;
      (reading[date] ??= []).push({ course: slug, name, ...entry });
    };
    for (const item of book.after) if (!item.done) add(item.date, { kind: "after", text: item.text });
    for (const segment of book.segments) {
      if (segment.done || segment.later || !segment.date) continue;
      add(segment.date, { kind: "through", text: `${segment.label} ${segment.pages}` });
    }
  }
```

返回对象加 `reading`。函数上方注释加一句：`reading：{ 'YYYY-MM-DD': [{ course, name, kind: "after" | "through", text }] }`，来自 extra.books（每门主项课的读原书计划，不限于本月有周期的日子）。

e. `main()` 的 `month` 分支：在 `for (const cycle of cycles) { ... }` 循环之后、`catch` 之前，加载所有周期的主项课读原书计划：

```js
      for (const cycle of cycles) {
        const all = courses.get(cycle.cycle) ?? (await loadCourses(vault, cycle));
        for (const [slug, info] of all) {
          if (info.role === "main" && info.book && !books.has(slug)) books.set(slug, { name: info.name, book: info.book });
        }
      }
```

（在 `const courses = new Map();` 旁边声明 `const books = new Map();`）然后调用改为 `monthInfo(cycles, month, { courses, route, books })`。

f. `skills/cycle-plan/cycle.test.mjs` 加两条：
- `monthInfo([cycle], "2026-11", { books: new Map([["epp", { name: "离散", book: { segments: [{ label: "Ch1", pages: "pp.1–36", date: "2026-11-07", status: "未读", done: false, later: false }, { label: "Ch2", pages: "pp.37–65", date: "2026-12-05", status: "未读", done: false, later: false }], after: [{ date: "2026-11-10", text: "§1.1–1.4 核心页", done: false }, { date: "2026-11-12", text: "x", done: true }] } }]]) })` → `reading["2026-11-07"]` 是 `[{ course: "epp", name: "离散", kind: "through", text: "Ch1 pp.1–36" }]`，`reading["2026-11-10"]` 的 kind 为 `"after"`，没有 `2026-11-12`、没有 12 月的日期。（`cycle` 用该文件已有的测试周期夹具。）
- `planInfo` 的现有测试夹具课程加 `book: { segments: [], after: [] }`，断言结果课程带出同样的 `book`；不带 `book` 的课程结果为 `null`。

### 3. 协议类型 `apps/desktop/src/shared/data-protocol.ts`

在 `interface CycleCourseProgress` 之前加：

```ts
/** One stretch of the 原书通读 list on a course page. */
export interface BookSegment {
  /** 「Ch1 §1.1–1.4」. */
  label: string;
  /** 「pp.1–36」 or 「pp.829 起」. */
  pages: string;
  /** The Saturday it is read, or null for a later-cycle stretch. */
  date: string | null;
  /** 未读 / 读到 p.N / 已读（MM-DD） / 后续周期（…）, as written. */
  status: string;
  done: boolean;
  later: boolean;
}

/** A 讲后读 line in the course page's Today. */
export interface BookAfter {
  date: string;
  /** 「§1.1–1.4 核心页」. */
  text: string;
  done: boolean;
}

/** A main course's reading of the original book. */
export interface CourseBook {
  segments: BookSegment[];
  after: BookAfter[];
}

/** One reading item on a calendar day. */
export interface CycleReading {
  course: string;
  /** The course's short name. */
  name: string;
  kind: "after" | "through";
  text: string;
}
```

`CycleCourseProgress` 末尾加 `/** Reading of the original book, or null when the page has none. */ book?: CourseBook | null;`
`CycleMonth` 末尾加 `/** Reading due per day (讲后读 and 原书通读), any month. */ reading?: Record<string, CycleReading[]>;`

### 4. 文案 `core/strings.ts` 的 `plan: {` 段加

```ts
    bookTag: "原书",
    bookCount: (done: number, total: number): string => `${done}/${total} 段`,
    bookThrough: "原书通读 · 每周六一段",
    bookAll: (total: number): string => `全部 ${total} 段 ›`,
    bookAfter: (text: string): string => `讲后读 ${text}`,
    bookMissed: (day: string): string => `${day} 没读`,
    readAfterTag: "讲后读",
    readThroughTag: "读原书",
```

### 5. 视图模型 `core/board/plan-view.ts`

a. 导入里加 `CourseBook`（从 `@shared/data-protocol.js`）。

b. 在 `interface CourseCard` 之前加：

```ts
export interface BookView {
  /** The next 原书通读 stretch: 「11-07 周六」 + 「Ch1 §1.1–1.4」, or null when all are read. */
  next: { when: string; text: string } | null;
  /** 「0/20 段」 over the dated stretches. */
  count: string;
  /** The earliest unread 讲后读: when 「11-10 周二」 or 「11-10 没读」 (warn) when past. */
  after: { when: string; text: string; warn: boolean } | null;
  /** Every dated stretch in order. */
  segments: { when: string; label: string; pages: string; done: boolean }[];
}

/** The 原书 line of a course card, or null when the course has no reading plan. */
export function bookView(book: CourseBook | null | undefined, today: string): BookView | null {
  if (!book) return null;
  const dated = book.segments.filter((segment) => !segment.later && segment.date);
  const nextSegment = dated.find((segment) => !segment.done) ?? null;
  const open = book.after.filter((item) => !item.done).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const first = open[0] ?? null;
  if (dated.length === 0 && !first) return null;
  return {
    next: nextSegment ? { when: shortDay(nextSegment.date!), text: nextSegment.label } : null,
    count: strings.plan.bookCount(dated.filter((segment) => segment.done).length, dated.length),
    after: first
      ? {
          when: first.date < today ? strings.plan.bookMissed(first.date.slice(5)) : shortDay(first.date),
          text: strings.plan.bookAfter(first.text),
          warn: first.date < today,
        }
      : null,
    segments: dated.map((segment) => ({
      when: shortDay(segment.date!),
      label: segment.label,
      pages: segment.pages,
      done: segment.done,
    })),
  };
}
```

c. `interface CourseCard` 末尾加 `/** The 原书 line, or null. */ book: BookView | null;`；`courseCards` 返回对象末尾加 `book: bookView(course.book, today),`。

d. 文件末尾（`cellAuxTag` 附近即可）加：

```ts
/** The cell's reading line: 讲后读 when a 讲后读 is due that day, else 读原书 for a 原书通读 stretch, else "". */
export function cellReadTag(month: CycleMonth | null, date: string): string {
  const items = month?.reading?.[date] ?? [];
  if (items.some((item) => item.kind === "after")) return strings.plan.readAfterTag;
  return items.length > 0 ? strings.plan.readThroughTag : "";
}

/** The selected day's reading: tag, course short name, text. 讲后读 first. */
export function dayReading(month: CycleMonth | null, date: string): { tag: string; name: string; text: string }[] {
  const items = month?.reading?.[date] ?? [];
  return [...items]
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "after" ? -1 : 1))
    .map((item) => ({
      tag: item.kind === "after" ? strings.plan.readAfterTag : strings.plan.readThroughTag,
      name: item.name,
      text: item.text,
    }));
}
```

e. `plan-view.test.ts` 加测试：`bookView(null)` → null；有 3 段（第 1 段 done）+ 1 段 later + 1 条未读讲后读（日期早于 today）→ `next.text` 为第 2 段标签、`count` 为 `"1/3 段"`、`after.warn` 为 true 且 `after.when` 以 `没读` 结尾、`segments` 长度 3；讲后读日期是今天之后 → `warn` false。`cellReadTag`：当天既有 after 又有 through → `"讲后读"`；只有 through → `"读原书"`；没有 `reading` 字段 → `""`。`dayReading` 把 after 排在前面。

### 6. Bear 课程卡：新文件 `skins/bear/plan-book.tsx`

```tsx
/**
 * The 原书 line of a Bear 总进度 course card (design `?d=books`): the next
 * 原书通读 stretch and how many are read; when the card is open, the earliest
 * unread 讲后读 and every stretch with its Saturday.
 */

import { useState } from "react";
import type { BookView } from "../../core/board/plan-view.js";
import { strings } from "../../core/strings.js";
import { Rich } from "./rich.js";

export function PlanBook({ book, open }: { book: BookView; open: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? book.segments : book.segments.filter((segment) => !segment.done).slice(0, 3);
  return (
    <>
      <div className="bear-p4-book">
        <span className="bear-p4-booktag">{strings.plan.bookTag}</span>
        <span className="bear-p4-booktext">
          {book.next ? (
            <>
              <b>{book.next.when}</b> {book.next.text}
            </>
          ) : (
            book.after && <Rich text={book.after.text} />
          )}
        </span>
        <span className="bear-p4-bookcount">{book.count}</span>
      </div>
      {open && (
        <div className="bear-p4-bookbody">
          {book.after && (
            <div className={book.after.warn ? "bear-p4-bookrow is-warn" : "bear-p4-bookrow"}>
              <span className="bear-p4-bookwhen">{book.after.when}</span>
              <span className="bear-p4-booklabel">
                <Rich text={book.after.text} />
              </span>
            </div>
          )}
          {book.segments.length > 0 && <div className="bear-p4-booksub">{strings.plan.bookThrough}</div>}
          {shown.map((segment) => (
            <div key={`${segment.when}-${segment.label}`} className={segment.done ? "bear-p4-bookrow is-done" : "bear-p4-bookrow"}>
              <span className="bear-p4-bookwhen is-soft">{segment.when}</span>
              <span className="bear-p4-booklabel">{segment.label}</span>
              <span className="bear-p4-bookpages">{segment.pages}</span>
            </div>
          ))}
          {book.segments.length > 3 && (
            <button type="button" className="bear-p4-more" onClick={() => setAll((value) => !value)}>
              {all ? strings.plan.fewerLessons : strings.plan.bookAll(book.segments.length)}
            </button>
          )}
        </div>
      )}
    </>
  );
}
```

`skins/bear/plan-progress.tsx` 的 `Card`：在 `{card.next && ( ... )}` 那块之后、`{open && (` 之前加 `{card.book && <PlanBook book={card.book} open={open} />}`，并导入 `import { PlanBook } from "./plan-book.js";`。

`skins/bear/skin.css` 在 `.bear-p4-body` 规则之后加：

```css
[data-skin="bear"] .bear-p4-book {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  margin: 9px 0 0 15px;
  padding-top: 8px;
  border-top: 1px solid var(--hairline);
  font-size: 12.5px;
}
[data-skin="bear"] .bear-p4-booktag {
  flex: none;
  padding: 0 5px;
  border: 1px solid var(--rule);
  border-radius: 4px;
  font-size: 11px;
  line-height: 16px;
  color: var(--soft);
}
[data-skin="bear"] .bear-p4-booktext,
[data-skin="bear"] .bear-p4-booklabel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #4a4f55;
}
[data-skin="bear"] .bear-p4-booktext b {
  margin-right: 4px;
  font-weight: 600;
  color: var(--accent);
}
[data-skin="bear"] .bear-p4-bookcount,
[data-skin="bear"] .bear-p4-bookpages {
  flex: none;
  font-size: 11.5px;
  color: var(--faint);
  font-variant-numeric: tabular-nums;
}
[data-skin="bear"] .bear-p4-bookbody {
  margin: 8px 0 0 15px;
  padding-top: 6px;
  border-top: 1px dashed var(--hairline);
}
[data-skin="bear"] .bear-p4-booksub {
  margin: 8px 0 2px;
  font-size: 11.5px;
  color: var(--faint);
}
[data-skin="bear"] .bear-p4-bookrow {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 0;
  font-size: 12.5px;
}
[data-skin="bear"] .bear-p4-bookwhen {
  flex: none;
  width: 72px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
}
[data-skin="bear"] .bear-p4-bookwhen.is-soft {
  font-weight: 400;
  color: var(--soft);
}
[data-skin="bear"] .bear-p4-bookrow.is-warn .bear-p4-bookwhen {
  color: var(--warn-text);
}
[data-skin="bear"] .bear-p4-bookrow.is-done .bear-p4-booklabel {
  color: var(--faint);
  text-decoration: line-through;
}
```

### 7. Bear 日历

文件 `skins/bear/calendar-panel.tsx`：

a. 导入里加 `cellReadTag, dayReading`。

b. 格子：在 `const auxTag = ...` 之后加 `const readTag = cell.out ? "" : cellReadTag(cycle, cell.date);`；在 `{auxTag && <span className="bear-mcal-aux">{auxTag}</span>}` 之后加 `{readTag && <span className="bear-mcal-read">{readTag}</span>}`。

c. `DayDetail` 加一个属性 `reading: { tag: string; name: string; text: string }[];`（类型标注与解构都加）。把 `{(lessons.length > 0 || slotType) && (` 改成 `{(lessons.length > 0 || slotType || reading.length > 0) && (`；在 `lessons.map(...)` 之后、`{slotType === "整合" && (` 之前加：

```tsx
          {reading.map((item) => (
            <li key={`${item.tag}-${item.name}-${item.text}`}>
              <span className="bear-pg-mark">○</span>
              <span>
                <span className="bear-cy-auxtag">{item.tag}</span>{" "}
                <b>{item.name}</b> <Rich text={item.text} />
              </span>
            </li>
          ))}
```

并把 `{!hasContent(day) ? ( lessons.length === 0 && !slotType && ...` 里的条件改为 `lessons.length === 0 && !slotType && reading.length === 0 && ...`。

d. `<DayDetail ... />` 调用处加 `reading={dayReading(cycle, selected)}`。

e. `skins/bear/skin.css`：把 `[data-skin="bear"] .bear-tabpanels .bear-mcal-day { height: 60px; }` 改成 `height: 72px;`；在 `.bear-mcal-aux` 规则之后加

```css
[data-skin="bear"] .bear-mcal-read {
  max-width: 100%;
  overflow: hidden;
  padding: 0 2px;
  font-size: 9.5px;
  line-height: 1.2;
  color: var(--faint);
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

### 8. 画廊样例

`apps/desktop/src/renderer/gallery/panel-samples.ts`：
- 样例周期月份对象（有 `recovery: []` 的那个）加 `reading: { "2026-11-10": [{ course: "discrete-math-epp", name: "离散", kind: "after", text: "§1.1–1.4 核心页" }], "2026-11-14": [{ course: "discrete-math-epp", name: "离散", kind: "through", text: "Ch2 §2.1–2.2 pp.37–65" }] }`（若样例月份不是 2026-11，把日期换成该月份里的日子）。
- 样例 overview 的第一门课加 `book: { segments: [{ label: "Ch1 §1.1–1.4", pages: "pp.1–36", date: "2026-11-07", status: "未读", done: false, later: false }, { label: "Ch2 §2.1–2.2", pages: "pp.37–65", date: "2026-11-14", status: "未读", done: false, later: false }, { label: "Ch2 §2.3", pages: "pp.66–78", date: "2026-11-21", status: "未读", done: false, later: false }, { label: "Ch11", pages: "pp.760–828", date: null, status: "后续周期（C2）", done: false, later: true }], after: [{ date: "2026-11-10", text: "§1.1–1.4 核心页", done: false }] }`。

## 验收命令（贴出每条最后几行）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && npm test && npm run lint:skills
wc -l apps/desktop/src/renderer/App.tsx
grep -rn "eslint-disable\|@ts-ignore\|@ts-expect-error" apps/desktop/src | grep -v test
git status --short
```

`git status --short` 只应出现本批文件，以及本批开始前已有的改动（不要动、不要回退）。

## 结束报告

改了哪些文件；每一步是否照做，偏离之处和原因；未完成项。
