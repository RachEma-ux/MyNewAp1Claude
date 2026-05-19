/**
 * Impact Analysis — per-kind Cypher template registry.
 *
 * Slice 29 of the no-deferral continuation catalogue (2026-05-19).
 * Closes the `impact-analysis-executor.ts` "Today: always stub"
 * branch for kinds that have a registered template.
 *
 * Each entry maps an `ImpactAnalysisKind` to:
 *   - `templateKey`     — the `ags_query_templates.template_key` to
 *                         execute via `GraphRepository.executeTemplate`.
 *   - `buildParameters` — pure function that converts an
 *                         `ImpactAnalysisRequest` into the parameter
 *                         object the template expects.
 *   - `mapRow`          — pure function that maps each Cypher result
 *                         row into the `ImpactAnalysisResult.nodes /
 *                         edges` shape.
 *
 * Kinds without an entry continue to return the anchor-only stub
 * result (preserves the back-compat contract for kinds not yet
 * templated).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - All Cypher routes through `ags_query_templates` (the registry);
 *     no raw query strings.
 *   - Templates are seeded into `ags_query_templates` by
 *     `seedImpactAnalysisTemplates`; the seed is operator-callable +
 *     idempotent.
 *   - Read-only — the templates' `read_only` column is `true`,
 *     enforced by the executor.
 */

import type {
  ImpactAnalysisKind,
  ImpactAnalysisRequest,
  ImpactAnalysisNode,
  ImpactAnalysisEdge,
} from "./impact-analysis-contracts.js";

export interface ImpactAnalysisTemplateEntry {
  readonly kind: ImpactAnalysisKind;
  readonly templateKey: string;
  readonly description: string;
  readonly cypherBody: string;
  readonly parameterSchema: Record<string, "string" | "number" | "string[]">;
  readonly buildParameters: (
    request: ImpactAnalysisRequest,
  ) => Record<string, unknown>;
  readonly mapRows: (
    rows: ReadonlyArray<Record<string, unknown>>,
    request: ImpactAnalysisRequest,
  ) => {
    nodes: ImpactAnalysisNode[];
    edges: ImpactAnalysisEdge[];
  };
}

const KNOWLEDGE_IMPACT_TEMPLATE_KEY = "impact_analysis.knowledge_impact";

/**
 * Closed-taxonomy template registry. Keyed by `ImpactAnalysisKind`.
 *
 * Only kinds with a registered entry route through
 * `GraphRepository.executeTemplate`; the rest fall back to the
 * anchor-only stub.
 */
