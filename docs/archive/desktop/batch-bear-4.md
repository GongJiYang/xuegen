# 批次 BE-4：Bear 阅读面板（逐步执行清单）

用户已确认的设计稿：`/Users/gjy/pi-learning/design/animate/src/reading.jsx` + `reading.css`（`http://localhost:5181/?d=read`）。

## 规则（上下文被压缩后先重读本文件）
- **只照下面的步骤做，逐字使用给出的代码。** 不要自己设计、不要改写、不要补充。
- 只改：`apps/desktop/src/renderer/core/strings.ts`、`skins/bear/reading-panel.tsx`、`skins/bear/skin.css`，新建 `skins/bear/reading-panel.test.tsx`。其他一律不动。
- 不 commit、不启动 Electron、不读写 `~/.xuegen`、不加依赖、不加 `eslint-disable` / `@ts-ignore`。
- 做不下去就停下，报告哪一步、原文、报错。唯一允许：不改行为的类型标注小修，逐处列出。

工作目录 `/Users/gjy/pi-learning/xuegen/apps/desktop/src/renderer/`。

---

## 第 1 步：`core/strings.ts` 加文案

在 `reading: {` 分组里找到这一行：

```ts
    notStarted: "未开始",
```

在它**下面**插入：

```ts
    readOn: "接着读",
    clip: "剪藏",
    priorityMark: "优先",
    positionAt: (position: string): string => `读到 ${position}`,
    later: "之后",
    nowEmpty: "今天没有要读的。",
    laterEmpty: "队列里没有其他文章。",
```

## 第 2 步：`skins/bear/reading-panel.tsx` 整个文件替换为

