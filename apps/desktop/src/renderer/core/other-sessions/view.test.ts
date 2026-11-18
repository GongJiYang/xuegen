import { describe, expect, it } from "vitest";
import type { SessionListContext } from "../board/session-list.js";
import { otherSessions } from "./view.js";

function meta(file: string, startedAt: number) {
  return { file, startedAt, firstUser: "问", pin: null, count: 2 };
}

const ctx: SessionListContext = {
  current: null,
  today: "2026-11-18",
  tzOffsetMinutes: -480,
  controlFiles: [],
  courseSessions: {},
  courseNames: {},
  lessons: {},
};

const folders = [
  {
    label: "pi-learning",
    sessions: [
      meta("/s/p/b.jsonl", Date.UTC(2026, 10, 4, 4, 0)),
      meta("/s/p/a.jsonl", Date.UTC(2026, 9, 21, 1, 26)),
    ],
  },
  { label: "主目录", sessions: [meta("/s/h/c.jsonl", Date.UTC(2026, 10, 4, 2, 0))] },
];

describe("otherSessions", () => {
  it("merges the folders' sessions by day and remembers each row's place", () => {
    const view = otherSessions(folders, ctx);
    expect(view.count).toBe(3);
    expect(view.groups.map((group) => group.date)).toEqual(["2026-11-04", "2026-10-21"]);
    expect(view.groups[0]?.rows.map((row) => row.file)).toEqual(["/s/p/b.jsonl", "/s/h/c.jsonl"]);
    expect(view.places).toEqual({
      "/s/p/b.jsonl": "pi-learning",
      "/s/p/a.jsonl": "pi-learning",
      "/s/h/c.jsonl": "主目录",
    });
  });

  it("is empty without folders", () => {
    expect(otherSessions([], ctx)).toEqual({ count: 0, groups: [], places: {} });
  });
});
