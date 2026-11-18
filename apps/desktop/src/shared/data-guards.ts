/**
 * Runtime guard for renderer -> main data requests (`isDataRequest`), split
 * out of `data-protocol.ts` so that file stays under the line cap. The switch
 * stays exhaustive over `DataRequest["kind"]`: a new request kind needs a new
 * case here and a new response type in `DataResponseMap`.
 */
import type { DataRequest, ReadingDue, ReadingOutcome, ReadingPriority } from "./data-protocol.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** True for a real `YYYY-MM-DD` date (shape and calendar validity). */
function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const time = Date.parse(`${text}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === text;
}

/** True for a `YYYY-MM` month with month 01-12. */
function isIsoMonth(text: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(text)) return false;
  const month = Number(text.slice(5));
  return month >= 1 && month <= 12;
}

function isPriority(value: unknown): value is ReadingPriority {
  return value === "high" || value === "medium" || value === "low";
}

function isOutcome(value: unknown): value is ReadingOutcome {
  return value === "next" || value === "postpone" || value === "done";
}

function isReadingDue(value: unknown): value is ReadingDue {
  return value === "today" || value === "scheduled";
}

/**
 * Runtime guard for renderer -> main data requests.
 *
 * The renderer is not fully trusted, so every request is validated here before
 * the main process touches the vault or the Anki socket.
 */
export function isDataRequest(value: unknown): value is DataRequest {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case "courses.list":
    case "reading.stats":
    case "reading.sources":
    case "reading.queue":
    case "cards.stats":
    case "anki.status":
    case "skills.list":
      return true;
    case "terms.list":
      return value.since === undefined || (typeof value.since === "string" && isIsoDate(value.since));
    case "domain.subjects":
      return true;
    case "domain.glossary":
      return typeof value.subject === "string" && /^[a-z0-9][a-z0-9-]*$/.test(value.subject);
    case "wiki.read":
      // The path is re-checked against `<vault>/wiki/` in the main process; here
      // it only has to be a plausible absolute `.md` path.
      return typeof value.path === "string" && value.path.startsWith("/") && value.path.endsWith(".md");
    case "reading.today":
      return typeof value.limit === "number" && Number.isInteger(value.limit) && value.limit >= 0;
    case "reading.add":
      return (
        typeof value.source === "string" &&
        isPriority(value.priority) &&
        (value.due === undefined || isReadingDue(value.due))
      );
    case "reading.review":
      return (
        typeof value.slug === "string" &&
        isOutcome(value.outcome) &&
        (value.position === undefined || typeof value.position === "string")
      );
    case "shelf.today":
      return typeof value.today === "string" && isIsoDate(value.today);
    case "shelf.list":
      // The range is optional but must be given as a pair of valid ISO dates with from ≤ to.
      return (
        (value.from === undefined) === (value.to === undefined) &&
        (value.from === undefined ||
          (typeof value.from === "string" &&
            typeof value.to === "string" &&
            isIsoDate(value.from) &&
            isIsoDate(value.to) &&
            value.from <= value.to))
      );
    case "shelf.done":
      return (
        typeof value.slug === "string" &&
        /^[a-z0-9-]+$/.test(value.slug) &&
        typeof value.today === "string" &&
        isIsoDate(value.today)
      );
    case "shelf.afterDone":
      return (
        typeof value.book === "string" &&
        /^[a-z0-9][a-z0-9-]*$/.test(value.book) &&
        typeof value.index === "number" &&
        Number.isInteger(value.index) &&
        value.index >= 1 &&
        value.index <= 999 &&
        typeof value.today === "string" &&
        isIsoDate(value.today)
      );
    case "shelf.extract":
      return (
        typeof value.slug === "string" &&
        /^[a-z0-9-]+$/.test(value.slug) &&
        typeof value.page === "number" &&
        Number.isInteger(value.page) &&
        value.page >= 1 &&
        value.page <= 99999 &&
        typeof value.text === "string" &&
        value.text.trim().length > 0 &&
        value.text.trim().length <= 500 &&
        typeof value.today === "string" &&
        isIsoDate(value.today)
      );
    case "shelf.card":
      return (
        typeof value.slug === "string" &&
        /^[a-z0-9-]+$/.test(value.slug) &&
        Array.isArray(value.indexes) &&
        value.indexes.length > 0 &&
        value.indexes.length <= 200 &&
        value.indexes.every((index) => Number.isInteger(index) && index > 0) &&
        typeof value.today === "string" &&
        isIsoDate(value.today)
      );
    case "cards.add":
      return (
        typeof value.deck === "string" && typeof value.front === "string" && typeof value.back === "string"
      );
    case "cards.sync":
      return typeof value.dryRun === "boolean";
    case "calendar.month":
      return typeof value.month === "string" && isIsoMonth(value.month);
    case "calendar.write":
      return typeof value.date === "string" && isIsoDate(value.date) && typeof value.text === "string";
    case "cycle.day":
    case "cycle.overview":
      return typeof value.date === "string" && isIsoDate(value.date);
    case "cycle.month":
      return typeof value.month === "string" && isIsoMonth(value.month);
    case "cycle.accept":
      return typeof value.cycle === "string" && /^C\d+$/.test(value.cycle);
    case "cycle.preview":
      return (
        typeof value.from === "string" &&
        /^C\d+$/.test(value.from) &&
        typeof value.start === "string" &&
        isIsoDate(value.start) &&
        Array.isArray(value.main) &&
        value.main.length >= 1 &&
        value.main.length <= 2 &&
        value.main.every((slug) => typeof slug === "string" && /^[a-z0-9][a-z0-9-]*$/.test(slug))
      );
    case "subjects.list":
      return typeof value.date === "string" && isIsoDate(value.date);
    case "plan.undoable":
    case "plan.undo":
      // `since` is an ISO timestamp with timezone recorded when the answer
      // started; Date.parse both validates the shape and rejects garbage.
      return (
        typeof value.since === "string" && value.since.length > 0 && !Number.isNaN(Date.parse(value.since))
      );
    case "history.list":
      return typeof value.days === "number" && Number.isInteger(value.days) && value.days >= 1 && value.days <= 90;
    case "history.undo":
      return (
        Array.isArray(value.ids) &&
        value.ids.length >= 1 &&
        value.ids.length <= 20 &&
        value.ids.every((id) => typeof id === "string" && /^[0-9a-f]{8,64}$/.test(id))
      );
    case "sessions.list":
      return typeof value.current === "string" && value.current.endsWith(".jsonl");
    case "sessions.others":
      return typeof value.current === "string" && value.current.endsWith(".jsonl");
    case "sessions.studied":
      return typeof value.date === "string" && isIsoDate(value.date);
    case "check.run":
    case "check.last":
    case "prefs.list":
      return true;
    case "course.stop":
    case "course.resume":
      return typeof value.slug === "string" && /^[a-z0-9][a-z0-9-]*$/.test(value.slug);
    case "prefs.remove":
      return (
        typeof value.subject === "string" &&
        /^[a-z0-9][a-z0-9-]*$/.test(value.subject) &&
        typeof value.text === "string" &&
        value.text.trim().length > 0
      );
    case "skills.setEnabled":
      return typeof value.name === "string" && typeof value.enabled === "boolean";
    case "skills.fetch":
      return typeof value.url === "string";
    case "skills.review":
    case "skills.discard":
      return typeof value.name === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value.name);
    case "update.check":
    case "update.download":
    case "update.install":
      return true;
    default:
      return false;
  }
}
