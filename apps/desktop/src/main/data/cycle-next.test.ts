// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cycleAcceptOf, cyclePreviewOf } from "./cycle-next.js";

describe("cycleAcceptOf", () => {
  it("passes through a well-formed accept payload", () => {
    expect(
      cycleAcceptOf({
        cycle: "C1",
        start: "2026-11-06",
        end: "2026-12-24",
        courses: [
          {
            slug: "epp",
            title: "离散数学（Epp）",
            subject: "discrete-math",
            goals: [
              { level: "最低", text: "不查书写出真值表", done: false },
              { level: "", text: "没有级别", done: true },
            ],
            lessons: { done: 3, total: 15, remaining: ["D4", "D5"] },
          },
        ],
        next: { cycle: "C2", start: "2026-12-25", end: "2027-02-11", mains: ["algo"], status: "未开始" },
      }),
    ).toEqual({
      cycle: "C1",
      start: "2026-11-06",
      end: "2026-12-24",
      courses: [
        {
          slug: "epp",
          title: "离散数学（Epp）",
          subject: "discrete-math",
          goals: [
            { level: "最低", text: "不查书写出真值表", done: false },
            { level: "", text: "没有级别", done: true },
          ],
          lessons: { done: 3, total: 15, remaining: ["D4", "D5"] },
        },
      ],
      next: { cycle: "C2", start: "2026-12-25", end: "2027-02-11", mains: ["algo"], status: "未开始" },
    });
  });

  it("degrades a malformed payload to a safe shape", () => {
    expect(cycleAcceptOf(null)).toEqual({ cycle: "", start: "", end: "", courses: [], next: null });
    expect(
      cycleAcceptOf({
        cycle: "C1",
        start: "2026-11-06",
        end: "2026-12-24",
        courses: "oops",
        next: "oops",
      }),
    ).toEqual({ cycle: "C1", start: "2026-11-06", end: "2026-12-24", courses: [], next: null });
  });

  it("coerces malformed course fields instead of leaking unknown", () => {
    const result = cycleAcceptOf({
      cycle: "C1",
      start: "2026-11-06",
      end: "2026-12-24",
      courses: [
        {
          slug: "epp",
          title: 42,
          subject: null,
          goals: [{ level: "最低", text: "ok", done: 1 }, "junk", { level: 2, text: 3 }],
          lessons: { done: "3", total: 15, remaining: ["D4", 9] },
        },
      ],
      next: null,
    });
    expect(result.courses[0]).toEqual({
      slug: "epp",
      title: "",
      subject: "",
      goals: [
        { level: "最低", text: "ok", done: false },
        { level: "", text: "", done: false },
      ],
      lessons: { done: 0, total: 15, remaining: ["D4"] },
    });
  });
});

describe("cyclePreviewOf", () => {
  it("passes through a well-formed preview week", () => {
    expect(
      cyclePreviewOf({
        days: [
          { date: "2026-12-25", weekday: "周五", type: "整合", subject: null, name: null, aux: null, auxName: null },
          {
            date: "2026-12-28",
            weekday: "周一",
            type: "深度",
            subject: "algo",
            name: "算法",
            aux: "c-lang",
            auxName: "C",
          },
          {
            date: "2026-12-29",
            weekday: "周二",
            type: "深度",
            subject: "old",
            name: "旧科目",
            aux: null,
            auxName: null,
            unchanged: true,
          },
        ],
      }),
    ).toEqual({
      days: [
        { date: "2026-12-25", weekday: "周五", type: "整合", subject: null, name: null, aux: null, auxName: null },
        {
          date: "2026-12-28",
          weekday: "周一",
          type: "深度",
          subject: "algo",
          name: "算法",
          aux: "c-lang",
          auxName: "C",
        },
        {
          date: "2026-12-29",
          weekday: "周二",
          type: "深度",
          subject: "old",
          name: "旧科目",
          aux: null,
          auxName: null,
          unchanged: true,
        },
      ],
    });
  });

  it("degrades malformed payloads", () => {
    expect(cyclePreviewOf(null)).toEqual({ days: [] });
    expect(cyclePreviewOf({ days: "oops" })).toEqual({ days: [] });
    const result = cyclePreviewOf({ days: [{ date: 1, weekday: 2, type: "huh", subject: 3 }] });
    expect(result.days[0]).toEqual({
      date: "",
      weekday: "",
      type: "整合",
      subject: null,
      name: null,
      aux: null,
      auxName: null,
    });
  });
});
