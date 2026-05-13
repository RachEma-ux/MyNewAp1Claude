/**
 * Retention-cron daily-sweep ladder integrity.
 *
 * The Agent Studio retention surface schedules 18 daily-sweep crons
 * across the UTC clock (03:00–20:00 UTC, one per hour). Each cron has
 * its own DEFAULT_*_RETENTION_CRON_EXPR constant in its module.
 *
 * Per-cron tests already lock each module's own default expression
 * (see tests/agent-studio/*-retention-cron.test.ts). This file is the
 * cross-module integrity layer:
 *
 *   1. Every cron's default is a daily "0 H * * *" expression
 *      (the ladder is hour-granular, not minute-granular).
 *   2. The 18 hours are all distinct — no two crons share a slot.
 *      A drift that collides two crons on the same minute would
 *      otherwise be silent until ASDB write contention surfaced it.
 *   3. All hours fall in 0..23.
 *
 * The stale-running cron (workspace-observability) is a separate
 * 10-min-cadence cron, NOT a daily-sweep slot; it is exercised
 * separately for shape (a slash-10 minute-field expression).
 *
 * Drift in any cron's slot trips a test rather than going silent
 * until ops notices a missed sweep or write-contention spike.
 *
 * Cross-reference: the SOU memo
 * `docs/implementation/agent-studio-retention-arc-state-of-the-union.md`
 * (post-closure addendum, PR #704) is the human-readable companion to
 * this test — that document lists which cron sits at which slot.
 */

import { describe, it, expect } from "vitest";

import { DEFAULT_RUNTIME_RUNS_RETENTION_CRON_EXPR } from "../../server/agent-studio/services/runtime-runs-retention-cron";
import { DEFAULT_TOOL_CALL_TRACES_RETENTION_CRON_EXPR } from "../../server/agent-studio/services/tool-call-traces-retention-cron";
import { DEFAULT_MCP_TRANSITIONS_RETENTION_CRON_EXPR } from "../../server/agent-studio/services/mcp-transitions-retention-cron";
import { DEFAULT_RAC_RUNTIME_TRACES_RETENTION_CRON_EXPR } from "../../server/agent-studio/services/rac-runtime-traces-retention-cron";
import { DEFAULT_CATALOG_SYNC_LOG_RETENTION_CRON_EXPR } from "../../server/agent-studio/services/catalog-sync-log-retention-cron";
import { DEFAULT_TEST_RUNS_RETENTION_CRON_EXPR } from "../../server/agent-studio/services/test-runs-retention-cron";
import { DEFAULT_SIMULATION_RUNS_RETENTION_CRON_EXPR } from "../../server/agent-studio/services/simulation-runs-retention-cron";
import { DEFAULT_GRAPH_QUALITY_SCANS_RETENTION_CRON_EXPR } from "../../server/agent-studio/services/graph-quality-scans-retention-cron";
import { DEFAULT_GRAPH_CORRECTION_PROPOSALS_RETENTION_CRON_EXPR } from "../../server/agent-studio/services/graph-correction-proposals-retention-cron";
import { DEFAULT_CAG_PACK_EVENTS_RETENTION_CRON_EXPR } from "../../server/agent-studio/services/cag-pack-events-retention-cron";
import { DEFAULT_GRAPH_QUALITY_AGENT_RUNS_RETENTION_CRON_EXPR } from "../../server/agent-studio/services/graph-quality-agent-runs-retention-cron";
import { DEFAULT_INGESTION_JOBS_RETENTION_CRON_EXPR } from "../../server/agent-studio/services/ingestion-jobs-retention-cron";
import { DEFAULT_GRAPH_CHANGE_PROPOSALS_RETENTION_CRON_EXPR } from "../../server/agent-studio/services/graph-change-proposals-retention-cron";
import { DEFAULT_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_CRON_EXPR } from "../../server/agent-studio/services/graph-agent/retention-cron";
import { DEFAULT_PUBLISH_REQUESTS_RETENTION_CRON_EXPR } from "../../server/agent-studio/services/publish-requests-retention-cron";
import { DEFAULT_APPROVAL_STEPS_RETENTION_CRON_EXPR } from "../../server/agent-studio/services/approval-steps-retention-cron";
import { DEFAULT_NOTE_PROMOTIONS_RETENTION_CRON_EXPR } from "../../server/agent-studio/services/note-promotions-retention-cron";
import { DEFAULT_RETENTION_CRON_EXPR as DEFAULT_WORKSPACE_OBSERVABILITY_RETENTION_CRON_EXPR } from "../../server/agent-studio/services/workspace-observability/retention-cron";
import { DEFAULT_STALE_RUNNING_CRON_EXPR } from "../../server/agent-studio/services/workspace-observability/stale-running-job-cron";

/**
 * Each entry is `[short-name, defaultCronExpr]`. The short-name is
 * the suffix of the module path — keeps assertion failures readable.
 */
