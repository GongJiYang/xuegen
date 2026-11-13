// useShelf 写入连点的测试：同一个键的请求还没返回时再点，不重复发第二遍；
// 返回（成功或失败）之后照常能再发。

import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useShelf, type ShelfResource } from "./use-shelf.js";

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
let writes: { request: { kind: string; slug?: string }; pending: Deferred }[] = [];

let shelf: ShelfResource | null = null;

function Harness() {
  const current = useShelf();
  useEffect(() => {
    shelf = current;
  });
  return null;
}

function mount(): void {
  render(<Harness />);
}

function calls(kind: "shelf.done" | "shelf.extract"): number {
  return clientMock.data.mock.calls.filter((call: { kind: string }[]) => call[0]?.kind === kind).length;
}

beforeEach(() => {
  writes = [];
  clientMock.data.mockReset();
  clientMock.data.mockImplementation((request: { kind: string }) => {
    if (request.kind === "shelf.done" || request.kind === "shelf.extract") {
      const pending = deferred();
      writes.push({ request, pending });
      return pending.promise;
    }
    return Promise.resolve({ ok: true, data: request.kind === "shelf.list" ? [] : null });
  });
});

afterEach(() => {
  shelf = null;
  vi.restoreAllMocks();
});

describe("useShelf 写入连点", () => {
  it("第一次 done 还没返回时再点，只发一次请求，第二次直接返回 false", async () => {
    mount();
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      first = shelf!.done("a");
      second = shelf!.done("a");
      await Promise.resolve();
    });

    expect(calls("shelf.done")).toBe(1);
    await expect(second).resolves.toBe(false);

    // 第一次返回后再点，照常发第二次。
    await act(async () => {
      writes[0]!.pending.resolve({ ok: true, data: {} });
      await first;
    });
    await act(async () => {
      void shelf!.done("a");
      await Promise.resolve();
    });
    expect(calls("shelf.done")).toBe(2);

    await act(async () => {
      writes[1]!.pending.resolve({ ok: true, data: {} });
      await Promise.resolve();
    });
  });

  it("done 失败后释放锁，再点照常发", async () => {
    mount();
    const first = shelf!.done("a");
    expect(calls("shelf.done")).toBe(1);

    await act(async () => {
      writes[0]!.pending.resolve({ ok: false, code: "script-failed", error: "boom" });
      await first;
    });
    await act(async () => {
      void shelf!.done("a");
      await Promise.resolve();
    });
    expect(calls("shelf.done")).toBe(2);

    await act(async () => {
      writes[1]!.pending.resolve({ ok: true, data: {} });
      await Promise.resolve();
    });
  });

  it("done 抛错后释放锁，再点照常发", async () => {
    mount();
    const first = shelf!.done("a");
    expect(calls("shelf.done")).toBe(1);

    await act(async () => {
      writes[0]!.pending.reject(new Error("disconnected"));
      await expect(first).rejects.toThrow("disconnected");
    });
    await act(async () => {
      void shelf!.done("a");
      await Promise.resolve();
    });
    expect(calls("shelf.done")).toBe(2);

    await act(async () => {
      writes[1]!.pending.resolve({ ok: true, data: {} });
      await Promise.resolve();
    });
  });

  it("不同 slug 互不影响", async () => {
    mount();
    let other!: Promise<boolean>;
    await act(async () => {
      void shelf!.done("a");
      other = shelf!.done("b");
      await Promise.resolve();
    });
    expect(calls("shelf.done")).toBe(2);

    await act(async () => {
      writes[0]!.pending.resolve({ ok: true, data: {} });
      writes[1]!.pending.resolve({ ok: true, data: {} });
      await other;
    });
  });

  it("extract 未返回时再保存同一段：只发一次，第二次返回 null", async () => {
    mount();
    let first!: Promise<string | null>;
    let second!: Promise<string | null>;
    await act(async () => {
      first = shelf!.extract("a", 12, "原文");
      second = shelf!.extract("a", 12, "原文");
      await Promise.resolve();
    });

    expect(calls("shelf.extract")).toBe(1);
    await expect(second).resolves.toBeNull();

    await act(async () => {
      writes[0]!.pending.resolve({ ok: true, data: {} });
      await first;
    });
    // 返回后再保存同一段，照常发。
    await act(async () => {
      void shelf!.extract("a", 12, "原文");
      await Promise.resolve();
    });
    expect(calls("shelf.extract")).toBe(2);

    await act(async () => {
      writes[1]!.pending.resolve({ ok: true, data: {} });
      await Promise.resolve();
    });
  });

  it("extract 失败后释放锁，再保存照常发并返回错误文案", async () => {
    mount();
    const first = shelf!.extract("a", 12, "原文");
    expect(calls("shelf.extract")).toBe(1);

    await act(async () => {
      writes[0]!.pending.resolve({ ok: false, code: "script-failed", error: "页码越界" });
      await expect(first).resolves.toBe("页码越界");
    });
    await act(async () => {
      void shelf!.extract("a", 12, "原文");
      await Promise.resolve();
    });
    expect(calls("shelf.extract")).toBe(2);

    await act(async () => {
      writes[1]!.pending.resolve({ ok: true, data: {} });
      await Promise.resolve();
    });
  });
});
