# 批次 BE-6：Bear 卡片面板（逐步执行清单）

设计稿：`/Users/gjy/pi-learning/design/animate/src/cards.jsx` + `cards.css`（`http://localhost:5181/?d=cards`）。

## 规则（上下文被压缩后先重读本文件）
- **只照下面的步骤做，逐字使用给出的代码。** 不要自己设计、不要改写、不要补充。
- 只改：`apps/desktop/src/renderer/core/strings.ts`、`skins/bear/cards-panel.tsx`、`skins/bear/skin.css`，新建 `skins/bear/cards-panel.test.tsx`。其他一律不动。
- 不 commit、不启动 Electron、不读写 `~/.xuegen`、不加依赖、不加 `eslint-disable` / `@ts-ignore`。
- 做不下去就停下，报告哪一步、原文、报错。唯一允许：不改行为的类型标注小修，逐处列出。

工作目录 `/Users/gjy/pi-learning/xuegen/apps/desktop/src/renderer/`。

---

## 第 1 步：`core/strings.ts` 加文案

在 `cards: {` 分组里找到：

```ts
    empty: "还没有卡片。上面存一张，或让学根起草。",
```

在它**下面**插入：

```ts
    decksCaption: "牌组",
    newCard: "＋ 新卡片",
    frontLabel: "正面",
    backLabel: "背面",
    cancel: "取消",
    syncNote: "写入库后由 Obsidian 同步到 Anki。",
    allSynced: "已全部同步",
    unsyncedCount: (n: number): string => `待同步 ${n}`,
    dueTodayCount: (n: number): string => `今日到期 ${n}`,
    reviewedTodayCount: (n: number): string => `今日已复习 ${n}`,
    extractsCount: (n: number): string => `${n} 条摘录待制卡`,
    saved: (deck: string): string => `已存入 ${deck}`,
```

## 第 2 步：`skins/bear/cards-panel.tsx` 整个文件替换为

