/**
 * Graph Agent Lite — prompt-safe schema summary.
 *
 * Phase 13 §4. Loads the ontology tables (`ags_graph_ontology_node_types`
 * + `ags_graph_ontology_edge_types`) and projects them into a compact
 * representation suitable for inclusion in agent prompts.
 *
 * "Prompt-safe" means:
 *   - Description text is length-capped (default 200 chars) so a single
 *     verbose entry can't blow the prompt budget.
 *   - Governance-internal flags are NOT surfaced — operators rely on
 *     the governance pipeline, not the agent's prompt, to enforce
 *     visibility.
 *   - Retention-class is NOT surfaced — it's an operational concern,
 *     not an agent-reasoning concern.
 *   - Node + edge counts are hard-capped (default 25 each) so the
 *     summary stays bounded even on rich ontologies.
 *
 * Failure modes:
 *   - ASDB unavailable → empty summary (degrade-silently). The agent
 *     falls back to schema-free reasoning; the trace records the
 *     missing summary as a safety event in §13.5.
 *
 * ADR: docs/architecture/agent-studio-graph-agent-runtime.md §1.4
 */

import { asc } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphOntologyNodeTypes,
  agsGraphOntologyEdgeTypes,
} from "../../../../drizzle/tables/agent-studio-graph.js";

const DEFAULT_NODE_LIMIT = 25;
const DEFAULT_EDGE_LIMIT = 25;
const DEFAULT_DESCRIPTION_BUDGET = 200;

export interface SchemaSummaryNodeType {
  readonly typeKey: string;
  readonly displayName: string;
  readonly description: string | null;
  readonly category: string | null;
}

export interface SchemaSummaryEdgeType {
  readonly typeKey: string;
  readonly displayName: string;
  readonly description: string | null;
  readonly sourceNodeTypeKeys: string[];
  readonly targetNodeTypeKeys: string[];
  readonly cardinality: string | null;
  readonly isDirected: boolean;
}

export interface SchemaSummary {
  readonly nodeTypes: SchemaSummaryNodeType[];
  readonly edgeTypes: SchemaSummaryEdgeType[];
  readonly nodeTypeCountTotal: number;
  readonly edgeTypeCountTotal: number;
  readonly truncated: boolean;
}

export interface GetSchemaSummaryOptions {
  readonly nodeLimit?: number;
  readonly edgeLimit?: number;
  readonly descriptionBudget?: number;
  readonly getDb?: typeof getAsDb;
}

function trimDescription(
  desc: string | null,
  budget: number,
): string | null {
  if (!desc) return null;
  if (desc.length <= budget) return desc;
  return desc.slice(0, budget - 1).trimEnd() + "…";
}

export async function getPromptSafeSchemaSummary(
  options: GetSchemaSummaryOptions = {},
): Promise<SchemaSummary> {
  const getDb = options.getDb ?? getAsDb;
  const nodeLimit = options.nodeLimit ?? DEFAULT_NODE_LIMIT;
  const edgeLimit = options.edgeLimit ?? DEFAULT_EDGE_LIMIT;
  const budget = options.descriptionBudget ?? DEFAULT_DESCRIPTION_BUDGET;

  const db = getDb();
  if (!db) {
    return {
      nodeTypes: [],
      edgeTypes: [],
      nodeTypeCountTotal: 0,
      edgeTypeCountTotal: 0,
      truncated: false,
    };
  }

  // Read N+1 to detect truncation cheaply.
  const nodeRows = await db
    .select({
      typeKey: agsGraphOntologyNodeTypes.typeKey,
      displayName: agsGraphOntologyNodeTypes.displayName,
      description: agsGraphOntologyNodeTypes.description,
      category: agsGraphOntologyNodeTypes.category,
    })
    .from(agsGraphOntologyNodeTypes)
    .orderBy(asc(agsGraphOntologyNodeTypes.typeKey))
    .limit(nodeLimit + 1);

  const edgeRows = await db
    .select({
      typeKey: agsGraphOntologyEdgeTypes.typeKey,
      displayName: agsGraphOntologyEdgeTypes.displayName,
      description: agsGraphOntologyEdgeTypes.description,
      sourceNodeTypeKeys: agsGraphOntologyEdgeTypes.sourceNodeTypeKeys,
      targetNodeTypeKeys: agsGraphOntologyEdgeTypes.targetNodeTypeKeys,
      cardinality: agsGraphOntologyEdgeTypes.cardinality,
      isDirected: agsGraphOntologyEdgeTypes.isDirected,
    })
    .from(agsGraphOntologyEdgeTypes)
    .orderBy(asc(agsGraphOntologyEdgeTypes.typeKey))
    .limit(edgeLimit + 1);

  const nodeTruncated = nodeRows.length > nodeLimit;
  const edgeTruncated = edgeRows.length > edgeLimit;

  return {
    nodeTypes: nodeRows.slice(0, nodeLimit).map((r) => ({
      typeKey: r.typeKey,
      displayName: r.displayName,
      description: trimDescription(r.description, budget),
      category: r.category,
    })),
    edgeTypes: edgeRows.slice(0, edgeLimit).map((r) => ({
      typeKey: r.typeKey,
      displayName: r.displayName,
      description: trimDescription(r.description, budget),
      sourceNodeTypeKeys: r.sourceNodeTypeKeys ?? [],
      targetNodeTypeKeys: r.targetNodeTypeKeys ?? [],
      cardinality: r.cardinality,
      isDirected: r.isDirected,
    })),
    // We don't run a COUNT(*) — the "+1 read" tells us whether we
    // truncated this page; reporting the exact total requires a
    // separate query and isn't useful enough to justify the cost.
    nodeTypeCountTotal: nodeTruncated ? nodeLimit + 1 : nodeRows.length,
    edgeTypeCountTotal: edgeTruncated ? edgeLimit + 1 : edgeRows.length,
    truncated: nodeTruncated || edgeTruncated,
  };
}
