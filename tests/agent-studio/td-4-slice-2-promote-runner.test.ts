/**
 * T-D.4 slice 2 — promote-runner + router mutation.
 *
 * Verifies:
 *   - Runner throws `AsdbUnavailableForPromotionError` when db is null
 *   - Runner threads the bridge's reader/writer interfaces against
 *     ASDB via Drizzle (source-scan + happy-path with fake db)
 *   - Router `promote` mutation maps bridge errors to TRPCError codes:
 *     - `EnrichmentProposalNotFoundError`        → NOT_FOUND
 *     - `EnrichmentProposalAlreadyPromotedError` → CONFLICT
 *     - `EnrichmentProposalNotPromotableError`   → CONFLICT
 *     - `AsdbUnavailableForPromotionError`       → INTERNAL_SERVER_ERROR
 *     - other errors re-thrown
 *   - Source-scan: runner file, router mount, public-api re-exports
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const { dbMock } = vi.hoisted(() => ({ dbMock: vi.fn() }));
vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: dbMock,
}));

import {
  AsdbUnavailableForPromotionError,
  runPromoteSemanticEnrichment,
} from "../../server/agent-studio/services/graph-enrichment/public-api";

const DIR = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-enrichment",
);
const RUNNER = join(DIR, "semantic-enrichment-promote-runner.ts");
const ROUTER = join(DIR, "semantic-enrichment-router.ts");
const BARREL = join(DIR, "public-api.ts");

function read(p: string): string {
  return readFileSync(p, "utf8");
}

// ────────────────────────────────────────────────────────────────────
// Source-scan
// ────────────────────────────────────────────────────────────────────

describe("T-D.4 slice 2 — promote-runner source-scan", () => {
  const SRC = read(RUNNER);

  it("declares runPromoteSemanticEnrichment + AsdbUnavailableForPromotionError", () => {
    expect(SRC).toMatch(/function\s+runPromoteSemanticEnrichment\s*\(/);
    expect(SRC).toMatch(/class\s+AsdbUnavailableForPromotionError/);
  });

  it("composes the 4 Drizzle writers (correction insert, status update, decision insert) + the read via the store", () => {
    expect(SRC).toMatch(/insert\(agsGraphCorrectionProposals\)/);
    expect(SRC).toMatch(/update\(agsSemanticEnrichmentProposals\)/);
    expect(SRC).toMatch(/insert\(agsSemanticEnrichmentDecisions\)/);
    expect(SRC).toMatch(/createSemanticEnrichmentStore/);
    expect(SRC).toMatch(/getProposalDetail/);
  });

  it("status writer uses pending-status guard for race detection", () => {
    expect(SRC).toMatch(
      /agsSemanticEnrichmentProposals\.status[\s\S]*?"pending"/,
    );
  });

  it("decision rationale prefixes correctionProposalId for trace", () => {
    expect(SRC).toMatch(/promoted → correctionProposalId=/);
  });

  it("no neo4j-driver / openrouter / dispatchMcpToolCall imports", () => {
    const stripped = SRC
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
    expect(stripped).not.toMatch(/from\s+["']neo4j-driver["']/);
    expect(stripped).not.toMatch(/from\s+["'][^"']*openrouter[^"']*["']/);
    expect(stripped).not.toMatch(/\bdispatchMcpToolCall\s*\(/);
  });
});

describe("T-D.4 slice 2 — router mount + barrel", () => {
  it("router declares `promote` adminProcedure.mutation that calls runPromoteSemanticEnrichment", () => {
    const src = read(ROUTER);
    expect(src).toMatch(/promote:\s*adminProcedure[\s\S]*?\.mutation\(/);
    expect(src).toMatch(/runPromoteSemanticEnrichment\s*\(/);
  });

  it("router maps all 4 bridge error classes to TRPCError codes", () => {
    const src = read(ROUTER);
    expect(src).toMatch(/EnrichmentProposalNotFoundError[\s\S]*?NOT_FOUND/);
    expect(src).toMatch(
      /EnrichmentProposalAlreadyPromotedError[\s\S]*?CONFLICT/,
    );
    expect(src).toMatch(
      /EnrichmentProposalNotPromotableError[\s\S]*?CONFLICT/,
    );
    expect(src).toMatch(
      /AsdbUnavailableForPromotionError[\s\S]*?INTERNAL_SERVER_ERROR/,
    );
  });

  it("public-api re-exports the runner surface", () => {
    const src = read(BARREL);
    for (const sym of [
      "runPromoteSemanticEnrichment",
      "AsdbUnavailableForPromotionError",
      "RunPromoteSemanticEnrichmentOptions",
    ]) {
      expect(src, `barrel must re-export ${sym}`).toMatch(
        new RegExp(`\\b${sym}\\b`),
      );
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// Runner behavioral — ASDB-null path
// ────────────────────────────────────────────────────────────────────

describe("runPromoteSemanticEnrichment — ASDB unavailable", () => {
  it("throws AsdbUnavailableForPromotionError when getAsDb returns null + no test seam db", async () => {
    dbMock.mockReturnValue(null);
    await expect(
      runPromoteSemanticEnrichment({ proposalId: 1 }),
    ).rejects.toBeInstanceOf(AsdbUnavailableForPromotionError);
  });
});

// ────────────────────────────────────────────────────────────────────
// Runner behavioral — happy path via fake DB
// ────────────────────────────────────────────────────────────────────

describe("runPromoteSemanticEnrichment — happy path through fake DB", () => {
  /**
   * Build a minimal fake DB that:
   *   - returns the source proposal row on `.select().from(proposals).where().limit(1)`
   *   - returns `{id: 500}` on `.insert(correctionProposals).values().returning()`
   *   - returns `[{id: 100}]` on `.update(proposals).set().where().returning()`
   *   - accepts the audit `.insert(decisions).values()` call
   */
  function makeFakeDb(opts: {
    proposalRow: Record<string, unknown> | null;
    updateReturning: Array<{ id: number }>;
  }) {
    const calls: string[] = [];
    return {
      calls,
      db: {
        select: (_proj?: unknown) => {
          const chain = {
            from: (_t: unknown) => chain,
            where: (_c: unknown) => chain,
            limit: async (_n: number) => {
              calls.push("select");
              return opts.proposalRow ? [opts.proposalRow] : [];
            },
          };
          return chain;
        },
        insert: (_t: unknown) => {
          const chain = {
            values: (_v: unknown) => {
              calls.push("insert");
              return {
                returning: async (_proj: unknown) => [{ id: 500 }],
              };
            },
          };
          return chain;
        },
        update: (_t: unknown) => ({
          set: (_v: unknown) => ({
            where: (_c: unknown) => ({
              returning: async (_proj: unknown) => {
                calls.push("update");
                return opts.updateReturning;
              },
            }),
          }),
        }),
      },
    };
  }

  it("inserts correction proposal + flips status + writes decision; returns new correction id", async () => {
    const { db, calls } = makeFakeDb({
      proposalRow: {
        id: 100,
        runId: 7,
        proposalKind: "description_enrichment",
        targetTypeKey: "service",
        targetId: 42,
        confidence: "0.90",
        status: "pending",
        payload: { description: "x" },
        sourceEvidence: { citations: [{ noteId: 1, noteVersionId: 1, excerpt: "..." }] },
        createdAt: new Date("2026-05-18T08:00:00Z"),
      },
      updateReturning: [{ id: 100 }],
    });

    const result = await runPromoteSemanticEnrichment(
      { proposalId: 100, decidedByUserId: 22 },
      { db: db as never },
    );

    expect(result.correctionProposalId).toBe(500);
    expect(result.enrichmentProposalId).toBe(100);
    // Order: read (select) → write correction (insert) → flip status (update) → write decision (insert)
    expect(calls).toEqual(["select", "insert", "update", "insert"]);
  });

  it("surfaces wasUpdated:false as AlreadyPromotedError (concurrent race)", async () => {
    const { db } = makeFakeDb({
      proposalRow: {
        id: 100,
        runId: 7,
        proposalKind: "description_enrichment",
        targetTypeKey: "service",
        targetId: 42,
        confidence: "0.90",
        status: "pending",
        payload: { description: "x" },
        sourceEvidence: null,
        createdAt: new Date("2026-05-18T08:00:00Z"),
      },
      // 0 rows updated = race already flipped the status.
      updateReturning: [],
    });

    const { EnrichmentProposalAlreadyPromotedError } = await import(
      "../../server/agent-studio/services/graph-enrichment/public-api"
    );
    await expect(
      runPromoteSemanticEnrichment({ proposalId: 100 }, { db: db as never }),
    ).rejects.toBeInstanceOf(EnrichmentProposalAlreadyPromotedError);
  });

  it("surfaces missing source row as NotFoundError", async () => {
    const { db } = makeFakeDb({
      proposalRow: null,
      updateReturning: [],
    });
    const { EnrichmentProposalNotFoundError } = await import(
      "../../server/agent-studio/services/graph-enrichment/public-api"
    );
    await expect(
      runPromoteSemanticEnrichment({ proposalId: 999 }, { db: db as never }),
    ).rejects.toBeInstanceOf(EnrichmentProposalNotFoundError);
  });
});

// Suppress unused-import warning
void vi;
