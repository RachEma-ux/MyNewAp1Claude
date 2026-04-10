/**
 * KGIA Analytics — Node Embeddings
 *
 * Adapter boundary for node embedding generation.
 * V1: Simple feature-based embeddings from node properties.
 * Future: Delegate to GDS node2vec, GraphSAGE, etc.
 */

import type { EvidenceGraph } from "../../domain/types";

/**
 * Generate simple feature vectors for evidence graph nodes.
 * Uses: degree, type encoding, label hash, confidence.
 */
export function generateNodeFeatures(
  graph: EvidenceGraph
): Map<string, number[]> {
  const features = new Map<string, number[]>();

  // Pre-compute degrees
  const degrees = new Map<string, number>();
  for (const node of graph.nodes) degrees.set(node.id, 0);
  for (const edge of graph.edges) {
    degrees.set(edge.fromNodeId, (degrees.get(edge.fromNodeId) ?? 0) + 1);
    degrees.set(edge.toNodeId, (degrees.get(edge.toNodeId) ?? 0) + 1);
  }

  const maxDegree = Math.max(...degrees.values(), 1);
  const typeSet = new Set(graph.nodes.map((n) => n.nodeType));
  const types = Array.from(typeSet);

  for (const node of graph.nodes) {
    const feature: number[] = [
      // Normalized degree
      (degrees.get(node.id) ?? 0) / maxDegree,
      // Confidence
      node.confidence ?? 0.5,
      // Type one-hot encoding
      ...types.map((t) => (node.nodeType === t ? 1 : 0)),
      // Label length (normalized)
      Math.min(node.label.length / 100, 1),
      // Has properties
      node.properties ? 1 : 0,
      // Has source ref
      node.sourceRef ? 1 : 0,
    ];

    features.set(node.id, feature);
  }

  return features;
}

/**
 * Compute cosine similarity between two node feature vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

/**
 * Find the k most similar nodes to a given node.
 */
export function findSimilarNodes(
  nodeId: string,
  features: Map<string, number[]>,
  topK: number = 5
): Array<{ id: string; similarity: number }> {
  const target = features.get(nodeId);
  if (!target) return [];

  const similarities: Array<{ id: string; similarity: number }> = [];

  for (const [id, vec] of features) {
    if (id === nodeId) continue;
    similarities.push({ id, similarity: cosineSimilarity(target, vec) });
  }

  return similarities.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
}