```tsx
/**
 * Bear 卡片 panel.
 *
 * Anki's connection on one line (with today's reviews, or 重试 when Anki is
 * closed), the total and unsynced counts as two large numbers, a highlighted
 * line when extracts wait to become cards (让学根起草), then the decks: name,
 * total, a 2px synced-ratio meter, and unsynced / due-today counts. 「＋ 新卡片」
 * folds the new-card form above the deck list.
 */

import { useState } from "react";
import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number";
import type { CardsPanelProps } from "../contract.js";
import { strings } from "../../core/strings.js";

function NewCardForm({
  decks,
  onAdd,
  onDone,
}: {
  decks: string[];
  onAdd: CardsPanelProps["onAdd"];
  onDone(saved: string | null): void;
}) {
  const [deck, setDeck] = useState(decks[0] ?? "");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const ready = deck.trim() !== "" && front.trim() !== "" && back.trim() !== "";

  function save(): void {
    if (!ready) return;
    onAdd(deck.trim(), front.trim(), back.trim());
    onDone(deck.trim());
  }

  return (
    <div className="bear-newcard">
      <label className="bear-card-field">
        <span className="bear-card-label">{strings.cards.deckLabel}</span>
        {decks.length > 0 ? (
          <select
            className="bear-card-input"
            aria-label={strings.cards.deckLabel}
            value={deck}
            onChange={(event) => setDeck(event.target.value)}
          >
            {decks.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="bear-card-input"
            aria-label={strings.cards.deckLabel}
            value={deck}
            onChange={(event) => setDeck(event.target.value)}
          />
        )}
      </label>
      <label className="bear-card-field">
        <span className="bear-card-label">{strings.cards.frontLabel}</span>
        <input
          className="bear-card-input"
          aria-label={strings.cards.frontLabel}
          placeholder={strings.cards.frontPlaceholder}
          value={front}
          onChange={(event) => setFront(event.target.value)}
        />
      </label>
      <label className="bear-card-field is-top">
        <span className="bear-card-label">{strings.cards.backLabel}</span>
        <textarea
          className="bear-card-input"
          rows={3}
          aria-label={strings.cards.backLabel}
          placeholder={strings.cards.backPlaceholder}
          value={back}
          onChange={(event) => setBack(event.target.value)}
        />
      </label>
      <div className="bear-actions">
        <button type="button" className="bear-link" onClick={() => onDone(null)}>
          {strings.cards.cancel}
        </button>
        <button type="button" className="bear-link bear-link-accent" disabled={!ready} onClick={save}>
          {strings.cards.add}
        </button>
      </div>
    </div>
  );
}

export function CardsPanel({ cards, anki, onAdd, onRetryAnki, onDraft }: CardsPanelProps) {
  const [creating, setCreating] = useState(false);
  const [savedDeck, setSavedDeck] = useState<string | null>(null);
  const stats = cards.status === "ready" ? cards.value : null;
  const ankiStatus = anki.status === "ready" ? anki.value : null;
  const running = ankiStatus?.running === true;
  const decks = stats?.decks ?? [];
  const dueOf = (deck: string): number => ankiStatus?.due?.find((entry) => entry.deck === deck)?.count ?? 0;

  return (
    <section className="bear-cards" aria-label={strings.tools.cards}>
      <div className="bear-anki">
        <span className={running ? "bear-anki-dot is-on" : "bear-anki-dot"} aria-hidden="true" />
        {running ? (
          <>
            <span>{strings.cards.ankiRunning}</span>
            <span className="bear-anki-today">{strings.cards.reviewedTodayCount(ankiStatus?.reviewedToday ?? 0)}</span>
          </>
        ) : (
          <>
            <span>{strings.cards.ankiNotRunning}</span>
            <button type="button" className="bear-link" onClick={onRetryAnki}>
              {strings.cards.retry}
            </button>
          </>
        )}
      </div>

      {cards.status === "loading" && <p className="bear-muted">{strings.today.loading}</p>}
      {cards.status === "error" && <p role="alert">{cards.message}</p>}
      {stats && (
        <>
          <dl className="bear-card-counts">
            <div>
              <dt>{strings.cards.total}</dt>
              <dd>
                <SlidingNumber number={stats.total} initiallyStable />
              </dd>
            </div>
            <div>
              <dt>{strings.cards.unsynced}</dt>
              <dd>
                <SlidingNumber number={stats.unsynced} initiallyStable />
              </dd>
            </div>
          </dl>
          <p className="bear-muted bear-card-note">{strings.cards.syncNote}</p>

          {stats.pendingExtracts > 0 && (
            <div className="bear-extracts">
              <span>{strings.cards.extractsCount(stats.pendingExtracts)}</span>
              <button type="button" className="bear-link bear-link-accent" onClick={onDraft}>
                {strings.cards.draft}
              </button>
            </div>
          )}

          <h3 className="bear-section">
            <span>{strings.cards.decksCaption}</span>
            <button
              type="button"
              className="bear-link"
              aria-expanded={creating}
              onClick={() => {
                setSavedDeck(null);
                setCreating((value) => !value);
              }}
            >
              {strings.cards.newCard}
            </button>
          </h3>
          {creating && (
            <NewCardForm
              decks={decks.map((entry) => entry.deck)}
              onAdd={onAdd}
              onDone={(saved) => {
                setSavedDeck(saved);
                setCreating(false);
              }}
            />
          )}
          {savedDeck && <p className="bear-muted bear-card-note">{strings.cards.saved(savedDeck)}</p>}

          {decks.length === 0 ? (
            <p className="bear-muted">{strings.cards.empty}</p>
          ) : (
            <ul className="bear-decks">
              {decks.map((entry) => {
                const synced = entry.total > 0 ? Math.round(((entry.total - entry.unsynced) / entry.total) * 100) : 0;
                const due = running ? dueOf(entry.deck) : 0;
                return (
                  <li key={entry.deck} className="bear-deck">
                    <div className="bear-deck-head">
                      <span className="bear-deck-name" title={entry.deck}>
                        {entry.deck}
                      </span>
                      <span className="bear-deck-num">{entry.total}</span>
                    </div>
                    <div className="bear-meter" aria-hidden="true">
                      <div className="bear-meter-fill" style={{ width: `${synced}%` }} />
                    </div>
                    <div className="bear-deck-meta">
                      <span>
                        {entry.unsynced > 0 ? strings.cards.unsyncedCount(entry.unsynced) : strings.cards.allSynced}
                      </span>
                      {due > 0 && <span className="bear-deck-due">{strings.cards.dueTodayCount(due)}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
```

## 第 3 步：`skins/bear/skin.css` 末尾追加（原样粘贴）

