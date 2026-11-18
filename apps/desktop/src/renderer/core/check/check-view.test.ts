/**
 * 「库检查」纯函数：上次结果一行、两组的行、以及「交给总控」的 prompt
 * （logic-ui-1116.html A ③）。
 */

import { describe, expect, it } from "vitest";
import type { CheckProblem, CheckResult } from "@shared/data-protocol.js";
import { strings } from "../strings.js";
import { splitActionMarker } from "../chat/action-marker.js";
import { checkAskPrompt, checkView, problemLine } from "./check-view.js";
import { checkStrings } from "./strings.js";

function localStamp(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const p1: CheckProblem = {
  area: "courses",
  where: "ctm",
  kind: "not-readonly",
  detail: "课程页不是只读（应为只读）",
};
const p2: CheckProblem = {
  area: "courses",
  where: null,
  kind: "board-stale",
  detail: "看板和课程页对不上（过期）",
};
const result: CheckResult = {
  checkedAt: "2026-11-16T02:20:00.000Z",
  vault: [],
  courses: [p1, p2],
};

describe("checkView", () => {
  it("shows 还没检查过 before the first run", () => {
    const view = checkView(null, false, null);
    expect(view.last).toBe("还没检查过");
    expect(view.button).toBe("检查");
    expect(view.groups).toEqual([]);
    expect(view.hasProblems).toBe(false);
  });

  it("formats the last check and groups problems", () => {
    const view = checkView(result, false, null);
    expect(view.last.startsWith("上次 ")).toBe(true);
    expect(view.last).toContain(localStamp(result.checkedAt));
    expect(view.button).toBe("重新检查");
    expect(view.groups[0]).toEqual(
      expect.objectContaining({ title: "库", count: 0, lines: [] }),
    );
    expect(view.groups[1]?.count).toBe(2);
    expect(view.groups[1]?.lines).toEqual([
      "ctm · 课程页不是只读",
      "课程看板和课程页对不上",
    ]);
    expect(view.hasProblems).toBe(true);
  });

  it("has a line for every known kind, without paths", () => {
    const known = Object.keys(checkStrings.kinds);
    for (const kind of known) {
      const expected = checkStrings.kinds[kind] ?? "";
      expect(problemLine({ area: "vault", where: null, kind, detail: "x" })).toBe(expected);
      expect(problemLine({ area: "courses", where: "ctm", kind, detail: "x" })).toBe(
        `ctm · ${expected}`,
      );
    }
    const lines = [
      ...known.flatMap((kind) => [
        problemLine({ area: "vault", where: null, kind, detail: "x" }),
        problemLine({ area: "courses", where: "ctm", kind, detail: "x" }),
      ]),
      problemLine({ area: "vault", where: "笔记", kind: "something-new", detail: "x" }),
    ];
    expect(problemLine({ area: "vault", where: "笔记", kind: "something-new", detail: "x" })).toBe(
      "笔记 · 有一处要看",
    );
    for (const line of lines) {
      expect(line).not.toContain("/");
      expect(line).not.toContain("wiki");
      expect(line).not.toContain(".md");
    }
  });

  it("reports running and failure", () => {
    const running = checkView(null, true, null);
    expect(running.status).toBe("正在检查…");
    expect(running.running).toBe(true);
    expect(checkView(null, false, "boom").status).toBe("检查失败：boom");
  });
});

describe("checkAskPrompt", () => {
  it("lists every problem and ends with the ask marker", () => {
    const prompt = checkAskPrompt(result);
    expect(prompt.startsWith("/skill:course 库检查")).toBe(true);
    expect(prompt).toContain("- ctm：not-readonly，课程页不是只读（应为只读）");
    expect(prompt).toContain("- （看板）：board-stale，看板和课程页对不上（过期）");
    const lines = prompt.split("\n");
    expect(lines[lines.length - 2]).toBe(strings.panel.askConfirm);
    const marker = splitActionMarker(prompt);
    expect(marker.action).toBe("ask");
    expect(marker.courseTitle).toBe("库检查");
  });

  it("names the 课程目录 / 库 for problems without a page (P3)", () => {
    const noPage: CheckResult = {
      checkedAt: "2026-11-17T02:20:00.000Z",
      vault: [{ area: "vault", where: null, kind: "empty-dir", detail: "有空目录" }],
      courses: [
        { area: "courses", where: null, kind: "board-stale", detail: "看板和课程页对不上（过期）" },
        { area: "courses", where: null, kind: "dir-writable", detail: "课程目录可写" },
      ],
    };
    const prompt = checkAskPrompt(noPage);
    expect(prompt).toContain("- （看板）：board-stale，看板和课程页对不上（过期）");
    expect(prompt).toContain("- （课程目录）：dir-writable，课程目录可写");
    expect(prompt).toContain("- （库）：empty-dir，有空目录");
  });
});
