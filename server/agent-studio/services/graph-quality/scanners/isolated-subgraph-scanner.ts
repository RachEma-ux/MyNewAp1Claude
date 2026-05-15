/**
 * Isolated-subgraph scanner — Phase 23 §1 ninth scanner.
 *
 * Detects connected components in the sample whose size falls below
 * a threshold. The main graph cluster is typically one large
 * component; smaller disconnected components often indicate:
 *
 *   - Stale workspace section (notes from a deleted project that
 *     weren't cleaned up).
 *   - Broken ingest path that started an isolated graph and never
 *     joined the rest.
 *   - Orphaned KGRA build run whose entities never linked back to
 *     the source notes.
 *
 * Severity is "low" — isolation isn't broken, it just looks lonely.
 * The threshold (default 5 nodes) is overridable; operators with
 * particularly noisy workspaces may raise it.
 *
 * The scanner emits ONE finding per isolated component, with the
 * component's node ids in `details.nodeIds` (capped at 20) and the
 * component size in `details.componentSize`.
 *
 * Hard-rule compliance: pure function over `QualityScanSample`. No
 * DB I/O. No graph mutation. No dispatcher / openrouter / neo4j-driver
 * imports.
 */

import type {
  QualityFinding,
  QualityScanSample,
  QualityScannerRegistration,
} from "../scan-orchestrator.js";

export const DEFAULT_ISOLATED_COMPONENT_THRESHOLD = 5;

export interface ScanForIsolatedSubgraphsOptions {
  /** Override component-size threshold. Components with size strictly
   *  LESS THAN this value emit findings. Default 5. */
  readonly threshold?: number;
}

export function scanForIsolatedSubgraphs(
  sample: QualityScanSample,
  options: ScanForIsolatedSubgraphsOptions = {},
): readonly QualityFinding[] {
  const threshold = options.threshold ?? DEFAULT_ISOLATED_COMPONENT_THRESHOLD;

  // Build undirected adjacency from the sample's edges.
  const adj = new Map<string, Set<string>>();
  for (const n of sample.nodes) {
    if (!adj.has(n.id)) adj.set(n.id, new Set());
  }
  for (const e of sample.edges) {
    if (!adj.has(e.sourceNode.id)) adj.set(e.sourceNode.id, new Set());
    if (!adj.has(e.targetNode.id)) adj.set(e.targetNode.id, new Set());
    adj.get(e.sourceNode.id)!.add(e.targetNode.id);
    adj.get(e.targetNode.id)!.add(e.sourceNode.id);
  }

  // BFS-based connected components.
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const nodeId of adj.keys()) {
    if (visited.has(nodeId)) continue;
    const component: string[] = [];
    const stack = [nodeId];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      component.push(cur);
      const neighbors = adj.get(cur);
      if (neighbors) {
        for (const n of neighbors) if (!visited.has(n)) stack.push(n);
      }
    }
    components.push(component);
  }

  // No "main component" reference point — the threshold is absolute.
  // A graph that's fully disconnected (every node isolated) emits
  // findings for every component, which the operator can interpret
  // as "ingest is broken." A graph with one large component + a few
  // small ones emits findings only for the small ones.
  const findings: QualityFinding[] = [];
  for (const c of components) {
    if (c.length >= threshold) continue;
    findings.push({
      findingClass: "isolated_subgraph",
      severity: "low",
      sourceTypeKey: undefined,
      // No single sourceId — use the first node's id.
      sourceId: c[0],
      details: {
        sampleTruncated: sample.truncated,
        componentSize: c.length,
        threshold,
        nodeIds: c.slice(0, 20),
      },
    });
  }
  return findings;
}

export const isolatedSubgraphScanner: QualityScannerRegistration = {
  scanKind: "isolated_subgraph",
  run: (sample) => scanForIsolatedSubgraphs(sample),
};
