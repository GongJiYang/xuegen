import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type { CycleDay, ShelfBook, ShelfToday } from "@shared/data-protocol.js";
import type { ControlCardProps } from "../../skins/contract.js";
import { strings } from "../strings.js";
import { useControlCard, type ControlCardInput } from "./use-control-card.js";
import type { ControlCardRow } from "./control-card.js";
import type { BoardResource } from "./use-resource.js";
import { dateKey } from "./use-calendar.js";

const clientMock = vi.hoisted(() => ({ data: vi.fn() }));
vi.mock("../client.js", () => ({ data: clientMock.data }));

const TODAY = dateKey(new Date());

/** The afterRead row the card shows: a 讲后读 item due today. */
const MONTH = {
  month: TODAY.slice(0, 7),
  days: {
    [TODAY]: {
      records: [],
      plans: [],
      readingDue: [{ slug: "ctm#讲后读-1", title: "讲后读 Ch2 §2.2（CTM）" }],
      log: [],
      note: null,
    },
  },
};

function day(): CycleDay {
  return {
    date: TODAY,
    weekday: "周一",
    cycle: "C1",
    week: 1,
    type: "深度",
    subject: "ctm",
    course: "ctm",
    aux: null,
    auxCourse: null,
    names: { ctm: "CTM" },
    subjects: {},
    roles: {},
    lessons: [],
    overdue: [],
  };
}

function resource<T>(value: T): BoardResource<T> {
  return { state: { status: "ready", value }, reload: vi.fn(), mutate: vi.fn() };
}

function input(overrides: Partial<ControlCardInput> = {}): ControlCardInput {
  return {
    today: resource(day()),
    tomorrow: resource(day()),
    queue: resource([]),
    shelf: {
      today: resource({ planned: null, free: null }),
      list: resource([]),
      done: vi.fn(),
      extract: vi.fn(),
      reload: vi.fn(),
    },
    streaming: false,
    onStudy: vi.fn(),
    onVerify: vi.fn(),
    onOpenTool: vi.fn(),
    onAskBrief: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

let captured: Omit<ControlCardProps, "older"> | null = null;

function Harness({ props }: { props: ControlCardInput }) {
  const card = useControlCard(props);
  useEffect(() => {
    captured = card;
  });
  return null;
}

/** `client.data` calls for the 讲后读 write (the calendar load is a different kind). */
function afterReadCalls(): number {
  return clientMock.data.mock.calls.filter(([request]) => request.kind === "course.afterRead").length;
}

describe("useControlCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clientMock.data.mockImplementation((request: { kind: string }) =>
      Promise.resolve({ ok: true, data: request.kind === "calendar.month" ? MONTH : {} }),
    );
  });
  afterEach(() => {
    captured = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("waits out the undo window: nothing written within 10 s, one write after", async () => {
    render(<Harness props={input()} />);
    await act(async () => {});
    const row = captured?.view.rows.find((entry) => entry.action?.kind === "afterRead");
    if (!row) throw new Error("expected an afterRead row");
    act(() => captured?.onAction(row));

    // The row now shows ✓ with a 「撤销 · N」 button; nothing written yet.
    const pending = captured?.view.rows.find((entry) => entry.action?.kind === "undoRead");
    expect(pending?.mark).toBe("done");
    expect(afterReadCalls()).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(9_000);
    });
    expect(afterReadCalls()).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(afterReadCalls()).toBe(1);
    expect(clientMock.data.mock.calls.find(([request]) => request.kind === "course.afterRead")?.[0]).toMatchObject({
      slug: "ctm",
      label: "Ch2 §2.2",
    });
  });

  it("never writes when the learner undoes inside the window", async () => {
    render(<Harness props={input()} />);
    await act(async () => {});
    const row = captured?.view.rows.find((entry) => entry.action?.kind === "afterRead");
    if (!row) throw new Error("expected an afterRead row");
    act(() => captured?.onAction(row));
    const undo = captured?.view.rows.find((entry) => entry.action?.kind === "undoRead");
    if (!undo) throw new Error("expected an undoRead row");
    act(() => captured?.onAction(undo));

    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(afterReadCalls()).toBe(0);
    // The row went back to its 读完了 state.
    expect(captured?.view.rows.some((entry) => entry.action?.kind === "afterRead")).toBe(true);
  });
});

// ---- 书房行：读完这段（撤销窗口）与摘几句 ----

const CHUNK = { index: 2, title: "Ch1 §1.1–1.4", from: 10, to: 18 };

/** One shelf book whose next block is still to read. */
function shelfBook(overrides: Partial<ShelfBook> = {}): ShelfBook {
  return {
    slug: "epp",
    title: "Discrete Mathematics and Its Applications",
    short: "Epp",
    slot: "planned",
    total: 81,
    position: 1,
    chunk: CHUNK,
    coreOverlap: null,
    doneToday: false,
    doneChunk: null,
    plannedEnd: "2027-01-28",
    end: "2027-01-28",
    late: 0,
    ...overrides,
  };
}

