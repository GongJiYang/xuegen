import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { CycleAccept, CycleOverview, SubjectInfo, SubjectsOverview } from "@shared/data-protocol.js";
import { useNextCycle, type NextCycleInput } from "./use-next-cycle.js";

const clientMock = vi.hoisted(() => ({ data: vi.fn() }));
vi.mock("../client.js", () => ({ data: clientMock.data }));

afterEach(() => {
  cleanup();
  clientMock.data.mockReset();
});

const OVERVIEW: CycleOverview = {
  date: "2026-12-21",
  route: null,
  cycle: {
    cycle: "C1",
    title: "",
    start: "2026-11-06",
    end: "2026-12-24",
    plannedEnd: "2026-12-24",
    delayDays: 0,
    week: 7,
    weeks: 7,
    daysLeft: 3,
    next: { cycle: "C2", start: "2026-12-30" },
    subjects: { c: "C" },
    auxSubjects: ["c"],
    subjectDays: {},
  },
  courses: [],
};

const ACCEPT: CycleAccept = {
  cycle: "C1",
  start: "2026-11-06",
  end: "2026-12-24",
  courses: [
    {
      slug: "ctm",
      title: "CTM",
      subject: "pl",
      goals: [{ level: "", text: "概念图", done: false }],
      lessons: { done: 12, total: 14, remaining: ["D13", "D14"] },
    },
  ],
  next: { cycle: "C2", start: "2026-12-30", end: "2027-02-16", mains: ["dsa", "c"], status: "未开始" },
};

const subject = (slug: string, title: string, book: string): SubjectInfo => ({
  slug,
  title,
  layer: "",
  route: "",
  main: false,
  courses: [],
  materials: [{ type: "书籍", mark: "now", status: "学习中", role: "主线", title: book, course: null }],
  defaultStyle: null,
});

const SUBJECTS: SubjectsOverview = {
  date: "2026-12-21",
  cycle: null,
  subjects: [subject("dsa", "数据结构与算法", "Sedgewick"), subject("c", "C 与系统编程", "Effective C"), subject("arch", "体系结构", "CSAPP")],
};

function setup(send = vi.fn()) {
  clientMock.data.mockImplementation((request: { kind: string; start?: string; main?: string[] }) => {
    if (request.kind === "cycle.accept") return Promise.resolve({ ok: true, data: ACCEPT });
    return Promise.resolve({
      ok: true,
      data: {
        days: [
          { date: request.start, weekday: "周三", type: "深度", subject: "dsa", name: "数据结构", aux: "c", auxName: "C" },
        ],
      },
    });
  });
  const input: NextCycleInput = {
    enabled: true,
    overview: OVERVIEW,
    subjects: SUBJECTS,
    unplanned: [{ subject: "dsa", subjectTitle: "数据结构与算法", title: "CLRS", type: "书籍", role: "参考" }],
    names: { ctm: "CTM" },
    send,
  };
  return { send, hook: renderHook(() => useNextCycle(input)) };
}

describe("useNextCycle", () => {
  it("is absent outside 总控 and has no banner before the last week", () => {
    const { result } = renderHook(() =>
      useNextCycle({ enabled: false, overview: OVERVIEW, subjects: null, unplanned: null, names: {}, send: vi.fn() }),
    );
    expect(result.current).toBeUndefined();
    const early = { ...OVERVIEW, date: "2026-12-10" };
    const { result: second } = renderHook(() =>
      useNextCycle({ enabled: true, overview: early, subjects: null, unplanned: null, names: {}, send: vi.fn() }),
    );
    expect(second.current?.banner).toBeNull();
  });

  it("walks the five steps and hands every answer to 总控", async () => {
    const { send, hook } = setup();
    const view = () => hook.result.current!;
    expect(view().banner).toContain("C1 最后一周");
    act(() => view().onOpen());
    await waitFor(() => expect(view().wizard?.state).toBe("ready"));
    expect(clientMock.data).toHaveBeenCalledWith({ kind: "cycle.accept", cycle: "C1" });

    act(() => view().wizard!.accept.onShortfall("partial"));
    act(() => view().wizard!.onNext());
    expect(view().wizard!.mains.options.map((option) => [option.slug, option.checked, option.disabled])).toEqual([
      ["dsa", true, false],
      ["c", true, false],
      ["arch", false, true],
    ]);
    act(() => view().wizard!.onNext());
    const groups = view().wizard!.materials.groups;
    expect(groups.map((group) => [group.picked, group.from])).toEqual([
      ["Sedgewick", null],
      ["Effective C", "continue"],
    ]);
    act(() => groups[1]!.onFrom("fresh"));
    act(() => view().wizard!.onNext());
    expect(view().wizard!.shelf.note).toContain("导读课 C 变成主课后自动停掉");
    act(() => view().wizard!.shelf.onToggle("dsa/CLRS"));
    act(() => view().wizard!.onNext());
    await waitFor(() => expect(view().wizard!.preview.state).toBe("ready"));
    expect(clientMock.data).toHaveBeenLastCalledWith({
      kind: "cycle.preview",
      from: "C1",
      start: "2026-12-30",
      main: ["dsa", "c"],
    });
    expect(view().wizard!.preview.cells[0]?.aux).toBeNull();

    act(() => view().wizard!.onNext());
    expect(view().wizard).toBeNull();
    const text = send.mock.calls[0]?.[0] as string;
    expect(text).toContain("先开 C2，CTM 剩下的转进书房自读");
    expect(text).toContain("C 与系统编程 用《Effective C》，从头精讲");
    expect(text).toContain("书房加：《CLRS》");
    expect(text).toContain("⟦xuegen:next-cycle⟧");
  });

  it("a recovery week moves the preview's start a week later", async () => {
    const { hook } = setup();
    const view = () => hook.result.current!;
    act(() => view().onOpen());
    await waitFor(() => expect(view().wizard?.state).toBe("ready"));
    for (let step = 0; step < 4; step += 1) act(() => view().wizard!.onNext());
    await waitFor(() => expect(view().wizard!.preview.state).toBe("ready"));
    expect(view().wizard!.preview.caption).toBe("C2 第 1 周预览 · 01-06 起");
  });
});
