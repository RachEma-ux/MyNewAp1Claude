/**
 * Phase G §T-G.59 — `summarizeCagCapabilityPacks` lockstep.
 *
 * Stable-shape row-state aggregator over `CagCapabilityPack[]`.
 * Mirrors the per-kind metadata canonization shipped at T-G.40-G.46;
 * instantiates the registry-plus-row-state aggregator pair pattern
 * (lesson 30) on the CAG-pack surface.
 */

import { describe, expect, it } from "vitest";
import {
  summarizeCagCapabilityPacks,
} from "../../server/agent-studio/services/cag/cag-capability-pack-summary.js";
import {
  CAG_COMPILE_RESULTS,
  CAG_GOVERNANCE_VERDICTS,
  CAG_PACK_STATUSES,
  type CagCapabilityPack,
} from "../../server/agent-studio/services/cag/types.js";

function makePack(
  overrides: Partial<CagCapabilityPack> = {},
): CagCapabilityPack {
  return {
    id: 1,
    workspaceId: 1,
    agentId: 1,
    agentDraftId: 1,
    catalogEntryId: null,
    packType: "default",
    packVersion: 1,
    status: "draft",
    contentJson: {},
    compressedPrompt: null,
    tokenEstimate: null,
    sourceManifestJson: { entries: [] },
    sourceHashesJson: {},
    injectionPolicyJson: null,
    riskSummaryJson: null,
    createdBy: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: null,
    lastUsedAt: null,
    contentHash: null,
    compiledHash: null,
    tokenBudgetEstimate: null,
    tokenBudgetActual: null,
    compileResult: null,
    compileWarnings: [],
    governanceVerdict: null,
    governanceBlockers: [],
    useCount: 0,
    ...overrides,
  };
}

describe("summarizeCagCapabilityPacks — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeCagCapabilityPacks([]);
    expect(s.total).toBe(0);
    expect(s.nullCompileResultCount).toBe(0);
    expect(s.nullGovernanceVerdictCount).toBe(0);
    expect(s.withCompileWarnings).toBe(0);
    expect(s.withGovernanceBlockers).toBe(0);
    expect(s.expiredCount).toBe(0);
    expect(s.notYetExpiredCount).toBe(0);
    expect(s.noExpiryCount).toBe(0);
    expect(s.tokenBudgetEstimateStats).toBeNull();
    expect(s.useCountStats).toBeNull();
  });

  it("byStatus carries every closed status at 0 (stable shape)", () => {
    const s = summarizeCagCapabilityPacks([]);
    for (const status of CAG_PACK_STATUSES) {
      expect(s.byStatus[status]).toBe(0);
    }
  });

  it("byCompileResult carries every closed result at 0 (stable shape)", () => {
    const s = summarizeCagCapabilityPacks([]);
    for (const r of CAG_COMPILE_RESULTS) {
      expect(s.byCompileResult[r]).toBe(0);
    }
  });

  it("byGovernanceVerdict carries every closed verdict at 0 (stable shape)", () => {
    const s = summarizeCagCapabilityPacks([]);
    for (const v of CAG_GOVERNANCE_VERDICTS) {
      expect(s.byGovernanceVerdict[v]).toBe(0);
    }
  });
});

describe("summarizeCagCapabilityPacks — single pack", () => {
  it("counts a single ready pack on the correct axes", () => {
    const s = summarizeCagCapabilityPacks([
      makePack({
        status: "ready",
        compileResult: "ok",
        governanceVerdict: "cleared",
        useCount: 5,
        tokenBudgetEstimate: 100,
      }),
    ]);
    expect(s.total).toBe(1);
    expect(s.byStatus.ready).toBe(1);
    expect(s.byCompileResult.ok).toBe(1);
    expect(s.byGovernanceVerdict.cleared).toBe(1);
    expect(s.useCountStats).not.toBeNull();
    expect(s.useCountStats!.count).toBe(1);
    expect(s.useCountStats!.mean).toBe(5);
    expect(s.tokenBudgetEstimateStats!.sum).toBe(100);
  });
});

describe("summarizeCagCapabilityPacks — null axes are partitioned", () => {
  it("compileResult null counts to nullCompileResultCount, not byCompileResult", () => {
    const s = summarizeCagCapabilityPacks([
      makePack({ compileResult: null }),
      makePack({ compileResult: "ok" }),
      makePack({ compileResult: "warn" }),
    ]);
    expect(s.nullCompileResultCount).toBe(1);
    expect(s.byCompileResult.ok).toBe(1);
    expect(s.byCompileResult.warn).toBe(1);
    expect(s.byCompileResult.error).toBe(0);
  });

  it("governanceVerdict null counts to nullGovernanceVerdictCount", () => {
    const s = summarizeCagCapabilityPacks([
      makePack({ governanceVerdict: null }),
      makePack({ governanceVerdict: "cleared" }),
      makePack({ governanceVerdict: "blocked" }),
    ]);
    expect(s.nullGovernanceVerdictCount).toBe(1);
    expect(s.byGovernanceVerdict.cleared).toBe(1);
    expect(s.byGovernanceVerdict.blocked).toBe(1);
  });
});

