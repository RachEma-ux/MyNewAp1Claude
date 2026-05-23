/**
 * VaultNotesPage — child of the Vault Explorer group.
 *
 * Vault tree (left) + Markdown editor pane (right). Reuses the same
 * `VaultExplorer` + `MarkdownEditorPane` components the legacy
 * `GraphWorkspacePage` composes; this page is the focused view
 * without the graph / impact / trace tabs.
 *
 * Backed by the Native Graph Workspace runtime: notes are
 * DB-canonical in `ags_vault_notes` (with optional FS-sync) via
 * `agentStudio.vault.*` tRPC.
 */

import { useState } from "react";
import { FileText } from "lucide-react";
import {
  VaultExplorer,
  MarkdownEditorPane,
} from "../components/graph-workspace";
import { PageHeader } from "../components/ui";

export default function VaultNotesPage() {
  const [selectedVaultId, setSelectedVaultId] = useState<number | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);

  return (
    <div className="flex flex-col h-full" data-testid="vault-notes-page">
      <div className="px-4 pt-4 pb-2 shrink-0">
        <PageHeader
          icon={<FileText className="h-5 w-5" />}
          title="Vault Notes"
          subtitle="DB-canonical Markdown notes across vaults. Click a note in the tree to edit."
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
                <FileText className="h-10 w-10 opacity-30" />
                <p className="text-sm">
                  {selectedVaultId === null
                    ? "Select a vault on the left to browse its notes."
                    : "Select a note on the left to read or edit it."}
                </p>
              </div>
            ) : (
              <MarkdownEditorPane noteId={selectedNoteId} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
