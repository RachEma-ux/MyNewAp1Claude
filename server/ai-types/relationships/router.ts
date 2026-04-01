/**
 * AI Types Relationships Router
 *
 * Cross-type dependency graph queries.
 * Answers: Provider → exposes → Model, Agent → uses → Model, Bot → wraps → Agent, etc.
 *
 * Namespace: trpc.aiTypes.relationships.*
 */

import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import { getCatalogEntries, getCatalogEntryById } from "../db";

interface RelationshipEdge {
  sourceId: number;
  sourceName: string;
  sourceType: string;
  targetId: number;
  targetName: string;
  targetType: string;
  relation: string;
}

interface RelationshipNode {
  id: number;
  name: string;
  displayName: string;
  entryType: string;
  status: string | null;
  reviewState: string | null;
  providerId: number | null;
}

/**
 * Extract relationships from a catalog entry's config.
 */
function extractRelationships(entry: any): Array<{ targetId: number; relation: string; targetType: string }> {
  const rels: Array<{ targetId: number; relation: string; targetType: string }> = [];
  const config = entry.config as Record<string, unknown> | null;
  if (!config) return rels;

  // Provider link
  if (entry.providerId && typeof entry.providerId === "number") {
    rels.push({ targetId: entry.providerId, relation: "uses_provider", targetType: "provider" });
  }

  // Agent → source agent (sourceAgentId in execution config)
  const sourceAgentId = config.sourceAgentId as number | undefined;
  if (sourceAgentId && typeof sourceAgentId === "number") {
    rels.push({ targetId: sourceAgentId, relation: "source_agent", targetType: "agent" });
  }

  // Model references
  const modelId = config.modelId as string | undefined;
  if (modelId) {
    const parsed = parseInt(modelId, 10);
    if (!isNaN(parsed) && parsed > 0) {
      rels.push({ targetId: parsed, relation: "uses_model", targetType: "model" });
    }
  }

  // Bot → wraps agent (agentId or catalogEntryId reference)
  const agentRef = config.agentId as number | undefined;
  if (agentRef && typeof agentRef === "number") {
    rels.push({ targetId: agentRef, relation: "wraps_agent", targetType: "agent" });
  }

  // LLM → provider link
  const llmProvider = config.providerId as number | undefined;
  if (llmProvider && typeof llmProvider === "number" && !entry.providerId) {
    rels.push({ targetId: llmProvider, relation: "provided_by", targetType: "provider" });
  }

  return rels;
}

export const relationshipsRouter = router({
  /**
   * Get the full dependency graph for all catalog entries.
   * Returns nodes + edges for visualization.
   */
  graph: protectedProcedure
    .query(async () => {
      const entries = await getCatalogEntries();
      const nodes: RelationshipNode[] = entries.map((e) => ({
        id: e.id,
        name: e.name,
        displayName: e.displayName || e.name,
        entryType: e.entryType,
        status: e.status,
        reviewState: e.reviewState,
        providerId: e.providerId,
      }));

      const edges: RelationshipEdge[] = [];
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      for (const entry of entries) {
        const rels = extractRelationships(entry);
        for (const rel of rels) {
          const target = nodeMap.get(rel.targetId);
          if (target) {
            edges.push({
              sourceId: entry.id,
              sourceName: entry.displayName || entry.name,
              sourceType: entry.entryType,
              targetId: rel.targetId,
              targetName: target.displayName || target.name,
              targetType: target.entryType,
              relation: rel.relation,
            });
          }
        }
      }

      return { nodes, edges };
    }),

  /**
   * Get relationships for a specific catalog entry (both inbound and outbound).
   */
  forEntry: protectedProcedure
    .input(z.object({ catalogEntryId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const entry = await getCatalogEntryById(input.catalogEntryId);
      if (!entry) return { outbound: [], inbound: [] };

      const allEntries = await getCatalogEntries();

      // Outbound: this entry depends on...
      const outbound: RelationshipEdge[] = [];
      const rels = extractRelationships(entry);
      for (const rel of rels) {
        const target = allEntries.find((e) => e.id === rel.targetId);
        if (target) {
          outbound.push({
            sourceId: entry.id,
            sourceName: entry.displayName || entry.name,
            sourceType: entry.entryType,
            targetId: target.id,
            targetName: target.displayName || target.name,
            targetType: target.entryType,
            relation: rel.relation,
          });
        }
      }

      // Inbound: entries that depend on this one
      const inbound: RelationshipEdge[] = [];
      for (const other of allEntries) {
        if (other.id === entry.id) continue;
        const otherRels = extractRelationships(other);
        for (const rel of otherRels) {
          if (rel.targetId === entry.id) {
            inbound.push({
              sourceId: other.id,
              sourceName: other.displayName || other.name,
              sourceType: other.entryType,
              targetId: entry.id,
              targetName: entry.displayName || entry.name,
              targetType: entry.entryType,
              relation: rel.relation,
            });
          }
        }
      }

      return { outbound, inbound };
    }),

  /**
   * Get summary counts of relationships by type.
   */
  summary: protectedProcedure
    .query(async () => {
      const entries = await getCatalogEntries();
      const relationCounts: Record<string, number> = {};
      const typePairCounts: Record<string, number> = {};

      for (const entry of entries) {
        const rels = extractRelationships(entry);
        for (const rel of rels) {
          relationCounts[rel.relation] = (relationCounts[rel.relation] || 0) + 1;
          const pair = `${entry.entryType} → ${rel.targetType}`;
          typePairCounts[pair] = (typePairCounts[pair] || 0) + 1;
        }
      }

      return {
        totalEntries: entries.length,
        totalEdges: Object.values(relationCounts).reduce((a, b) => a + b, 0),
        byRelation: relationCounts,
        byTypePair: typePairCounts,
      };
    }),
});
