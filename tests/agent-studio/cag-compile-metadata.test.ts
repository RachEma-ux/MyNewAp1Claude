/**
 * Retrofit P5 — CAG compile/hash/governance metadata wiring tests.
 *
 * Pure tests that don't hit the DB:
 *   - the type extension surfaces all retrofit fields on CagCapabilityPack
 *   - CreatePackInput accepts the new optional metadata
 *   - CagCompileResult / CagGovernanceVerdict enums are stable strings
 *
 * The DB-backed paths (createPack, markPackUsed, recordPackTokenActual)
 * are exercised by the existing cag-boundaries integration suite + by
 * Phase 13's golden set; here we only assert the contract surface so a
 * future regression that drops a field is caught at typecheck.
 */

import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  CagCapabilityPack,
  CagCompileResult,
  CagGovernanceVerdict,
  CreatePackInput,
} from "../../server/agent-studio/services/cag";

describe("CagCapabilityPack — Retrofit P5 fields", () => {
  it("type carries all D-CAG-RECON-2 fields", () => {
    expectTypeOf<CagCapabilityPack>().toHaveProperty("contentHash");
    expectTypeOf<CagCapabilityPack>().toHaveProperty("compiledHash");
    expectTypeOf<CagCapabilityPack>().toHaveProperty("tokenBudgetEstimate");
    expectTypeOf<CagCapabilityPack>().toHaveProperty("tokenBudgetActual");
    expectTypeOf<CagCapabilityPack>().toHaveProperty("compileResult");
    expectTypeOf<CagCapabilityPack>().toHaveProperty("compileWarnings");
    expectTypeOf<CagCapabilityPack>().toHaveProperty("governanceVerdict");
    expectTypeOf<CagCapabilityPack>().toHaveProperty("governanceBlockers");
    expectTypeOf<CagCapabilityPack>().toHaveProperty("useCount");
  });

  it("CreatePackInput accepts the new optional metadata", () => {
    const input: CreatePackInput = {
      workspaceId: 1,
      agentId: 1,
      agentDraftId: 1,
      contentJson: { tools: [] },
      sourceManifest: [],
      createdBy: 1,
      contentHash: "abc",
      compiledHash: "def",
      tokenBudgetEstimate: 512,
      compileResult: "ok",
      compileWarnings: [],
      governanceVerdict: "cleared",
      governanceBlockers: [],
    };
    expect(input.contentHash).toBe("abc");
    expect(input.compiledHash).toBe("def");
    expect(input.governanceVerdict).toBe("cleared");
  });

  it("CagCompileResult is stable enum", () => {
    const ok: CagCompileResult = "ok";
    const warn: CagCompileResult = "warn";
    const error: CagCompileResult = "error";
    expect([ok, warn, error]).toEqual(["ok", "warn", "error"]);
  });

  it("CagGovernanceVerdict is stable enum", () => {
    const cleared: CagGovernanceVerdict = "cleared";
    const warn: CagGovernanceVerdict = "warn";
    const blocked: CagGovernanceVerdict = "blocked";
    expect([cleared, warn, blocked]).toEqual(["cleared", "warn", "blocked"]);
  });
});
