import { describe, expect, it } from "vitest";
import type { SessionMeta } from "@shared/data-protocol.js";
import { sessionGroups, roleOfRow, type SessionListContext } from "./session-list.js";

const DIR = "/home/sessions";

function meta(name: string, startedAt: number, firstUser: string, pin: string | null, count: number): SessionMeta {
  return { file: `${DIR}/${name}`, startedAt, firstUser, pin, count };
}

const CONTROL = `${DIR}/2026-11-08T09-00-00-000Z_ctrl.jsonl`;
const COURSE = `${DIR}/2026-11-08T10-00-00-000Z_epp.jsonl`;

const BASE_CTX: SessionListContext = {
  current: COURSE,
  today: "2026-11-08",
  tzOffsetMinutes: 0,
  controlFiles: [CONTROL],
  courseSessions: { epp: COURSE },
  courseNames: { epp: "离散", ctm: "CTM" },
  lessons: {
    "2026-11-08": [{ course: "epp", id: "D2", content: "Ch2 §2.1–2.2：真值表" }],
  },
};

function ctx(overrides: Partial<SessionListContext> = {}): SessionListContext {
  return { ...BASE_CTX, ...overrides };
}

describe("roleOfRow", () => {
  const rows = sessionGroups(
    [
      meta("2026-11-08T09-00-00-000Z_ctrl.jsonl", Date.UTC(2026, 10, 8, 9, 0), "/skill:cycle-plan 给出今天的简报", null, 4),
      meta("2026-11-08T10-00-00-000Z_epp.jsonl", Date.UTC(2026, 10, 8, 10, 0), "⟦xuegen:resume|epp|离散⟧", "离散 D2", 9),
      meta("2026-11-07T18-00-00-000Z_free.jsonl", Date.UTC(2026, 10, 7, 18, 0), "帮我理解递归", null, 2),
    ],
    ctx(),
  ).flatMap((group) => group.rows);

  it("opens 总控 rows as control and course rows as that course", () => {
    expect(roleOfRow(rows.find((row) => row.kind === "control"))).toEqual({ kind: "control" });
    expect(roleOfRow(rows.find((row) => row.kind === "course"))).toEqual({ kind: "course", slug: "epp" });
    expect(roleOfRow(rows.find((row) => row.kind === "free"))).toEqual({ kind: "free" });
  });

  it("refuses to guess: an unknown or unpinned row is free", () => {
    const unpinned = { ...rows[0]!, kind: "course" as const, slug: null };
    expect(roleOfRow(undefined)).toEqual({ kind: "free" });
    expect(roleOfRow(unpinned)).toEqual({ kind: "free" });
  });
});

