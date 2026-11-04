import { describe, expect, it } from "vitest";
import { formatLogLine } from "./calendar-log.js";

describe("formatLogLine (B13)", () => {
  it("renders 「类型 · 内容」 from a raw `type | text` line", () => {
    expect(formatLogLine("reading | 某文章")).toBe("reading · 某文章");
    expect(formatLogLine("ingest | 反思")).toBe("ingest · 反思");
  });

  it("drops a leading `log` noise word", () => {
    expect(formatLogLine("log course | 收课")).toBe("course · 收课");
    expect(formatLogLine("LOG reading | X")).toBe("reading · X");
  });

  it("trims surrounding whitespace and normalizes the separator", () => {
    expect(formatLogLine("  course|X  ")).toBe("course · X");
  });

  it("returns a separator-less line unchanged (minus the log word)", () => {
    expect(formatLogLine("log 随便写点")).toBe("随便写点");
  });
});