const DAILY_SWEEP_LADDER: ReadonlyArray<readonly [string, string]> = [
  ["workspace-observability", DEFAULT_WORKSPACE_OBSERVABILITY_RETENTION_CRON_EXPR],
  ["runtime-runs", DEFAULT_RUNTIME_RUNS_RETENTION_CRON_EXPR],
  ["tool-call-traces", DEFAULT_TOOL_CALL_TRACES_RETENTION_CRON_EXPR],
  ["mcp-transitions", DEFAULT_MCP_TRANSITIONS_RETENTION_CRON_EXPR],
  ["catalog-sync-log", DEFAULT_CATALOG_SYNC_LOG_RETENTION_CRON_EXPR],
  ["rac-runtime-traces", DEFAULT_RAC_RUNTIME_TRACES_RETENTION_CRON_EXPR],
  ["cag-pack-events", DEFAULT_CAG_PACK_EVENTS_RETENTION_CRON_EXPR],
  ["simulation-runs", DEFAULT_SIMULATION_RUNS_RETENTION_CRON_EXPR],
  ["test-runs", DEFAULT_TEST_RUNS_RETENTION_CRON_EXPR],
  ["graph-quality-scans", DEFAULT_GRAPH_QUALITY_SCANS_RETENTION_CRON_EXPR],
  ["graph-correction-proposals", DEFAULT_GRAPH_CORRECTION_PROPOSALS_RETENTION_CRON_EXPR],
  ["graph-quality-agent-runs", DEFAULT_GRAPH_QUALITY_AGENT_RUNS_RETENTION_CRON_EXPR],
  ["ingestion-jobs", DEFAULT_INGESTION_JOBS_RETENTION_CRON_EXPR],
  ["graph-change-proposals", DEFAULT_GRAPH_CHANGE_PROPOSALS_RETENTION_CRON_EXPR],
  ["graph-agent-runtime-traces", DEFAULT_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_CRON_EXPR],
  ["publish-requests", DEFAULT_PUBLISH_REQUESTS_RETENTION_CRON_EXPR],
  ["approval-steps", DEFAULT_APPROVAL_STEPS_RETENTION_CRON_EXPR],
  ["note-promotions", DEFAULT_NOTE_PROMOTIONS_RETENTION_CRON_EXPR],
];

const DAILY_SWEEP_EXPR = /^0 (\d{1,2}) \* \* \*$/;

describe("retention-cron daily-sweep ladder integrity", () => {
  it("registers exactly 18 daily-sweep crons", () => {
    // If this trips, add or remove the matching import + ladder entry
    // and update docs/implementation/agent-studio-retention-arc-state-of-the-union.md.
    expect(DAILY_SWEEP_LADDER).toHaveLength(18);
  });

  it("every cron default is a daily 0 H * * * expression", () => {
    for (const [name, expr] of DAILY_SWEEP_LADDER) {
      expect(
        expr,
        `[${name}] default cron expression must be a daily "0 H * * *" form (the ladder is hour-granular)`,
      ).toMatch(DAILY_SWEEP_EXPR);
    }
  });

  it("every hour is in 0..23", () => {
    for (const [name, expr] of DAILY_SWEEP_LADDER) {
      const m = expr.match(DAILY_SWEEP_EXPR);
      expect(m, `[${name}] could not parse hour from "${expr}"`).not.toBeNull();
      const hour = Number(m![1]);
      expect(hour, `[${name}] hour out of range: ${hour}`).toBeGreaterThanOrEqual(0);
      expect(hour, `[${name}] hour out of range: ${hour}`).toBeLessThanOrEqual(23);
    }
  });

  it("no two crons share the same UTC hour slot", () => {
    const byHour = new Map<number, string[]>();
    for (const [name, expr] of DAILY_SWEEP_LADDER) {
      const hour = Number(expr.match(DAILY_SWEEP_EXPR)![1]);
      if (!byHour.has(hour)) byHour.set(hour, []);
      byHour.get(hour)!.push(name);
    }
    const collisions = [...byHour.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([hour, names]) => `${hour}:00 UTC = [${names.join(", ")}]`);
    expect(
      collisions,
      `Collisions detected — two or more retention crons scheduled at the same UTC hour:\n  ${collisions.join("\n  ")}\nPick distinct hours; update the SOU memo's ladder table.`,
    ).toEqual([]);
  });

  it("ladder occupies a contiguous run starting at 3:00 UTC (current shape)", () => {
    // Spreading writes across distinct minutes was the original
    // design intent (SOU §"Daily-sweep ladder"). The current ladder
    // happens to be contiguous 03..20 UTC. This invariant is *not*
    // load-bearing — if a future cron is slotted at, say, 02:00 UTC
    // or 22:00 UTC, update this assertion. The previous "no-collisions"
    // test is the real safety net; this one is documentation-as-test.
    const hours = DAILY_SWEEP_LADDER.map(([, e]) => Number(e.match(DAILY_SWEEP_EXPR)![1])).sort(
      (a, b) => a - b,
    );
    expect(hours[0]).toBe(3);
    expect(hours[hours.length - 1]).toBe(20);
    expect(hours).toHaveLength(18);
  });
});

describe("workspace-observability stale-running cron — separate cadence", () => {
  it("uses a 10-min cadence (not a daily-sweep slot)", () => {
    expect(DEFAULT_STALE_RUNNING_CRON_EXPR).toBe("*/10 * * * *");
  });
});
