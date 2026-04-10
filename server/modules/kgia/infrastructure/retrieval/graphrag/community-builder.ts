/**
 * GraphRAG — Community Builder
 *
 * Detects communities in the extracted entity-relation graph
 * using hierarchical clustering. Produces community assignments
 * for community report generation.
 */

export interface Community {
  id: string;
  level: number;
  nodeIds: string[];
  edgeCount: number;
  title?: string;
}

interface SimpleGraph {
  nodes: string[];
  edges: Array<{ from: string; to: string }>;
}

/**
 * Build communities from an entity-relation graph.
 * V1: Connected-component-based clustering.
 * Future: Leiden algorithm for hierarchical community detection.
 */
export function buildCommunities(graph: SimpleGraph): Community[] {
  const components = findConnectedComponents(graph);

  return components.map((nodeIds, i) => {
    const edgeCount = graph.edges.filter(
      (e) => nodeIds.includes(e.from) && nodeIds.includes(e.to)
    ).length;

    return {
      id: `community-${i}`,
      level: 0,
      nodeIds,
      edgeCount,
    };
  });
}

/**
 * Build hierarchical communities (2 levels).
 * Level 0: connected components
 * Level 1: merge small components into larger groups
 */
export function buildHierarchicalCommunities(
  graph: SimpleGraph,
  minCommunitySize: number = 3
): Community[] {
  const level0 = buildCommunities(graph);
  const communities = [...level0];

  // Level 1: merge small communities
  const small = level0.filter((c) => c.nodeIds.length < minCommunitySize);
  const large = level0.filter((c) => c.nodeIds.length >= minCommunitySize);

  if (small.length > 1) {
    const mergedNodes = small.flatMap((c) => c.nodeIds);
    const mergedEdges = graph.edges.filter(
      (e) => mergedNodes.includes(e.from) && mergedNodes.includes(e.to)
    ).length;

    communities.push({
      id: `community-merged-small`,
      level: 1,
      nodeIds: mergedNodes,
      edgeCount: mergedEdges,
      title: "Merged small communities",
    });
  }

  return communities;
}

function findConnectedComponents(graph: SimpleGraph): string[][] {
  const parent = new Map<string, string>();

  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }

  function union(a: string, b: string): void {
    parent.set(find(a), find(b));
  }

  for (const node of graph.nodes) parent.set(node, node);
  for (const edge of graph.edges) union(edge.from, edge.to);

  const groups = new Map<string, string[]>();
  for (const node of graph.nodes) {
    const root = find(node);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(node);
  }

  return Array.from(groups.values());
}
