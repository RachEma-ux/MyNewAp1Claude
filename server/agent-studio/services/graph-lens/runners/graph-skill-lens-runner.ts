/**
 * Graph Skill lens runner — seventh real `LensRunnerFn` (T-F.68).
 *
 * Surfaces the "Reusable graph traversal skill packs and their
 * usage history" view promised by
 * `GRAPH_LENS_KIND_METADATA.graph_skill` over `agsGraphSkillPacks`.
 *
 * Shape
 *   - Nodes:
 *       * `typeKey="graph_skill"` — one per `agsGraphSkillPacks`
 *         row. Meta carries skillKey / name / domain / riskLevel /
 *         approvalRequired / active.
 *       * `typeKey="graph_skill_domain"` — synthesized per
 *         distinct non-null `domain` so the lens clusters skills
 *         by domain category.
 *   - Edges:
 *       * `typeKey="belongs_to_domain"` — graph_skill →
 *         graph_skill_domain (only when pack.domain is non-null).
 *
 * Permission post-filter: visible iff `viewer.userId != null`.
 * Note: `agsGraphSkillPacks` has NO `workspaceId` column — skill
 * packs are global. The runner therefore does NOT apply a
 * workspaceId column filter (matches the runtime / governance /
 * mcp runners which use the same pattern for region-routed-only
 * scoping).
 *
 * Hard-rule compliance (CLAUDE.md)
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - DB I/O is injected via `GraphSkillLensReadFn`.
 */

import type { GraphLensDefinition } from "../contracts.js";
import type {
  LensRunnerFn,
  LensRunnerViewerContext,
  LensSnapshot,
  LensSnapshotEdge,
  LensSnapshotNode,
} from "../runner-contract.js";

// ============================================================================
// Read-seam shape
// ============================================================================

export interface GraphSkillLensPackRow {
  readonly id: number;
  readonly skillKey: string;
  readonly name: string;
  readonly description: string | null;
  readonly domain: string | null;
  readonly riskLevel: string;
  readonly approvalRequired: boolean;
  readonly active: boolean;
  readonly createdAt: Date;
}

export interface GraphSkillLensReadResult {
  readonly packs: ReadonlyArray<GraphSkillLensPackRow>;
  readonly truncated: boolean;
}

export interface GraphSkillLensReadParams {
  readonly workspaceId: number;
  readonly limit: number;
  readonly before?: Date;
}

export type GraphSkillLensReadFn = (
  params: GraphSkillLensReadParams,
) => Promise<GraphSkillLensReadResult>;

// ============================================================================
// Defaults
// ============================================================================

export const GRAPH_SKILL_LENS_DEFAULT_LIMIT = 100;
export const GRAPH_SKILL_LENS_ABSOLUTE_LIMIT = 500;

export function clampGraphSkillLensLimit(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return GRAPH_SKILL_LENS_DEFAULT_LIMIT;
  const n = Math.floor(raw);
  if (n <= 0) return GRAPH_SKILL_LENS_DEFAULT_LIMIT;
  if (n > GRAPH_SKILL_LENS_ABSOLUTE_LIMIT) return GRAPH_SKILL_LENS_ABSOLUTE_LIMIT;
  return n;
}

// ============================================================================
// Permission gate
// ============================================================================

export function isGraphSkillNodeVisibleToViewer(
  viewer: LensRunnerViewerContext,
): boolean {
  return viewer.userId != null;
}

// ============================================================================
// Pure builder
// ============================================================================

export interface BuildGraphSkillLensSnapshotInput {
  readonly def: GraphLensDefinition;
  readonly viewer: LensRunnerViewerContext;
  readonly read: GraphSkillLensReadResult;
  readonly now: Date;
}

const SKILL_NODE_PREFIX = "skill:";
const DOMAIN_NODE_PREFIX = "domain:";

export function buildGraphSkillLensSnapshot(
  input: BuildGraphSkillLensSnapshotInput,
): LensSnapshot {
  const { def, viewer, read, now } = input;
  const visible = isGraphSkillNodeVisibleToViewer(viewer);
  const nodes: LensSnapshotNode[] = [];
  const edges: LensSnapshotEdge[] = [];
  let hiddenNodeCount = 0;

  const domainSet = new Set<string>();
  for (const p of read.packs) {
    if (p.domain != null) domainSet.add(p.domain);
  }

  for (const domain of domainSet) {
    const id = `${DOMAIN_NODE_PREFIX}${domain}`;
    if (visible) {
      nodes.push({
        typeKey: "graph_skill_domain",
        id,
        visible: true,
        label: domain,
        meta: { domain },
      });
    } else {
      nodes.push({ typeKey: "graph_skill_domain", id, visible: false });
      hiddenNodeCount += 1;
    }
  }

  for (const p of read.packs) {
    const id = `${SKILL_NODE_PREFIX}${p.id}`;
    if (visible) {
      nodes.push({
        typeKey: "graph_skill",
        id,
        visible: true,
        label: p.name,
        meta: {
          skillId: p.id,
          skillKey: p.skillKey,
          name: p.name,
          description: p.description,
          domain: p.domain,
          riskLevel: p.riskLevel,
          approvalRequired: p.approvalRequired,
          active: p.active,
          createdAt: p.createdAt.toISOString(),
        },
      });
    } else {
      nodes.push({ typeKey: "graph_skill", id, visible: false });
      hiddenNodeCount += 1;
    }

    if (p.domain != null) {
      edges.push({
        typeKey: "belongs_to_domain",
        sourceNodeId: id,
        targetNodeId: `${DOMAIN_NODE_PREFIX}${p.domain}`,
        visible: true,
      });
    }
  }

  return {
    lensId: def.id,
    kind: def.kind,
    layout: def.layout,
    producedAt: now,
    nodes,
    edges,
    hiddenNodeCount,
    truncated: read.truncated,
  };
}

// ============================================================================
// Runner factory
// ============================================================================

export interface CreateGraphSkillLensRunnerDeps {
  readonly read: GraphSkillLensReadFn;
  readonly now?: () => Date;
}

export function createGraphSkillLensRunner(
  deps: CreateGraphSkillLensRunnerDeps,
): LensRunnerFn {
  const now = deps.now ?? (() => new Date());
  return async (
    def: GraphLensDefinition,
    viewer: LensRunnerViewerContext,
  ): Promise<LensSnapshot> => {
    const limit = clampGraphSkillLensLimit(viewer.limit);
    const read = await deps.read({
      workspaceId: viewer.workspaceId,
      limit,
      before: viewer.asOf,
    });
    return buildGraphSkillLensSnapshot({ def, viewer, read, now: now() });
  };
}
