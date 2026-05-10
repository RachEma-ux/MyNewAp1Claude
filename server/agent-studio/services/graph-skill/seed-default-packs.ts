/**
 * Phase 12.5 — default Graph Skill Pack seed.
 *
 * Seeds initial domain-scoped Graph Skill Packs that Graph Agent Lite
 * can consume out-of-the-box.
 *
 * ADR: docs/architecture/agent-studio-graph-skill-packs.md
 */

export interface GraphSkillPackSeed {
  readonly skillKey: string;
  readonly name: string;
  readonly description: string;
  readonly domain: "institutional" | "code" | "security" | "workflow" | "governance" | "knowledge" | "runtime";
  readonly supportedNodeTypeKeys: string[];
  readonly supportedEdgeTypeKeys: string[];
  readonly templateKeys: string[];
  readonly riskLevel: "low" | "medium" | "high";
  readonly approvalRequired: boolean;
  readonly allowedRoles: string[] | null;
}

export const DEFAULT_GRAPH_SKILL_PACKS: GraphSkillPackSeed[] = [
  {
    skillKey: "vault_navigator",
    name: "Vault Navigator",
    description: "Navigate Markdown vault: notes, wikilinks, backlinks, tags. Use for Q&A grounded in vault content.",
    domain: "knowledge",
    supportedNodeTypeKeys: ["Note", "NoteVersion", "Tag", "Attachment"],
    supportedEdgeTypeKeys: ["LINKS_TO", "MENTIONS", "HAS_TAG", "EMBEDS", "VERSION_OF"],
    templateKeys: ["local_graph_depth_1", "local_graph_depth_2", "note_backlinks"],
    riskLevel: "low",
    approvalRequired: false,
    allowedRoles: null,
  },
  {
    skillKey: "entity_inspector",
    name: "Entity Inspector",
    description: "Inspect entities, observations, aliases, and KGRA-derived relationships.",
    domain: "knowledge",
    supportedNodeTypeKeys: ["Entity", "Observation", "NoteVersion"],
    supportedEdgeTypeKeys: ["HAS_ALIAS", "OBSERVED_AS", "MENTIONS", "RELATED"],
    templateKeys: ["entity_neighborhood", "kgra_relationship_traversal"],
    riskLevel: "low",
    approvalRequired: false,
    allowedRoles: null,
  },
  {
    skillKey: "runtime_trace_explorer",
    name: "Runtime Trace Explorer",
    description: "Trace a runtime run end-to-end: CAG blocks, Graph Skills, tools, decision steps. Use for Why-This-Answer investigations.",
    domain: "runtime",
    supportedNodeTypeKeys: ["RuntimeTrace", "DecisionTrace", "DecisionTraceStep", "CAGBlock", "GraphSkillPack", "MCPTool"],
    supportedEdgeTypeKeys: ["USED_CAG_BLOCK", "USED_GRAPH_SKILL", "USED_MCP_TOOL", "HAS_DECISION_TRACE", "HAS_STEP"],
    templateKeys: ["runtime_trace_path", "decision_trace_path"],
    riskLevel: "low",
    approvalRequired: false,
    allowedRoles: null,
  },
  {
    skillKey: "cag_provenance_walker",
    name: "CAG Provenance Walker",
    description: "Follow the chain from a CAG block back to its source note versions.",
    domain: "knowledge",
    supportedNodeTypeKeys: ["CAGBlock", "NoteVersion", "Note"],
    supportedEdgeTypeKeys: ["REFERENCES_NOTE_VERSION", "PROMOTED_TO", "VERSION_OF"],
    templateKeys: ["cag_source_notes"],
    riskLevel: "low",
    approvalRequired: false,
    allowedRoles: null,
  },
  {
    skillKey: "impact_analyst",
    name: "Impact Analyst",
    description: "Analyze blast radius / downstream impact of changes to a system component.",
    domain: "workflow",
    supportedNodeTypeKeys: ["Service", "DbTable", "CodeFile", "MCPTool", "Workflow", "Policy"],
    supportedEdgeTypeKeys: ["DEPENDS_ON", "GOVERNS", "USES", "CALLS"],
    templateKeys: ["impact_analysis", "tool_policy_dependencies", "workflow_tool_dependencies"],
    riskLevel: "medium",
    approvalRequired: false,
    allowedRoles: null,
  },
  {
    skillKey: "code_architecture_navigator",
    name: "Code Architecture Navigator",
    description: "Navigate code-graph dependencies for understanding service/file/function relationships.",
    domain: "code",
    supportedNodeTypeKeys: ["CodeFile", "Service", "DbTable"],
    supportedEdgeTypeKeys: ["DEPENDS_ON", "USES", "CALLS"],
    templateKeys: ["code_dependency_path"],
    riskLevel: "medium",
    approvalRequired: false,
    allowedRoles: null,
  },
  {
    skillKey: "security_responder",
    name: "Security Responder",
    description: "Determine customer exposure and affected components for a security finding.",
    domain: "security",
    supportedNodeTypeKeys: ["SecurityFinding", "Service", "Component", "Owner"],
    supportedEdgeTypeKeys: ["AFFECTS", "DEPENDS_ON"],
    templateKeys: ["security_blast_radius"],
    riskLevel: "high",
    approvalRequired: true,
    allowedRoles: ["admin", "security"],
  },
];

export interface SeedGraphSkillPacksResult {
  readonly inserted: number;
  readonly updated: number;
  readonly errors: Array<{ skillKey: string; error: string }>;
}

export async function seedGraphSkillPacks(
  upsert: (pack: GraphSkillPackSeed) => Promise<"inserted" | "updated">,
): Promise<SeedGraphSkillPacksResult> {
  const result: SeedGraphSkillPacksResult = {
    inserted: 0,
    updated: 0,
    errors: [],
  };
  for (const pack of DEFAULT_GRAPH_SKILL_PACKS) {
    try {
      const status = await upsert(pack);
      if (status === "inserted") (result as { inserted: number }).inserted++;
      else (result as { updated: number }).updated++;
    } catch (e) {
      result.errors.push({
        skillKey: pack.skillKey,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return result;
}