```css
/* ── 卡片 (BE-6) ───────────────────────────────────────────────────────── */

[data-skin="bear"] .bear-anki {
  display: flex;
  align-items: center;
  gap: 0.6em;
  font-size: 13px;
  color: var(--ink);
}
[data-skin="bear"] .bear-anki-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px var(--soft);
}
[data-skin="bear"] .bear-anki-dot.is-on {
  background: var(--accent);
  box-shadow: none;
}
[data-skin="bear"] .bear-anki-today {
  color: var(--soft);
}
[data-skin="bear"] .bear-card-counts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin: 1.2em 0 0.2em;
}
[data-skin="bear"] .bear-card-counts dt {
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-card-counts dd {
  margin: 0;
  display: inline-flex;
  font-size: 22px;
  font-weight: 650;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
[data-skin="bear"] .bear-tabpanels .bear-card-note {
  margin: 0.3em 0;
  font-size: 12px;
}
[data-skin="bear"] .bear-extracts {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: 1em;
  padding: 0.1em 0 0.1em 0.9em;
  border-left: 2px solid var(--accent);
  font-size: 13px;
  color: var(--ink);
}
[data-skin="bear"] .bear-newcard {
  margin: 0.4em 0 0.8em;
  padding: 0 0 0.6em 0.9em;
  border-left: 2px solid var(--rule);
}
[data-skin="bear"] .bear-tabpanels .bear-card-field {
  display: flex;
  align-items: baseline;
  gap: 0.8em;
  margin: 0.5em 0;
}
[data-skin="bear"] .bear-tabpanels .bear-card-field.is-top {
  align-items: flex-start;
}
[data-skin="bear"] .bear-card-label {
  flex: none;
  width: 3em;
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-tabpanels .bear-card-input {
  flex: 1;
  min-width: 0;
  resize: vertical;
  caret-color: var(--accent);
}
[data-skin="bear"] .bear-tabpanels .bear-decks li.bear-deck {
  display: block;
  padding: 0.6em 0;
  border-bottom: 1px solid #eceef0;
}
[data-skin="bear"] .bear-deck-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1em;
}
[data-skin="bear"] .bear-deck-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink);
}
[data-skin="bear"] .bear-deck-num {
  flex: none;
  font-size: 13px;
  color: var(--soft);
  font-variant-numeric: tabular-nums;
}
[data-skin="bear"] .bear-deck .bear-meter {
  margin-top: 0.45em;
}
[data-skin="bear"] .bear-deck-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 0.3em;
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-deck-due {
  color: var(--accent);
}
```

## 第 4 步：新建 `skins/bear/cards-panel.test.tsx`

参照 `today-panel.test.tsx` 的 import 方式；基础 props 用 `{ ...SAMPLE_PANELS.cards, tool: "cards" }`。用例名称照抄：

1. `"shows Anki connected with today's reviews, or 重试 when closed"`：`anki: { status: "ready", value: { running: true, reviewedToday: 7 } }` 时能找到 `strings.cards.ankiRunning` 和 `strings.cards.reviewedTodayCount(7)`；`anki: { status: "ready", value: { running: false } }` 时能找到名为 `strings.cards.retry` 的按钮，点它 `onRetryAnki` 被调用一次。
2. `"offers 让学根起草 only when extracts are waiting"`：`cards` 的 `pendingExtracts: 2` 时能找到 `strings.cards.extractsCount(2)`，点名为 `strings.cards.draft` 的按钮 `onDraft` 被调用一次；`pendingExtracts: 0` 时找不到该按钮。（`cards.value` 用 `SAMPLE_PANELS.cards.cards` 的值展开后覆盖 `pendingExtracts`；若它不是 `status: "ready"`，自己构造一个 `CardsStats`：`{ total: 10, unsynced: 3, decks: [{ deck: "DP", total: 10, unsynced: 3, files: [] }], pendingExtracts: 2 }`。）
3. `"lists each deck with its unsynced count and due-today when Anki runs"`：`cards.value.decks = [{ deck: "DP", total: 10, unsynced: 3, files: [] }, { deck: "SRE", total: 5, unsynced: 0, files: [] }]`，`anki.value = { running: true, reviewedToday: 0, due: [{ deck: "DP", count: 4 }] }`：能找到 `"DP"`、`strings.cards.unsyncedCount(3)`、`strings.cards.allSynced`、`strings.cards.dueTodayCount(4)`。
4. `"saves a new card only when deck, front and back are filled"`：点 `strings.cards.newCard`；名为 `strings.cards.add` 的按钮是 disabled；在 `getByLabelText(strings.cards.frontLabel)` 输入 `"Q"`、`getByLabelText(strings.cards.backLabel)` 输入 `"A"` 后可用；点它，`onAdd` 收到 `(第一个牌组名, "Q", "A")`，并能找到 `strings.cards.saved(第一个牌组名)`。

## 第 5 步：验收（必须自己跑，贴最后几行）

`apps/desktop`：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。仓库根：`npm test`、`npm run lint:skills`。

## 结束报告
第 1–4 步是否照做；任何偏离列原文与改后；所有命令结果。
