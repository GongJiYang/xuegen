// useDomainSession 的测试：当前会话是不是领域会话、科目清单只在有人看时加载、
// 打开（或重开今天的）领域会话的两条路径（有今天的行 / 没有今天的行）。
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type { DomainSubject } from "@shared/data-protocol.js";
import type { ChatMessage } from "@shared/protocol.js";
import type { ChatController } from "../chat/useChat.js";
import { setTodayOverride } from "../today.js";
import { domainOpenMessage } from "./domain.js";
import type { SessionGroup } from "./session-list.js";
import { useDomainSession, type DomainSession } from "./use-domain-session.js";

const clientMock = vi.hoisted(() => ({ data: vi.fn() }));
vi.mock("../client.js", () => ({ data: clientMock.data }));

const TODAY = "2026-11-15";
const SUBJECTS: DomainSubject[] = [
  { id: "paradigm", title: "编程语言与编程范式", pages: 12, terms: 30, hasSummary: true },
  { id: "ctm", title: "计算思维", pages: 5, terms: 9, hasSummary: false },
];

function domainMessage(subject = "paradigm", title = "编程语言与编程范式"): ChatMessage {
  return {
    id: "m1",
    role: "user",
    markdown: domainOpenMessage(subject, title),
    streaming: false,
    toolCalls: [],
  };
}

function row(slug: string, file: string) {
  return {
    file,
    time: "09:12",
    kind: "domain" as const,
    slug,
    tag: "问领域",
    title: "编程范式",
    count: 2,
    current: false,
  };
}

function group(date: string, rows: SessionGroup["rows"]): SessionGroup {
  return { date, label: date, rows };
}

function fakeController(overrides: Partial<ChatController> = {}) {
  return {
    sessionFile: null,
    streaming: false,
    messages: [],
    sendCommand: vi.fn(),
    openSession: vi.fn((file: string | null) =>
      Promise.resolve(file === null ? "/sessions/new-domain.jsonl" : file),
    ),
    // The guard passes the switch straight through unless a test replaces it.
    guardSwitch: vi.fn((run: () => void) => run()),
    ...overrides,
  } as unknown as ChatController & {
    sendCommand: ReturnType<typeof vi.fn>;
    openSession: ReturnType<typeof vi.fn>;
    guardSwitch: ReturnType<typeof vi.fn>;
  };
}

let captured: DomainSession | null = null;

function Harness({
  controller,
  sessionGroups = [],
  enabled = true,
  setActiveCourse = vi.fn(),
}: {
  controller: ChatController;
  sessionGroups?: SessionGroup[];
  enabled?: boolean;
  setActiveCourse?: (slug: string | null) => void;
}) {
  const domainSession = useDomainSession({ controller, sessionGroups, setActiveCourse, enabled });
  useEffect(() => {
    captured = domainSession;
  });
  return null;
}

beforeEach(() => {
  setTodayOverride(TODAY);
  captured = null;
  clientMock.data.mockReset();
  clientMock.data.mockResolvedValue({ ok: true, data: SUBJECTS });
});

afterEach(() => {
  setTodayOverride(null);
  captured = null;
  vi.restoreAllMocks();
});

describe("useDomainSession — 当前会话", () => {
  it("names the subject a 领域 transcript was opened for", () => {
    render(<Harness controller={fakeController({ messages: [domainMessage()] })} />);
    expect(captured?.current).toEqual({ subject: "paradigm", title: "编程语言与编程范式" });
  });

  it("is null for a transcript with no 领域 marker", () => {
    const other: ChatMessage = {
      id: "m1",
      role: "user",
      markdown: "随便问一句",
      streaming: false,
      toolCalls: [],
    };
    render(<Harness controller={fakeController({ messages: [other] })} />);
    expect(captured?.current).toBeNull();
  });
});

describe("useDomainSession — 科目清单", () => {
  it("loads domain.subjects when something shows them", async () => {
    render(<Harness controller={fakeController()} enabled />);
    await act(async () => {});
    expect(clientMock.data).toHaveBeenCalledWith({ kind: "domain.subjects" });
    expect(captured?.subjects).toEqual(SUBJECTS);
  });

  it("sends no request while disabled and stays null", async () => {
    render(<Harness controller={fakeController()} enabled={false} />);
    await act(async () => {});
    expect(clientMock.data).not.toHaveBeenCalled();
    expect(captured?.subjects).toBeNull();
  });

  it("is [] when the request fails", async () => {
    clientMock.data.mockResolvedValue({ ok: false, code: "script-failed", error: "没有 domain.mjs" });
    render(<Harness controller={fakeController()} />);
    await act(async () => {});
    expect(captured?.subjects).toEqual([]);
  });
});

describe("useDomainSession — 打开领域会话", () => {
  it("reopens today's row for the subject and sends nothing", async () => {
    const controller = fakeController();
    const setActiveCourse = vi.fn();
    render(
      <Harness
        controller={controller}
        setActiveCourse={setActiveCourse}
        sessionGroups={[group(TODAY, [row("paradigm", "/sessions/today-domain.jsonl")])]}
      />,
    );
    await act(async () => {});
    act(() => captured?.open("paradigm", "编程语言与编程范式"));
    await act(async () => {});
    expect(controller.openSession).toHaveBeenCalledWith("/sessions/today-domain.jsonl", {
      kind: "domain",
      subject: "paradigm",
    });
    expect(controller.sendCommand).not.toHaveBeenCalled();
    expect(setActiveCourse).toHaveBeenCalledWith(null);
    expect(controller.guardSwitch).toHaveBeenCalled();
  });

  it("starts a new session and asks for the 领域 when today has no row", async () => {
    const controller = fakeController();
    render(<Harness controller={controller} sessionGroups={[group(TODAY, [])]} />);
    await act(async () => {});
    act(() => captured?.open("ctm", "计算思维"));
    await act(async () => {});
    expect(controller.openSession).toHaveBeenCalledWith(null, { kind: "domain", subject: "ctm" });
    expect(controller.sendCommand).toHaveBeenCalledTimes(1);
    const sent = controller.sendCommand.mock.calls[0]?.[0] as string;
    expect(sent.startsWith("/skill:domain")).toBe(true);
    expect(sent).toBe(domainOpenMessage("ctm", "计算思维"));
  });

  it("ignores a matching row that is not in today's group", async () => {
    const controller = fakeController();
    render(
      <Harness
        controller={controller}
        sessionGroups={[group("2026-11-14", [row("paradigm", "/sessions/yesterday.jsonl")])]}
      />,
    );
    await act(async () => {});
    act(() => captured?.open("paradigm", "编程语言与编程范式"));
    await act(async () => {});
    expect(controller.openSession).toHaveBeenCalledWith(null, { kind: "domain", subject: "paradigm" });
    expect(controller.sendCommand).toHaveBeenCalledTimes(1);
  });
});
