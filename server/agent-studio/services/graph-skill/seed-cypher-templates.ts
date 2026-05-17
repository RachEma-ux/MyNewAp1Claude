/**
 * Phase 12.5 — default Cypher query template seed.
 *
 * Seeds the `ags_query_templates` registry with the 15 default template
 * categories from the Neo4j CE backend ADR §2.6. Idempotent: re-running
 * upserts rows by `template_key`.
 *
 * ADR: docs/architecture/agent-studio-cypher-query-template-system.md
 * ADR: docs/architecture/agent-studio-neo4j-community-edition-graph-backend.md
 */

export interface CypherTemplateSeed {
  readonly templateKey: string;
  readonly name: string;
  readonly description: string;
  readonly graphBackend: "neo4j_ce" | "postgres" | "any";
  readonly queryLanguage: "cypher" | "sql";
  readonly cypherBody: string;
  /**
   * Zod-shaped parameter schema serialized as JSON for storage.
   * Runtime validation lives in the query template executor.
   */
  readonly parameterSchema: Record<string, { type: string; required?: boolean }>;
  readonly permissionFilterRequired: boolean;
  readonly maxDepth: number;
  readonly maxResults: number;
  readonly timeoutMs: number;
  readonly readOnly: boolean;
  readonly riskLevel: "low" | "medium" | "high";
  readonly allowedRoles: string[] | null;
}

