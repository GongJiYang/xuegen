import { describe, expect, it } from "vitest";
import { shortModelName } from "./model-short-name.js";

describe("shortModelName", () => {
  it("prefers a known family word from the name or id (B4)", () => {
    expect(shortModelName("DeepSeek V4 Flash", "deepseek-v4-flash")).toBe("Flash");
    expect(shortModelName("DeepSeek V4 Pro", "deepseek-v4-pro")).toBe("Pro");
    expect(shortModelName("Mini", "some-mini")).toBe("Mini");
  });

  it("is case-insensitive and keeps the canonical spelling", () => {
    expect(shortModelName("FLASH", "x")).toBe("Flash");
  });

  it("falls back to the last id segment when no family word matches", () => {
    expect(shortModelName("Mystery", "vendor/some-model")).toBe("some-model");
    expect(shortModelName("Mystery", "vendor-a-xyz")).toBe("vendor-a-xyz");
  });

  it("falls back to the id itself for a single token", () => {
    expect(shortModelName("Unknown", "qwen")).toBe("qwen");
  });
});
