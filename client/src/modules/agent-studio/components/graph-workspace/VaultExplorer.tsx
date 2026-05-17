/**
 * VaultExplorer — Product Work item 15.
 *
 * Hierarchical vault → folder → note tree for the workspace shell.
 *
 * Reuse-first:
 *   - tRPC: trpc.agentStudio.vault.listMyVaults + listNotes (existing)
 *   - No new server routes for this component
 *
 * Permission handling:
 *   - Hidden notes/folders are filtered server-side by the vault
 *     router; this component only renders what comes back.
 *   - Empty vault → empty_vault state slide.
 *   - Loading + error → handled via WorkspaceStateLayer.
 */

import React, { useMemo } from "react";
import { trpc } from "../../../../lib/trpc";
import WorkspaceStateLayer, {
  classifyWorkspaceState,
} from "./WorkspaceStateLayer";

interface VaultExplorerProps {
  readonly selectedVaultId: number | null;
  readonly selectedNoteId: number | null;
  readonly onSelectVault: (vaultId: number) => void;
  readonly onSelectNote: (noteId: number) => void;
}

export default function VaultExplorer({
  selectedVaultId,
  selectedNoteId,
  onSelectVault,
  onSelectNote,
}: VaultExplorerProps): React.ReactElement {
  const vaultsQuery = trpc.agentStudio.vault.listMyVaults.useQuery(
    undefined as never,
  );
  const notesQuery = trpc.agentStudio.vault.listNotes.useQuery(
    { vaultId: selectedVaultId ?? 0, limit: 200 },
    { enabled: typeof selectedVaultId === "number" && selectedVaultId > 0 },
  );

  const vaultsState = useMemo(() => {
    if (vaultsQuery.isLoading) return "loading" as const;
    if (vaultsQuery.error) {
      return classifyWorkspaceState({
        trpcError: { code: vaultsQuery.error.data?.code, message: vaultsQuery.error.message },
      });
    }
    if ((vaultsQuery.data ?? []).length === 0) return "empty_vault" as const;
    return null;
  }, [vaultsQuery.isLoading, vaultsQuery.error, vaultsQuery.data]);

  if (vaultsState !== null) {
    return (
      <aside
        className="border-r p-3 w-64 shrink-0 bg-gray-50/30"
        data-testid="vault-explorer"
      >
        <WorkspaceStateLayer state={vaultsState} />
      </aside>
    );
  }

  return (
    <aside
      className="border-r p-3 w-64 shrink-0 bg-gray-50/30 overflow-auto"
      data-testid="vault-explorer"
    >
      <div className="font-semibold text-xs uppercase text-gray-500 mb-2">
        Vaults
      </div>
      <ul className="space-y-1">
        {(vaultsQuery.data ?? []).map((vault) => (
          <li key={vault.id}>
            <button
              type="button"
              data-testid={`vault-explorer-vault-${vault.id}`}
              className={`text-left text-sm w-full rounded px-2 py-1 hover:bg-gray-100 ${
                vault.id === selectedVaultId ? "bg-blue-50 font-medium" : ""
              }`}
              onClick={() => onSelectVault(vault.id)}
            >
              📁 {vault.name ?? `Vault ${vault.id}`}
            </button>
            {vault.id === selectedVaultId && (
              <NoteList
                notes={notesQuery.data ?? []}
                loading={notesQuery.isLoading}
                error={notesQuery.error ?? null}
                selectedNoteId={selectedNoteId}
                onSelectNote={onSelectNote}
              />
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

interface NoteListProps {
  readonly notes: ReadonlyArray<{ id: number; title?: string | null; slug?: string | null }>;
  readonly loading: boolean;
  readonly error: { data?: { code?: string }; message?: string } | null;
  readonly selectedNoteId: number | null;
  readonly onSelectNote: (noteId: number) => void;
}

function NoteList({
  notes,
  loading,
  error,
  selectedNoteId,
  onSelectNote,
}: NoteListProps): React.ReactElement {
  if (loading) {
    return <div className="pl-4 text-xs text-gray-500" data-testid="note-list-loading">Loading notes…</div>;
  }
  if (error) {
    return (
      <div
        className="pl-4 text-xs text-red-500"
        data-testid="note-list-error"
        data-raw-error={error.message ?? ""}
      >
        Could not load notes.
      </div>
    );
  }
  if (notes.length === 0) {
    return (
      <div className="pl-4 text-xs text-gray-500" data-testid="note-list-empty">
        No notes in this vault.
      </div>
    );
  }
  return (
    <ul className="pl-3 mt-1 space-y-0.5" data-testid="note-list">
      {notes.map((note) => (
        <li key={note.id}>
          <button
            type="button"
            data-testid={`note-list-item-${note.id}`}
            className={`text-left text-sm w-full rounded px-2 py-0.5 hover:bg-gray-100 ${
              note.id === selectedNoteId ? "bg-blue-50 font-medium" : ""
            }`}
            onClick={() => onSelectNote(note.id)}
          >
            📄 {note.title ?? note.slug ?? `Note ${note.id}`}
          </button>
        </li>
      ))}
    </ul>
  );
}