export const DEFAULT_CYPHER_TEMPLATES: CypherTemplateSeed[] = [
  {
    templateKey: "local_graph_depth_1",
    name: "Local graph (depth 1)",
    description: "Direct neighbors of a seed node, governance-filtered.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH (seed { id: $seedNodeId })-[r]-(neighbor)
      WHERE neighbor.governance_status = 'active'
      RETURN seed, r, neighbor
      LIMIT $maxResults
    `.trim(),
    parameterSchema: {
      seedNodeId: { type: "string", required: true },
      maxResults: { type: "number" },
    },
    permissionFilterRequired: true,
    maxDepth: 1,
    maxResults: 100,
    timeoutMs: 2000,
    readOnly: true,
    riskLevel: "low",
    allowedRoles: null,
  },
  {
    templateKey: "local_graph_depth_2",
    name: "Local graph (depth 2)",
    description: "Neighbors-of-neighbors of a seed node.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH path = (seed { id: $seedNodeId })-[*1..2]-(neighbor)
      WHERE all(n IN nodes(path) WHERE n.governance_status = 'active')
      RETURN nodes(path) AS nodes, relationships(path) AS rels
      LIMIT $maxResults
    `.trim(),
    parameterSchema: {
      seedNodeId: { type: "string", required: true },
      maxResults: { type: "number" },
    },
    permissionFilterRequired: true,
    maxDepth: 2,
    maxResults: 300,
    timeoutMs: 3000,
    readOnly: true,
    riskLevel: "low",
    allowedRoles: null,
  },
  {
    templateKey: "local_graph_depth_3",
    name: "Local graph (depth 3)",
    description: "Three-hop neighborhood for deep-context retrieval.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH path = (seed { id: $seedNodeId })-[*1..3]-(neighbor)
      WHERE all(n IN nodes(path) WHERE n.governance_status = 'active')
      RETURN nodes(path) AS nodes, relationships(path) AS rels
      LIMIT $maxResults
    `.trim(),
    parameterSchema: {
      seedNodeId: { type: "string", required: true },
      maxResults: { type: "number" },
    },
    permissionFilterRequired: true,
    maxDepth: 3,
    maxResults: 500,
    timeoutMs: 4000,
    readOnly: true,
    riskLevel: "medium",
    allowedRoles: null,
  },
  {
    templateKey: "global_graph_sample",
    name: "Global graph sample",
    description: "Random sample of active nodes for overview display.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH (n)
      WHERE n.governance_status = 'active'
      RETURN n
      LIMIT $maxResults
    `.trim(),
    parameterSchema: { maxResults: { type: "number" } },
    permissionFilterRequired: true,
    maxDepth: 0,
    maxResults: 500,
    timeoutMs: 2000,
    readOnly: true,
    riskLevel: "low",
    allowedRoles: null,
  },
  {
    templateKey: "note_backlinks",
    name: "Note backlinks",
    description: "All notes that link to a given target note.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH (source:NoteVersion)-[:LINKS_TO]->(target:Note { id: $targetNoteId })
      WHERE source.governance_status = 'active'
      RETURN source
      LIMIT $maxResults
    `.trim(),
    parameterSchema: {
      targetNoteId: { type: "string", required: true },
      maxResults: { type: "number" },
    },
    permissionFilterRequired: true,
    maxDepth: 1,
    maxResults: 200,
    timeoutMs: 2000,
    readOnly: true,
    riskLevel: "low",
    allowedRoles: null,
  },
  {
    templateKey: "entity_neighborhood",
    name: "Entity neighborhood",
    description: "All observations, aliases, and mentions for an entity.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH (entity:Entity { id: $entityId })
      OPTIONAL MATCH (entity)-[:HAS_ALIAS]->(alias)
      OPTIONAL MATCH (entity)-[:OBSERVED_AS]->(obs:Observation)
      OPTIONAL MATCH (note:NoteVersion)-[:MENTIONS]->(entity)
      RETURN entity, collect(DISTINCT alias) AS aliases,
             collect(DISTINCT obs) AS observations,
             collect(DISTINCT note) AS mentioningNotes
    `.trim(),
    parameterSchema: { entityId: { type: "string", required: true } },
    permissionFilterRequired: true,
    maxDepth: 1,
    maxResults: 100,
    timeoutMs: 2000,
    readOnly: true,
    riskLevel: "low",
    allowedRoles: null,
  },
  {
    templateKey: "cag_source_notes",
    name: "CAG block source notes",
    description: "Source-note versions referenced by a given CAG block.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH (cag:CAGBlock { id: $cagBlockId })-[:REFERENCES_NOTE_VERSION]->(noteVersion:NoteVersion)
      WHERE noteVersion.governance_status = 'active'
      RETURN noteVersion
      LIMIT $maxResults
    `.trim(),
    parameterSchema: {
      cagBlockId: { type: "string", required: true },
      maxResults: { type: "number" },
    },
    permissionFilterRequired: true,
    maxDepth: 1,
    maxResults: 50,
    timeoutMs: 2000,
    readOnly: true,
    riskLevel: "low",
    allowedRoles: null,
  },
  {
    templateKey: "graph_skill_source_notes",
    name: "Graph Skill Pack source notes",
    description: "Source-note versions referenced by a given Graph Skill Pack.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH (pack:GraphSkillPack { id: $packId })-[:REFERENCES_NOTE_VERSION]->(noteVersion:NoteVersion)
      WHERE noteVersion.governance_status = 'active'
      RETURN noteVersion
      LIMIT $maxResults
    `.trim(),
    parameterSchema: {
      packId: { type: "string", required: true },
      maxResults: { type: "number" },
    },
    permissionFilterRequired: true,
    maxDepth: 1,
    maxResults: 50,
    timeoutMs: 2000,
    readOnly: true,
    riskLevel: "low",
    allowedRoles: null,
  },
  {
    templateKey: "runtime_trace_path",
    name: "Runtime trace path",
    description: "Full reasoning path for a runtime trace: CAG, Graph Skills, tools, decisions.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH (trace:RuntimeTrace { id: $runtimeTraceId })
      OPTIONAL MATCH (trace)-[:USED_CAG_BLOCK]->(cag)
      OPTIONAL MATCH (trace)-[:USED_GRAPH_SKILL]->(pack)
      OPTIONAL MATCH (trace)-[:USED_MCP_TOOL]->(tool)
      OPTIONAL MATCH (trace)-[:HAS_DECISION_TRACE]->(dt)-[:HAS_STEP]->(step)
      RETURN trace, collect(DISTINCT cag) AS cagBlocks,
             collect(DISTINCT pack) AS graphSkills,
             collect(DISTINCT tool) AS tools,
             dt, collect(step) AS steps
    `.trim(),
    parameterSchema: { runtimeTraceId: { type: "string", required: true } },
    permissionFilterRequired: true,
    maxDepth: 2,
    maxResults: 200,
    timeoutMs: 3000,
    readOnly: true,
    riskLevel: "low",
    allowedRoles: null,
  },
  {
    templateKey: "decision_trace_path",
    name: "Decision trace path",
    description: "Decision steps for a given decision trace.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH (dt:DecisionTrace { id: $decisionTraceId })-[:HAS_STEP]->(step)
      RETURN dt, collect(step) AS steps
    `.trim(),
    parameterSchema: { decisionTraceId: { type: "string", required: true } },
    permissionFilterRequired: true,
    maxDepth: 1,
    maxResults: 100,
    timeoutMs: 2000,
    readOnly: true,
    riskLevel: "low",
    allowedRoles: null,
  },
  {
    templateKey: "impact_analysis",
    name: "Impact analysis",
    description: "All nodes within depth-3 that depend on or are governed by a given seed.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH path = (seed { id: $seedNodeId })<-[:DEPENDS_ON|GOVERNS|USES|CALLS*1..3]-(impacted)
      WHERE all(n IN nodes(path) WHERE n.governance_status = 'active')
      RETURN DISTINCT impacted
      LIMIT $maxResults
    `.trim(),
    parameterSchema: {
      seedNodeId: { type: "string", required: true },
      maxResults: { type: "number" },
    },
    permissionFilterRequired: true,
    maxDepth: 3,
    maxResults: 500,
    timeoutMs: 5000,
    readOnly: true,
    riskLevel: "medium",
    allowedRoles: null,
  },
  {
    templateKey: "tool_policy_dependencies",
    name: "Tool policy dependencies",
    description: "Policies that govern a given MCP tool.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH (policy:Policy)-[:GOVERNS]->(tool:MCPTool { id: $toolId })
      WHERE policy.governance_status = 'active'
      RETURN policy
    `.trim(),
    parameterSchema: { toolId: { type: "string", required: true } },
    permissionFilterRequired: true,
    maxDepth: 1,
    maxResults: 50,
    timeoutMs: 2000,
    readOnly: true,
    riskLevel: "low",
    allowedRoles: null,
  },
  {
    templateKey: "workflow_tool_dependencies",
    name: "Workflow tool dependencies",
    description: "MCP tools called by a given workflow.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH (workflow:Workflow { id: $workflowId })-[:USES]->(tool:MCPTool)
      RETURN tool
    `.trim(),
    parameterSchema: { workflowId: { type: "string", required: true } },
    permissionFilterRequired: true,
    maxDepth: 1,
    maxResults: 100,
    timeoutMs: 2000,
    readOnly: true,
    riskLevel: "low",
    allowedRoles: null,
  },
  {
    templateKey: "code_dependency_path",
    name: "Code dependency path",
    description: "Dependency chain from a starting CodeFile.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH path = (start:CodeFile { id: $codeFileId })-[:DEPENDS_ON|USES|CALLS*1..3]->(downstream)
      RETURN nodes(path) AS chain
      LIMIT $maxResults
    `.trim(),
    parameterSchema: {
      codeFileId: { type: "string", required: true },
      maxResults: { type: "number" },
    },
    permissionFilterRequired: true,
    maxDepth: 3,
    maxResults: 300,
    timeoutMs: 4000,
    readOnly: true,
    riskLevel: "medium",
    allowedRoles: null,
  },
  {
    templateKey: "security_blast_radius",
    name: "Security blast radius",
    description: "Affected services + customer exposure for a security finding.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH path = (finding:SecurityFinding { id: $findingId })-[:AFFECTS|DEPENDS_ON*1..4]->(impacted)
      RETURN DISTINCT impacted, length(path) AS distance
      ORDER BY distance ASC
      LIMIT $maxResults
    `.trim(),
    parameterSchema: {
      findingId: { type: "string", required: true },
      maxResults: { type: "number" },
    },
    permissionFilterRequired: true,
    maxDepth: 4,
    maxResults: 200,
    timeoutMs: 5000,
    readOnly: true,
    riskLevel: "high",
    allowedRoles: ["admin", "security"],
  },
  {
    templateKey: "kgra_relationship_traversal",
    name: "KGRA relationship traversal",
    description: "Traverse KGRA-derived relationships from a given entity.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH (start:Entity { id: $entityId })-[r:RELATED*1..2]-(neighbor:Entity)
      WHERE all(rel IN r WHERE rel.weight >= $minWeight)
      RETURN DISTINCT neighbor, r
      LIMIT $maxResults
    `.trim(),
    parameterSchema: {
      entityId: { type: "string", required: true },
      minWeight: { type: "number" },
      maxResults: { type: "number" },
    },
    permissionFilterRequired: true,
    maxDepth: 2,
    maxResults: 300,
    timeoutMs: 3000,
    readOnly: true,
    riskLevel: "low",
    allowedRoles: null,
  },

  // ────────────────────────────────────────────────────────────
  // Phase 7.5c — Impact Analysis templates (7 impact kinds per
  // the remaining-execution-plan §T-F.3 + Phase 7.5 blocker doc §2)
  //
  // Each template follows the same shape: start at a node by id,
  // traverse impact-type-specific relationships up to a depth cap
  // (interpolated literal in the Cypher body — Cypher 5 doesn't
  // accept parameter binding for variable-length depth bounds),
  // return distinct impacted nodes + the relationship path. The
  // permission post-filter (`filterByPermissions` on the
  // GraphRepository) is applied by the lens runner after the
  // query returns; templates are marked
  // `permissionFilterRequired: true` so the runner enforces it.
  //
  // Depth cap rationale: keeping the literal `*1..3` baked into
  // the Cypher body lets Neo4j optimize the path expansion; the
  // matching `maxDepth: 3` on the template metadata is the
  // operator-visible contract. If we later need dynamic depth,
  // switch to `apoc.path.expandConfig({ maxLevel: $maxDepth })`
  // — APOC is already in the production plugin list.
  //
  // These templates exercise the GraphRepository.executeTemplate
  // path implemented by Phase 7.5b. The T-F.3 Impact Analysis
  // Lens (next sub-arc) registers the runner that calls them.
  // ────────────────────────────────────────────────────────────
  {
    templateKey: "impact_knowledge",
    name: "Knowledge Impact",
    description:
      "Downstream knowledge consumers of a starting note — follows REFERENCES / CITES / EXPLAINS edges up to depth 3.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH (start { id: $startId })-[r:REFERENCES|CITES|EXPLAINS*1..3]->(impacted)
      WHERE coalesce(impacted.governance_status, 'active') = 'active'
      RETURN DISTINCT impacted, last(r) AS edge
      LIMIT $maxResults
    `.trim(),
    parameterSchema: {
      startId: { type: "string", required: true },
      maxResults: { type: "number" },
    },
    permissionFilterRequired: true,
    maxDepth: 3,
    maxResults: 500,
    timeoutMs: 5000,
    readOnly: true,
    riskLevel: "low",
    allowedRoles: null,
  },
  {
    templateKey: "impact_runtime",
    name: "Runtime Impact",
    description:
      "Runtime traces / executions affected by a starting entity — follows USED_BY / EXECUTED_IN / TRACED_IN edges up to depth 2.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH (start { id: $startId })-[r:USED_BY|EXECUTED_IN|TRACED_IN*1..2]->(impacted)
      WHERE coalesce(impacted.governance_status, 'active') = 'active'
      RETURN DISTINCT impacted, last(r) AS edge
      LIMIT $maxResults
    `.trim(),
    parameterSchema: {
      startId: { type: "string", required: true },
      maxResults: { type: "number" },
    },
    permissionFilterRequired: true,
    maxDepth: 2,
    maxResults: 500,
    timeoutMs: 5000,
    readOnly: true,
    riskLevel: "low",
    allowedRoles: null,
  },
  {
    templateKey: "impact_code",
    name: "Code Impact",
    description:
      "Code symbols downstream of a starting file/function — follows IMPORTS / CALLS / DECLARES edges up to depth 4. Pairs with the T-G.2 Code Intelligence Graph projection.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH (start { id: $startId })-[r:IMPORTS|CALLS|DECLARES*1..4]->(impacted)
      WHERE coalesce(impacted.governance_status, 'active') = 'active'
      RETURN DISTINCT impacted, last(r) AS edge
      LIMIT $maxResults
    `.trim(),
    parameterSchema: {
      startId: { type: "string", required: true },
      maxResults: { type: "number" },
    },
    permissionFilterRequired: true,
    maxDepth: 4,
    maxResults: 1000,
    timeoutMs: 8000,
    readOnly: true,
    riskLevel: "low",
    allowedRoles: null,
  },
  {
    templateKey: "impact_security",
    name: "Security Impact",
    description:
      "Security-sensitive nodes reachable from a starting node — follows AUTHORIZES / EXPOSES / GRANTS_ACCESS edges up to depth 3. Restricted to admin/security roles.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH (start { id: $startId })-[r:AUTHORIZES|EXPOSES|GRANTS_ACCESS*1..3]->(impacted)
      WHERE coalesce(impacted.governance_status, 'active') = 'active'
      RETURN DISTINCT impacted, last(r) AS edge
      LIMIT $maxResults
    `.trim(),
    parameterSchema: {
      startId: { type: "string", required: true },
      maxResults: { type: "number" },
    },
    permissionFilterRequired: true,
    maxDepth: 3,
    maxResults: 200,
    timeoutMs: 5000,
    readOnly: true,
    riskLevel: "high",
    allowedRoles: ["admin", "security"],
  },
  {
    templateKey: "impact_governance",
    name: "Governance Impact",
    description:
      "Governance policies / approvals / CAG blocks affected by a starting node — follows GOVERNED_BY / APPROVED_BY / DEPENDS_ON_POLICY edges up to depth 2.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH (start { id: $startId })-[r:GOVERNED_BY|APPROVED_BY|DEPENDS_ON_POLICY*1..2]->(impacted)
      WHERE coalesce(impacted.governance_status, 'active') = 'active'
      RETURN DISTINCT impacted, last(r) AS edge
      LIMIT $maxResults
    `.trim(),
    parameterSchema: {
      startId: { type: "string", required: true },
      maxResults: { type: "number" },
    },
    permissionFilterRequired: true,
    maxDepth: 2,
    maxResults: 300,
    timeoutMs: 5000,
    readOnly: true,
    riskLevel: "medium",
    allowedRoles: ["admin", "governance"],
  },
  {
    templateKey: "impact_tool",
    name: "Tool Impact",
    description:
      "Runtime tool definitions / capability packs affected by a starting node — follows DISPATCHES_TO / CAPABILITY_OF / WIRED_INTO edges up to depth 2.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH (start { id: $startId })-[r:DISPATCHES_TO|CAPABILITY_OF|WIRED_INTO*1..2]->(impacted)
      WHERE coalesce(impacted.governance_status, 'active') = 'active'
      RETURN DISTINCT impacted, last(r) AS edge
      LIMIT $maxResults
    `.trim(),
    parameterSchema: {
      startId: { type: "string", required: true },
      maxResults: { type: "number" },
    },
    permissionFilterRequired: true,
    maxDepth: 2,
    maxResults: 300,
    timeoutMs: 5000,
    readOnly: true,
    riskLevel: "low",
    allowedRoles: null,
  },
  {
    templateKey: "impact_workflow",
    name: "Workflow Impact",
    description:
      "Workflow steps / automation triggers affected by a starting node — follows TRIGGERS / STEPS_INTO / DEPENDS_ON_STEP edges up to depth 4.",
    graphBackend: "neo4j_ce",
    queryLanguage: "cypher",
    cypherBody: `
      MATCH (start { id: $startId })-[r:TRIGGERS|STEPS_INTO|DEPENDS_ON_STEP*1..4]->(impacted)
      WHERE coalesce(impacted.governance_status, 'active') = 'active'
      RETURN DISTINCT impacted, last(r) AS edge
      LIMIT $maxResults
    `.trim(),
    parameterSchema: {
      startId: { type: "string", required: true },
      maxResults: { type: "number" },
    },
    permissionFilterRequired: true,
    maxDepth: 4,
    maxResults: 500,
    timeoutMs: 5000,
    readOnly: true,
    riskLevel: "low",
    allowedRoles: null,
  },
];

/**
 * Operator entry point. Phase 12.5 wiring calls this once at boot;
 * subsequent boots upsert by `template_key` (idempotent).
 */
export interface SeedCypherTemplatesResult {
  readonly inserted: number;
  readonly updated: number;
  readonly errors: Array<{ templateKey: string; error: string }>;
}

export async function seedCypherTemplates(
  upsert: (template: CypherTemplateSeed) => Promise<"inserted" | "updated">,
): Promise<SeedCypherTemplatesResult> {
  const result: SeedCypherTemplatesResult = {
    inserted: 0,
    updated: 0,
    errors: [],
  };
  for (const template of DEFAULT_CYPHER_TEMPLATES) {
    try {
      const status = await upsert(template);
      if (status === "inserted") (result as { inserted: number }).inserted++;
      else (result as { updated: number }).updated++;
    } catch (e) {
      result.errors.push({
        templateKey: template.templateKey,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return result;
}