```tsx
/**
 * Bear 阅读 panel.
 *
 * One underlined field adds a vault path (with candidates) or hands a URL to
 * 学根 to clip; priority and 今天就读 sit on the line below. The queue splits
 * into 今天该读 (due or overdue: 推迟 / 接着读 / 读完) and 之后 (read-only).
 * 接着读 asks where you stopped and records it on Enter.
 */

import { useEffect, useRef, useState } from "react";
import { RadioGroup } from "radix-ui";
import type { ReadingItem, ReadingPriority } from "@shared/data-protocol.js";
import type { ReadingPanelProps } from "../contract.js";
import { dueLabel, isDueNow } from "../../core/board/reading-due.js";
import { dateKey } from "../../core/board/use-calendar.js";
import { strings } from "../../core/strings.js";

const PRIORITIES: { id: ReadingPriority; label: string }[] = [
  { id: "high", label: strings.reading.priorityHigh },
  { id: "medium", label: strings.reading.priorityMedium },
  { id: "low", label: strings.reading.priorityLow },
];

function isUrl(text: string): boolean {
  return /^https?:\/\//i.test(text.trim());
}

function ReadingRow({
  item,
  today,
  actionable,
  onReview,
}: {
  item: ReadingItem;
  today: string;
  actionable: boolean;
  onReview: ReadingPanelProps["onReview"];
}) {
  const [recording, setRecording] = useState<string | null>(null);

  function record(): void {
    if (recording === null) return;
    onReview(item.slug, "next", recording.trim());
    setRecording(null);
  }

  return (
    <li className="bear-read-item">
      <div className="bear-read-head">
        <span className="bear-read-title">{item.title}</span>
        <span className={isDueNow(item.due, today) ? "bear-read-due is-now" : "bear-read-due"}>
          {dueLabel(item.due, today)}
        </span>
      </div>
      <div className="bear-read-meta">
        {item.priority === "high" && <span className="bear-read-high">{strings.reading.priorityMark}</span>}
        <span>{item.position ? strings.reading.positionAt(item.position) : strings.reading.notStarted}</span>
      </div>
      {actionable &&
        (recording !== null ? (
          <div className="bear-inline-form">
            <input
              className="bear-input"
              autoFocus
              aria-label={strings.reading.positionLabel}
              placeholder={strings.reading.positionPlaceholder}
              value={recording}
              onChange={(event) => setRecording(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") record();
                if (event.key === "Escape") setRecording(null);
              }}
            />
            <button type="button" className="bear-link bear-link-accent" onClick={record}>
              {strings.reading.positionSave}
            </button>
          </div>
        ) : (
          <div className="bear-actions">
            <button type="button" className="bear-link" onClick={() => onReview(item.slug, "postpone")}>
              {strings.reading.postpone}
            </button>
            <button type="button" className="bear-link" onClick={() => setRecording(item.position)}>
              {strings.reading.readOn}
            </button>
            <button type="button" className="bear-link bear-link-accent" onClick={() => onReview(item.slug, "done")}>
              {strings.reading.done}
            </button>
          </div>
        ))}
    </li>
  );
}

export function ReadingPanel({ queue, sources, onAdd, onClip, onReview, focus, onFocusHandled }: ReadingPanelProps) {
  const [value, setValue] = useState("");
  const [priority, setPriority] = useState<ReadingPriority>("medium");
  const [dueToday, setDueToday] = useState(true);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const today = dateKey(new Date());

  // `/加入阅读` opens this tab with `focus: "reading-add"`: put the cursor in
  // the add field, then tell core the request was handled.
  useEffect(() => {
    if (focus !== "reading-add") return;
    inputRef.current?.focus();
    onFocusHandled?.();
  }, [focus, onFocusHandled]);

  const text = value.trim();
  const url = isUrl(text);
  const candidates =
    !url && text && sources.status === "ready"
      ? sources.value.filter((source) => source.path.toLowerCase().includes(text.toLowerCase())).slice(0, 5)
      : [];

  function submit(source?: string): void {
    const chosen = (source ?? value).trim();
    if (!chosen) return;
    const due = dueToday ? "today" : "scheduled";
    if (isUrl(chosen)) {
      onClip(chosen, priority, due);
      setConfirmation(strings.reading.clipped);
    } else {
      setConfirmation(null);
      void onAdd(chosen, priority, due).then((added) => {
        if (added) setConfirmation(strings.reading.added(added.title, dueLabel(added.due, today)));
      });
    }
    setValue("");
  }

  const items = queue.status === "ready" ? queue.value : [];
  const now = items.filter((item) => isDueNow(item.due, today));
  const later = items.filter((item) => !isDueNow(item.due, today));

  return (
    <section className="bear-read" aria-label={strings.tools.reading}>
      <p className="bear-muted bear-read-scope">{strings.reading.scopeHint}</p>
      <div className="bear-read-add">
        <input
          ref={inputRef}
          className="bear-input bear-read-field"
          aria-label={strings.reading.addCaption}
          placeholder={strings.reading.addPlaceholder}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
        {candidates.length > 0 && (
          <ul className="bear-read-cands">
            {candidates.map((source) => (
              <li key={source.path}>
                <button type="button" onClick={() => submit(source.path)}>
                  {source.path}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="bear-read-row">
          <RadioGroup.Root
            className="bear-seg"
            value={priority}
            orientation="horizontal"
            aria-label={strings.reading.priorityLabel}
            onValueChange={(next) => setPriority(next as ReadingPriority)}
          >
            {PRIORITIES.map((entry) => (
              <RadioGroup.Item key={entry.id} value={entry.id} className="bear-seg-item">
                {entry.label}
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
          <button
            type="button"
            role="checkbox"
            aria-checked={dueToday}
            className={dueToday ? "bear-read-toggle is-on" : "bear-read-toggle"}
            onClick={() => setDueToday((current) => !current)}
          >
            <span className="bear-box" aria-hidden="true">
              {dueToday && (
                <svg viewBox="0 0 16 16" width="10" height="10">
                  <path
                    d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            {strings.reading.readToday}
          </button>
          <button
            type="button"
            className="bear-link bear-link-accent bear-read-submit"
            disabled={!text}
            onClick={() => submit()}
          >
            {url ? strings.reading.clip : strings.reading.add}
          </button>
        </div>
        {confirmation && <p className="bear-muted bear-read-note">{confirmation}</p>}
      </div>

      {queue.status === "loading" && <p className="bear-muted">{strings.today.loading}</p>}
      {queue.status === "error" && <p role="alert">{queue.message}</p>}
      {queue.status === "ready" && (
        <>
          <h3 className="bear-section">
            <span>{strings.reading.todayCaption}</span>
            <span className="bear-section-count">{now.length}</span>
          </h3>
          {now.length === 0 ? (
            <p className="bear-muted">{strings.reading.nowEmpty}</p>
          ) : (
            <ul className="bear-read-list">
              {now.map((item) => (
                <ReadingRow key={item.slug} item={item} today={today} actionable onReview={onReview} />
              ))}
            </ul>
          )}
          <h3 className="bear-section">
            <span>{strings.reading.later}</span>
            <span className="bear-section-count">{later.length}</span>
          </h3>
          {later.length === 0 ? (
            <p className="bear-muted">{strings.reading.laterEmpty}</p>
          ) : (
            <ul className="bear-read-list">
              {later.map((item) => (
                <ReadingRow key={item.slug} item={item} today={today} actionable={false} onReview={onReview} />
              ))}
            </ul>
          )}
        </>
      )}
      <p className="bear-muted bear-read-foot">{strings.reading.footnote}</p>
    </section>
  );
}
```

## 第 3 步：`skins/bear/skin.css` 末尾追加（原样粘贴）

