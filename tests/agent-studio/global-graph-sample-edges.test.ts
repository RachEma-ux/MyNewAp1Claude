/**
 * globalGraphSample edge-sample shape — source-scan integrity.
 *
 * PR #1525 (force-directed canvas viz for Local + Global) called out
 * that `globalGraphSample` on the postgres backend returned `edges: []`
 * — the Global canvas therefore showed floating nodes without
 * connections. This source-scan pins the follow-on edge-sample query
 * shape (added 2026-05-19) so accidental removal is caught even when
 * DB-backed integration tests are skipped on the device.
 *
 * Source-scan pattern — read the file, regex-match the invariants,
 * no boot, no DB. Same shape as
 * [[reference-source-scan-integrity-test-pattern]] and the sibling
 * `wired-asdb-postgres-graph-repository.test.ts`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();
const REPO_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/graph/repository/postgres-graph-repository-asdb.ts",
);

describe("AsdbPostgresGraphRepository.globalGraphSample — edge sample (source-scan)", () => {
  const src = readFileSync(REPO_PATH, "utf8");

  // Isolate the globalGraphSample method body so other methods
  // (localGraph in particular, which queries the same edge shape)
  // don't satisfy the assertions accidentally.
  const start = src.indexOf("async globalGraphSample(");
  expect(start).toBeGreaterThan(-1);
  // Walk to the next `async ` declaration; that bounds the method.
  const afterStart = src.indexOf("\n  async ", start + 1);
  const end = afterStart === -1 ? src.length : afterStart;
  const method = src.slice(start, end);

  it("selects edges joined to both endpoint nodes by id", () => {
    expect(method).toMatch(/FROM \$\{agsGraphEdges\} e/);
    expect(method).toMatch(
      /JOIN \$\{agsGraphNodes\} sn ON sn\.id = e\.source_node_id/,
    );
    expect(method).toMatch(
      /JOIN \$\{agsGraphNodes\} tn ON tn\.id = e\.target_node_id/,
    );
  });

  it("filters edges to those with AT LEAST ONE endpoint in the sampled node set (boundary inclusion)", () => {
    // Boundary-node fetch slice (2026-05-19): an OR between the two
    // endpoint filters lets edges from sample to outside-sample
    // through; their outside endpoints are added as boundary nodes.
    expect(method).toMatch(
      /\(sn\.node_key IN \(\$\{sampledKeyList\}\)\s*OR\s*tn\.node_key IN \(\$\{sampledKeyList\}\)\)/,
    );
  });

  it("applies the governance filter to edges AND both endpoint nodes (so boundary fetch can't bypass it)", () => {
    expect(method).toMatch(/e\.governance_status IN \(\$\{govList\}\)/);
    expect(method).toMatch(/sn\.governance_status IN \(\$\{govList\}\)/);
    expect(method).toMatch(/tn\.governance_status IN \(\$\{govList\}\)/);
  });

  it("collects boundary nodes (outside-sample endpoints) into the returned node set", () => {
    expect(method).toMatch(/const sampledIds = new Set\(nodes\.map/);
    expect(method).toMatch(/const boundary = new Map<string, NodeIdentity>\(\)/);
    expect(method).toMatch(/const allNodes: NodeIdentity\[\] = \[\.\.\.nodes, \.\.\.boundary\.values\(\)\]/);
    expect(method).toMatch(/nodes: allNodes/);
  });

  it("returns edges with both endpoints in the EdgeIdentity shape", () => {
    expect(method).toMatch(/sourceNode:\s*\{\s*typeKey:\s*String\(r\.src_type\)/);
    expect(method).toMatch(/targetNode:\s*\{\s*typeKey:\s*String\(r\.tgt_type\)/);
  });

  it("short-circuits when the node sample is empty (no edge query)", () => {
    expect(method).toMatch(/if \(nodes\.length === 0\)/);
  });

  it("reports truncated when either nodes or edges hit maxResults", () => {
    expect(method).toMatch(
      /truncated:\s*[\s\S]*rows\.length >= options\.maxResults[\s\S]*edges\.length >= options\.maxResults/,
    );
  });

  it("does not emit `edges: []` as the literal terminal return", () => {
    // Guard against an accidental revert that drops the edge query
    // and re-introduces the empty-edges shape.
    expect(method).not.toMatch(/return\s*\{\s*nodes:\s*rows\.map[\s\S]*edges:\s*\[\]/);
  });
});
