// strings.planbook：计划本的文案（周格子行名、今天 Anki 格、总控标题后缀）。
import { describe, expect, it } from "vitest";
import { strings } from "./strings.js";

describe("strings.planbook.lanePrefix", () => {
  it("课后读 / 导读课 / 自读 带行名，主课不带", () => {
    expect(strings.planbook.lanePrefix("main")).toBe("");
    expect(strings.planbook.lanePrefix("after")).toBe("课后读 · ");
    expect(strings.planbook.lanePrefix("guide")).toBe("导读课 · ");
    expect(strings.planbook.lanePrefix("self")).toBe("自读 · ");
  });
});

describe("strings.planbook.ankiToday", () => {
  it("今天的 Anki 格只写张数，后面跟「打开 →」（面板 v2「42 张 · 打开 →」）", () => {
    expect(strings.planbook.ankiToday(42)).toBe("42 张 ·");
    expect(strings.planbook.ankiToday(0)).toBe("0 张 ·");
    expect(strings.planbook.ankiOpen).toBe("打开 →");
  });
});

describe("strings.planbook.titleSuffix", () => {
  it("计划本显示时接在总控标题后（「总控 · C1」→「总控 · C1 · 计划本」）", () => {
    expect(strings.control.title("C1") + strings.planbook.titleSuffix).toBe("总控 · C1 · 计划本");
  });
});
