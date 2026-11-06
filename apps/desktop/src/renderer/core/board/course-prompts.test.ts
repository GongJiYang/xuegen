import { describe, expect, it } from "vitest";
import { defaultEndDate, editPlanPrompt, newCoursePrompt } from "./course-prompts.js";

describe("course prompts", () => {
  it("asks the course skill to create the course with every field the form collected", () => {
    const text = newCoursePrompt({
      title: " CSAPP 第 7 章 ",
      material: "raw/books/csapp.pdf",
      reading: "read-first",
      startDate: "2026-11-10",
      endDate: "2026-12-08",
      rest: "sat,sun",
      style: "plain",
    });
    expect(text.startsWith("/skill:course 新建课程「CSAPP 第 7 章」。")).toBe(true);
    expect(text).toContain("资料：raw/books/csapp.pdf。");
    expect(text).toContain("从 2026-11-10 开始");
    expect(text).toContain("原书「先读后讲」");
    expect(text).toContain("每节时长由你按资料难度和篇幅估");
    expect(text).not.toContain("每天学");
    expect(text).toContain("「大白话」");
    expect(text).toContain("2026-12-08 前学完，周六日休息");
    expect(text).toContain("course-schedule.mjs");
    expect(text).toContain("--start 2026-11-10 --end 2026-12-08 --rest sat,sun");
  });

  it("defaults the deadline to four weeks after the start, across month ends", () => {
    expect(defaultEndDate("2026-11-10")).toBe("2026-12-08");
    expect(defaultEndDate("2026-12-20")).toBe("2027-01-17");
    expect(defaultEndDate("bad")).toBe("bad");
  });

  it("asks for material when none was given", () => {
    const text = newCoursePrompt({ title: "x", material: " ", reading: "guided", startDate: "2026-11-05", endDate: "2026-12-03", rest: "none", style: "deep" });
    expect(text).toContain("先问我要用什么资料");
    expect(text).toContain("原书「带读」");
    expect(text).toContain("「深度」");
  });

  it("asks the course skill to change one course's plan", () => {
    expect(editPlanPrompt("CTM 7 周学习计划", " 每天改成 40 分钟，往后推一周 ")).toBe(
      "/skill:course 修改「CTM 7 周学习计划」的学习计划：每天改成 40 分钟，往后推一周。改完后告诉我新的本周安排，并刷新课程看板。",
    );
  });
});
