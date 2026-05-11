/**
 * Native Graph Workspace — global Agent Studio page.
 *
 * Phase 13 §7. Mounts the three read-only panels shipped in
 * Phase 12.5 §9 (GraphSkillUsagePanel), Phase 13 §5
 * (GraphAgentExplainPanel), and Phase 13 §6
 * (GraphSchemaSummaryPanel) on a single host page reachable at
 * `/agent-studio/graph-workspace`.
 *
 * The page is global (no `agentId` context) — the Graph Agent runs
 * are cross-agent: any agent in the workspace can invoke graph-
 * agent-lite via tRPC.
 */

import GraphSkillUsagePanel from "../components/GraphSkillUsagePanel";
import GraphAgentExplainPanel from "../components/GraphAgentExplainPanel";
import GraphSchemaSummaryPanel from "../components/GraphSchemaSummaryPanel";
import { PageHeader } from "../components/ui";
import { Network } from "lucide-react";

export default function GraphWorkspacePage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Graph Workspace"
        subtitle="Observability for the Native Graph Workspace runtime — Skill Pack usage, agent decision traces, and the prompt-safe ontology view."
        icon={<Network className="h-5 w-5" />}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GraphSkillUsagePanel />
        <GraphAgentExplainPanel />
      </div>
      <GraphSchemaSummaryPanel />
    </div>
  );
}
