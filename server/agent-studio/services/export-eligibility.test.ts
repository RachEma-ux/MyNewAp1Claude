/**
 * Plan v3 Phase 31 — `evaluateExportEligibility` tests.
 *
 * Drives every gate through both pass and fail variants. The candidate
 * fixture starts as fully-eligible; each test mutates one field to drive
 * the gate it cares about.
 */

import { describe, it, expect } from "vitest";
import {
  evaluateExportEligibility,
  EXPORT_ELIGIBILITY_GATES,
  type ExportEligibilityGate,
} from "./export-eligibility";
import type { AgentStudioExportCandidate } from "../shared/export-candidate";

function eligibleFixture(): AgentStudioExportCandidate {
  return {
    workspaceId: 1,
    agentId: 42,
    versionId: 7,
    name: "test-agent",
    lifecycleState: "published",
    readiness: {
      readinessScore: 95,
      readinessComputedBy: "user:1",
      readinessComputedAt: "2026-05-04T00:00:00.000Z",
      publishReady: true,
    },
    governance: {
      status: "cleared",
      computedBy: "user:1",
      computedAt: "2026-05-04T00:00:00.000Z",
      receiptId: null,
      blockerRules: [],
    },
    racReadiness: {
      status: "ready",
      reasons: [],
      toolRisk: {
        hasReadOnly: true,
        hasRisky: false,
        hasCodeExecution: false,
        hasQuarantined: false,
        classes: ["read_only"],
      },
      sandboxHealth: { ok: true, impl: "node-vm" },
      computedAt: "2026-05-04T00:00:00.000Z",
    },
    binding: {
      status: "binding_v1",
      providerConnectionId: 100,
      providerCatalogEntryId: 200,
      modelCatalogEntryId: 300,
    },
    capabilities: ["chat", "tools"],
    sourceModule: "agentStudio",
    sourceRefId: 42,
    activeSourceVersionId: 555,
    exportStatus: "ready",
  };
}

