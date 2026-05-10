/**
 * Graph Agent Lite — Zod contracts.
 *
 * Phase 13. Mirrors KGRA Agent module shape (manifest / ports / public-api).
 *
 * Boundaries (locked):
 *   - Tools via MCP dispatcher only.
 *   - Models via OpenRouter Model Access only.
 *   - Graph state via GraphRepository only.
 *   - No graph mutation.
 *
 * ADR: docs/architecture/agent-studio-graph-agent-runtime.md
 * Boundary ADR: docs/architecture/agent-studio-graph-agent-integration-boundaries.md
 */

import { z } from "zod";

export const GraphAgentRunInput = z.object({
  agentKey: z.enum(["graph_agent_lite", "graph_agent_advanced"]).default("graph_agent_lite"),
  userId: z.number().int().optional(),
  workspaceId: z.number().int().optional(),
  query: z.string().min(1).max(8000),
  retrievalPreference: z.enum([
    "auto",
    "graphrag_local",
    "graphrag_global",
    "graphrag_traversal",
    "hybrid_cag_graphrag",
  ]).default("auto"),
  maxSteps: z.number().int().min(1).max(20).default(8),
  modelHint: z.string().optional(),
});
export type GraphAgentRunInput = z.infer<typeof GraphAgentRunInput>;

export const GraphAgentAnswerCitation = z.object({
  sourceKind: z.string(),
  sourceId: z.string(),
  sourceVersionId: z.string().optional(),
  sourceLocator: z.string().optional(),
});
export type GraphAgentAnswerCitation = z.infer<typeof GraphAgentAnswerCitation>;

export const GraphAgentAnswer = z.object({
  runId: z.number().int(),
  answer: z.string(),
  citations: z.array(GraphAgentAnswerCitation),
  graphPaths: z.array(z.unknown()),
  confidence: z.number().min(0).max(1).optional(),
  whyThisAnswer: z.object({
    retrievalMode: z.string(),
    skillPackKey: z.string().optional(),
    templateKey: z.string().optional(),
    graphBackendKey: z.string(),
    projectionSnapshotId: z.string().optional(),
    truncationReason: z.string().optional(),
  }),
});
export type GraphAgentAnswer = z.infer<typeof GraphAgentAnswer>;