/** An input whose 书房 holds `today` and whose writes are spies the test drives. */
function shelfInput(
  today: ShelfToday,
  done: (slug: string) => Promise<boolean> = () => Promise.resolve(true),
  extract: (slug: string, page: number, text: string) => Promise<string | null> = () => Promise.resolve(null),
): ControlCardInput {
  return input({
    shelf: {
      today: resource(today),
      list: resource([]),
      done: vi.fn(done),
      extract: vi.fn(extract),
      reload: vi.fn(),
    },
  });
}

/** The row of `kind`, optionally the one whose text starts with `prefix` (the book's slot). */
function rowWith(kind: "shelfDone" | "undoShelf" | "extract", prefix?: string) {
  return captured?.view.rows.find(
    (entry) => entry.action?.kind === kind && (prefix === undefined || entry.text.startsWith(prefix)),
  );
}

describe("useControlCard 书房行", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clientMock.data.mockImplementation((request: { kind: string }) =>
      Promise.resolve({ ok: true, data: request.kind === "calendar.month" ? MONTH : {} }),
    );
  });

  it("waits out the undo window before calling shelf.done, and only once", async () => {
    const inputProps = shelfInput({ planned: shelfBook(), free: null });
    render(<Harness props={inputProps} />);
    await act(async () => {});
    const row = rowWith("shelfDone", "读书 · ");
    if (!row) throw new Error("expected a 书房 row");
    act(() => captured?.onAction(row));

    // ✓ 「已记下」 and 「撤销 · N」; nothing written yet.
    const pending = rowWith("undoShelf", "读书 · ");
    expect(pending?.mark).toBe("done");
    expect(pending?.sub).toBe(strings.control.card.shelfPendingSub);
    expect(pending?.button).toBe(strings.control.card.undo(10));
    expect(inputProps.shelf.done).toHaveBeenCalledTimes(0);

    await act(async () => {
      vi.advanceTimersByTime(9_000);
    });
    expect(inputProps.shelf.done).toHaveBeenCalledTimes(0);
    // The countdown is visible while the window runs.
    expect(rowWith("undoShelf", "读书 · ")?.button).toBe(strings.control.card.undo(1));

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(inputProps.shelf.done).toHaveBeenCalledTimes(1);
    expect(inputProps.shelf.done).toHaveBeenCalledWith("epp");
  });

  it("never writes when the learner undoes inside the window", async () => {
    const inputProps = shelfInput({ planned: shelfBook(), free: null });
    render(<Harness props={inputProps} />);
    await act(async () => {});
    const row = rowWith("shelfDone", "读书 · ");
    if (!row) throw new Error("expected a 书房 row");
    act(() => captured?.onAction(row));
    const undo = rowWith("undoShelf", "读书 · ");
    if (!undo) throw new Error("expected an undoShelf row");
    act(() => captured?.onAction(undo));

    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(inputProps.shelf.done).toHaveBeenCalledTimes(0);
    // The row went back to 「读完这段」.
    expect(rowWith("shelfDone", "读书 · ")?.button).toBe(strings.control.card.shelfDone);
  });

  it("commits a parked 书房 row when another row's undo window starts", async () => {
    const inputProps = shelfInput({
      planned: shelfBook(),
      free: shelfBook({ slug: "extra", short: "Extra", slot: "free", chunk: { ...CHUNK } }),
    });
    render(<Harness props={inputProps} />);
    await act(async () => {});
    const planned = rowWith("shelfDone", "读书 · ");
    const free = rowWith("shelfDone", "自由读 · ");
    if (!planned || !free) throw new Error("expected two 书房 rows");
    act(() => captured?.onAction(planned));
    expect(inputProps.shelf.done).toHaveBeenCalledTimes(0);
    act(() => captured?.onAction(free));
    // The parked one was written straight away; the new one is parked instead.
    expect(inputProps.shelf.done).toHaveBeenCalledTimes(1);
    expect(inputProps.shelf.done).toHaveBeenCalledWith("epp");
    expect(rowWith("shelfDone", "读书 · ")?.button).toBe(strings.control.card.shelfDone);
    expect(rowWith("undoShelf", "自由读 · ")).toBeTruthy();
  });

  it("shares one undo window with the 讲后读 rows", async () => {
    const inputProps = shelfInput({ planned: shelfBook(), free: null });
    render(<Harness props={inputProps} />);
    await act(async () => {});
    const shelf = rowWith("shelfDone", "读书 · ");
    const afterRead = captured?.view.rows.find((entry) => entry.action?.kind === "afterRead");
    if (!shelf || !afterRead) throw new Error("expected a 书房 row and a 讲后读 row");
    act(() => captured?.onAction(shelf));
    expect(rowWith("undoShelf", "读书 · ")).toBeTruthy();
    // A second click inside the window commits the parked 书房 row now and
    // parks the 讲后读 one in its place.
    act(() => captured?.onAction(afterRead));
    expect(inputProps.shelf.done).toHaveBeenCalledTimes(1);
    expect(inputProps.shelf.done).toHaveBeenCalledWith("epp");
    expect(rowWith("undoShelf", "读书 · ")).toBeUndefined();
    expect(captured?.view.rows.some((entry) => entry.action?.kind === "undoRead")).toBe(true);
    // Only the 讲后读 row's deadline writes; the 书房 row is not written twice.
    await act(async () => {
      vi.advanceTimersByTime(11_000);
    });
    expect(afterReadCalls()).toBe(1);
    expect(inputProps.shelf.done).toHaveBeenCalledTimes(1);
  });

  it("reports shelfDoneFailed when the write fails", async () => {
    const inputProps = shelfInput({ planned: shelfBook(), free: null }, () => Promise.resolve(false));
    render(<Harness props={inputProps} />);
    await act(async () => {});
    const row = rowWith("shelfDone", "读书 · ");
    if (!row) throw new Error("expected a 书房 row");
    act(() => captured?.onAction(row));
    await act(async () => {
      vi.advanceTimersByTime(11_000);
    });
    await act(async () => {});
    expect(inputProps.shelf.done).toHaveBeenCalledTimes(1);
    expect(captured?.error).toBe(strings.control.card.shelfDoneFailed);
  });
});

