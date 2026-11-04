import { describe, expect, it } from "vitest";
import type { CourseSummary } from "@shared/data-protocol.js";
import { findNewCourseSlug } from "./course-claim.js";

function course(slug: string): CourseSummary {
  return {
    slug,
    title: slug,
    weekLabel: null,
    week: { done: 0, total: 0, tasks: [] },
    overall: { done: 0, total: 0 },
    lastRecord: null,
    nextSession: null,
    styleHint: null,
  };
}

describe("findNewCourseSlug", () => {
  it("returns null when no course was added", () => {
    expect(findNewCourseSlug(["ctm"], [course("ctm")])).toBeNull();
  });

  it("returns the slug that was not in the before list", () => {
    expect(findNewCourseSlug(["ctm"], [course("ctm"), course("csapp")])).toBe("csapp");
  });

  it("takes the first new slug when several appeared", () => {
    expect(findNewCourseSlug([], [course("a"), course("b")])).toBe("a");
  });

  it("treats every slug as new when the before list is empty", () => {
    expect(findNewCourseSlug([], [course("a")])).toBe("a");
  });
});
