import { describe, expect, it } from "vitest";
import { isDataRequest } from "./data-protocol.js";

describe("isDataRequest", () => {
  it("accepts every valid request shape", () => {
    const valid = [
      { kind: "courses.list" },
      { kind: "reading.stats" },
      { kind: "reading.sources" },
      { kind: "reading.queue" },
      { kind: "cards.stats" },
      { kind: "anki.status" },
      { kind: "skills.list" },
      { kind: "reading.today", limit: 3 },
      { kind: "reading.add", source: "raw/a.md", priority: "high" },
      { kind: "reading.review", slug: "a", outcome: "next", position: "第 3 节" },
      { kind: "reading.review", slug: "a", outcome: "postpone" },
      { kind: "cards.add", deck: "Math", front: "F", back: "B" },
      { kind: "calendar.month", month: "2026-10" },
      { kind: "calendar.write", date: "2026-10-22", text: "内容" },
      { kind: "cycle.day", date: "2026-11-06" },
      { kind: "cycle.month", month: "2026-11" },
      { kind: "cycle.overview", date: "2026-11-06" },
      { kind: "subjects.list", date: "2026-11-06" },
      { kind: "skills.setEnabled", name: "reading", enabled: false },
      { kind: "skills.fetch", url: "https://example.com/skill.git" },
    ];
    for (const request of valid) {
      expect(isDataRequest(request)).toBe(true);
    }
  });

  it("rejects malformed and unknown requests", () => {
    const invalid: unknown[] = [
      null,
      undefined,
      42,
      "courses.list",
      {},
      { kind: "unknown" },
      { kind: "reading.today" },
      { kind: "reading.today", limit: -1 },
      { kind: "reading.today", limit: 1.5 },
      { kind: "reading.add", source: "raw/a.md", priority: "urgent" },
      { kind: "reading.add", source: 7, priority: "high" },
      { kind: "reading.review", slug: "a", outcome: "later", position: "" },
      { kind: "reading.review", slug: "a", outcome: "next", position: 3 },
      { kind: "cards.add", deck: "Math", front: "F" },
      { kind: "calendar.month", month: "2026-2" },
      { kind: "calendar.write", date: "2026-13-40", text: "x" },
      { kind: "cycle.day", date: "11-06" },
      { kind: "cycle.day" },
      { kind: "cycle.overview", date: "2026-11" },
      { kind: "cycle.month", month: "2026-13" },
      { kind: "subjects.list" },
      { kind: "subjects.list", date: "2026/11/06" },
      { kind: "skills.setEnabled", name: "reading", enabled: "yes" },
      { kind: "skills.fetch", url: 9 },
    ];
    for (const request of invalid) {
      expect(isDataRequest(request)).toBe(false);
    }
  });
});
