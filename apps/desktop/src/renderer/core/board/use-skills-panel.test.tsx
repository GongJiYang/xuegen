/**
 * 技能 panel 的组合 hook：`about` 的「检查更新」从 `update.check` 取结果，
 * 也让顶部更新条的订阅保持独立（logic-ui-1116.html A ②）。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import * as client from "../client.js";
import { useSkillsPanel } from "./use-skills-panel.js";
import type { SkillsResource } from "./use-skills.js";

function skillsResource(): SkillsResource {
  return {
    resource: { state: { status: "ready", value: [] } },
    setEnabled: vi.fn(async () => ({ ok: false as const, code: "unknown" as const, error: "x" })),
    fetch: vi.fn(async () => ({ ok: false as const, code: "unknown" as const, error: "x" })),
    review: vi.fn(async () => ({ ok: false as const, code: "unknown" as const, error: "x" })),
    discard: vi.fn(async () => ({ ok: false as const, code: "unknown" as const, error: "x" })),
  } as unknown as SkillsResource;
}

describe("useSkillsPanel · about", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes the 检查更新 action", () => {
    vi.spyOn(client, "subscribe").mockReturnValue(() => undefined);
    const data = vi
      .spyOn(client, "data")
      .mockImplementation(async (request) =>
        request.kind === "check.last"
          ? { ok: true as const, data: null }
          : { ok: true as const, data: { kind: "idle" as const, current: "" } },
      );
    const { result } = renderHook(() => useSkillsPanel(skillsResource(), () => undefined));
    expect(typeof result.current.about?.onCheck).toBe("function");
    act(() => result.current.about?.onCheck());
    expect(data).toHaveBeenCalledWith({ kind: "update.check" });
  });
});
