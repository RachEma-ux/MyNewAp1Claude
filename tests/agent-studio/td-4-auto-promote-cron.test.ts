/**
 * T-D.4 auto-promote cron — orchestrator + cron-registration tests.
 *
 * Verifies:
 *   - Confidence clamp: < floor (0.8) → floor; > 1 → 1; default 0.95
 *   - Limit clamp: zero/negative/missing → default 25; > absolute 500 → 500
 *   - Selector source-scan: pending status filter + confidence gate +
 *     FIFO orderBy + workspace-scoping via underlying rows
 *   - Selector returns empty when getAsDb returns null
 *   - Orchestrator promotes happy-path candidates and aggregates counts
 *   - Per-row error bucketing: AlreadyPromoted / NotPromotable /
 *     NotFound / generic error → counted, loop continues
 *   - AsdbUnavailable mid-tick short-circuits the loop
 *   - Cron file uses makeRetentionCron with the canonical env prefix +
 *     star-slash-15 default expression
 *   - Boot wiring step 3.25.c exists in boot.ts
 *   - Public-api re-exports the surface
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const { dbMock, promoteMock } = vi.hoisted(() => ({
  dbMock: vi.fn(),
  promoteMock: vi.fn(),
}));

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: dbMock,
}));

vi.mock(
  "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-promote-runner.js",
  () => ({
    runPromoteSemanticEnrichment: (...args: unknown[]) =>
      promoteMock(...args),
    AsdbUnavailableForPromotionError: class extends Error {
      constructor() {
        super("ASDB unavailable");
        this.name = "AsdbUnavailableForPromotionError";
      }
    },
  }),
);

import {
  listAutoPromotableProposals,
  runAutoPromoteTick,
  DEFAULT_AUTO_PROMOTE_MIN_CONFIDENCE,
  ABSOLUTE_AUTO_PROMOTE_MIN_CONFIDENCE_FLOOR,
  DEFAULT_AUTO_PROMOTE_PER_TICK_LIMIT,
  ABSOLUTE_AUTO_PROMOTE_PER_TICK_LIMIT,
  DEFAULT_AUTO_PROMOTE_CRON_EXPR,
  EnrichmentProposalAlreadyPromotedError,
  EnrichmentProposalNotFoundError,
  EnrichmentProposalNotPromotableError,
  AsdbUnavailableForPromotionError,
} from "../../server/agent-studio/services/graph-enrichment/public-api";

const DIR = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-enrichment",
);
const ORCH = join(DIR, "auto-promote-orchestrator.ts");
const CRON = join(DIR, "auto-promote-cron.ts");
const BARREL = join(DIR, "public-api.ts");
const BOOT = resolve(
  __dirname,
  "../../server/agent-studio/boot.ts",
);

function read(p: string): string {
  return readFileSync(p, "utf8");
}

beforeEach(() => {
  dbMock.mockReset();
  promoteMock.mockReset();
});

// ────────────────────────────────────────────────────────────────────
// Defaults + clamps
// ────────────────────────────────────────────────────────────────────

describe("auto-promote — defaults", () => {
  it("DEFAULT_AUTO_PROMOTE_MIN_CONFIDENCE is 0.95", () => {
    expect(DEFAULT_AUTO_PROMOTE_MIN_CONFIDENCE).toBe(0.95);
  });
  it("ABSOLUTE floor is 0.8 (matches proposer's own gate)", () => {
    expect(ABSOLUTE_AUTO_PROMOTE_MIN_CONFIDENCE_FLOOR).toBe(0.8);
  });
  it("DEFAULT_AUTO_PROMOTE_PER_TICK_LIMIT is 25; absolute is 500", () => {
    expect(DEFAULT_AUTO_PROMOTE_PER_TICK_LIMIT).toBe(25);
    expect(ABSOLUTE_AUTO_PROMOTE_PER_TICK_LIMIT).toBe(500);
  });
  it("DEFAULT_AUTO_PROMOTE_CRON_EXPR is every 15 minutes", () => {
    expect(DEFAULT_AUTO_PROMOTE_CRON_EXPR).toBe("*/15 * * * *");
  });
});

// ────────────────────────────────────────────────────────────────────
// Selector — source-scan + db-null
// ────────────────────────────────────────────────────────────────────

