import { describe, expect, it } from "vitest";
import { dueLabel, isDueNow } from "./reading-due.js";

describe("dueLabel", () => {
  it("labels today, overdue, and future dates", () => {
    expect(dueLabel("2026-11-04", "2026-11-04")).toBe("今天");
    expect(dueLabel("2026-11-01", "2026-11-04")).toBe("逾期 3 天");
    expect(dueLabel("2026-11-05", "2026-11-04")).toBe("11-05 周四");
    expect(dueLabel("2026-11-14", "2026-11-04")).toBe("11-14 周六");
    expect(dueLabel("2026-12-01", "2026-11-04")).toBe("12-01 周二");
  });

  it("treats a missing or malformed due as 未排期", () => {
    expect(dueLabel("", "2026-11-04")).toBe("未排期");
    expect(dueLabel("soon", "2026-11-04")).toBe("未排期");
  });
});

describe("isDueNow", () => {
  it("is true for today and the past, false for the future and unset", () => {
    expect(isDueNow("2026-11-04", "2026-11-04")).toBe(true);
    expect(isDueNow("2026-11-01", "2026-11-04")).toBe(true);
    expect(isDueNow("2026-11-05", "2026-11-04")).toBe(false);
    expect(isDueNow("", "2026-11-04")).toBe(false);
  });
});