export const IMPACT_ANALYSIS_TEMPLATES: ReadonlyArray<ImpactAnalysisTemplateEntry> =
  [
    {
      kind: "knowledge_impact",
      templateKey: KNOWLEDGE_IMPACT_TEMPLATE_KEY,
      description:
        "Surfaces knowledge units / notes whose graph context depends on the starting node. " +
        "Traverses RELATED_TO / DERIVES_FROM / CITES at most `maxDepth` hops.",
      // The actual Cypher executes against the projected Neo4j graph.
      // Parameters: $startId (int), $maxDepth (int), $typeFilter (list of strings or null).
      cypherBody: `
        MATCH (anchor {id: $startId})
        WHERE (anchor:Note OR anchor:KnowledgeUnit OR anchor:Entity)
        OPTIONAL MATCH path = (anchor)-[r:RELATED_TO|DERIVES_FROM|CITES*1..$maxDepth]-(impacted)
        WITH anchor, impacted, length(path) AS depth, r
        WHERE impacted IS NOT NULL
          AND ($typeFilter IS NULL OR ANY(t IN labels(impacted) WHERE t IN $typeFilter))
        RETURN
          anchor.id    AS anchorId,
          labels(anchor)[0]   AS anchorTypeKey,
          impacted.id  AS impactedId,
          labels(impacted)[0] AS impactedTypeKey,
          impacted.title AS impactedLabel,
          depth,
          [rel IN r | { typeKey: type(rel), edgeKey: rel.id }] AS edgeChain
        ORDER BY depth ASC
        LIMIT 200
      `.trim(),
      parameterSchema: {
        startId: "string",
        maxDepth: "number",
        typeFilter: "string[]",
      },
      buildParameters(request) {
        return {
          startId: request.startingNode.id,
          maxDepth: request.maxDepth ?? 3,
          typeFilter: request.nodeTypeKeyFilter ?? null,
        };
      },
      mapRows(rows, request) {
        const nodes: ImpactAnalysisNode[] = [
          {
            typeKey: request.startingNode.typeKey,
            id: request.startingNode.id,
            depth: 0,
            visible: true,
          },
        ];
        const seenNodes = new Set<string>([
          `${request.startingNode.typeKey}::${request.startingNode.id}`,
        ]);
        const edges: ImpactAnalysisEdge[] = [];
        const seenEdges = new Set<string>();
        for (const row of rows) {
          const impactedId = row.impactedId == null ? null : String(row.impactedId);
          const impactedTypeKey = String(row.impactedTypeKey ?? "Node");
          const impactedLabel =
            row.impactedLabel == null ? undefined : String(row.impactedLabel);
          const depth = Number(row.depth ?? 1);
          if (impactedId == null) continue;
          const nodeKey = `${impactedTypeKey}::${impactedId}`;
          if (!seenNodes.has(nodeKey)) {
            seenNodes.add(nodeKey);
            nodes.push({
              typeKey: impactedTypeKey,
              id: impactedId,
              depth,
              visible: true,
              ...(impactedLabel !== undefined ? { label: impactedLabel } : {}),
            });
          }
          const edgeChain = Array.isArray(row.edgeChain) ? row.edgeChain : [];
          for (const link of edgeChain as Array<{
            typeKey: string;
            edgeKey: unknown;
          }>) {
            // Edge identity for dedup uses the relationship's id field
            // when Neo4j carries one; collapse missing-id rows to
            // (type, from, to) so duplicate edges still de-dup.
            const edgeId =
              link.edgeKey == null
                ? `${link.typeKey}::${request.startingNode.id}::${impactedId}`
                : `${link.typeKey}::${String(link.edgeKey)}`;
            if (seenEdges.has(edgeId)) continue;
            seenEdges.add(edgeId);
            edges.push({
              typeKey: link.typeKey,
              sourceNodeId: request.startingNode.id,
              targetNodeId: impactedId,
              visible: true,
            });
          }
        }
        return { nodes, edges };
      },
    },
  ];

/**
 * Lookup by kind. Returns `null` when no template is registered (the
 * caller should fall back to the anchor-only stub).
 */
export function findImpactAnalysisTemplate(
  kind: ImpactAnalysisKind,
): ImpactAnalysisTemplateEntry | null {
  return IMPACT_ANALYSIS_TEMPLATES.find((t) => t.kind === kind) ?? null;
}

export function hasImpactAnalysisTemplate(kind: ImpactAnalysisKind): boolean {
  return findImpactAnalysisTemplate(kind) !== null;
}

/**
 * Seed entry for `scripts/seed-impact-analysis-templates.ts` (operator-
 * callable). The shape matches a row in `ags_query_templates`.
 */
export interface ImpactAnalysisTemplateSeedRow {
  readonly templateKey: string;
  readonly name: string;
  readonly description: string;
  readonly graphBackend: "neo4j_community";
  readonly queryLanguage: "cypher";
  readonly cypherBody: string;
  readonly parameterSchema: Record<string, "string" | "number" | "string[]">;
  readonly permissionFilterRequired: boolean;
  readonly maxDepth: number;
  readonly maxResults: number;
  readonly timeoutMs: number;
  readonly readOnly: boolean;
  readonly riskLevel: "low" | "medium" | "high";
}

export function buildImpactAnalysisTemplateSeedRows(): ReadonlyArray<ImpactAnalysisTemplateSeedRow> {
  return IMPACT_ANALYSIS_TEMPLATES.map((t) => ({
    templateKey: t.templateKey,
    name: `Impact Analysis — ${t.kind}`,
    description: t.description,
    graphBackend: "neo4j_community" as const,
    queryLanguage: "cypher" as const,
    cypherBody: t.cypherBody,
    parameterSchema: t.parameterSchema,
    permissionFilterRequired: true,
    maxDepth: 6,
    maxResults: 200,
    timeoutMs: 5000,
    readOnly: true,
    riskLevel: "low" as const,
  }));
}
