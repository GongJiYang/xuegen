import { describe, expect, it } from "vitest";
import type { CalendarDay, CourseSummary } from "@shared/data-protocol.js";
import { resumePoint, resumePrompt, studyPrompt, todayPlanItems } from "./today.js";

function course(partial: Partial<CourseSummary> & { slug: string; title: string }): CourseSummary {
  return {
    weekLabel: null,
    week: { done: 0, total: 0, tasks: [] },
    overall: { done: 0, total: 0 },
    lastRecord: null,
    nextSession: null,
    styleHint: null,
    ...partial,
  };
}

describe("resumePoint", () => {
  it("returns null when no course has a record", () => {
    expect(resumePoint([course({ slug: "a", title: "A" })])).toBeNull();
  });

  it("picks the course with the newest record", () => {
    const older = course({
      slug: "old",
      title: "Old",
      lastRecord: { date: "2026-10-16", seq: "01" },
      nextSession: "1.3",
    });
    const newer = course({
      slug: "new",
      title: "New",
      lastRecord: { date: "2026-11-03", seq: "02" },
      nextSession: "Erlang",
    });
    const resume = resumePoint([older, newer]);
    expect(resume?.course.slug).toBe("new");
    expect(resume?.nextSession).toBe("Erlang");
  });

  it("breaks a same-date tie toward a course with a next session", () => {
    const without = course({ slug: "a", title: "A", lastRecord: { date: "2026-11-03", seq: "01" } });
    const withNext = course({
      slug: "b",
      title: "B",
      lastRecord: { date: "2026-11-03", seq: "01" },
      nextSession: "下一步",
    });
    expect(resumePoint([without, withNext])?.course.slug).toBe("b");
  });
});

describe("prompts", () => {
  it("builds the resume prompt with and without a next session", () => {
    const withNext = resumePoint([
      course({ slug: "a", title: "CTM", lastRecord: { date: "2026-11-03", seq: "01" }, nextSession: "1.3" }),
    ]);
    expect(withNext && resumePrompt(withNext)).toBe("继续 CTM，从下次起点开始：1.3");

    const noNext = resumePoint([
      course({ slug: "a", title: "CTM", lastRecord: { date: "2026-11-03", seq: "01" } }),
    ]);
    expect(noNext && resumePrompt(noNext)).toBe("继续 CTM，从下次起点开始");
  });

  it("builds the study prompt", () => {
    expect(studyPrompt(course({ slug: "a", title: "CTM", nextSession: "1.3" }))).toBe(
      "开始今天的 CTM，下次起点：1.3",
    );
    expect(studyPrompt(course({ slug: "a", title: "CTM" }))).toBe("开始今天的 CTM");
  });
});

describe("todayPlanItems", () => {
  const day: CalendarDay = {
    records: [{ course: "ctm", heading: "2026-11-03-01" }],
    plans: [{ course: "ctm", label: "W1 计划" }],
    readingDue: [{ slug: "x", title: "一篇文章" }],
    log: [],
    note: null,
  };

  it("combines records, plans, and reading due with course titles", () => {
    const items = todayPlanItems(day, { ctm: "CTM 7 周" });
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ kind: "record", label: "CTM 7 周", detail: "2026-11-03-01" });
    expect(items[1]).toEqual({ kind: "plan", label: "CTM 7 周", detail: "W1 计划" });
    expect(items[2]).toEqual({ kind: "reading", label: "一篇文章", detail: "一篇文章" });
  });

  it("falls back to the slug when the course title is unknown", () => {
    expect(todayPlanItems(day, {})[0]?.label).toBe("ctm");
  });

  it("returns an empty list for a missing day", () => {
    expect(todayPlanItems(undefined, {})).toEqual([]);
  });
});
