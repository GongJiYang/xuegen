/**
 * The 书房 wire-up in `shellPanels`: the panel gets a ready view model, and
 * 「把 N 句做成卡 →」 sends one prompt built from the book's short name, slug,
 * and pending extract count — or nothing at all when the shelf is not loaded.
 */

import { describe, expect, it, vi } from "vitest";
import type { AnkiStatus, CardsStats, ShelfListItem, SubjectsOverview } from "@shared/data-protocol.js";
import type { SkillInfo } from "@shared/data-protocol.js";
import type { BoardResource } from "./use-resource.js";
import type { ReadingResource } from "./use-reading.js";
import type { CoursesResource } from "./use-courses.js";
import { shellPanels, type ShellPanelsInput } from "./shell-panels.js";
import { strings } from "../strings.js";
import { withActionMarker } from "../chat/action-marker.js";

const TODAY = "2026-11-11";

function ready<T>(value: T): BoardResource<T> {
  return {
    state: { status: "ready", value },
    reload: vi.fn(),
    mutate: vi.fn(),
  } as unknown as BoardResource<T>;
}

const EPP: ShelfListItem = {
  slug: "epp",
  title: "Discrete Mathematics with Applications",
  short: "Epp",
  slot: "planned",
  order: 1,
  status: "reading",
  total: 81,
  position: 1,
  started: "2026-11-10",
  end: "2027-01-28",
  target: null,
  targetLate: null,
  extracts: [
    { index: 2, page: 16, text: "乙", carded: null },
    { index: 3, page: 17, text: "丙", carded: null },
    { index: 1, page: 14, text: "甲", carded: "2026-11-09" },
  ],
  coreRead: [],
  upcoming: [{ index: 2, date: TODAY, title: "Ch1", from: 10, to: 18 }],
};

function input(list: BoardResource<ShelfListItem[]>, onDraftCards = vi.fn()): ShellPanelsInput {
  const reading = {
    items: ready([]),
    queue: ready([]),
    stats: ready({
      reading: { queued: 0, active: 0, paused: 0, done: 0 },
      dueToday: 0,
      overdue: 0,
      reviewsLast7: 0,
      cardsPending: 0,
    }),
    sources: ready([]),
    shelf: {
      today: ready({ planned: null, free: null }),
      list,
      reload: vi.fn(),
      done: vi.fn(),
      extract: vi.fn(),
    },
    reload: vi.fn(),
    add: vi.fn(),
    review: vi.fn(),
  } as unknown as ReadingResource;
  return {
    courses: ready([]) as CoursesResource,
    reading,
    cards: {
      stats: ready<CardsStats>({ total: 0, unsynced: 0, broken: 0, decks: [], pendingExtracts: 0 }),
      add: vi.fn(),
      reload: vi.fn(),
    },
    anki: ready<AnkiStatus>({ running: false }),
    calendar: {
      month: TODAY.slice(0, 7),
      setMonth: vi.fn(),
      resource: ready({ month: TODAY.slice(0, 7), days: {} }),
      selected: TODAY,
      select: vi.fn(),
      writeNote: vi.fn(),
    } as unknown as ShellPanelsInput["calendar"],
    cycle: {
      today: ready(null),
      tomorrow: ready(null),
      month: ready({ month: TODAY.slice(0, 7), days: {} }),
      overview: ready(null),
      reload: vi.fn(),
    } as unknown as ShellPanelsInput["cycle"],
    subjects: ready<SubjectsOverview>({ date: TODAY, cycle: null, subjects: [] }),
    today: TODAY,
    skillsPanel: {
      skills: { status: "ready", value: [] as SkillInfo[] },
      onToggle: vi.fn(),
      onFetch: vi.fn(),
      fetchNotice: null,
      review: null,
      onReview: vi.fn(),
      onCloseReview: vi.fn(),
      onEnableReviewed: vi.fn(),
      onDiscardReviewed: vi.fn(),
    },
    todayPlan: [],
    tomorrowPlan: [],
    courseTitles: {},
    courseStyles: {},
    startedToday: {},
    resume: null,
    agentReady: true,
    focus: null,
    onFocusHandled: vi.fn(),
    onResume: vi.fn(),
    onCourseStyle: vi.fn(),
    onStudy: vi.fn(),
    onNewCourse: vi.fn(),
    onEditPlan: vi.fn(),
    onReadingAdd: vi.fn(async () => null),
    onReadingClip: vi.fn(),
    onDraftCards,
    onEditDay: vi.fn(),
    onStudyCourse: vi.fn(),
    onVerifyCourse: vi.fn(),
    onOpenControl: null,
    sessions: {
      open: false,
      onOpenChange: vi.fn(),
      status: "ready",
      groups: [],
      onPick: vi.fn(),
      onNew: vi.fn(),
    },
  };
}

