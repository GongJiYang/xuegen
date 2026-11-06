# batch-fresh-1：课程会话不再用旧会话、旧计划

## 硬约束（先看这里，压缩后也要遵守）

- 只改下面「步骤」里点名的文件；新文件只建步骤里写的那几个。
- 纯函数放 `src/renderer/core/<领域>/xxx.ts`，必须有同名 `.test.ts`；纯函数不读时钟、时区、环境、全局（时区偏移由调用方传入）。
- 界面文案只写在 `src/renderer/core/strings.ts`；皮肤里不写中文。
- `src/renderer/App.tsx` 最终必须 ≤ 450 行（`wc -l`）。
- 契约（`skins/contract.ts`）改了，bare、bear、chicago 三个皮肤都要实现，画廊补样例。
- 不加 `eslint-disable`、`@ts-ignore`、`@ts-expect-error`；lint 拦住就改代码，不放宽规则。
- 禁止：读写 `~/.xuegen/`、碰 Obsidian 库、启动 Electron、git commit / push、加运行时依赖。

先读：`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。

## 背景（为什么做）

学根每门课「每天第一次开课」会开新会话，但还有几条路会落进旧会话或拿着旧计划回答：
1. 重启或第二天打开学根，窗口还是前一天的课程会话，用户直接打字就接着在旧会话里学。
2. 课程页在这个会话之外被改过（别的会话、Obsidian），会话里的学根不知道。
3. 学根更新后，当天已开的会话里还是旧技能规则。
4. 「改计划」「周核实」直接进这门课上次的会话，哪怕是几天前的。
5. 在 Obsidian 里改了东西、或窗口开着过了零点，面板不刷新，要等学根答完一条。

本批的做法：1 → 一条带按钮的提示；2、3 → 发消息时自动加一句「先重读」；4 → 上次会话不是今天的就开新会话；5 → 窗口获得焦点、过零点时刷新面板。

会话文件名形如 `.../2026-11-06T12-19-49-302Z_01a1b0cd-8a6f-....jsonl`：开头是会话创建时刻的 UTC 时间（`-` 代替 `:` 和 `.`）。

## 步骤

### 1. 课程列表带上修改时间

文件 `skills/course/course-state.mjs`，函数 `listCommand`。把

```js
  const courses = await listCourses(coursesDir);
  const entries = courses.map(toListEntry);
```

改成

```js
  const courses = await listCourses(coursesDir);
  const entries = [];
  for (const course of courses) {
    const changedAt = (await stat(join(coursesDir, `${course.slug}.md`))).mtimeMs;
    entries.push({ ...toListEntry(course), changedAt: Math.floor(changedAt) });
  }
```

`stat` 已从 `node:fs/promises` 导入；确认文件顶部有 `join`（`node:path`），没有就加进已有的 `node:path` 导入里。

完成后：`node skills/course/course-state.mjs list <任意含课程页的目录> --json` 每项多一个整数 `changedAt`（可用 `skills/course` 的测试夹具目录，或跳过手跑，以测试为准）。

### 2. 协议类型

文件 `apps/desktop/src/shared/data-protocol.ts`，`interface CourseSummary` 在 `styleHint: string | null;` 后加：

```ts
  /** The course file's modification time (ms since epoch), from `course-state.mjs list`. */
  changedAt?: number;
```

### 3. 契约：提示可以带一个按钮

文件 `apps/desktop/src/renderer/skins/contract.ts`，`interface NoticeItem` 在 `detail?: string;` 后加：

```ts
  /** An optional button on the notice (e.g. 「开今天的课 →」). */
  action?: { label: string; run(): void };
