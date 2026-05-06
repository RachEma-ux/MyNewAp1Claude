/**
 * Plan v3 Phase 29 — `AgentStudioExportCandidate` contract test.
 *
 * Asserts:
 *   1. The required field set matches Phase 29's checklist verbatim.
 *   2. No forbidden key (apiKey, providerConfig, secrets, etc.) appears
 *      on the candidate shape — even nested.
 *   3. sourceModule is locked to "agentStudio" (string-literal).
 *   4. sourceRefId === agentId — the Phase 23 catalog source mapping
 *      depends on this identity.
 */

import { describe, it, expect } from "vitest";
import {
  AGENT_STUDIO_EXPORT_CANDIDATE_KEYS,
  FORBIDDEN_EXPORT_CANDIDATE_KEYS,
  type AgentStudioExportCandidate,
} from "./export-candidate";

const fixture: AgentStudioExportCandidate = {
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

describe("AgentStudioExportCandidate — Phase 29 contract", () => {
  it("declares exactly the Phase 29 checklist field set", () => {
    // The checklist names: workspaceId, agentId, versionId, name,
    // lifecycle state, readiness score, governance verdict, provider
    // binding status, provider/model refs, capabilities,
    // sourceModule, sourceRefId, activeSourceVersionId, export status.
    // Score + governance are nested under readiness/governance to keep
    // the shape compact, but every required concept is reachable.
    expect(new Set(AGENT_STUDIO_EXPORT_CANDIDATE_KEYS)).toEqual(
      new Set([
        "workspaceId",
        "agentId",
        "versionId",
        "name",
        "lifecycleState",
        "readiness",
        "governance",
        "racReadiness",
        "binding",
        "capabilities",
        "sourceModule",
        "sourceRefId",
        "activeSourceVersionId",
        "exportStatus",
      ]),
    );
  });

  it("nested readiness covers Phase 28 fields", () => {
    expect(Object.keys(fixture.readiness).sort()).toEqual([
      "publishReady",
      "readinessComputedAt",
      "readinessComputedBy",
      "readinessScore",
    ]);
  });

  it("nested governance covers Phase 27 fields", () => {
    expect(Object.keys(fixture.governance).sort()).toEqual([
      "blockerRules",
      "computedAt",
      "computedBy",
      "receiptId",
      "status",
    ]);
  });

  it("nested binding covers status + provider/model + connection refs", () => {
    expect(Object.keys(fixture.binding).sort()).toEqual([
      "modelCatalogEntryId",
      "providerCatalogEntryId",
      "providerConnectionId",
      "status",
    ]);
  });

  it("nested racReadiness covers RAC P10 D-TOOL-4 fields", () => {
    expect(Object.keys(fixture.racReadiness).sort()).toEqual([
      "computedAt",
      "reasons",
      "sandboxHealth",
      "status",
      "toolRisk",
    ]);
  });

  it("sourceModule is locked to 'agentStudio'", () => {
    expect(fixture.sourceModule).toBe("agentStudio");
  });

  it("sourceRefId equals agentId by Phase 23 source-mapping convention", () => {
    expect(fixture.sourceRefId).toBe(fixture.agentId);
  });

  it("excludes every forbidden key (apiKey, providerConfig, secrets, etc.)", () => {
    const flat = JSON.stringify(fixture);
    for (const k of FORBIDDEN_EXPORT_CANDIDATE_KEYS) {
      expect(flat.toLowerCase()).not.toContain(`"${k.toLowerCase()}"`);
    }
  });

  it("excludes forbidden keys recursively (deep check)", () => {
    function walkKeys(node: any): string[] {
      if (node == null || typeof node !== "object") return [];
      if (Array.isArray(node)) return node.flatMap(walkKeys);
      return Object.keys(node).flatMap((k) => [k, ...walkKeys(node[k])]);
    }
    const allKeys = walkKeys(fixture);
    for (const forbidden of FORBIDDEN_EXPORT_CANDIDATE_KEYS) {
      expect(allKeys).not.toContain(forbidden);
    }
  });
});
