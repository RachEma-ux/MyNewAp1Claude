// Retention-cron UI panel coverage.
//
// Each of the 18 daily-sweep retention crons (see
// retention-cron-ladder-integrity.test.ts) has an operator UI surface
// in client/src/modules/agent-studio/pages/RetrofitPage.tsx. The
// usual shape is a `*RetentionPanel` component; the workspace-
// observability bundled sweep uses `CronStatusPanel` because its
// status response combines multiple table sweeps.
//
// Same drift class as the other source-scan integrity tests in this
// directory: if a new retention cron is added but no UI panel is
// declared, operators cannot monitor it from the RetrofitPage. The
// per-cron tests + the boot-wiring test would still pass — the cron
// runs in the background — but the operator-triage surface drifts
// silent.
//
// Method is source-scan only against RetrofitPage.tsx. Each
// EXPECTED_PANELS entry pairs the cron module name (for readable
// failures) with the expected component name (e.g. RuntimeRunsRetentionPanel).
// Two crons share `CronStatusPanel` (the workspace-observability
// bundled sweep) — that's intentional and noted below.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const RETROFIT_PAGE_PATH = join(
  REPO_ROOT,
  "client",
  "src",
  "modules",
  "agent-studio",
  "pages",
  "RetrofitPage.tsx",
);

// Each entry pairs a retention-cron module name with the React
// component expected to render its operator surface. Drift in either
// field forces an EXPECTED_PANELS update.
const EXPECTED_PANELS: ReadonlyArray<{ cron: string; component: string }> = [
  // Original 15 daily-sweep slots (03–17 UTC)
  { cron: "workspace-observability", component: "CronStatusPanel" }, // bundled status — covers 3 tables
  { cron: "runtime-runs", component: "RuntimeRunsRetentionPanel" },
  { cron: "tool-call-traces", component: "ToolCallTracesRetentionPanel" },
  { cron: "mcp-transitions", component: "McpTransitionsRetentionPanel" },
  { cron: "catalog-sync-log", component: "CatalogSyncLogRetentionPanel" },
  { cron: "rac-runtime-traces", component: "RacRuntimeTracesRetentionPanel" },
  { cron: "cag-pack-events", component: "CagPackEventsRetentionPanel" },
  { cron: "simulation-runs", component: "SimulationRunsRetentionPanel" },
  { cron: "test-runs", component: "TestRunsRetentionPanel" },
  { cron: "graph-quality-scans", component: "GraphQualityScansRetentionPanel" },
  { cron: "graph-correction-proposals", component: "GraphCorrectionProposalsRetentionPanel" },
  { cron: "graph-quality-agent-runs", component: "GraphQualityAgentRunsRetentionPanel" },
  { cron: "ingestion-jobs", component: "IngestionJobsRetentionPanel" },
  { cron: "graph-change-proposals", component: "GraphChangeProposalsRetentionPanel" },
  { cron: "graph-agent-runtime-traces", component: "GraphAgentRuntimeTracesRetentionPanel" },

  // Approval-lifecycle daily-sweep slots (18–20 UTC) — PR #693 / #695
  { cron: "publish-requests", component: "PublishRequestsRetentionPanel" },
  { cron: "approval-steps", component: "ApprovalStepsRetentionPanel" },
  { cron: "note-promotions", component: "NotePromotionsRetentionPanel" },
];

// Track 2 archival (different shape — not a cron, separate archival
// workflow) is intentionally covered here too because its operator
// surface lives in the same RetrofitPage and would otherwise have
// no integrity lock.
const EXTRA_OPERATOR_SURFACES: ReadonlyArray<{ shipped: string; component: string }> = [
  { shipped: "release-audit-refs Track 2 archival (#698)", component: "ReleaseAuditRefsArchivalPanel" },
];

describe("retention-cron UI panel coverage", () => {
  const src = readFileSync(RETROFIT_PAGE_PATH, "utf8");

  it("registers exactly 18 retention-cron panel mappings", () => {
    expect(EXPECTED_PANELS).toHaveLength(18);
  });

  for (const { cron, component } of EXPECTED_PANELS) {
    it(`RetrofitPage declares ${component} for the ${cron} retention cron`, () => {
      const declRe = new RegExp(`\\bfunction\\s+${component}\\s*\\(`);
      expect(
        src,
        `RetrofitPage.tsx is missing the ${component} component for the ` +
          `${cron} retention cron. If you added a new cron to the daily-sweep ` +
          `ladder, also declare its operator UI panel in RetrofitPage so the ` +
          `cron status is reachable from the operator dashboard.`,
      ).toMatch(declRe);
    });
  }

  for (const { shipped, component } of EXTRA_OPERATOR_SURFACES) {
    it(`RetrofitPage declares ${component} (${shipped})`, () => {
      const declRe = new RegExp(`\\bfunction\\s+${component}\\s*\\(`);
      expect(src, `RetrofitPage.tsx is missing the ${component} component`).toMatch(
        declRe,
      );
    });
  }
});