```

### 4. 文案

文件 `apps/desktop/src/renderer/core/strings.ts`：

- `notice: {` 段末尾（`unknownSkin` 之后）加：
  ```ts
    staleSession: (day: string, title: string): string => `这是 ${day} 的「${title}」会话。`,
    staleSessionAction: "开今天的课 →",
    actionTitle: "提示",
  ```
- `chat: {` 段里加一项：
  ```ts
    refreshNote: "[课程页或技能可能已更新：先重读课程页和要用的技能，以文件为准]",
  ```

### 5. 纯函数 `session-freshness.ts`

新建 `apps/desktop/src/renderer/core/board/session-freshness.ts`：

```ts
/**
 * Whether a course session is out of date: opened on an earlier day, or
 * started before the course file last changed. Pure: the caller passes today,
 * the time-zone offset, and what it has seen.
 */

const SESSION_STAMP = /(?:^|[\\/])(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_[^\\/]*$/;

/**
 * The local day (YYYY-MM-DD) a session file was created, from its file name;
 * null when the name has no timestamp.
 * @param tzOffsetMinutes `new Date().getTimezoneOffset()` (UTC − local, in minutes).
 */
export function sessionDay(file: string | null, tzOffsetMinutes: number): string | null {
  if (!file) return null;
  const match = SESSION_STAMP.exec(file);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, ms] = match.map(Number);
  const utc = Date.UTC(y!, mo! - 1, d!, h!, mi!, s!, ms!);
  const local = new Date(utc - tzOffsetMinutes * 60_000);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}

/**
 * The open session is a course's remembered session created before today:
 * returns that course and the session's day, else null.
 */
export function staleCourseSession(
  activeCourse: string | null,
  openSessionFile: string | null,
  courseSessions: Record<string, string>,
  today: string,
  tzOffsetMinutes: number,
): { slug: string; day: string } | null {
  if (!activeCourse || !openSessionFile) return null;
  if (courseSessions[activeCourse] !== openSessionFile) return null;
  const day = sessionDay(openSessionFile, tzOffsetMinutes);
  return day && day < today ? { slug: activeCourse, day } : null;
}

/** A course action should open a fresh session: none remembered, or the remembered one is from an earlier day. */
export function startsFresh(
  slug: string,
  courseSessions: Record<string, string>,
  today: string,
  tzOffsetMinutes: number,
): boolean {
  const day = sessionDay(courseSessions[slug] ?? null, tzOffsetMinutes);
  return day === null || day < today;
}

/**
 * The next message in this course session should ask 学根 to re-read the
 * course page: nothing seen yet in this app run, or the page changed since the
 * last answer ended. Free chats and empty (fresh) sessions never need it.
 */
export function needsRefresh(
  sessionFile: string | null,
  activeCourse: string | null,
  messageCount: number,
  changedAt: number | undefined,
  seen: Record<string, number>,
): boolean {
  if (!sessionFile || !activeCourse || messageCount === 0) return false;
  const last = seen[sessionFile];
  if (last === undefined) return true;
  return changedAt !== undefined && changedAt > last;
}
```

新建 `session-freshness.test.ts`，至少覆盖：
- `sessionDay("/a/b/2026-11-06T12-19-49-302Z_01a1.jsonl", -480)` → `"2026-11-06"`；`sessionDay(".../2026-11-06T17-00-00-000Z_x.jsonl", -480)` → `"2026-11-07"`（UTC 17:00 = 北京次日 01:00）；无时间戳的名字、`null` → `null`。
- `staleCourseSession`：打开的是这门课记住的会话且是昨天的 → `{ slug, day }`；今天的 → null；打开的文件不是这门课记住的那个 → null；`activeCourse` 为 null → null。
- `startsFresh`：没记住会话 → true；记住的是昨天的 → true；今天的 → false。
- `needsRefresh`：`messageCount` 0 → false；没 activeCourse → false；`seen` 没有这个文件 → true；`changedAt` 大于 seen → true；等于或小于 → false；`changedAt` undefined 且 seen 有 → false。

### 6. `useChat`：可设置的「先重读」前缀

文件 `apps/desktop/src/renderer/core/chat/useChat.ts`：

- `interface ChatController` 里 `sendCommand(text: string): void;` 之后加：
  ```ts
  /** A note put in front of the next prompts (send and sendCommand) until set back to null. */
  setRefreshNote(note: string | null): void;
  ```
- 在 `const styleRef = useRef(style);` 那段之后加：
  ```ts
  const refreshNoteRef = useRef<string | null>(null);
  const setRefreshNote = useCallback((note: string | null) => {
    refreshNoteRef.current = note;
  }, []);
  ```
- `send` 改成：
  ```ts
  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const note = refreshNoteRef.current;
    const body = note ? `${note} ${trimmed}` : trimmed;
    // The style marker rides on the wire only; the transcript strips it back into
    // a tag on display (see `splitStyleTag`), so the raw prefix is never shown.
    client.send({ type: "prompt", text: withStylePrefix(styleRef.current, body) });
  }, []);
  ```
- `sendCommand` 改成：
  ```ts
  const sendCommand = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const note = refreshNoteRef.current;
    client.send({ type: "prompt", text: note ? `${note} ${trimmed}` : trimmed });
  }, []);
  ```
- 返回对象和 `useMemo` 依赖数组里都加上 `setRefreshNote`。
- 所有手写的 `ChatController` 测试替身（如 `core/board/use-course-sessions.test.tsx`）补 `setRefreshNote: vi.fn()`，让类型检查通过。
- 在 `useChat` 现有测试文件里加一条：`setRefreshNote("[N]")` 后 `send("hi")`，发出的 prompt 文本包含 `"[N] hi"`；`setRefreshNote(null)` 后再发不含 `[N]`。（参照该文件里已有的 `client.send` 断言写法。）

### 7. Hook `use-session-freshness.ts`

新建 `apps/desktop/src/renderer/core/board/use-session-freshness.ts`：

```ts
/**
 * Keeps a course session from running on stale context.
 *
 * - The open session is a course's session from an earlier day → a notice with
 *   「开今天的课 →」 (which starts today's lesson in a fresh session).
 * - The course page changed since this session's last answer, or nothing was
 *   seen yet in this app run (relaunch / update) → the next prompt carries
 *   `strings.chat.refreshNote` so 学根 re-reads the page and skills.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CourseSummary } from "@shared/data-protocol.js";
import type { DesktopSettings } from "@shared/protocol.js";
import type { ChatController } from "../chat/useChat.js";
import type { NoticeItem } from "../../skins/contract.js";
import { strings } from "../strings.js";
import { needsRefresh, staleCourseSession } from "./session-freshness.js";
import { dateKey } from "./use-calendar.js";
import type { CoursesResource } from "./use-courses.js";

export interface SessionFreshness {
  /** The 「这是 11-06 的…会话」 notice, or null. */
  notice: NoticeItem | null;
  /** Hide the notice for the open session. */
  dismiss(): void;
}

