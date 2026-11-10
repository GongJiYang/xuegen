// @vitest-environment node
/**
 * batch-stage4a-fix1：`runner.ts` 的两处决策逻辑（纯函数，不跑真沙盒）。
 *
 * 1. `toolHint`：沙盒拦下「用 bash 写课程页/看板/日历/原料」时，模型只看到
 *    `Operation not permitted`，不知道该换哪个工具。提示由违规记录里的路径推出，
 *    规则路径与沙盒配置同一份（`rulePaths`），这里给一份同形状的替身。
 * 2. `sandboxTmpDir`：sandbox-runtime 给沙盒里的命令设 `TMPDIR`，但自己不建目录；
 *    取值顺序必须与它一致（`CLAUDE_CODE_TMPDIR` → `CLAUDE_TMPDIR` → `/tmp/claude`）。
 */

import { describe, expect, it } from "vitest";
import type { RulePaths } from "../guard/vault-paths.js";
import { sandboxTmpDir, toolHint } from "./runner.js";

/** 与 `rulePaths` 同形状的一小份：其余规则为空，只留提示用得上的四组。 */
const emptyRules: RulePaths = {
  knowledge: [],
  extracts: [],
  flashcards: [],
  sources: [],
  synthesis: [],
  entities: [],
  subjects: [],
  subjectBoard: [],
  cycles: [],
  courses: [],
  coursesBoard: [],
  log: [],
  index: [],
  profile: [],
  shelf: [],
  reading: [],
  clippings: [],
  raw: [],
  calendar: [],
  vaultRules: [],
  version: [],
  tmp: [],
};

const rules: RulePaths = {
  ...emptyRules,
  courses: ["/v/wiki/courses"],
  coursesBoard: ["/v/wiki/_generated/courses.md"],
  calendar: ["/v/wiki/calendar"],
  raw: ["/v/raw"],
};

const DEVICE_HINT = "课程页和看板不能用 bash 写";
const CALENDAR_HINT = "日历用 calendar_write 写";
const RAW_HINT = "原料只读";

describe("toolHint：按违规路径给出该用哪个工具", () => {
  it("路径落在课程页目录下 → 课程页/看板提示（course_close、course_plan）", () => {
    const hint = toolHint(
      "<sandbox_violations>\ndeny(1) file-write-create /v/wiki/courses/discrete-math.md\n</sandbox_violations>",
      rules,
    );
    expect(hint).toContain(DEVICE_HINT);
    expect(hint).toContain("course_close");
    expect(hint).toContain("course_plan");
    expect(hint).not.toContain(CALENDAR_HINT);
    expect(hint).not.toContain(RAW_HINT);
  });

  it("路径落在课程看板（两种拼写）下 → 同一条课程页提示", () => {
    for (const board of ["/v/wiki/_generated/courses.md"]) {
      const hint = toolHint(`deny(1) file-write-create ${board}`, rules);
      expect(hint, board).toContain(DEVICE_HINT);
    }
  });

  it("路径落在日历下 → calendar_write 提示", () => {
    const hint = toolHint(
      "<sandbox_violations>\ndeny(1) file-write-create /v/wiki/calendar/2026-11-10.md\n</sandbox_violations>",
      rules,
    );
    expect(hint).toContain(CALENDAR_HINT);
    expect(hint).not.toContain(DEVICE_HINT);
    expect(hint).not.toContain(RAW_HINT);
  });

  it("路径落在原料目录下 → 原料只读提示", () => {
    const hint = toolHint(
      "<sandbox_violations>\ndeny(1) file-write-data /v/raw/papers/epp.pdf\n</sandbox_violations>",
      rules,
    );
    expect(hint).toContain(RAW_HINT);
    expect(hint).not.toContain(DEVICE_HINT);
    expect(hint).not.toContain(CALENDAR_HINT);
  });

  it("没有命中任何规则路径 → 不追加（包括只是前缀相同的目录）", () => {
    const text = [
      "<sandbox_violations>",
      "deny(1) file-write-create /v/workspace/note.md",
      "deny(2) file-write-create /v/rawdata/x.md",
      "deny(3) file-write-create /v/wiki/courseware/y.md",
      "deny(4) file-write-create /v/wiki/calendars/z.md",
      "</sandbox_violations>",
    ].join("\n");
    expect(toolHint(text, rules)).toBe("");
  });

  it("两类同时命中 → 两条提示都追加（顺序固定：课程页、日历、原料）", () => {
    const text = [
      "deny(1) file-write-create /v/wiki/courses/a.md",
      "deny(2) file-write-create /v/wiki/calendar/b.md",
      "deny(3) file-write-create /v/raw/c.pdf",
    ].join("\n");
    const hint = toolHint(text, rules);
    expect(hint).toContain(DEVICE_HINT);
    expect(hint).toContain(CALENDAR_HINT);
    expect(hint).toContain(RAW_HINT);
    expect(hint.indexOf(DEVICE_HINT)).toBeLessThan(hint.indexOf(CALENDAR_HINT));
    expect(hint.indexOf(CALENDAR_HINT)).toBeLessThan(hint.indexOf(RAW_HINT));
  });

  it("同一条提示不重复追加（多行都命中同一组）", () => {
    const text = [
      "deny(1) file-write-create /v/wiki/courses/a.md",
      "deny(2) file-write-create /v/wiki/_generated/courses.md",
    ].join("\n");
    const hint = toolHint(text, rules);
    expect(hint.split(DEVICE_HINT).length - 1).toBe(1);
  });
});

describe("sandboxTmpDir：与 sandbox-runtime 的 TMPDIR 取值顺序一致", () => {
  it("没设环境变量时是 /private/tmp/claude（不是 /tmp/claude：seatbelt 看真实路径）", () => {
    expect(sandboxTmpDir({})).toBe("/private/tmp/claude");
  });

  it("CLAUDE_CODE_TMPDIR 优先于 CLAUDE_TMPDIR", () => {
    const env = { CLAUDE_CODE_TMPDIR: "/a", CLAUDE_TMPDIR: "/b" };
    expect(sandboxTmpDir(env)).toBe("/a");
    expect(sandboxTmpDir({ CLAUDE_TMPDIR: "/b" })).toBe("/b");
  });

  it("空字符串视为未设（与 sandbox-runtime 的 || 一致）", () => {
    expect(sandboxTmpDir({ CLAUDE_CODE_TMPDIR: "", CLAUDE_TMPDIR: "/b" })).toBe("/b");
    expect(sandboxTmpDir({ CLAUDE_CODE_TMPDIR: "" })).toBe("/private/tmp/claude");
  });
});
