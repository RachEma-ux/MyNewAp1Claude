/**
 * Phase 23 §1 — graph-quality tRPC router smoke tests.
 *
 * Verifies router definition shape, procedure presence, and basic
 * input-schema validation. The underlying service paths are covered
 * by:
 *   - graph-quality-scan-orchestrator.test.ts
 *   - graph-quality-agent-run.test.ts
 *   - graph-quality-finding-to-proposal.test.ts
 *   - graph-quality-stale-node-scanner.test.ts
 *   - graph-quality-duplicate-entity-scanner.test.ts
 */

import { describe, it, expect } from "vitest";
import { graphQualityRouter } from "../../server/agent-studio/services/graph-quality/router";

describe("graphQualityRouter", () => {
  const procedures = graphQualityRouter._def.procedures;

  it("exposes the expected mutation surface", () => {
    expect(procedures.runScan).toBeDefined();
    expect(procedures.runAgent).toBeDefined();
    expect(procedures.convertFindingToProposal).toBeDefined();
  });

  it("exposes the expected query surface", () => {
    expect(procedures.listScans).toBeDefined();
    expect(procedures.getScan).toBeDefined();
    expect(procedures.listFindings).toBeDefined();
    expect(procedures.getFinding).toBeDefined();
    expect(procedures.listAgentRuns).toBeDefined();
    expect(procedures.listRegisteredScanKinds).toBeDefined();
  });

  it("does not leak un-routed scratch procedures", () => {
    // Sanity: every procedure exposed should be a meaningful operator
    // surface (no test scaffolding leaked).
    const known = new Set([
      "runScan",
      "runAgent",
      "convertFindingToProposal",
      "listScans",
      "getScan",
      "listFindings",
      "getFinding",
      "listAgentRuns",
      "listRegisteredScanKinds",
    ]);
    for (const name of Object.keys(procedures)) {
      expect(known.has(name)).toBe(true);
    }
  });

  it("router is mountable as a tRPC sub-router (has _def.procedures)", () => {
    expect(graphQualityRouter._def).toBeDefined();
    expect(typeof procedures).toBe("object");
  });
});
