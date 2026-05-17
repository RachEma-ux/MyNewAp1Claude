/**
 * Default graph-lens boot installer — Phase 24 §T-F.2.
 *
 * Registers one default lens per closed `GRAPH_LENS_KINDS` value so
 * the operator browser has 8 lenses present out-of-the-box without
 * any operator configuration. Concrete lens IMPLEMENTATIONS (the
 * actual graph queries each lens runs) land in subsequent T-F slices
 * — this installer ships the lens DEFINITIONS only, mirroring the
 * V1+ AS-2 default-governance-gate registry pattern (#782).
 *
 * Env-flag gated:
 *   AGS_GRAPH_LENS_DEFAULTS_INSTALL=on  → install at boot
 *   anything else / unset                → no-op
 *
 * Default OFF until the per-lens implementations stabilize. Test
 * harnesses inject `{}` env so the installer is no-op-by-default
 * inside tests.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Imports only the lens registry surface + closed-taxonomy
 *     constants. No graph access, no model execution, no tool
 *     dispatch, no credential reads.
 *   - The lens DEFINITIONS shipped here declare layout + governance
 *     scope. The eventual lens-runner that EXECUTES these queries
 *     will live in a separate module that imports
 *     `services/graph/repository/**` — that's where the
 *     GraphRepository boundary is enforced.
 */

import type { GraphLensDefinition } from "./contracts.js";
import { registerGraphLens } from "./registry.js";

const ENV_KEY = "AGS_GRAPH_LENS_DEFAULTS_INSTALL";

/**
 * 10 default lens definitions, one per closed `GRAPH_LENS_KINDS`
 * value. Each carries a sensible default layout + scope; operators
 * can register additional lenses of the same kind for tenant-specific
 * variants.
 */
export const DEFAULT_GRAPH_LENS_DEFINITIONS: ReadonlyArray<GraphLensDefinition> = [
  {
    id: "rag_default",
    kind: "rag",
    label: "RAG Retrieval View",
    layout: "force_directed",
    governanceScope: "workspace_members",
    description:
      "Surfaces retrieval-bound nodes: ags_rac_sources + ags_knowledge_units " +
      "the RAG pipeline has touched in the active workspace.",
  },
  {
    id: "rac_default",
    kind: "rac",
    label: "RAC Context Plan View",
    layout: "tree",
    governanceScope: "workspace_members",
    description:
      "Surfaces RAC retrieval plan items + their source bindings — " +
      "useful for tuning the planner without reading raw plan JSON.",
  },
  {
    id: "cag_default",
    kind: "cag",
    label: "CAG Pack View",
    layout: "matrix",
    governanceScope: "workspace_members",
    description:
      "Surfaces CAG block → source-note-version references and " +
      "block-hash → pack-version links. Helps trace stale-pack causes.",
  },
  {
    id: "graph_skill_default",
    kind: "graph_skill",
    label: "Graph Skill Pack View",
    layout: "tree",
    governanceScope: "workspace_members",
    description:
      "Surfaces Skill Pack → Cypher template → source note traceability. " +
      "Mirrors the Phase 12.5 usage analytics surface.",
  },
  {
    id: "mcp_default",
    kind: "mcp",
    label: "MCP Tool View",
    layout: "force_directed",
    governanceScope: "approver_only",
    description:
      "Surfaces tool registry + capability bindings + recent dispatches. " +
      "Approver-only because tool surfaces leak capability state.",
  },
  {
    id: "governance_default",
    kind: "governance",
    label: "Governance Lens",
    layout: "timeline",
    governanceScope: "approver_only",
    description:
      "Surfaces approval-bound nodes: ags_approval_steps + " +
      "ags_pending_permission_requests + ags_governance_records. Timeline " +
      "layout because approval chains are chronological.",
  },
  {
    id: "runtime_default",
    kind: "runtime",
    label: "Runtime Trace Lens",
    layout: "dependency_path",
    governanceScope: "workspace_members",
    description:
      "Surfaces agsRuntimeRuns + graphAgentDecisionTrace + step ledger. " +
      "Dependency-path layout because traces are sequential.",
  },
  {
    id: "institutional_memory_default",
    kind: "institutional_memory",
    label: "Institutional Memory Lens",
    layout: "force_directed",
    governanceScope: "workspace_members",
    description:
      "Surfaces Person / Team / Project / System / Decision nodes per " +
      "roadmap §Phase 25. Skeleton-only until T-G.1 concrete projection " +
      "lands.",
  },
  {
    id: "code_intelligence_default",
    kind: "code_intelligence",
    label: "Code Intelligence Lens",
    layout: "force_directed",
    governanceScope: "workspace_members",
    description:
      "Surfaces files / classes / functions / API endpoints + " +
      "imports / calls / declares relationships parsed from this repo. " +
      "Backed by ags_code_graph_* tables (T-G.2.3).",
  },
  {
    id: "security_devsecops_default",
    kind: "security_devsecops",
    label: "Security / DevSecOps Lens",
    layout: "dependency_path",
    governanceScope: "approver_only",
    description:
      "Surfaces CVE → Package → Component → Service → Environment → Owner → " +
      "CustomerExposure impact path. Backed by ags_security_graph_* tables " +
      "(T-G.3.3). Approver-only because security findings are not workspace-public.",
  },
];

export interface MaybeInstallDefaultGraphLensesOptions {
  /** Test seam — override the env source. */
  readonly env?: Record<string, string | undefined>;
  /** Test seam — override the registrar. */
  readonly register?: (def: GraphLensDefinition) => void;
}

export interface MaybeInstallDefaultGraphLensesResult {
  readonly installed: boolean;
  readonly installedIds: ReadonlyArray<string>;
}

/**
 * Boot-time opt-in installer. Mirrors the AS-4 envflag installer
 * pattern. Reads `AGS_GRAPH_LENS_DEFAULTS_INSTALL`; when "on",
 * registers the 10 default lens definitions.
 */
export function maybeInstallDefaultGraphLenses(
  options: MaybeInstallDefaultGraphLensesOptions = {},
): MaybeInstallDefaultGraphLensesResult {
  const env = options.env ?? process.env;
  const register = options.register ?? registerGraphLens;
  if (env[ENV_KEY] !== "on") {
    return { installed: false, installedIds: [] };
  }
  const installedIds: string[] = [];
  for (const def of DEFAULT_GRAPH_LENS_DEFINITIONS) {
    register(def);
    installedIds.push(def.id);
  }
  return { installed: true, installedIds };
}
