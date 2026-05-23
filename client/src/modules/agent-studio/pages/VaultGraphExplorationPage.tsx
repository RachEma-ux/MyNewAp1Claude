/**
 * VaultGraphExplorationPage — child of the Vault Explorer group.
 *
 * Local + global graph views of the typed knowledge graph projected
 * from vault notes. Backed by the Native Graph Workspace runtime —
 * `agentStudio.graphWorkspace.{localGraph, globalGraphSample,
 * neighborhood, shortestPath}` tRPC procedures executing parameterized
 * Cypher templates against Neo4j CE.
 */

import { useState } from "react";
import { GitBranch } from "lucide-react";
import {
  VaultExplorer,
  LocalGraphView,
  GlobalGraphView,
  GraphInspector,
  type InspectorTarget,
} from "../components/graph-workspace";
import { PageHeader } from "../components/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GraphTab = "local" | "global";

export default function VaultGraphExplorationPage() {
  const [selectedVaultId, setSelectedVaultId] = useState<number | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [tab, setTab] = useState<GraphTab>("local");
  const [inspectorTarget, setInspectorTarget] = useState<InspectorTarget>({
    kind: "none",
  });

  return (
    <div className="flex flex-col h-full" data-testid="vault-graph-page">
      <div className="px-4 pt-4 pb-2 shrink-0">
        <PageHeader
          icon={<GitBranch className="h-5 w-5" />}
          title="Graph Exploration"
          subtitle="Local (seed-rooted) and global (workspace-sampled) views of the typed knowledge graph."
        />
      </div>
      <div className="flex-1 min-h-0 flex">
        <VaultExplorer
          selectedVaultId={selectedVaultId}
          selectedNoteId={selectedNoteId}
          onSelectVault={(id) => {
            setSelectedVaultId(id);
            setSelectedNoteId(null);
            setInspectorTarget({ kind: "none" });
          }}
          onSelectNote={(id) => {
            setSelectedNoteId(id);
            setInspectorTarget({ kind: "none" });
          }}
        />
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="border-b px-3 py-2 shrink-0 flex items-center gap-2">
            {(["local", "global"] as const).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={tab === t ? "default" : "ghost"}
                className={cn("h-7 px-2 text-xs capitalize")}
                onClick={() => setTab(t)}
                data-testid={`vault-graph-tab-${t}`}
              >
                {t === "local" ? "Local graph" : "Global sample"}
              </Button>
            ))}
            <span className="text-[10px] text-muted-foreground ml-auto">
              {tab === "local"
                ? selectedNoteId === null
                  ? "Pick a note to seed the local graph"
                  : `Seed: note:${selectedNoteId}`
                : "Workspace-wide sample"}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
            {tab === "local" ? (
              selectedNoteId === null ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                  <GitBranch className="h-10 w-10 opacity-30" />
                  <p className="text-sm">Select a note on the left to root the local graph.</p>
                </div>
              ) : (
                <LocalGraphView
                  seedNodeId={`note:${selectedNoteId}`}
                  onSelectNode={(nodeId) =>
                    setInspectorTarget({ kind: "node", nodeId })
                  }
                  onSelectEdge={(e) =>
                    setInspectorTarget({
                      kind: "edge",
                      fromId: e.fromId,
                      toId: e.toId,
                    })
                  }
                />
              )
            ) : (
              <GlobalGraphView
                onSelectNode={(nodeId) =>
                  setInspectorTarget({ kind: "node", nodeId })
                }
              />
            )}
          </div>
        </main>
        <aside className="border-l p-3 w-80 shrink-0 overflow-auto bg-muted/20">
          <GraphInspector target={inspectorTarget} />
        </aside>
      </div>
    </div>
  );
}