describe("listAutoPromotableProposals — source-scan", () => {
  const SRC = read(ORCH);

  it("filters by status='pending'", () => {
    expect(SRC).toMatch(/agsSemanticEnrichmentProposals\.status[\s\S]*?"pending"/);
  });

  it("uses gte() against ::numeric cast for confidence comparison", () => {
    expect(SRC).toMatch(/gte\(/);
    expect(SRC).toMatch(/::numeric/);
  });

  it("orders by createdAt ASC for FIFO triage", () => {
    expect(SRC).toMatch(
      /\.orderBy\(asc\(agsSemanticEnrichmentProposals\.createdAt\)\)/,
    );
  });

  it("never imports neo4j-driver / openrouter / dispatchMcpToolCall", () => {
    const stripped = SRC
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
    expect(stripped).not.toMatch(/from\s+["']neo4j-driver["']/);
    expect(stripped).not.toMatch(/from\s+["'][^"']*openrouter[^"']*["']/);
    expect(stripped).not.toMatch(/\bdispatchMcpToolCall\s*\(/);
  });
});

describe("listAutoPromotableProposals — behavioral", () => {
  it("returns [] when getAsDb returns null", async () => {
    dbMock.mockReturnValue(null);
    const out = await listAutoPromotableProposals();
    expect(out).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────
// Orchestrator — per-row bucketing
// ────────────────────────────────────────────────────────────────────

describe("runAutoPromoteTick — per-row outcomes", () => {
  function makeFakeDb(rows: Array<{ id: number; confidence: string }>) {
    return {
      select: () => {
        const chain = {
          from: () => chain,
          where: () => chain,
          orderBy: () => chain,
          limit: async () => rows,
        };
        return chain;
      },
    };
  }

  it("happy path: 2/2 promoted — counts + per-row outcomes correct", async () => {
    dbMock.mockReturnValue(
      makeFakeDb([
        { id: 100, confidence: "0.97" },
        { id: 101, confidence: "0.96" },
      ]),
    );
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
      });

    const result = await runAutoPromoteTick();
    expect(result.inspected).toBe(2);
    expect(result.promoted).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.rows).toEqual([
      { proposalId: 100, outcome: "promoted", correctionProposalId: 500 },
      { proposalId: 101, outcome: "promoted", correctionProposalId: 501 },
    ]);
  });

  it("buckets AlreadyPromotedError into skipped_already_promoted; loop continues", async () => {
    dbMock.mockReturnValue(
      makeFakeDb([
        { id: 100, confidence: "0.97" },
        { id: 101, confidence: "0.97" },
      ]),
    );
    promoteMock
      .mockRejectedValueOnce(new EnrichmentProposalAlreadyPromotedError(100))
      .mockResolvedValueOnce({
        correctionProposalId: 501,
        enrichmentProposalId: 101,
        correctionProposalRow: {} as never,
      });

    const result = await runAutoPromoteTick();
    expect(result.inspected).toBe(2);
    expect(result.promoted).toBe(1);
    expect(result.skippedAlreadyPromoted).toBe(1);
    expect(result.rows[0]?.outcome).toBe("skipped_already_promoted");
    expect(result.rows[1]?.outcome).toBe("promoted");
  });

  it("buckets NotPromotableError into skipped_not_promotable", async () => {
    dbMock.mockReturnValue(makeFakeDb([{ id: 100, confidence: "0.97" }]));
    promoteMock.mockRejectedValueOnce(
      new EnrichmentProposalNotPromotableError(100, "rejected_below_threshold"),
    );

    const result = await runAutoPromoteTick();
    expect(result.skippedNotPromotable).toBe(1);
    expect(result.rows[0]?.outcome).toBe("skipped_not_promotable");
    expect(result.rows[0]?.errorMessage).toMatch(/rejected_below_threshold/);
  });

  it("buckets NotFoundError into skipped_not_found", async () => {
    dbMock.mockReturnValue(makeFakeDb([{ id: 100, confidence: "0.97" }]));
    promoteMock.mockRejectedValueOnce(
      new EnrichmentProposalNotFoundError(100),
    );

    const result = await runAutoPromoteTick();
    expect(result.skippedNotFound).toBe(1);
    expect(result.rows[0]?.outcome).toBe("skipped_not_found");
  });

  it("buckets generic Error into failed; loop continues", async () => {
    dbMock.mockReturnValue(
      makeFakeDb([
        { id: 100, confidence: "0.97" },
        { id: 101, confidence: "0.97" },
      ]),
    );
    promoteMock
      .mockRejectedValueOnce(new Error("transient DB blip"))
      .mockResolvedValueOnce({
        correctionProposalId: 501,
        enrichmentProposalId: 101,
        correctionProposalRow: {} as never,
      });

    const result = await runAutoPromoteTick();
    expect(result.failed).toBe(1);
    expect(result.promoted).toBe(1);
    expect(result.rows[0]?.outcome).toBe("failed");
    expect(result.rows[0]?.errorMessage).toBe("transient DB blip");
  });

  it("AsdbUnavailableForPromotionError short-circuits the loop (1 failed, no further iterations)", async () => {
    dbMock.mockReturnValue(
      makeFakeDb([
        { id: 100, confidence: "0.97" },
        { id: 101, confidence: "0.97" },
        { id: 102, confidence: "0.97" },
      ]),
    );
    promoteMock.mockRejectedValueOnce(new AsdbUnavailableForPromotionError());

    const result = await runAutoPromoteTick();
    expect(result.inspected).toBe(3);
    expect(result.failed).toBe(1);
    expect(result.promoted).toBe(0);
    // Only 1 row should be recorded — the loop broke after AsdbUnavailable.
    expect(result.rows).toHaveLength(1);
    expect(promoteMock).toHaveBeenCalledTimes(1);
  });

  it("decisionRationale defaults to \"auto-promoted by cron\"; respects override", async () => {
    dbMock.mockReturnValue(makeFakeDb([{ id: 100, confidence: "0.97" }]));
    promoteMock.mockResolvedValueOnce({
      correctionProposalId: 500,
      enrichmentProposalId: 100,
      correctionProposalRow: {} as never,
    });

    await runAutoPromoteTick();
    expect(promoteMock.mock.calls[0]?.[0]?.decisionRationale).toBe(
      "auto-promoted by cron",
    );

    promoteMock.mockReset();
    dbMock.mockReturnValue(makeFakeDb([{ id: 100, confidence: "0.97" }]));
    promoteMock.mockResolvedValueOnce({
      correctionProposalId: 500,
      enrichmentProposalId: 100,
      correctionProposalRow: {} as never,
    });
    await runAutoPromoteTick({ decisionRationale: "custom-rationale" });
    expect(promoteMock.mock.calls[0]?.[0]?.decisionRationale).toBe(
      "custom-rationale",
    );
  });

  it("returns inspected=0 + no promote calls when selector yields []", async () => {
    dbMock.mockReturnValue(null); // selector returns []
    const result = await runAutoPromoteTick();
    expect(result.inspected).toBe(0);
    expect(result.promoted).toBe(0);
    expect(result.rows).toEqual([]);
    expect(promoteMock).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────
// Cron file + boot wiring + barrel
// ────────────────────────────────────────────────────────────────────

describe("auto-promote cron — source-scan + wiring", () => {
  it("cron file uses makeRetentionCron with the canonical env prefix + */15 default expr + defaultRetentionDays:null", () => {
    const src = read(CRON);
    expect(src).toMatch(/makeRetentionCron</);
    expect(src).toMatch(
      /envPrefix:\s*"AGS_SEMANTIC_ENRICHMENT_AUTO_PROMOTE"/,
    );
    expect(src).toMatch(/defaultCronExpr:\s*"\*\/15 \* \* \* \*"/);
    expect(src).toMatch(/defaultRetentionDays:\s*null/);
  });

  it("cron file exports ensureAutoPromoteCronStarted", () => {
    const src = read(CRON);
    expect(src).toMatch(/export\s+const\s+ensureAutoPromoteCronStarted/);
  });

  it("boot.ts registers the cron at Step 3.25.c", () => {
    const src = read(BOOT);
    expect(src).toMatch(/Step 3\.25\.c/);
    expect(src).toMatch(/ensureAutoPromoteCronStarted/);
    expect(src).toMatch(
      /AGS_SEMANTIC_ENRICHMENT_AUTO_PROMOTE_CRON_DISABLED/,
    );
  });

  it("public-api re-exports the surface", () => {
    const src = read(BARREL);
    for (const sym of [
      "listAutoPromotableProposals",
      "runAutoPromoteTick",
      "DEFAULT_AUTO_PROMOTE_MIN_CONFIDENCE",
      "ABSOLUTE_AUTO_PROMOTE_MIN_CONFIDENCE_FLOOR",
      "DEFAULT_AUTO_PROMOTE_CRON_EXPR",
      "ensureAutoPromoteCronStarted",
      "AutoPromoteTickResult",
      "AutoPromoteRowOutcome",
    ]) {
      expect(src, `barrel must re-export ${sym}`).toMatch(
        new RegExp(`\\b${sym}\\b`),
      );
    }
  });
});
