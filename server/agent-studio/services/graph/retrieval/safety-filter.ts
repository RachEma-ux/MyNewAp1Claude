/**
 * Graph Context Safety Filter.
 *
 * Phase 12. Filters retrieved context blocks against permission, governance,
 * and content safety rules BEFORE they enter the prompt.
 *
 * ADR: docs/architecture/agent-studio-graph-context-safety-filter.md
 */

import type { RuntimeContext } from "../repository/index.js";

export interface ContextBlockInput {
  readonly id: string;
  readonly kind: "text" | "path" | "graph_subgraph";
  readonly sourceKind: string;
  readonly sourceId: string;
  readonly sourceVersionId?: string;
  readonly governanceStatus: "active" | "hidden" | "archived" | "deprecated";
  readonly contentSnippet?: string;
  readonly tokenCount?: number;
  readonly payload: Record<string, unknown>;
}

export interface ContextBlockOutput {
  readonly id: string;
  readonly kind: ContextBlockInput["kind"];
  readonly sourceKind: string;
  readonly sourceId: string;
  readonly sourceVersionId?: string;
  readonly contentSnippet?: string;
  readonly tokenCount?: number;
  readonly payload: Record<string, unknown>;
  readonly citation: { sourceKind: string; sourceId: string; sourceVersionId?: string };
}

export interface SafetyEvent {
  readonly blockId: string;
  readonly reason: "governance_hidden" | "governance_archived" | "missing_citation" | "permission_denied" | "raw_artifact";
  readonly details?: Record<string, unknown>;
}

export interface FilterResult {
  readonly blocks: ContextBlockOutput[];
  readonly events: SafetyEvent[];
}

export function filterContextBlocks(
  input: ContextBlockInput[],
  runtime: RuntimeContext,
): FilterResult {
  const blocks: ContextBlockOutput[] = [];
  const events: SafetyEvent[] = [];

  for (const b of input) {
    if (b.governanceStatus === "hidden") {
      events.push({ blockId: b.id, reason: "governance_hidden" });
      continue;
    }
    if (b.governanceStatus === "archived" || b.governanceStatus === "deprecated") {
      events.push({ blockId: b.id, reason: "governance_archived", details: { status: b.governanceStatus } });
      continue;
    }
    if (!b.sourceId || !b.sourceKind) {
      events.push({ blockId: b.id, reason: "missing_citation" });
      continue;
    }
    // Permission filter applied by GraphPermissionRepository in caller;
    // here we trust runtime context's governanceStatusFilter / allowedWorkspaces.
    if (runtime.governanceStatusFilter && !runtime.governanceStatusFilter.includes("active")) {
      events.push({ blockId: b.id, reason: "permission_denied" });
      continue;
    }
    // Raw artifact policy: block if `sourceKind` suggests un-promoted raw content.
    if (b.sourceKind === "raw_extraction" || b.sourceKind === "ingestion_buffer") {
      events.push({ blockId: b.id, reason: "raw_artifact", details: { sourceKind: b.sourceKind } });
      continue;
    }

    blocks.push({
      id: b.id,
      kind: b.kind,
      sourceKind: b.sourceKind,
      sourceId: b.sourceId,
      sourceVersionId: b.sourceVersionId,
      contentSnippet: b.contentSnippet,
      tokenCount: b.tokenCount,
      payload: b.payload,
      citation: {
        sourceKind: b.sourceKind,
        sourceId: b.sourceId,
        sourceVersionId: b.sourceVersionId,
      },
    });
  }

  return { blocks, events };
}
