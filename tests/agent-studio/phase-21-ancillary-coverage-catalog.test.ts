/**
 * Phase 21 §7 — Ancillary contract / validator coverage lockstep.
 *
 * Locks the §7 catalog (added 2026-05-15) against the actual tests/
 * filesystem. When a referenced test file is removed without updating
 * the catalog, this test trips. Same lockstep pattern as the Phase 22
 * emission-audit coverage guard (#1012).
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const catalogPath = resolve(
  __dirname,
  "../../docs/implementation/agent-studio-phase-21-continuous-graph-testing-catalog.md",
);

const TEST_DIR = resolve(__dirname, "..");

// Files referenced in §7.1 + §7.2.
const ANCILLARY_TESTS = [
  "graph-lens-registry.test.ts",
  "graph-lens-default-installer.test.ts",
  "graph-lens-impact-analysis-contracts.test.ts",
  "graph-lens-runner-contract.test.ts",
  "graph-lens-stub-runners.test.ts",
  "graph-lens-install-default-stack.test.ts",
  "boot-step-3-35-lens-stack.test.ts",
  "institutional-memory-contracts.test.ts",
  "institutional-memory-node-projector.test.ts",
  "security-graph-contracts.test.ts",
  "security-graph-path-navigation.test.ts",
  "recommendation-contracts.test.ts",
  "recommendation-assemble-response.test.ts",
  "code-intelligence-contracts.test.ts",
  "code-graph-batch-validator.test.ts",
  "graph-algorithm-contracts.test.ts",
  "graph-algorithm-preflight.test.ts",
  "failure-states-contracts.test.ts",
  "failure-state-observability-bridge.test.ts",
  "phase-22-emission-audit-coverage.test.ts",
  "health-alert-failure-state-wiring.test.ts",
  "drift-cron-failure-state-wiring.test.ts",
  "safety-filter-failure-state-wiring.test.ts",
  "detect-tool-schema-changes.test.ts",
  "text2cypher-failure-state-wiring.test.ts",
  "cypher-template-failure-state-wiring.test.ts",
  "failure-state-bridge-wiring-coverage.test.ts",
  "graph-quality-missing-source-version-scanner.test.ts",
  "phase-21-gap-18-timeline-event-projection.test.ts",
  "phase-22-burst-summary-coverage.test.ts",
  "phase-23-runbook-coverage.test.ts",
  "roadmap-phase-22-acceptance-coverage.test.ts",
  "scanner-metadata-coverage.test.ts",
  "security-graph-severity-helpers.test.ts",
  "failure-state-summarize.test.ts",
  "recommendation-summarize.test.ts",
  "institutional-memory-coverage-summary.test.ts",
  "security-graph-finding-summary.test.ts",
  "code-graph-summarize.test.ts",
  "graph-algorithm-coverage.test.ts",
  "graph-lens-registry-summary.test.ts",
  "canonical-failure-state-annotations.test.ts",
  "impact-analysis-result-summary.test.ts",
  "lens-snapshot-summary.test.ts",
  "failure-state-event-list-summary.test.ts",
  "quality-finding-list-summary.test.ts",
  "extract-failure-state-annotations.test.ts",
  "recommendation-candidate-list-summary.test.ts",
  "security-graph-impact-path-helpers.test.ts",
  "security-graph-validation-summary.test.ts",
  "quality-finding-severity-helpers.test.ts",
  "failure-state-severity-helpers.test.ts",
  "failure-state-category-severity-matrix.test.ts",
  "annotate-rows-with-failure-state.test.ts",
  "code-graph-cardinality-summary.test.ts",
  "institutional-memory-projection-summary.test.ts",
  "lens-runner-registry-coverage.test.ts",
  "finding-class-for-proposal-kind.test.ts",
  "failure-state-row-collection-helpers.test.ts",
  "recommendation-kind-metadata.test.ts",
  "graph-lens-kind-metadata.test.ts",
  "security-graph-node-type-metadata.test.ts",
  "code-graph-node-type-metadata.test.ts",
  "institutional-memory-node-type-metadata.test.ts",
  "impact-analysis-kind-metadata.test.ts",
  "failure-state-category-metadata.test.ts",
  "failure-state-severity-metadata.test.ts",
  "recommendation-permission-status-metadata.test.ts",
  "graph-lens-layout-metadata.test.ts",
  "graph-lens-governance-scope-metadata.test.ts",
  "graph-algorithm-backend-support-metadata.test.ts",
  "quality-scanner-category-metadata.test.ts",
  "security-finding-severity-metadata.test.ts",
  "code-graph-edge-type-metadata.test.ts",
  "graph-algorithm-kind-metadata.test.ts",
  "institutional-memory-skip-reason-metadata.test.ts",
  "graph-algorithm-preflight-decision-metadata.test.ts",
  "impact-path-validation-reason-metadata.test.ts",
  "failure-state-label.test.ts",
  "quality-proposal-kind-metadata.test.ts",
  "graphrag-retrieval-method-metadata.test.ts",
  "rac-planner-mode-metadata.test.ts",
  "rac-source-type-metadata.test.ts",
  "rac-retrieval-health-status-metadata.test.ts",
  "rac-owner-module-metadata.test.ts",
  "publish-target-type-metadata.test.ts",
  "publish-execution-status-metadata.test.ts",
  "publish-governance-decision-metadata.test.ts",
  "agentic-planner-action-kind-metadata.test.ts",
  "saved-view-visibility-metadata.test.ts",
  "realtime-doc-deny-reason-metadata.test.ts",
  "export-eligibility-gate-metadata.test.ts",
];

describe("Phase 21 §7 ancillary coverage catalog", () => {
  const catalog = readFileSync(catalogPath, "utf8");

  it.each(ANCILLARY_TESTS)(
    "%s exists on disk",
    (name) => {
      expect(existsSync(resolve(TEST_DIR, "agent-studio", name))).toBe(true);
    },
  );

  it.each(ANCILLARY_TESTS)(
    "%s is referenced in the catalog",
    (name) => {
      expect(catalog).toContain("`" + name + "`");
    },
  );

  it("references the 3 §7.3 gap statuses (12 / 18 / 3+8)", () => {
    expect(catalog).toContain("Gap #");
    // Loose check — the table lists each gap number.
    expect(catalog).toMatch(/\|\s*12\s*\|/);
    expect(catalog).toMatch(/\|\s*18\s*\|/);
    expect(catalog).toMatch(/\|\s*3 \+ 8\s*\|/);
  });

  it("notes gap #18 projection helper shipped @ #1010", () => {
    expect(catalog).toContain("Projection helper shipped");
    expect(catalog).toContain("#1010");
  });
});