describe("shellPanels: the 书房 section", () => {
  it("hands the panel a panel view once the list is loaded", () => {
    const panels = shellPanels(input(ready([EPP])));
    expect(panels.reading.shelf.status).toBe("ready");
    if (panels.reading.shelf.status !== "ready") throw new Error("expected a ready shelf");
    expect(panels.reading.shelf.value.planned?.slug).toBe("epp");
    expect(panels.reading.shelf.value.planned?.next).toBe(strings.reading.shelfToday("Ch1 · pp.10–18"));
  });

  it("passes loading and error through untouched", () => {
    const loading = shellPanels(input({ state: { status: "loading" }, reload: vi.fn(), mutate: vi.fn() }));
    expect(loading.reading.shelf).toEqual({ status: "loading" });

    const failed = shellPanels(
      input({
        state: { status: "error", code: "script-failed", message: "读取知识库失败。" },
        reload: vi.fn(),
        mutate: vi.fn(),
      }),
    );
    expect(failed.reading.shelf).toEqual({
      status: "error",
      code: "script-failed",
      message: "读取知识库失败。",
    });
  });

  it("sends one card-drafting prompt with the book's short, slug, and pending count", () => {
    const onDraftCards = vi.fn();
    const panels = shellPanels(input(ready([EPP]), onDraftCards));
    panels.reading.onShelfCards("epp");
    expect(onDraftCards).toHaveBeenCalledTimes(1);
    expect(onDraftCards).toHaveBeenCalledWith(withActionMarker(strings.reading.shelfCardsPrompt("Epp", "epp", 2), "cards"));
    expect(onDraftCards.mock.calls[0]?.[0]).toContain("《Epp》");
    expect(onDraftCards.mock.calls[0]?.[0]).toContain("（epp）");
    expect(onDraftCards.mock.calls[0]?.[0]).toContain("2 句待做卡");
  });

  it("sends nothing while the list is still loading", () => {
    const onDraftCards = vi.fn();
    const panels = shellPanels(
      input({ state: { status: "loading" }, reload: vi.fn(), mutate: vi.fn() }, onDraftCards),
    );
    panels.reading.onShelfCards("epp");
    expect(onDraftCards).not.toHaveBeenCalled();
  });

  it("sends nothing for a slug that is not on the shelf", () => {
    const onDraftCards = vi.fn();
    const panels = shellPanels(input(ready([EPP]), onDraftCards));
    panels.reading.onShelfCards("missing");
    expect(onDraftCards).not.toHaveBeenCalled();
  });

  it("keeps the cards panel's own default prompt when its button sends without one", () => {
    const onDraftCards = vi.fn();
    const panels = shellPanels(input(ready([EPP]), onDraftCards));
    // The cards panel's button is an `onClick`, so React passes a MouseEvent as
    // the first argument; core must drop it, or the event would become the prompt.
    const onClick = panels.cards.onDraft as unknown as (event: unknown) => void;
    onClick({ type: "click" });
    expect(onDraftCards).toHaveBeenCalledTimes(1);
    expect(onDraftCards).toHaveBeenCalledWith(withActionMarker(strings.cards.draftPrompt, "cards"));
  });
});