export function useSessionFreshness(
  controller: ChatController,
  courses: CoursesResource,
  activeCourse: string | null,
  openSessionFile: string | null,
  settings: DesktopSettings,
  onStudy: (course: CourseSummary) => void,
): SessionFreshness {
  const today = dateKey(new Date());
  const tz = new Date().getTimezoneOffset();
  const list = courses.state.status === "ready" ? courses.state.value : [];
  const course = activeCourse ? (list.find((item) => item.slug === activeCourse) ?? null) : null;

  // Last seen course-page time per session file, recorded after each answer.
  const seen = useRef<Record<string, number>>({});
  const pending = useRef<{ file: string; from: unknown } | null>(null);
  const wasStreaming = useRef(controller.streaming);
  useEffect(() => {
    const ended = wasStreaming.current && !controller.streaming;
    wasStreaming.current = controller.streaming;
    if (ended && openSessionFile) pending.current = { file: openSessionFile, from: courses.state };
  }, [controller.streaming, openSessionFile, courses.state]);
  useEffect(() => {
    const wait = pending.current;
    // Record only from the list reloaded after the answer, not the one before it.
    if (!wait || courses.state === wait.from || courses.state.status !== "ready") return;
    const own = activeCourse ? courses.state.value.find((item) => item.slug === activeCourse) : undefined;
    seen.current[wait.file] = own?.changedAt ?? 0;
    pending.current = null;
  }, [courses.state, activeCourse]);

  const note = needsRefresh(openSessionFile, activeCourse, controller.messages.length, course?.changedAt, seen.current)
    ? strings.chat.refreshNote
    : null;
  useEffect(() => {
    controller.setRefreshNote(note);
  }, [controller, note]);

  const [dismissed, setDismissed] = useState<string | null>(null);
  const stale = staleCourseSession(activeCourse, openSessionFile, settings.courseSessions, today, tz);
  const dismiss = useCallback(() => setDismissed(openSessionFile), [openSessionFile]);
  const notice: NoticeItem | null =
    stale && course && dismissed !== openSessionFile
      ? {
          tone: "info",
          text: strings.notice.staleSession(stale.day.slice(5), course.title),
          action: { label: strings.notice.staleSessionAction, run: () => onStudy(course) },
        }
      : null;
  return { notice, dismiss };
}
```

注意：如果 `controller.messages` 在 `ChatController` 上不叫这个名字，用实际的消息数组字段；如果 lint 规则不允许在 render 期间读 `seen.current`，把 `needsRefresh` 的计算挪进一个 `useEffect` 里直接调用 `controller.setRefreshNote(...)`（依赖：`openSessionFile, activeCourse, controller.messages.length, course?.changedAt, controller.streaming`），结果相同。

新建 `use-session-freshness.test.tsx`（参照 `use-reload-on-answer.test.tsx` 的 Harness 写法，用一个假的 controller：`{ streaming, messages, setRefreshNote: vi.fn() }` 并 `as unknown as ChatController`）覆盖：
- 会话文件名是昨天、`courseSessions[slug]` 等于它、课程在列表里 → `notice` 不为 null，`notice.action.run()` 调用了 `onStudy(该课程)`；调用 `dismiss()` 后 notice 为 null。
- 会话文件名是今天 → notice 为 null。
- 有消息、从未答完过 → `setRefreshNote` 最后一次以 `strings.chat.refreshNote` 调用；`streaming` true→false 后再给一个新的 ready 课程列表（同样的 `changedAt`）→ 最后一次以 `null` 调用；再给 `changedAt` 更大的列表 → 又以 `refreshNote` 调用。

（测试里的「今天」用真实时钟：用 `dateKey(new Date())` 和 `new Date().getTimezoneOffset()` 现算出今天、昨天对应的 UTC 文件名，别写死日期。）

### 8. 「改计划」「周核实」不进旧会话

文件 `apps/desktop/src/renderer/core/board/use-course-sessions.ts`，`startSession` 回调开头（`const deliver = ...` 之后）加：

```ts
      // A remembered session from an earlier day is stale: 改计划 / 周核实 open a fresh one too.
      const stale = startsFresh(slug, settings.courseSessions, dateKey(new Date()), new Date().getTimezoneOffset());
      const freshNow = fresh || stale;
