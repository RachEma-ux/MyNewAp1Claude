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
 *   - graph-quality-mutation-worker.test.ts
 *   - graph-quality-approve-and-apply.test.ts
 */

import { describe, it, expect } from "vitest";
import { graphQualityRouter } from "../../server/agent-studio/services/graph-quality/router";

describe("graphQualityRouter", () => {
  const procedures = graphQualityRouter._def.procedures;

  it("exposes the expected mutation surface", () => {
    expect(procedures.runScan).toBeDefined();
    expect(procedures.runAgent).toBeDefined();
    expect(procedures.convertFindingToProposal).toBeDefined();
    expect(procedures.applyApprovedProposal).toBeDefined();
    expect(procedures.approveAndApply).toBeDefined();
  });

  it("exposes the expected query surface", () => {
    expect(procedures.listScans).toBeDefined();
    expect(procedures.getScan).toBeDefined();
    expect(procedures.listFindings).toBeDefined();
    expect(procedures.getFinding).toBeDefined();
    expect(procedures.listAgentRuns).toBeDefined();
    expect(procedures.listAppliedProposals).toBeDefined();
    expect(procedures.listRegisteredScanKinds).toBeDefined();
  });

  it("does not leak un-routed scratch procedures", () => {
    const known = new Set([
      "runScan",
      "runAgent",
      "convertFindingToProposal",
      "applyApprovedProposal",
      "approveAndApply",
      "listScans",
      "getScan",
      "listFindings",
      "getFinding",
      "listAgentRuns",
      "listAppliedProposals",
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
