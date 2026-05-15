/**
 * Cross-region tRPC middleware factory tests — V2 Phase MR-1 Phase-2
 * eleventh slice. PR-V1-159.
 *
 * Covers:
 *   - Extractor returns workspaceId → guard called with that id.
 *   - Extractor returns null/undefined → guard NOT called; next() runs.
 *   - Extractor throws → next() runs (let handler surface its own error).
 *   - Guard throws CrossRegionAccessDeniedError → middleware throws
 *     TRPCError(FORBIDDEN) with cause.
 *   - Guard throws unrelated error → re-throws unchanged.
 *   - Successful guard → next() runs and result is returned.
 *   - Hard-rule compliance + barrel re-export.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";

import { createCrossRegionMiddleware } from "../../server/agent-studio/services/region/cross-region-trpc-middleware.js";
import { CrossRegionAccessDeniedError } from "../../server/agent-studio/services/region/types.js";

interface Input {
  workspaceId?: number | null;
}

describe("MR-1 Phase-2 — cross-region tRPC middleware factory", () => {
  it("calls guard with extracted workspaceId then next()", async () => {
    const guard = vi.fn();
    const mw = createCrossRegionMiddleware<Input>(
      (input) => input.workspaceId ?? null,
      { guard },
    );
    const next = vi.fn(async () => "ok");
    const result = await mw({ next, input: { workspaceId: 42 } });
    expect(result).toBe("ok");
    expect(guard).toHaveBeenCalledWith(42, expect.anything());
    expect(next).toHaveBeenCalledOnce();
  });

  it("extractor returns null → guard NOT called; next() runs", async () => {
    const guard = vi.fn();
    const mw = createCrossRegionMiddleware<Input>(
      (input) => input.workspaceId ?? null,
      { guard },
    );
    const next = vi.fn(async () => "ok");
    await mw({ next, input: { workspaceId: null } });
    expect(guard).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("extractor returns undefined → guard NOT called", async () => {
    const guard = vi.fn();
    const mw = createCrossRegionMiddleware<Input>(
      (input) => input.workspaceId,
      { guard },
    );
    const next = vi.fn(async () => "ok");
    await mw({ next, input: {} });
    expect(guard).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("extractor throws → next() runs (let handler surface validation error)", async () => {
    const guard = vi.fn();
    const mw = createCrossRegionMiddleware<Input>(() => {
      throw new Error("extractor blew up");
    }, { guard });
    const next = vi.fn(async () => "ok");
    await mw({ next, input: { workspaceId: 42 } });
    expect(guard).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("guard throws CrossRegionAccessDeniedError → middleware throws TRPCError(FORBIDDEN)", async () => {
    const mw = createCrossRegionMiddleware<Input>(
      (input) => input.workspaceId ?? null,
      {
        guard: () => {
          throw new CrossRegionAccessDeniedError("eu-west-1", "us-west-1", 42);
        },
      },
    );
    const next = vi.fn(async () => "ok");
    try {
      await mw({ next, input: { workspaceId: 42 } });
      throw new Error("expected to throw");
    } catch (err) {
      if (!(err instanceof TRPCError)) throw err;
      expect(err.code).toBe("FORBIDDEN");
      expect(err.cause).toBeInstanceOf(CrossRegionAccessDeniedError);
    }
    expect(next).not.toHaveBeenCalled();
  });

  it("guard throws unrelated error → re-throws unchanged", async () => {
    const original = new Error("totally unrelated");
    const mw = createCrossRegionMiddleware<Input>(
      (input) => input.workspaceId ?? null,
      {
        guard: () => {
          throw original;
        },
      },
    );
    await expect(
      mw({ next: async () => "x", input: { workspaceId: 42 } }),
    ).rejects.toBe(original);
  });

  it("source-scan: hard-rule compliance", () => {
    const file = resolve(
      __dirname,
      "../../server/agent-studio/services/region/cross-region-trpc-middleware.ts",
    );
    const src = readFileSync(file, "utf8");
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
    expect(/credential-resolver/.test(src)).toBe(false);
    expect(/dispatchMcpToolCall/.test(src)).toBe(false);
    expect(/neo4j-driver/.test(src)).toBe(false);
  });

  it("public-api barrel re-exports the middleware factory", () => {
    const file = resolve(
      __dirname,
      "../../server/agent-studio/services/region/public-api.ts",
    );
    const src = readFileSync(file, "utf8");
    expect(src).toContain("./cross-region-trpc-middleware.js");
    expect(src).toContain("createCrossRegionMiddleware");
    expect(src).toContain("CreateCrossRegionMiddlewareOptions");
  });
});
