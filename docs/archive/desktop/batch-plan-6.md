# 批次 PL-6：每门课每天第一次开课用新会话

用户决定（2026-11-06）：每门课每天第一次点「开始学习 / 继续学习」时开一个**新会话**；当天再点就回到这个会话。旧会话文件保留（「继续会话」列表里还能翻）。

原因（Claude 已查实）：离散课 11-06 开课消息被发进了 11-05 建课时的会话，那个会话里还留着改计划前读到的课程页（§1.1–1.2 / 60 分钟 / 每天学），学根没重读文件，按旧记忆回答，和当前课程页对不上。

## 硬约束（先看这里）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。
- 按步骤**逐条照做**；不要重新设计。做不通时停下报告。
- 只准改：`renderer/core/board/use-course-sessions.ts`、`renderer/core/board/use-course-sessions.test.tsx`、`renderer/core/board/opening-action.ts`（只改注释）。
- 不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 commit / push，不加依赖，不加 `eslint-disable` / `@ts-ignore`。

以下路径都相对 `apps/desktop/src/`。

## 第 1 步：`renderer/core/board/use-course-sessions.ts`

1. `startSession` 的参数列表 `(slug: string, text: string, card: CourseIntro | null, startedOn: string | null, command = false)` 改为：

```ts
    (slug: string, text: string, card: CourseIntro | null, startedOn: string | null, command = false, fresh = false) => {
```

2. 函数体里 `if (activeCourse === slug) {` 改为 `if (activeCourse === slug && !fresh) {`。

3. `const known = settings.courseSessions[slug] ?? null;`（`startSession` 里那一行，不是 `switchOnly` 里的）改为：

```ts
      // The day's first lesson starts a fresh session, so 学根 reads the course
      // file anew instead of answering from an older session's memory.
      const known = fresh ? null : (settings.courseSessions[slug] ?? null);
```

4. `openCourse` 里最后一行 `startSession(slug, fallbackText, card, today);` 改为 `startSession(slug, fallbackText, card, today, false, true);`。

5. `CourseSessionActions.handleStudy` 的注释改为 `/** 「开始学习」/「回到这门课」: the day's first click starts today's lesson in a fresh session; later clicks switch back. */`；文件头注释第 3 行 `Each course studies in its own transcript so courses never share a context.` 后面加一句 `Each day's first lesson opens a fresh transcript; the rest of that day returns to it.`

## 第 2 步：`renderer/core/board/opening-action.ts`

只改注释：`A course keeps one session across days, so a click can mean two different` 改为 `A course gets a fresh session for each day's first lesson, so a click can mean two different`。

## 第 3 步：`renderer/core/board/use-course-sessions.test.tsx`

1. 在 `it("sends and records the day when opening the course", …)` 测试里，`render(` 的 `<Harness` 加属性 `settings={{ ...DEFAULT_DESKTOP_SETTINGS, courseSessions: { ctm: "/home/sessions/old.jsonl" } }}`；在 `expect(controller.send).toHaveBeenCalledTimes(1);` 上面加：

```ts
    // The day's first lesson does not reuse yesterday's session.
    expect(controller.openSession).toHaveBeenCalledWith(null);
```

   并在最后加：

```ts
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ courseSessions: { ctm: "/home/sessions/new.jsonl" } }),
    );
```

2. 新增一个测试（放在上面那个测试后面）：

```ts
  it("opens a fresh session for the day's first lesson even when that course is active", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 4, 9));
    const controller = fakeController("/home/sessions/new.jsonl");
    render(
      <Harness
        controller={controller}
        courses={readyCourses([course])}
        update={vi.fn()}
        setActiveCourse={vi.fn()}
        activeCourse="ctm"
        settings={{ ...DEFAULT_DESKTOP_SETTINGS, courseSessions: { ctm: "/home/sessions/old.jsonl" }, courseStartedOn: { ctm: "2026-11-03" } }}
      />,
    );

    await act(async () => {
      actions?.handleStudy(course);
      await Promise.resolve();
    });

    expect(controller.openSession).toHaveBeenCalledWith(null);
    expect(controller.send).toHaveBeenCalledTimes(1);
  });
```

   （`Harness` 若没有 `activeCourse` 属性，照本文件里「only sends when already in that course's session」那个测试设置「当前课程是 ctm」的写法改；在报告里说明用了哪种写法。）

3. 跑测试。其他已有测试若因为「第一次开课不再复用旧会话」而失败，**先看它测的是不是当天第一次开课**：是的话把期望改成 `openSession(null)`；不是（同一天再次点击、改计划、`handleStartSession`）就说明实现错了，回头检查第 1 步，不要改测试。在报告里逐个列出改了哪些测试期望及原因。

## 验收命令（全部贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && git status --short
```

## 结束报告

改了哪些文件；每一步是否照做；改了哪些已有测试的期望及原因；未完成项。
