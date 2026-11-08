import { describe, expect, it } from "vitest";
import { strings } from "../strings.js";
import { actionLabel, legacyCommandLabel, splitActionMarker, withActionMarker } from "./action-marker.js";
import { splitStyleTag } from "./style-prefix.js";

describe("withActionMarker / splitActionMarker", () => {
  it("round-trips a marker without a course", () => {
    const text = withActionMarker("今天学到这里", "close");
    expect(text).toBe("今天学到这里\n⟦xuegen:close⟧");
    expect(splitActionMarker(text)).toEqual({ action: "close", slug: null, courseTitle: null, body: "今天学到这里" });
  });

  it("round-trips a marker with a course", () => {
    const text = withActionMarker("开始今天的课", "open", { slug: "epp", title: "离散数学（Epp, 5th ed）" });
    expect(text).toBe("开始今天的课\n⟦xuegen:open|epp|离散数学（Epp, 5th ed）⟧");
    expect(splitActionMarker(text)).toEqual({
      action: "open",
      slug: "epp",
      courseTitle: "离散数学（Epp, 5th ed）",
      body: "开始今天的课",
    });
  });

  it("returns the text unchanged when there is no marker", () => {
    expect(splitActionMarker("普通的一条消息")).toEqual({ action: null, slug: null, courseTitle: null, body: "普通的一条消息" });
  });

  it("returns the text unchanged for an unknown action", () => {
    const text = "消息\n⟦xuegen:teleport|a|b⟧";
    expect(splitActionMarker(text).action).toBeNull();
    expect(splitActionMarker(text).body).toBe(text);
  });

  it("does not match a marker that is not at the end", () => {
    const text = "⟦xuegen:close⟧\n后面的正文";
    expect(splitActionMarker(text).action).toBeNull();
    expect(splitActionMarker(text).body).toBe(text);
  });

  it("still splits after splitStyleTag on a /skill message with a style tag", () => {
    const text = withActionMarker("/skill:course [风格：细讲] 开始今天的课", "open", { slug: "epp", title: "离散" });
    const { body, styleTag } = splitStyleTag(text);
    expect(styleTag).toBe("细讲");
    const marked = splitActionMarker(body);
    expect(marked).toEqual({ action: "open", slug: "epp", courseTitle: "离散", body: "/skill:course 开始今天的课" });
  });

  it("replaces pipe characters in the course title", () => {
    const text = withActionMarker("开课", "open", { slug: "epp", title: "A | B" });
    expect(text).toBe("开课\n⟦xuegen:open|epp|A   B⟧");
    expect(splitActionMarker(text).courseTitle).toBe("A   B");
  });
});

describe("actionLabel", () => {
  it("names the action alone or with the course title", () => {
    expect(actionLabel("summary", null)).toBe(strings.actions.summary);
    expect(actionLabel("open", "离散数学（Epp, 5th ed）")).toBe("开今天的课 · 离散数学（Epp, 5th ed）");
  });
});

describe("legacyCommandLabel", () => {
  it("folds a pre-marker /skill command into a one-line label", () => {
    expect(legacyCommandLabel("/skill:course 新建课程…")).toBe("旧指令 · course");
  });

  it("returns null for ordinary text", () => {
    expect(legacyCommandLabel("今天讲了什么？")).toBeNull();
    expect(legacyCommandLabel("不是指令 /skill:course")).toBeNull();
  });

  it("names a bare /skill: prefix just 旧指令", () => {
    expect(legacyCommandLabel("/skill:")).toBe("旧指令");
    expect(legacyCommandLabel("/skill: 帮我做点什么")).toBe("旧指令");
  });
});
