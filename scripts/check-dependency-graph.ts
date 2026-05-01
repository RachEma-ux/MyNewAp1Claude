#!/usr/bin/env tsx
/**
 * check:dependency-graph
 *
 * Builds the AWI dependency graph and verifies:
 *   - the graph builds without throwing
 *   - every node id is `<type>:<rest>`
 *   - every edge points at a known node
 *   - no module-level cycles exist (informational; reports cycle paths
 *     but does not fail unless explicitly enabled with FAIL_ON_CYCLES)
 */
import { buildDependencyGraph } from "../server/platform/wiring";

function main() {
  const graph = buildDependencyGraph();
  const issues: string[] = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  for (const n of graph.nodes) {
    if (!/^[a-z]+:.+/.test(n.id)) {
      issues.push(`Node id '${n.id}' does not match '<type>:<key>' shape`);
    }
  }
  for (const e of graph.edges) {
    if (!nodeIds.has(e.source)) {
      issues.push(`Edge ${e.id} source '${e.source}' is not a registered node`);
    }
    if (!nodeIds.has(e.target)) {
      issues.push(`Edge ${e.id} target '${e.target}' is not a registered node`);
    }
  }

  console.log("Dependency Graph");
  console.log("================");
  console.log(`Nodes:  ${graph.nodes.length}`);
  console.log(`Edges:  ${graph.edges.length}`);
  console.log(`Cycles: ${graph.cycles.length}`);
  if (graph.cycles.length > 0) {
    console.log("");
    console.log("Cycle paths:");
    for (const c of graph.cycles) {
      console.log(`  ${c.join(" → ")} → ${c[0]}`);
    }
  }
  console.log("");

  if (issues.length > 0) {
    console.log("Structural issues:");
    for (const i of issues) console.log(`  - ${i}`);
    process.exit(1);
  }

  if (graph.cycles.length > 0 && process.env.FAIL_ON_CYCLES === "1") {
    process.exit(1);
  }

  console.log("Graph healthy.");
  process.exit(0);
}

main();
