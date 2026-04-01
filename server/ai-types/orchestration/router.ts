/**
 * AI Types Orchestration Router
 *
 * Read-only endpoints that aggregate cross-type data for the
 * AI Types standalone pages (Overview, Control Panel).
 *
 * These endpoints do NOT duplicate domain CRUD — they compose
 * existing read paths from catalog, validation, relationships,
 * and taxonomy into unified payloads.
 *
 * Namespace: trpc.aiTypes.orchestration.*
 */

import { protectedProcedure, router } from "../../_core/trpc";
import { getCatalogEntries, getTaxonomyNodes, getEntryClassifications, getActiveBundleForEntry } from "../db";

/**
 * overview — single payload for the AI Types Overview page.
 *
 * Returns:
 *  - typeCounts: { provider, llm, model, agent, bot }
 *  - healthSummary: { total, healthy, warnings, errors, healthPercent }
 *  - relationshipSummary: { totalEdges, byTypePair }
 */
export const orchestrationRouter = router({
  overview: protectedProcedure.query(async () => {
    const entries = await getCatalogEntries();

    // ── Type counts ─────────────────────────────────────────
    const typeCounts: Record<string, number> = {
      provider: 0,
      llm: 0,
      model: 0,
      agent: 0,
      bot: 0,
    };
    for (const e of entries) {
      if (typeCounts[e.entryType] !== undefined) {
        typeCounts[e.entryType]++;
      }
    }

    // ── Health summary (mirrors validation.summary logic) ───
    let errors = 0;
    let warnings = 0;
    let healthy = 0;
    for (const entry of entries) {
      let hasError = false;
      let hasWarning = false;

      if (entry.status === "active" && entry.reviewState !== "approved") hasError = true;
      if (!entry.description || entry.description.trim().length === 0) hasWarning = true;

      const classifications = await getEntryClassifications(entry.id);
      if (classifications.length === 0) hasWarning = true;

      if (hasError) errors++;
      else if (hasWarning) warnings++;
      else healthy++;
    }

    // ── Relationship summary (mirrors relationships.summary) ─
    const typePairCounts: Record<string, number> = {};
    let totalEdges = 0;
    for (const entry of entries) {
      const config = entry.config as Record<string, unknown> | null;
      if (!config) continue;

      const rels: Array<{ targetType: string }> = [];
      if (entry.providerId && typeof entry.providerId === "number") {
        rels.push({ targetType: "provider" });
      }
      const sourceAgentId = (config as any).sourceAgentId;
      if (sourceAgentId && typeof sourceAgentId === "number") {
        rels.push({ targetType: "agent" });
      }
      const modelId = (config as any).modelId;
      if (modelId) {
        const parsed = parseInt(String(modelId), 10);
        if (!isNaN(parsed) && parsed > 0) rels.push({ targetType: "model" });
      }
      const agentRef = (config as any).agentId;
      if (agentRef && typeof agentRef === "number") {
        rels.push({ targetType: "agent" });
      }
      const llmProvider = (config as any).providerId;
      if (llmProvider && typeof llmProvider === "number" && !entry.providerId) {
        rels.push({ targetType: "provider" });
      }

      for (const rel of rels) {
        const pair = `${entry.entryType} → ${rel.targetType}`;
        typePairCounts[pair] = (typePairCounts[pair] || 0) + 1;
        totalEdges++;
      }
    }

    return {
      typeCounts,
      healthSummary: {
        total: entries.length,
        healthy,
        warnings,
        errors,
        healthPercent: entries.length > 0 ? Math.round((healthy / entries.length) * 100) : 0,
      },
      relationshipSummary: {
        totalEdges,
        byTypePair: typePairCounts,
      },
    };
  }),

  /**
   * controlPanelSummary — single payload for the AI Types Control Panel health cards.
   */
  controlPanelSummary: protectedProcedure.query(async () => {
    const entries = await getCatalogEntries();
    const taxonomyNodes = await getTaxonomyNodes();

    // Health
    let errors = 0;
    let warnings = 0;
    let healthy = 0;
    for (const entry of entries) {
      let hasError = false;
      let hasWarning = false;
      if (entry.status === "active" && entry.reviewState !== "approved") hasError = true;
      if (!entry.description || entry.description.trim().length === 0) hasWarning = true;
      const classifications = await getEntryClassifications(entry.id);
      if (classifications.length === 0) hasWarning = true;
      if (hasError) errors++;
      else if (hasWarning) warnings++;
      else healthy++;
    }

    // Relationship edge count
    let totalEdges = 0;
    for (const entry of entries) {
      const config = entry.config as Record<string, unknown> | null;
      if (!config) continue;
      if (entry.providerId) totalEdges++;
      if ((config as any).sourceAgentId) totalEdges++;
      if ((config as any).modelId) totalEdges++;
      if ((config as any).agentId) totalEdges++;
      if ((config as any).providerId && !entry.providerId) totalEdges++;
    }

    return {
      catalogEntries: entries.length,
      taxonomyNodes: taxonomyNodes.length,
      healthPercent: entries.length > 0 ? Math.round((healthy / entries.length) * 100) : 0,
      relationships: totalEdges,
      healthBreakdown: { healthy, warnings, errors },
    };
  }),
});
