/**
 * The transient-provider-error rule must rescue OpenDesign's temporary 503
 * (whose text happens to contain "Billing Scope") without weakening the real
 * "out of balance/quota" errors, which must keep failing fast.
 */

import { describe, expect, it } from "vitest";
import { AgentSession } from "@earendil-works/pi-coding-agent";
import { isTransientProviderError, withTransientRetry } from "./transient-error.js";

/** The verbatim body OpenDesign returned during the D3 window (11-11). */
const OPENDESIGN_503 =
  '503: {"code":"database_unavailable","message":"[code=database_unavailable] resolve Billing Scope: status 503: database_unavailable","type":"database_unavailable"}';

describe("isTransientProviderError", () => {
  it("accepts the OpenDesign temporary 503 that mentions Billing Scope", () => {
    expect(isTransientProviderError(OPENDESIGN_503)).toBe(true);
  });

  it("accepts a 503 whose text mentions workspace_billing_scope_unavailable", () => {
    expect(
      isTransientProviderError("503 service unavailable: workspace_billing_scope_unavailable"),
    ).toBe(true);
  });

  it("accepts a bare status 503 with database_unavailable", () => {
    expect(isTransientProviderError("status 503: database_unavailable")).toBe(true);
  });

  it("rejects a real out-of-balance error", () => {
    expect(isTransientProviderError("402 Insufficient Balance")).toBe(false);
  });

  it("rejects insufficient_quota", () => {
    expect(isTransientProviderError("insufficient_quota")).toBe(false);
  });

  it("rejects a billing hard limit without a 503", () => {
    expect(isTransientProviderError("billing hard limit reached")).toBe(false);
  });

  it("rejects a 503 that is really a quota error", () => {
    expect(isTransientProviderError("503 quota exceeded")).toBe(false);
  });

  it("rejects an empty message", () => {
    expect(isTransientProviderError("")).toBe(false);
  });

  it("requires a standalone 503, not digits inside a longer number", () => {
    expect(isTransientProviderError("request id 15031 database_unavailable")).toBe(false);
  });
});

describe("withTransientRetry", () => {
  function message(stopReason: string, errorMessage?: string) {
    return { role: "assistant", stopReason, errorMessage };
  }

  it("retries an OpenDesign 503 the original rule refused", () => {
    const session = { _isRetryableError: (_m: unknown) => false };
    withTransientRetry(session);
    expect(session._isRetryableError(message("error", OPENDESIGN_503))).toBe(true);
  });

  it("still refuses a real out-of-balance error", () => {
    const session = { _isRetryableError: (_m: unknown) => false };
    withTransientRetry(session);
    expect(session._isRetryableError(message("error", "402 Insufficient Balance"))).toBe(false);
  });

  it("does not retry a successful stop", () => {
    const session = { _isRetryableError: (_m: unknown) => false };
    withTransientRetry(session);
    expect(session._isRetryableError(message("stop"))).toBe(false);
  });

  it("keeps whatever the original rule already called retryable", () => {
    const session = { _isRetryableError: (_m: unknown) => true };
    withTransientRetry(session);
    expect(session._isRetryableError(message("error", "overloaded_error"))).toBe(true);
  });

  it("passes through a session without _isRetryableError and does not throw", () => {
    const session: Record<string, unknown> = {};
    expect(() => withTransientRetry(session)).not.toThrow();
    expect(session._isRetryableError).toBeUndefined();
  });
});

describe("Pi retry hook", () => {
  it("still exposes AgentSession._isRetryableError (rename means this wrapper is void)", () => {
    // Private in the type declarations, so read it the way the wrapper does.
    const prototype = AgentSession.prototype as unknown as Record<string, unknown>;
    expect(typeof prototype._isRetryableError).toBe("function");
  });
});
