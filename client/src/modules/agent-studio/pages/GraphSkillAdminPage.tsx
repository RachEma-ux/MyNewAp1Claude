/**
 * Graph Skill Admin page — no-deferral continuation-32 slice 129.
 *
 * Global Agent Studio page reachable at `/agent-studio/graph-skill-admin`.
 * Closes the partial-consumer gap on graphSkill.{listPackVersions, createPack,
 * publishVersion} — the 3 unconsumed endpoints on top of the existing
 * AgentSkillCatalogPage consumer of listEnabledPacks.
 */

import { FileStack } from "lucide-react";

import { PageHeader } from "../components/ui";
import { GraphSkillAdminPanel } from "../components/GraphSkillAdminPanel";

export default function GraphSkillAdminPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Graph Skill Admin"
        subtitle="Operator surface for graph skill pack lifecycle: list pack versions for a skillKey, create new packs (with risk classification), and publish new manifest versions."
        icon={<FileStack className="h-5 w-5" />}
      />
      <GraphSkillAdminPanel />
    </div>
  );
}
