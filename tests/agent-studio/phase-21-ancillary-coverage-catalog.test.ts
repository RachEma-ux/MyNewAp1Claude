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
  "canvas-node-kind-metadata.test.ts",
  "attachment-mime-class-metadata.test.ts",
  "publish-request-state-metadata.test.ts",
  "approval-step-state-metadata.test.ts",
  "note-promotion-state-metadata.test.ts",
  "extension-governance-status-metadata.test.ts",
  "extension-capability-lane-metadata.test.ts",
  "extension-capability-check-metadata.test.ts",
  "graph-health-alert-key-metadata.test.ts",
  "realtime-doc-frame-type-metadata.test.ts",
  "canvas-projection-event-row-kind-metadata.test.ts",
  "runtime-config-block-metadata.test.ts",
  "browse-sort-key-metadata.test.ts",
  "security-impact-path-step-metadata.test.ts",
  "ags-lifecycle-state-metadata.test.ts",
  "ags-agent-class-metadata.test.ts",
  "ags-autonomy-level-metadata.test.ts",
  "ags-environment-metadata.test.ts",
  "ags-governance-verdict-metadata.test.ts",
  "ags-memory-type-metadata.test.ts",
  "ags-visibility-metadata.test.ts",
  "ags-run-status-metadata.test.ts",
  "ags-test-verdict-metadata.test.ts",
  "ags-mcp-status-metadata.test.ts",
  "ags-permission-mode-metadata.test.ts",
  "ags-permission-behavior-metadata.test.ts",
  "ags-effort-level-metadata.test.ts",
  "ags-mcp-transport-metadata.test.ts",
  "ags-permission-source-metadata.test.ts",
  "ags-memory-scope-metadata.test.ts",
  "ags-tool-invocation-kind-metadata.test.ts",
  "ags-skill-source-metadata.test.ts",
  "ags-tool-category-metadata.test.ts",
  "ags-provider-key-metadata.test.ts",
  "ags-hook-event-metadata.test.ts",
  "ags-required-publish-field-metadata.test.ts",
  "quality-finding-severity-metadata.test.ts",
  "text2cypher-validation-failure-reason-metadata.test.ts",
  "export-candidate-key-metadata.test.ts",
  "forbidden-export-candidate-key-metadata.test.ts",
  "rac-planner-mode-family-metadata.test.ts",
  "rac-source-retrieval-mechanism-metadata.test.ts",
  "contracted-extension-lane-metadata.test.ts",
  "allowed-procedure-namespace-metadata.test.ts",
  "drift-class-metadata.test.ts",
  "cag-pack-status-metadata.test.ts",
  "cag-pack-event-severity-metadata.test.ts",
  "cag-pack-actor-type-metadata.test.ts",
  "cag-pack-event-type-metadata.test.ts",
  "cag-compile-result-metadata.test.ts",
  "cag-governance-verdict-metadata.test.ts",
  "tool-risk-class-metadata.test.ts",
  "promotion-status-metadata.test.ts",
  "proposed-tool-call-risk-level-metadata.test.ts",
  "command-scope-metadata.test.ts",
  "graph-backend-health-status-metadata.test.ts",
  "composer-mode-metadata.test.ts",
  "rac-readiness-status-metadata.test.ts",
  "marketplace-item-source-metadata.test.ts",
  "conflict-behavior-metadata.test.ts",
  "http-method-metadata.test.ts",
  "graph-quality-agent-run-status-metadata.test.ts",
  "rac-trace-feedback-verdict-metadata.test.ts",
  "pii-severity-metadata.test.ts",
  "runtime-graph-event-kind-metadata.test.ts",
  "runtime-validation-verdict-metadata.test.ts",
  "graph-skill-risk-level-metadata.test.ts",
  "runtime-dispatch-result-metadata.test.ts",
  "saved-views-default-lens-kind.test.ts",
  "static-fact-retrieve-hook.test.ts",
  "static-chunk-assemble-hook.test.ts",
  "static-block-compose-hook.test.ts",
  "summarize-lane-hook-registry.test.ts",
  "summarize-extensions.test.ts",
  "summarize-quality-scanner-registry.test.ts",
  "summarize-cag-capability-packs.test.ts",
  "summarize-command-registry.test.ts",
  "summarize-proposed-tool-calls.test.ts",
  "summarize-publish-targets.test.ts",
  "summarize-publish-executions.test.ts",
  "summarize-promotions.test.ts",
  "summarize-approval-steps.test.ts",
  "summarize-publish-requests.test.ts",
  "summarize-note-promotions.test.ts",
  "summarize-graph-quality-agent-runs.test.ts",
  "summarize-tool-call-traces.test.ts",
  "summarize-canvas-nodes.test.ts",
  "summarize-runtime-runs.test.ts",
  "summarize-ingestion-jobs.test.ts",
  "summarize-saved-views.test.ts",
  "summarize-knowledge-units.test.ts",
  "summarize-error-events.test.ts",
  "summarize-background-jobs.test.ts",
  "summarize-pending-permission-requests.test.ts",
  "summarize-projection-drift-events.test.ts",
  "summarize-rac-sources.test.ts",
  "summarize-user-notifications.test.ts",
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
