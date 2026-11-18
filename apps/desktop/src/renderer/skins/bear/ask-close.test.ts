/**
 * 「交给总控 →」 also closes the dialog / drawer it sits in (P3, 11-17 验收).
 */

import { describe, expect, it, vi } from "vitest";
import type { SkillsPanelProps } from "../contract.js";
import { withAskClose } from "./ask-close.js";

type Skills = { check?: SkillsPanelProps["check"] };

function skillsWith(onAsk: (() => void) | undefined): Skills {
  return {
    check: {
      last: "上次 11-17 10:20",
      button: "重新检查",
      running: false,
      status: null,
      groups: [],
      hasProblems: true,
      onRun: vi.fn(),
      ...(onAsk === undefined ? {} : { onAsk }),
    },
  };
}

describe("withAskClose", () => {
  it("calls onAsk, then closes", () => {
    const onAsk = vi.fn();
    const close = vi.fn();
    const wrapped = withAskClose(skillsWith(onAsk), close).check?.onAsk;
    if (wrapped === undefined) throw new Error("onAsk was dropped");
    wrapped();
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(onAsk.mock.invocationCallOrder[0]).toBeLessThan(close.mock.invocationCallOrder[0] ?? 0);
  });

  it("returns the same object when there is no close", () => {
    const skills = skillsWith(vi.fn());
    expect(withAskClose(skills, undefined)).toBe(skills);
  });

  it("returns the same object when there is no check or no onAsk", () => {
    const noCheck: Skills = {};
    expect(withAskClose(noCheck, vi.fn())).toBe(noCheck);
    const noAsk = skillsWith(undefined);
    expect(withAskClose(noAsk, vi.fn())).toBe(noAsk);
  });
});
