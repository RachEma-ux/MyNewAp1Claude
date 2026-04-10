/**
 * KGIA Analytics — Graph Algorithms
 *
 * Adapter boundary for graph algorithm execution.
 * V1: Local implementations for basic algorithms.
 * Future: Delegate to Neo4j GDS or Neptune Analytics.
 */

import type { EvidenceGraph } from "../../domain/types";

/**
 * Compute degree centrality for nodes in an evidence graph.
 */
export function degreeCentrality(graph: EvidenceGraph): Map<string, number> {
  const degrees = new Map<string, number>();

  for (const node of graph.nodes) {
    degrees.set(node.id, 0);
  }

  for (const edge of graph.edges) {
    degrees.set(edge.fromNodeId, (degrees.get(edge.fromNodeId) ?? 0) + 1);
    degrees.set(edge.toNodeId, (degrees.get(edge.toNodeId) ?? 0) + 1);
  }

  // Normalize
  const maxDegree = Math.max(...degrees.values(), 1);
  for (const [id, deg] of degrees) {
    degrees.set(id, deg / maxDegree);
  }

  return degrees;
}

/**
 * Find connected components in an evidence graph.
 */
export function connectedComponents(graph: EvidenceGraph): string[][] {
  const parent = new Map<string, string>();

  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }

  function union(a: string, b: string): void {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const node of graph.nodes) parent.set(node.id, node.id);
  for (const edge of graph.edges) union(edge.fromNodeId, edge.toNodeId);

  const components = new Map<string, string[]>();
  for (const node of graph.nodes) {
    const root = find(node.id);
    if (!components.has(root)) components.set(root, []);
    components.get(root)!.push(node.id);
  }

  return Array.from(components.values());
}

/**
 * Compute shortest path between two nodes using BFS.
 */
export function shortestPath(
  graph: EvidenceGraph,
  startId: string,
  endId: string
): string[] | null {
  const adjacency = new Map<string, string[]>();

  for (const edge of graph.edges) {
    if (!adjacency.has(edge.fromNodeId)) adjacency.set(edge.fromNodeId, []);
    if (!adjacency.has(edge.toNodeId)) adjacency.set(edge.toNodeId, []);
    adjacency.get(edge.fromNodeId)!.push(edge.toNodeId);
    adjacency.get(edge.toNodeId)!.push(edge.fromNodeId);
  }

  const visited = new Set<string>();
  const queue: Array<{ node: string; path: string[] }> = [{ node: startId, path: [startId] }];
  visited.add(startId);

  while (queue.length > 0) {
    const { node, path } = queue.shift()!;
    if (node === endId) return path;

    for (const neighbor of adjacency.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ node: neighbor, path: [...path, neighbor] });
      }
    }
  }

  return null;
}

/**
 * Compute PageRank for nodes in an evidence graph.
 */
export function pageRank(
  graph: EvidenceGraph,
  dampingFactor: number = 0.85,
  iterations: number = 20
): Map<string, number> {
  const n = graph.nodes.length;
  if (n === 0) return new Map();

  const ranks = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const inLinks = new Map<string, string[]>();

  for (const node of graph.nodes) {
    ranks.set(node.id, 1 / n);
    outDegree.set(node.id, 0);
    inLinks.set(node.id, []);
  }

  for (const edge of graph.edges) {
    outDegree.set(edge.fromNodeId, (outDegree.get(edge.fromNodeId) ?? 0) + 1);
    inLinks.get(edge.toNodeId)?.push(edge.fromNodeId);
  }

  for (let iter = 0; iter < iterations; iter++) {
    const newRanks = new Map<string, number>();
    for (const node of graph.nodes) {
      let sum = 0;
      for (const inNode of inLinks.get(node.id) ?? []) {
        sum += (ranks.get(inNode) ?? 0) / Math.max(outDegree.get(inNode) ?? 1, 1);
      }
      newRanks.set(node.id, (1 - dampingFactor) / n + dampingFactor * sum);
    }
    for (const [id, rank] of newRanks) ranks.set(id, rank);
  }

  return ranks;
}