describe("useControlCard 摘几句", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clientMock.data.mockImplementation((request: { kind: string }) =>
      Promise.resolve({ ok: true, data: request.kind === "calendar.month" ? MONTH : {} }),
    );
  });

  /** A card whose 书房 block is already read today, so it carries the 摘几句 button. */
  function doneTodayInput(
    extract: (slug: string, page: number, text: string) => Promise<string | null> = () => Promise.resolve(null),
  ): ControlCardInput {
    return shelfInput(
      { planned: shelfBook({ doneToday: true, doneChunk: CHUNK }), free: null },
      () => Promise.resolve(true),
      extract,
    );
  }

  it("opens the form on 摘几句 and closes it on cancel, writing nothing", async () => {
    const inputProps = doneTodayInput();
    render(<Harness props={inputProps} />);
    await act(async () => {});
    expect(captured?.extract).toBeNull();
    const row = rowWith("extract", "读书 · ");
    if (!row) throw new Error("expected a 摘几句 row");
    act(() => captured?.onAction(row));
    expect(captured?.extract).toMatchObject({ slug: "epp", pages: "pp.10–18", saving: false, error: null });
    act(() => captured?.extract?.onCancel());
    expect(captured?.extract).toBeNull();
    expect(inputProps.shelf.extract).toHaveBeenCalledTimes(0);
  });

  it("rejects a bad page and an empty 原句 without calling shelf.extract", async () => {
    const inputProps = doneTodayInput();
    render(<Harness props={inputProps} />);
    await act(async () => {});
    act(() => captured?.onAction(rowWith("extract", "读书 · ") as ControlCardRow));

    act(() => captured?.extract?.onSave("0", "逆否命题与原命题等价。"));
    expect(captured?.extract?.error).toBe(strings.control.card.extractPageInvalid);
    act(() => captured?.extract?.onSave("11a", "逆否命题与原命题等价。"));
    expect(captured?.extract?.error).toBe(strings.control.card.extractPageInvalid);
    act(() => captured?.extract?.onSave("11", "   "));
    expect(captured?.extract?.error).toBe(strings.control.card.extractTextEmpty);
    expect(inputProps.shelf.extract).toHaveBeenCalledTimes(0);
    // The form is still open after an error.
    expect(captured?.extract).not.toBeNull();
  });

  it("saves a valid line: form closes and the row's sub gains 「摘了 1 句」", async () => {
    const inputProps = doneTodayInput();
    render(<Harness props={inputProps} />);
    await act(async () => {});
    act(() => captured?.onAction(rowWith("extract", "读书 · ") as ControlCardRow));
    act(() => captured?.extract?.onSave("p 11", "逆否命题与原命题等价。"));
    // Disabled while the write is in flight.
    expect(captured?.extract?.saving).toBe(true);
    await act(async () => {});
    expect(inputProps.shelf.extract).toHaveBeenCalledTimes(1);
    expect(inputProps.shelf.extract).toHaveBeenCalledWith("epp", 11, "逆否命题与原命题等价。");
    expect(captured?.extract).toBeNull();
    const row = captured?.view.rows.find((entry) => entry.action?.kind === "extract");
    expect(row?.sub).toBe(`${strings.control.card.shelfDoneSub(CHUNK)} · ${strings.control.card.extracted(1)}`);
  });

  it("reports extractFailed and keeps the form open when the write fails", async () => {
    const inputProps = doneTodayInput(() => Promise.resolve("磁盘写入失败"));
    render(<Harness props={inputProps} />);
    await act(async () => {});
    act(() => captured?.onAction(rowWith("extract", "读书 · ") as ControlCardRow));
    act(() => captured?.extract?.onSave("11", "逆否命题与原命题等价。"));
    await act(async () => {});
    expect(captured?.extract?.error).toBe(strings.control.card.extractFailed);
    expect(captured?.extract?.saving).toBe(false);
  });
});
