import { describe, expect, it } from "vitest";
import type { BoardResource } from "./use-resource.js";
import type { CoursesResource } from "./use-courses.js";
import { strings } from "../strings.js";
import { actionLabel, splitActionMarker } from "../chat/action-marker.js";
import { courseTitleOf, draftedCardsMessage, verifyMessage } from "./use-shell-panels.js";

function ready<T>(value: T): BoardResource<T> {
  return { state: { status: "ready", value }, reload: () => undefined, mutate: () => undefined } as unknown as BoardResource<T>;
}

function courses(value: unknown[]): CoursesResource {
  return ready(value) as unknown as CoursesResource;
}

describe("面板代发的课程指令", () => {
  it("周核实折叠成「周核实 · 课程名」", () => {
    const marked = splitActionMarker(verifyMessage("ctm", "CTM 第 7 章"));
    expect(marked.action).toBe("verify");
    expect(marked.courseTitle).toBe("CTM 第 7 章");
    expect(marked.body).toBe(strings.cycle.verifyPrompt("ctm"));
    expect(actionLabel("verify", marked.courseTitle)).toBe("周核实 · CTM 第 7 章");
  });

  it("课程名取不到时只显示动作名", () => {
    expect(splitActionMarker(verifyMessage("ctm", null)).courseTitle).toBeNull();
    expect(actionLabel("verify", null)).toBe(strings.actions.verify);
  });

  it("课程标题从已加载的课程列表里查，加载中或没有这个 slug 时为空", () => {
    const list = courses([{ slug: "ctm", title: "CTM 第 7 章" }]);
    expect(courseTitleOf(list, "ctm")).toBe("CTM 第 7 章");
    expect(courseTitleOf(list, "nope")).toBeNull();
    expect(courseTitleOf({ state: { status: "loading" }, reload: () => undefined, mutate: () => undefined } as unknown as CoursesResource, "ctm")).toBeNull();
  });

  it("起草卡片：面板传进来的自定义文字也套标记", () => {
    const marked = splitActionMarker(draftedCardsMessage("只出 5 张"));
    expect(marked.action).toBe("cards");
    expect(marked.body).toBe("只出 5 张");
    expect(splitActionMarker(draftedCardsMessage(undefined)).body).toBe(strings.cards.draftPrompt);
  });

  it("已经带标记的文字不再套第二层", () => {
    const once = draftedCardsMessage(undefined);
    expect(draftedCardsMessage(once)).toBe(once);
    expect(once.match(/⟦xuegen:/g)?.length).toBe(1);
  });
});
