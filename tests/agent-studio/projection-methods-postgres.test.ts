/**
 * AsdbPostgresGraphRepository projection methods — source-scan integrity.
 *
 * Slices 8-13 of the no-deferral catalogue (2026-05-19), bundled into
 * a single PR because they all touch the same surface:
 *   8.  enqueueProjectionJob → INSERT into ags_graph_projection_sync_jobs
 *   9.  takeSnapshot → INSERT into ags_graph_projection_snapshots
 *   10. detectDrift → SELECT un-remediated from ags_graph_projection_drift_events
 *   11. rebuildProjection → INSERT + update ags_graph_projection_rebuilds
 *   12. explainPath → delegates to shortestPath (slice 5)
 *   13. applyProjectionJob → discriminated created/updated/deleted counters
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_PATH = join(
  process.cwd(),
  "server/agent-studio/services/graph/repository/postgres-graph-repository-asdb.ts",
);

function extractMethod(src: string, name: string): string {
  const start = src.indexOf(`async ${name}(`);
  if (start === -1) throw new Error(`method ${name} not found`);
  const afterStart = src.indexOf("\n  async ", start + 1);
  const end = afterStart === -1 ? src.length : afterStart;
  return src.slice(start, end);
}

describe("projection methods — table imports", () => {
  const src = readFileSync(REPO_PATH, "utf8");

  it("imports the four projection-sync tables", () => {
    expect(src).toMatch(/agsGraphProjectionSyncJobs/);
    expect(src).toMatch(/agsGraphProjectionSnapshots/);
    expect(src).toMatch(/agsGraphProjectionDriftEvents/);
    expect(src).toMatch(/agsGraphProjectionRebuilds/);
    expect(src).toMatch(
      /from\s+["'][^"']*agent-studio-graph-projection[^"']*["']/,
    );
  });

  it("imports desc + isNull from drizzle-orm for the SELECT operations", () => {
    expect(src).toMatch(/import\s+\{[^}]*\bdesc\b[^}]*\bisNull\b[^}]*\}\s+from\s+["']drizzle-orm["']/s);
  });
});

describe("enqueueProjectionJob (slice 8)", () => {
  const src = readFileSync(REPO_PATH, "utf8");
  const m = extractMethod(src, "enqueueProjectionJob");

  it("no longer returns the {jobId: 0} stub", () => {
    expect(m).not.toMatch(/^\s*async enqueueProjectionJob\(\)\s*\{\s*return\s*\{\s*jobId:\s*0\s*\}/);
  });

  it("inserts into ags_graph_projection_sync_jobs with a returning id", () => {
    expect(m).toMatch(/\.insert\(agsGraphProjectionSyncJobs\)/);
    expect(m).toMatch(/\.returning\(\{ id: agsGraphProjectionSyncJobs\.id \}\)/);
  });

  it("accepts the ProjectionSyncJobInput shape (typed by repository interface)", () => {
    expect(m).toMatch(/input:\s*ProjectionSyncJobInput/);
    expect(m).toMatch(/input\.projectionKey/);
    expect(m).toMatch(/input\.triggerEvent/);
    expect(m).toMatch(/input\.triggerPayload/);
  });
});

describe("takeSnapshot (slice 9)", () => {
  const src = readFileSync(REPO_PATH, "utf8");
  const m = extractMethod(src, "takeSnapshot");

  it("no longer returns the empty-string stub", () => {
    expect(m).not.toMatch(/^\s*async takeSnapshot\([^)]*\)\s*\{\s*return\s*\{\s*snapshotId:\s*["']{2}\s*\}/);
  });

  it("counts active nodes + edges for the scope", () => {
    expect(m).toMatch(/SELECT COUNT\(\*\)::int AS count FROM \$\{agsGraphNodes\}/);
    expect(m).toMatch(/SELECT COUNT\(\*\)::int AS count FROM \$\{agsGraphEdges\}/);
  });

  it("inserts into ags_graph_projection_snapshots and returns the id", () => {
    expect(m).toMatch(/\.insert\(agsGraphProjectionSnapshots\)/);
    expect(m).toMatch(/snapshotKey/);
    expect(m).toMatch(/nodeCount:\s*nodeCountRow\?\.count \?\? 0/);
    expect(m).toMatch(/edgeCount:\s*edgeCountRow\?\.count \?\? 0/);
  });
});

describe("detectDrift (slice 10)", () => {
  const src = readFileSync(REPO_PATH, "utf8");
  const m = extractMethod(src, "detectDrift");

  it("no longer returns the empty-driftEvents stub", () => {
    expect(m).not.toMatch(/^\s*async detectDrift\([^)]*\)\s*\{\s*return\s*\{\s*driftEvents:\s*\[\]\s*\}/);
  });

  it("selects un-remediated events from ags_graph_projection_drift_events for the scope", () => {
    expect(m).toMatch(/\.from\(agsGraphProjectionDriftEvents\)/);
    expect(m).toMatch(/eq\(agsGraphProjectionDriftEvents\.projectionKey, scope\)/);
    expect(m).toMatch(/isNull\(agsGraphProjectionDriftEvents\.remediatedAt\)/);
  });

  it("orders by most recently detected first + caps at 500", () => {
    expect(m).toMatch(/\.orderBy\(desc\(agsGraphProjectionDriftEvents\.detectedAt\)\)/);
    expect(m).toMatch(/\.limit\(500\)/);
  });
});

describe("rebuildProjection (slice 11)", () => {
  const src = readFileSync(REPO_PATH, "utf8");
  const m = extractMethod(src, "rebuildProjection");

  it("no longer ships the all-zeros stub", () => {
    expect(m).not.toMatch(/return\s*\{[^}]*nodesCreated:\s*0[^}]*nodesUpdated:\s*0[^}]*nodesDeleted:\s*0[^}]*edgesCreated:\s*0/);
  });

  it("inserts a pending row into ags_graph_projection_rebuilds at start", () => {
    expect(m).toMatch(/\.insert\(agsGraphProjectionRebuilds\)/);
    expect(m).toMatch(/status:\s*["']running["']/);
    expect(m).toMatch(/startedAt:\s*new Date\(\)/);
  });

  it("updates the row to completed when done with the summary", () => {
    expect(m).toMatch(/\.update\(agsGraphProjectionRebuilds\)/);
    expect(m).toMatch(/status:\s*["']completed["']/);
    expect(m).toMatch(/completedAt:\s*new Date\(\)/);
    expect(m).toMatch(/summary:\s*\{/);
  });
});

describe("explainPath (slice 12)", () => {
  const src = readFileSync(REPO_PATH, "utf8");
  const m = extractMethod(src, "explainPath");

  it("no longer returns the { path: null } stub", () => {
    expect(m).not.toMatch(/^\s*async explainPath\(\)\s*\{\s*return\s*\{\s*path:\s*null\s*\}/);
  });

  it("delegates to this.shortestPath with the runtime context", () => {
    expect(m).toMatch(/this\.shortestPath\(fromNodeId, toNodeId, runtime\)/);
  });

  it("returns { path: null } when no path exists, { path } when it does", () => {
    expect(m).toMatch(/if \(!path\) return \{ path: null \}/);
    expect(m).toMatch(/return \{ path \}/);
  });
});

describe("applyProjectionJob counters (slice 13)", () => {
  const src = readFileSync(REPO_PATH, "utf8");
  const m = extractMethod(src, "applyProjectionJob");

  it("probes existence before each upsert to discriminate created vs updated", () => {
    expect(m).toMatch(/const existing = await conn[\s\S]*\.from\(agsGraphNodes\)/);
    expect(m).toMatch(/if \(existing\[0\]\) nodesUpdated\+\+/);
    expect(m).toMatch(/else nodesCreated\+\+/);
  });

  it("increments nodesDeleted + edgesDeleted on delete kinds", () => {
    expect(m).toMatch(/nodesDeleted\+\+/);
    expect(m).toMatch(/edgesDeleted\+\+/);
  });

  it("returns the discriminated counters in the ProjectionResult", () => {
    expect(m).toMatch(/nodesUpdated,/);
    expect(m).toMatch(/nodesDeleted,/);
    expect(m).toMatch(/edgesUpdated,/);
    expect(m).toMatch(/edgesDeleted,/);
  });
});
