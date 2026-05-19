/**
 * health-alert-cron retention envelope — source-scan integrity.
 *
 * Slice 19 of the no-deferral catalogue (2026-05-19). Closes the
 * "Retention envelope: NONE … out of scope for the α slice" deferral.
 *
 * Locks:
 * - `defaultRetentionDays: 90` on the cron config.
 * - `pruneOldRuntimeAlerts` helper exists + only targets resolved rows.
 * - cron `runSweep` calls the prune with the factory-computed olderThan.
 * - `HealthAlertCronResult` carries the `pruned` count.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();

describe("health-alert.ts — pruneOldRuntimeAlerts helper", () => {
  const src = readFileSync(
    join(REPO_ROOT, "server/agent-studio/services/graph/health-alert.ts"),
    "utf8",
  );

  it("exports pruneOldRuntimeAlerts", () => {
    expect(src).toMatch(/export async function pruneOldRuntimeAlerts/);
  });

  it("imports lt from drizzle-orm for the cutoff predicate", () => {
    expect(src).toMatch(/import\s+\{[^}]*\blt\b[^}]*\}\s+from\s+["']drizzle-orm["']/s);
  });

  it("targets resolvedAt (not raisedAt) — open alerts stay un-pruned", () => {
    expect(src).toMatch(/lt\(agsRuntimeAlerts\.resolvedAt, input\.olderThan\)/);
    // Must not prune by raisedAt — would silently delete open alerts.
    expect(src).not.toMatch(/lt\(agsRuntimeAlerts\.raisedAt, input\.olderThan\)/);
  });

  it("returns { deleted } count for the cron status surface", () => {
    expect(src).toMatch(/Promise<\{\s*deleted: number\s*\}>/);
  });
});

describe("health-alert-cron — slice 19 retention wiring", () => {
  const src = readFileSync(
    join(REPO_ROOT, "server/agent-studio/services/graph/health-alert-cron.ts"),
    "utf8",
  );

  it("doc-block no longer carries 'Retention envelope: NONE'", () => {
    expect(src).not.toMatch(/Retention envelope:\s*NONE/);
  });

  it("imports pruneOldRuntimeAlerts from health-alert.ts", () => {
    expect(src).toMatch(/pruneOldRuntimeAlerts/);
  });

  it("sets defaultRetentionDays to 90", () => {
    expect(src).toMatch(/defaultRetentionDays:\s*90/);
    // The old α-slice value was `null` — make sure no regression.
    expect(src).not.toMatch(/defaultRetentionDays:\s*null/);
  });

  it("forwards olderThan into buildSweepInput", () => {
    expect(src).toMatch(/buildSweepInput:\s*\(\{\s*olderThan,\s*sweepInput\s*\}\)\s*=>/);
    expect(src).toMatch(/olderThan:\s*olderThan as Date \| null/);
  });

  it("runSweep calls pruneOldRuntimeAlerts with the cutoff", () => {
    expect(src).toMatch(/pruneOldRuntimeAlerts\(\{\s*olderThan:\s*input\.olderThan\s*\}\)/);
  });

  it("HealthAlertCronResult carries the pruned count", () => {
    expect(src).toMatch(/readonly pruned: number/);
    expect(src).toMatch(/pruned,/);
  });

  it("formatSweepLogTail surfaces the pruned count", () => {
    expect(src).toMatch(/pruned=\$\{r\.pruned\}/);
  });
});