describe("sessionGroups", () => {
  const metas: SessionMeta[] = [
    meta("2026-11-08T09-00-00-000Z_ctrl.jsonl", Date.UTC(2026, 10, 8, 9, 0), "/skill:cycle-plan 给出今天的简报", null, 4),
    meta("2026-11-08T10-00-00-000Z_epp.jsonl", Date.UTC(2026, 10, 8, 10, 0), "[风格：细讲] 继续上次\n⟦xuegen:resume|epp|离散⟧", "离散 D2", 9),
    meta("2026-11-07T20-00-00-000Z_old.jsonl", Date.UTC(2026, 10, 7, 20, 0), "开始今天的离散数学", "离散 D1", 5),
    meta("2026-11-07T18-00-00-000Z_free.jsonl", Date.UTC(2026, 10, 7, 18, 0), "帮我理解递归", null, 2),
    meta("2026-11-06T08-00-00-000Z_empty.jsonl", Date.UTC(2026, 10, 6, 8, 0), "", null, 0),
  ];

  it("groups by local day, newest first, with 今天/昨天/周X labels", () => {
    const groups = sessionGroups(metas, ctx());
    expect(groups.map((group) => group.date)).toEqual(["2026-11-08", "2026-11-07", "2026-11-06"]);
    expect(groups.map((group) => group.label)).toEqual(["今天 · 11-08 周日", "昨天 · 11-07 周六", "11-06 周五"]);
    expect(groups[0]?.rows.map((row) => row.time)).toEqual(["10:00", "09:00"]);
  });

  it("marks the control session 总控 with the 今日简报 title", () => {
    const row = sessionGroups(metas, ctx())[0]?.rows[1];
    expect(row).toMatchObject({ kind: "control", slug: null, tag: "总控", title: "今日简报", count: 4 });
  });

  it("resolves a course session's slug, tag and 「课次 + 内容」 title", () => {
    const row = sessionGroups(metas, ctx())[0]?.rows[0];
    expect(row).toMatchObject({
      kind: "course",
      slug: "epp",
      tag: "离散",
      title: "D2 Ch2 §2.1–2.2：真值表",
      current: true,
      count: 9,
    });
  });

  it("keeps a pin-only course session a course (no remembered file)", () => {
    const row = sessionGroups(metas, ctx())[1]?.rows[0];
    // Slug unknown: the pin still says 「离散 D1」, but no lesson content can be matched.
    expect(row).toMatchObject({ kind: "course", slug: null, tag: "离散", title: "D1" });
  });

  it("finds the slug from the action marker when settings forgot the file", () => {
    const marked = meta(
      "2026-11-08T11-00-00-000Z_ctm.jsonl",
      Date.UTC(2026, 10, 8, 11, 0),
      "开始今天的 CTM 7 周\n⟦xuegen:open|ctm|CTM 7 周⟧",
      null,
      1,
    );
    const row = sessionGroups([marked], ctx({ courseSessions: {} }))[0]?.rows[0];
    expect(row).toMatchObject({ kind: "course", slug: "ctm", tag: "CTM", title: "开今天的课" });
  });

  it("uses the first line for a pin-less course session and for free sessions", () => {
    const groups = sessionGroups(metas, ctx());
    const free = groups[1]?.rows[1];
    expect(free).toMatchObject({ kind: "free", slug: null, tag: "自由", title: "帮我理解递归" });
  });

  it("strips the style tag and truncates the title at 30 chars", () => {
    const long = meta(
      "2026-11-07T12-00-00-000Z_long.jsonl",
      Date.UTC(2026, 10, 7, 12, 0),
      "[风格：大白话] 这是一条非常长的第一句话，长到三十个字肯定放不下需要被截断才行",
      null,
      1,
    );
    const row = sessionGroups([long], ctx({ current: null }))[0]?.rows[0];
    expect(row?.title).toBe("这是一条非常长的第一句话，长到三十个字肯定放不下需要被截断才…");
    expect(row?.title.length).toBe(31);
  });

  it("names an empty session 「（空会话）」", () => {
    const row = sessionGroups(metas, ctx())[2]?.rows[0];
    expect(row).toMatchObject({ kind: "free", tag: "自由", title: "（空会话）", count: 0 });
  });

  it("uses the local timezone offset for day and time", () => {
    // UTC+8: 2026-11-07T23:30Z is 11-08 07:30 local.
    const late = meta(
      "2026-11-07T23-30-00-000Z_late.jsonl",
      Date.UTC(2026, 10, 7, 23, 30),
      "深夜的问题",
      null,
      1,
    );
    const groups = sessionGroups([late], ctx({ tzOffsetMinutes: -480 }));
    expect(groups[0]?.date).toBe("2026-11-08");
    expect(groups[0]?.rows[0]?.time).toBe("07:30");
  });

  it("recognizes an older lesson by its course file path and names it by the opening action", () => {
    const old = meta(
      "2026-11-06T14-00-00-000Z_ctm.jsonl",
      Date.UTC(2026, 10, 6, 14, 0),
      "开始今天的 CTM，下次起点：D1（课程文件：/v/GJY/wiki/courses/ctm.md；库根：/v/GJY）",
      null,
      13,
    );
    expect(sessionGroups([old], ctx())[0]?.rows[0]).toMatchObject({ kind: "course", slug: "ctm", tag: "CTM", title: "开今天的课" });
  });
});