```

然后把该回调里原来用 `fresh` 的两处换成 `freshNow`：`if (activeCourse === slug && !freshNow) {` 和 `const known = freshNow ? null : (settings.courseSessions[slug] ?? null);`。文件顶部加 `import { startsFresh } from "./session-freshness.js";`。

在 `use-course-sessions.test.tsx` 加一条：`courseSessions` 里这门课记住的会话文件名是昨天的，调用 `handleEditPlan` → `controller.openSession` 以 `null` 调用（开新会话）；记住的是今天的 → 以那个文件调用。

### 9. 面板刷新：答完、窗口获得焦点、过零点

文件 `apps/desktop/src/renderer/core/board/use-reload-on-answer.ts` 末尾加：

```ts
/**
 * Also reload when the window regains focus (the vault may have changed in
 * Obsidian) and when the local day changes while the window stays open.
 * Focus reloads are at most one per 5 s.
 */
export function useReloadOnFocusAndDay(reload: () => void): void {
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);
  useEffect(() => {
    let last = 0;
    const onFocus = (): void => {
      const now = Date.now();
      if (now - last < 5000) return;
      last = now;
      reloadRef.current();
    };
    let day = new Date().toDateString();
    const timer = window.setInterval(() => {
      const current = new Date().toDateString();
      if (current === day) return;
      day = current;
      reloadRef.current();
    }, 60_000);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, []);
}
```

在 `use-reload-on-answer.test.tsx` 加一条：渲染一个调用 `useReloadOnFocusAndDay(reload)` 的 Harness，`window.dispatchEvent(new Event("focus"))` → `reload` 调用 1 次；立刻再派发一次 → 仍是 1 次（5 秒内）。

### 10. `App.tsx` 组装（必须 ≤ 450 行）

文件 `apps/desktop/src/renderer/App.tsx`：

a. 把现有的 `reloadBoard` 整段（注释 `// Reload the board when an answer ends:` 起，到 `useReloadOnAnswer(controller.streaming, reloadBoard);` 止）挪进新文件 `apps/desktop/src/renderer/core/board/use-board-reload.ts`：

```ts
/**
 * One reload for every board resource, run when an answer ends (学根 may have
 * written course progress, reading, cards, calendar notes or the cycle), when
 * the window regains focus, and when the day changes.
 */

import { useCallback } from "react";
import { useReloadOnAnswer, useReloadOnFocusAndDay } from "./use-reload-on-answer.js";

interface Reloadable {
  reload(): void;
}

export function useBoardReload(streaming: boolean, resources: Reloadable[]): void {
  // Resource objects change identity on every render; the reload reads the latest ones.
  const reload = useCallback(() => {
    for (const resource of resources) resource.reload();
    // eslint-safe: the list is rebuilt each render and read at call time.
  }, [resources]);
  useReloadOnAnswer(streaming, reload);
  useReloadOnFocusAndDay(reload);
}
```

（删掉上面代码里那行 `// eslint-safe` 注释；如果 `react-hooks/exhaustive-deps` 对 `[resources]` 报错或数组每次新建导致 `useReloadOnAnswer` 的依赖每次变化——这不会造成循环，因为它只在 streaming 边沿调用——保持 `[resources]` 即可。）

App 里原来那段换成一行：

```ts
  useBoardReload(controller.streaming, [courses, reading, cards, calendar.resource, cycle, subjects]);
```

并把 `import { useReloadOnAnswer } ...` 换成 `import { useBoardReload } from "./core/board/use-board-reload.js";`。如果 `useCallback` 在 App 里不再使用，从 react 导入里删掉。

b. 在 `useCourseSessions(...)` 那一行之后加：

```ts
  const freshness = useSessionFreshness(controller, courses, activeCourse, openSessionFile, settings, handleStudy);
```

（导入 `import { useSessionFreshness } from "./core/board/use-session-freshness.js";`）

c. 把

```ts
  const notices = notice ? [notice, ...controller.notices] : controller.notices;
```

改成

```ts
  const notices = [...(notice ? [notice] : []), ...controller.notices, ...(freshness.notice ? [freshness.notice] : [])];
```

d. 把 Shell 属性里的 `onDismissNotice: controller.dismissNotice,` 改成

```ts
    onDismissNotice: (index) => (freshness.notice && index === notices.length - 1 ? freshness.dismiss() : controller.dismissNotice(index)),
```

完成后：`wc -l src/renderer/App.tsx` ≤ 450。

### 11. 三个皮肤显示提示上的按钮

- `skins/bare/messages.tsx` 的 `Notice`：在 `{notice.text}` 后加
  ```tsx
      {notice.action && (
        <button type="button" onClick={notice.action.run}>
          {notice.action.label}
        </button>
      )}
  ```
- `skins/bear/slots.tsx` 的 `Notice`：在 `</span>`（包住 text 与 detail 的那个）之后、dismiss 按钮之前加
  ```tsx
      {notice.action && (
        <button type="button" className="bear-link bear-link-accent bear-notice-action" onClick={notice.action.run}>
          {notice.action.label}
        </button>
      )}
  ```
  `skins/bear/skin.css` 里在 `.bear-notice-dismiss` 规则附近加：
  ```css
  [data-skin="bear"] .bear-notice-action {
    flex: none;
    margin-left: 8px;
  }
  ```
- `skins/chicago/slots.tsx` 的 `Notice` 非 error 分支：标题在有 `notice.action` 时用 `strings.notice.actionTitle`，否则保持 `strings.chat.loginHint`；`<p>{notice.text}</p>` 之后在有 action 时加
  ```tsx
        {notice.action && (
          <div className="chicago-btns">
            <button type="button" className="chicago-btn" onClick={notice.action.run}>
              {notice.action.label}
            </button>
          </div>
        )}
  ```
- `skins/chicago/shell.tsx`：`const modeless = notices.find((notice) => notice.tone === "info") ?? null;` 改成 `notices.find((notice) => notice.tone === "info" && !notice.action) ?? null;`，并在其后加 `const actionNotice = notices.find((notice) => notice.action) ?? null;`。在 `{modeless && !alertNotice && (` 那块之后加一块：`{actionNotice && !alertNotice && !modeless && ( ... )}`，结构照抄 modeless 那块（同样的 `chicago-win chicago-modeless chicago-show` 窗口、关闭盒调用 `onDismissNotice(notices.indexOf(actionNotice))`），标题用 `strings.notice.actionTitle`，`aria-label` 也用它，窗格里是 `<p>{actionNotice.text}</p>` 加上面那个 `chicago-btns` 按钮块（`actionNotice.action.run` / `.label`），不要 `xuegen login` 那行。

### 12. 画廊样例

`apps/desktop/src/renderer/gallery/Gallery.tsx` 的 `GALLERY_NOTICES` 末尾加：

```ts
  { tone: "info", text: strings.notice.staleSession("11-06", "离散数学（Epp, 5th ed）"), action: { label: strings.notice.staleSessionAction, run: () => undefined } },
```

## 验收命令（贴出每条最后几行）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && npm test && npm run lint:skills
wc -l apps/desktop/src/renderer/App.tsx
grep -rn "eslint-disable\|@ts-ignore\|@ts-expect-error" apps/desktop/src | grep -v test
git status --short
```

`git status --short` 只应出现本批文件（以及本任务单之前就有的改动：`skills/course/SKILL.md`、`skills/cycle-plan/SKILL.md`、`core/strings.ts`、`core/board/course-prompts.ts`、`core/board/course-prompts.test.ts`——这些是 Claude 改的，不要动、不要回退）。

## 结束报告

改了哪些文件；每一步是否照做，偏离之处和原因；未完成项。
