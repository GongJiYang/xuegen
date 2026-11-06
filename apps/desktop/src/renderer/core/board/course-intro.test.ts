import { describe, expect, it } from "vitest";
import type { CourseSummary } from "@shared/data-protocol.js";
import { courseIntro, courseIntroLines } from "./course-intro.js";

function course(partial: Partial<CourseSummary> = {}): CourseSummary {
  return {
    slug: "ctm",
    title: "CTM 7 周",
    weekLabel: "W3",
    week: { done: 0, total: 0, tasks: [] },
    overall: { done: 0, total: 0 },
    lastRecord: null,
    nextSession: null,
    styleHint: null,
    ...partial,
  };
}

describe("courseIntro", () => {
  it("uses the record date, the last done task, and the next session", () => {
    const intro = courseIntro(
      course({
        lastRecord: { date: "2026-11-03", seq: "01" },
        week: {
          done: 2,
          total: 4,
          tasks: [
            { label: "读 1.1", done: true },
            { label: "读 1.2", done: false },
            { label: "做练习", done: true },
          ],
        },
        nextSession: "2.1 合一",
      }),
    );
    expect(intro).toEqual({
      title: "CTM 7 周",
      lastDate: "2026-11-03",
      lastDone: "做练习",
      next: "2.1 合一",
      week: { done: 2, total: 4 },
    });
  });

  it("has no last date or done task before the first record", () => {
    const intro = courseIntro(
      course({
        week: { done: 0, total: 2, tasks: [{ label: "读 1.1", done: false }] },
      }),
    );
    expect(intro.lastDate).toBeNull();
    expect(intro.lastDone).toBeNull();
  });

  it("keeps the date when there are no done tasks", () => {
    const intro = courseIntro(course({ lastRecord: { date: "2026-11-01", seq: "02" } }));
    expect(intro.lastDate).toBe("2026-11-01");
    expect(intro.lastDone).toBeNull();
  });

  it("keeps a null next session", () => {
    expect(courseIntro(course()).next).toBeNull();
  });
});

describe("courseIntroLines", () => {
  it("combines the last task and date, and uses the next session", () => {
    const lines = courseIntroLines({
      title: "CTM",
      lastDate: "2026-11-03",
      lastDone: "做练习",
      next: "2.1",
      week: { done: 2, total: 4 },
    });
    expect(lines).toEqual({
      last: "上次学到这里：做练习（2026-11-03）",
      next: "这次从这里开始：2.1",
      week: "本周 2/4",
    });
  });

  it("falls back to the date, then to the first-lesson copy", () => {
    const dateOnly = courseIntroLines({
      title: "CTM",
      lastDate: "2026-11-03",
      lastDone: null,
      next: null,
      week: { done: 0, total: 0 },
    });
    expect(dateOnly.last).toBe("上次学习：2026-11-03");
    expect(dateOnly.next).toBe("这次从这里开始：由学根根据课程文件决定");

    const first = courseIntroLines({
      title: "CTM",
      lastDate: null,
      lastDone: null,
      next: null,
      week: { done: 0, total: 0 },
    });
    expect(first.last).toBe("第一次学这门课");
  });
});