describe("evaluateExportEligibility — Phase 31 gates", () => {
  it("happy path: every gate passes", async () => {
    const r = await evaluateExportEligibility(eligibleFixture());
    expect(r.eligible).toBe(true);
    expect(r.firstFailure).toBeNull();
    expect(r.gates.length).toBe(10);
    for (const g of r.gates) expect(g.pass).toBe(true);
  });

  it("gate order matches EXPORT_ELIGIBILITY_GATES exactly", async () => {
    const r = await evaluateExportEligibility(eligibleFixture());
    expect(r.gates.map((g) => g.gate)).toEqual([...EXPORT_ELIGIBILITY_GATES]);
  });

  it("version_release fails when versionId=0", async () => {
    const c = eligibleFixture();
    c.versionId = 0;
    const r = await evaluateExportEligibility(c);
    expect(r.eligible).toBe(false);
    expect(r.firstFailure).toBe("version_release");
    expect(r.gates[0].pass).toBe(false);
  });

  it("version_release fails when activeSourceVersionId is null", async () => {
    const c = eligibleFixture();
    c.activeSourceVersionId = null;
    const r = await evaluateExportEligibility(c);
    expect(r.firstFailure).toBe("version_release");
  });

  it("provider_binding_valid fails for legacy_no_credential", async () => {
    const c = eligibleFixture();
    c.binding.status = "legacy_no_credential";
    const r = await evaluateExportEligibility(c);
    expect(r.firstFailure).toBe("provider_binding_valid");
  });

  it("provider_connection_active fails when providerConnectionId is null", async () => {
    const c = eligibleFixture();
    c.binding.providerConnectionId = null;
    const r = await evaluateExportEligibility(c);
    expect(r.firstFailure).toBe("provider_connection_active");
  });

  it("model_approved fails when modelCatalogEntryId is null", async () => {
    const c = eligibleFixture();
    c.binding.modelCatalogEntryId = null;
    const r = await evaluateExportEligibility(c);
    expect(r.firstFailure).toBe("model_approved");
  });

  it("readiness_score_threshold fails when score < default 70", async () => {
    const c = eligibleFixture();
    c.readiness.readinessScore = 50;
    const r = await evaluateExportEligibility(c);
    expect(r.firstFailure).toBe("readiness_score_threshold");
  });

  it("readiness_score_threshold respects custom threshold", async () => {
    const c = eligibleFixture();
    c.readiness.readinessScore = 75;
    const r = await evaluateExportEligibility(c, {
      readinessScoreThreshold: 90,
    });
    expect(r.firstFailure).toBe("readiness_score_threshold");
  });

  it("governance_verdict_acceptable fails when blocked", async () => {
    const c = eligibleFixture();
    c.governance.status = "blocked";
    c.governance.blockerRules = ["some.rule"];
    const r = await evaluateExportEligibility(c);
    expect(r.firstFailure).toBe("governance_verdict_acceptable");
  });

  it("metadata_complete fails when capabilities is empty", async () => {
    const c = eligibleFixture();
    c.capabilities = [];
    const r = await evaluateExportEligibility(c);
    expect(r.firstFailure).toBe("metadata_complete");
  });

  it("metadata_complete fails when name is empty", async () => {
    const c = eligibleFixture();
    c.name = "";
    const r = await evaluateExportEligibility(c);
    expect(r.firstFailure).toBe("metadata_complete");
  });

  it("not_already_imported fails when status=exported", async () => {
    const c = eligibleFixture();
    c.exportStatus = "exported";
    const r = await evaluateExportEligibility(c);
    expect(r.firstFailure).toBe("not_already_imported");
  });

  it("no_duplicate_canonical_entry runs the lookup when provided", async () => {
    const c = eligibleFixture();
    let called = false;
    const r = await evaluateExportEligibility(c, {
      hasDuplicateCanonicalEntry: async (st, sid) => {
        called = true;
        expect(st).toBe("agent");
        expect(sid).toBe(42);
        return true;
      },
    });
    expect(called).toBe(true);
    expect(r.firstFailure).toBe("no_duplicate_canonical_entry");
  });

  it("no_duplicate_canonical_entry passes conservatively when no lookup provided", async () => {
    const c = eligibleFixture();
    const r = await evaluateExportEligibility(c);
    const dupGate = r.gates.find(
      (g) => g.gate === "no_duplicate_canonical_entry",
    )!;
    expect(dupGate.pass).toBe(true);
    expect(dupGate.reason).toMatch(/not run/);
  });

  it("evaluates ALL gates even when first fails (no short-circuit)", async () => {
    const c = eligibleFixture();
    c.versionId = 0; // first gate fails
    c.binding.status = "missing"; // second gate also fails
    const r = await evaluateExportEligibility(c);
    expect(r.eligible).toBe(false);
    expect(r.gates[0].pass).toBe(false);
    expect(r.gates[1].pass).toBe(false);
    expect(r.gates.length).toBe(10);
  });

  it("rac_readiness fails when racStatus=blocked", async () => {
    const c = eligibleFixture();
    c.racReadiness = {
      status: "blocked",
      reasons: ["sandbox_required"],
      toolRisk: {
        hasReadOnly: false,
        hasRisky: false,
        hasCodeExecution: true,
        hasQuarantined: false,
        classes: ["code_execution"],
      },
      sandboxHealth: null,
      computedAt: "2026-05-06T00:00:00.000Z",
    };
    const r = await evaluateExportEligibility(c);
    expect(r.firstFailure).toBe("rac_readiness");
    const gate = r.gates.find((g) => g.gate === "rac_readiness")!;
    expect(gate.pass).toBe(false);
    expect(gate.reason).toMatch(/sandbox_required/);
  });

  it("rac_readiness passes when racStatus=degraded (warning only)", async () => {
    const c = eligibleFixture();
    c.racReadiness = {
      status: "degraded",
      reasons: ["write_requires_approval"],
      toolRisk: {
        hasReadOnly: false,
        hasRisky: true,
        hasCodeExecution: false,
        hasQuarantined: false,
        classes: ["write"],
      },
      sandboxHealth: { ok: true, impl: "node-vm" },
      computedAt: "2026-05-06T00:00:00.000Z",
    };
    const r = await evaluateExportEligibility(c);
    expect(r.eligible).toBe(true);
    const gate = r.gates.find((g) => g.gate === "rac_readiness")!;
    expect(gate.pass).toBe(true);
    expect(gate.reason).toMatch(/degraded/);
  });

  it("firstFailure picks the FIRST failing gate in declared order", async () => {
    const c = eligibleFixture();
    c.binding.status = "missing"; // gate 2
    c.readiness.readinessScore = 0; // gate 5
    const r = await evaluateExportEligibility(c);
    expect(r.firstFailure).toBe("provider_binding_valid");
  });
});
