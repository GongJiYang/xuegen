import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type { CycleDay } from "@shared/data-protocol.js";
import type { ControlCardProps } from "../../skins/contract.js";
import { useControlCard, type ControlCardInput } from "./use-control-card.js";
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
