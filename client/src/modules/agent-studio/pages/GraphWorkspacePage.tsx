/**
 * Native Graph Workspace — global Agent Studio page.
 *
 * Product Work mission (2026-05-17) — refactored from observability-
 * only into an Obsidian-like workspace shell composing:
 *   - VaultExplorer (item 15) — vault → folder → note tree
 *   - MarkdownEditorPane (items 14 + 16) — read / edit / source modes
 *   - WikilinksBacklinksPanel (item 17) — outgoing + incoming links
 *   - LocalGraphView (item 18) — depth-bounded local graph
 *   - GlobalGraphView (item 19) — workspace-wide sample
 *   - GraphInspector (item 20) — explainNode + explainPath
 *   - ImpactAnalysisView (item 21) — 7 impact_* templates
 *   - GraphQualityFindingsPanel (item 22, reused as workspace UX)
 *   - RuntimeAndDecisionTraceView (items 23 + 24)
 *   - WorkspaceStateLayer (item 25) — 11 explicit states
 *
 * Backwards-compat: the original three observability panels
 * (GraphSkillUsagePanel, GraphAgentExplainPanel, GraphSchemaSummaryPanel)
 * are preserved under the Observability tab.
 */

import React, { useState } from "react";
import { Network } from "lucide-react";

import GraphSkillUsagePanel from "../components/GraphSkillUsagePanel";
import GraphAgentExplainPanel from "../components/GraphAgentExplainPanel";
import GraphSchemaSummaryPanel from "../components/GraphSchemaSummaryPanel";
import { GraphQualityFindingsPanel } from "../components/GraphQualityFindingsPanel";
import { PageHeader } from "../components/ui";
import {
  VaultExplorer,
  MarkdownEditorPane,
  WikilinksBacklinksPanel,
  LocalGraphView,
  GlobalGraphView,
  GraphInspector,
  ImpactAnalysisView,
  RuntimeAndDecisionTraceView,
  type InspectorTarget,
} from "../components/graph-workspace";
import { trpc } from "../../../lib/trpc";

type WorkspaceTab =
  | "editor"
  | "local_graph"
  | "global_graph"
  | "impact"
  | "trace"
  | "observability";

