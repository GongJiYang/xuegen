import { describe, expect, it } from "vitest";
import { strings } from "./strings.js";

describe("strings.progress.placementLine", () => {
  it("says nothing about a deadline for 带读 (aux) — it never finishes", () => {
    expect(strings.progress.placementLine(["周一", "周三"], "aux", "2026-12-24", "C1")).toBe(
      "周一 · 周三\u3000每节 ≤ 45 分钟\u3000不设完结",
    );
  });

  it("still shows the cycle deadline for the 主项 (main)", () => {
    expect(strings.progress.placementLine(["周二", "周四"], "main", "2026-12-24", "C1")).toBe(
      "周二 · 周四\u3000排到 12-24（C1 结束）",
    );
  });
});

describe("strings.plan.courseEnd", () => {
  it("says 「预计 … 学完」 for 带读 (aux), which never 结课", () => {
    expect(strings.plan.courseEnd("12-28", "aux")).toBe("预计 12-28 学完");
  });

  it("still says 「结课」 for the 主项, whether the role is given or not", () => {
    expect(strings.plan.courseEnd("12-23", "main")).toBe("结课 12-23");
    expect(strings.plan.courseEnd("12-23")).toBe("结课 12-23");
  });
});
