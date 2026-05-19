/**
 * MemgraphGraphRepository close-out — source-scan integrity.
 *
 * Slice 15 of the no-deferral catalogue (2026-05-19). The memgraph
 * backend's "Still skeleton (out of scope for this PR)" methods
 * (runAlgorithm + applyProjectionJob + enqueueProjectionJob +
 * takeSnapshot + detectDrift + rebuildProjection) are now implemented.
 *
 * Postgres-source-of-truth invariant preserved: projection writes go
 * to the same ASDB tables that AsdbPostgresGraphRepository writes to.
 * Memgraph is a read-only Bolt query path on top of those tables.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_PATH = join(
  process.cwd(),
  "server/agent-studio/services/graph/repository/memgraph-graph-repository.ts",
);

describe("MemgraphGraphRepository — close-out (source-scan)", () => {
  const src = readFileSync(REPO_PATH, "utf8");

  it("doc-block no longer carries the 'Still skeleton (out of scope for this PR)' header", () => {
    expect(src).not.toMatch(/Still skeleton \(out of scope for this PR\)/);
  });

  it("imports getAsDb + agsGraph* tables + the 4 projection tables", () => {
    expect(src).toMatch(/from\s+["'][^"']*db\/connection[^"']*["']/);
    expect(src).toMatch(/agsGraphNodes/);
    expect(src).toMatch(/agsGraphEdges/);
    expect(src).toMatch(/agsGraphProjectionSyncJobs/);
    expect(src).toMatch(/agsGraphProjectionSnapshots/);
    expect(src).toMatch(/agsGraphProjectionDriftEvents/);
    expect(src).toMatch(/agsGraphProjectionRebuilds/);
  });

  it("imports GraphCapabilityUnsupportedError from ./types", () => {
    expect(src).toMatch(/import\s+\{\s*GraphCapabilityUnsupportedError\s*\}\s+from\s+["']\.\/types\.js["']/);
  });

  it("upsertNode writes through to ASDB via onConflictDoUpdate (Postgres = SoT)", () => {
    expect(src).toMatch(/async upsertNode\(node:/);
    expect(src).toMatch(/\.insert\(agsGraphNodes\)[\s\S]*\.onConflictDoUpdate/);
  });

  it("upsertEdge writes through to ASDB after resolving source + target ids", () => {
    expect(src).toMatch(/async upsertEdge\(edge:/);
    expect(src).toMatch(/\.insert\(agsGraphEdges\)/);
    expect(src).toMatch(/sourceRows\[0\]\?\.id/);
    expect(src).toMatch(/targetRows\[0\]\?\.id/);
  });

  it("deleteNode + deleteEdge target the postgres tables", () => {
    expect(src).toMatch(/async deleteNode\(nodeId: string\)/);
    expect(src).toMatch(/conn\.delete\(agsGraphNodes\)/);
    expect(src).toMatch(/async deleteEdge\(edgeId: string\)/);
    expect(src).toMatch(/conn\.delete\(agsGraphEdges\)/);
  });

  it("applyProjectionJob is no longer all-zeros — uses upsert methods + counters", () => {
    const m = sliceMethod(src, "applyProjectionJob");
    expect(m).toMatch(/await this\.upsertNode\(write\.node\)/);
    expect(m).toMatch(/nodesCreated\+\+/);
    expect(m).toMatch(/edgesCreated\+\+/);
    expect(m).not.toMatch(/return\s*\{\s*nodesCreated:\s*0[\s\S]{0,200}edgesCreated:\s*0[\s\S]{0,200}durationMs:\s*0/);
  });

  it("enqueueProjectionJob writes to ags_graph_projection_sync_jobs", () => {
    const m = sliceMethod(src, "enqueueProjectionJob");
    expect(m).toMatch(/\.insert\(agsGraphProjectionSyncJobs\)/);
    expect(m).toMatch(/returning\(\{ id: agsGraphProjectionSyncJobs\.id \}\)/);
  });

  it("takeSnapshot writes to ags_graph_projection_snapshots with active counts", () => {
    const m = sliceMethod(src, "takeSnapshot");
    expect(m).toMatch(/\.insert\(agsGraphProjectionSnapshots\)/);
    expect(m).toMatch(/MemgraphGraphRepository\.takeSnapshot/);
  });

  it("detectDrift reads un-remediated rows from ags_graph_projection_drift_events", () => {
    const m = sliceMethod(src, "detectDrift");
    expect(m).toMatch(/from\(agsGraphProjectionDriftEvents\)/);
    expect(m).toMatch(/isNull\(agsGraphProjectionDriftEvents\.remediatedAt\)/);
  });

  it("rebuildProjection writes running + completed rows to ags_graph_projection_rebuilds", () => {
    const m = sliceMethod(src, "rebuildProjection");
    expect(m).toMatch(/\.insert\(agsGraphProjectionRebuilds\)/);
    expect(m).toMatch(/status:\s*["']running["']/);
    expect(m).toMatch(/\.update\(agsGraphProjectionRebuilds\)/);
    expect(m).toMatch(/status:\s*["']completed["']/);
  });

  it("runAlgorithm shortest_path delegates to this.shortestPath (Bolt path)", () => {
    const m = sliceMethod(src, "runAlgorithm");
    expect(m).toMatch(/input\.algorithmKey === ["']shortest_path["']/);
    expect(m).toMatch(/this\.shortestPath\(from, to, input\.runtime\)/);
  });

  it("runAlgorithm throws GraphCapabilityUnsupportedError for other algorithms (no silent empty rows)", () => {
    const m = sliceMethod(src, "runAlgorithm");
    expect(m).toMatch(/throw new GraphCapabilityUnsupportedError\(/);
    expect(m).toMatch(/["']supportsGraphAlgorithms["']/);
    expect(m).not.toMatch(/return\s*\{\s*rows:\s*\[\],\s*durationMs:\s*0\s*\}/);
  });
});

function sliceMethod(src: string, name: string): string {
  const start = src.indexOf(`async ${name}(`);
  if (start === -1) throw new Error(`method ${name} not found`);
  const afterStart = src.indexOf("\n  async ", start + 1);
  const end = afterStart === -1 ? src.length : afterStart;
  return src.slice(start, end);
}
