import { describe, expect, it } from "vitest";
import type { CycleDay } from "@shared/data-protocol.js";
import type { SessionRow } from "./session-list.js";
import { fitTabs, neighbourTab, sessionTabs, type SessionTabsInput } from "./session-tabs.js";

const DIR = "/home/sessions/--ws--";
const F_EPP = `${DIR}/2026-11-13T11-51-00-000Z_b.jsonl`;
const F_CTM = `${DIR}/2026-11-13T11-52-00-000Z_c.jsonl`;
const F_OLD = `${DIR}/2026-11-12T03-00-00-000Z_d.jsonl`;
const F_CONTROL = `${DIR}/2026-11-13T01-00-00-000Z_a.jsonl`;

const row = (file: string, partial: Partial<SessionRow>): SessionRow => ({
  file,
  time: "19:51",
  kind: "course",
  slug: null,
  tag: "",
  title: "",
  count: 2,
  current: false,
  ...partial,
});

const day = (partial: Partial<CycleDay> = {}): CycleDay => ({
  date: "2026-11-13",
  weekday: "周五",
  cycle: "C1",
  week: 2,
  type: "深度",
  subject: null,
  course: null,
  aux: null,
  auxCourse: null,
  names: {},
  subjects: {},
  roles: {},
  lessons: [{ course: "ctm", id: "D1", content: "Ch1" }],
  overdue: [],
  ...partial,
});

const input = (partial: Partial<SessionTabsInput> = {}): SessionTabsInput => ({
  cycleId: "C1",
  isControl: true,
  currentFile: F_CONTROL,
  today: "2026-11-13",
  // Inserted in the reverse of their opening order: the file name decides.
  courseSessions: { ctm: F_CTM, epp: F_EPP, sedgewick: F_OLD },
  courseStartedOn: { ctm: "2026-11-13", epp: "2026-11-13", sedgewick: "2026-11-12" },
  rows: [row(F_EPP, { slug: "epp", tag: "离散", title: "D4 §2.1 命题逻辑" })],
  names: { epp: "离散", ctm: "CTM" },
  day: day(),
  currentTitle: null,
  streaming: false,
  ...partial,
});

describe("sessionTabs", () => {
  it("总控 first, then today's course sessions in opening order; earlier days' courses stay out", () => {
    const tabs = sessionTabs(input());
    expect(tabs.map((tab) => tab.label)).toEqual(["总控 · C1", "离散 D4", "CTM D1"]);
    expect(tabs.map((tab) => tab.active)).toEqual([true, false, false]);
  });

  it("takes the lesson id from the pin, else from today's open lesson of that course", () => {
    const tabs = sessionTabs(input({ rows: [] }));
    expect(tabs[1]?.label).toBe("离散");
    expect(tabs[2]?.label).toBe("CTM D1");
  });

  it("names a 周核实 session by its action, not by a guessed lesson; a plain opening keeps the lesson id", () => {
    const tabs = sessionTabs(
      input({
        rows: [
          row(F_EPP, { slug: "epp", tag: "离散", title: "开今天的课" }),
          row(F_CTM, { slug: "ctm", tag: "CTM", title: "周核实" }),
        ],
        day: day({
          lessons: [
            { course: "epp", id: "D4", content: "§2.1" },
            { course: "ctm", id: "D1", content: "Ch1" },
          ],
        }),
      }),
    );
    expect(tabs[1]?.label).toBe("离散 D4");
    expect(tabs[2]?.label).toBe("CTM 周核实");
    expect(sessionTabs(input({ rows: [], day: day({ lessons: [] }) }))[1]?.label).toBe("离散");
  });

  it("marks the open course tab active and, while answering, busy; no other tab is busy", () => {
    const tabs = sessionTabs(input({ isControl: false, currentFile: F_EPP, streaming: true }));
    expect(tabs.map((tab) => [tab.label, tab.active, tab.busy])).toEqual([
      ["总控 · C1", false, false],
      ["离散 D4", true, true],
      ["CTM D1", false, false],
    ]);
  });

  it("gives a transcript opened from ＋ a tab of its own while it is open", () => {
    const tabs = sessionTabs(
      input({
        isControl: false,
        currentFile: F_OLD,
        rows: [row(F_OLD, { slug: "sedgewick", tag: "算法", title: "D3 Ch2 §2.3：有效论证" })],
      }),
    );
    expect(tabs.at(-1)).toMatchObject({ kind: "other", label: "算法 D3", active: true, file: F_OLD });
    expect(sessionTabs(input()).some((tab) => tab.kind === "other")).toBe(false);
  });

  it("only 总控 and nothing else on a day with no lesson opened yet", () => {
    expect(sessionTabs(input({ courseStartedOn: {} })).map((tab) => tab.label)).toEqual(["总控 · C1"]);
  });

  it("no tabs outside every cycle", () => {
    expect(sessionTabs(input({ cycleId: null }))).toEqual([]);
  });
});

describe("neighbourTab", () => {
  it("steps forward and back, wrapping around", () => {
    const tabs = sessionTabs(input());
    expect(neighbourTab(tabs, 1)?.label).toBe("离散 D4");
    expect(neighbourTab(tabs, -1)?.label).toBe("CTM D1");
    expect(neighbourTab(tabs.slice(0, 1), 1)).toBeNull();
  });
});

describe("fitTabs", () => {
  const tabs = ["control", "a", "b", "c", "d"].map((key) => ({ key, active: key === "d" }));
  const widths = [80, 60, 60, 60, 60];

  it("hides nothing when every tab and 「＋」 fit", () => {
    expect(fitTabs(tabs, widths, 400, 20)).toEqual([]);
  });

  it("folds the tabs that do not fit, keeping 总控 and the open one", () => {
    // 80 总控 + 60 open + 20 ＋ leaves 60 of 220: room for 「a」 only.
    expect(fitTabs(tabs, widths, 220, 20)).toEqual(["b", "c"]);
  });

  it("keeps 总控 and the open tab even when nothing else fits", () => {
    expect(fitTabs(tabs, widths, 50, 20)).toEqual(["a", "b", "c"]);
  });
});
