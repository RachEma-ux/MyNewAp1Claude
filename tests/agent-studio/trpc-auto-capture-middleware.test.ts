/**
 * Phase 22 — auto-capture middleware on every tRPC procedure.
 *
 * Verifies the middleware-mount: every error thrown by any procedure
 * (publicProcedure, protectedProcedure, governedProcedure, etc.) flows
 * through captureUnexpectedTrpcError without per-router opt-in.
 *
 * The classifier inside the helper still filters expected operator-side
 * codes — this test asserts the wiring shape, not the classifier rules
 * (those are covered in workspace-observability-trpc-error-capture.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { captureMock } = vi.hoisted(() => ({
  captureMock: vi.fn(async () => null),
}));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/public-api",
  () => ({
    captureUnexpectedTrpcError: captureMock,
  }),
);

import { TRPCError } from "@trpc/server";
import {
  router,
  publicProcedure,
  protectedProcedure,
} from "../../server/_core/trpc";

beforeEach(() => {
  captureMock.mockReset();
  captureMock.mockResolvedValue(null);
});

describe("auto-capture tRPC middleware", () => {
  it("captures errors from publicProcedure", async () => {
    const r = router({
      boom: publicProcedure.query(() => {
        throw new Error("kaboom");
      }),
    });
    const caller = r.createCaller({} as never);
    await expect(caller.boom()).rejects.toThrow(/kaboom/);
    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(captureMock.mock.calls[0][0]).toBe("trpc.boom");
    expect(captureMock.mock.calls[0][1]).toBeInstanceOf(Error);
  });

  it("captures TRPCError from publicProcedure (classifier filters happen inside helper)", async () => {
    const r = router({
      tea: publicProcedure.query(() => {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "real" });
      }),
    });
    const caller = r.createCaller({} as never);
    await expect(caller.tea()).rejects.toBeInstanceOf(TRPCError);
    expect(captureMock).toHaveBeenCalledTimes(1);
    const err = captureMock.mock.calls[0][1];
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("forwards trpcPath + type metadata", async () => {
    const r = router({
      nested: router({
        deep: publicProcedure.mutation(() => {
          throw new Error("from deep");
        }),
      }),
    });
    const caller = r.createCaller({} as never);
    await expect(caller.nested.deep()).rejects.toThrow(/from deep/);
    expect(captureMock.mock.calls[0][0]).toBe("trpc.nested.deep");
    const ctx = captureMock.mock.calls[0][2] as {
      metadata: { trpcPath: string; type: string };
    };
    expect(ctx.metadata.trpcPath).toBe("nested.deep");
    expect(ctx.metadata.type).toBe("mutation");
  });

  it("does not invoke capture on successful calls", async () => {
    const r = router({
      ok: publicProcedure.query(() => ({ ok: true })),
    });
    const caller = r.createCaller({} as never);
    const result = await caller.ok();
    expect(result).toEqual({ ok: true });
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("captures errors from protectedProcedure (auth failure path)", async () => {
    const r = router({
      auth: protectedProcedure.query(() => "should not reach"),
    });
    const caller = r.createCaller({ user: undefined } as never);
    await expect(caller.auth()).rejects.toBeInstanceOf(TRPCError);
    // The UNAUTHORIZED throw in requireUser middleware also flows through
    // autoCaptureErrors (it runs first in the chain). The classifier in
    // captureUnexpectedTrpcError filters UNAUTHORIZED out from the
    // recorder, but the middleware-mount itself still calls the helper —
    // the filter is the helper's responsibility.
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it("forwards userId from ctx when present", async () => {
    const r = router({
      authed: protectedProcedure.query(() => {
        throw new Error("user-context error");
      }),
    });
    const caller = r.createCaller({ user: { id: 42 } } as never);
    await expect(caller.authed()).rejects.toThrow(/user-context error/);
    const ctx = captureMock.mock.calls[0][2] as { userId: number };
    expect(ctx.userId).toBe(42);
  });
});
