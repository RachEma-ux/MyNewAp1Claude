/**
 * T-D.4 slice 1 — Semantic Enrichment promotion bridge.
 *
 * Verifies:
 *   - Pure conversion: `convertSemanticEnrichmentToCorrectionProposal`
 *     maps an enrichment proposal detail row into a correction
 *     proposal row with the expected field shape
 *   - State guards: only `pending` enrichment proposals are
 *     promotable; `rejected_below_threshold` + `promoted` throw
 *     tagged errors
 *   - Idempotency: a second promotion of an already-`promoted` row
 *     throws `EnrichmentProposalAlreadyPromotedError`
 *   - Concurrent-update guard: `wasUpdated: false` from the status
 *     writer surfaces as `AlreadyPromotedError` even when the read
 *     showed `pending`
 *   - Audit-write failure is non-fatal — the promotion result is
 *     still returned successfully
 *   - DI seams: writer fns receive the expected arguments in order
 *
 * Source-scan also pins:
 *   - Bridge file exists in `graph-enrichment/`
 *   - No neo4j-driver / openrouter / dispatchMcpToolCall imports
 *   - No direct Drizzle imports (all I/O via injected fns)
 *   - public-api re-exports the bridge surface
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

import {
  convertSemanticEnrichmentToCorrectionProposal,
  promoteSemanticEnrichmentProposal,
  EnrichmentProposalNotFoundError,
  EnrichmentProposalNotPromotableError,
  EnrichmentProposalAlreadyPromotedError,
  SEMANTIC_ENRICHMENT_PROMOTED_STATUS,
  SEMANTIC_ENRICHMENT_PROMOTED_DECISION,
  type CorrectionProposalRowFromEnrichment,
  type EnrichmentDecisionWriter,
  type EnrichmentProposalReader,
  type EnrichmentProposalStatusWriter,
  type CorrectionProposalWriter,
  type PromoteSemanticEnrichmentDeps,
} from "../../server/agent-studio/services/graph-enrichment/public-api";

const DIR = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-enrichment",
);
const BRIDGE = join(DIR, "semantic-enrichment-promotion-bridge.ts");

function read(p: string): string {
  return readFileSync(p, "utf8");
}

// ────────────────────────────────────────────────────────────────────
// Fixture helpers
// ────────────────────────────────────────────────────────────────────

type EnrichmentProposalOverrides = Partial<{
  id: number;
  runId: number | null;
  proposalKind: string;
  targetTypeKey: string | null;
  targetId: number | null;
  confidence: string | null;
  payload: Record<string, unknown> | null;
  sourceEvidence: Record<string, unknown> | null;
}>;

function pendingEnrichmentProposal(overrides: EnrichmentProposalOverrides = {}) {
  // Use `in` checks so `null` overrides are respected (?? would
  // collapse them back to the default).
  return {
    id: "id" in overrides ? overrides.id! : 100,
    runId: "runId" in overrides ? overrides.runId! : 7,
    proposalKind:
      "proposalKind" in overrides ? overrides.proposalKind! : "description_enrichment",
    targetTypeKey:
      "targetTypeKey" in overrides ? overrides.targetTypeKey! : "service",
    targetId: "targetId" in overrides ? overrides.targetId! : 42,
    confidence: "confidence" in overrides ? overrides.confidence! : "0.90",
    status: "pending",
    payload:
      "payload" in overrides
        ? overrides.payload!
        : ({ description: "A primary user service." } as Record<string, unknown>),
    sourceEvidence:
      "sourceEvidence" in overrides
        ? overrides.sourceEvidence!
        : ({ citations: [{ noteId: 1, noteVersionId: 1, excerpt: "..." }] } as Record<
            string,
            unknown
          >),
    createdAt: new Date("2026-05-18T08:00:00Z"),
  };
}

function makeDeps(parts: Partial<PromoteSemanticEnrichmentDeps> = {}): {
  deps: PromoteSemanticEnrichmentDeps;
  readMock: ReturnType<typeof vi.fn>;
  writeProposalMock: ReturnType<typeof vi.fn>;
  writeStatusMock: ReturnType<typeof vi.fn>;
  writeDecisionMock: ReturnType<typeof vi.fn>;
} {
  const readMock = vi.fn() as unknown as EnrichmentProposalReader & ReturnType<typeof vi.fn>;
  const writeProposalMock = vi.fn() as unknown as CorrectionProposalWriter &
    ReturnType<typeof vi.fn>;
  const writeStatusMock = vi.fn() as unknown as EnrichmentProposalStatusWriter &
    ReturnType<typeof vi.fn>;
  const writeDecisionMock = vi.fn() as unknown as EnrichmentDecisionWriter &
    ReturnType<typeof vi.fn>;
  const deps: PromoteSemanticEnrichmentDeps = {
    readEnrichmentProposal: parts.readEnrichmentProposal ?? (readMock as unknown as EnrichmentProposalReader),
    writeCorrectionProposal:
      parts.writeCorrectionProposal ?? (writeProposalMock as unknown as CorrectionProposalWriter),
    writeEnrichmentStatus:
      parts.writeEnrichmentStatus ?? (writeStatusMock as unknown as EnrichmentProposalStatusWriter),
    writeEnrichmentDecision:
      parts.writeEnrichmentDecision ?? (writeDecisionMock as unknown as EnrichmentDecisionWriter),
  };
  return { deps, readMock, writeProposalMock, writeStatusMock, writeDecisionMock };
}

// ────────────────────────────────────────────────────────────────────
// Source-scan
// ────────────────────────────────────────────────────────────────────

describe("T-D.4 promotion bridge — source-scan", () => {
  const SRC = read(BRIDGE);

  it("file exists at canonical path", () => {
    expect(SRC).toMatch(/convertSemanticEnrichmentToCorrectionProposal/);
    expect(SRC).toMatch(/promoteSemanticEnrichmentProposal/);
  });

  it("no neo4j-driver / openrouter / dispatchMcpToolCall imports", () => {
    // Strip line + block comments before checking — doc-block
    // mentions of forbidden symbols (the boundary discipline section)
    // don't violate the rule.
    const stripped = SRC
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
    expect(stripped).not.toMatch(/from\s+["']neo4j-driver["']/);
    expect(stripped).not.toMatch(/from\s+["'][^"']*openrouter[^"']*["']/);
    expect(stripped).not.toMatch(/\bdispatchMcpToolCall\s*\(/);
    expect(stripped).not.toMatch(/^import[^\n]*dispatchMcpToolCall/m);
  });

  it("no direct drizzle-orm imports (all I/O via injected fns)", () => {
    expect(SRC).not.toMatch(/from\s+["']drizzle-orm/);
  });

  it("public-api re-exports the bridge surface", () => {
    const barrel = read(join(DIR, "public-api.ts"));
    for (const sym of [
      "convertSemanticEnrichmentToCorrectionProposal",
      "promoteSemanticEnrichmentProposal",
      "EnrichmentProposalNotFoundError",
      "EnrichmentProposalNotPromotableError",
      "EnrichmentProposalAlreadyPromotedError",
      "SEMANTIC_ENRICHMENT_PROMOTED_STATUS",
      "SEMANTIC_ENRICHMENT_PROMOTED_DECISION",
      "PromoteSemanticEnrichmentDeps",
    ]) {
      expect(barrel, `barrel must re-export ${sym}`).toMatch(
        new RegExp(`\\b${sym}\\b`),
      );
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// Pure conversion
// ────────────────────────────────────────────────────────────────────

describe("convertSemanticEnrichmentToCorrectionProposal — pure conversion", () => {
  it("maps proposalKind / target* / payload / confidence verbatim", () => {
    const src = pendingEnrichmentProposal({
      proposalKind: "missing_property_fill",
      targetTypeKey: "service",
      targetId: 7,
      confidence: "0.83",
      payload: { owner: "alice@example.com" },
    });
    const row = convertSemanticEnrichmentToCorrectionProposal(src);
    expect(row.proposalKind).toBe("missing_property_fill");
    expect(row.targetTypeKey).toBe("service");
    expect(row.targetId).toBe(7);
    expect(row.proposedChange).toEqual({ owner: "alice@example.com" });
    expect(row.confidence).toBe(0.83);
    expect(row.status).toBe("pending");
  });

  it("parses null/non-numeric confidence to 0; clamps below 0 → 0, above 1 → 1", () => {
    const r1 = convertSemanticEnrichmentToCorrectionProposal(
      pendingEnrichmentProposal({ confidence: null }),
    );
    expect(r1.confidence).toBe(0);

    const r2 = convertSemanticEnrichmentToCorrectionProposal(
      pendingEnrichmentProposal({ confidence: "not-a-number" }),
    );
    expect(r2.confidence).toBe(0);

    const r3 = convertSemanticEnrichmentToCorrectionProposal(
      pendingEnrichmentProposal({ confidence: "-0.5" }),
    );
    expect(r3.confidence).toBe(0);

    const r4 = convertSemanticEnrichmentToCorrectionProposal(
      pendingEnrichmentProposal({ confidence: "1.7" }),
    );
    expect(r4.confidence).toBe(1);
  });

  it("rationale references the source enrichment proposal id + run + citation count", () => {
    const src = pendingEnrichmentProposal({
      id: 100,
      runId: 7,
      sourceEvidence: {
        citations: [
          { noteId: 1, noteVersionId: 1, excerpt: "..." },
          { noteId: 2, noteVersionId: 2, excerpt: "..." },
          { noteId: 3, noteVersionId: 3, excerpt: "..." },
        ],
      },
    });
    const row = convertSemanticEnrichmentToCorrectionProposal(src);
    expect(row.rationale).toMatch(/enrichment proposal 100/);
    expect(row.rationale).toMatch(/runId=7/);
    expect(row.rationale).toMatch(/3 note-version/i);
  });

  it("rationale handles missing sourceEvidence + null runId gracefully", () => {
    const src = pendingEnrichmentProposal({
      id: 99,
      runId: null,
      sourceEvidence: null,
    });
    const row = convertSemanticEnrichmentToCorrectionProposal(src);
    expect(row.rationale).toMatch(/runId=null/);
    expect(row.rationale).not.toMatch(/Source citations/);
  });

  it("payload null → empty proposedChange object", () => {
    const src = pendingEnrichmentProposal({ payload: null });
    const row = convertSemanticEnrichmentToCorrectionProposal(src);
    expect(row.proposedChange).toEqual({});
  });

  it("threads proposedByAgentId + proposedByUserId from options", () => {
    const src = pendingEnrichmentProposal();
    const row = convertSemanticEnrichmentToCorrectionProposal(src, {
      proposedByAgentId: 11,
      proposedByUserId: 22,
    });
    expect(row.proposedByAgentId).toBe(11);
    expect(row.proposedByUserId).toBe(22);
  });

  it("defaults proposedByAgentId + proposedByUserId to null", () => {
    const src = pendingEnrichmentProposal();
    const row = convertSemanticEnrichmentToCorrectionProposal(src);
    expect(row.proposedByAgentId).toBeNull();
    expect(row.proposedByUserId).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────
// Promotion lifecycle
// ────────────────────────────────────────────────────────────────────

describe("promoteSemanticEnrichmentProposal — happy path", () => {
  it("reads → inserts correction → flips status → writes decision; returns the new correction proposal id", async () => {
    const { deps, readMock, writeProposalMock, writeStatusMock, writeDecisionMock } = makeDeps();
    readMock.mockResolvedValue(pendingEnrichmentProposal({ id: 100 }));
    writeProposalMock.mockResolvedValue({ correctionProposalId: 500 });
    writeStatusMock.mockResolvedValue({ wasUpdated: true });
    writeDecisionMock.mockResolvedValue(undefined);

    const result = await promoteSemanticEnrichmentProposal(
      {
        proposalId: 100,
        decidedByUserId: 22,
        decisionRationale: "operator-approved",
        proposedByAgentId: 11,
      },
      deps,
    );

    expect(result.correctionProposalId).toBe(500);
    expect(result.enrichmentProposalId).toBe(100);
    expect(result.correctionProposalRow.proposedByAgentId).toBe(11);
    expect(result.correctionProposalRow.proposedByUserId).toBe(22);

    expect(readMock).toHaveBeenCalledWith(100);
    expect(writeStatusMock).toHaveBeenCalledWith({
      proposalId: 100,
      nextStatus: SEMANTIC_ENRICHMENT_PROMOTED_STATUS,
    });
    expect(writeDecisionMock).toHaveBeenCalledWith({
      proposalId: 100,
      decision: SEMANTIC_ENRICHMENT_PROMOTED_DECISION,
      decidedByUserId: 22,
      rationale: "operator-approved",
      correctionProposalId: 500,
    });
  });

  it("non-fatal: decision-writer failure does not break the promotion", async () => {
    const { deps, readMock, writeProposalMock, writeStatusMock, writeDecisionMock } = makeDeps();
    readMock.mockResolvedValue(pendingEnrichmentProposal({ id: 100 }));
    writeProposalMock.mockResolvedValue({ correctionProposalId: 500 });
    writeStatusMock.mockResolvedValue({ wasUpdated: true });
    writeDecisionMock.mockRejectedValue(new Error("audit table full"));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await promoteSemanticEnrichmentProposal({ proposalId: 100 }, deps);
      expect(result.correctionProposalId).toBe(500);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("promoteSemanticEnrichmentProposal — state guards", () => {
  it("throws EnrichmentProposalNotFoundError when reader returns null", async () => {
    const { deps, readMock } = makeDeps();
    readMock.mockResolvedValue(null);
    await expect(
      promoteSemanticEnrichmentProposal({ proposalId: 999 }, deps),
    ).rejects.toBeInstanceOf(EnrichmentProposalNotFoundError);
  });

  it("throws AlreadyPromotedError when source row is already promoted", async () => {
    const { deps, readMock } = makeDeps();
    readMock.mockResolvedValue({
      ...pendingEnrichmentProposal({ id: 100 }),
      status: "promoted",
    });
    await expect(
      promoteSemanticEnrichmentProposal({ proposalId: 100 }, deps),
    ).rejects.toBeInstanceOf(EnrichmentProposalAlreadyPromotedError);
  });

  it("throws NotPromotableError when source row status is rejected_below_threshold", async () => {
    const { deps, readMock } = makeDeps();
    readMock.mockResolvedValue({
      ...pendingEnrichmentProposal({ id: 100 }),
      status: "rejected_below_threshold",
    });
    await expect(
      promoteSemanticEnrichmentProposal({ proposalId: 100 }, deps),
    ).rejects.toBeInstanceOf(EnrichmentProposalNotPromotableError);
  });

  it("throws NotPromotableError when source row status is any unknown non-pending value", async () => {
    const { deps, readMock } = makeDeps();
    readMock.mockResolvedValue({
      ...pendingEnrichmentProposal({ id: 100 }),
      status: "some_future_status",
    });
    await expect(
      promoteSemanticEnrichmentProposal({ proposalId: 100 }, deps),
    ).rejects.toBeInstanceOf(EnrichmentProposalNotPromotableError);
  });

  it("throws AlreadyPromotedError when the status writer reports wasUpdated: false (concurrent race)", async () => {
    const { deps, readMock, writeProposalMock, writeStatusMock } = makeDeps();
    readMock.mockResolvedValue(pendingEnrichmentProposal({ id: 100 }));
    writeProposalMock.mockResolvedValue({ correctionProposalId: 500 });
    writeStatusMock.mockResolvedValue({ wasUpdated: false });
    await expect(
      promoteSemanticEnrichmentProposal({ proposalId: 100 }, deps),
    ).rejects.toBeInstanceOf(EnrichmentProposalAlreadyPromotedError);
  });
});

describe("promoteSemanticEnrichmentProposal — DI seam ordering", () => {
  it("calls the 4 DI fns in the documented order: read → write correction → flip status → write decision", async () => {
    const calls: string[] = [];
    const proposal = pendingEnrichmentProposal({ id: 100 });
    const deps: PromoteSemanticEnrichmentDeps = {
      readEnrichmentProposal: async () => {
        calls.push("read");
        return proposal;
      },
      writeCorrectionProposal: async () => {
        calls.push("writeCorrection");
        return { correctionProposalId: 500 };
      },
      writeEnrichmentStatus: async () => {
        calls.push("writeStatus");
        return { wasUpdated: true };
      },
      writeEnrichmentDecision: async () => {
        calls.push("writeDecision");
      },
    };

    await promoteSemanticEnrichmentProposal({ proposalId: 100 }, deps);
    expect(calls).toEqual([
      "read",
      "writeCorrection",
      "writeStatus",
      "writeDecision",
    ]);
  });

  it("does NOT call writeStatus / writeDecision when writeCorrection rejects", async () => {
    const calls: string[] = [];
    const deps: PromoteSemanticEnrichmentDeps = {
      readEnrichmentProposal: async () => {
        calls.push("read");
        return pendingEnrichmentProposal({ id: 100 });
      },
      writeCorrectionProposal: async () => {
        calls.push("writeCorrection");
        throw new Error("DB constraint violation");
      },
      writeEnrichmentStatus: async () => {
        calls.push("writeStatus");
        return { wasUpdated: true };
      },
      writeEnrichmentDecision: async () => {
        calls.push("writeDecision");
      },
    };

    await expect(
      promoteSemanticEnrichmentProposal({ proposalId: 100 }, deps),
    ).rejects.toThrow(/DB constraint violation/);
    expect(calls).toEqual(["read", "writeCorrection"]);
  });
});

// ────────────────────────────────────────────────────────────────────
// Type-level structural assertion
// ────────────────────────────────────────────────────────────────────

describe("CorrectionProposalRowFromEnrichment — shape", () => {
  it("status field is the literal \"pending\"", () => {
    // Type-only — assigning anything else would be a compile error.
    const row: CorrectionProposalRowFromEnrichment = {
      proposalKind: "x",
      targetTypeKey: null,
      targetId: null,
      proposedChange: {},
      confidence: 0,
      rationale: "",
      proposedByAgentId: null,
      proposedByUserId: null,
      status: "pending",
    };
    expect(row.status).toBe("pending");
  });
});
