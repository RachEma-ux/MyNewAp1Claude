/**
 * Pricing module — PMB Phase 30.2 tests.
 *
 * Locks the lookup-chain contract:
 *
 *   1. Workspace-config row → returns it with `source: "workspace-config"`.
 *   2. No workspace row + matching built-in → returns built-in with
 *      `source: "built-in-default"`.
 *   3. No workspace row + no built-in → returns zeros with
 *      `source: "fallback"` and emits a console.warn.
 *
 * Plus locks `computeCost` as a pure function (no DB).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "../db";
import {
  getModelPricing,
  computeCost,
  BUILT_IN_PRICING,
  type PricingProfile,
} from "./pricing";

const mockedGetDb = getDb as unknown as ReturnType<typeof vi.fn>;

function makeDbWithRow(row: unknown) {
  return {
    select: vi.fn(() => {
      const b: any = {};
      b.from = vi.fn().mockReturnValue(b);
      b.where = vi.fn().mockReturnValue(b);
      b.limit = vi.fn().mockResolvedValue(row ? [row] : []);
      return b;
    }),
  };
}

beforeEach(() => {
  mockedGetDb.mockReset();
});

describe("getModelPricing — lookup chain", () => {
  it("returns the workspace-config row when one exists", async () => {
    mockedGetDb.mockReturnValue(
      makeDbWithRow({
        workspaceId: 7,
        modelRef: "gpt-4o-mini",
        inputCostPer1kTokens: "0.99",
        outputCostPer1kTokens: "1.99",
        currency: "USD",
      }),
    );

    const result = await getModelPricing(7, "gpt-4o-mini");

    expect(result).toEqual({
      inputCostPer1kTokens: 0.99,
      outputCostPer1kTokens: 1.99,
      currency: "USD",
      source: "workspace-config",
    });
  });

  it("falls through to BUILT_IN_PRICING when no workspace row exists", async () => {
    mockedGetDb.mockReturnValue(makeDbWithRow(null));

    const result = await getModelPricing(7, "gpt-4o-mini");

    expect(result.source).toBe("built-in-default");
    expect(result.inputCostPer1kTokens).toBe(BUILT_IN_PRICING["gpt-4o-mini"]!.inputCostPer1kTokens);
    expect(result.outputCostPer1kTokens).toBe(BUILT_IN_PRICING["gpt-4o-mini"]!.outputCostPer1kTokens);
    expect(result.currency).toBe("USD");
  });

  it("falls through to BUILT_IN_PRICING for an Anthropic model", async () => {
    mockedGetDb.mockReturnValue(makeDbWithRow(null));

    const result = await getModelPricing(7, "claude-sonnet-4-6");

    expect(result.source).toBe("built-in-default");
    expect(result.inputCostPer1kTokens).toBe(0.003);
    expect(result.outputCostPer1kTokens).toBe(0.015);
  });

  it("falls back to zeros for an unknown model with a warn", async () => {
    mockedGetDb.mockReturnValue(makeDbWithRow(null));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await getModelPricing(7, "completely-made-up-model");

    expect(result).toEqual({
      inputCostPer1kTokens: 0,
      outputCostPer1kTokens: 0,
      currency: "USD",
      source: "fallback",
    });
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toMatch(/No pricing configured/);

    warnSpy.mockRestore();
  });

  it("falls through to defaults when getDb returns null (no DB available)", async () => {
    mockedGetDb.mockReturnValue(null);

    const result = await getModelPricing(7, "gpt-4o");

    expect(result.source).toBe("built-in-default");
    expect(result.inputCostPer1kTokens).toBe(0.0025);
  });

  it("falls through to defaults when the DB query throws", async () => {
    mockedGetDb.mockReturnValue({
      select: vi.fn(() => {
        const b: any = {};
        b.from = vi.fn().mockReturnValue(b);
        b.where = vi.fn().mockReturnValue(b);
        b.limit = vi.fn().mockRejectedValue(new Error("connection lost"));
        return b;
      }),
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await getModelPricing(7, "gpt-4o-mini");

    expect(result.source).toBe("built-in-default");
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toMatch(/workspace_pricing_config read failed/);

    warnSpy.mockRestore();
  });
});

describe("BUILT_IN_PRICING — frozen contract", () => {
  it("is frozen", () => {
    expect(Object.isFrozen(BUILT_IN_PRICING)).toBe(true);
  });

  it("contains the OpenAI + Anthropic models documented in PHASE_30_EXECUTION_PLAN.md §30.2b", () => {
    const required = [
      // OpenAI
      "gpt-4o", "gpt-4o-mini", "gpt-4-turbo",
      "text-embedding-3-small", "text-embedding-3-large",
      // Anthropic
      "claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5-20251001",
    ];
    for (const m of required) {
      expect(BUILT_IN_PRICING, `missing required model: ${m}`).toHaveProperty(m);
    }
  });

  it("all entries carry currency 'USD' (Phase 30.2 scope)", () => {
    for (const [model, profile] of Object.entries(BUILT_IN_PRICING)) {
      expect(profile.currency, `${model} currency`).toBe("USD");
    }
  });
});

describe("computeCost — pure function", () => {
  const sampleProfile: PricingProfile = {
    inputCostPer1kTokens: 0.0025,
    outputCostPer1kTokens: 0.01,
    currency: "USD",
    source: "built-in-default",
  };

  it("computes cost = (inputTokens/1000)*inputRate + (outputTokens/1000)*outputRate", () => {
    const cost = computeCost(sampleProfile, 1000, 500);
    // (1000/1000) * 0.0025 + (500/1000) * 0.01 = 0.0025 + 0.005 = 0.0075
    expect(cost).toBeCloseTo(0.0075, 6);
  });

  it("returns 0 for zero tokens", () => {
    expect(computeCost(sampleProfile, 0, 0)).toBe(0);
  });

  it("returns 0 for the fallback (zero-priced) profile", () => {
    const fallback: PricingProfile = {
      inputCostPer1kTokens: 0,
      outputCostPer1kTokens: 0,
      currency: "USD",
      source: "fallback",
    };
    expect(computeCost(fallback, 9999, 9999)).toBe(0);
  });

  it("computes cost with embeddings-shaped profile (output rate = 0)", () => {
    const embedding: PricingProfile = {
      inputCostPer1kTokens: 0.00002,
      outputCostPer1kTokens: 0,
      currency: "USD",
      source: "built-in-default",
    };
    expect(computeCost(embedding, 100_000, 0)).toBeCloseTo(0.002, 6);
  });
});