describe("summarizeCagCapabilityPacks — warning + blocker counters", () => {
  it("counts packs with non-empty compileWarnings", () => {
    const s = summarizeCagCapabilityPacks([
      makePack({ compileWarnings: [] }),
      makePack({ compileWarnings: ["warn-1"] }),
      makePack({ compileWarnings: ["warn-1", "warn-2"] }),
    ]);
    expect(s.withCompileWarnings).toBe(2);
  });

  it("counts packs with non-empty governanceBlockers", () => {
    const s = summarizeCagCapabilityPacks([
      makePack({ governanceBlockers: [] }),
      makePack({ governanceBlockers: ["rule-1"] }),
      makePack({ governanceBlockers: ["rule-1", "rule-2"] }),
    ]);
    expect(s.withGovernanceBlockers).toBe(2);
  });
});

describe("summarizeCagCapabilityPacks — expiry partition", () => {
  const FROZEN_NOW = new Date("2026-05-16T12:00:00Z");

  it("partitions packs into noExpiry / expired / notYetExpired", () => {
    const s = summarizeCagCapabilityPacks(
      [
        makePack({ expiresAt: null }),
        makePack({ expiresAt: new Date("2026-05-15T12:00:00Z") }), // expired
        makePack({ expiresAt: new Date("2026-05-17T12:00:00Z") }), // future
      ],
      { now: FROZEN_NOW },
    );
    expect(s.noExpiryCount).toBe(1);
    expect(s.expiredCount).toBe(1);
    expect(s.notYetExpiredCount).toBe(1);
  });

  it("exactly-now is treated as expired (<= comparison)", () => {
    const s = summarizeCagCapabilityPacks(
      [makePack({ expiresAt: FROZEN_NOW })],
      { now: FROZEN_NOW },
    );
    expect(s.expiredCount).toBe(1);
    expect(s.notYetExpiredCount).toBe(0);
  });
});

describe("summarizeCagCapabilityPacks — numeric stats", () => {
  it("tokenBudgetEstimateStats excludes null values", () => {
    const s = summarizeCagCapabilityPacks([
      makePack({ tokenBudgetEstimate: null }),
      makePack({ tokenBudgetEstimate: 100 }),
      makePack({ tokenBudgetEstimate: 200 }),
    ]);
    expect(s.tokenBudgetEstimateStats!.count).toBe(2);
    expect(s.tokenBudgetEstimateStats!.sum).toBe(300);
    expect(s.tokenBudgetEstimateStats!.min).toBe(100);
    expect(s.tokenBudgetEstimateStats!.max).toBe(200);
    expect(s.tokenBudgetEstimateStats!.mean).toBe(150);
  });

  it("useCountStats includes every pack (no null filtering)", () => {
    const s = summarizeCagCapabilityPacks([
      makePack({ useCount: 0 }),
      makePack({ useCount: 5 }),
      makePack({ useCount: 10 }),
    ]);
    expect(s.useCountStats!.count).toBe(3);
    expect(s.useCountStats!.mean).toBe(5);
  });

  it("tokenBudget null on every input → null stats (no NaN)", () => {
    const s = summarizeCagCapabilityPacks([
      makePack({ tokenBudgetEstimate: null }),
      makePack({ tokenBudgetEstimate: null }),
    ]);
    expect(s.tokenBudgetEstimateStats).toBeNull();
  });

  it("mean rounds to 1 decimal (5/3 → 1.7)", () => {
    const s = summarizeCagCapabilityPacks([
      makePack({ useCount: 1 }),
      makePack({ useCount: 2 }),
      makePack({ useCount: 2 }),
    ]);
    expect(s.useCountStats!.mean).toBe(1.7);
  });
});

describe("summarizeCagCapabilityPacks — mixed records", () => {
  it("counts a mixed batch correctly across every axis", () => {
    const s = summarizeCagCapabilityPacks([
      makePack({
        status: "ready",
        compileResult: "ok",
        governanceVerdict: "cleared",
        compileWarnings: [],
        governanceBlockers: [],
        useCount: 10,
        tokenBudgetEstimate: 50,
      }),
      makePack({
        status: "compiling",
        compileResult: null,
        governanceVerdict: null,
        compileWarnings: ["x"],
        governanceBlockers: [],
        useCount: 0,
        tokenBudgetEstimate: null,
      }),
      makePack({
        status: "blocked",
        compileResult: "warn",
        governanceVerdict: "blocked",
        compileWarnings: ["x"],
        governanceBlockers: ["r"],
        useCount: 1,
        tokenBudgetEstimate: 200,
      }),
    ]);
    expect(s.total).toBe(3);
    expect(s.byStatus.ready).toBe(1);
    expect(s.byStatus.compiling).toBe(1);
    expect(s.byStatus.blocked).toBe(1);
    expect(s.byCompileResult.ok).toBe(1);
    expect(s.byCompileResult.warn).toBe(1);
    expect(s.byCompileResult.error).toBe(0);
    expect(s.nullCompileResultCount).toBe(1);
    expect(s.byGovernanceVerdict.cleared).toBe(1);
    expect(s.byGovernanceVerdict.blocked).toBe(1);
    expect(s.byGovernanceVerdict.warn).toBe(0);
    expect(s.nullGovernanceVerdictCount).toBe(1);
    expect(s.withCompileWarnings).toBe(2);
    expect(s.withGovernanceBlockers).toBe(1);
    expect(s.tokenBudgetEstimateStats!.count).toBe(2);
    expect(s.tokenBudgetEstimateStats!.sum).toBe(250);
  });
});
