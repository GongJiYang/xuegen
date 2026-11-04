import { describe, expect, it } from "vitest";
import { splitStyleTag, withStylePrefix } from "./style-prefix.js";

describe("withStylePrefix", () => {
  it("tags an ordinary message", () => {
    expect(withStylePrefix("plain", "你好")).toBe("[风格：大白话] 你好");
  });

  it("keeps /skill: first so Pi can expand it, and tags the request instead", () => {
    expect(withStylePrefix("deep", "/skill:diagram 画个流程图")).toBe("/skill:diagram [风格：深度] 画个流程图");
    expect(withStylePrefix("plain", "/skill:diagram")).toBe("/skill:diagram [风格：大白话]");
  });

  it("never tags other slash text or an already-tagged message", () => {
    expect(withStylePrefix("plain", "/新会话")).toBe("/新会话");
    expect(withStylePrefix("plain", "[风格：细讲] 已有标签")).toBe("[风格：细讲] 已有标签");
    expect(withStylePrefix("plain", "/skill:diagram [风格：细讲] x")).toBe("/skill:diagram [风格：细讲] x");
  });
});

describe("splitStyleTag", () => {
  it("splits a leading tag off an ordinary message", () => {
    expect(splitStyleTag("[风格：深度] 为什么？")).toEqual({ styleTag: "深度", body: "为什么？" });
    expect(splitStyleTag("没有标签")).toEqual({ styleTag: null, body: "没有标签" });
  });

  it("folds an expanded skill back into /skill:<name> and keeps the style tag", () => {
    const echoed =
      '<skill name="diagram" location="/x/SKILL.md">\nReferences are relative to /x.\n\n# 用字符画图\n很长的正文\n</skill>\n\n[风格：深度] 画个流程图';
    expect(splitStyleTag(echoed)).toEqual({ styleTag: "深度", body: "/skill:diagram 画个流程图" });
  });

  it("shows a bare skill invocation as just the command", () => {
    expect(splitStyleTag('<skill name="teach" location="/t">\nbody\n</skill>')).toEqual({
      styleTag: null,
      body: "/skill:teach",
    });
  });

  it("moves the tag off a live /skill: echo (tag after the command)", () => {
    expect(splitStyleTag("/skill:diagram [风格：大白话] 画个流程")).toEqual({
      styleTag: "大白话",
      body: "/skill:diagram 画个流程",
    });
    expect(splitStyleTag("/skill:diagram [风格：大白话]")).toEqual({
      styleTag: "大白话",
      body: "/skill:diagram",
    });
  });
});
