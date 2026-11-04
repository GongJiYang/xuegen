/**
 * Bare skin panels (part 1): the tool dock, the 今天 window, and the reading
 * tool window — all as plain semantic HTML.
 *
 * The reference skin. It exists so the contract test has a concrete
 * implementation of every new slot and so a fallback skin still shows the F2
 * features (without design). No styles, no motion. The progress panel is in
 * `progress-panel.tsx`, the remaining panels in `panels-more.tsx`.
 */

import { useState } from "react";
import type { ReadingPanelProps, TodayPanelProps, ToolDockProps } from "../contract.js";
import { strings } from "../../core/strings.js";

export function ToolDock({ tools, active, onOpen, todayActive, onOpenToday }: ToolDockProps) {
  return (
    <nav data-slot="tool-dock" aria-label={strings.tools.dockLabel}>
      <ul>
        <li>
          <button
            type="button"
            aria-current={todayActive ? "true" : undefined}
            onClick={onOpenToday}
          >
            {strings.today.title}
          </button>
        </li>
        {tools.map((tool) => (
          <li key={tool.id}>
            <button
              type="button"
              aria-current={active === tool.id ? "true" : undefined}
              onClick={() => onOpen(tool.id)}
            >
              {tool.name}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function TodayPanel({ todayPlan, readingDue, cards, resume, onResume, agentReady }: TodayPanelProps) {
  return (
    <section data-slot="today" aria-label={strings.today.title}>
      <h2>{strings.today.title}</h2>
      <dl>
        <dt>{strings.today.todayPlan}</dt>
        <dd>{todayPlan.length}</dd>
        <dt>{strings.today.readingDue}</dt>
        <dd>{readingDue.status === "ready" ? readingDue.value.dueToday : "—"}</dd>
        <dt>{strings.today.cardsPending}</dt>
        <dd>{cards.status === "ready" ? cards.value.unsynced : "—"}</dd>
      </dl>
      {todayPlan.length > 0 && (
        <ul data-slot="today-plan">
          {todayPlan.map((item, index) => (
            <li key={index}>
              {item.label}：{item.detail}
            </li>
          ))}
        </ul>
      )}
      {resume ? (
        <div data-slot="resume">
          <p>
            {strings.today.resumeTitle}：{resume.course.title}
          </p>
          <p>
            {strings.today.nextSession}
            {resume.nextSession ?? strings.today.nextSessionUnset}
          </p>
          <button type="button" disabled={!agentReady} onClick={onResume}>
            {agentReady ? strings.today.resume : strings.today.preparing}
          </button>
        </div>
      ) : (
        <p>{strings.today.resumeEmpty}</p>
      )}
    </section>
  );
}

/** The add form: a vault path adds directly, an http(s) URL is handed to the agent. */
function ReadingForm({ sources, onAdd, onClip }: Pick<ReadingPanelProps, "sources" | "onAdd" | "onClip">) {
  const [value, setValue] = useState("");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const [dueToday, setDueToday] = useState(true);

  function submit(): void {
    const text = value.trim();
    if (!text) return;
    const due = dueToday ? "today" : "scheduled";
    if (/^https?:\/\//i.test(text)) onClip(text, priority, due);
    else void onAdd(text, priority, due);
    setValue("");
  }

  return (
    <div data-slot="reading-add">
      <h3>{strings.reading.addCaption}</h3>
      <input
        aria-label={strings.reading.addCaption}
        placeholder={strings.reading.addPlaceholder}
        value={value}
        list="reading-sources"
        onChange={(event) => setValue(event.target.value)}
      />
      <datalist id="reading-sources">
        {sources.status === "ready" && sources.value.map((source) => <option key={source.path} value={source.path} />)}
      </datalist>
      <fieldset>
        <legend>{strings.reading.priorityLabel}</legend>
        {(["high", "medium", "low"] as const).map((id) => (
          <label key={id}>
            <input
              type="radio"
              name="reading-priority"
              checked={priority === id}
              onChange={() => setPriority(id)}
            />
            {id === "high"
              ? strings.reading.priorityHigh
              : id === "medium"
                ? strings.reading.priorityMedium
                : strings.reading.priorityLow}
          </label>
        ))}
      </fieldset>
      <label>
        <input type="checkbox" checked={dueToday} onChange={(event) => setDueToday(event.target.checked)} />
        {strings.reading.readToday}
      </label>
      <button type="button" onClick={submit}>
        {strings.reading.add}
      </button>
    </div>
  );
}

export function ReadingPanel({ queue, sources, onAdd, onClip, onReview }: ReadingPanelProps) {
  return (
    <section data-slot="reading" aria-label={strings.tools.reading}>
      <ReadingForm sources={sources} onAdd={onAdd} onClip={onClip} />
      {queue.status === "loading" && <p>{strings.today.loading}</p>}
      {queue.status === "error" && <p role="alert">{queue.message}</p>}
      {queue.status === "ready" &&
        (queue.value.length === 0 ? (
          <p>{strings.reading.empty}</p>
        ) : (
          <ul>
            {queue.value.map((item) => (
              <li key={item.slug}>
                <h4>{item.title}</h4>
                <p>
                  {item.priority} · {item.position || strings.reading.notStarted}
                </p>
                <button type="button" onClick={() => onReview(item.slug, "next")}>
                  {strings.reading.next}
                </button>
                <button type="button" onClick={() => onReview(item.slug, "postpone")}>
                  {strings.reading.postpone}
                </button>
                <button type="button" onClick={() => onReview(item.slug, "done")}>
                  {strings.reading.done}
                </button>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