```css
/* ── 阅读 (BE-4) ───────────────────────────────────────────────────────── */

[data-skin="bear"] .bear-tabpanels .bear-read-scope {
  margin: 0 0 1em;
  font-size: 12px;
}
[data-skin="bear"] .bear-tabpanels .bear-read-field {
  width: 100%;
  caret-color: var(--accent);
}
[data-skin="bear"] .bear-tabpanels .bear-read-cands {
  margin: 0.3em 0 0;
}
[data-skin="bear"] .bear-tabpanels .bear-read-cands li {
  padding: 0;
  border-bottom: none;
}
[data-skin="bear"] .bear-tabpanels .bear-read-cands button {
  width: 100%;
  padding: 0.3em 0.4em;
  border-radius: 4px;
  text-align: left;
  font-size: 13px;
  color: var(--soft);
}
[data-skin="bear"] .bear-tabpanels .bear-read-cands button:hover {
  background: var(--code-bg);
  color: var(--ink);
}
[data-skin="bear"] .bear-read-row {
  display: flex;
  align-items: baseline;
  gap: 1.2em;
  margin-top: 0.6em;
  font-size: 13px;
}
[data-skin="bear"] .bear-tabpanels .bear-read-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  color: var(--soft);
}
[data-skin="bear"] .bear-tabpanels .bear-read-toggle.is-on {
  color: var(--ink);
}
[data-skin="bear"] .bear-read-toggle .bear-box {
  margin-top: 0;
}
[data-skin="bear"] .bear-tabpanels .bear-read-submit {
  margin-left: auto;
}
[data-skin="bear"] .bear-tabpanels .bear-read-note {
  margin: 0.5em 0 0;
  font-size: 12px;
}
[data-skin="bear"] .bear-tabpanels .bear-read-list li.bear-read-item {
  display: block;
  padding: 0.6em 0;
  border-bottom: 1px solid #eceef0;
}
[data-skin="bear"] .bear-tabpanels .bear-read-list li.bear-read-item:last-child {
  border-bottom: none;
}
[data-skin="bear"] .bear-read-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1em;
}
[data-skin="bear"] .bear-read-title {
  min-width: 0;
  color: var(--ink);
}
[data-skin="bear"] .bear-read-due {
  flex: none;
  font-size: 12px;
  color: var(--soft);
  font-variant-numeric: tabular-nums;
}
[data-skin="bear"] .bear-read-due.is-now {
  color: var(--accent);
}
[data-skin="bear"] .bear-read-meta {
  display: flex;
  gap: 0.7em;
  margin-top: 0.1em;
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-read-high {
  color: var(--ink);
}
[data-skin="bear"] .bear-tabpanels .bear-read-foot {
  margin-top: 1.6em;
  font-size: 12px;
}
```

## 第 4 步：新建 `skins/bear/reading-panel.test.tsx`

参照 `today-panel.test.tsx` 的 import 方式；基础 props 用 `{ ...SAMPLE_PANELS.reading, tool: "reading" }`。今天的日期在测试里用 `dateKey(new Date())`（从 `../../core/board/use-calendar.js` import）。用例名称照抄：

1. `"splits the queue into 今天该读 and 之后"`：`queue: { status: "ready", value: [A, B] }`，A 的 `due` 是今天、B 的 `due` 是今天往后 3 天（`ReadingItem` 字段：`slug, title, priority, due, position, status`）。A 那一行能找到名为 `strings.reading.done` 的按钮；B 的标题存在但整个面板里名为 `strings.reading.done` 的按钮只有 1 个。
2. `"records where you stopped on Enter"`：只有 A。点 `strings.reading.readOn`，在 `getByLabelText(strings.reading.positionLabel)` 输入 `"第 4 节"` 回车，`onReview` 收到 `(A.slug, "next", "第 4 节")`。
3. `"adds a vault path and clips a URL"`：在 `getByLabelText(strings.reading.addCaption)` 输入 `"raw/x.md"` 回车，`onAdd` 收到 `("raw/x.md", "medium", "today")`（`onAdd` 用 `vi.fn().mockResolvedValue(null)`）；再输入 `"https://a.b/c"`，名为 `strings.reading.clip` 的按钮出现，点它，`onClip` 收到 `("https://a.b/c", "medium", "today")`。
4. `"focuses the add field when asked"`：传 `focus: "reading-add"` 和 `onFocusHandled: vi.fn()`；渲染后 `document.activeElement` 是 `getByLabelText(strings.reading.addCaption)`，且 `onFocusHandled` 被调用一次。

## 第 5 步：验收（必须自己跑，贴最后几行）

`apps/desktop`：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。仓库根：`npm test`、`npm run lint:skills`。

## 结束报告
第 1–4 步是否照做；任何偏离列原文与改后；所有命令结果。

## 执行记录（2026-11-05）
Devin 照清单执行，零偏离；测试副本真实 Electron 核对：候选、加入（真实 reading-queue.mjs）、确认行、今天该读一行与设计稿一致；用户正式窗口已重载。
