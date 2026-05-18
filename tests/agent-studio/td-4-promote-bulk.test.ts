/**
 * T-D.4 bulk-promote — orchestrator + router-mount tests.
 *
 * Verifies:
 *   - Input validation: empty array throws BulkPromoteEmptyInputError;
 *     above cap throws BulkPromoteLimitExceededError
 *   - Happy-path: all ids promote, aggregate counts correct
 *   - Per-row bucketing: Already / NotPromotable / NotFound / generic
 *   - AsdbUnavailable mid-batch short-circuits (loop break)
 *   - Router file exposes promoteBulk + maps both input-validation
 *     errors to BAD_REQUEST + bucketing happens INSIDE the runner,
 *     not the router (the router catch only matches the 2 input errors)
 *   - Barrel re-exports the new surface
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const { promoteMock } = vi.hoisted(() => ({ promoteMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-promote-runner.js",
  () => ({
    runPromoteSemanticEnrichment: (...args: unknown[]) => promoteMock(...args),
    AsdbUnavailableForPromotionError: class extends Error {
      constructor() {
        super("ASDB unavailable");
        this.name = "AsdbUnavailableForPromotionError";
      }
    },
  }),
);

import {
  runPromoteBulk,
  ABSOLUTE_BULK_PROMOTE_LIMIT,
  BulkPromoteEmptyInputError,
  BulkPromoteLimitExceededError,
  EnrichmentProposalAlreadyPromotedError,
  EnrichmentProposalNotFoundError,
  EnrichmentProposalNotPromotableError,
  AsdbUnavailableForPromotionError,
} from "../../server/agent-studio/services/graph-enrichment/public-api";

const DIR = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-enrichment",
);
const BULK = join(DIR, "semantic-enrichment-promote-bulk.ts");
const ROUTER = join(DIR, "semantic-enrichment-router.ts");
const BARREL = join(DIR, "public-api.ts");

function read(p: string): string {
  return readFileSync(p, "utf8");
}

beforeEach(() => {
  promoteMock.mockReset();
});

// ────────────────────────────────────────────────────────────────────
// Constants + input-validation
// ────────────────────────────────────────────────────────────────────

describe("bulk-promote — constants", () => {
  it("ABSOLUTE_BULK_PROMOTE_LIMIT is 500 (matches the cron's per-tick cap)", () => {
    expect(ABSOLUTE_BULK_PROMOTE_LIMIT).toBe(500);
  });
});

describe("runPromoteBulk — input validation", () => {
  it("throws BulkPromoteEmptyInputError when proposalIds is []", async () => {
    await expect(runPromoteBulk({ proposalIds: [] })).rejects.toBeInstanceOf(
      BulkPromoteEmptyInputError,
    );
    expect(promoteMock).not.toHaveBeenCalled();
  });

  it("throws BulkPromoteLimitExceededError when length > 500", async () => {
    const ids = Array.from(
      { length: ABSOLUTE_BULK_PROMOTE_LIMIT + 1 },
      (_, i) => i + 1,
    );
    await expect(runPromoteBulk({ proposalIds: ids })).rejects.toBeInstanceOf(
      BulkPromoteLimitExceededError,
    );
    expect(promoteMock).not.toHaveBeenCalled();
  });

  it("accepts exactly 500 ids", async () => {
    const ids = Array.from(
      { length: ABSOLUTE_BULK_PROMOTE_LIMIT },
      (_, i) => i + 1,
    );
    // Reject every call so we don't generate 500 success rows; we only
    // care that the input-validation guard didn't trip.
    promoteMock.mockRejectedValue(
      new EnrichmentProposalNotFoundError(0),
    );
    const result = await runPromoteBulk({ proposalIds: ids });
    expect(result.inspected).toBe(500);
    expect(result.skippedNotFound).toBe(500);
  });
});

// ────────────────────────────────────────────────────────────────────
// Behavioral — per-row bucketing
// ────────────────────────────────────────────────────────────────────

describe("runPromoteBulk — bucketing", () => {
  it("happy path: 3/3 promoted; counts + per-row outcomes correct", async () => {
    promoteMock
      .mockResolvedValueOnce({
        correctionProposalId: 500,
        enrichmentProposalId: 100,
        correctionProposalRow: {} as never,
      })
      .mockResolvedValueOnce({
        correctionProposalId: 501,
        enrichmentProposalId: 101,
        correctionProposalRow: {} as never,
      })
      .mockResolvedValueOnce({
        correctionProposalId: 502,
        enrichmentProposalId: 102,
        correctionProposalRow: {} as never,
      });

    const result = await runPromoteBulk({ proposalIds: [100, 101, 102] });
    expect(result.inspected).toBe(3);
    expect(result.promoted).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.rows).toEqual([
      { proposalId: 100, outcome: "promoted", correctionProposalId: 500 },
      { proposalId: 101, outcome: "promoted", correctionProposalId: 501 },
      { proposalId: 102, outcome: "promoted", correctionProposalId: 502 },
    ]);
  });

  it("buckets AlreadyPromotedError; loop continues", async () => {
    promoteMock
      .mockRejectedValueOnce(new EnrichmentProposalAlreadyPromotedError(100))
      .mockResolvedValueOnce({
        correctionProposalId: 501,
        enrichmentProposalId: 101,
        correctionProposalRow: {} as never,
      });

    const result = await runPromoteBulk({ proposalIds: [100, 101] });
    expect(result.skippedAlreadyPromoted).toBe(1);
    expect(result.promoted).toBe(1);
    expect(result.rows[0]?.outcome).toBe("skipped_already_promoted");
    expect(result.rows[1]?.outcome).toBe("promoted");
  });

  it("buckets NotPromotableError; preserves errorMessage", async () => {
    promoteMock.mockRejectedValueOnce(
      new EnrichmentProposalNotPromotableError(
        100,
        "rejected_below_threshold",
      ),
    );

    const result = await runPromoteBulk({ proposalIds: [100] });
    expect(result.skippedNotPromotable).toBe(1);
    expect(result.rows[0]?.outcome).toBe("skipped_not_promotable");
    expect(result.rows[0]?.errorMessage).toMatch(/rejected_below_threshold/);
  });

  it("buckets NotFoundError", async () => {
    promoteMock.mockRejectedValueOnce(
      new EnrichmentProposalNotFoundError(100),
    );

    const result = await runPromoteBulk({ proposalIds: [100] });
    expect(result.skippedNotFound).toBe(1);
    expect(result.rows[0]?.outcome).toBe("skipped_not_found");
  });

  it("buckets generic Error into failed; loop continues", async () => {
    promoteMock
      .mockRejectedValueOnce(new Error("transient blip"))
      .mockResolvedValueOnce({
        correctionProposalId: 501,
        enrichmentProposalId: 101,
        correctionProposalRow: {} as never,
      });

    const result = await runPromoteBulk({ proposalIds: [100, 101] });
    expect(result.failed).toBe(1);
    expect(result.promoted).toBe(1);
    expect(result.rows[0]?.outcome).toBe("failed");
    expect(result.rows[0]?.errorMessage).toBe("transient blip");
  });

  it("AsdbUnavailable mid-batch short-circuits (1 row recorded, no further calls)", async () => {
    promoteMock.mockRejectedValueOnce(new AsdbUnavailableForPromotionError());

    const result = await runPromoteBulk({
      proposalIds: [100, 101, 102],
    });
    expect(result.inspected).toBe(3);
    expect(result.failed).toBe(1);
    expect(result.promoted).toBe(0);
    expect(result.rows).toHaveLength(1);
    expect(promoteMock).toHaveBeenCalledTimes(1);
  });

  it("decidedByUserId/proposedByAgentId pass through to single-promote", async () => {
    promoteMock.mockResolvedValueOnce({
      correctionProposalId: 500,
      enrichmentProposalId: 100,
      correctionProposalRow: {} as never,
    });
    await runPromoteBulk({
      proposalIds: [100],
      decidedByUserId: 42,
      proposedByAgentId: 7,
      decisionRationale: "manual batch",
    });
    expect(promoteMock.mock.calls[0]?.[0]).toMatchObject({
      proposalId: 100,
      decidedByUserId: 42,
      proposedByAgentId: 7,
      decisionRationale: "manual batch",
    });
  });

  it("invokedAt is a valid ISO timestamp", async () => {
    promoteMock.mockResolvedValueOnce({
      correctionProposalId: 500,
      enrichmentProposalId: 100,
      correctionProposalRow: {} as never,
    });
    const result = await runPromoteBulk({ proposalIds: [100] });
    expect(new Date(result.invokedAt).toISOString()).toBe(result.invokedAt);
  });
});

// ────────────────────────────────────────────────────────────────────
// Source-scan — router + barrel + bulk
// ────────────────────────────────────────────────────────────────────

describe("source-scan — wiring", () => {
  it("bulk module never imports neo4j-driver / openrouter / dispatchMcpToolCall", () => {
    const src = read(BULK);
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
    expect(stripped).not.toMatch(/from\s+["']neo4j-driver["']/);
    expect(stripped).not.toMatch(/from\s+["'][^"']*openrouter[^"']*["']/);
    expect(stripped).not.toMatch(/\bdispatchMcpToolCall\s*\(/);
  });

  it("router mounts promoteBulk under adminProcedure", () => {
    const src = read(ROUTER);
    expect(src).toMatch(/promoteBulk:\s*adminProcedure/);
    expect(src).toMatch(/runPromoteBulk\(/);
  });

  it("router maps BulkPromoteEmptyInputError → BAD_REQUEST", () => {
    const src = read(ROUTER);
    expect(src).toMatch(
      /BulkPromoteEmptyInputError[\s\S]*?code:\s*"BAD_REQUEST"/,
    );
  });

  it("router maps BulkPromoteLimitExceededError → BAD_REQUEST", () => {
    const src = read(ROUTER);
    expect(src).toMatch(
      /BulkPromoteLimitExceededError[\s\S]*?code:\s*"BAD_REQUEST"/,
    );
  });

  it("router enforces input z-shape: proposalIds.min(1) + positive int ids", () => {
    const src = read(ROUTER);
    expect(src).toMatch(
      /proposalIds:\s*z\.array\(z\.number\(\)\.int\(\)\.positive\(\)\)\.min\(1\)/,
    );
  });

  it("barrel re-exports the bulk surface", () => {
    const src = read(BARREL);
    for (const sym of [
      "runPromoteBulk",
      "ABSOLUTE_BULK_PROMOTE_LIMIT",
      "BulkPromoteEmptyInputError",
      "BulkPromoteLimitExceededError",
      "BulkPromoteInput",
      "BulkPromoteResult",
      "BulkPromoteRowOutcome",
      "BulkPromoteRowResult",
    ]) {
      expect(src, `barrel must re-export ${sym}`).toMatch(
        new RegExp(`\\b${sym}\\b`),
      );
    }
  });
});
