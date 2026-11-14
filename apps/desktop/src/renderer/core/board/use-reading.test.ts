// useReading 的测试：剪藏指令的纯 helper，以及 加入阅读 / 复习 两个写入的连点保护
// （同一个键的请求还没返回时再点，不重复发第二遍；返回之后照常能再发）。

import { createElement, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { splitActionMarker } from "../chat/action-marker.js";
import { clipPrompt, isWebUrl, useReading, type ReadingResource } from "./use-reading.js";

const clientMock = vi.hoisted(() => ({ data: vi.fn() }));
vi.mock("../client.js", () => ({ data: clientMock.data }));

interface Deferred {
  promise: Promise<unknown>;
  resolve(value: unknown): void;
  reject(error: unknown): void;
}

function deferred(): Deferred {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** The write requests the hook sent, in order; each one resolves by hand. */
let writes: { request: { kind: string }; pending: Deferred }[] = [];

let reading: ReadingResource | null = null;

function Harness() {
  const current = useReading();
  useEffect(() => {
    reading = current;
  });
  return null;
}

function mount(): void {
  render(createElement(Harness));
}

function calls(kind: "reading.add" | "reading.review"): number {
  return clientMock.data.mock.calls.filter((call: { kind: string }[]) => call[0]?.kind === kind).length;
}

beforeEach(() => {
  writes = [];
  clientMock.data.mockReset();
  clientMock.data.mockImplementation((request: { kind: string }) => {
    if (request.kind === "reading.add" || request.kind === "reading.review") {
      const pending = deferred();
      writes.push({ request, pending });
      return pending.promise;
    }
    switch (request.kind) {
      case "shelf.list":
      case "reading.today":
      case "reading.queue":
      case "reading.sources":
        return Promise.resolve({ ok: true, data: [] });
      default:
        return Promise.resolve({ ok: true, data: null });
    }
  });
});

afterEach(() => {
  reading = null;
  vi.restoreAllMocks();
});

describe("clipPrompt", () => {
  it("剪藏指令折叠成「剪藏」动作名，正文仍是 reading 技能要看的原文", () => {
    const marked = splitActionMarker(clipPrompt(" https://example.com/a ", "medium", "today"));
    expect(marked.action).toBe("clip");
    expect(marked.courseTitle).toBeNull();
    expect(marked.body).toBe(
      "/skill:reading 把这篇文章剪藏到 clippings/ 并加入阅读队列（优先级 medium，今天就读）：https://example.com/a",
    );
  });

  it("still tells a URL from a vault path", () => {
    expect(isWebUrl("https://example.com")).toBe(true);
    expect(isWebUrl("raw/a.md")).toBe(false);
  });
});

describe("useReading 写入连点", () => {
  it("第一次 add 还没返回时再点同一来源：只发一次，第二次返回 busy", async () => {
    mount();
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    await act(async () => {
      first = reading!.add("raw/a.md", "medium", "today");
      second = reading!.add("raw/a.md", "medium", "today");
      await Promise.resolve();
    });

    expect(calls("reading.add")).toBe(1);
    await expect(second).resolves.toEqual({ ok: false, code: "unknown", error: "busy" });

    // 第一次返回后再点，照常发第二次。
    await act(async () => {
      writes[0]!.pending.resolve({
        ok: true,
        data: { slug: "a", title: "A", priority: "medium", due: "2026-11-12" },
      });
      await first;
    });
    await act(async () => {
      void reading!.add("raw/a.md", "medium", "today");
      await Promise.resolve();
    });
    expect(calls("reading.add")).toBe(2);

    await act(async () => {
      writes[1]!.pending.resolve({ ok: true, data: null });
      await Promise.resolve();
    });
  });

  it("add 失败后释放锁，再点照常发", async () => {
    mount();
    const first = reading!.add("raw/a.md", "medium", "today");
    expect(calls("reading.add")).toBe(1);

    await act(async () => {
      writes[0]!.pending.resolve({ ok: false, code: "script-failed", error: "没找到文件" });
      await first;
    });
    await act(async () => {
      void reading!.add("raw/a.md", "medium", "today");
      await Promise.resolve();
    });
    expect(calls("reading.add")).toBe(2);

    await act(async () => {
      writes[1]!.pending.resolve({ ok: true, data: null });
      await Promise.resolve();
    });
  });

  it("add 抛错后释放锁，再点照常发", async () => {
    mount();
    const first = reading!.add("raw/a.md", "medium", "today");
    expect(calls("reading.add")).toBe(1);

    await act(async () => {
      writes[0]!.pending.reject(new Error("disconnected"));
      await expect(first).rejects.toThrow("disconnected");
    });
    await act(async () => {
      void reading!.add("raw/a.md", "medium", "today");
      await Promise.resolve();
    });
    expect(calls("reading.add")).toBe(2);

    await act(async () => {
      writes[1]!.pending.resolve({ ok: true, data: null });
      await Promise.resolve();
    });
  });

  it("不同来源互不影响", async () => {
    mount();
    let other!: Promise<unknown>;
    await act(async () => {
      void reading!.add("raw/a.md", "medium", "today");
      other = reading!.add("raw/b.md", "medium", "today");
      await Promise.resolve();
    });
    expect(calls("reading.add")).toBe(2);

    await act(async () => {
      writes[0]!.pending.resolve({ ok: false, code: "script-failed", error: "x" });
      writes[1]!.pending.resolve({ ok: true, data: null });
      await other;
    });
  });

  it("第一次 review 还没返回时再点同一条：只发一次，第二次返回 busy", async () => {
    mount();
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    await act(async () => {
      first = reading!.review("a", "done");
      second = reading!.review("a", "done");
      await Promise.resolve();
    });

    expect(calls("reading.review")).toBe(1);
    await expect(second).resolves.toEqual({ ok: false, code: "unknown", error: "busy" });

    await act(async () => {
      writes[0]!.pending.resolve({ ok: true, data: null });
      await first;
    });
    await act(async () => {
      void reading!.review("a", "done");
      await Promise.resolve();
    });
    expect(calls("reading.review")).toBe(2);

    await act(async () => {
      writes[1]!.pending.resolve({ ok: true, data: null });
      await Promise.resolve();
    });
  });

  it("review 失败后释放锁，再点照常发", async () => {
    mount();
    const first = reading!.review("a", "postpone");
    expect(calls("reading.review")).toBe(1);

    await act(async () => {
      writes[0]!.pending.resolve({ ok: false, code: "script-failed", error: "队列里没有这条" });
      await first;
    });
    await act(async () => {
      void reading!.review("a", "postpone");
      await Promise.resolve();
    });
    expect(calls("reading.review")).toBe(2);

    await act(async () => {
      writes[1]!.pending.resolve({ ok: true, data: null });
      await Promise.resolve();
    });
  });
});
