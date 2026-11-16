/**
 * 「技能与设置」的「学根」一行：版本号总是显示，结果行只在这次弹框里点过
 * 「检查更新」之后才有（logic-ui-1116.html A ②）。
 */

import { describe, expect, it } from "vitest";
import type { UpdateStatus } from "@shared/update.js";
import { strings } from "../strings.js";
import { aboutView } from "./about.js";

const CURRENT = "0.15.0";

describe("aboutView", () => {
  it("takes the version from the status", () => {
    expect(aboutView({ kind: "idle", current: CURRENT }, false)).toEqual({
      version: CURRENT,
      line: null,
      checking: false,
    });
    expect(aboutView({ kind: "latest", current: "0.16.0" }, true).version).toBe("0.16.0");
  });

  it("has no result line before 「检查更新」 is clicked", () => {
    const cases: UpdateStatus[] = [
      { kind: "idle", current: CURRENT },
      { kind: "checking", current: CURRENT },
      { kind: "latest", current: CURRENT },
      { kind: "unsupported", current: CURRENT },
      { kind: "available", current: CURRENT, version: "0.16.0", notes: [] },
      { kind: "downloading", current: CURRENT, version: "0.16.0", percent: 40 },
      { kind: "ready", current: CURRENT, version: "0.16.0" },
      { kind: "error", current: CURRENT, message: "网络不通" },
    ];
    for (const status of cases) expect(aboutView(status, false).line).toBeNull();
  });

  it("writes the line for every kind once asked", () => {
    expect(aboutView({ kind: "idle", current: CURRENT }, true).line).toBeNull();
    expect(aboutView({ kind: "checking", current: CURRENT }, true).line).toBe(strings.update.checking);
    expect(aboutView({ kind: "latest", current: CURRENT }, true).line).toBe(
      strings.update.latest(CURRENT),
    );
    expect(aboutView({ kind: "unsupported", current: CURRENT }, true).line).toBe(
      strings.update.unsupported,
    );
    expect(
      aboutView({ kind: "available", current: CURRENT, version: "0.16.0", notes: [] }, true).line,
    ).toBe(strings.about.available("0.16.0"));
    expect(
      aboutView({ kind: "downloading", current: CURRENT, version: "0.16.0", percent: 40 }, true).line,
    ).toBe(strings.update.downloading("0.16.0"));
    expect(aboutView({ kind: "ready", current: CURRENT, version: "0.16.0" }, true).line).toBe(
      strings.update.ready("0.16.0"),
    );
    expect(aboutView({ kind: "error", current: CURRENT, message: "网络不通" }, true).line).toBe(
      "网络不通",
    );
  });

  it("disables the button only while checking", () => {
    expect(aboutView({ kind: "checking", current: CURRENT }, true).checking).toBe(true);
    expect(aboutView({ kind: "latest", current: CURRENT }, true).checking).toBe(false);
    expect(aboutView({ kind: "available", current: CURRENT, version: "0.16.0", notes: [] }, true).checking).toBe(
      false,
    );
  });
});