export default function GraphWorkspacePage(): React.ReactElement {
  const [selectedVaultId, setSelectedVaultId] = useState<number | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("editor");
  const [inspectorTarget, setInspectorTarget] = useState<InspectorTarget>({
    kind: "none",
  });

  const noteQuery = trpc.agentStudio.vault.getNote.useQuery(
    { noteId: selectedNoteId ?? 0 },
    { enabled: selectedNoteId !== null && selectedNoteId > 0 },
  );

  return (
    <div className="flex flex-col h-full" data-testid="graph-workspace-page">
      <div className="px-4 pt-4">
        <PageHeader
          title="Graph Workspace"
          subtitle="Vault notes, graph exploration, impact analysis, and runtime traces — backed by the native graph workspace runtime."
          icon={<Network className="h-5 w-5" />}
        />
      </div>

      <div className="flex flex-1 min-h-0 mt-3">
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
            setTab("editor");
            setInspectorTarget({ kind: "none" });
          }}
        />

        <main className="flex-1 min-w-0 flex flex-col" data-testid="workspace-main-area">
          <WorkspaceTabs
            tab={tab}
            setTab={setTab}
            noteSelected={selectedNoteId !== null}
          />

          <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
            {tab === "editor" && (
              selectedNoteId === null ? (
                <NoNoteSelectedHint hasVault={selectedVaultId !== null} />
              ) : (
                <MarkdownEditorPane noteId={selectedNoteId} />
              )
            )}

            {tab === "local_graph" && (
              <LocalGraphView
                seedNodeId={inspectorSeedFor(noteQuery.data?.note?.id) ?? `note:${selectedNoteId ?? ""}`}
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
            )}

            {tab === "global_graph" && (
              <GlobalGraphView
                onSelectNode={(nodeId) =>
                  setInspectorTarget({ kind: "node", nodeId })
                }
              />
            )}

            {tab === "impact" && (
              <ImpactAnalysisView
                seedNodeId={inspectorSeedFor(noteQuery.data?.note?.id) ?? `note:${selectedNoteId ?? ""}`}
              />
            )}

            {tab === "trace" && <RuntimeAndDecisionTraceView />}

            {tab === "observability" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <GraphSkillUsagePanel />
                <GraphAgentExplainPanel />
                <div className="lg:col-span-2">
                  <GraphSchemaSummaryPanel />
                </div>
              </div>
            )}
          </div>
        </main>

        <aside
          className="border-l p-3 w-80 shrink-0 overflow-auto bg-gray-50/30"
          data-testid="workspace-inspector-drawer"
        >
          <div className="space-y-3">
            <GraphInspector target={inspectorTarget} />
            {selectedNoteId !== null && noteQuery.data?.latestVersion?.contentMd && (
              <WikilinksBacklinksPanel
                noteId={selectedNoteId}
                vaultId={selectedVaultId ?? 0}
                noteTitle={noteQuery.data?.note?.title ?? null}
                noteSlug={noteQuery.data?.note?.slug ?? null}
                noteMd={noteQuery.data.latestVersion.contentMd}
                onNavigateToNote={(id) => {
                  setSelectedNoteId(id);
                  setInspectorTarget({ kind: "none" });
                }}
              />
            )}
            <div data-testid="workspace-quality-panel">
              <GraphQualityFindingsPanel />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function inspectorSeedFor(noteIdNum: number | undefined): string | null {
  if (typeof noteIdNum !== "number") return null;
  return `note:${noteIdNum}`;
}

function NoNoteSelectedHint({
  hasVault,
}: {
  hasVault: boolean;
}): React.ReactElement {
  return (
    <div
      className="flex flex-col items-center justify-center h-full text-center px-6 py-12 text-gray-500"
      data-testid="workspace-no-note-hint"
    >
      <div className="text-4xl mb-3" aria-hidden>
        {hasVault ? "📄" : "📂"}
      </div>
      <div className="text-sm font-medium text-gray-700 mb-1">
        {hasVault ? "Pick a note to start editing" : "Pick or create a vault"}
      </div>
      <div className="text-xs max-w-sm">
        {hasVault
          ? 'Choose a note from the explorer on the left, or click "+ New note" to add one to this vault.'
          : 'Use the explorer on the left to select a vault, or click "+ New" to create your first one.'}
      </div>
    </div>
  );
}

function WorkspaceTabs({
  tab,
  setTab,
  noteSelected,
}: {
  tab: WorkspaceTab;
  setTab: (t: WorkspaceTab) => void;
  noteSelected: boolean;
}): React.ReactElement {
  const tabs: Array<{ key: WorkspaceTab; label: string; needsNote?: boolean }> = [
    { key: "editor", label: "Editor", needsNote: true },
    { key: "local_graph", label: "Local graph", needsNote: true },
    { key: "global_graph", label: "Global graph" },
    { key: "impact", label: "Impact analysis", needsNote: true },
    { key: "trace", label: "Runtime + decision trace" },
    { key: "observability", label: "Observability" },
  ];
  return (
    <nav
      className="flex items-center border-b px-3 gap-1 text-sm"
      data-testid="workspace-tabs"
    >
      {tabs.map((t) => {
        const disabled = (t.needsNote ?? false) && !noteSelected;
        return (
          <button
            key={t.key}
            type="button"
            data-testid={`workspace-tab-${t.key}`}
            data-active={t.key === tab ? "true" : "false"}
            disabled={disabled}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 border-b-2 -mb-px ${
              t.key === tab
                ? "border-blue-500 font-medium"
                : "border-transparent hover:border-gray-300"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
