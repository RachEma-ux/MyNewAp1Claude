/**
 * VaultImpactAnalysisPage — child of the Vault Explorer group.
 *
 * Runs the 7 `impact_*` Cypher templates (knowledge, runtime, code,
 * security, governance, tool, workflow) against a vault-note seed
 * node. Backed by the Native Graph Workspace runtime —
 * `agentStudio.graphWorkspace.runImpactTemplate` executes parameterized
 * Cypher from the `ags_query_templates` registry against Neo4j CE.
 *
 * Distinct from the standalone admin `/agent-studio/impact-analysis`
 * page (`ImpactAnalysisPage`) — that surface is closed-taxonomy admin
 * over impact-event ladders; this page is workspace context with a
 * seed node.
 */

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import {
  VaultExplorer,
  ImpactAnalysisView,
} from "../components/graph-workspace";
import { PageHeader } from "../components/ui";

export default function VaultImpactAnalysisPage() {
  const [selectedVaultId, setSelectedVaultId] = useState<number | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);

  return (
    <div className="flex flex-col h-full" data-testid="vault-impact-page">
      <div className="px-4 pt-4 pb-2 shrink-0">
        <PageHeader
          icon={<TrendingUp className="h-5 w-5" />}
          title="Impact Analysis"
          subtitle="Run the 7 impact_* Cypher templates against a vault-note seed."
        />
      </div>
      <div className="flex-1 min-h-0 flex">
        <VaultExplorer
          selectedVaultId={selectedVaultId}
          selectedNoteId={selectedNoteId}
          onSelectVault={(id) => {
            setSelectedVaultId(id);
            setSelectedNoteId(null);
          }}
          onSelectNote={(id) => setSelectedNoteId(id)}
        />
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
            {selectedNoteId === null ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <TrendingUp className="h-10 w-10 opacity-30" />
                <p className="text-sm">
                  Select a note on the left to seed impact analysis.
                </p>
              </div>
            ) : (
              <ImpactAnalysisView seedNodeId={`note:${selectedNoteId}`} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
