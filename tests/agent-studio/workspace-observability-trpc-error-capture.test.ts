/**
 * Phase 22 follow-up — tRPC error capture helpers for
 * ags_workspace_error_events.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  classifyTrpcErrorForCapture,
  captureUnexpectedTrpcError,
  EXPECTED_TRPC_CODES,
} from "../../server/agent-studio/services/workspace-observability/trpc-error-capture";

describe("classifyTrpcErrorForCapture", () => {
  it("skips expected operator-side TRPCError codes", () => {
    for (const code of [
      "BAD_REQUEST",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND",
      "PRECONDITION_FAILED",
      "CONFLICT",
      "METHOD_NOT_SUPPORTED",
      "TIMEOUT",
    ]) {
      const decision = classifyTrpcErrorForCapture(
        new TRPCError({
          code: code as Parameters<typeof TRPCError>[0]["code"],
          message: `${code} test`,
        }),
      );
      expect(decision.capture).toBe(false);
      if (!decision.capture) {
        expect(decision.skipReason).toBe("expected_trpc_code");
      }
    }
  });

  it("captures INTERNAL_SERVER_ERROR TRPCError", () => {
    const err = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB exploded",
    });
    const decision = classifyTrpcErrorForCapture(err);
    expect(decision.capture).toBe(true);
    if (decision.capture) {
      expect(decision.errorClass).toBe("TRPCError:INTERNAL_SERVER_ERROR");
      expect(decision.errorMessage).toBe("DB exploded");
    }
  });

  it("captures raw Error instances using their constructor name", () => {
    class CustomBugError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "CustomBugError";
      }
    }
    const decision = classifyTrpcErrorForCapture(new CustomBugError("oops"));
    expect(decision.capture).toBe(true);
    if (decision.capture) {
      expect(decision.errorClass).toBe("CustomBugError");
      expect(decision.errorMessage).toBe("oops");
    }
  });

  it("skips non-Error thrown values (strings, plain objects, null)", () => {
    expect(classifyTrpcErrorForCapture("string error").capture).toBe(false);
    expect(classifyTrpcErrorForCapture({ msg: "x" }).capture).toBe(false);
    expect(classifyTrpcErrorForCapture(null).capture).toBe(false);
    expect(classifyTrpcErrorForCapture(undefined).capture).toBe(false);
  });

  it("EXPECTED_TRPC_CODES is exported and stable", () => {
    expect(EXPECTED_TRPC_CODES.has("BAD_REQUEST")).toBe(true);
    expect(EXPECTED_TRPC_CODES.has("INTERNAL_SERVER_ERROR")).toBe(false);
  });
});

describe("captureUnexpectedTrpcError", () => {
  let recorderSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    recorderSpy = vi.fn();
  });

  it("returns null + skips recording for an expected TRPCError code", async () => {
    const result = await captureUnexpectedTrpcError(
      "graphQuality.runScan",
      new TRPCError({ code: "BAD_REQUEST", message: "x" }),
      {},
      { recordErrorEvent: recorderSpy as never },
    );
    expect(result).toBeNull();
    expect(recorderSpy).not.toHaveBeenCalled();
  });

  it("records + returns the row id for an INTERNAL_SERVER_ERROR", async () => {
    recorderSpy.mockResolvedValueOnce({ id: 42, errorClass: "x" });
    const result = await captureUnexpectedTrpcError(
      "graphQuality.runScan",
      new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "db ded" }),
      { userId: 7, sourceId: "scan:1", metadata: { extra: 1 } },
      { recordErrorEvent: recorderSpy as never },
    );
    expect(result).toBe(42);
    expect(recorderSpy).toHaveBeenCalledTimes(1);
    expect(recorderSpy.mock.calls[0][0]).toMatchObject({
      sourceKind: "graphQuality.runScan",
      sourceId: "scan:1",
      userId: 7,
      errorClass: "TRPCError:INTERNAL_SERVER_ERROR",
      errorMessage: "db ded",
      metadata: { extra: 1 },
    });
  });

  it("returns null when the recorder returns null (ASDB unavailable)", async () => {
    recorderSpy.mockResolvedValueOnce(null);
    const result = await captureUnexpectedTrpcError(
      "x",
      new Error("boom"),
      {},
      { recordErrorEvent: recorderSpy as never },
    );
    expect(result).toBeNull();
  });

  it("never throws — recorder failure surfaces as null", async () => {
    recorderSpy.mockRejectedValueOnce(new Error("recorder exploded"));
    const result = await captureUnexpectedTrpcError(
      "x",
      new Error("original"),
      {},
      { recordErrorEvent: recorderSpy as never },
    );
    expect(result).toBeNull();
  });

  it("records raw Error instances with their constructor name", async () => {
    recorderSpy.mockResolvedValueOnce({ id: 100 });
    class WeirdError extends Error {
      constructor() {
        super("weird");
        this.name = "WeirdError";
      }
    }
    await captureUnexpectedTrpcError(
      "src",
      new WeirdError(),
      {},
      { recordErrorEvent: recorderSpy as never },
    );
    expect(recorderSpy.mock.calls[0][0].errorClass).toBe("WeirdError");
  });
});
