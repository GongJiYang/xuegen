import { describe, expect, it } from "vitest";
import {
  checkpointPhase,
  needsRefresh,
  sessionDay,
  staleCourseSession,
  startsFresh,
} from "./session-freshness.js";

/** The session-file stamp for a local day at local noon, in the file-name format. */
function stampFor(localDay: string): string {
  const [year, month, day] = localDay.split("-").map(Number);
  const iso = new Date(year ?? 2000, (month ?? 1) - 1, day ?? 1, 12, 0, 0).toISOString();
  return `/sessions/${iso.replace(/[:.]/g, "-")}_abc.jsonl`;
}

describe("sessionDay", () => {
  it("reads the creation day in the given time zone", () => {
    expect(sessionDay("/a/b/2026-11-06T12-19-49-302Z_01a1.jsonl", -480)).toBe("2026-11-06");
    // UTC 17:00 is 01:00 the next day in UTC+8.
    expect(sessionDay("/a/b/2026-11-06T17-00-00-000Z_x.jsonl", -480)).toBe("2026-11-07");
  });

  it("is null for a name without a timestamp or a null file", () => {
    expect(sessionDay("/a/b/session.jsonl", -480)).toBeNull();
    expect(sessionDay("2026-11-06T12-19-49.jsonl", -480)).toBeNull();
    expect(sessionDay(null, -480)).toBeNull();
  });
});

describe("staleCourseSession", () => {
  const tz = new Date().getTimezoneOffset();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const yesterdayKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;

  it("flags the course's remembered session from an earlier day", () => {
    const file = stampFor(yesterdayKey);
    expect(staleCourseSession("ctm", file, { ctm: file }, todayKey, tz)).toEqual({
      slug: "ctm",
      day: yesterdayKey,
    });
  });

  it("is null for today's session", () => {
    const file = stampFor(todayKey);
    expect(staleCourseSession("ctm", file, { ctm: file }, todayKey, tz)).toBeNull();
  });

  it("is null when the open file is not the remembered one", () => {
    const file = stampFor(yesterdayKey);
    expect(staleCourseSession("ctm", file, { ctm: "/sessions/other.jsonl" }, todayKey, tz)).toBeNull();
  });

  it("is null without an active course", () => {
    const file = stampFor(yesterdayKey);
    expect(staleCourseSession(null, file, { ctm: file }, todayKey, tz)).toBeNull();
  });
});

describe("startsFresh", () => {
  const tz = new Date().getTimezoneOffset();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const yesterdayKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;

  it("is true with no remembered session", () => {
    expect(startsFresh("ctm", {}, todayKey, tz)).toBe(true);
  });

  it("is true for a remembered session from an earlier day", () => {
    expect(startsFresh("ctm", { ctm: stampFor(yesterdayKey) }, todayKey, tz)).toBe(true);
  });

  it("is false for today's session", () => {
    expect(startsFresh("ctm", { ctm: stampFor(todayKey) }, todayKey, tz)).toBe(false);
  });
});

describe("needsRefresh", () => {
  const file = "/sessions/2026-11-06T12-19-49-302Z_abc.jsonl";

  it("is false for an empty session", () => {
    expect(needsRefresh(file, "ctm", false, 0, 100, {})).toBe(false);
  });

  it("is false without an active course", () => {
    expect(needsRefresh(file, null, false, 3, 100, {})).toBe(false);
  });

  it("is true when the file was never seen", () => {
    expect(needsRefresh(file, "ctm", false, 3, 100, {})).toBe(true);
  });

  it("is true when the course page changed since the last answer", () => {
    expect(needsRefresh(file, "ctm", false, 3, 200, { [file]: 100 })).toBe(true);
  });

  it("is false when the page is unchanged since the last answer", () => {
    expect(needsRefresh(file, "ctm", false, 3, 100, { [file]: 100 })).toBe(false);
    expect(needsRefresh(file, "ctm", false, 3, 50, { [file]: 100 })).toBe(false);
  });

  it("is false once seen even without a changedAt", () => {
    expect(needsRefresh(file, "ctm", false, 3, undefined, { [file]: 100 })).toBe(false);
  });
});

describe("needsRefresh — 总控会话", () => {
  const file = "/sessions/2026-11-10T12-19-49-302Z_abc.jsonl";

  it("is true for a 总控 session this run has not seen", () => {
    // No course page to compare: what matters is that this app run never looked at the file.
    expect(needsRefresh(file, null, true, 3, undefined, {})).toBe(true);
    expect(needsRefresh(file, null, true, 3, 100, { [file]: 0 })).toBe(false);
  });

  it("is false once seen, even without a changedAt", () => {
    expect(needsRefresh(file, null, true, 3, undefined, { [file]: 0 })).toBe(false);
    expect(needsRefresh(file, null, true, 3, 100, { [file]: 0 })).toBe(false);
  });

  it("is false for an empty 总控 session", () => {
    expect(needsRefresh(file, null, true, 0, undefined, {})).toBe(false);
  });

  it("is false without a session file", () => {
    expect(needsRefresh(null, null, true, 3, undefined, {})).toBe(false);
  });

  it("ignores the control flag for a course session", () => {
    // A course session keeps yesterday's logic even if the caller passes isControl wrongly.
    expect(needsRefresh(file, "ctm", false, 3, 100, { [file]: 100 })).toBe(false);
  });
});

describe("checkpointPhase", () => {
  const file = "/sessions/2026-11-08T12-00-00-000Z_abc.jsonl";

  it("is none without a course or a session file", () => {
    expect(checkpointPhase(null, file, 80, null, null)).toBe("none");
    expect(checkpointPhase("ctm", null, 80, null, null)).toBe("none");
  });

  it("is none below 60% and offer at 60%", () => {
    expect(checkpointPhase("ctm", file, 59, null, null)).toBe("none");
    expect(checkpointPhase("ctm", file, 60, null, null)).toBe("offer");
    expect(checkpointPhase("ctm", file, null, null, null)).toBe("none");
  });

  it("is saving once the 存档 prompt went to this file", () => {
    expect(checkpointPhase("ctm", file, 65, file, null)).toBe("saving");
  });

  it("is saved once the 存档 answer for this file ended", () => {
    expect(checkpointPhase("ctm", file, 65, file, file)).toBe("saved");
  });

  it("rejudges by percent when the open file is a different one", () => {
    expect(checkpointPhase("ctm", file, 65, "/sessions/old.jsonl", "/sessions/old.jsonl")).toBe("offer");
    expect(checkpointPhase("ctm", file, 30, "/sessions/old.jsonl", null)).toBe("none");
  });
});
