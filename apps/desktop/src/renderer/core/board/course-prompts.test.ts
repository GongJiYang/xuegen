import { describe, expect, it } from "vitest";
import { editPlanPrompt, newCoursePrompt } from "./course-prompts.js";

describe("course prompts", () => {
  it("asks the course skill to create the course with every field the form collected", () => {
    const text = newCoursePrompt({
      title: " CSAPP 第 7 章 ",
      material: "raw/books/csapp.pdf",
      minutesPerDay: 60,
      startDate: "2026-11-10",
      style: "plain",
    });
    expect(text.startsWith("/skill:course 新建课程「CSAPP 第 7 章」。")).toBe(true);
    expect(text).toContain("资料：raw/books/csapp.pdf。");
    expect(text).toContain("每天学 60 分钟，从 2026-11-10 开始");
    expect(text).toContain("「大白话」");
  });

  it("asks for material when none was given", () => {
    const text = newCoursePrompt({ title: "x", material: " ", minutesPerDay: 30, startDate: "2026-11-05", style: "deep" });
    expect(text).toContain("先问我要用什么资料");
    expect(text).toContain("「深度」");
  });

  it("asks the course skill to change one course's plan", () => {
    expect(editPlanPrompt("CTM 7 周学习计划", " 每天改成 40 分钟，往后推一周 ")).toBe(
      "/skill:course 修改「CTM 7 周学习计划」的学习计划：每天改成 40 分钟，往后推一周。改完后告诉我新的本周安排，并刷新课程看板。",
    );
  });
});
