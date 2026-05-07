/**
 * Per-workspace, per-model pricing lookup for cost-tracking.
 *
 * PMB Phase 30.2 — replaces the registry-based `provider.getCostPerToken()`
 * pattern that was removed in Phase 29.6a's chat-stream migration.
 * Pricing now lives at the workspace level (per D-PR-3 in the providerRouter
 * ADR — workspace admin owns pricing the same way they own model selection
 * via the binding).
 *
 * Lookup order (`getModelPricing`):
 *
 *   1. Workspace-config row — `workspace_pricing_config` table, keyed on
 *      (workspaceId, modelRef). UNIQUE constraint guarantees at most one
 *      row per pair.
 *   2. Built-in defaults table — `BUILT_IN_PRICING` below. OpenAI +
 *      Anthropic public list-prices captured 2026-05-07.
 *   3. Fallback to `0` with a `console.warn`. Better than throwing — the
 *      chat continues; the cost field shows `0` but observability
 *      operators see the warning and can configure a row.
 *
 * The result projection includes `source` so callers can distinguish
 * "configured", "default", and "missing" states in their own audit logs.
 *
 * Currency stays USD-only at Phase 30.2.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { workspacePricingConfig } from "../../drizzle/schema";

export interface PricingProfile {
  /** USD per 1,000 input tokens. */
  inputCostPer1kTokens: number;
  /** USD per 1,000 output tokens. */
  outputCostPer1kTokens: number;
  currency: string;
  source: "workspace-config" | "built-in-default" | "fallback";
}

/**
 * Public list-prices captured 2026-05-07 from:
 *   - https://openai.com/api/pricing/
 *   - https://www.anthropic.com/pricing
 *
 * Re-verify when public-list-price docs shift; if the data is stale enough
 * that "good defaults" is misleading, a Phase-30+ refresh PR should
 * source-of-truth this table and add a CI check that exercises a
 * known model's price (regression guard against silent drift).
 */
export const BUILT_IN_PRICING: Readonly<Record<string, Omit<PricingProfile, "source">>> = Object.freeze({
  // OpenAI
  "gpt-4o": { inputCostPer1kTokens: 0.0025, outputCostPer1kTokens: 0.01, currency: "USD" },
  "gpt-4o-mini": { inputCostPer1kTokens: 0.00015, outputCostPer1kTokens: 0.0006, currency: "USD" },
  "gpt-4-turbo": { inputCostPer1kTokens: 0.01, outputCostPer1kTokens: 0.03, currency: "USD" },
  "gpt-4.1": { inputCostPer1kTokens: 0.002, outputCostPer1kTokens: 0.008, currency: "USD" },
  "gpt-4.1-mini": { inputCostPer1kTokens: 0.0004, outputCostPer1kTokens: 0.0016, currency: "USD" },
  "gpt-4.1-nano": { inputCostPer1kTokens: 0.0001, outputCostPer1kTokens: 0.0004, currency: "USD" },
  "o3": { inputCostPer1kTokens: 0.01, outputCostPer1kTokens: 0.04, currency: "USD" },
  "o4-mini": { inputCostPer1kTokens: 0.0011, outputCostPer1kTokens: 0.0044, currency: "USD" },
  "text-embedding-3-small": { inputCostPer1kTokens: 0.00002, outputCostPer1kTokens: 0, currency: "USD" },
  "text-embedding-3-large": { inputCostPer1kTokens: 0.00013, outputCostPer1kTokens: 0, currency: "USD" },
  // Anthropic
  "claude-opus-4-7": { inputCostPer1kTokens: 0.015, outputCostPer1kTokens: 0.075, currency: "USD" },
  "claude-sonnet-4-6": { inputCostPer1kTokens: 0.003, outputCostPer1kTokens: 0.015, currency: "USD" },
  "claude-haiku-4-5-20251001": { inputCostPer1kTokens: 0.0008, outputCostPer1kTokens: 0.004, currency: "USD" },
});

const FALLBACK_PRICING: PricingProfile = {
  inputCostPer1kTokens: 0,
  outputCostPer1kTokens: 0,
  currency: "USD",
  source: "fallback",
};

/**
 * Resolve pricing for `(workspaceId, modelRef)`.
 *
 * Never throws — always returns a `PricingProfile`. The `source` field
 * indicates which step of the lookup chain produced the result.
 */
export async function getModelPricing(
  workspaceId: number,
  modelRef: string,
): Promise<PricingProfile> {
  // Step 1 — workspace-config row
  const db = getDb();
  if (db) {
    try {
      const [row] = await db
        .select()
        .from(workspacePricingConfig)
        .where(
          and(
            eq(workspacePricingConfig.workspaceId, workspaceId),
            eq(workspacePricingConfig.modelRef, modelRef),
          ),
        )
        .limit(1);
      if (row) {
        return {
          inputCostPer1kTokens: Number(row.inputCostPer1kTokens),
          outputCostPer1kTokens: Number(row.outputCostPer1kTokens),
          currency: row.currency,
          source: "workspace-config",
        };
      }
    } catch (err) {
      // Pricing lookup is best-effort; never block the chat call. Log and
      // fall through to built-in defaults.
      console.warn(
        `[Pricing] workspace_pricing_config read failed for workspace=${workspaceId} modelRef=${modelRef}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Step 2 — built-in defaults
  const builtIn = BUILT_IN_PRICING[modelRef];
  if (builtIn) {
    return { ...builtIn, source: "built-in-default" };
  }

  // Step 3 — fallback (zeros)
  console.warn(
    `[Pricing] No pricing configured for workspace=${workspaceId} modelRef=${modelRef}; ` +
      `falling back to 0/0. Configure the row in workspace_pricing_config or extend BUILT_IN_PRICING.`,
  );
  return FALLBACK_PRICING;
}

/**
 * Compute USD cost from token counts + a `PricingProfile`. Pure function
 * — separated from the lookup so chat-stream can call it after the
 * stream completes without re-resolving pricing.
 */
export function computeCost(
  pricing: PricingProfile,
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens / 1000) * pricing.inputCostPer1kTokens +
    (outputTokens / 1000) * pricing.outputCostPer1kTokens
  );
}
