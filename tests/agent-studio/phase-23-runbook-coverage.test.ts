/**
 * Phase 23 quality-agent operator runbook lockstep.
 *
 * Asserts the runbook enumerates every registered scanKind from
 * `QUALITY_SCANNER_REGISTRY` and references the closed-taxonomy
 * lifecycle. When a future PR adds a new scanner, this test forces
 * the runbook §1 table to be updated.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { QUALITY_SCANNER_REGISTRY } from "../../server/agent-studio/services/graph-quality/public-api";

const runbookPath = resolve(
  __dirname,
  "../../docs/runbooks/agent-studio-phase-23-graph-quality-agent-runbook.md",
);

describe("Phase 23 quality-agent runbook lockstep", () => {
  const runbook = readFileSync(runbookPath, "utf8");

  it("enumerates every registered scanKind in §1", () => {
    for (const r of QUALITY_SCANNER_REGISTRY) {
      expect(runbook).toContain("`" + r.scanKind + "`");
    }
  });

  it("documents the 4-step lifecycle (scan → finding → proposal → mutation)", () => {
    expect(runbook).toContain("[Quality Agent scan]");
    expect(runbook).toContain("[QualityFinding rows");
    expect(runbook).toContain("[GraphCorrectionProposal");
    expect(runbook).toContain("[Postgres SoT mutation]");
  });

  it("references the ApprovalSteps gate adapter (#776 AS-1)", () => {
    expect(runbook).toContain("ApprovalSteps gate adapter");
    expect(runbook).toContain("#776");
  });

  it("references the Phase 22 closed-taxonomy emission (#1026 entity_resolution_conflict)", () => {
    expect(runbook).toContain("entity_resolution_conflict");
    expect(runbook).toContain("#1026");
  });

  it("references the dashboard query convention (failure_state:% LIKE)", () => {
    expect(runbook).toContain("LIKE 'failure_state:%'");
  });

  it("contributes to Phase 28 acceptance criterion #30", () => {
    expect(runbook).toContain("acceptance criterion #30");
  });

  it("contains the 'Common scenarios' triage section", () => {
    expect(runbook).toContain("Common scenarios");
  });

  it("has at least 10 scanKind entries (matches the registry size)", () => {
    expect(QUALITY_SCANNER_REGISTRY.length).toBeGreaterThanOrEqual(10);
    // The §1 table starts with `| scanKind |` — one row per registered
    // scanner. We verify the table has at least 10 rows by counting
    // the backtick-quoted scanKind tokens, allowing for the markdown
    // table-header row.
    const matches = runbook.match(/\| `[a-z_]+` \|/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(10);
  });
});
