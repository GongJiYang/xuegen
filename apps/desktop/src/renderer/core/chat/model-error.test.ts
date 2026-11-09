import { describe, expect, it } from "vitest";
import { MODEL_ERROR_SUMMARIES, isAborted, translateModelError } from "./model-error.js";

describe("translateModelError", () => {
  it("maps an auth failure (401 + invalid key JSON)", () => {
    const raw = '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}';
    const result = translateModelError(raw);
    expect(result.summary).toBe(MODEL_ERROR_SUMMARIES.auth);
    expect(result.detail).toBe(raw);
  });

  it("maps a rate limit (429 / too many requests)", () => {
    expect(translateModelError("429 Too Many Requests").summary).toBe(MODEL_ERROR_SUMMARIES.rate);
    expect(translateModelError("Rate limit exceeded").summary).toBe(MODEL_ERROR_SUMMARIES.rate);
  });

  it("maps an out-of-credit failure (402 / insufficient balance)", () => {
    const raw = '402 {"message":"Insufficient Balance","type":"insufficient_quota"}';
    const result = translateModelError(raw);
    expect(result.summary).toBe(MODEL_ERROR_SUMMARIES.balance);
    expect(result.detail).toBe(raw);
    expect(translateModelError("Error: insufficient_balance").summary).toBe(MODEL_ERROR_SUMMARIES.balance);
  });

  it("does not confuse a balance failure with an auth or rate failure", () => {
    expect(translateModelError("402 Insufficient Balance").summary).not.toBe(MODEL_ERROR_SUMMARIES.auth);
    expect(translateModelError("402 Insufficient Balance").summary).not.toBe(MODEL_ERROR_SUMMARIES.rate);
  });

  it("maps a network failure", () => {
    expect(translateModelError("fetch failed").summary).toBe(MODEL_ERROR_SUMMARIES.network);
    expect(translateModelError("connect ECONNREFUSED 127.0.0.1:443").summary).toBe(MODEL_ERROR_SUMMARIES.network);
  });

  it("recognises a connection cut by a proxy or relay", () => {
    for (const raw of [
      "terminated",
      "TypeError: terminated",
      "premature close",
      "other side closed",
      "ECONNABORTED",
      "read EPIPE",
    ]) {
      expect(translateModelError(raw).summary).toBe(MODEL_ERROR_SUMMARIES.network);
    }
  });

  it("falls back to a generic summary but keeps the detail", () => {
    const result = translateModelError("model returned an unexpected stop reason");
    expect(result.summary).toBe(MODEL_ERROR_SUMMARIES.generic);
    expect(result.detail).toBe("model returned an unexpected stop reason");
  });

  it("has no detail for an empty error", () => {
    expect(translateModelError("   ").detail).toBeNull();
  });

  it("treats a user stop as guidance, not a failure (no detail)", () => {
    for (const raw of ["已中止", "Request was aborted", "aborted"]) {
      expect(isAborted(raw)).toBe(true);
      expect(translateModelError(raw).summary).toBe(MODEL_ERROR_SUMMARIES.aborted);
      expect(translateModelError(raw).detail).toBeNull();
    }
  });

  it("does not mistake a real error for a stop", () => {
    expect(isAborted("模型返回错误")).toBe(false);
  });
});
