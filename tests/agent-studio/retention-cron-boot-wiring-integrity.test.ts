// Retention-cron boot-wiring integrity.
//
// Each of the 18 daily-sweep retention crons (see
// retention-cron-ladder-integrity.test.ts) exports an
// ensure*RetentionCronStarted() function that must be called from
// boot.ts so the cron actually fires after the server listens. The
// same drift class as the publish/promotion-router mount drift could
// recur here: a cron file is added, the ladder grows, but nobody
// adds the boot wire — the cron silently never fires.
//
// This test enforces the wiring invariant:
//
//   FOR EVERY ensure*RetentionCronStarted symbol exported by the 18
//   cron modules, THERE MUST BE a matching ensure*RetentionCronStarted()
//   call inside a try/catch block in server/agent-studio/boot.ts.
//
// Method is source-scan only — no runtime boot, no DB, no governance
// loader pulled in. Each expected wire is one entry in EXPECTED_WIRES;
// adding or removing a retention cron forces a parallel update here,
// which is exactly the lockstep we want.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const BOOT_PATH = join(REPO_ROOT, "server", "agent-studio", "boot.ts");

// Each entry is the bare name of the ensureStarted symbol the cron
// module exports. The same 18 retention crons locked in
// retention-cron-ladder-integrity.test.ts; the workspace-observability
// stale-running cron is intentionally separate.
const EXPECTED_WIRES: ReadonlyArray<{ name: string; cronModule: string }> = [
  // Original 15 daily-sweep slots (03–17 UTC)
  { name: "ensureRetentionCronStarted", cronModule: "workspace-observability" },
  { name: "ensureRuntimeRunsRetentionCronStarted", cronModule: "runtime-runs" },
  { name: "ensureToolCallTracesRetentionCronStarted", cronModule: "tool-call-traces" },
  { name: "ensureMcpTransitionsRetentionCronStarted", cronModule: "mcp-transitions" },
  { name: "ensureCatalogSyncLogRetentionCronStarted", cronModule: "catalog-sync-log" },
  { name: "ensureRacRuntimeTracesRetentionCronStarted", cronModule: "rac-runtime-traces" },
  { name: "ensureCagPackEventsRetentionCronStarted", cronModule: "cag-pack-events" },
  { name: "ensureSimulationRunsRetentionCronStarted", cronModule: "simulation-runs" },
  { name: "ensureTestRunsRetentionCronStarted", cronModule: "test-runs" },
  { name: "ensureGraphQualityScansRetentionCronStarted", cronModule: "graph-quality-scans" },
  { name: "ensureGraphCorrectionProposalsRetentionCronStarted", cronModule: "graph-correction-proposals" },
  { name: "ensureGraphQualityAgentRunsRetentionCronStarted", cronModule: "graph-quality-agent-runs" },
  { name: "ensureIngestionJobsRetentionCronStarted", cronModule: "ingestion-jobs" },
  { name: "ensureGraphChangeProposalsRetentionCronStarted", cronModule: "graph-change-proposals" },
  { name: "ensureGraphAgentRuntimeTracesRetentionCronStarted", cronModule: "graph-agent-runtime-traces" },

  // Approval-lifecycle daily-sweep slots (18–20 UTC) — PR #693
  { name: "ensurePublishRequestsRetentionCronStarted", cronModule: "publish-requests" },
  { name: "ensureApprovalStepsRetentionCronStarted", cronModule: "approval-steps" },
  { name: "ensureNotePromotionsRetentionCronStarted", cronModule: "note-promotions" },
];

describe("retention-cron boot-wiring integrity", () => {
  const src = readFileSync(BOOT_PATH, "utf8");

  it("registers exactly 18 retention-cron ensure wires", () => {
    expect(EXPECTED_WIRES).toHaveLength(18);
  });

  for (const { name, cronModule } of EXPECTED_WIRES) {
    it(`boot.ts calls ${name}() for the ${cronModule} retention cron`, () => {
      const callRe = new RegExp(`\\b${name}\\s*\\(\\s*\\)`);
      expect(
        src,
        `boot.ts is missing the ${name}() call. If you renamed/removed ` +
          `the ${cronModule} retention cron, update EXPECTED_WIRES and the ` +
          `ladder-integrity test in lockstep. If the wire was just ` +
          `dropped, the cron silently never fires — re-add the try-catch ` +
          `block in boot.ts.`,
      ).toMatch(callRe);
    });
  }

  it("each ensure*RetentionCronStarted() call is wrapped in a try/catch (fail-soft startup)", () => {
    // For each EXPECTED_WIRES name, find the line index of the call
    // and verify that the nearest preceding `try {` and following
    // `catch (` bracket the call. The check is intentionally
    // permissive — it just needs to confirm fail-soft posture, not
    // dictate exact catch-block content.
    const lines = src.split("\n");
    const bare: string[] = [];
    for (const { name } of EXPECTED_WIRES) {
      const callRe = new RegExp(`\\b${name}\\s*\\(\\s*\\)`);
      const idx = lines.findIndex((l) => callRe.test(l));
      if (idx < 0) continue; // already covered by the per-wire test
      // Look back up to 10 lines for a `try {` and forward up to 15 for `} catch`.
      const back = lines.slice(Math.max(0, idx - 10), idx).join("\n");
      const fwd = lines.slice(idx, Math.min(lines.length, idx + 15)).join("\n");
      const hasTry = /\btry\s*\{/.test(back);
      const hasCatch = /\}\s*catch\s*\(/.test(fwd);
      if (!hasTry || !hasCatch) bare.push(name);
    }
    expect(
      bare,
      bare.length === 0
        ? ""
        : "Retention-cron ensure calls without surrounding try/catch:\n  " +
            bare.join("\n  ") +
            "\nEach cron start must be fail-soft — a per-cron startup " +
            "failure cannot crash the whole boot sequence.",
    ).toEqual([]);
  });
});
